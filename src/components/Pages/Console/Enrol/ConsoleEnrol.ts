import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SessionContext } from '../../../../Context/SessionContext';
import { Avatar } from '../../../Shared/Avatar';
import { Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { Pager } from '../../../Shared/Pager';
import { formatDate } from '../../../Utils/format';
import { translate } from '../../../Utils/translate';
import { person } from '../Applications/app-format';
import { plural, saveCsv } from '../Fees/fee-format';
import { MembersApi } from '../Members/members.api';
import { academicsAccess, byLabel, num, problemText } from '../Structure/academic-format';
import { AcademicYears, YearBanner, YearPicker } from '../Structure/academic-year';
import { SearchSelect } from '../../../Shared/SearchSelect';
import { StructureApi, type ClassView } from '../Structure/structure.api';
import { CorrectionModal } from './CorrectionModal';
import { EnrolModal } from './EnrolModal';
import { EnrolmentsApi, type Enrolment, type EnrolmentList, type Rollover } from './enrolments.api';
import { RolloverPanel } from './RolloverPanel';
import { TransferModal } from './TransferModal';

type Tab = 'en' | 'ro';
type SortKey = 'name' | 'cs' | 'status' | 'at';
const PAGE = 12;
const MEMBER_STATUS: Readonly<Record<string, { l: string; tone: string }>> = {
  INACTIVE: { l: 'Inactive', tone: '' },
  SUSPENDED: { l: 'Suspended', tone: 'tone-bad' },
};

/**
 * c.enrol — Enrolment & promotion (SRS 20.10, FR-ACA-04, CR-13; ACA-027…033; prototype c.enrol):
 * who is in which class-section for the academic year in context — enrolled, class-sections, active
 * students not yet enrolled; search and class-section filter; enrol a student, transfer one or
 * several (same class) to another section; in a closed year, request a correction that the
 * administrator approves (recorded as an adjustment). The roll-over tab proposes next year's
 * classes, takes amendments per student and commits them as a whole.
 */
@Component({
  selector: 'rp-console-enrol',
  imports: [
    Avatar,
    CorrectionModal,
    Empty,
    EnrolModal,
    Icon,
    Kpi,
    PageHead,
    Pager,
    RolloverPanel,
    SearchSelect,
    TransferModal,
    YearBanner,
    YearPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <rp-year-banner />
    <div class="c-page">
      <rp-page-head title="Enrolment & promotion" [sub]="sub()">
        @if (!access.denied() && tab() === 'en') {
          <button
            type="button"
            class="btn btn-sec"
            id="en-export"
            [disabled]="!items().length"
            (click)="export()"
          >
            <rp-icon name="download" [size]="17" /><span>Export</span>
          </button>
          <span class="cp-why" [attr.title]="access.yearWhy() || null"
            ><button
              type="button"
              class="btn btn-pri"
              id="en-new"
              [disabled]="!!access.yearWhy() || !list()"
              (click)="enrolling.set(true)"
            >
              <rp-icon name="plus" [size]="17" /><span>Enrol a student</span>
            </button></span
          >
        }
      </rp-page-head>

      @if (access.denied()) {
        <rp-empty
          icon="lock"
          title="You don't have access to this page"
          [text]="access.deniedText()"
        />
      } @else {
        @if (access.management()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow">
              <b>Read-only.</b> Management can view this page but not change it.
            </div>
          </div>
        }
        @if (years.closed() && tab() === 'en') {
          <div class="note tone-info" id="en-closed">
            <rp-icon name="lock" [size]="17" />
            <div class="grow">
              <b>{{ years.selected()?.label }} is closed.</b> Enrolments are read-only. A correction
              is recorded as an adjustment after the coordinator raises it and the administrator
              approves it — the year isn't reopened.
            </div>
          </div>
        }
        <div class="tabs" role="tablist" aria-label="Enrolment">
          <button
            type="button"
            class="tab"
            role="tab"
            [class.on]="tab() === 'en'"
            [attr.aria-selected]="tab() === 'en'"
            (click)="tab.set('en')"
          >
            Enrolment · {{ yearLabel() }}
          </button>
          <button
            type="button"
            class="tab"
            role="tab"
            [class.on]="tab() === 'ro'"
            [attr.aria-selected]="tab() === 'ro'"
            (click)="tab.set('ro')"
          >
            @if (rollDone()) {
              <rp-icon name="checkc" [size]="15" />
            }
            {{ rollLabel() }}
          </button>
        </div>

        @if (tab() === 'ro') {
          <rp-rollover-panel
            [classes]="classes()"
            [readOnly]="access.rollWhy()"
            [denied]="access.can('academics.year') || access.management() ? '' : noTask"
            (loaded)="rolled($event)"
            (committed)="rolled($event)"
            (viewNext)="viewYear($event)"
          />
        } @else if (loading() && !list()) {
          <div class="stack g16" aria-busy="true" aria-label="Loading">
            <div class="c-grid k4 cc-kp">
              @for (i of [1, 2, 3, 4]; track i) {
                <div class="sk" style="height: 104px; border-radius: 16px"></div>
              }
            </div>
            <div class="sk" style="height: 44px; border-radius: 12px"></div>
            <div class="stack g8">
              @for (i of [1, 2, 3, 4, 5, 6]; track i) {
                <div class="sk" style="height: 40px; border-radius: 8px"></div>
              }
            </div>
          </div>
        } @else if (error()) {
          <div class="card pad">
            <rp-empty icon="alertc" title="Couldn't load the enrolments" [text]="error()">
              <button type="button" class="btn btn-sec btn-sm" (click)="load()">
                <span>Try again</span>
              </button>
            </rp-empty>
          </div>
        } @else if (list(); as l) {
          @if (!items().length) {
            @if (years.options().length > 1) {
              <div class="c-filters"><rp-year-picker inputId="en-year" /></div>
            }
            <rp-empty
              icon="grad"
              [title]="'No one is enrolled in ' + l.year.label + ' yet'"
              [text]="emptyText()"
            >
              @if (isNextYear()) {
                <button type="button" class="btn btn-sec" (click)="tab.set('ro')">
                  <rp-icon name="arrowr" [size]="17" /><span>Open roll-over</span>
                </button>
              }
            </rp-empty>
          } @else {
            <div class="c-grid k4 cc-kp">
              <rp-kpi label="Enrolled" icon="grad" [value]="num(l.total)" [delta]="l.year.label" />
              <rp-kpi label="Class-sections" icon="school" [value]="num(sectionCount())" />
              <rp-kpi
                label="Mid-term joiners"
                icon="calendar"
                tone="accent"
                value="—"
                delta="Not on the enrolment record yet"
              />
              @if (isCurrent()) {
                <rp-kpi
                  label="Active students not enrolled"
                  [icon]="notEnrolled() ? 'alert' : 'checkc'"
                  [tone]="notEnrolled() ? 'warn' : 'ok'"
                  [value]="notEnrolled() === null ? '—' : num(notEnrolled()!)"
                />
              } @else {
                <rp-kpi
                  label="Promoted by roll-over"
                  icon="checkc"
                  tone="ok"
                  [value]="num(promoted())"
                />
              }
            </div>
            <div class="c-filters">
              <rp-year-picker inputId="en-year" />
              <label class="search"
                ><rp-icon name="search" [size]="16" /><input
                  type="search"
                  id="en-q"
                  placeholder="Student or admission number"
                  aria-label="Search enrolments"
                  autocomplete="off"
                  [value]="q()"
                  (input)="q.set(val($event)); page.set(1)"
              /></label>
              <div class="fld">
                <rp-search-select
                  inputId="f-key"
                  placeholder="All class-sections"
                  [options]="sectionFilter()"
                  [value]="sectionF()"
                  (changed)="sectionF.set($event); page.set(1)"
                />
              </div>
              <span class="fsum">{{ plural(rows().length, 'student') }}</span>
            </div>
            @if (selected().length && !access.yearWhy()) {
              <div class="bulkbar" id="en-bulk">
                {{ plural(selected().length, 'student') }} selected <span class="grow"></span>
                <button type="button" class="btn btn-sec btn-sm" (click)="transferSelected()">
                  <rp-icon name="arrowr" [size]="15" /><span>Transfer section</span>
                </button>
                <button type="button" class="btn btn-sec btn-sm" (click)="selected.set([])">
                  <span>Clear</span>
                </button>
              </div>
            }
            <div class="tbl-wrap">
              <table class="tbl" id="en-table">
                <thead>
                  <tr>
                    @if (!access.yearWhy()) {
                      <th class="c-chk">
                        <input
                          type="checkbox"
                          class="tbl-chk"
                          aria-label="Select all"
                          [checked]="allShown()"
                          (change)="selectShown(checked($event))"
                        />
                      </th>
                    }
                    @for (c of columns; track c.k) {
                      <th
                        [class.sort]="c.sort"
                        [class.asc]="c.sort && sort()?.k === c.k && sort()?.dir === 'asc'"
                        [class.desc]="c.sort && sort()?.k === c.k && sort()?.dir === 'desc'"
                        (click)="c.sort && sortBy(c.k)"
                      >
                        {{ c.l }}
                        @if (c.sort) {
                          <span class="sa" aria-hidden="true">{{
                            sort()?.k === c.k && sort()?.dir === 'desc' ? '↓' : '↑'
                          }}</span>
                        }
                      </th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (e of shown(); track e.id) {
                    <tr [class.sel]="isSelected(e.id)">
                      @if (!access.yearWhy()) {
                        <td class="c-chk">
                          <input
                            type="checkbox"
                            class="tbl-chk"
                            [attr.aria-label]="'Select ' + person(e.student.name)"
                            [checked]="isSelected(e.id)"
                            (change)="toggle(e.id)"
                          />
                        </td>
                      }
                      <td>
                        <div class="cell-main">
                          <rp-av [name]="person(e.student.name)" size="sm" />
                          <div style="min-width: 0">
                            <div class="cell-t t-clip">{{ person(e.student.name) }}</div>
                            <div class="cell-s t-clip">{{ e.student.admissionNo || '—' }}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <b class="t-sb">{{ e.class.name }} {{ e.section.name }}</b>
                      </td>
                      <td>
                        <span class="tag"
                          ><rp-icon name="calendar" [size]="12" />{{ l.year.label }}</span
                        >
                      </td>
                      <td>
                        <span class="chip dot tone-ok">Enrolled</span>
                        @if (memberStatus(e); as s) {
                          &ngsp;<span [class]="'chip dot ' + s.tone">{{ s.l }}</span>
                        }
                        @if (e.correctionPending) {
                          <div class="cell-s t-warn">Correction pending approval</div>
                        }
                      </td>
                      <td>
                        {{ e.enrolledOn ? date(e.enrolledOn) : '—' }}
                        @if (source(e); as s) {
                          <div class="cell-s">{{ s }}</div>
                        }
                      </td>
                      <td class="r">
                        @if (years.closed()) {
                          @if (!access.editWhy() && !e.correctionPending) {
                            <button
                              type="button"
                              class="btn btn-ghost btn-xs"
                              (click)="correcting.set(e)"
                            >
                              <rp-icon name="edit" [size]="15" /><span>Request correction</span>
                            </button>
                          }
                        } @else if (!access.yearWhy()) {
                          <button
                            type="button"
                            class="btn btn-ghost btn-xs"
                            [attr.aria-label]="'Transfer ' + person(e.student.name)"
                            (click)="transferring.set([e])"
                          >
                            <span>Transfer</span>
                          </button>
                        }
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td [attr.colspan]="columns.length + (access.yearWhy() ? 0 : 1)">
                        <rp-empty
                          icon="search"
                          title="No matching records"
                          text="Try a different search or clear the filters."
                        />
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (rows().length > pageSize) {
              <rp-pager
                [total]="rows().length"
                [page]="page()"
                [size]="pageSize"
                (go)="page.set($event)"
              />
            } @else if (rows().length) {
              <div class="pager">
                <span>{{ plural(rows().length, 'student') }}</span>
              </div>
            }
          }
        }
      }
    </div>

    @if (enrolling()) {
      <rp-enrol-modal
        [year]="years.selected()!"
        [classes]="classes()"
        [enrolled]="enrolledIds()"
        [notEnrolled]="isCurrent() ? notEnrolled() : null"
        (closed)="enrolling.set(false)"
        (saved)="enrolling.set(false); load()"
      />
    }
    @if (transferring(); as t) {
      <rp-transfer-modal
        [enrolments]="t"
        [classes]="classes()"
        [year]="years.selected()!"
        (closed)="transferring.set(null)"
        (saved)="transferring.set(null); selected.set([]); load()"
        (changed)="load()"
      />
    }
    @if (correcting(); as e) {
      <rp-correction-modal
        [enrolment]="e"
        [classes]="classes()"
        [year]="years.selected()!"
        (closed)="correcting.set(null)"
        (sent)="correcting.set(null); load()"
      />
    }
  `,
})
export class ConsoleEnrol {
  private readonly api = inject(EnrolmentsApi);
  private readonly structure = inject(StructureApi);
  private readonly members = inject(MembersApi);
  private readonly overlays = inject(Overlays);
  protected readonly years = inject(AcademicYears);
  private readonly session = inject(SessionContext).console;
  protected readonly access = academicsAccess(this.session, this.years);

  protected readonly pageSize = PAGE;
  protected readonly plural = plural;
  protected readonly num = num;
  protected readonly person = person;
  protected readonly noTask = "Your role doesn't include this task.";
  protected readonly columns: readonly { k: SortKey | 'y' | 'a'; l: string; sort: boolean }[] = [
    { k: 'name', l: 'Student', sort: true },
    { k: 'cs', l: 'Grade and section', sort: true },
    { k: 'y', l: 'Year', sort: false },
    { k: 'status', l: 'Status', sort: true },
    { k: 'at', l: 'Enrolled on', sort: true },
    { k: 'a', l: '', sort: false },
  ];

  protected readonly tab = signal<Tab>('en');
  protected readonly list = signal<EnrolmentList | null>(null);
  protected readonly items = signal<readonly Enrolment[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly classes = signal<readonly ClassView[]>([]);
  protected readonly activeStudents = signal<number | null>(null);
  protected readonly q = signal('');
  protected readonly sectionF = signal('');
  protected readonly page = signal(1);
  protected readonly sort = signal<{ k: SortKey; dir: 'asc' | 'desc' } | null>(null);
  protected readonly selected = signal<readonly string[]>([]);
  protected readonly enrolling = signal(false);
  protected readonly transferring = signal<readonly Enrolment[] | null>(null);
  protected readonly correcting = signal<Enrolment | null>(null);
  protected readonly roll = signal<Rollover | null>(null);
  private seq = 0;

  protected readonly yearLabel = computed(
    () => this.list()?.year.label ?? this.years.selected()?.label ?? '',
  );
  protected readonly sub = computed(() => {
    const y = this.yearLabel();
    return `Who is in which class-section${y ? ' for ' + y : ''}, and the roll-over into the next year`;
  });
  /** The roll-over runs from the current year into the one after it. */
  protected readonly rollLabel = computed(() => {
    const to = this.roll()?.to.label ?? this.years.after(this.years.current())?.label;
    return to ? `Roll-over to ${to}` : 'Roll-over';
  });
  protected readonly rollDone = computed(() => this.roll()?.status === 'COMMITTED');
  protected readonly isCurrent = computed(() => !!this.years.selected()?.current);
  protected readonly isNextYear = computed(() => {
    const s = this.years.selected();
    const n = this.years.after(this.years.current());
    return !!s && !!n && s.id === n.id;
  });
  protected readonly emptyText = computed(() =>
    this.isNextYear()
      ? `Run the roll-over from ${this.years.current()?.label ?? 'the current year'} to propose next year's classes, amend it per student, then commit.`
      : 'Enrol students into class-sections for this year.',
  );
  protected readonly enrolledIds = computed(() => this.items().map((e) => e.student.id));
  protected readonly sectionCount = computed(
    () => new Set(this.items().map((e) => e.section.id)).size,
  );
  protected readonly promoted = computed(
    () => this.items().filter((e) => e.outcome === 'PROMOTED').length,
  );
  protected readonly notEnrolled = computed(() => {
    const a = this.activeStudents();
    if (a === null) return null;
    return Math.max(0, a - this.items().filter((e) => e.student.status === 'ACTIVE').length);
  });
  private readonly classOrder = computed(() => new Map(this.classes().map((c) => [c.id, c.order])));
  protected readonly sectionFilter = computed<DropdownOption[]>(() => [
    { v: '', l: 'All class-sections' },
    ...[...this.classes()]
      .sort((a, b) => a.order - b.order)
      .flatMap((c) => c.sections.map((s) => ({ v: s.id, l: `${c.name} ${s.name}` }))),
  ]);
  protected readonly rows = computed(() => {
    const q = this.q().trim().toLowerCase();
    const list = this.items().filter(
      (e) =>
        (!this.sectionF() || e.section.id === this.sectionF()) &&
        (!q ||
          e.student.name.toLowerCase().includes(q) ||
          (e.student.admissionNo ?? '').toLowerCase().includes(q)),
    );
    const s = this.sort();
    if (!s) return list;
    const val = (e: Enrolment): string =>
      s.k === 'name'
        ? person(e.student.name)
        : s.k === 'cs'
          ? `${String(this.classOrder().get(e.class.id) ?? 999).padStart(4, '0')} ${e.section.name}`
          : s.k === 'status'
            ? e.student.status
            : (e.enrolledOn ?? '');
    return [...list].sort((a, b) => {
      const c = byLabel(val(a), val(b));
      return s.dir === 'desc' ? -c : c;
    });
  });
  protected readonly shown = computed(() =>
    this.rows().slice((this.page() - 1) * PAGE, this.page() * PAGE),
  );
  protected readonly allShown = computed(
    () => this.shown().length > 0 && this.shown().every((e) => this.selected().includes(e.id)),
  );

  constructor() {
    if (inject(ActivatedRoute).snapshot.queryParamMap.get('tab') === 'ro') this.tab.set('ro');
    effect(() => {
      this.years.selectedId();
      if (this.years.loaded()) {
        untracked(() => {
          this.selected.set([]);
          this.page.set(1);
          void this.load();
        });
      }
    });
    if (!this.access.denied()) {
      void this.years.load();
      void this.lookups();
    }
  }

  protected async load() {
    if (this.access.denied()) return;
    const n = ++this.seq;
    this.loading.set(true);
    try {
      const r = await this.api.all(this.years.selectedId() || undefined);
      if (n !== this.seq) return;
      this.list.set(r.list);
      this.items.set(r.items);
      this.selected.set(this.selected().filter((id) => r.items.some((e) => e.id === id)));
      this.error.set('');
    } catch (e) {
      if (n === this.seq) this.error.set(problemText(e));
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
  }

  private async lookups() {
    try {
      this.classes.set((await this.structure.classes()).items);
    } catch {
      // The class-section filter and the dialogs then offer nothing to choose.
    }
    if (!this.access.can('members.view')) return;
    try {
      const r = await this.members.list({ kind: 'STUDENTS', status: 'ACTIVE', limit: 1 });
      this.activeStudents.set(r.counts.tabs.STUDENTS);
    } catch {
      // The "not enrolled" figure then shows "—".
    }
  }

  protected rolled(r: Rollover) {
    this.roll.set(r);
    if (r.status === 'COMMITTED') void this.years.load(true);
  }

  protected viewYear(id: string) {
    this.years.select(id);
    this.tab.set('en');
    const y = this.years.items().find((x) => x.id === id);
    if (y) this.overlays.toast(`Showing ${y.label}`, { tone: 'info' });
  }

  protected transferSelected() {
    const list = this.items().filter((e) => this.selected().includes(e.id));
    if (!list.length) return;
    if (new Set(list.map((e) => e.class.id)).size > 1) {
      this.overlays.toast('Choose students from one class', {
        tone: 'bad',
        sub: translate('ACA.TRANSFER_SAME_CLASS'),
      });
      return;
    }
    this.transferring.set(list);
  }

  /** The year's enrolments as CSV (prototype cc.en.export). */
  protected export() {
    const label = this.yearLabel();
    const name = `enrolment_${label}.csv`;
    saveCsv(name, [
      ['Admission no.', 'Student', 'Grade', 'Section', 'Year', 'Enrolled on'],
      ...this.rows().map((e) => [
        e.student.admissionNo ?? '',
        person(e.student.name),
        e.class.name,
        e.section.name,
        label,
        e.enrolledOn ? formatDate(e.enrolledOn) : '',
      ]),
    ]);
    this.overlays.toast(`CSV export prepared · ${plural(this.rows().length, 'row')}`, {
      sub: name,
    });
  }

  // --- selection ---------------------------------------------------------------------------------------
  protected isSelected(id: string) {
    return this.selected().includes(id);
  }
  protected toggle(id: string) {
    const s = this.selected();
    this.selected.set(s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  }
  protected selectShown(on: boolean) {
    const ids = this.shown().map((e) => e.id);
    const rest = this.selected().filter((id) => !ids.includes(id));
    this.selected.set(on ? [...rest, ...ids] : rest);
  }

  // --- formatting --------------------------------------------------------------------------------------
  protected sortBy(k: string) {
    const key = k as SortKey;
    const s = this.sort();
    this.sort.set({ k: key, dir: s?.k === key && s.dir === 'asc' ? 'desc' : 'asc' });
    this.page.set(1);
  }
  protected memberStatus(e: Enrolment) {
    return MEMBER_STATUS[e.student.status] ?? null;
  }
  protected source(e: Enrolment) {
    if (e.outcome === 'PROMOTED') return 'Roll-over';
    if (e.outcome === 'REPEATED') return 'Roll-over · repeats';
    return e.moves ? `${plural(e.moves, 'transfer')} this year` : '';
  }
  protected date(d: string) {
    return formatDate(d);
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected checked(e: Event) {
    return (e.target as HTMLInputElement).checked;
  }
}
