/**
 * The principal's school overview on the web (client 2026-10-13; the app's principal home, ACA-060):
 * the people of the school, today's attendance of students, teachers and staff, the leave waiting for
 * a decision and how the classes are doing — each opening its own page.
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
import { TaskLauncher } from '../../../Shared/TaskLauncher';
import { formatDate } from '../../../Utils/format';
import { greeting } from '../../../Utils/greeting';
import { ownHome } from '../../../Utils/navigation';
import { num, problemText } from '../Structure/academic-format';
import { PrincipalApi, type DayCount, type Overview } from './principal.api';

@Component({
  selector: 'rp-principal-overview',
  imports: [Card, Icon, Kpi, PageHead, RouterLink, TaskLauncher],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="c-page">
    <rp-page-head
      [title]="home() ? greeting(session()?.name ?? '') : 'School overview'"
      [sub]="
        (home() ? 'School overview · ' : '') +
        (data()
          ? formatDate(data()!.date) + ' · academic year ' + data()!.year.label
          : 'Today at the school.')
      "
    >
      <button type="button" class="btn btn-sec" [disabled]="loading()" (click)="load()">
        <rp-icon name="refresh" [size]="17" /><span>Refresh</span>
      </button>
    </rp-page-head>
    <!-- The principal's dashboard (client 2026-10-27): the task cards under the greeting. -->
    @if (home()) {
      <rp-task-launcher surface="console" />
    }

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
          label="Students"
          [value]="num(d.people.students)"
          icon="grad"
          [delta]="present(d.attendanceToday.students)"
          link="/console/principal-people"
        />
        <rp-kpi
          label="Teachers"
          [value]="num(d.people.teachers)"
          icon="briefcase"
          [delta]="present(d.attendanceToday.teachers)"
          link="/console/principal-attendance"
        />
        <rp-kpi
          label="Staff"
          [value]="num(d.people.staff)"
          icon="users"
          [delta]="present(d.attendanceToday.staff)"
          link="/console/principal-attendance"
        />
        <rp-kpi
          label="Leave awaiting you"
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
          <rp-card title="Academics" icon="award">
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
    }
  </div>`,
})
export class PrincipalOverview implements OnInit {
  private readonly api = inject(PrincipalApi);
  protected readonly session = inject(SessionContext).console;
  protected readonly num = num;
  protected readonly formatDate = formatDate;
  protected readonly greeting = greeting;
  /** The principal's own dashboard (no institution home): the greeting, then the task cards. */
  protected readonly home = computed(() => ownHome(this.session()?.subTasks ?? []) === 'principal');
  protected readonly data = signal<Overview | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');

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
      { label: 'Teachers', day: d.attendanceToday.teachers },
      { label: 'Staff', day: d.attendanceToday.staff },
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
