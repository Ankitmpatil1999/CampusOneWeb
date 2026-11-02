import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Avatar } from '../../../Shared/Avatar';
import { Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal } from '../../../Shared/Overlays';
import { Pager } from '../../../Shared/Pager';
import { formatDate } from '../../../Utils/format';
import { person } from '../Applications/app-format';
import { plural } from '../Fees/fee-format';
import { num, problemText, today } from '../Structure/academic-format';
import {
  AttendanceApi,
  type PayrollMonth,
  type PayrollRow,
  type StaffLeaveType,
} from './attendance.api';
import { exportCsv, taskAccess } from './attendance-format';

type Staff = 'ALL' | 'TEACHING' | 'OTHER';
type Exception = PayrollRow['exceptions'][number];

const PAGE = 15;
/** The months offered: this one and the two years before it. */
const MONTHS_BACK = 24;
const LEAVE: Readonly<Record<StaffLeaveType, string>> = {
  CASUAL: 'Casual',
  MEDICAL: 'Medical',
  EARNED: 'Earned',
};

/** "October 2026". */
export const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
const addMonths = (month: string, n: number) => {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};
const weekdayOf = (date: string) =>
  new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );

/**
 * c.payroll-attendance — Payroll attendance (client 2026-10-22: Accounts runs payroll from
 * attendance; ATT-032): each teacher's and staff member's month — working days, days present, late
 * and half day, approved leave, absences, days not marked, loss of pay (LOP) and payable days — with
 * a CSV for the payroll sheet. A row opens the days behind its figures. Read only (attendance.view).
 */
