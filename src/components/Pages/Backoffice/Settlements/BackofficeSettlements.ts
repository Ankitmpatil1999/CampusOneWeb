import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SessionContext } from '../../../../Context/SessionContext';
import { Card, Empty, Kpi } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { Pager } from '../../../Shared/Pager';
import { formatDate, formatDateTime, istBusinessDate, titleCase } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { PayoutForm } from './PayoutForm';
import { ProcessOverlay, runProcess, type ProcessState } from './Process';
import { SettlementDrawer, type SettlementAction } from './SettlementDrawer';
import {
  STATUS_TONE,
  addDays,
  hm24,
  inr,
  inrPaise,
  paiseOf,
  payoutDue,
  permsOf,
  plural,
  statusLabel,
  sumOf,
} from './settlement-format';
import {
  SettlementsApi,
  type FeeRule,
  type JobRun,
  type Settlement,
  type SettlementDetail,
  type SettlementStatus,
} from './settlements.api';

type Pill = 'All' | SettlementStatus | 'DUE';
type SortKey = 'id' | 'inst' | 'txns' | 'gross' | 'fee' | 'net' | 'status';
const PILLS: readonly Pill[] = ['All', 'PENDING', 'APPROVAL_STAGE_1', 'APPROVED', 'DUE', 'FAILED'];
const COLUMNS: readonly {
  k: SortKey | 's1' | 'fin' | 'a';
  l: string;
  r?: boolean;
  sort: boolean;
}[] = [
  { k: 'id', l: 'Settlement', sort: true },
  { k: 'inst', l: 'Institution', sort: true },
  { k: 'txns', l: 'Txns', r: true, sort: true },
  { k: 'gross', l: 'Gross', r: true, sort: true },
  { k: 'fee', l: 'Platform fee', r: true, sort: true },
  { k: 'net', l: 'Settlement amount', r: true, sort: true },
  { k: 'status', l: 'Status', sort: true },
  { k: 's1', l: 'Stage 1', sort: false },
  { k: 'fin', l: 'Final', sort: false },
  { k: 'a', l: '', sort: false },
];
const PAGE = 12;
/** The prototype's default range: the last fortnight. */
const RANGE_DAYS = 13;
const RUN_STATUS: Readonly<Record<JobRun['status'], { l: string; tone: string }>> = {
  STARTED: { l: 'Running', tone: 'info' },
  SUCCESS: { l: 'Completed', tone: 'ok' },
  PARTIAL_FAILURE: { l: 'Partially completed', tone: 'warn' },
  FAILED: { l: 'Failed', tone: 'bad' },
};
/** The fee rule's worked examples (prototype o.settlements): amount in paise and the label. */
const EXAMPLES: readonly [number, string][] = [
  [6000, 'canteen payment'],
  [10000, 'payment'],
  [25000, 'book depot'],
];

/**
 * o.settlements — Settlement approvals (SRS 14; STL-001…008; prototype o.settlements): every
 * institution's nightly settlement with the key figures, the operator's part in the two-stage
 * control, the queue filtered by date, institution and status, the run log of the 23:30 job and the
 * platform fee rule. A row opens the settlement (SettlementDrawer); stage 1, final approval and
 * rejection are confirmed with remarks here, the payout UTR in PayoutForm.
 */
