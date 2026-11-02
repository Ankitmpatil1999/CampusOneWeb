import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  computed,
  inject,
  input,
  signal,
  type OnInit,
} from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { SessionContext } from '../../../../Context/SessionContext';
import { Avatar } from '../../../Shared/Avatar';
import { Card, Empty, Kpi } from '../../../Shared/Blocks';
import { HBars, type HBarItem } from '../../../Shared/Charts';
import { Icon } from '../../../Shared/Icon';
import { ago } from '../../../Utils/dates';
import { formatDate, formatInr, formatTime } from '../../../Utils/format';
import { APP_STATUS, SOURCE, person } from '../Applications/app-format';
import { plural } from '../Fees/fee-format';
import { statusOf } from '../Grievances/grievance-format';
import type { TicketStatus } from '../Grievances/grievances.api';
import { HEALTH, healthOf, purposeOf } from '../Readers/reader-format';
import type { TerminalPurpose } from '../Readers/readers.api';
import { num, t12 } from '../Structure/academic-format';
import { TRIP_STATUS } from '../Transport/transport-format';
import {
  HomeApi,
  type AdmissionLink,
  type ApplicationList,
  type ApprovalItem,
  type AttendanceOverview,
  type CalendarItem,
  type FeeClassRow,
  type HomeView,
  type LeaveItem,
  type ReaderItem,
  type ReportRows,
  type RouteItem,
  type TicketItem,
  type TripItem,
} from './home.api';
import { dlongIso, inrK, paise, pct } from './home-format';
import { HomeDonut, HomeQuickActions, type DonutPart, type QuickAction } from './HomeParts';

type Items<T> = { readonly items: readonly T[] };
type Slot<T> = T | null | undefined;

/** A card's data: undefined while loading, null when the role can't read it or it failed. */
async function fetchInto<T>(
  slot: { set(v: Slot<T>): void },
  allowed: boolean,
  p: () => Promise<T>,
) {
  if (!allowed) return slot.set(null);
  try {
    slot.set(await p());
  } catch {
    slot.set(null);
  }
}

/** Shared by the role homes: the session's tasks and navigation. */
@Directive()
abstract class RoleHome {
  protected readonly api = inject(HomeApi);
  private readonly router = inject(Router);
  private readonly session = inject(SessionContext).console;
  readonly view = input.required<HomeView>();

  protected readonly num = num;
  protected readonly plural = plural;
  protected readonly pct = pct;
  protected readonly ago = (iso: string) => ago(iso);
  protected readonly pctText = (v: number) => `${v}%`;

  protected can(task: string) {
    return this.session()?.subTasks.includes(task) ?? false;
  }
  protected go(path: string) {
    void this.router.navigateByUrl(path);
  }
  protected attPct() {
    const a = this.view().kpis.attendanceToday;
    return !a || a.percentage === null ? '—' : pct(a.percentage, 1);
  }
}

