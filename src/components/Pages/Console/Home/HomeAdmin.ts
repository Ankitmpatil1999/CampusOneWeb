import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  type OnInit,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SessionContext } from '../../../../Context/SessionContext';
import { Avatar } from '../../../Shared/Avatar';
import { Card, Empty, Kpi } from '../../../Shared/Blocks';
import { HBars, type HBarItem } from '../../../Shared/Charts';
import { Icon } from '../../../Shared/Icon';
import { ago } from '../../../Utils/dates';
import { formatInr, formatTime } from '../../../Utils/format';
import { person } from '../Applications/app-format';
import { plural } from '../Fees/fee-format';
import { HEALTH, healthOf } from '../Readers/reader-format';
import { SETTLEMENT_STATUS } from '../Settlements/settlement-format';
import { dshort, num } from '../Structure/academic-format';
import {
  HomeApi,
  type AnnouncementItem,
  type ApprovalItem,
  type HomeView,
  type InvoiceItem,
  type JobRun,
  type ReaderItem,
  type SettlementItem,
  type TicketItem,
} from './home.api';
import { channelsText, groupsText, inr0, inrK, paise, pct } from './home-format';
import {
  HomeAlerts,
  HomeCollections,
  HomeQuickActions,
  type Alert,
  type QuickAction,
} from './HomeParts';

interface FeedItem {
  readonly at: string;
  readonly by: string;
  readonly text: string;
  readonly sub: string;
}

interface Job {
  readonly t: string;
  readonly at: string;
  readonly ok: boolean;
  readonly s: string;
}

type Items<T> = { readonly items: readonly T[] };

/** A card's list: undefined while loading, null when the role can't read it or it failed. */
async function fetchInto<T>(
  slot: { set(v: T | null | undefined): void },
  allowed: boolean,
  p: () => Promise<T>,
) {
  if (!allowed) {
    slot.set(null);
    return;
  }
  try {
    slot.set(await p());
  } catch {
    slot.set(null);
  }
}

const SETTLE_BAD = new Set(['FAILED', 'REJECTED']);

/**
 * The administrator's home (prototype HOME.admin): members, today's collections, attendance and
 * approvals; collections of the last ten days and the payment modes; recent activity, alerts,
 * last night's jobs and quick actions.
 */
