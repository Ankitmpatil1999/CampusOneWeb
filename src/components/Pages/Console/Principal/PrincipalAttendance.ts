/**
 * The school's attendance for the principal on the web (client 2026-10-13; ATT-026): any day's
 * students by class section, or teachers and staff by name with their check-in and check-out and
 * whether they are on approved leave.
 */
import {
  ChangeDetectionStrategy,
  Component,
  type OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { formatDate, formatTime } from '../../../Utils/format';
import { person } from '../Applications/app-format';
import { num, problemText, today } from '../Structure/academic-format';
import {
  PrincipalApi,
  type PeopleType,
  type SchoolDay,
  type SectionDay,
  type StaffDay,
} from './principal.api';

const TYPES: readonly { v: PeopleType; l: string }[] = [
  { v: 'STUDENTS', l: 'Students' },
  { v: 'TEACHERS', l: 'Teachers' },
  { v: 'STAFF', l: 'Staff' },
];

const STATUS: Readonly<Record<string, { l: string; tone: string }>> = {
  PRESENT: { l: 'Present', tone: 'ok' },
  LATE: { l: 'Late', tone: 'warn' },
  HALF_DAY: { l: 'Half day', tone: 'warn' },
  ABSENT: { l: 'Absent', tone: 'bad' },
};

@Component({
  selector: 'rp-principal-attendance',
  imports: [Empty, Icon, Kpi, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="c-page">
    <rp-page-head title="School attendance" [sub]="'Attendance on ' + formatDate(date()) + '.'">
      <div class="fld-in" style="width: 180px">
        <input
          id="pa-date"
          type="date"
          aria-label="Day"
          [max]="todayDate"
          [value]="date()"
          (change)="setDate($event)"
        />
      </div>
    </rp-page-head>

    <div class="tabs" role="tablist" aria-label="Who">
      @for (x of types; track x.v) {
        <button
          type="button"
          class="tab"
          role="tab"
          [id]="'pa-tab-' + x.v.toLowerCase()"
          [class.on]="type() === x.v"
          [attr.aria-selected]="type() === x.v"
          (click)="pick(x.v)"
        >
          {{ x.l }}
        </button>
      }
    </div>

    @if (error()) {
      <div class="note tone-bad" role="alert" id="pa-error">
        <rp-icon name="alert" [size]="17" />
        <div class="grow">{{ error() }}</div>
        <button type="button" class="btn btn-sec btn-sm" (click)="load()">Try again</button>
      </div>
    } @else if (loading() && !data()) {
      <div class="card pad"><div class="sk" style="height: 220px; border-radius: 16px"></div></div>
    } @else if (data(); as d) {
      <!-- Each count of the day (client 2026-10-25): present (late and half day included), late,
           half day, absent, and the attendance of everyone. -->
      <div class="c-grid k5" id="pa-kpis">
        <rp-kpi
          label="Present"
          [value]="num(totals().present)"
          icon="usercheck"
          tone="ok"
          [delta]="'of ' + num(totals().all) + ' · ' + num(totals().onTime) + ' on time'"
        />
        <rp-kpi
          label="Late"
          [value]="num(totals().late)"
          icon="clock"
          tone="warn"
          delta="After the late cut-off"
        />
        <rp-kpi
          label="Half day"
          [value]="num(totals().halfDay)"
          icon="hourglass"
          tone="warn"
          delta="Counted as present"
        />
        <rp-kpi label="Absent" [value]="num(totals().absent)" icon="userx" tone="bad" />
        <rp-kpi
          label="Attendance"
          [value]="totals().pct === null ? '—' : totals().pct + '%'"
          icon="calcheck"
          [delta]="num(totals().notMarked) + ' not marked'"
        />
      </div>
      @if (!d.items.length) {
        <rp-empty icon="calcheck" title="No one to show" text="Try another day or group." />
      } @else if (d.type === 'STUDENTS') {
        <div class="card">
          <div class="tbl-wrap">
            <table class="tbl" id="pa-sections">
              <thead>
                <tr>
                  <th>Class</th>
                  <th class="r">Students</th>
                  <th class="r">Present</th>
                  <th class="r">Late</th>
                  <th class="r">Half day</th>
                  <th class="r">Absent</th>
                  <th class="r">Not marked</th>
                  <th style="width: 30%">Attendance</th>
                </tr>
              </thead>
              <tbody>
                @for (r of sections(); track r.section.id) {
                  <tr>
                    <td>
                      <b class="t-sb">{{ r.section.label }}</b>
                    </td>
                    <td class="r t-num">{{ num(r.students) }}</td>
                    <td class="r t-num">{{ num(r.attended) }}</td>
                    <td class="r t-num">{{ num(r.late ?? 0) }}</td>
                    <td class="r t-num">{{ num(r.halfDay ?? 0) }}</td>
                    <td class="r t-num">{{ num(r.absent) }}</td>
                    <td class="r t-num">
                      {{ num(Math.max(0, r.students - r.attended - r.absent)) }}
                    </td>
                    <td>
                      <div class="cc-pbar">
                        <span class="t-num">{{
                          r.attended + r.absent === 0 || r.percentage === null
                            ? 'Not marked'
                            : r.percentage + '%'
                        }}</span>
                        <div
                          class="bar"
                          [class.ok]="(r.percentage ?? 0) >= 85"
                          [class.warn]="(r.percentage ?? 0) < 85"
                        >
                          <i [style.width.%]="r.percentage ?? 0"></i>
                        </div>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      } @else {
        <div class="card">
          <div class="tbl-wrap">
            <table class="tbl" id="pa-staff">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Check-in</th>
                  <th>Check-out</th>
                </tr>
              </thead>
              <tbody>
                @for (r of staff(); track r.member.id) {
                  <tr>
                    <td>
                      <b class="t-sb">{{ person(r.member.name) }}</b>
                    </td>
                    <td>{{ r.member.type }}</td>
                    <td>
                      @if (r.onApprovedLeave) {
                        <span class="chip dot tone-info">On leave</span>
                      } @else if (r.status) {
                        <span
                          class="chip dot"
                          [class]="'chip dot tone-' + statusOf(r.status).tone"
                          >{{ statusOf(r.status).l }}</span
                        >
                      } @else {
                        <span class="chip dot tone-neutral">Not marked</span>
                      }
                    </td>
                    <td class="t-num">{{ time(r.checkInAt) }}</td>
                    <td class="t-num">{{ time(r.checkOutAt) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    }
  </div>`,
})
export class PrincipalAttendance implements OnInit {
  private readonly api = inject(PrincipalApi);
  protected readonly types = TYPES;
  protected readonly num = num;
  protected readonly person = person;
  protected readonly formatDate = formatDate;
  protected readonly Math = Math;
  protected readonly todayDate = today();
  protected readonly date = signal(today());
  protected readonly type = signal<PeopleType>('STUDENTS');
  protected readonly data = signal<SchoolDay | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  private seq = 0;

  protected readonly sections = computed(() =>
    this.data()?.type === 'STUDENTS' ? (this.data()!.items as readonly SectionDay[]) : [],
  );
  protected readonly staff = computed(() =>
    this.data() && this.data()!.type !== 'STUDENTS'
      ? (this.data()!.items as readonly StaffDay[])
      : [],
  );
  protected readonly totals = computed(() => {
    const d = this.data();
    let all = 0;
    let present = 0;
    let onTime = 0;
    let late = 0;
    let halfDay = 0;
    let absent = 0;
    if (d?.type === 'STUDENTS') {
      for (const r of this.sections()) {
        all += r.students;
        present += r.attended;
        late += r.late ?? 0;
        halfDay += r.halfDay ?? 0;
        absent += r.absent;
        onTime += r.present ?? r.attended - (r.late ?? 0) - (r.halfDay ?? 0);
      }
    } else {
      for (const r of this.staff()) {
        all += 1;
        if (r.status === 'ABSENT') absent += 1;
        else if (r.status) present += 1;
        if (r.status === 'PRESENT') onTime += 1;
        if (r.status === 'LATE') late += 1;
        if (r.status === 'HALF_DAY') halfDay += 1;
      }
    }
    return {
      all,
      // Present = on time + late + half day.
      present,
      onTime,
      late,
      halfDay,
      absent,
      notMarked: Math.max(0, all - present - absent),
      // No percentage until someone is marked.
      pct: present + absent ? Math.round((present * 1000) / all) / 10 : null,
    };
  });

  ngOnInit() {
    void this.load();
  }

  protected pick(t: PeopleType) {
    if (t === this.type()) return;
    this.type.set(t);
    void this.load();
  }

  protected setDate(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    if (!v || v === this.date()) return;
    this.date.set(v);
    void this.load();
  }

  async load() {
    const id = ++this.seq;
    this.loading.set(true);
    try {
      const d = await this.api.attendance(this.date(), this.type());
      if (id !== this.seq) return;
      this.data.set(d);
      this.error.set('');
    } catch (e) {
      if (id === this.seq) this.error.set(problemText(e));
    } finally {
      if (id === this.seq) this.loading.set(false);
    }
  }

  protected statusOf(s: string) {
    return STATUS[s] ?? { l: s, tone: 'neutral' };
  }
  protected time(v: string | null) {
    return v ? formatTime(v) : '—';
  }
}