@Component({
  selector: 'rp-payroll-attendance',
  imports: [Avatar, Dropdown, Empty, Icon, Kpi, Modal, PageHead, Pager],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Payroll attendance"
        sub="Each staff member's month for payroll: days worked, paid leave and loss of pay."
      >
        @if (!access.denied()) {
          <button
            type="button"
            class="btn btn-sec"
            id="pay-export"
            [disabled]="!data() || !filtered().length"
            (click)="export()"
          >
            <rp-icon name="download" [size]="17" /><span>Export CSV</span>
          </button>
        }
      </rp-page-head>

      @if (access.denied()) {
        <rp-empty
          icon="lock"
          title="You don't have access to this page"
          [text]="access.deniedText()"
        />
      } @else {
        <div class="c-filters" id="pay-filters">
          <div class="fld" style="width: 200px">
            <rp-dd
              inputId="pay-month"
              [options]="monthOptions"
              [value]="month()"
              (changed)="pickMonth($event)"
            />
          </div>
          <div class="pills" role="group" aria-label="Staff">
            @for (p of staffTypes; track p.v) {
              <button
                type="button"
                class="pill"
                [class.on]="staff() === p.v"
                [attr.aria-pressed]="staff() === p.v"
                (click)="staff.set(p.v); page.set(1)"
              >
                {{ p.l }}
              </button>
            }
          </div>
          <label class="search">
            <rp-icon name="search" [size]="16" />
            <input
              type="search"
              id="pay-q"
              placeholder="Find by name or employee no."
              aria-label="Find staff"
              autocomplete="off"
              [value]="q()"
              (input)="q.set($any($event.target).value); page.set(1)"
            />
          </label>
        </div>

        @if (loading() && !data()) {
          <div class="stack g16" aria-busy="true" aria-label="Loading">
            <div class="c-grid k4 cc-kp">
              @for (i of [1, 2, 3, 4]; track i) {
                <div class="sk" style="height: 104px; border-radius: 16px"></div>
              }
            </div>
            <div class="sk" style="height: 360px; border-radius: 16px"></div>
          </div>
        } @else if (error()) {
          <div class="card pad">
            <rp-empty icon="alertc" title="Couldn't load payroll attendance" [text]="error()">
              <button type="button" class="btn btn-sec btn-sm" (click)="load()">
                <span>Try again</span>
              </button>
            </rp-empty>
          </div>
        } @else if (data(); as d) {
          @if (!d.complete) {
            <div class="note tone-warn" id="pay-running">
              <rp-icon name="clock" [size]="17" />
              <div class="grow">
                @if (d.through) {
                  <b>{{ label() }} isn't over yet.</b> Attendance is read up to
                  {{ fmt(d.through) }}; the days after it count as payable. Run payroll once the
                  month has ended.
                } @else {
                  <b>{{ label() }} hasn't begun.</b> Choose a month that has.
                }
              </div>
            </div>
          }
          <div class="c-grid k4 cc-kp" id="pay-kpis">
            <rp-kpi label="Staff" icon="users" [value]="num(filtered().length)" [delta]="label()" />
            <rp-kpi
              label="Working days"
              icon="calendar"
              [value]="num(d.workingDays)"
              [delta]="
                plural(d.days, 'day') +
                ' · ' +
                plural(d.sundays, 'Sunday') +
                ' · ' +
                plural(d.holidays.length, 'holiday')
              "
            />
            <rp-kpi
              label="With loss of pay"
              icon="userx"
              tone="bad"
              [value]="num(withLop())"
              [delta]="num(lopTotal()) + ' LOP days in all'"
            />
            <rp-kpi
              label="Days not marked"
              icon="hourglass"
              [tone]="notMarked() ? 'violet' : null"
              [value]="num(notMarked())"
              [delta]="notMarked() ? 'Check these before payroll' : 'Every day accounted for'"
            />
          </div>

          <div class="tbl-wrap">
            <table class="tbl" id="pay-table">
              <thead>
                <tr>
                  <th>Staff member</th>
                  <th class="r">Working days</th>
                  <th class="r">Present</th>
                  <th class="r">Late</th>
                  <th class="r">Half day</th>
                  <th class="r">Paid leave</th>
                  <th class="r">Absent</th>
                  <th class="r">Not marked</th>
                  <th class="r">LOP days</th>
                  <th class="r">Payable days</th>
                  <th aria-label="Open"></th>
                </tr>
              </thead>
              <tbody>
                @for (r of shown(); track r.member.id) {
                  <tr
                    tabindex="0"
                    [attr.data-member]="r.member.id"
                    [attr.aria-label]="person(r.member.name)"
                    (click)="open.set(r)"
                    (keydown.enter)="open.set(r)"
                  >
                    <td>
                      <div class="cell-main">
                        <rp-av [name]="person(r.member.name)" size="sm" />
                        <div style="min-width: 0">
                          <div class="cell-t t-clip">{{ person(r.member.name) }}</div>
                          <div class="cell-s t-clip">{{ who(r) }}</div>
                        </div>
                      </div>
                    </td>
                    <td class="r">{{ num(r.workingDays) }}</td>
                    <td class="r">{{ num(r.present) }}</td>
                    <td class="r">{{ num(r.late) }}</td>
                    <td class="r">{{ num(r.halfDay) }}</td>
                    <td class="r">{{ num(r.paidLeave) }}</td>
                    <td class="r">
                      @if (r.absent) {
                        <b class="t-bad">{{ num(r.absent) }}</b>
                      } @else {
                        0
                      }
                    </td>
                    <td class="r">
                      @if (r.notMarked) {
                        <span class="t-sb" style="color: var(--violet)">{{
                          num(r.notMarked)
                        }}</span>
                      } @else {
                        0
                      }
                    </td>
                    <td class="r">
                      @if (r.lopDays) {
                        <b class="t-bad">{{ num(r.lopDays) }}</b>
                      } @else {
                        0
                      }
                    </td>
                    <td class="r">
                      <b>{{ num(r.payableDays) }}</b>
                      <div class="cell-s">of {{ num(d.days) }}</div>
                    </td>
                    <td>
                      <span class="row-acts"><rp-icon name="right" [size]="15" /></span>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="11">
                      <rp-empty
                        icon="users"
                        title="No staff here"
                        [text]="
                          q() ? 'No one matches your search.' : 'Teachers and staff appear here.'
                        "
                      />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (filtered().length > pageSize) {
            <rp-pager
              [total]="filtered().length"
              [page]="page()"
              [size]="pageSize"
              (go)="page.set($event)"
            />
          } @else if (filtered().length) {
            <div class="pager">
              <span>{{ plural(filtered().length, 'staff member') }}</span>
            </div>
          }

          <div class="note tone-info" id="pay-rules">
            <rp-icon name="info" [size]="17" />
            <div class="grow">
              <b>How the days are counted.</b> Loss of pay (LOP) is each absent day without approved
              leave, and half of each half day without it. Payable days are the days of the month
              less LOP and any days before joining or after leaving: Sundays, holidays and approved
              leave are paid. Late arrivals are shown but not deducted. Days not marked aren't
              deducted either — open the staff member to see them, and mark them on the Attendance
              page before running payroll.
            </div>
          </div>
        }
      }
    </div>

    @if (open(); as r) {
      <rp-modal
        [title]="person(r.member.name)"
        [sub]="who(r) + ' · ' + label()"
        icon="calcheck"
        [drawer]="true"
        [foot]="false"
        (closed)="open.set(null)"
      >
        <div class="stack g16" id="pay-drawer">
          <div class="row g8 wrap">
            <span class="chip dot tone-ok"
              >{{ num(r.payableDays) }} of {{ num(data()!.days) }} days payable</span
            >
            @if (r.lopDays) {
              <span class="chip dot tone-bad">{{ num(r.lopDays) }} LOP</span>
            }
            @if (r.notMarked) {
              <span class="chip dot tone-violet">{{ num(r.notMarked) }} not marked</span>
            }
          </div>
          @if (r.paidLeave) {
            <p class="t-sm t-muted">Paid leave: {{ leaveText(r) }}.</p>
          }
          @if (r.member.joinedOn && r.member.joinedOn > data()!.from) {
            <p class="t-sm t-muted">Joined on {{ fmt(r.member.joinedOn) }}.</p>
          }
          @if (r.member.leftOn) {
            <p class="t-sm t-muted">Left on {{ fmt(r.member.leftOn) }}.</p>
          }
          @if (r.exceptions.length) {
            <div class="tbl-wrap">
              <table class="tbl" id="pay-days">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Day</th>
                  </tr>
                </thead>
                <tbody>
                  @for (e of r.exceptions; track e.date) {
                    <tr [attr.data-date]="e.date">
                      <td class="t-num">{{ weekday(e.date) }}, {{ fmt(e.date) }}</td>
                      <td>
                        <span [class]="'chip dot tone-' + tone(e)">{{ dayText(e) }}</span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else if (r.workingDays) {
            <rp-empty icon="checkc" title="Present every working day" />
          } @else {
            <rp-empty icon="calendar" title="No working days read in this month" />
          }
        </div>
      </rp-modal>
    }
  `,
})
export class PayrollAttendance {
  private readonly api = inject(AttendanceApi);
  private readonly session = inject(SessionContext).console;

  protected readonly access = taskAccess(this.session, 'attendance.view');
  protected readonly pageSize = PAGE;
  protected readonly num = num;
  protected readonly plural = plural;
  protected readonly person = person;
  protected readonly fmt = formatDate;
  protected readonly weekday = weekdayOf;
  protected readonly staffTypes: readonly { v: Staff; l: string }[] = [
    { v: 'ALL', l: 'All staff' },
    { v: 'TEACHING', l: 'Teaching' },
    { v: 'OTHER', l: 'Non-teaching' },
  ];
  /** This month first, then the ones before it. */
  protected readonly monthOptions: readonly DropdownOption[] = Array.from(
    { length: MONTHS_BACK + 1 },
    (_, i) => {
      const m = addMonths(today().slice(0, 7), -i);
      return { v: m, l: monthLabel(m) };
    },
  );

  protected readonly month = signal(today().slice(0, 7));
  protected readonly staff = signal<Staff>('ALL');
  protected readonly q = signal('');
  protected readonly page = signal(1);
  protected readonly open = signal<PayrollRow | null>(null);
  protected readonly data = signal<PayrollMonth | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  private seq = 0;

  protected readonly label = computed(() => monthLabel(this.month()));
  protected readonly filtered = computed(() => {
    const s = this.staff();
    const q = this.q().trim().toLowerCase();
    return (this.data()?.items ?? []).filter(
      (r) =>
        (s === 'ALL' || (s === 'TEACHING') === r.member.teaching) &&
        (!q ||
          r.member.name.toLowerCase().includes(q) ||
          (r.member.employeeNo ?? '').toLowerCase().includes(q)),
    );
  });
  protected readonly shown = computed(() =>
    this.filtered().slice((this.page() - 1) * PAGE, this.page() * PAGE),
  );
  protected readonly withLop = computed(() => this.filtered().filter((r) => r.lopDays > 0).length);
  protected readonly lopTotal = computed(() => this.filtered().reduce((n, r) => n + r.lopDays, 0));
  protected readonly notMarked = computed(() =>
    this.filtered().reduce((n, r) => n + r.notMarked, 0),
  );

  constructor() {
    if (!this.access.denied()) void this.load();
  }

  async load() {
    const n = ++this.seq;
    this.loading.set(true);
    try {
      const d = await this.api.payroll(this.month());
      if (n !== this.seq) return;
      this.data.set(d);
      this.error.set('');
    } catch (e) {
      if (n === this.seq) this.error.set(problemText(e));
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
  }

  protected pickMonth(m: string) {
    if (!m || m === this.month()) return;
    this.month.set(m);
    this.page.set(1);
    this.open.set(null);
    this.data.set(null);
    void this.load();
  }

  /** "EMP-7 · Teacher · Science". */
  protected who(r: PayrollRow) {
    return [r.member.employeeNo, r.member.type, r.member.department].filter(Boolean).join(' · ');
  }

  protected leaveText(r: PayrollRow) {
    return [
      r.leave.casual ? plural(r.leave.casual, 'day') + ' casual' : '',
      r.leave.medical ? plural(r.leave.medical, 'day') + ' medical' : '',
      r.leave.earned ? plural(r.leave.earned, 'day') + ' earned' : '',
    ]
      .filter(Boolean)
      .join(', ');
  }

  protected tone(e: Exception) {
    switch (e.kind) {
      case 'ABSENT':
        return 'bad';
      case 'NOT_MARKED':
        return 'violet';
      case 'LEAVE':
        return 'info';
      default:
        return e.leaveType ? 'info' : 'warn';
    }
  }

  protected dayText(e: Exception) {
    switch (e.kind) {
      case 'LATE':
        return 'Late · not deducted';
      case 'HALF_DAY':
        return e.leaveType
          ? `Half day · on ${LEAVE[e.leaveType].toLowerCase()} leave, paid`
          : 'Half day · ½ day LOP';
      case 'ABSENT':
        return 'Absent · 1 day LOP';
      case 'LEAVE':
        return `${LEAVE[e.leaveType ?? 'CASUAL']} leave · paid`;
      default:
        return 'Not marked · check before payroll';
    }
  }

  protected export() {
    const d = this.data();
    if (!d) return;
    exportCsv(
      `campusone-payroll-attendance-${d.month}.csv`,
      [
        'Employee no.',
        'Name',
        'Type',
        'Department',
        'Joined on',
        'Left on',
        'Days in month',
        'Working days',
        'Present',
        'Late',
        'Half day',
        'Paid leave',
        'Casual leave',
        'Medical leave',
        'Earned leave',
        'Absent',
        'Not marked',
        'LOP days',
        'Payable days',
      ],
      this.filtered().map((r) => [
        r.member.employeeNo,
        person(r.member.name),
        r.member.type,
        r.member.department,
        r.member.joinedOn,
        r.member.leftOn,
        d.days,
        r.workingDays,
        r.present,
        r.late,
        r.halfDay,
        r.paidLeave,
        r.leave.casual,
        r.leave.medical,
        r.leave.earned,
        r.absent,
        r.notMarked,
        r.lopDays,
        r.payableDays,
      ]),
    );
  }
}
