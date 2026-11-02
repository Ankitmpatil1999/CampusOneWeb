import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Avatar } from '../../../Shared/Avatar';
import { Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { Pager } from '../../../Shared/Pager';
import { formatDate, istBusinessDate } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { shortId } from '../Coupons/coupon-format';
import type { Holder } from './HolderSelect';
import { PassCreate } from './PassCreate';
import { PassDrawer } from './PassDrawer';
import { PASS_TONE, passState, type PassState } from './pass-format';
import { PassesApi, type EntryPass, type PassList } from './passes.api';

type Pill = '' | 'today' | 'future' | 'used' | 'expired' | 'cancelled';
type SortKey = 'id' | 'name' | 'date' | 'scans' | 'state';
const PAGE = 12;
const COLUMNS: readonly { k: SortKey | 'purpose' | 'tr'; l: string; r: boolean; sort: boolean }[] =
  [
    { k: 'id', l: 'Pass', r: false, sort: true },
    { k: 'name', l: 'Holder', r: false, sort: true },
    { k: 'purpose', l: 'Purpose', r: false, sort: false },
    { k: 'date', l: 'Valid on', r: false, sort: true },
    { k: 'scans', l: 'Scans', r: true, sort: true },
    { k: 'tr', l: 'Transfer', r: false, sort: false },
    { k: 'state', l: 'Status', r: false, sort: true },
  ];
const PILL_STATES: Readonly<Record<Exclude<Pill, ''>, readonly PassState[]>> = {
  today: ['Valid today', 'Authorised'],
  future: ['Valid in future'],
  used: ['Used'],
  expired: ['Expired'],
  cancelled: ['Cancelled'],
};

/**
 * c.passes — Entry passes (SRS 9.6–9.9, FR-PAY-08, BR-72; PAY-026…028; prototype c.passes):
 * single-day passes shown from the holder's registered phone and scanned by staff — today's
 * figures, search, type and status filters, the pass drawer (cancel a live pass) and "Create entry
 * pass".
 */
@Component({
  selector: 'rp-console-passes',
  imports: [Avatar, Dropdown, Empty, Icon, Kpi, PageHead, Pager, PassCreate, PassDrawer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Entry passes"
        sub="Single-day passes shown from the holder's registered device and scanned by staff."
      >
        @if (editWhy()) {
          <span class="cp-why" [attr.title]="editWhy()"
            ><button type="button" class="btn btn-pri" disabled>
              <rp-icon name="plus" [size]="17" /><span>Create entry pass</span>
            </button></span
          >
        } @else {
          <button type="button" class="btn btn-pri" id="ps-new" (click)="creating.set(true)">
            <rp-icon name="plus" [size]="17" /><span>Create entry pass</span>
          </button>
        }
      </rp-page-head>

      @if (readOnly()) {
        <div class="note tone-info">
          <rp-icon name="lock" [size]="17" />
          <div class="grow"><b>Read-only.</b> {{ readOnly() }}</div>
        </div>
      }

      <div class="c-grid k4">
        <rp-kpi label="Valid today" icon="door" [value]="data() ? num(validToday()) : '—'" />
        <rp-kpi
          label="Authorised now"
          icon="shieldck"
          tone="ok"
          [value]="data() ? num(authorised()) : '—'"
          delta="Authorisation window before a scan"
        />
        <rp-kpi label="Scans today" icon="scan" [value]="data() ? num(scansToday()) : '—'" />
        <rp-kpi label="Upcoming" icon="calendar" [value]="data() ? num(upcoming()) : '—'" />
      </div>

      <div class="c-filters">
        <label class="search"
          ><rp-icon name="search" [size]="16" /><input
            type="search"
            id="ps-q"
            placeholder="Search holder, pass or purpose"
            aria-label="Search passes"
            autocomplete="off"
            [value]="q()"
            (input)="setQ($event)"
        /></label>
        <div class="fld">
          <rp-dd
            inputId="ps-type"
            placeholder="All types"
            [options]="typeOptions()"
            [value]="type()"
            (changed)="type.set($event); page.set(1)"
          />
        </div>
        <div class="pills" role="group" aria-label="Status">
          @for (p of pills; track p.v) {
            <button
              type="button"
              class="pill"
              [class.on]="pill() === p.v"
              [attr.aria-pressed]="pill() === p.v"
              (click)="pill.set(p.v); page.set(1)"
            >
              {{ p.l }}
            </button>
          }
        </div>
        <span class="fsum">{{ summary() }}</span>
      </div>

      @if (error()) {
        <div class="card pad">
          <rp-empty icon="alertc" title="Couldn't load the passes" [text]="error()">
            <button type="button" class="btn btn-sec btn-sm" (click)="load()">
              <span>Try again</span>
            </button>
          </rp-empty>
        </div>
      } @else {
        <div class="tbl-wrap">
          <table class="tbl">
            <thead>
              <tr>
                @for (c of columns; track c.k) {
                  <th
                    [class.sort]="c.sort"
                    [class.r]="c.r"
                    [class.asc]="c.sort && sort().k === c.k && sort().dir === 'asc'"
                    [class.desc]="c.sort && sort().k === c.k && sort().dir === 'desc'"
                    [attr.aria-sort]="ariaSort(c.k)"
                    (click)="c.sort && sortBy(c.k)"
                  >
                    @if (c.sort) {
                      <button
                        type="button"
                        class="cp-th"
                        (click)="$event.stopPropagation(); sortBy(c.k)"
                      >
                        {{ c.l
                        }}<span class="sa" aria-hidden="true">{{
                          sort().k === c.k && sort().dir === 'desc' ? '↓' : '↑'
                        }}</span>
                      </button>
                    } @else {
                      {{ c.l }}
                    }
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
              @for (p of shown(); track p.id) {
                <tr tabindex="0" (click)="openId.set(p.id)" (keydown.enter)="openId.set(p.id)">
                  <td>
                    <span class="t-mono" [title]="p.id">{{ short(p.id) }}</span>
                    <div class="cell-s">{{ p.type.label }}</div>
                  </td>
                  <td>
                    <div class="cell-main">
                      <rp-av [name]="p.holder.name" size="sm" />
                      <div style="min-width: 0">
                        <div class="cell-t t-clip">{{ p.holder.name }}</div>
                        <div class="cell-s">{{ p.holder.admissionNo ?? 'Visitor' }}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div class="t-clip" style="max-width: 260px">{{ p.purpose }}</div>
                  </td>
                  <td>{{ date(p.validOn) }}</td>
                  <td class="r">
                    <span class="t-num">{{ p.usedScans }} / {{ p.maxScans }}</span>
                  </td>
                  <td>
                    @if (p.transferAllowed) {
                      Allowed
                    } @else {
                      <span class="t-faint">No</span>
                    }
                  </td>
                  <td>
                    <span [class]="'chip dot tone-' + tone(p)">{{ state(p) }}</span>
                  </td>
                </tr>
              } @empty {
                @if (!loading()) {
                  <tr>
                    <td [attr.colspan]="columns.length">
                      <rp-empty
                        icon="door"
                        [title]="filtered() ? 'No passes match' : 'No entry passes yet'"
                        [text]="
                          filtered()
                            ? 'Change the filters, or create a pass.'
                            : 'Create a pass for a student or visitor with a registered phone.'
                        "
                      />
                    </td>
                  </tr>
                }
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
            <span>{{ count(rows().length) }}</span>
          </div>
        }
      }
    </div>

    @if (openPass(); as p) {
      <rp-pass-drawer
        [pass]="p"
        [canEdit]="!editWhy()"
        (closed)="openId.set(null)"
        (changed)="changed($event)"
      />
    }
    @if (creating()) {
      <rp-pass-create
        [types]="data()?.types ?? []"
        (closed)="creating.set(false)"
        (created)="created($event)"
      />
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
export class ConsolePasses {
  private readonly api = inject(PassesApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).console;

  protected readonly columns = COLUMNS;
  protected readonly pageSize = PAGE;
  protected readonly noTask = "Your role doesn't include this task.";
  protected readonly pills: readonly { v: Pill; l: string }[] = [
    { v: '', l: 'All' },
    { v: 'today', l: 'Valid today' },
    { v: 'future', l: 'Upcoming' },
    { v: 'used', l: 'Used' },
    { v: 'expired', l: 'Expired' },
    { v: 'cancelled', l: 'Cancelled' },
  ];

  protected readonly q = signal('');
  protected readonly type = signal('');
  protected readonly pill = signal<Pill>('');
  protected readonly data = signal<PassList | null>(null);
  protected readonly items = signal<readonly EntryPass[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly sort = signal<{ k: SortKey; dir: 'asc' | 'desc' }>({ k: 'date', dir: 'desc' });
  readonly openId = signal<string | null>(null);
  protected readonly creating = signal(false);

  protected readonly readOnly = computed(() =>
    this.session()?.roles.some((r) => r.readOnly)
      ? 'Management has read-only access. The administrator makes changes here.'
      : '',
  );
  protected readonly editWhy = computed(
    () => this.readOnly() || (this.can('passes.edit') ? '' : this.noTask),
  );
  private readonly today = computed(() => istBusinessDate(new Date()));
  protected readonly validToday = computed(
    () => this.items().filter((p) => p.visibility === 'VALID_TODAY').length,
  );
  protected readonly authorised = computed(
    () => this.items().filter((p) => passState(p) === 'Authorised').length,
  );
  /** A pass is scanned only on its own day: today's scans are those of today's passes. */
  protected readonly scansToday = computed(() =>
    this.items()
      .filter((p) => p.validOn === this.today())
      .reduce((a, p) => a + p.usedScans, 0),
  );
  protected readonly upcoming = computed(
    () => this.items().filter((p) => p.visibility === 'VALID_IN_FUTURE').length,
  );
  protected readonly typeOptions = computed<DropdownOption[]>(() => [
    { v: '', l: 'All types' },
    ...(this.data()?.types ?? []).map((t) => ({ v: t.code, l: t.label })),
  ]);
  protected readonly filtered = computed(() =>
    Boolean(this.q().trim() || this.type() || this.pill()),
  );
  protected readonly rows = computed(() => {
    const q = this.q().trim().toLowerCase();
    const pill = this.pill();
    const list = this.items().filter(
      (p) =>
        (!this.type() || p.type.code === this.type()) &&
        (!pill || PILL_STATES[pill].includes(passState(p))) &&
        (!q ||
          p.holder.name.toLowerCase().includes(q) ||
          p.purpose.toLowerCase().includes(q) ||
          p.id.replace(/-/g, '').toLowerCase().includes(q.replace(/-/g, ''))),
    );
    const s = this.sort();
    const get = (p: EntryPass): string | number =>
      s.k === 'id'
        ? p.id
        : s.k === 'name'
          ? p.holder.name
          : s.k === 'date'
            ? p.validOn + p.createdAt
            : s.k === 'scans'
              ? p.usedScans
              : passState(p);
    return [...list].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      const r =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y), 'en', { numeric: true });
      return s.dir === 'desc' ? -r : r;
    });
  });
  protected readonly shown = computed(() =>
    this.rows().slice((this.page() - 1) * PAGE, this.page() * PAGE),
  );
  protected readonly summary = computed(() => this.count(this.rows().length));
  protected readonly openPass = computed(
    () => this.items().find((p) => p.id === this.openId()) ?? null,
  );

  constructor() {
    void this.load();
  }

  protected async load() {
    this.loading.set(true);
    try {
      const d = await this.api.list();
      this.data.set(d);
      this.items.set(d.items);
      this.error.set('');
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      this.loading.set(false);
    }
  }

  protected setQ(e: Event) {
    this.q.set((e.target as HTMLInputElement).value);
    this.page.set(1);
  }
  protected sortBy(k: SortKey | 'purpose' | 'tr') {
    if (k === 'purpose' || k === 'tr') return;
    const s = this.sort();
    this.sort.set({ k, dir: s.k === k && s.dir === 'asc' ? 'desc' : 'asc' });
    this.page.set(1);
  }
  protected ariaSort(k: SortKey | 'purpose' | 'tr') {
    if (k === 'purpose' || k === 'tr') return null;
    const s = this.sort();
    return s.k === k ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  }

  protected created(r: { passId: string; holder: Holder; validOn: string }) {
    this.creating.set(false);
    this.overlays.toast('Entry pass created', {
      sub: `${shortId(r.passId)} · ${r.holder.name} · ${formatDate(r.validOn)}`,
    });
    void this.load();
  }
  protected changed(p: EntryPass) {
    this.items.update((l) => l.map((x) => (x.id === p.id ? p : x)));
    void this.load();
  }

  protected can(sub: string) {
    return this.session()?.subTasks.includes(sub) ?? false;
  }
  protected state(p: EntryPass) {
    return passState(p);
  }
  protected tone(p: EntryPass) {
    return PASS_TONE[passState(p)];
  }
  protected short(id: string) {
    return shortId(id);
  }
  protected date(v: string) {
    return formatDate(v);
  }
  protected num(n: number) {
    return n.toLocaleString('en-IN');
  }
  protected count(n: number) {
    return `${n.toLocaleString('en-IN')} ${n === 1 ? 'pass' : 'passes'}`;
  }
}
