import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Amount } from '../../../Shared/Amount';
import { Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { formatInr } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { MembersApi, type ClassView } from '../Members/members.api';
import { EntryFeesForm } from './EntryFeesForm';
import { FeeAssign } from './FeeAssign';
import { FeeStructureDrawer } from './FeeStructureDrawer';
import { FeeStructureEditor, type EditorYear, type StructureSaved } from './FeeStructureEditor';
import { STRUCTURE_STATE, classList, classShort, inr, paiseOf, plural } from './fee-format';
import {
  FeesApi,
  type EntryFeesRow,
  type FeeAssignment,
  type FeeHead,
  type FeeStructure,
  type FeeStructures,
  type StructureState,
} from './fees.api';

type SortKey = 'name' | 'cls' | 'total' | 'n' | 'fine' | 'status';
const COLUMNS: readonly { k: SortKey; l: string; r?: boolean }[] = [
  { k: 'name', l: 'Structure' },
  { k: 'cls', l: 'Classes' },
  { k: 'total', l: 'Total', r: true },
  { k: 'n', l: 'Instalments' },
  { k: 'fine', l: 'Late fine', r: true },
  { k: 'status', l: 'Status' },
];

/**
 * c.fees — Fee structures (SRS 13.19, FR-FEE-02, CR-11; FEE-001…009; prototype c.fees): the key
 * figures of the academic year, the structures with their classes, totals, instalments, late fine
 * and status; the structure drawer (FeeStructureDrawer) with submit and assign (FeeAssign); the
 * editor with live totals (FeeStructureEditor); the entry fees per year (EntryFeesForm) and the
 * fee head master.
 */
@Component({
  selector: 'rp-console-fees',
  imports: [
    Amount,
    Dropdown,
    Empty,
    EntryFeesForm,
    FeeAssign,
    FeeStructureDrawer,
    FeeStructureEditor,
    Icon,
    Kpi,
    PageHead,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Fee structures"
        sub="Heads, instalments and late fine per class for the academic year in context — approved by a checker before use."
      >
        @if (canView()) {
          @if (editWhy()) {
            <span class="cp-why" [attr.title]="editWhy()"
              ><button type="button" class="btn btn-pri" disabled>
                <rp-icon name="plus" [size]="17" /><span>New fee structure</span>
              </button></span
            >
          } @else {
            <button type="button" class="btn btn-pri" id="fs-new" (click)="editing.set('new')">
              <rp-icon name="plus" [size]="17" /><span>New fee structure</span>
            </button>
          }
        }
      </rp-page-head>

      @if (!canView()) {
        <rp-empty
          icon="lock"
          title="This page isn't part of your role"
          text="Fee structures are kept by the accounts office. Pages your role can open are listed in the menu."
        />
      } @else {
        @if (readOnly()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow"><b>Read-only.</b> {{ readOnly() }}</div>
          </div>
        }
        <div class="c-grid k4">
          <rp-kpi
            label="Structures"
            icon="layers"
            [value]="kpis() ? num(kpis()!.structures) : '—'"
            [delta]="kpis() ? kpis()!.approved + ' approved' : ''"
          />
          <rp-kpi
            label="Pending approval"
            icon="approve"
            tone="violet"
            link="/console/approvals"
            [value]="kpis() ? num(kpis()!.pending) : '—'"
          />
          <div class="kpi" id="fs-covered">
            <span class="k-ic"><rp-icon name="school" [size]="17" /></span>
            <span class="k-l">Classes covered</span>
            <span class="k-v"
              >{{ kpis() ? num(kpis()!.classesCovered) : '—'
              }}<small class="cm-of"> of {{ kpis() ? num(kpis()!.classes) : '—' }}</small></span
            >
            @if (uncovered()) {
              <span class="k-d">{{ uncovered() }}</span>
            }
          </div>
          <rp-kpi
            label="Fee heads"
            icon="list"
            [value]="headsLoaded() ? num(heads().length) : '—'"
            delta="Maintained by the institution"
          />
        </div>

        <div class="stack g12">
          <div class="c-filters">
            <label class="search"
              ><rp-icon name="search" [size]="16" /><input
                type="search"
                id="fs-q"
                placeholder="Search structures"
                aria-label="Search structures"
                autocomplete="off"
                [value]="q()"
                (input)="q.set(val($event))"
            /></label>
            <div class="pills" role="group" aria-label="Status">
              @for (p of pills; track p.v) {
                <button
                  type="button"
                  class="pill"
                  [class.on]="status() === p.v"
                  [attr.aria-pressed]="status() === p.v"
                  (click)="status.set(p.v)"
                >
                  {{ p.l }}
                </button>
              }
            </div>
            @if (yearOptions().length > 1) {
              <div class="fld">
                <rp-dd
                  inputId="fs-year-f"
                  placeholder="Academic year"
                  [options]="yearOptions()"
                  [value]="yearId()"
                  (changed)="yearId.set($event)"
                />
              </div>
            }
            <span class="fsum">{{ plural(rows().length, 'structure') }}</span>
          </div>

          @if (error()) {
            <div class="card pad">
              <rp-empty icon="alertc" title="Couldn't load the fee structures" [text]="error()">
                <button type="button" class="btn btn-sec btn-sm" (click)="load()">
                  <span>Try again</span>
                </button>
              </rp-empty>
            </div>
          } @else {
            <div class="tbl-wrap">
              <table class="tbl" id="fs-table">
                <thead>
                  <tr>
                    @for (c of columns; track c.k) {
                      <th
                        class="sort"
                        [class.r]="c.r"
                        [class.asc]="sort()?.k === c.k && sort()?.dir === 'asc'"
                        [class.desc]="sort()?.k === c.k && sort()?.dir === 'desc'"
                        [attr.aria-sort]="ariaSort(c.k)"
                        (click)="sortBy(c.k)"
                      >
                        <button
                          type="button"
                          class="cp-th"
                          (click)="$event.stopPropagation(); sortBy(c.k)"
                        >
                          {{ c.l
                          }}<span class="sa" aria-hidden="true">{{
                            sort()?.k === c.k && sort()?.dir === 'desc' ? '↓' : '↑'
                          }}</span>
                        </button>
                      </th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @if (loading() && !items().length) {
                    <tr>
                      <td [attr.colspan]="columns.length">
                        <rp-empty icon="hourglass" title="Loading…" />
                      </td>
                    </tr>
                  }
                  @for (s of rows(); track s.id) {
                    <tr tabindex="0" (click)="openId.set(s.id)" (keydown.enter)="openId.set(s.id)">
                      <td>
                        <div class="cell-t">{{ s.name }}</div>
                        <div class="cell-s">Version {{ s.current.no }} · {{ s.year.label }}</div>
                      </td>
                      <td>
                        <span class="t-sm">{{ classes(s) }}</span>
                      </td>
                      <td class="r">
                        <rp-amt [value]="s.current.total" />
                        @if (paise(s.current.optional)) {
                          <div class="cell-s">+ {{ inr(s.current.optional) }} optional</div>
                        }
                      </td>
                      <td>
                        <span class="t-num">{{ s.current.instalments.length }}</span>
                        <span class="cell-s"> {{ shares(s) }}</span>
                      </td>
                      <td class="r"><rp-amt [value]="s.current.lateFine" /></td>
                      <td>
                        <span [class]="'chip dot tone-' + stateOf(s.status).tone">{{
                          stateOf(s.status).l()
                        }}</span>
                        @if (s.active && s.active.no !== s.current.no) {
                          <div class="cell-s">Version {{ s.active.no }} in use</div>
                        }
                      </td>
                    </tr>
                  } @empty {
                    @if (!loading()) {
                      <tr>
                        <td [attr.colspan]="columns.length">
                          <rp-empty
                            icon="layers"
                            [title]="
                              items().length
                                ? 'No structures match'
                                : 'No fee structures for ' + yearLabel()
                            "
                            [text]="
                              items().length
                                ? 'Change the status or search.'
                                : 'Create one to define heads, instalments and the late fine.'
                            "
                          >
                            @if (!items().length && !editWhy()) {
                              <button
                                type="button"
                                class="btn btn-sec btn-sm"
                                (click)="editing.set('new')"
                              >
                                <rp-icon name="plus" [size]="15" /><span>New fee structure</span>
                              </button>
                            }
                          </rp-empty>
                        </td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>
            @if (rows().length) {
              <div class="pager">
                <span>{{ plural(rows().length, 'structure') }}</span>
              </div>
            }
          }
        </div>

        <div class="c-grid k2 cm-top">
          <div class="card" id="ef-card">
            <div class="card-h">
              <span class="li-ic sm"><rp-icon name="rupee" [size]="16" /></span
              ><span class="t-h4">Entry fees</span>
            </div>
            <div class="card-b stack g12">
              <p class="t-xs t-muted" style="line-height: 1.5">
                Application and admission fees are charged before a student is assigned to a class,
                so they stay a separate per-year setting beside the structures.
              </p>
              @if (entryError()) {
                <div class="note tone-bad" role="alert">
                  <rp-icon name="alertc" [size]="17" />
                  <div class="grow">{{ entryError() }}</div>
                </div>
              }
              @for (e of entryRows(); track e.year.id) {
                <div class="cm-entry" [class.cur]="e.year.id === yearId()">
                  <div class="row between">
                    <b>{{ e.year.label }}</b>
                    @if (e.year.id === yearId()) {
                      <span class="chip tone-brand">In context</span>
                    }
                  </div>
                  @if (e.fees; as f) {
                    <div class="cm-entry-g">
                      <span>Application fee</span><b class="t-num">{{ inr(f.applicationFee) }}</b>
                      <span>Paid</span><b>With the form, or later at the desk</b>
                      <span>Admission fee</span><b class="t-num">{{ inr(f.admissionFee) }}</b>
                    </div>
                  } @else {
                    <div class="t-sm t-muted">Not set for this year.</div>
                  }
                  <div>
                    @if (entryWhy(e)) {
                      <span class="cp-why" [attr.title]="entryWhy(e)"
                        ><button type="button" class="btn btn-ghost btn-xs" disabled>
                          <rp-icon name="edit" [size]="15" /><span>{{
                            e.fees ? 'Edit' : 'Set entry fees'
                          }}</span>
                        </button></span
                      >
                    } @else {
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs"
                        [attr.data-year]="e.year.id"
                        (click)="entryEdit.set(e)"
                      >
                        <rp-icon name="edit" [size]="15" /><span>{{
                          e.fees ? 'Edit' : 'Set entry fees'
                        }}</span>
                      </button>
                    }
                  </div>
                </div>
              }
            </div>
          </div>

          <div class="card" id="fh-card">
            <div class="card-h">
              <span class="li-ic sm"><rp-icon name="list" [size]="16" /></span
              ><span class="t-h4">Fee heads</span>
            </div>
            <div class="card-b stack g12">
              @if (headsError()) {
                <div class="note tone-bad" role="alert">
                  <rp-icon name="alertc" [size]="17" />
                  <div class="grow">{{ headsError() }}</div>
                </div>
              }
              <div class="row g6 wrap">
                @for (h of heads(); track h.id) {
                  <span class="cm-head" [class.t-faint]="h.status !== 'ACTIVE'"
                    >{{ h.name }}<small>{{ h.structures }}</small></span
                  >
                }
              </div>
              @if (!editWhy()) {
                <div class="row g8">
                  <div class="grow">
                    <div class="fld" [class.invalid]="headErr()">
                      <div class="fld-in">
                        <input
                          id="fh-new"
                          type="text"
                          placeholder="New head, e.g. Uniform"
                          maxlength="30"
                          autocomplete="off"
                          aria-label="New fee head"
                          aria-describedby="fh-new-e"
                          [value]="headName()"
                          (input)="headName.set(val($event)); headErr.set('')"
                          (keydown.enter)="addHead()"
                        />
                      </div>
                      <div class="fld-e" id="fh-new-e" role="alert">
                        <rp-icon name="alertc" [size]="14" /><span>{{ headErr() }}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="btn btn-sec btn-sm"
                    id="fh-add"
                    [class.is-busy]="headBusy()"
                    [disabled]="headBusy()"
                    (click)="addHead()"
                  >
                    <rp-icon name="plus" [size]="15" /><span>Add</span>
                  </button>
                </div>
              }
              <p class="t-xs t-muted">
                Discounts and scholarships aren't heads yet — they wait for their own change
                request. Totals add heads only.
              </p>
            </div>
          </div>
        </div>
      }
    </div>

    @if (open(); as s) {
      <rp-fee-structure-drawer
        [structure]="s"
        [readOnly]="editWhy()"
        [busy]="submitting()"
        (closed)="openId.set(null)"
        (edit)="editing.set(s)"
        (send)="submit(s)"
        (assign)="assigning.set(s)"
      />
    }
    @if (editing(); as e) {
      <rp-fee-structure-editor
        [structure]="e === 'new' ? null : e"
        [years]="openYears()"
        [pageYearId]="yearId()"
        [structures]="items()"
        [classes]="classList()"
        [classesError]="classesError()"
        [heads]="heads()"
        [maxInstalments]="maxInstalments()"
        (closed)="editing.set(null)"
        (saved)="saved($event)"
      />
    }
    @if (assigning(); as s) {
      <rp-fee-assign
        [structure]="s"
        (closed)="assigning.set(null)"
        (assigned)="assigned(s, $event)"
      />
    }
    @if (entryEdit(); as e) {
      <rp-entry-fees-form [row]="e" (closed)="entryEdit.set(null)" (saved)="entrySaved($event)" />
    }
  `,
  styles: `
    .cp-th {
      font: inherit;
      color: inherit;
      text-transform: inherit;
      letter-spacing: inherit;
      background: none;
      border: 0;
      padding: 0;
      cursor: pointer;
    }
    .cp-th:focus-visible {
      outline: 2px solid var(--brand-3);
      outline-offset: 2px;
      border-radius: 4px;
    }
  `,
})
export class ConsoleFees {
  private readonly api = inject(FeesApi);
  private readonly members = inject(MembersApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).console;

  protected readonly columns = COLUMNS;
  protected readonly plural = plural;
  protected readonly inr = inr;
  protected readonly pills: readonly { v: StructureState | ''; l: string }[] = [
    { v: '', l: 'All' },
    { v: 'ACTIVE', l: translate('status.fee_structure_version.active') },
    { v: 'PENDING', l: translate('status.fee_structure_version.pending') },
    { v: 'DRAFT', l: translate('status.fee_structure_version.draft') },
  ];

  protected readonly q = signal('');
  protected readonly status = signal<StructureState | ''>('');
  protected readonly yearId = signal('');
  protected readonly items = signal<readonly FeeStructure[]>([]);
  protected readonly kpis = signal<FeeStructures['kpis']>(null);
  protected readonly maxInstalments = signal(6);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly sort = signal<{ k: SortKey; dir: 'asc' | 'desc' } | null>(null);
  protected readonly openId = signal<string | null>(null);
  protected readonly editing = signal<FeeStructure | 'new' | null>(null);
  protected readonly assigning = signal<FeeStructure | null>(null);
  protected readonly submitting = signal(false);
  protected readonly entry = signal<readonly EntryFeesRow[]>([]);
  protected readonly entryError = signal('');
  protected readonly entryEdit = signal<EntryFeesRow | null>(null);
  protected readonly heads = signal<readonly FeeHead[]>([]);
  protected readonly headsLoaded = signal(false);
  protected readonly headsError = signal('');
  protected readonly headName = signal('');
  protected readonly headErr = signal('');
  protected readonly headBusy = signal(false);
  protected readonly classList = signal<readonly ClassView[]>([]);
  protected readonly classesError = signal('');
  /** The years' dates (ACA-001), when the role can read them. */
  private readonly dates = signal<ReadonlyMap<string, { start: string; end: string }>>(new Map());
  private ready = false;
  private seq = 0;

  protected readonly canView = computed(() => this.can('fees.view'));
  protected readonly readOnly = computed(() =>
    this.session()?.roles.some((r) => r.readOnly)
      ? 'Management has read-only access. The administrator makes changes here.'
      : '',
  );
  protected readonly editWhy = computed(
    () => this.readOnly() || (this.can('fees.edit') ? '' : "Your role doesn't include this task."),
  );
  protected readonly yearOptions = computed<DropdownOption[]>(() =>
    this.entry().map((e) => ({
      v: e.year.id,
      l: `Academic year ${e.year.label}`,
      ...(e.year.current
        ? { sub: 'Current' }
        : e.year.status === 'CLOSED'
          ? { sub: 'Closed' }
          : {}),
    })),
  );
  protected readonly yearLabel = computed(
    () => this.entry().find((e) => e.year.id === this.yearId())?.year.label ?? 'this year',
  );
  protected readonly openYears = computed<EditorYear[]>(() =>
    this.entry()
      .filter((e) => e.year.status !== 'CLOSED')
      .map((e) => ({ id: e.year.id, label: e.year.label, ...(this.dates().get(e.year.id) ?? {}) })),
  );
  /** The open years, and the year in context even when closed (prototype entryFeesCard). */
  protected readonly entryRows = computed(() =>
    this.entry().filter((e) => e.year.status !== 'CLOSED' || e.year.id === this.yearId()),
  );
  protected readonly open = computed(
    () => this.items().find((s) => s.id === this.openId()) ?? null,
  );
  /** "Not covered: Nursery, LKG, UKG, 11…" — classes without an approved or pending structure. */
  protected readonly uncovered = computed(() => {
    const k = this.kpis();
    if (!k || !this.classList().length) return '';
    const covered = new Set(
      this.items()
        .filter((s) => s.status !== 'DRAFT' || s.active)
        .flatMap((s) => (s.active ?? s.current).classes.map((c) => c.id)),
    );
    const left = this.classList().filter((c) => !covered.has(c.id));
    if (!left.length) return 'Every class has a structure';
    const names = left.slice(0, 4).map((c) => classShort(c.name));
    return `Not covered: ${names.join(', ')}${left.length > 4 ? '…' : ''}`;
  });
  protected readonly rows = computed(() => {
    const q = this.q().trim().toLowerCase();
    const st = this.status();
    const list = this.items().filter(
      (s) =>
        (!st || s.status === st || (st === 'ACTIVE' && !!s.active)) &&
        (!q || s.name.toLowerCase().includes(q)),
    );
    const s = this.sort();
    if (!s) return list;
    const val = (x: FeeStructure): string | number =>
      s.k === 'name'
        ? x.name
        : s.k === 'cls'
          ? classList(x.current.classes)
          : s.k === 'total'
            ? paiseOf(x.current.total)
            : s.k === 'n'
              ? x.current.instalments.length
              : s.k === 'fine'
                ? paiseOf(x.current.lateFine)
                : STRUCTURE_STATE[x.status].l();
    return [...list].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const c =
        typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb), 'en', { numeric: true });
      return s.dir === 'desc' ? -c : c;
    });
  });

  constructor() {
    effect(() => {
      this.yearId();
      if (this.ready) untracked(() => void this.load());
    });
    void this.init();
  }

  private async init() {
    if (!this.can('fees.view')) return;
    void this.loadHeads();
    void this.lookups();
    try {
      const r = await this.api.entryFees();
      this.entry.set(r.items);
      const cur = r.items.find((e) => e.year.current) ?? r.items[0];
      this.ready = true;
      // A new year reloads through the effect; without years the institution's list loads.
      if (cur) this.yearId.set(cur.year.id);
      else void this.load();
    } catch (e) {
      this.entryError.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
      this.ready = true;
      void this.load();
    }
  }

  private async lookups() {
    try {
      this.classList.set((await this.members.classes()).items);
    } catch (e) {
      this.classesError.set(
        e instanceof ApiProblem ? e.detail : 'The classes could not be loaded.',
      );
    }
    try {
      const y = await this.api.academicYears();
      this.dates.set(new Map(y.items.map((x) => [x.id, { start: x.startsOn, end: x.endsOn }])));
    } catch {
      // The server still checks each due date against the year (FEE.DUE_OUTSIDE_YEAR).
    }
  }

  protected async load() {
    const n = ++this.seq;
    this.loading.set(true);
    try {
      const r = await this.api.structures(this.yearId() ? { yearId: this.yearId() } : {});
      if (n !== this.seq) return;
      this.items.set(r.items);
      this.kpis.set(r.kpis);
      if (r.maxInstalments) this.maxInstalments.set(r.maxInstalments);
      this.error.set('');
    } catch (e) {
      if (n === this.seq) {
        this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
      }
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
  }

  private async loadHeads() {
    try {
      this.heads.set((await this.api.heads()).items);
      this.headsLoaded.set(true);
      this.headsError.set('');
    } catch (e) {
      this.headsError.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  // --- changes -------------------------------------------------------------------------------------
  /** FEE-002 with the prototype's checks (cm.fh.add). */
  protected async addHead() {
    const v = this.headName().trim();
    const err = !v
      ? "Enter the head's name"
      : !/^[A-Za-z][A-Za-z &/-]{1,29}$/.test(v)
        ? 'Use letters, spaces, & / and - only'
        : this.heads().some((h) => h.name.toLowerCase() === v.toLowerCase())
          ? translate('FEE.HEAD_TAKEN', { name: v })
          : '';
    this.headErr.set(err);
    if (err || this.headBusy()) return;
    this.headBusy.set(true);
    try {
      const h = await this.api.addHead(v);
      this.heads.update((l) => [...l, h]);
      this.headName.set('');
      this.overlays.toast('Fee head added', { sub: h.name });
    } catch (e) {
      this.headErr.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      this.headBusy.set(false);
    }
  }

  /** FEE-006 from the drawer (prototype cm.fs.submit). */
  protected async submit(s: FeeStructure) {
    const v = s.current;
    const ok = await this.overlays.confirm({
      title: `Submit ${s.name} for approval?`,
      text: `Total ${inr(v.total)} in ${plural(v.instalments.length, 'instalment')}. A different person must approve it before it can be assigned.`,
      ok: 'Submit for approval',
    });
    if (!ok) return;
    this.submitting.set(true);
    try {
      const r = await this.api.submit(s.id);
      this.replace(r.structure);
      this.toastSubmitted(r.structure.name, r.no, r.appliedDirectly);
      void this.load();
    } catch (e) {
      this.overlays.toast("Couldn't submit the structure", {
        tone: 'bad',
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
      });
    } finally {
      this.submitting.set(false);
    }
  }

  protected saved(e: StructureSaved) {
    this.editing.set(null);
    this.replace(e.structure);
    this.openId.set(e.structure.id);
    if (e.submitted)
      this.toastSubmitted(e.structure.name, e.submitted.no, e.submitted.appliedDirectly);
    else if (e.submitError) {
      this.overlays.toast('Saved as a draft — not sent for approval', {
        tone: 'warn',
        sub: e.submitError,
      });
    } else this.overlays.toast('Draft saved', { sub: e.structure.name });
    void this.load();
    void this.loadHeads();
  }

  protected assigned(s: FeeStructure, a: FeeAssignment) {
    this.assigning.set(null);
    this.overlays.toast(`${(a.recordsCreated ?? 0).toLocaleString('en-IN')} fee records created`, {
      sub: `${s.name} · ${plural(a.studentsAssigned ?? 0, 'student')}`,
    });
    void this.load();
  }

  protected entrySaved(r: EntryFeesRow) {
    this.entryEdit.set(null);
    this.entry.update((l) => l.map((x) => (x.year.id === r.year.id ? r : x)));
    this.overlays.toast('Entry fees saved', { sub: r.year.label });
  }

  private toastSubmitted(name: string, no: string, direct: boolean) {
    if (direct) {
      this.overlays.toast('Structure approved', {
        sub: `${no} · applied directly — your own request as the administrator`,
      });
    } else {
      this.overlays.toast('Sent for approval', { sub: `${no} · a checker will review ${name}` });
    }
  }

  private replace(s: FeeStructure) {
    const list = this.items();
    this.items.set(
      list.some((x) => x.id === s.id) ? list.map((x) => (x.id === s.id ? s : x)) : [...list, s],
    );
  }

  // --- formatting ----------------------------------------------------------------------------------
  protected entryWhy(e: EntryFeesRow) {
    return e.year.status === 'CLOSED' ? 'Closed year' : this.editWhy();
  }
  protected sortBy(k: SortKey) {
    const s = this.sort();
    this.sort.set({ k, dir: s?.k === k && s.dir === 'asc' ? 'desc' : 'asc' });
  }
  protected ariaSort(k: SortKey) {
    const s = this.sort();
    return s?.k === k ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  }
  protected stateOf(s: StructureState) {
    return STRUCTURE_STATE[s];
  }
  protected classes(s: FeeStructure) {
    return classList(s.current.classes);
  }
  protected shares(s: FeeStructure) {
    return s.current.instalments.map((i) => `${i.share}%`).join(' · ');
  }
  protected paise(m: { amount: string }) {
    return paiseOf(m);
  }
  protected money(p: number) {
    return formatInr(p);
  }
  protected num(n: number) {
    return n.toLocaleString('en-IN');
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected can(sub: string) {
    return this.session()?.subTasks.includes(sub) ?? false;
  }
}