@Component({
  selector: 'rp-home-admin',
  imports: [
    Avatar,
    Card,
    Empty,
    HomeAlerts,
    HomeCollections,
    HomeQuickActions,
    Icon,
    Kpi,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @let k = view().kpis;
    <div class="c-grid k4" id="home-kpis">
      <rp-kpi
        label="Active members"
        icon="users"
        link="/console/members"
        [value]="num(k.members?.active ?? 0)"
        [delta]="
          (k.members?.inactive ?? 0) + ' inactive · ' + (k.members?.suspended ?? 0) + ' suspended'
        "
      />
      <rp-kpi
        label="Today's collections"
        icon="wallet"
        tone="ok"
        link="/console/recon"
        [value]="inr0(collected())"
        [delta]="plural(k.collectionsToday?.count ?? 0, 'payment') + ' · by ' + now"
        [dir]="k.collectionsToday?.count ? 'up' : null"
      />
      <rp-kpi
        label="Attendance today"
        icon="calcheck"
        tone="info"
        link="/console/attendance"
        [value]="attPct()"
        [delta]="attText()"
      />
      <rp-kpi
        label="Pending approvals"
        icon="approve"
        tone="accent"
        link="/console/approvals"
        [value]="num(k.pendingApprovals ?? 0)"
        [delta]="approvalsText()"
      />
    </div>

    @if (can('task.recon')) {
      <div class="c-grid s21">
        <rp-home-collections [today]="view().date" [modes]="true" />
      </div>
    }

    <div class="c-grid s21">
      <rp-card title="Recent activity" icon="activity">
        @if (can('task.approvals')) {
          <a card-right class="linkbtn" routerLink="/console/approvals"
            >Approvals<rp-icon name="right" [size]="14"
          /></a>
        }
        @if (feed() === undefined) {
          <div class="sk" style="height: 260px; border-radius: 12px" aria-busy="true"></div>
        } @else if (feed()?.length) {
          <div class="cp-feed" id="home-feed">
            @for (x of feed(); track $index) {
              <div class="cp-fi">
                <rp-av [name]="x.by" size="sm" />
                <div class="grow">
                  <div class="t-sm">
                    <b>{{ x.by }}</b> {{ x.text }}
                  </div>
                  @if (x.sub) {
                    <div class="t-xs t-muted t-clip">{{ x.sub }}</div>
                  }
                </div>
                <span class="t-xs t-faint nogrow">{{ ago(x.at) }}</span>
              </div>
            }
          </div>
        } @else {
          <rp-empty
            icon="activity"
            title="No recent activity"
            text="Changes made on the console appear here."
          />
        }
      </rp-card>
      <div class="stack g16">
        <rp-card title="Needs attention" icon="alert">
          @if (alerts().length) {
            <span card-right class="chip" [class]="'chip tone-' + alertTone()">{{
              alerts().length
            }}</span>
          }
          <rp-home-alerts [items]="alerts()" />
        </rp-card>
        @if (jobs(); as js) {
          <rp-card title="Last night's jobs" icon="timer">
            @if (js.length) {
              <div class="cp-jobs" id="home-jobs">
                @for (j of js; track j.t) {
                  <div class="cp-job">
                    <span class="cp-jd" [class.ok]="j.ok" [class.warn]="!j.ok"></span>
                    <div class="grow">
                      <b class="t-sm">{{ j.t }}</b>
                      <span class="t-xs t-faint t-mono"> {{ j.at }}</span>
                      <div class="t-xs t-muted">{{ j.s }}</div>
                    </div>
                  </div>
                }
              </div>
            } @else {
              <rp-empty icon="timer" title="No job runs yet" text="Scheduled jobs report here." />
            }
          </rp-card>
        }
        @if (actions().length) {
          <rp-card title="Quick actions" icon="zap">
            <rp-home-qa [items]="actions()" />
          </rp-card>
        }
      </div>
    </div>
  `,
})
export class HomeAdmin implements OnInit {
  private readonly api = inject(HomeApi);
  private readonly session = inject(SessionContext).console;
  readonly view = input.required<HomeView>();

  protected readonly num = num;
  protected readonly inr0 = inr0;
  protected readonly plural = plural;
  protected readonly ago = (iso: string) => ago(iso);
  protected readonly now = formatTime(new Date());

  private readonly approvals = signal<Items<ApprovalItem> | null | undefined>(undefined);
  private readonly tickets = signal<Items<TicketItem> | null | undefined>(undefined);
  private readonly announcements = signal<Items<AnnouncementItem> | null | undefined>(undefined);
  private readonly settlements = signal<Items<SettlementItem> | null | undefined>(undefined);
  private readonly readers = signal<Items<ReaderItem> | null | undefined>(undefined);
  private readonly invoices = signal<readonly InvoiceItem[] | null | undefined>(undefined);
  private readonly runs = signal<Items<JobRun> | null | undefined>(undefined);

  protected readonly collected = computed(() => paise(this.view().kpis.collectionsToday?.amount));
  protected readonly attPct = computed(() => {
    const a = this.view().kpis.attendanceToday;
    return a?.percentage === null || !a ? '—' : pct(a.percentage, 1);
  });
  protected readonly attText = computed(() => {
    const a = this.view().kpis.attendanceToday;
    if (!a) return '';
    return `${num(a.attended)} of ${plural(a.students, 'student')} · ${num(a.absent)} absent`;
  });
  /** "2 for grievances · 1 for fees" from the pending requests by area. */
  protected readonly approvalsText = computed(() => {
    const list = this.approvals()?.items.filter((a) => a.status === 'PENDING') ?? [];
    if (!list.length) return this.view().kpis.pendingApprovals ? 'Waiting for a decision' : '';
    const by = new Map<string, number>();
    for (const a of list) by.set(a.area, (by.get(a.area) ?? 0) + 1);
    return [...by]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([area, n]) => `${n} for ${area.toLowerCase()}`)
      .join(' · ');
  });

  /** Approvals raised, tickets of the last week and announcements, newest first. */
  protected readonly feed = computed<readonly FeedItem[] | undefined>(() => {
    const a = this.approvals();
    const t = this.tickets();
    const n = this.announcements();
    if (a === undefined || t === undefined || n === undefined) return undefined;
    const week = Date.now() - 6 * 86_400_000;
    const out: FeedItem[] = [
      ...(a?.items ?? []).map((x) => ({
        at: x.raisedAt,
        by: person(x.maker?.name) || 'System',
        text: `raised “${x.action}” for approval`,
        sub: x.summary,
      })),
      ...(t?.items ?? [])
        .filter((x) => new Date(x.createdAt).getTime() >= week)
        .map((x) => ({
          at: x.createdAt,
          by: person(x.member?.name) || 'A member',
          text: `raised ticket ${x.ticketNo}`,
          sub: x.issue,
        })),
      ...(n?.items ?? [])
        .filter((x) => !x.withdrawn)
        .slice(0, 4)
        .map((x) => ({
          at: x.createdAt,
          by: person(x.author) || 'The institution',
          text: `announced “${x.title}”`,
          sub: `${groupsText(x.targets.groups)} · ${channelsText(x.channels)}`,
        })),
    ];
    return out
      .filter((x) => new Date(x.at).getTime() <= Date.now())
      .sort((x, y) => y.at.localeCompare(x.at))
      .slice(0, 11);
  });

  protected readonly alerts = computed<Alert[]>(() => {
    const out: Alert[] = [];
    for (const s of this.settlements()?.items ?? []) {
      if (!SETTLE_BAD.has(s.status)) continue;
      out.push({
        tone: 'bad',
        icon: 'bank',
        title: `Settlement ${s.settlementNo} (${dshort(s.date)}) failed`,
        sub: s.final?.remarks || 'Investigate with reconciliation',
        path: '/console/settlements',
      });
    }
    const susp = this.view().kpis.members?.suspended ?? 0;
    if (susp)
      out.push({
        tone: 'bad',
        icon: 'userx',
        title: `${plural(susp, 'member')} suspended`,
        sub: 'Access withheld pending a decision — wallets hold incoming money',
        path: '/console/members',
      });
    const off = (this.readers()?.items ?? []).filter((r) => healthOf(r) === 'OFFLINE');
    if (off.length > 2)
      out.push({
        tone: 'warn',
        icon: 'wifioff',
        title: `${plural(off.length, 'reader')} are offline`,
        sub: `${off
          .slice(0, 3)
          .map((r) => r.name)
          .join(', ')}${off.length > 3 ? ' and more' : ''}`,
        path: '/console/readers',
      });
    else
      for (const r of off)
        out.push({
          tone: 'warn',
          icon: 'wifioff',
          title: `${r.name} reader is offline`,
          sub: `${r.location} · ${r.lastSeenAt ? `last seen ${ago(r.lastSeenAt)}` : HEALTH.OFFLINE.l()}`,
          path: '/console/readers',
        });
    for (const i of (this.invoices() ?? []).filter((x) => ['DUE', 'OVERDUE'].includes(x.status)))
      out.push({
        tone: i.status === 'OVERDUE' ? 'bad' : 'info',
        icon: 'card',
        title: `Invoice ${i.invoiceNo} is due ${dshort(i.dueOn)}`,
        sub: [formatInr(paise(i.total)), i.period, i.lines[0]?.description]
          .filter(Boolean)
          .join(' · '),
        path: '/console/subscription',
      });
    return out;
  });
  protected readonly alertTone = computed(() =>
    this.alerts().some((a) => a.tone === 'bad') ? 'bad' : 'warn',
  );

  /** The latest run of each job (prototype "Last night's jobs"). */
  protected readonly jobs = computed<readonly Job[] | null | undefined>(() => {
    const r = this.runs();
    if (!r) return r;
    const seen = new Set<string>();
    const out: Job[] = [];
    for (const x of r.items) {
      if (seen.has(x.job.id)) continue;
      seen.add(x.job.id);
      out.push({
        t: x.job.name,
        at: formatTime(x.startedAt),
        ok: x.runStatus === 'SUCCESS' && x.status !== 'FAILED',
        s: x.note || (x.status === 'SKIPPED' ? 'Nothing to do' : 'Completed'),
      });
    }
    return out.slice(0, 6);
  });

  protected readonly actions = computed<QuickAction[]>(() =>
    (
      [
        ['Onboard a member', 'userplus', '/console/onboard', 'task.members'],
        ['Issue an NFC card', 'card', '/console/cards', 'task.cards'],
        ['Register a reader', 'nfc', '/console/readers', 'task.readers'],
        ['Send announcement', 'megaphone', '/console/announcements', 'task.comms'],
        ['Custom fields', 'field', '/console/fields', 'task.config'],
        ['All reports', 'report', '/console/reports', 'task.reports'],
      ] as const
    )
      .filter(([, , , t]) => this.can(t))
      .map(([l, icon, path]) => ({ l, icon, path })),
  );

  ngOnInit() {
    const g = <T>(url: string, params: Record<string, string | number> = {}) =>
      this.api.get<T>(url, params);
    void fetchInto(this.approvals, this.can('task.approvals'), () =>
      g<Items<ApprovalItem>>('approvals', { limit: 10 }),
    );
    void fetchInto(this.tickets, this.can('task.grievances'), () =>
      g<Items<TicketItem>>('tickets', { limit: 10 }),
    );
    void fetchInto(this.announcements, this.can('task.comms'), () =>
      g<Items<AnnouncementItem>>('announcements', { limit: 6 }),
    );
    void fetchInto(this.settlements, this.can('task.settlements'), () =>
      g<Items<SettlementItem>>('settlements', { limit: 10 }),
    );
    void fetchInto(this.readers, this.can('task.readers'), () => g<Items<ReaderItem>>('readers'));
    void fetchInto(this.invoices, this.can('task.config'), () =>
      g<{ invoices: InvoiceItem[] }>('subscription').then((s) => s.invoices),
    );
    void fetchInto(this.runs, true, () => g<Items<JobRun>>('job-runs', { limit: 30 }));
  }

  protected can(task: string) {
    return this.session()?.subTasks.includes(task) ?? false;
  }
}

/**
 * Management's home (prototype HOME.mgt): read-only governance figures — members, this month's
 * collections, the fee collection rate and attendance; collections and members by group; what waits
 * for approval and the latest settlements.
 */
@Component({
  selector: 'rp-home-management',
  imports: [Card, Empty, HBars, HomeCollections, Icon, Kpi, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @let k = view().kpis;
    <div class="note tone-info">
      <rp-icon name="lock" [size]="17" />
      <div class="grow">
        <b>Read-only.</b> Management sees governance views read-only. Decisions on approvals are
        recorded against your name in the approvals queue.
      </div>
    </div>
    <div class="c-grid k4" id="home-kpis">
      <rp-kpi
        label="Active members"
        icon="users"
        link="/console/reports"
        [value]="num(k.members?.active ?? 0)"
      />
      <rp-kpi
        label="Collections this month"
        icon="wallet"
        tone="ok"
        link="/console/recon"
        [value]="inrK(month())"
        [delta]="plural(k.collectionsThisMonth?.count ?? 0, 'payment')"
      />
      <rp-kpi
        label="Fees collected"
        icon="receipt"
        tone="info"
        link="/console/feerecords"
        [value]="
          k.feeCollectionRate === null || k.feeCollectionRate === undefined
            ? '—'
            : pct(k.feeCollectionRate, 1)
        "
        delta="Of fees due so far this year"
      />
      <rp-kpi
        label="Attendance today"
        icon="calcheck"
        link="/console/attendance"
        [value]="attPct()"
        [delta]="num(k.attendanceToday?.absent ?? 0) + ' absent'"
      />
    </div>
    <div class="c-grid s21">
      @if (can('task.recon')) {
        <rp-home-collections
          [today]="view().date"
          [summary]="false"
          linkLabel="Transactions & MIS"
        />
      }
      <rp-card title="Members by group" icon="users">
        @if (groups() === undefined) {
          <div class="sk" style="height: 160px; border-radius: 12px" aria-busy="true"></div>
        } @else if (groups()?.length) {
          <rp-hbars [items]="groups()!" [fmt]="numText" />
        } @else {
          <rp-empty icon="users" title="No members yet" />
        }
      </rp-card>
    </div>
    <div class="c-grid k2">
      @if (can('task.approvals')) {
        <rp-card title="Waiting for approval" icon="approve">
          <a card-right class="linkbtn" routerLink="/console/approvals"
            >Approvals<rp-icon name="right" [size]="14"
          /></a>
          @if (pending() === undefined) {
            <div class="sk" style="height: 200px; border-radius: 12px" aria-busy="true"></div>
          } @else if (pending()?.length) {
            <div class="list plain" id="home-pending">
              @for (a of pending(); track a.id) {
                <button type="button" class="li" (click)="go('/console/approvals')">
                  <span class="li-ic"><rp-icon name="approve" [size]="18" /></span>
                  <span class="li-main"
                    ><span class="li-t">{{ a.action }}</span
                    ><span class="li-s">{{ a.summary }} · by {{ maker(a) }}</span></span
                  >
                  <span class="li-r"
                    ><span class="t-xs t-muted">{{ ago(a.raisedAt) }}</span></span
                  >
                </button>
              }
            </div>
          } @else {
            <rp-empty icon="checkc" title="Nothing waiting" />
          }
        </rp-card>
      }
      @if (can('task.settlements')) {
        <rp-card title="Settlements" icon="bank">
          <a card-right class="linkbtn" routerLink="/console/settlements"
            >Settlements<rp-icon name="right" [size]="14"
          /></a>
          @if (settlements() === undefined) {
            <div class="sk" style="height: 200px; border-radius: 12px" aria-busy="true"></div>
          } @else if (settlements()?.length) {
            <div class="list plain" id="home-settlements">
              @for (s of settlements(); track s.id) {
                <button type="button" class="li" (click)="go('/console/settlements')">
                  <span class="li-ic"><rp-icon name="bank" [size]="18" /></span>
                  <span class="li-main"
                    ><span class="li-t">{{ s.settlementNo }} · {{ dshort(s.date) }}</span
                    ><span class="li-s"
                      >{{ plural(s.lines, 'line') }} · net {{ money(s.net) }}</span
                    ></span
                  >
                  <span class="li-r"
                    ><span class="chip dot" [class]="'chip dot tone-' + stTone(s.status)">{{
                      stLabel(s.status)
                    }}</span></span
                  >
                </button>
              }
            </div>
          } @else {
            <rp-empty icon="bank" title="No settlements yet" />
          }
        </rp-card>
      }
    </div>
  `,
})
export class HomeManagement implements OnInit {
  private readonly api = inject(HomeApi);
  private readonly router = inject(Router);
  private readonly session = inject(SessionContext).console;
  readonly view = input.required<HomeView>();

  protected readonly num = num;
  protected readonly pct = pct;
  protected readonly inrK = inrK;
  protected readonly plural = plural;
  protected readonly dshort = dshort;
  protected readonly numText = (v: number) => num(v);
  protected readonly ago = (iso: string) => ago(iso);

  private readonly approvals = signal<Items<ApprovalItem> | null | undefined>(undefined);
  private readonly settled = signal<Items<SettlementItem> | null | undefined>(undefined);
  private readonly overview = signal<
    { rows: readonly Record<string, unknown>[] } | null | undefined
  >(undefined);

  protected readonly month = computed(() => paise(this.view().kpis.collectionsThisMonth?.amount));
  protected readonly attPct = computed(() => {
    const a = this.view().kpis.attendanceToday;
    return !a || a.percentage === null ? '—' : pct(a.percentage, 1);
  });
  protected readonly pending = computed(() => {
    const a = this.approvals();
    return a ? a.items.filter((x) => x.status === 'PENDING').slice(0, 5) : a;
  });
  protected readonly settlements = computed(() => {
    const s = this.settled();
    return s ? s.items.slice(0, 5) : s;
  });
  /** Active members by group, from the institution overview report. */
  protected readonly groups = computed<HBarItem[] | undefined>(() => {
    const o = this.overview();
    if (o === undefined) return undefined;
    const name = (c: string) =>
      c === 'STUDENT'
        ? 'Students'
        : c === 'PARENT'
          ? 'Parents'
          : c === 'MERCHANT'
            ? 'Merchants'
            : 'Staff & teachers';
    const by = new Map<string, number>();
    for (const r of o?.rows ?? []) {
      const g = name(String(r['category'] ?? ''));
      by.set(g, (by.get(g) ?? 0) + Number(r['active'] ?? 0));
    }
    return [...by].filter(([, v]) => v > 0).map(([label, value]) => ({ label, value }));
  });

  ngOnInit() {
    void fetchInto(this.approvals, this.can('task.approvals'), () =>
      this.api.get<Items<ApprovalItem>>('approvals', { status: 'PENDING', limit: 5 }),
    );
    void fetchInto(this.settled, this.can('task.settlements'), () =>
      this.api.get<Items<SettlementItem>>('settlements', { limit: 5 }),
    );
    void fetchInto(this.overview, this.can('task.reports'), () =>
      this.api.report('institution-overview'),
    );
  }

  protected can(task: string) {
    return this.session()?.subTasks.includes(task) ?? false;
  }
  protected go(path: string) {
    void this.router.navigateByUrl(path);
  }
  protected maker(a: ApprovalItem) {
    return person(a.maker?.name) || 'System';
  }
  protected money(m: { amount: string; currency: string }) {
    return formatInr(paise(m));
  }
  protected stLabel(s: string) {
    return SETTLEMENT_STATUS[s as keyof typeof SETTLEMENT_STATUS]?.l() ?? s;
  }
  protected stTone(s: string) {
    return SETTLEMENT_STATUS[s as keyof typeof SETTLEMENT_STATUS]?.tone ?? 'neutral';
  }
}