@Component({
  selector: 'rp-backoffice-settlements',
  imports: [Card, Empty, Icon, Kpi, Pager, PayoutForm, ProcessOverlay, SettlementDrawer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <div class="c-ph">
        <div class="c-pt">
          <h1>Settlement approvals</h1>
          <p>
            Every institution’s nightly settlement: stage-1 approval by a maker, final approval by a
            different checker, then the bank’s payout reference.
          </p>
        </div>
      </div>

      @if (error()) {
        <div class="card pad">
          <rp-empty icon="alertc" title="Couldn't load the settlements" [text]="error()">
            <button type="button" class="btn btn-sec btn-sm" (click)="reload()">
              <span>Try again</span>
            </button>
          </rp-empty>
        </div>
      } @else if (loading() && !loaded()) {
        <div class="stack g16" aria-busy="true" aria-label="Loading">
          <div class="c-grid k4">
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="sk" style="height: 104px; border-radius: 16px"></div>
            }
          </div>
          <div class="sk" style="height: 44px; border-radius: 12px"></div>
          <div class="stack g8">
            @for (i of [1, 2, 3, 4, 5, 6, 7]; track i) {
              <div class="sk" style="height: 40px; border-radius: 8px"></div>
            }
          </div>
        </div>
      } @else {
        <div class="c-grid k4">
          <rp-kpi
            label="Awaiting stage 1"
            [value]="num(pending().length)"
            icon="approve"
            [tone]="pending().length && can('settle.stage1') ? 'accent' : null"
            [delta]="total(pending())"
          />
          <rp-kpi
            label="Awaiting final approval"
            [value]="num(stage1().length)"
            icon="checkc"
            [tone]="stage1().length && can('settle.final') ? 'accent' : null"
            [delta]="total(stage1())"
          />
          <rp-kpi
            label="Payout reference to record"
            [value]="num(due().length)"
            icon="bank"
            [delta]="total(due())"
          />
          <rp-kpi
            [label]="label('FAILED') + ' in range'"
            [value]="num(rejected().length)"
            icon="xc"
            [tone]="rejected().length ? 'bad' : null"
            delta="Collected again by the next run"
          />
        </div>

        <div class="note tone-info">
          <rp-icon name="shieldck" [size]="17" />
          <div class="grow">
            @switch (part()) {
              @case ('maker') {
                You give <b>stage-1 approval</b> with remarks. Final approval, rejection and payout
                references need a Settlement Checker — always a different person.
              }
              @case ('checker') {
                You give <b>final approval</b>, reject Pending or Stage-1 approved settlements, and
                record payout references. You can’t give final approval to a settlement you approved
                at stage 1, and nobody who approved a stage may reject it.
              }
              @default {
                You can read settlements and download statements. Approvals need the Settlement
                Maker or Settlement Checker role.
              }
            }
          </div>
        </div>

        <div class="c-filters">
          <label class="search"
            ><rp-icon name="search" [size]="16" /><input
              type="search"
              id="ob-stq"
              placeholder="Settlement id or institution"
              aria-label="Settlement id or institution"
              autocomplete="off"
              [value]="q()"
              (input)="q.set(value($event)); page.set(1)"
          /></label>
          <div class="fld">
            <div class="fld-in">
              <select
                id="ob-sti"
                aria-label="Institution"
                (change)="inst.set(value($event)); page.set(1)"
              >
                <option value="">All institutions</option>
                @for (i of institutions(); track i.id) {
                  <option [value]="i.id" [selected]="inst() === i.id">{{ i.name }}</option>
                }
              </select>
            </div>
          </div>
          <div class="ob-drange">
            <div class="fld">
              <div class="fld-in">
                <input
                  id="ob-stf"
                  type="date"
                  aria-label="From"
                  [max]="today"
                  [value]="from()"
                  (change)="setRange('from', $event)"
                />
              </div>
            </div>
            <span class="t-muted">to</span>
            <div class="fld">
              <div class="fld-in">
                <input
                  id="ob-stt"
                  type="date"
                  aria-label="To"
                  [max]="today"
                  [value]="to()"
                  (change)="setRange('to', $event)"
                />
              </div>
            </div>
          </div>
          <span class="fsum">{{ plural(rows().length, 'settlement') }} · {{ total(rows()) }}</span>
        </div>
        <div class="pills" role="group" aria-label="Status">
          @for (p of pills; track p) {
            <button
              type="button"
              class="pill"
              [class.on]="pill() === p"
              [attr.aria-pressed]="pill() === p"
              (click)="pill.set(p); page.set(1)"
            >
              {{ pillLabel(p) }}<span class="n">{{ pillCount(p) }}</span>
            </button>
          }
        </div>
        @if (from() > to()) {
          <div class="note tone-bad">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">The start date is after the end date — nothing can match.</div>
          </div>
        }

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
                  >
                    @if (c.sort) {
                      <button type="button" class="cp-th" (click)="sortBy(c.k)">
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
              @for (x of shown(); track x.id) {
                <tr tabindex="0" (click)="open(x.id)" (keydown.enter)="open(x.id)">
                  <td>
                    <div class="stack g4" style="gap: 1px">
                      <span class="cell-t"
                        ><span class="t-mono">{{ x.settlementNo }}</span></span
                      >
                      <span class="cell-s">{{ date(x.date) }}</span>
                    </div>
                  </td>
                  <td>
                    <div class="stack g4" style="gap: 1px">
                      <span class="cell-t"
                        ><span
                          class="t-clip"
                          style="max-width: 200px; display: inline-block; vertical-align: bottom"
                          >{{ x.institution.name }}</span
                        ></span
                      >
                      <span class="cell-s t-mono">{{ x.institution.identifier }}</span>
                    </div>
                  </td>
                  <td class="r">{{ num(x.lines) }}</td>
                  <td class="r">{{ money(x.gross) }}</td>
                  <td class="r">
                    <span class="t-muted">{{ money(x.fee) }}</span>
                  </td>
                  <td class="r">
                    <b class="t-num">{{ money(x.net) }}</b>
                  </td>
                  <td>
                    <div class="stack" style="gap: 2px; align-items: flex-start">
                      <span [class]="'chip dot tone-' + tone(x.status)">{{ label(x.status) }}</span>
                      @if (isDue(x)) {
                        <span class="cell-s">payout reference due</span>
                      } @else if (x.payout) {
                        <span class="cell-s t-mono">{{ x.payout.utr }}</span>
                      }
                    </div>
                  </td>
                  <td>
                    @if (x.stage1; as d) {
                      <div class="stack g4" style="gap: 1px">
                        <span class="cell-t">{{ d.by }}</span
                        ><span class="cell-s">{{ dt(d.at) }}</span>
                      </div>
                    } @else {
                      <span class="t-muted">—</span>
                    }
                  </td>
                  <td>
                    @if (x.final; as d) {
                      <div class="stack g4" style="gap: 1px">
                        <span class="cell-t">{{ d.by }}</span
                        ><span class="cell-s">{{ dt(d.at) }}</span>
                      </div>
                    } @else if (x.rejection; as d) {
                      <div class="stack g4" style="gap: 1px">
                        <span class="cell-t"><span class="t-bad">Rejected</span> · {{ d.by }}</span
                        ><span class="cell-s">{{ dt(d.at) }}</span>
                      </div>
                    } @else {
                      <span class="t-muted">—</span>
                    }
                  </td>
                  <td>
                    <div class="row-acts">
                      @switch (rowAction(x)) {
                        @case ('stage1') {
                          <button
                            type="button"
                            class="btn btn-soft btn-xs"
                            (click)="$event.stopPropagation(); run('stage1', x)"
                          >
                            <span>Approve stage 1</span>
                          </button>
                        }
                        @case ('final') {
                          <button
                            type="button"
                            class="btn btn-soft btn-xs"
                            (click)="$event.stopPropagation(); run('final', x)"
                          >
                            <span>Final approval</span>
                          </button>
                        }
                        @case ('payout') {
                          <button
                            type="button"
                            class="btn btn-soft btn-xs"
                            (click)="$event.stopPropagation(); run('payout', x)"
                          >
                            <span>Record payout</span>
                          </button>
                        }
                        @default {
                          <button
                            type="button"
                            class="btn btn-ghost btn-xs"
                            (click)="$event.stopPropagation(); open(x.id)"
                          >
                            <span>View</span>
                          </button>
                        }
                      }
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td [attr.colspan]="columns.length">
                    <rp-empty
                      icon="bank"
                      title="No settlements match"
                      text="Widen the date range or clear the institution and status filters."
                    />
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (filtered().length > page_size) {
          <rp-pager
            [total]="filtered().length"
            [page]="page()"
            [size]="page_size"
            (go)="page.set($event)"
          />
        } @else if (filtered().length) {
          <div class="pager">
            <span>{{ plural(filtered().length, 'settlement') }}</span>
          </div>
        }

        <div class="c-grid s21">
          <rp-card [title]="runTitle()" icon="timer" [plainIcon]="true">
            @if (!can('jobs.view')) {
              <rp-empty
                icon="lock"
                title="Run log not available to your role"
                [text]="'Your role doesn’t hold “View runs and run logs”. Ask a Platform Administrator to grant it in Roles & tasks.'"
              />
            } @else if (runs().length) {
              <div class="tbl-wrap">
                <table class="tbl">
                  <thead>
                    <tr>
                      <th>Window ending</th>
                      <th>Ran</th>
                      <th class="r">Settled</th>
                      <th class="r">Skipped</th>
                      <th class="r">Failed</th>
                      <th class="r">Settlement amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of runs(); track r.id) {
                      <tr tabindex="0" (click)="toJobs()" (keydown.enter)="toJobs()">
                        <td class="ob-nw">{{ date(r.period) }}</td>
                        <td>
                          {{ hm(r.startedAt) }}–{{ r.endedAt ? hm(r.endedAt) : '…' }}
                          @if (r.trigger === 'MANUAL') {
                            <span class="chip tone-info">Manual</span>
                          }
                        </td>
                        <td class="r">{{ r.processed }}</td>
                        <td class="r">
                          <span title="Institutions not active">{{ r.skipped }}</span>
                        </td>
                        <td class="r">
                          @if (r.failed) {
                            <b class="t-bad">{{ r.failed }}</b>
                          } @else {
                            0
                          }
                        </td>
                        <td class="r">{{ runAmount(r) }}</td>
                        <td>
                          <span [class]="'chip dot tone-' + runStatus(r).tone">{{
                            runStatus(r).l
                          }}</span>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <div class="pager">
                <span>{{ plural(runs().length, 'run') }}</span>
              </div>
            } @else {
              <rp-empty
                icon="timer"
                title="No runs yet"
                text="The settlement run creates each institution's settlement every night at 23:30."
              />
            }
          </rp-card>
          <rp-card title="Platform fee rule" icon="percent" [plainIcon]="true">
            @if (rule(); as f) {
              <p class="t-sm">
                For each <b>successful</b> transaction: <b>{{ money(f.flatFee) }}</b> when the
                amount is
                {{
                  f.boundary === 'EXCLUSIVE'
                    ? 'below ' + money(f.thresholdAmount)
                    : money(f.thresholdAmount) + ' or less'
                }}, otherwise <b>{{ percent(f.percent) }}%</b> (configurable). The settlement amount
                is the sum of the net of successful transactions only.
                @if (!f.chargeTuition) {
                  Tuition paid to the fee account is not charged.
                }
                @if (overrides().length) {
                  {{ overrides().join(', ') }} {{ overrides().length === 1 ? 'has' : 'have' }} a
                  rule of {{ overrides().length === 1 ? 'its' : 'their' }} own (Plans &amp;
                  billing).
                }
              </p>
              <div class="mt12">
                <dl class="kv">
                  @for (e of examples(); track e.l) {
                    <dt>{{ e.l }}</dt>
                    <dd>{{ e.v }}</dd>
                  }
                </dl>
              </div>
            } @else {
              <p class="t-sm">
                For each <b>successful</b> transaction: a flat fee when the amount is at or below a
                threshold, otherwise a percentage (configurable). The settlement amount is the sum
                of the net of successful transactions only.
              </p>
              <p class="t-xs t-muted mt8">
                The current amounts are shown to roles that hold “Create and edit plans”.
              </p>
            }
          </rp-card>
        </div>
      }
    </div>

    @if (openId(); as id) {
      <rp-stl-drawer
        [id]="id"
        [rev]="rev()"
        [me]="me()"
        (closed)="openId.set(null)"
        (loaded)="replace($event)"
        (act)="run($event.kind, $event.s)"
      />
    }
    @if (paying(); as p) {
      <rp-stl-payout
        [settlement]="p"
        (closed)="paying.set(null)"
        (saved)="paid($event)"
        (stale)="paying.set(null); refresh(p.id)"
      />
    }
    <rp-ob-process [state]="process()" />
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
export class BackofficeSettlements {
  private readonly api = inject(SettlementsApi);
  private readonly overlays = inject(Overlays);
  private readonly router = inject(Router);
  private readonly session = inject(SessionContext).ops;

  protected readonly columns = COLUMNS;
  protected readonly pills = PILLS;
  protected readonly page_size = PAGE;
  protected readonly today = istBusinessDate();

  /** The settlements dated in the range (the table), and the open queues (the key figures). */
  protected readonly inRange = signal<readonly Settlement[]>([]);
  protected readonly pending = signal<readonly Settlement[]>([]);
  protected readonly stage1 = signal<readonly Settlement[]>([]);
  private readonly approved = signal<readonly Settlement[]>([]);
  protected readonly runs = signal<readonly JobRun[]>([]);
  protected readonly rule = signal<FeeRule | null>(null);
  /** Plans with a fee rule of their own (STL-009). */
  protected readonly overrides = signal<readonly string[]>([]);
  protected readonly loading = signal(true);
  protected readonly loaded = signal(false);
  protected readonly error = signal('');

  protected readonly q = signal('');
  protected readonly inst = signal('');
  protected readonly from = signal(addDays(this.today, -RANGE_DAYS));
  protected readonly to = signal(this.today);
  protected readonly pill = signal<Pill>('All');
  protected readonly sort = signal<{ k: SortKey; dir: 'asc' | 'desc' } | null>(null);
  protected readonly page = signal(1);

  protected readonly openId = signal<string | null>(null);
  protected readonly rev = signal(0);
  protected readonly paying = signal<SettlementDetail | null>(null);
  protected readonly process = signal<ProcessState | null>(null);
  private busy = false;
  private seq = 0;

  protected readonly me = computed(() => {
    const s = this.session();
    return {
      name: titleCase(s?.name ?? ''),
      role: s?.role.name ?? '',
      subTasks: s?.subTasks ?? [],
    };
  });
  protected readonly part = computed(() =>
    this.can('settle.final') || this.can('settle.payout') || this.can('settle.reject')
      ? 'checker'
      : this.can('settle.stage1')
        ? 'maker'
        : 'reader',
  );
  protected readonly due = computed(() => this.approved().filter(payoutDue));
  protected readonly rejected = computed(() => this.inRange().filter((x) => x.status === 'FAILED'));
  /** Every settlement read, by id (the run log's amounts, the institution list). */
  private readonly known = computed(() => {
    const m = new Map<string, Settlement>();
    for (const list of [this.inRange(), this.pending(), this.stage1(), this.approved()]) {
      for (const x of list) m.set(x.id, x);
    }
    return m;
  });
  protected readonly institutions = computed(() => {
    const m = new Map<string, string>();
    for (const x of this.known().values()) m.set(x.institution.id, x.institution.name);
    return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  });
  /** The range list narrowed by the search and the institution (the pills count these). */
  private readonly scoped = computed(() => {
    const q = this.q().trim().toLowerCase();
    const inst = this.inst();
    if (this.from() > this.to()) return [];
    return this.inRange().filter(
      (x) =>
        (!inst || x.institution.id === inst) &&
        (!q ||
          x.settlementNo.toLowerCase().includes(q) ||
          x.institution.name.toLowerCase().includes(q) ||
          x.institution.identifier.toLowerCase().includes(q)),
    );
  });
  protected readonly rows = computed(() => {
    const p = this.pill();
    return this.scoped().filter((x) =>
      p === 'All' ? true : p === 'DUE' ? payoutDue(x) : x.status === p,
    );
  });
  protected readonly filtered = computed(() => {
    const list = [...this.rows()];
    const s = this.sort();
    if (!s) return list;
    const get = (x: Settlement): string | number =>
      s.k === 'id'
        ? `${x.date} ${x.settlementNo}`
        : s.k === 'inst'
          ? x.institution.name
          : s.k === 'txns'
            ? x.lines
            : s.k === 'gross'
              ? paiseOf(x.gross)
              : s.k === 'fee'
                ? paiseOf(x.fee)
                : s.k === 'net'
                  ? paiseOf(x.net)
                  : statusLabel(x.status);
    list.sort((a, b) => {
      const x = get(a);
      const y = get(b);
      const r =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y), 'en', { numeric: true });
      return s.dir === 'desc' ? -r : r;
    });
    return list;
  });
  protected readonly shown = computed(() => {
    const pages = Math.max(1, Math.ceil(this.filtered().length / PAGE));
    const p = Math.min(this.page(), pages);
    return this.filtered().slice((p - 1) * PAGE, p * PAGE);
  });
  protected readonly runTitle = computed(() => 'Settlement run log · nightly at 23:30');
  protected readonly examples = computed(() => {
    const f = this.rule();
    if (!f) return [];
    const threshold = paiseOf(f.thresholdAmount);
    const flat = paiseOf(f.flatFee);
    const bp = f.basisPoints ?? Math.round(Number(f.percent) * 100);
    const fee = (a: number) =>
      Math.min(
        a,
        (f.boundary === 'EXCLUSIVE' ? a < threshold : a <= threshold)
          ? flat
          : Math.floor((a * bp + 5_000) / 10_000),
      );
    return [
      ...EXAMPLES.map(([a, what]) => ({
        l: `${inrPaise(a)} ${what}`,
        v: `fee ${inrPaise(fee(a))} · net ${inrPaise(a - fee(a))}`,
      })),
      { l: `${inrPaise(12000)} failed payment`, v: 'no fee · not settled' },
    ];
  });

  constructor() {
    const route = inject(ActivatedRoute);
    const p = route.snapshot.queryParamMap;
    const status = p.get('status');
    if (status && (PILLS as readonly string[]).includes(status)) this.pill.set(status as Pill);
    const open = p.get('open');
    if (open) this.openId.set(open);
    void this.reload();
    void this.loadSide();
  }

  protected can(sub: string) {
    return this.session()?.subTasks.includes(sub) ?? false;
  }

  /** STL-001: the range, and the open queues across every date. */
  protected async reload() {
    const n = ++this.seq;
    this.loading.set(true);
    try {
      const [range, pending, stage1, approved] = await Promise.all([
        this.from() > this.to()
          ? Promise.resolve([])
          : this.api.all({ from: this.from(), to: this.to() }),
        this.api.all({ status: 'PENDING' }),
        this.api.all({ status: 'APPROVAL_STAGE_1' }),
        this.api.all({ status: 'APPROVED' }),
      ]);
      if (n !== this.seq) return;
      this.inRange.set(range);
      this.pending.set(pending);
      this.stage1.set(stage1);
      this.approved.set(approved);
      this.error.set('');
      this.loaded.set(true);
    } catch (e) {
      if (n === this.seq) {
        this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
      }
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
  }

  /** The run log (jobs.view) and the fee rule (plans.edit): shown when the role may read them. */
  private async loadSide() {
    if (this.can('jobs.view')) {
      this.api
        .runs()
        .then((r) => this.runs.set(r.items.slice(0, 7)))
        .catch(() => this.runs.set([]));
    }
    if (this.can('plans.edit')) {
      this.api
        .feeRules()
        .then((r) => {
          this.rule.set(r.default);
          this.overrides.set((r.plans ?? []).filter((x) => x.override).map((x) => x.name));
        })
        .catch(() => this.rule.set(null));
    }
  }

  // --- filters and table -----------------------------------------------------------------------------
  protected setRange(k: 'from' | 'to', e: Event) {
    const v = (e.target as HTMLInputElement).value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
    (k === 'from' ? this.from : this.to).set(v);
    this.page.set(1);
    void this.reload();
  }
  protected pillLabel(p: Pill) {
    return p === 'All' ? 'All' : p === 'DUE' ? 'Payout due' : statusLabel(p);
  }
  protected pillCount(p: Pill) {
    const list = this.scoped();
    return p === 'All'
      ? list.length
      : p === 'DUE'
        ? list.filter(payoutDue).length
        : list.filter((x) => x.status === p).length;
  }
  protected sortBy(k: string) {
    const c = COLUMNS.find((x) => x.k === k);
    if (!c?.sort) return;
    const s = this.sort();
    this.sort.set({ k: k as SortKey, dir: s?.k === k && s.dir === 'asc' ? 'desc' : 'asc' });
  }
  protected ariaSort(k: string) {
    const c = COLUMNS.find((x) => x.k === k);
    if (!c?.sort) return null;
    const s = this.sort();
    return s?.k === k ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  }
  protected rowAction(x: Settlement): SettlementAction | 'view' {
    const p = permsOf(x, this.me());
    return p.stage1.ok ? 'stage1' : p.final.ok ? 'final' : p.payout.ok ? 'payout' : 'view';
  }
  protected open(id: string) {
    this.openId.set(id);
  }
  protected toJobs() {
    if (this.can('task.jobs')) void this.router.navigateByUrl('/backoffice/jobs');
  }

  /** The drawer read a fresher copy: the row follows it. */
  protected replace(d: SettlementDetail) {
    const swap = (list: readonly Settlement[]) => list.map((x) => (x.id === d.id ? d : x));
    this.inRange.set(swap(this.inRange()));
  }

  // --- actions ---------------------------------------------------------------------------------------
  protected async run(kind: SettlementAction, x: Settlement) {
    if (this.busy) return;
    const p = permsOf(x, this.me());
    if (!p[kind].ok) {
      this.overlays.toast(
        {
          stage1: 'Stage-1 approval isn’t available',
          final: 'Final approval isn’t available',
          reject: 'Rejection isn’t available',
          payout: 'Payout reference can’t be recorded',
        }[kind],
        { sub: p[kind].why, tone: 'bad' },
      );
      return;
    }
    if (kind === 'payout') return this.openPayout(x);
    const net = inr(x.net);
    const ok = await this.overlays.confirm(
      kind === 'stage1'
        ? {
            title: `Approve stage 1 of ${x.settlementNo}?`,
            text: `${x.institution.name} · ${formatDate(x.date)} · settlement amount ${net} from ${plural(x.lines, 'transaction')}. A different Settlement Checker gives final approval.`,
            ok: 'Approve stage 1',
            reason: {
              label: 'Remarks (mandatory)',
              placeholder: 'e.g. Counts and gross match the merchant summary',
              min: 3,
              max: 500,
            },
          }
        : kind === 'final'
          ? {
              title: `Give final approval to ${x.settlementNo}?`,
              text: `Stage 1 by ${x.stage1?.by ?? '—'}: “${x.stage1?.remarks ?? ''}”. Approving releases ${net} for payout to ${x.institution.name}’s merchants outside the platform.`,
              ok: 'Give final approval',
              reason: {
                label: 'Remarks (mandatory)',
                placeholder: 'e.g. Approved for payout',
                min: 3,
                max: 500,
              },
            }
          : {
              title: `Reject ${x.settlementNo}?`,
              text: `The settlement becomes ${statusLabel('FAILED')}, which is final. Its transactions are collected again — once — by the next settlement run; investigate the difference in Reconciliation.`,
              ok: 'Reject settlement',
              tone: 'bad',
              reason: {
                label: 'Remarks (mandatory)',
                placeholder: 'e.g. Gateway statement short by ₹2,140 for the juice counter',
                min: 3,
                max: 500,
              },
            },
    );
    if (!ok) return;
    const remarks = ok.reason ?? '';
    this.busy = true;
    try {
      const out =
        kind === 'final'
          ? await runProcess(
              this.process,
              {
                title: 'Final approval',
                icon: 'approve',
                sub: 'Two-stage settlement control',
                steps: [
                  `Stage 1 given by ${x.stage1?.by ?? '—'}`,
                  `You (${this.me().name}) are a different person`,
                  'Remarks recorded',
                  'Status set to Approved',
                ],
              },
              () => this.api.decide(x, 'final', remarks),
              (e) => (e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE')),
            )
          : await this.api.decide(x, kind, remarks);
      this.overlays.toast(
        kind === 'stage1'
          ? `${out.settlementNo} · stage 1 approved`
          : kind === 'final'
            ? `${out.settlementNo} approved`
            : `${out.settlementNo} rejected`,
        {
          sub:
            kind === 'stage1'
              ? 'Waiting for a Settlement Checker’s final approval'
              : kind === 'final'
                ? 'Record the bank’s UTR once paid'
                : 'Its transactions go to the next run once · investigate in Reconciliation',
        },
      );
      this.after(out.id);
    } catch (e) {
      this.overlays.toast(kind === 'reject' ? 'Not rejected' : 'Not approved', {
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
      if (e instanceof ApiProblem && [404, 409, 412, 428].includes(e.status)) this.after(x.id);
    } finally {
      this.busy = false;
    }
  }

  /** The payout form needs what is payable now (the detail). */
  private async openPayout(x: Settlement) {
    try {
      this.paying.set(await this.api.detail(x.id));
    } catch (e) {
      this.overlays.toast('Payout reference can’t be recorded', {
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
    }
  }

  protected paid(d: SettlementDetail) {
    this.paying.set(null);
    this.overlays.toast(`Payout recorded for ${d.settlementNo}`, {
      sub: `UTR ${d.payout?.utr ?? ''} · ${inr(d.payout?.amount)}`,
    });
    this.after(d.id);
  }

  protected refresh(id: string) {
    this.after(id);
  }

  /** After an action: the lists again, and the settlement opened (or read again). */
  private after(id: string) {
    void this.reload();
    if (this.openId() === id) this.rev.update((v) => v + 1);
    else this.openId.set(id);
  }

  // --- formatting ------------------------------------------------------------------------------------
  protected runAmount(r: JobRun) {
    const list = [...this.known().values()].filter(
      (x) => x.date === r.period && x.status !== 'FAILED',
    );
    return inrPaise(sumOf(list, (x) => x.net));
  }
  protected runStatus(r: JobRun) {
    return RUN_STATUS[r.status];
  }
  protected total(list: readonly Settlement[]) {
    return inrPaise(sumOf(list, (x) => x.net));
  }
  protected isDue(x: Settlement) {
    return payoutDue(x);
  }
  protected label(s: SettlementStatus) {
    return statusLabel(s);
  }
  protected tone(s: SettlementStatus) {
    return STATUS_TONE[s];
  }
  protected money(m: { amount: string }) {
    return inr(m);
  }
  protected percent(p: string) {
    return p.replace(/\.?0+$/, '') || '0';
  }
  protected num(n: number) {
    return n.toLocaleString('en-IN');
  }
  protected plural(n: number, w: string) {
    return plural(n, w);
  }
  protected date(v: string) {
    return formatDate(v);
  }
  protected dt(v: string | null) {
    return v ? formatDateTime(v) : '';
  }
  protected hm(v: string) {
    return hm24(v);
  }
  protected value(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
}
