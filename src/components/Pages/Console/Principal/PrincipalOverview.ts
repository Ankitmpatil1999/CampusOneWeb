/**
 * The principal's school overview on the web (client 2026-10-13; the app's principal home, ACA-060):
 * the people of the school, today's attendance of students, teachers and staff, the leave waiting for
 * a decision and how the classes are doing — each opening its own page.
 * Enhanced for Dean (Academics & Student Affairs) with dedicated branch & department breakdown.
 */
import {
  ChangeDetectionStrategy,
  Component,
  type OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionContext } from '../../../../Context/SessionContext';
import { Card, Kpi, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { formatDate } from '../../../Utils/format';
import { greeting } from '../../../Utils/greeting';
import { ownHome } from '../../../Utils/navigation';
import { num, problemText } from '../Structure/academic-format';
import { PrincipalApi, type DayCount, type Overview } from './principal.api';

@Component({
  selector: 'rp-principal-overview',
  imports: [Card, Icon, Kpi, PageHead, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="c-page">
    <rp-page-head
      [title]="pageTitle()"
      [sub]="pageSub()"
    >
      <button type="button" class="btn btn-sec" [disabled]="loading()" (click)="load()">
        <rp-icon name="refresh" [size]="17" /><span>Refresh</span>
      </button>
    </rp-page-head>

    @if (error()) {
      <div class="note tone-bad" role="alert" id="po-error">
        <rp-icon name="alert" [size]="17" />
        <div class="grow">{{ error() }}</div>
        <button type="button" class="btn btn-sec btn-sm" (click)="load()">Try again</button>
      </div>
    } @else if (!data()) {
      <div class="card pad"><div class="sk" style="height: 260px; border-radius: 16px"></div></div>
    } @else if (data(); as d) {
      <div class="c-grid k4" id="po-kpis">
        <rp-kpi
          [label]="isDean() ? 'Total Students' : 'Students'"
          [value]="num(d.people.students)"
          icon="grad"
          [delta]="present(d.attendanceToday.students)"
          link="/console/principal-students"
        />
        <rp-kpi
          [label]="isDean() ? 'Total Faculty' : 'Teachers'"
          [value]="num(d.people.teachers)"
          icon="briefcase"
          [delta]="present(d.attendanceToday.teachers)"
          link="/console/principal-teachers"
        />
        <rp-kpi
          [label]="isDean() ? 'College Staff' : 'Staff'"
          [value]="num(d.people.staff)"
          icon="users"
          [delta]="present(d.attendanceToday.staff)"
          link="/console/principal-attendance"
        />
        <rp-kpi
          [label]="isDean() ? 'Pending Approvals' : 'Leave awaiting you'"
          [value]="num(d.approvals.teacherLeaveAwaitingYou)"
          icon="plane"
          [tone]="d.approvals.teacherLeaveAwaitingYou ? 'warn' : null"
          [delta]="d.staffOnLeaveToday + ' on leave today'"
          link="/console/principal-leave"
        />
      </div>

      <div class="c-grid k2">
        <rp-card title="Attendance today" icon="calcheck">
          <div class="stack g16" id="po-attendance">
            @for (r of rows(d); track r.label) {
              <div class="stack g6">
                <div class="row between">
                  <b>{{ r.label }}</b>
                  <span class="t-num">{{ pct(r.day) === null ? '—' : pct(r.day) + '%' }}</span>
                </div>
                <div class="cc-pbar">
                  <div
                    class="bar"
                    [class.ok]="(r.day.percentage ?? 0) >= 85"
                    [class.warn]="(r.day.percentage ?? 0) < 85"
                  >
                    <i [style.width.%]="r.day.percentage ?? 0"></i>
                  </div>
                </div>
                <!-- Each count of the day (client 2026-10-25). -->
                <div class="t-sm t-muted">
                  @if (r.day.late !== undefined) {
                    {{ num(r.day.present ?? 0) }} on time · {{ num(r.day.late) }} late ·
                    {{ num(r.day.halfDay ?? 0) }} half day · {{ num(r.day.absent) }} absent ·
                    {{ num(r.day.notMarked) }} not marked · {{ num(r.day.total) }} in all
                  } @else {
                    {{ num(r.day.attended) }} present · {{ num(r.day.absent) }} absent ·
                    {{ num(r.day.notMarked) }} not marked · {{ num(r.day.total) }} in all
                  }
                </div>
              </div>
            }
            <a class="btn btn-sec btn-sm" routerLink="/console/principal-attendance"
              ><rp-icon name="right" [size]="15" /><span>Attendance by class and by name</span></a
            >
          </div>
        </rp-card>

        <div class="stack g16">
          <rp-card title="Waiting for a decision" icon="approve">
            <dl class="kv" id="po-approvals">
              <dt>Teacher and staff leave with you</dt>
              <dd>
                <b class="t-num">{{ num(d.approvals.teacherLeaveAwaitingYou) }}</b>
              </dd>
              <dt>With the coordinator first</dt>
              <dd class="t-num">{{ num(d.approvals.teacherLeaveWithCoordinator) }}</dd>
              <dt>Student leave with class teachers</dt>
              <dd class="t-num">{{ num(d.approvals.studentLeavePending) }}</dd>
              <dt>Teachers and staff on leave today</dt>
              <dd class="t-num">{{ num(d.staffOnLeaveToday) }}</dd>
            </dl>
            <div class="row g8 mt8">
              <a class="btn btn-pri btn-sm" routerLink="/console/principal-leave"
                ><rp-icon name="plane" [size]="15" /><span>Decide leave</span></a
              >
            </div>
          </rp-card>
          <rp-card title="Academic Performance" icon="award">
            <dl class="kv" id="po-academics">
              <dt>Class sections</dt>
              <dd class="t-num">{{ num(d.academics.sections) }}</dd>
              <dt>Top performers</dt>
              <dd class="t-num">{{ num(d.academics.topPerformers) }}</dd>
              <dt>Need support</dt>
              <dd class="t-num">{{ num(d.academics.needsSupport) }}</dd>
              <dt>Upcoming exams</dt>
              <dd class="t-num">{{ num(d.academics.upcomingExams) }}</dd>
            </dl>
            <div class="row g8 mt8">
              <a class="btn btn-sec btn-sm" routerLink="/console/principal-academics"
                ><rp-icon name="right" [size]="15" /><span>See the classes</span></a
              >
            </div>
          </rp-card>
        </div>
      </div>

      @if (academicDepartments().length > 0) {
        <div style="margin-top: 20px">
          <rp-card title="Assigned Academic Departments & Branches" icon="building">
            <div style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center">
              <span class="t-sm t-muted">Overview of engineering branches, student enrolments and faculty assignments</span>
              <span class="t-xs t-muted t-mono">{{ academicDepartments().length }} departments</span>
            </div>
            <div class="tbl-wrap">
              <table class="tbl" id="po-departments-table">
                <thead>
                  <tr>
                    <th>Department / Branch</th>
                    <th class="t-num">Enrolled Students</th>
                    <th class="t-num">Faculty</th>
                    <th class="r">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (dept of academicDepartments(); track dept.id) {
                    <tr>
                      <td>
                        <b class="t-sb">{{ dept.name }}</b>
                      </td>
                      <td class="t-num">
                        <b>{{ num(dept.students) }}</b> <span class="t-xs t-muted">students</span>
                      </td>
                      <td class="t-num">
                        <b>{{ num(dept.faculty) }}</b> <span class="t-xs t-muted">faculty</span>
                      </td>
                      <td class="r">
                        <a class="btn btn-ghost btn-sm" routerLink="/console/principal-students">
                          <rp-icon name="right" [size]="14" /><span>Students</span>
                        </a>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </rp-card>
        </div>
      }
    }
  </div>`,
})
export class PrincipalOverview implements OnInit {
  private readonly api = inject(PrincipalApi);
  protected readonly session = inject(SessionContext).console;
  protected readonly num = num;
  protected readonly formatDate = formatDate;
  protected readonly greeting = greeting;

  protected readonly isDean = computed(
    () =>
      this.session()?.roles?.some(
        (r) => r.code === 'DEAN' || r.name.toLowerCase().includes('dean'),
      ) ?? false,
  );

  /** The principal's own dashboard (no institution home): the greeting, then the task cards. */
  protected readonly home = computed(
    () => ownHome(this.session()?.subTasks ?? []) === 'principal' || this.isDean(),
  );

  protected readonly pageTitle = computed(() => {
    if (this.isDean()) {
      return this.home()
        ? `${greeting(this.session()?.name ?? '')} (Dean Office)`
        : 'Dean Academic Overview';
    }
    return this.home() ? greeting(this.session()?.name ?? '') : 'School overview';
  });

  protected readonly pageSub = computed(() => {
    const d = this.data();
    const inst = this.session()?.institution?.name;
    const dateStr = d
      ? `${formatDate(d.date)} · Academic year ${d.year.label}`
      : 'Today at the campus.';
    if (this.isDean()) {
      return `${inst ? inst + ' · ' : ''}Dean (Academics & Student Affairs) · ${dateStr}`;
    }
    return (this.home() ? 'School overview · ' : '') + dateStr;
  });

  protected readonly data = signal<Overview | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');

  protected readonly academicDepartments = computed(() => {
    return (this.data()?.departments ?? []).filter((d) => d.students > 0);
  });

  ngOnInit() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.data.set(await this.api.overview());
      this.error.set('');
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected rows(d: Overview): { label: string; day: DayCount }[] {
    return [
      { label: 'Students', day: d.attendanceToday.students },
      { label: this.isDean() ? 'Faculty & Professors' : 'Teachers', day: d.attendanceToday.teachers },
      { label: 'College Staff', day: d.attendanceToday.staff },
    ];
  }

  /** No percentage until someone is marked (a 0% before the register opens would mislead). */
  protected pct(day: DayCount) {
    return day.attended + day.absent === 0 ? null : day.percentage;
  }

  protected present(day: DayCount) {
    const p = this.pct(day);
    return p === null ? 'Not marked yet' : `${p}% present today`;
  }
}