/** The accountant's home (prototype HOME.acc). */
@Component({
  selector: 'rp-home-accountant',
  imports: [Avatar, Card, Empty, HBars, HomeQuickActions, Icon, Kpi, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @let k = view().kpis;
    <div class="c-grid k4" id="home-kpis">
      <rp-kpi
        label="Collected this year"
        icon="rupee"
        tone="ok"
        link="/console/feerecords"
        [value]="inrK(money(k.collectedThisYear))"
        [delta]="'Academic year ' + (view().year?.label ?? '')"
      />
      <rp-kpi
        label="Still to fall due"
        icon="calendar"
        tone="warn"
        link="/console/feerecords"
        [value]="inrK(money(k.dueAhead))"
        delta="Instalments due from today"
      />
      <rp-kpi
        label="Overdue"
        icon="alert"
        tone="bad"
        link="/console/feerecords"
        [value]="num(k.overdue ?? 0)"
        delta="Records past their due date"
      />
      <rp-kpi
        label="Fee consent pending"
        icon="clipcheck"
        tone="accent"
        link="/console/feerecords"
        [value]="num(k.consentPending ?? 0)"
        delta="Needed before wallet collection"
      />
    </div>
    <div class="c-grid s21">
      <rp-card title="Collection rate by class and section" icon="chart">
        <a card-right class="linkbtn" routerLink="/console/fees"
          >Fee structures<rp-icon name="right" [size]="14"
        /></a>
        @if (rates() === undefined) {
          <div class="sk" style="height: 220px; border-radius: 12px" aria-busy="true"></div>
        } @else if (rates()?.length) {
          <rp-hbars [items]="rates()!" [fmt]="pctText" />
        } @else {
          <rp-empty icon="chart" title="No fee records yet" />
        }
      </rp-card>
      <rp-card title="Waiting on a checker" icon="approve">
        @if (can('task.approvals')) {
          <a card-right class="linkbtn" routerLink="/console/approvals"
            >Approvals<rp-icon name="right" [size]="14"
          /></a>
        }
        @if (pending() === undefined) {
          <div class="sk" style="height: 160px; border-radius: 12px" aria-busy="true"></div>
        } @else if (pending()?.length) {
          <div class="list plain">
            @for (a of pending(); track a.id) {
              <button type="button" class="li" (click)="go('/console/approvals')">
                <span class="li-ic"><rp-icon name="approve" [size]="18" /></span>
                <span class="li-main"
                  ><span class="li-t">{{ a.action }}</span
                  ><span class="li-s">{{ a.summary }}</span></span
                >
                <span class="li-r"
                  ><span class="t-xs t-muted">{{ ago(a.raisedAt) }}</span></span
                >
              </button>
            }
          </div>
        } @else {
          <rp-empty
            icon="checkc"
            title="Nothing waiting"
            text="Fee changes you send for approval appear here."
          />
        }
      </rp-card>
    </div>
    <div class="c-grid s21">
      <rp-card title="Latest collections" icon="receipt">
        <a card-right class="linkbtn" routerLink="/console/feerecords"
          >Fee records<rp-icon name="right" [size]="14"
        /></a>
        @if (latest() === undefined) {
          <div class="sk" style="height: 220px; border-radius: 12px" aria-busy="true"></div>
        } @else if (latest()?.length) {
          <div class="list plain" id="home-latest">
            @for (r of latest(); track r.id) {
              <div class="li">
                <rp-av [name]="name(r.student.name)" />
                <span class="li-main"
                  ><span class="li-t">{{ name(r.student.name) }}</span
                  ><span class="li-s"
                    >{{ r.instalment.label }} · {{ r.student.classSection }}</span
                  ></span
                >
                <span class="li-r"
                  ><b class="t-num">{{ inr(r.paid) }}</b
                  ><span class="t-xs t-muted">{{ when(r.paidAt) }}</span></span
                >
              </div>
            }
          </div>
        } @else {
          <rp-empty icon="receipt" title="No collections yet" />
        }
      </rp-card>
      <rp-card title="Quick actions" icon="zap">
        <rp-home-qa [items]="actions()" />
      </rp-card>
    </div>
  `,
})
export class HomeAccountant extends RoleHome implements OnInit {
  protected readonly inrK = inrK;
  protected readonly money = paise;
  private readonly approvals = signal<Slot<Items<ApprovalItem>>>(undefined);
  private readonly classes = signal<Slot<{ rows: readonly FeeClassRow[] }>>(undefined);
  private readonly paid = signal<Slot<Items<PaidRecord>>>(undefined);

  protected readonly pending = computed(() => {
    const a = this.approvals();
    return a ? a.items.filter((x) => x.module.startsWith('FEE')).slice(0, 5) : a;
  });
  protected readonly rates = computed<HBarItem[] | null | undefined>(() => {
    const c = this.classes();
    if (!c) return c;
    return c.rows
      .filter((r) => paise(r.billed) > 0)
      .map((r) => {
        const v = Math.round((paise(r.collected) * 100) / paise(r.billed));
        return {
          label: r.classSection,
          value: v,
          max: 100,
          tone: v >= 75 ? 'ok' : v >= 40 ? null : 'warn',
        };
      });
  });
  protected readonly latest = computed(() => {
    const p = this.paid();
    if (!p) return p;
    return [...p.items]
      .filter((r) => r.paidAt)
      .sort((a, b) => (b.paidAt ?? '').localeCompare(a.paidAt ?? ''))
      .slice(0, 6);
  });
  protected readonly actions = computed<QuickAction[]>(() =>
    (
      [
        ['Fee records', 'receipt', '/console/feerecords', 'task.fees'],
        ['Fee structures', 'layers', '/console/fees', 'task.fees'],
        ['Admission fees', 'rupee', '/console/admfees', 'task.admfees'],
        ['Settlements', 'bank', '/console/settlements', 'task.settlements'],
        ['Accounting', 'filetext', '/console/vouchers', 'task.vouchers'],
        ['Reports', 'report', '/console/reports', 'task.reports'],
      ] as const
    )
      .filter(([, , , t]) => this.can(t))
      .map(([l, icon, path]) => ({ l, icon, path })),
  );

  ngOnInit() {
    void fetchInto(this.approvals, this.can('task.approvals'), () =>
      this.api.get<Items<ApprovalItem>>('approvals', { status: 'PENDING', limit: 20 }),
    );
    void fetchInto(this.classes, this.can('task.fees'), () =>
      this.api.get<{ rows: FeeClassRow[] }>('fee-collections/report'),
    );
    void fetchInto(this.paid, this.can('task.fees'), () =>
      this.api.get<Items<PaidRecord>>('fee-records', { status: 'PAID', limit: 50 }),
    );
  }

  protected inr(m: { amount: string; currency: string }) {
    return formatInr(paise(m));
  }
  protected when(iso: string | null) {
    return iso ? `${formatDate(iso)}, ${formatTime(iso)}` : '';
  }
  protected name(n: string) {
    return person(n);
  }
}

interface PaidRecord {
  readonly id: string;
  readonly student: { name: string; classSection: string };
  readonly instalment: { label: string };
  readonly paid: { amount: string; currency: string };
  readonly paidAt: string | null;
}

/** The counsellor's home (prototype HOME.cns). */
@Component({
  selector: 'rp-home-counsellor',
  imports: [Avatar, Card, Empty, HBars, Icon, Kpi, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @let k = view().kpis;
    <div class="c-grid k4" id="home-kpis">
      <rp-kpi
        label="Applications"
        icon="filetext"
        link="/console/applications"
        [value]="total() === null ? '—' : num(total()!)"
        [delta]="(apps()?.counts?.['DRAFT'] ?? 0) + ' drafts in progress'"
      />
      <rp-kpi
        label="Waiting for review"
        icon="clock"
        tone="warn"
        link="/console/applications"
        [value]="num(k.waitingForReview ?? 0)"
      />
      <rp-kpi
        label="Admitted"
        icon="grad"
        tone="ok"
        link="/console/applications"
        [value]="num(k.admitted ?? 0)"
        [delta]="(apps()?.counts?.['REJECTED'] ?? 0) + ' rejected'"
      />
      <rp-kpi
        label="Mid-term applications"
        icon="calendar"
        tone="accent"
        link="/console/applications"
        [value]="num(k.midTermApplications ?? 0)"
        delta="Joining during the year · CR-14"
      />
    </div>
    <div class="c-grid s21">
      <rp-card title="Submitted — waiting for your review" icon="filetext">
        <a card-right class="linkbtn" routerLink="/console/applications"
          >Applications<rp-icon name="right" [size]="14"
        /></a>
        @if (submitted() === undefined) {
          <div class="sk" style="height: 260px; border-radius: 12px" aria-busy="true"></div>
        } @else if (submitted()?.items?.length) {
          <div class="list plain" id="home-submitted">
            @for (a of submitted()!.items; track a.id) {
              <button type="button" class="li" (click)="go('/console/applications')">
                <rp-av [name]="person(a.name)" />
                <span class="li-main"
                  ><span class="li-t">{{ person(a.name) }}</span
                  ><span class="li-s"
                    >{{ a.class?.name ?? '—' }} ·
                    <span class="t-mono">{{ a.applicationNo }}</span> · {{ source(a.source) }}</span
                  ></span
                >
                <span class="li-r"
                  ><span class="t-xs t-muted">{{
                    a.submittedAt ? ago(a.submittedAt) : ''
                  }}</span></span
                >
              </button>
            }
          </div>
        } @else {
          <rp-empty icon="checkc" title="All reviewed" />
        }
      </rp-card>
      <div class="stack g16">
        <rp-card title="Application funnel" icon="chart">
          @if (funnel(); as f) {
            <rp-hbars [items]="f" [fmt]="numText" />
          } @else {
            <div class="sk" style="height: 150px; border-radius: 12px" aria-busy="true"></div>
          }
        </rp-card>
        <rp-card title="Admission link & QR" icon="qr">
          @if (link() === undefined) {
            <div class="sk" style="height: 90px; border-radius: 12px" aria-busy="true"></div>
          } @else if (link()?.current; as q) {
            <div class="row g12">
              <span
                class="cp-qr"
                style="width: 84px; height: 84px; flex: none"
                [innerHTML]="qr()"
              ></span>
              <div class="grow">
                <b class="t-sm">{{ q.year }} form</b>
                <div class="t-xs t-muted">{{ fromLink() }} applications from the link</div>
                <div class="mt8">
                  <a class="linkbtn" routerLink="/console/admissionqr"
                    >Share link<rp-icon name="right" [size]="14"
                  /></a>
                </div>
              </div>
            </div>
          } @else {
            <rp-empty icon="qr" title="No link yet" />
          }
        </rp-card>
      </div>
    </div>
  `,
})
export class HomeCounsellor extends RoleHome implements OnInit {
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly person = person;
  protected readonly numText = (v: number) => num(v);
  protected readonly apps = signal<Slot<ApplicationList>>(undefined);
  protected readonly submitted = signal<Slot<ApplicationList>>(undefined);
  protected readonly link = signal<Slot<AdmissionLink>>(undefined);

  protected readonly total = computed(() => {
    const c = this.apps()?.counts;
    return c ? Object.values(c).reduce((s, n) => s + n, 0) : null;
  });
  protected readonly funnel = computed<HBarItem[] | null>(() => {
    const c = this.apps()?.counts;
    if (!c) return this.apps() === null ? [] : null;
    return (['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'] as const).map((s) => ({
      label: APP_STATUS[s].l(),
      value: c[s] ?? 0,
      tone: s === 'SUBMITTED' ? 'warn' : s === 'APPROVED' ? 'ok' : s === 'REJECTED' ? 'bad' : null,
    }));
  });
  protected readonly fromLink = computed(() =>
    num((this.submitted()?.items ?? []).filter((a) => a.source === 'PUBLIC').length),
  );
  protected readonly qr = computed<SafeHtml>(() => {
    const svg = this.link()?.current?.qrSvg;
    // Our own API draws the code (trusted markup), shown 84 px square as the prototype's ui.qr.
    return svg
      ? this.sanitizer.bypassSecurityTrustHtml(
          svg.replace(
            /^\s*<svg\b/,
            '<svg width="84" height="84" role="img" aria-label="Admission QR"',
          ),
        )
      : '';
  });

  ngOnInit() {
    const ok = this.can('task.admissions');
    void fetchInto(this.apps, ok, () =>
      this.api.get<ApplicationList>('applications', { limit: 1 }),
    );
    void fetchInto(this.submitted, ok, () =>
      this.api.get<ApplicationList>('applications', { status: 'SUBMITTED', limit: 6 }),
    );
    void fetchInto(this.link, this.can('task.admqr'), () =>
      this.api.get<AdmissionLink>('admission-links'),
    );
  }

  protected source(s: string) {
    return SOURCE[s as keyof typeof SOURCE] ?? s;
  }
}

interface Upcoming {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly colour: string | null;
  readonly start: string;
  readonly who: string;
}

/** The academic coordinator's home (prototype HOME.crd). */
@Component({
  selector: 'rp-home-coordinator',
  imports: [Avatar, Card, Empty, HBars, Icon, Kpi, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @let k = view().kpis;
    <div class="c-grid k4" id="home-kpis">
      <rp-kpi
        label="Teacher leave to review"
        icon="plane"
        tone="warn"
        link="/console/leave"
        [value]="num(k.teacherLeaveToReview ?? 0)"
        delta="First review is yours"
      />
      <rp-kpi
        label="Attendance today"
        icon="calcheck"
        tone="info"
        link="/console/attendance"
        [value]="attPct()"
        [delta]="plural(k.attendanceToday?.students ?? 0, 'student') + ' on the rolls'"
      />
      <rp-kpi
        label="Exams this year"
        icon="award"
        link="/console/exams"
        [value]="num(k.exams ?? 0)"
        [delta]="'Academic year ' + (view().year?.label ?? '')"
      />
      <rp-kpi
        label="Periods a week"
        icon="grid"
        link="/console/timetable"
        [value]="num(k.periodsAWeek ?? 0)"
        delta="Timetabled across the classes"
      />
    </div>
    <div class="c-grid s21">
      <rp-card title="Attendance today by class" icon="calcheck">
        <a card-right class="linkbtn" routerLink="/console/attendance"
          >Attendance reports<rp-icon name="right" [size]="14"
        /></a>
        @if (byClass() === undefined) {
          <div class="sk" style="height: 220px; border-radius: 12px" aria-busy="true"></div>
        } @else if (byClass()?.length) {
          <rp-hbars [items]="byClass()!" [fmt]="pctText" />
        } @else {
          <rp-empty icon="calcheck" title="No attendance yet today" />
        }
      </rp-card>
      <rp-card title="Leave waiting for you" icon="plane">
        @if (leave() === undefined) {
          <div class="sk" style="height: 220px; border-radius: 12px" aria-busy="true"></div>
        } @else if (leave()?.length) {
          <div class="list plain" id="home-leave">
            @for (l of leave(); track l.id) {
              <button type="button" class="li" (click)="go('/console/leave')">
                <rp-av [name]="person(l.staff.name)" />
                <span class="li-main"
                  ><span class="li-t">{{ person(l.staff.name) }}</span
                  ><span class="li-s"
                    >{{ l.typeLabel }} · {{ l.dates }} · {{ l.reason }}</span
                  ></span
                >
              </button>
            }
          </div>
        } @else {
          <rp-empty icon="checkc" title="No leave to review" />
        }
      </rp-card>
    </div>
    <rp-card title="Coming up" icon="calendar">
      <a card-right class="linkbtn" routerLink="/console/calendar"
        >Calendar<rp-icon name="right" [size]="14"
      /></a>
      @if (upcoming() === undefined) {
        <div class="sk" style="height: 200px; border-radius: 12px" aria-busy="true"></div>
      } @else if (upcoming()?.length) {
        <div class="list plain" id="home-upcoming">
          @for (c of upcoming(); track c.id + c.start) {
            <div class="li">
              <span
                class="li-ic"
                [style.background]="c.colour ? c.colour + '1f' : null"
                [style.color]="c.colour"
                ><rp-icon name="calendar" [size]="18"
              /></span>
              <span class="li-main"
                ><span class="li-t">{{ c.title }}</span
                ><span class="li-s">{{ dlong(c.start) }} · {{ c.who }}</span></span
              >
              <span class="li-r"
                ><span class="tag">{{ c.type }}</span></span
              >
            </div>
          }
        </div>
      } @else {
        <rp-empty icon="calendar" title="Nothing coming up" />
      }
    </rp-card>
  `,
})
export class HomeCoordinator extends RoleHome implements OnInit {
  protected readonly person = person;
  protected readonly dlong = dlongIso;
  private readonly overview = signal<Slot<AttendanceOverview>>(undefined);
  private readonly leaves = signal<Slot<Items<LeaveItem>>>(undefined);
  private readonly calendar = signal<Slot<Items<CalendarItem>>>(undefined);

  protected readonly byClass = computed<HBarItem[] | null | undefined>(() => {
    const o = this.overview();
    if (!o) return o;
    return o.sections
      .filter((s) => s.students > 0 && s.percentage !== null && s.notMarked < s.students)
      .map((s) => ({ label: s.section.label, value: Math.round(s.percentage ?? 0), max: 100 }));
  });
  protected readonly leave = computed(() => {
    const l = this.leaves();
    return l ? l.items.filter((x) => x.needsCoordinator && !x.coordinator && !x.final) : l;
  });
  protected readonly upcoming = computed<readonly Upcoming[] | null | undefined>(() => {
    const c = this.calendar();
    if (!c) return c;
    const today = this.view().date;
    return c.items
      .flatMap((e) =>
        e.occurrences
          .filter((o) => o.end >= today)
          .map((o) => ({
            id: e.id,
            title: e.title,
            type: e.type,
            colour: e.colour,
            start: o.start < today ? today : o.start,
            who: e.audience.targets?.length
              ? e.audience.targets.map((t) => t.name).join(', ')
              : 'Everyone',
          })),
      )
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(0, 5);
  });

  ngOnInit() {
    void fetchInto(this.overview, this.can('task.attendance'), () =>
      this.api.get<AttendanceOverview>('attendance/overview'),
    );
    void fetchInto(this.leaves, this.can('task.leave'), () =>
      this.api.get<Items<LeaveItem>>('teacher-leaves', { status: 'PENDING' }),
    );
    void fetchInto(this.calendar, this.can('task.academics'), () =>
      this.api.get<Items<CalendarItem>>('calendar-events'),
    );
  }
}

/** The transport administrator's home (prototype HOME.trn). */
@Component({
  selector: 'rp-home-transport',
  imports: [Card, Empty, HBars, Icon, Kpi, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @let k = view().kpis;
    <div class="c-grid k4" id="home-kpis">
      <rp-kpi
        label="Trips today"
        icon="bus"
        link="/console/transport"
        [value]="num(k.tripsToday?.total ?? 0)"
        [delta]="tripsText()"
      />
      <rp-kpi
        label="Passengers allocated"
        icon="users"
        tone="info"
        link="/console/allocations"
        [value]="num(k.passengersAllocated ?? 0)"
      />
      <rp-kpi
        label="Vehicles in service"
        icon="truck"
        link="/console/fleet"
        [value]="(k.vehicles?.inService ?? 0) + '/' + (k.vehicles?.total ?? 0)"
        [delta]="plural(k.vehicles?.crew ?? 0, 'crew member')"
      />
      <rp-kpi
        label="Cancelled this week"
        icon="xc"
        tone="bad"
        link="/console/transport"
        [value]="num(k.cancelledThisWeek ?? 0)"
      />
    </div>
    <div class="c-grid s21">
      <rp-card title="Today's trips" icon="bus">
        <a card-right class="linkbtn" routerLink="/console/transport"
          >Live trips<rp-icon name="right" [size]="14"
        /></a>
        @if (trips() === undefined) {
          <div class="sk" style="height: 220px; border-radius: 12px" aria-busy="true"></div>
        } @else if (trips()?.items?.length) {
          <div class="tbl-wrap">
            <table class="tbl dense" id="home-trips">
              <thead>
                <tr>
                  <th>Route</th>
                  <th>Session</th>
                  <th>Vehicle</th>
                  <th>Driver</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (t of trips()!.items; track t.id) {
                  <tr
                    tabindex="0"
                    (click)="go('/console/transport')"
                    (keydown.enter)="go('/console/transport')"
                  >
                    <td>
                      <b>{{ t.route.code }}</b
                      ><span class="t-muted"> {{ t.route.name }}</span>
                    </td>
                    <td>{{ t.session }} · {{ t12(t.plannedStart) }}</td>
                    <td>{{ t.vehicle?.name ?? '—' }}</td>
                    <td>{{ t.driver ?? '—' }}</td>
                    <td>
                      <span class="chip dot" [class]="'chip dot tone-' + trip(t.status).tone">{{
                        trip(t.status).l()
                      }}</span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <rp-empty
            icon="bus"
            title="No trips today"
            text="Trips are created each night for the next day."
          />
        }
      </rp-card>
      <rp-card title="Passengers by route" icon="route">
        <a card-right class="linkbtn" routerLink="/console/allocations"
          >Allocations<rp-icon name="right" [size]="14"
        /></a>
        @if (load() === undefined) {
          <div class="sk" style="height: 220px; border-radius: 12px" aria-busy="true"></div>
        } @else if (load()?.length) {
          <rp-hbars [items]="load()!" [fmt]="passengers" />
          <div class="stack g6 mt12">
            @for (b of buses(); track b.code) {
              <div class="row between t-xs t-muted">
                <span>{{ b.code }} runs {{ b.bus }} · {{ b.reg }}</span
                ><span>{{ b.seats }} seats per trip</span>
              </div>
            }
          </div>
        } @else {
          <rp-empty icon="route" title="No routes yet" />
        }
      </rp-card>
    </div>
  `,
})
export class HomeTransport extends RoleHome implements OnInit {
  protected readonly t12 = t12;
  protected readonly passengers = (v: number) => plural(v, 'passenger');
  protected readonly trips =
    signal<Slot<Items<TripItem> & { counts?: Record<string, number> }>>(undefined);
  private readonly routes = signal<Slot<Items<RouteItem>>>(undefined);

  protected readonly tripsText = computed(() => {
    const k = this.view().kpis.tripsToday;
    const sched = this.trips()?.counts?.['scheduled'];
    return `${num(k?.completed ?? 0)} completed${sched === undefined ? '' : ` · ${num(sched)} scheduled`}`;
  });
  protected readonly load = computed<HBarItem[] | null | undefined>(() => {
    const r = this.routes();
    if (!r) return r;
    return r.items
      .filter((x) => x.active)
      .map((x) => ({ label: `${x.code} · ${x.name}`, value: x.passengers }));
  });
  /** The vehicle each route runs today (from today's trips). */
  protected readonly buses = computed(() => {
    const seen = new Map<string, { code: string; bus: string; reg: string; seats: number }>();
    for (const t of this.trips()?.items ?? [])
      if (t.vehicle && !seen.has(t.route.code))
        seen.set(t.route.code, {
          code: t.route.code,
          bus: t.vehicle.name,
          reg: t.vehicle.registration,
          seats: t.vehicle.capacity,
        });
    return [...seen.values()].sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
  });

  ngOnInit() {
    const ok = this.can('task.transport');
    void fetchInto(this.trips, ok, () => this.api.get<Items<TripItem>>('trips'));
    void fetchInto(this.routes, ok, () => this.api.get<Items<RouteItem>>('routes'));
  }

  protected trip(s: TripItem['status']) {
    return TRIP_STATUS[s] ?? { l: () => s, tone: 'neutral' };
  }
}

interface TicketList extends Items<TicketItem> {
  readonly tiles?: {
    readonly total: number;
    readonly open: { count: number };
    readonly escalated: { count: number };
    readonly awaitingApproval: { count: number };
    readonly resolved: { count: number };
    readonly closed: { count: number };
  };
}

const OPEN_STATUSES = new Set(['OPEN', 'ESCALATED_VENDOR', 'ESCALATED_INTERNAL']);

/** The grievance officer's home (prototype HOME.grv). */
@Component({
  selector: 'rp-home-grievance',
  imports: [Avatar, Card, Empty, HomeDonut, Icon, Kpi, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @let k = view().kpis;
    <div class="c-grid k4" id="home-kpis">
      <rp-kpi
        label="Open tickets"
        icon="help"
        tone="warn"
        link="/console/grievances"
        [value]="num(k.open ?? 0)"
      />
      <rp-kpi
        label="Escalated"
        icon="alert"
        tone="bad"
        link="/console/grievances"
        [value]="num(k.escalated ?? 0)"
      />
      <rp-kpi
        label="Awaiting checker"
        icon="approve"
        tone="accent"
        link="/console/approvals"
        [value]="num(k.awaitingChecker ?? 0)"
        delta="Priority 1 resolutions"
      />
      <rp-kpi
        label="Resolved or closed"
        icon="checkc"
        tone="ok"
        link="/console/grievances"
        [value]="num(k.resolvedOrClosed ?? 0)"
      />
    </div>
    <div class="c-grid s21">
      <rp-card title="Oldest open tickets first" icon="help">
        <a card-right class="linkbtn" routerLink="/console/grievances"
          >Grievances<rp-icon name="right" [size]="14"
        /></a>
        @if (open() === undefined) {
          <div class="sk" style="height: 260px; border-radius: 12px" aria-busy="true"></div>
        } @else if (open()?.length) {
          <div class="list plain" id="home-tickets">
            @for (t of open(); track t.id) {
              <button type="button" class="li" (click)="go('/console/grievances')">
                <rp-av [name]="person(t.member?.name) || '?'" />
                <span class="li-main"
                  ><span class="li-t"
                    ><span class="t-mono">{{ t.ticketNo }}</span> · {{ t.issue }}</span
                  ><span class="li-s"
                    >{{ person(t.member?.name) || '—'
                    }}{{ t.transaction ? ' · ' + inr(t.transaction.amount) : '' }} · raised
                    {{ ago(t.createdAt) }}</span
                  ></span
                >
                <span class="li-r"
                  ><span class="chip dot" [class]="'chip dot tone-' + st(t.status).tone">{{
                    st(t.status).l()
                  }}</span
                  ><span class="t-xs t-muted">Priority {{ t.priority }}</span></span
                >
              </button>
            }
          </div>
        } @else {
          <rp-empty icon="checkc" title="No open tickets" />
        }
      </rp-card>
      <rp-card title="Tickets by status" icon="pie">
        <rp-home-donut
          [parts]="parts()"
          [size]="140"
          [thick]="15"
          unit="tickets"
          legend="count"
          aria="Tickets by status"
        />
      </rp-card>
    </div>
  `,
})
export class HomeGrievance extends RoleHome implements OnInit {
  protected readonly person = person;
  private readonly tickets = signal<Slot<TicketList>>(undefined);

  protected readonly open = computed(() => {
    const t = this.tickets();
    if (!t) return t;
    return t.items
      .filter((x) => OPEN_STATUSES.has(x.status))
      .sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt))
      .slice(0, 7);
  });
  protected readonly parts = computed<DonutPart[]>(() => {
    const k = this.view().kpis;
    const t = this.tickets()?.tiles;
    return [
      { l: statusOf('OPEN').l(), v: k.open ?? 0, c: 'var(--warn)' },
      { l: 'Escalated', v: k.escalated ?? 0, c: 'var(--bad)' },
      { l: 'Awaiting approval', v: k.awaitingChecker ?? 0, c: 'var(--violet)' },
      {
        l: statusOf('RESOLVED').l(),
        v: t ? t.resolved.count : (k.resolvedOrClosed ?? 0),
        c: 'var(--ok)',
      },
      { l: statusOf('CLOSED').l(), v: t ? t.closed.count : 0, c: 'var(--ink-4)' },
    ];
  });

  ngOnInit() {
    void fetchInto(this.tickets, this.can('task.grievances'), () =>
      this.api.get<TicketList>('tickets', { limit: 100 }),
    );
  }

  protected st(s: string) {
    return statusOf(s as TicketStatus);
  }
  protected inr(m: { amount: string; currency: string }) {
    return formatInr(paise(m));
  }
}

/** The front desk's home (prototype HOME.fd). */
@Component({
  selector: 'rp-home-frontdesk',
  imports: [Avatar, Card, Empty, Icon, Kpi, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @let k = view().kpis;
    <div class="c-grid k4" id="home-kpis">
      <rp-kpi
        label="Gate check-ins today"
        icon="door"
        link="/console/frontdesk"
        [value]="num(k.gateCheckInsToday?.total ?? 0)"
        [delta]="num(k.gateCheckInsToday?.late ?? 0) + ' late'"
      />
      <rp-kpi
        label="Students present"
        icon="calcheck"
        tone="info"
        link="/console/attendance"
        [value]="attPct()"
        [delta]="num(k.attendanceToday?.absent ?? 0) + ' absent'"
      />
      <rp-kpi
        label="Readers online"
        icon="nfc"
        tone="ok"
        link="/console/frontdesk"
        [value]="(k.readers?.online ?? 0) + '/' + (k.readers?.total ?? 0)"
      />
      <rp-kpi
        label="Location check-ins"
        icon="pin"
        link="/console/frontdesk"
        [value]="num(k.locationCheckInsToday ?? 0)"
        delta="Library, labs"
      />
    </div>
    <div class="c-grid s21">
      <rp-card title="Latest gate taps" icon="door">
        <a card-right class="linkbtn" routerLink="/console/frontdesk"
          >Front desk<rp-icon name="right" [size]="14"
        /></a>
        @if (taps() === undefined) {
          <div class="sk" style="height: 260px; border-radius: 12px" aria-busy="true"></div>
        } @else if (taps()?.length) {
          <div class="list plain" id="home-taps">
            @for (t of taps(); track $index) {
              <div class="li">
                <rp-av [name]="t.member" />
                <span class="li-main"
                  ><span class="li-t">{{ t.member }}</span
                  ><span class="li-s">{{ t.reader }}</span></span
                >
                <span class="li-r"
                  ><span class="chip dot" [class]="'chip dot tone-' + (t.late ? 'warn' : 'ok')">{{
                    t.status
                  }}</span
                  ><span class="t-xs t-muted">{{ t.time }}</span></span
                >
              </div>
            }
          </div>
        } @else {
          <rp-empty
            icon="door"
            title="No gate taps yet today"
            text="Check-ins at the gate readers appear here."
          />
        }
      </rp-card>
      <rp-card title="Readers" icon="nfc">
        @if (readers() === undefined) {
          <div class="sk" style="height: 220px; border-radius: 12px" aria-busy="true"></div>
        } @else if (readers()?.length) {
          <div class="list plain" id="home-readers">
            @for (r of readers(); track r.id) {
              <div class="li">
                <span class="li-ic"
                  ><rp-icon [name]="health(r) === 'ONLINE' ? 'wifi' : 'wifioff'" [size]="18"
                /></span>
                <span class="li-main"
                  ><span class="li-t">{{ r.name }}</span
                  ><span class="li-s">{{ purpose(r.purpose) }} · {{ r.location }}</span></span
                >
                <span class="li-r"
                  ><span class="chip dot" [class]="'chip dot tone-' + healthOf(r).tone">{{
                    healthOf(r).l()
                  }}</span></span
                >
              </div>
            }
          </div>
        } @else {
          <rp-empty icon="nfc" title="No readers yet" />
        }
      </rp-card>
    </div>
  `,
})
export class HomeFrontDesk extends RoleHome implements OnInit {
  private readonly captures = signal<Slot<ReportRows>>(undefined);
  private readonly list = signal<Slot<Items<ReaderItem>>>(undefined);

  protected readonly taps = computed(() => {
    const c = this.captures();
    if (!c) return c;
    return c.rows
      .filter((r) => /gate|attendance/i.test(String(r['purpose'] ?? '')))
      .slice(0, 8)
      .map((r) => {
        const status = String(r['status'] ?? r['action'] ?? '');
        return {
          member: person(String(r['member'] ?? '')) || '—',
          reader: String(r['reader'] ?? ''),
          status: status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' '),
          late: /late/i.test(status),
          time: r['at'] ? formatTime(String(r['at'])) : '',
        };
      });
  });
  protected readonly readers = computed(() => {
    const l = this.list();
    return l
      ? l.items.filter((r) =>
          ['ATTENDANCE', 'PERIOD_ATTENDANCE', 'LOCATION', 'BALANCE_CHECK'].includes(r.purpose),
        )
      : l;
  });

  ngOnInit() {
    const today = this.view().date;
    void fetchInto(this.captures, this.can('task.readers'), () =>
      this.api.report('reader-captures', { from: today, to: today }),
    );
    void fetchInto(this.list, this.can('task.readers') || this.can('task.frontdesk'), () =>
      this.api.get<Items<ReaderItem>>('readers'),
    );
  }

  protected health(r: ReaderItem) {
    return healthOf(r);
  }
  protected healthOf(r: ReaderItem) {
    return HEALTH[healthOf(r)];
  }
  protected purpose(p: string) {
    return purposeOf(p as TerminalPurpose).l;
  }
}
