import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Amount, amountPaise, inrText } from '../../../Shared/Amount';
import { Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { Pager } from '../../../Shared/Pager';
import { formatDate } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { plural } from '../Allowances/allowance-format';
import { dshort } from '../Coupons/coupon-format';
import { InstitutionSetupApi } from '../Institution/institution.api';
import { MembersApi, type ClassView } from '../Members/members.api';
import { MerchantsApi } from '../Merchants/merchants.api';
import { inrWhole } from '../Merchants/merchant-format';
import { EventDrawer } from './EventDrawer';
import { EventForm } from './EventForm';
import { audienceText, eventState } from './event-format';
import { EventsApi, type EventList, type EventStatus, type PaidEvent } from './events.api';

type SortKey = 'title' | 'start' | 'total' | 'payers' | 'coll' | 'status';
const PAGE = 12;
const COLUMNS: readonly { k: SortKey | 'm'; l: string; r: boolean; sort: boolean }[] = [
  { k: 'title', l: 'Event', r: false, sort: true },
  { k: 'start', l: 'Open', r: false, sort: true },
  { k: 'total', l: 'Amount', r: true, sort: true },
  { k: 'm', l: 'Paid to', r: false, sort: false },
  { k: 'payers', l: 'Payers', r: true, sort: true },
  { k: 'coll', l: 'Collected', r: true, sort: true },
  { k: 'status', l: 'Status', r: false, sort: true },
];

/**
 * c.events — Events (SRS 13.6–13.10, FR-FEE-10, OI-FEE-13…16; FEE-028…031; prototype c.events):
 * paid institution events with their key figures, search and status filters, the activation switch
 * on each row, the event drawer (heads, report, CSV, activate or deactivate, edit) and the
 * "Register event" form. Members pay the exact total once from the wallet while an event is open.
 */
@Component({
  selector: 'rp-console-events',
  imports: [Amount, Empty, EventDrawer, EventForm, Icon, Kpi, PageHead, Pager],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Events"
        sub="Paid institution events — members pay the exact total once from the wallet while the event is open."
      >
        @if (newWhy()) {
          <span class="cp-why" [attr.title]="newWhy()"
            ><button type="button" class="btn btn-pri" disabled>
              <rp-icon name="plus" [size]="17" /><span>Register event</span>
            </button></span
          >
        } @else {
          <button type="button" class="btn btn-pri" id="ev-new" (click)="openForm(null)">
            <rp-icon name="plus" [size]="17" /><span>Register event</span>
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
        <rp-kpi
          label="Open for payment"
          icon="calendar"
          [value]="kpis() ? num(kpis()!.live) : '—'"
        />
        <rp-kpi label="Collected" icon="rupee" [value]="kpis() ? whole(kpis()!.collected) : '—'" />
        <rp-kpi
          label="Payments"
          icon="users"
          [value]="kpis() ? num(kpis()!.payments) : '—'"
          delta="Each member pays an event once"
        />
        <rp-kpi
          label="Nightly status job"
          icon="timer"
          value="23:50"
          delta="Moves events inactive after their end date"
        />
      </div>

      <div class="c-filters">
        <label class="search"
          ><rp-icon name="search" [size]="16" /><input
            type="search"
            id="ev-q"
            placeholder="Search events"
            aria-label="Search events"
            autocomplete="off"
            [value]="q()"
            (input)="setQ($event)"
        /></label>
        <div class="pills" role="group" aria-label="Status">
          @for (p of statusPills; track p.v) {
            <button
              type="button"
              class="pill"
              [class.on]="status() === p.v"
              [attr.aria-pressed]="status() === p.v"
              (click)="status.set(p.v); page.set(1)"
            >
              {{ p.l }}
            </button>
          }
        </div>
        <span class="fsum">{{ summary() }}</span>
      </div>

      @if (error()) {
        <div class="card pad">
          <rp-empty icon="alertc" title="Couldn't load the events" [text]="error()">
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
                    [class.asc]="c.sort && sort()?.k === c.k && sort()?.dir === 'asc'"
                    [class.desc]="c.sort && sort()?.k === c.k && sort()?.dir === 'desc'"
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
                          sort()?.k === c.k && sort()?.dir === 'desc' ? '↓' : '↑'
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
              @for (e of shown(); track e.id) {
                <tr tabindex="0" (click)="openId.set(e.id)" (keydown.enter)="openId.set(e.id)">
                  <td>
                    <div class="cell-t t-clip" style="max-width: 340px">{{ e.title }}</div>
                    <div class="cell-s">{{ audience(e) }} · {{ heads(e) }}</div>
                  </td>
                  <td>
                    <span class="t-sm">{{ dshort(e.startDate) }} – {{ date(e.endDate) }}</span>
                  </td>
                  <td class="r"><rp-amt [value]="e.total" /></td>
                  <td>
                    <span class="t-sm">{{ e.merchant }}</span>
                  </td>
                  <td class="r">{{ num(e.payments.count) }}</td>
                  <td class="r"><rp-amt [value]="e.payments.collected" /></td>
                  <td>
                    <div class="row g8">
                      <button
                        type="button"
                        class="toggle"
                        role="switch"
                        [attr.aria-checked]="e.status === 'ACTIVE'"
                        [attr.aria-label]="'Active: ' + e.title"
                        [disabled]="!!editWhy() || busyId() === e.id"
                        (click)="$event.stopPropagation(); toggle(e)"
                        (keydown.enter)="$event.stopPropagation()"
                      ></button>
                      <span
                        class="chip dot"
                        [class.tone-ok]="e.status === 'ACTIVE'"
                        [class.tone-neutral]="e.status !== 'ACTIVE'"
                        >{{ e.status === 'ACTIVE' ? 'Active' : 'Inactive' }}</span
                      >
                    </div>
                    @if (state(e) === 'Ended') {
                      <div class="cell-s">Ended — the 23:50 job deactivates it</div>
                    } @else if (state(e) === 'Upcoming') {
                      <div class="cell-s">Opens {{ dshort(e.startDate) }}</div>
                    }
                  </td>
                </tr>
              } @empty {
                @if (!loading()) {
                  <tr>
                    <td [attr.colspan]="columns.length">
                      <rp-empty
                        icon="calendar"
                        [title]="filtered() ? 'No events match' : 'No events'"
                        [text]="
                          filtered()
                            ? 'Change the search or the status.'
                            : 'Register an event to collect a fixed amount from members.'
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
            <span>{{ count(rows().length, 'event') }}</span>
          </div>
        }
      }
    </div>

    @if (openEvent(); as e) {
      <rp-event-drawer
        [event]="e"
        [readOnly]="editWhy()"
        [busy]="busyId() === e.id"
        (closed)="openId.set(null)"
        (activation)="toggle(e)"
        (edit)="openForm(e)"
      />
    }
    @if (form(); as f) {
      <rp-event-form
        [event]="f.event"
        [classes]="classes()"
        [feeAccount]="feeAccount()"
        (closed)="form.set(null)"
        (saved)="saved($event, !!f.event)"
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
export class ConsoleEvents {
  private readonly api = inject(EventsApi);
  private readonly members = inject(MembersApi);
  private readonly merchants = inject(MerchantsApi);
  private readonly setup = inject(InstitutionSetupApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).console;

  protected readonly columns = COLUMNS;
  protected readonly pageSize = PAGE;
  protected readonly noTask = "Your role doesn't include this task.";
  protected readonly statusPills: readonly { v: EventStatus | ''; l: string }[] = [
    { v: '', l: 'All' },
    { v: 'ACTIVE', l: 'Active' },
    { v: 'INACTIVE', l: 'Inactive' },
  ];

  protected readonly q = signal('');
  protected readonly status = signal<EventStatus | ''>('');
  protected readonly data = signal<EventList | null>(null);
  protected readonly items = signal<readonly PaidEvent[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly sort = signal<{ k: SortKey; dir: 'asc' | 'desc' } | null>(null);
  readonly openId = signal<string | null>(null);
  protected readonly form = signal<{ event: PaidEvent | null } | null>(null);
  protected readonly busyId = signal<string | null>(null);
  protected readonly classes = signal<readonly ClassView[]>([]);
  protected readonly feeAccount = signal<string | null>(null);
  /** The institution's events feature (INS-012); null when it can't be read (no config.view). */
  private readonly featureOn = signal<boolean | null>(null);

  protected readonly readOnly = computed(() =>
    this.session()?.roles.some((r) => r.readOnly)
      ? 'Management has read-only access. The administrator or accountant makes changes here.'
      : '',
  );
  protected readonly editWhy = computed(
    () => this.readOnly() || (this.can('events.edit') ? '' : this.noTask),
  );
  protected readonly newWhy = computed(
    () =>
      this.editWhy() ||
      (this.featureOn() === false ? 'Events are turned off for this institution.' : ''),
  );
  protected readonly kpis = computed(() => this.data()?.kpis ?? null);
  protected readonly filtered = computed(() => Boolean(this.q().trim() || this.status()));
  protected readonly rows = computed(() => {
    const q = this.q().trim().toLowerCase();
    const list = this.items().filter(
      (e) =>
        (!this.status() || e.status === this.status()) &&
        (!q || e.title.toLowerCase().includes(q) || e.id.toLowerCase().startsWith(q)),
    );
    const s = this.sort();
    if (!s) return list;
    const get = (e: PaidEvent): string | number =>
      s.k === 'title'
        ? e.title
        : s.k === 'start'
          ? e.startDate
          : s.k === 'total'
            ? amountPaise(e.total)
            : s.k === 'payers'
              ? e.payments.count
              : s.k === 'coll'
                ? amountPaise(e.payments.collected)
                : e.status;
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
  protected readonly summary = computed(() => plural(this.rows().length, 'event'));
  protected readonly openEvent = computed(
    () => this.items().find((e) => e.id === this.openId()) ?? null,
  );

  constructor() {
    void this.load();
    void this.lookups();
  }

  private async lookups() {
    try {
      this.classes.set((await this.members.classes()).items);
    } catch {
      // The audience then can't be narrowed to classes (the whole institution).
    }
    if (this.can('merchants.view')) {
      try {
        const fee = (await this.merchants.list({ limit: 200 })).items.find((m) => m.isFeeAccount);
        this.feeAccount.set(fee?.displayName ?? null);
      } catch {
        // The form names "the institution's fee account".
      }
    }
    if (!this.can('config.view')) return;
    try {
      const inst = await this.setup.institution();
      const f = inst.features.find((x) => x.key === 'events');
      if (f) this.featureOn.set(f.enabled);
    } catch {
      // Unknown: the button stays available.
    }
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

  // --- filters ---------------------------------------------------------------------------------------
  protected setQ(e: Event) {
    this.q.set((e.target as HTMLInputElement).value);
    this.page.set(1);
  }
  protected sortBy(k: SortKey | 'm') {
    if (k === 'm') return;
    const s = this.sort();
    this.sort.set({ k, dir: s?.k === k && s.dir === 'asc' ? 'desc' : 'asc' });
    this.page.set(1);
  }
  protected ariaSort(k: SortKey | 'm') {
    if (k === 'm') return null;
    const s = this.sort();
    return s?.k === k ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  }

  // --- changes -------------------------------------------------------------------------------------
  protected openForm(e: PaidEvent | null) {
    if (e ? this.editWhy() : this.newWhy()) return;
    this.form.set({ event: e });
  }
  protected saved(e: PaidEvent, existed: boolean) {
    this.form.set(null);
    this.replace(e);
    this.overlays.toast(existed ? 'Event saved' : 'Event registered', { sub: e.title });
    if (!existed) setTimeout(() => this.openId.set(e.id), 250);
    void this.load();
  }

  /** Activate or deactivate (cm.ev.toggle): an ended event can't open again. */
  protected async toggle(e: PaidEvent) {
    if (this.editWhy() || this.busyId()) return;
    const on = e.status === 'ACTIVE';
    if (!on && eventState({ ...e, status: 'ACTIVE' }) === 'Ended') {
      this.overlays.toast('This event has ended', {
        tone: 'warn',
        sub: `It closed on ${formatDate(e.endDate)}. Register a new event to collect again.`,
      });
      return;
    }
    const ok = await this.overlays.confirm({
      title: `${on ? 'Deactivate' : 'Activate'} ${e.title}?`,
      text: on
        ? 'Members can no longer pay for it. Payments already made stay.'
        : `Members can pay ${inrText(e.total)} until ${formatDate(e.endDate)}.`,
      ok: on ? 'Deactivate' : 'Activate',
      tone: on ? 'warn' : 'brand',
      icon: 'power',
    });
    if (!ok) return;
    this.busyId.set(e.id);
    try {
      const out = await this.api.update(e, { status: on ? 'INACTIVE' : 'ACTIVE' });
      this.replace(out);
      this.overlays.toast(on ? 'Event deactivated' : 'Event activated', { sub: e.title });
      void this.load();
    } catch (err) {
      this.overlays.toast(
        err instanceof ApiProblem
          ? err.status === 412
            ? 'Someone else changed this event'
            : err.detail
          : translate('GEN.UNAVAILABLE'),
        {
          tone: 'bad',
          ...(err instanceof ApiProblem && err.status === 412 ? { sub: 'Open it again.' } : {}),
        },
      );
      if (err instanceof ApiProblem && err.status === 412) void this.load();
    } finally {
      this.busyId.set(null);
    }
  }
  private replace(e: PaidEvent) {
    const list = this.items();
    this.items.set(
      list.some((x) => x.id === e.id) ? list.map((x) => (x.id === e.id ? e : x)) : [e, ...list],
    );
  }

  // --- formatting ------------------------------------------------------------------------------------
  protected can(sub: string) {
    return this.session()?.subTasks.includes(sub) ?? false;
  }
  protected state(e: PaidEvent) {
    return eventState(e);
  }
  protected audience(e: PaidEvent) {
    return audienceText(e);
  }
  protected heads(e: PaidEvent) {
    return plural(e.heads.length, 'head');
  }
  protected whole(m: { amount: string }) {
    return inrWhole(m);
  }
  protected dshort(d: string) {
    return dshort(d);
  }
  protected date(v: string) {
    return formatDate(v);
  }
  protected num(n: number) {
    return n.toLocaleString('en-IN');
  }
  protected count(n: number, noun: string) {
    return plural(n, noun);
  }
}
