/**
 * Teacher Overview for the principal on the web (SRS 20.33; ACA-080, ACA-081; client 2026-10-14):
 * the "Faculty & Teacher Directory" built from the year's class-teacher and subject-teacher mapping —
 * each teacher once, their first assignment's class, their roles and how many assignments they hold —
 * searched, filtered by class and paged on the page (10, 50 or 100); a teacher opens their academic
 * detail in place of the list. Read-only (RNG-ACA-404).
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
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Pager } from '../../../Shared/Pager';
import { formatDate, formatMobile, formatTime } from '../../../Utils/format';
import { person } from '../Applications/app-format';
import { inr } from '../Fees/fee-format';
import {
  PrincipalApi,
  type OverviewTeacher,
  type TeacherDetail,
  type TeacherRole,
} from './principal.api';

const ROLE: Readonly<Record<TeacherRole, string>> = {
  CLASS_TEACHER: 'Class Teacher',
  SUBJECT_TEACHER: 'Subject Teacher',
};

/** The detail view's tabs (client 2026-10-14); the first is the SRS view. */
type DetailTab = 'academic' | 'personal' | 'timetable' | 'attendance' | 'work' | 'other';
const DETAIL_TABS: readonly { v: DetailTab; l: string }[] = [
  { v: 'academic', l: 'Academic' },
  { v: 'personal', l: 'Personal' },
  { v: 'timetable', l: 'Timetable' },
  { v: 'attendance', l: 'Attendance & leave' },
  { v: 'work', l: 'Homework & exams' },
  { v: 'other', l: 'Transport & wallet' },
];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TODAY: Readonly<Record<string, string>> = {
  PRESENT: 'Present',
  LATE: 'Late',
  HALF_DAY: 'Half day',
  ABSENT: 'Absent',
};
const LEAVE_STATE: Readonly<Record<string, string>> = {
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  WITH_COORDINATOR: 'With the coordinator',
  WITH_PRINCIPAL: 'Waiting for you',
};

/** "Class <class> - Sec <section>" of the first assignment, else "Unassigned" (SRS 20.33.1). */
export const primaryClassOf = (t: Pick<OverviewTeacher, 'primaryClass'>) =>
  t.primaryClass
    ? `Class ${t.primaryClass.class}${t.primaryClass.section ? ` - Sec ${t.primaryClass.section}` : ''}`
    : 'Unassigned';

@Component({
  selector: 'rp-principal-teachers',
  imports: [Dropdown, Empty, Icon, Kpi, PageHead, Pager],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="c-page">
    @if (openId()) {
      <div class="row">
        <button type="button" class="btn btn-ghost btn-sm" id="to-back" (click)="back()">
          <rp-icon name="left" [size]="15" /><span>All teachers</span>
        </button>
      </div>
      @if (detailError()) {
        <div class="note tone-bad" role="alert" id="to-detail-error">
          <rp-icon name="alert" [size]="17" />
          <div class="grow">{{ detailError() }}</div>
          <button type="button" class="btn btn-sec btn-sm" (click)="view(openId()!)">
            Try again
          </button>
        </div>
      } @else if (!detail()) {
        <div class="card pad" aria-busy="true" id="to-detail-loading">
          <p class="t-sm t-muted">Loading teacher details...</p>
          <div class="sk" style="height: 200px; border-radius: 16px"></div>
        </div>
      } @else {
        @let d = detail()!;
        <rp-page-head [title]="person(d.name)" [sub]="subOf(d)" />
        <div class="c-grid k4" id="to-counts">
          <rp-kpi label="Classes" [value]="'' + d.counts.classes" icon="school" />
          <rp-kpi label="Sections" [value]="'' + d.counts.sections" icon="grid" />
          <rp-kpi label="Subjects" [value]="'' + d.counts.subjects" icon="book" />
          <rp-kpi
            label="Periods a week"
            [value]="'' + d.timetable.periodsAWeek"
            icon="calendar"
            [delta]="todayText(d)"
          />
        </div>
        <!-- More about the teacher (client 2026-10-14), in tabs; the first is the SRS view. -->
        <div class="tabs" role="tablist" aria-label="Teacher details">
          @for (x of tabs; track x.v) {
            <button
              type="button"
              class="tab"
              role="tab"
              [id]="'td-tab-' + x.v"
              [class.on]="tab() === x.v"
              [attr.aria-selected]="tab() === x.v"
              (click)="tab.set(x.v)"
            >
              {{ x.l }}
            </button>
          }
        </div>
        @switch (tab()) {
          @case ('academic') {
            <div class="card pad">
              <dl class="kv" id="to-contact">
                <dt>Email</dt>
                <dd>{{ d.email || '—' }}</dd>
                <dt>Mobile Number</dt>
                <dd>{{ d.mobile ? mobile(d.mobile) : '—' }}</dd>
                <dt>Class teacher of</dt>
                <dd id="to-led">
                  @for (c of d.classTeacherOf; track $index) {
                    <div>{{ c.class }} {{ c.section }} · {{ c.students }} students</div>
                  } @empty {
                    —
                  }
                </dd>
                <dt>Coordinator of</dt>
                <dd>{{ d.coordinatorOf.length ? d.coordinatorOf.join(', ') : '—' }}</dd>
              </dl>
            </div>
            @if (!d.assignments.length) {
              <div class="note tone-info" id="to-none">
                <rp-icon name="info" [size]="17" />
                <div class="grow">No academic assignments found for this teacher.</div>
              </div>
            } @else {
              <div class="card">
                <div class="tbl-wrap">
                  <table class="tbl" id="to-assignments">
                    <thead>
                      <tr>
                        <th>Role</th>
                        <th>Class</th>
                        <th>Section</th>
                        <th>Subject</th>
                        <th class="r">Periods a week</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (a of d.assignments; track $index) {
                        <tr>
                          <td>{{ role(a.kind) }}</td>
                          <td>{{ a.class }}</td>
                          <td>{{ a.section ?? '—' }}</td>
                          <td>{{ a.subject ?? '—' }}</td>
                          <td class="r t-num">{{ a.subject ? a.periodsAWeek : '—' }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            }
          }
          @case ('personal') {
            <div class="card pad">
              <dl class="kv" id="to-personal">
                <dt>Full name</dt>
                <dd>{{ person(d.name) }}</dd>
                <dt>Member ID</dt>
                <dd class="t-mono">{{ d.memberNo }}</dd>
                <dt>Employee No</dt>
                <dd class="t-mono">{{ d.employeeNo ?? '—' }}</dd>
                <dt>User type</dt>
                <dd>{{ d.userType }}</dd>
                <dt>Department</dt>
                <dd>{{ d.department || '—' }}</dd>
                <dt>Gender</dt>
                <dd>{{ cap(d.gender) || '—' }}</dd>
                <dt>Date of birth</dt>
                <dd>{{ d.dateOfBirth ? date(d.dateOfBirth) : '—' }}</dd>
                <dt>Joined on</dt>
                <dd>{{ d.joinedOn ? date(d.joinedOn) : '—' }}</dd>
                <dt>Status</dt>
                <dd>
                  {{
                    d.status === 'ACTIVE'
                      ? 'Active'
                      : d.status === 'SUSPENDED'
                        ? 'Suspended'
                        : 'Inactive'
                  }}{{ d.statusReason ? ' · ' + d.statusReason : '' }}
                </dd>
                <dt>Email</dt>
                <dd>{{ d.email || '—' }}</dd>
                <dt>Mobile Number</dt>
                <dd>{{ d.mobile ? mobile(d.mobile) : '—' }}</dd>
                <dt>CampusOne account</dt>
                <dd>{{ d.campusOneAccount ? 'Linked' : 'Not linked' }}</dd>
                <dt>Console roles</dt>
                <dd>{{ d.consoleRoles.length ? d.consoleRoles.join(', ') : '—' }}</dd>
                @for (c of d.customFields; track c.label) {
                  <dt>{{ c.label }}</dt>
                  <dd>{{ value(c.value) }}</dd>
                }
              </dl>
            </div>
          }
          @case ('timetable') {
            @if (!d.timetable.lessons.length) {
              <rp-empty
                icon="calendar"
                title="No lessons on the timetable"
                [text]="'Nothing is timetabled for ' + person(d.name) + ' in ' + d.year.label + '.'"
              />
            } @else {
              <div class="card">
                <div class="tbl-wrap">
                  <table class="tbl" id="to-timetable">
                    <thead>
                      <tr>
                        <th>Day</th>
                        <th>Period</th>
                        <th>Time</th>
                        <th>Class</th>
                        <th>Subject</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (l of d.timetable.lessons; track $index) {
                        <tr>
                          <td>{{ dayName(l.day) }}</td>
                          <td>{{ l.period }}</td>
                          <td class="t-num">{{ l.startsAt ?? '' }}–{{ l.endsAt ?? '' }}</td>
                          <td>{{ l.class }} {{ l.section }}</td>
                          <td>{{ l.subject }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            }
          }
          @case ('attendance') {
            <div class="card pad">
              <dl class="kv" id="to-attendance">
                <dt>Today</dt>
                <dd>{{ todayText(d) }}</dd>
                <dt>This year</dt>
                <dd>
                  {{
                    d.attendance.percentage === null
                      ? 'Not marked yet'
                      : d.attendance.percentage + '% of ' + d.attendance.days + ' days marked'
                  }}
                </dd>
                <dt>Present · late · half day · absent</dt>
                <dd>
                  {{ d.attendance.present }} · {{ d.attendance.late }} ·
                  {{ d.attendance.halfDay }} ·
                  {{ d.attendance.absent }}
                </dd>
              </dl>
            </div>
            <div class="card">
              <div class="tbl-wrap">
                <table class="tbl" id="to-balances">
                  <thead>
                    <tr>
                      <th>Leave</th>
                      <th class="r">For the year</th>
                      <th class="r">Taken</th>
                      <th class="r">Waiting</th>
                      <th class="r">Left</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (b of d.leave.balances; track b.type) {
                      <tr>
                        <td>{{ b.label }}</td>
                        <td class="r t-num">{{ b.total }}</td>
                        <td class="r t-num">{{ b.used }}</td>
                        <td class="r t-num">{{ b.pending }}</td>
                        <td class="r t-num">{{ b.left }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
            @if (d.leave.recent.length) {
              <div class="card">
                <div class="tbl-wrap">
                  <table class="tbl" id="to-leaves">
                    <thead>
                      <tr>
                        <th>Leave</th>
                        <th>Dates</th>
                        <th class="r">Days</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (l of d.leave.recent; track $index) {
                        <tr>
                          <td>{{ cap(l.type) }} leave</td>
                          <td>
                            {{ l.from ? date(l.from) : '—'
                            }}{{ l.to && l.to !== l.from ? ' – ' + date(l.to) : '' }}
                          </td>
                          <td class="r t-num">{{ l.days }}</td>
                          <td>{{ leaveState(l.state) }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            } @else {
              <p class="t-sm t-muted">No leave applied for in {{ d.year.label }}.</p>
            }
          }
          @case ('work') {
            <div class="card pad">
              <dl class="kv" id="to-work">
                <dt>Homework set</dt>
                <dd>{{ d.homework.set }} ({{ d.homework.open }} still open)</dd>
                <dt>Submissions to review</dt>
                <dd>{{ d.homework.toReview }}</dd>
                <dt>Exams of their subjects</dt>
                <dd>{{ d.exams.total }}</dd>
                <dt>Marks entered</dt>
                <dd>{{ d.exams.marksEntered }} of {{ d.exams.total }}</dd>
                <dt>Results published</dt>
                <dd>{{ d.exams.published }}</dd>
                <dt>Marks still due</dt>
                <dd [class.t-bad]="d.exams.marksDue > 0">
                  {{ d.exams.marksDue ? d.exams.marksDue + ' exams held without marks' : 'None' }}
                </dd>
              </dl>
            </div>
            @if (d.exams.upcoming.length) {
              <div class="card">
                <div class="tbl-wrap">
                  <table class="tbl" id="to-upcoming">
                    <thead>
                      <tr>
                        <th>Upcoming exam</th>
                        <th>Class</th>
                        <th>Subject</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (e of d.exams.upcoming; track $index) {
                        <tr>
                          <td>{{ e.exam }}</td>
                          <td>{{ e.class }} {{ e.section }}</td>
                          <td>{{ e.subject }}</td>
                          <td>{{ e.date ? date(e.date) : '—' }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            }
          }
          @case ('other') {
            <div class="card pad">
              <dl class="kv" id="to-transport">
                <dt>School transport</dt>
                <dd>
                  @if (d.transport; as t) {
                    {{ t.route.code }} · {{ t.route.name }} — {{ t.stop
                    }}{{ t.pickUp ? ', pick-up ' + t.pickUp : ''
                    }}{{ t.drop ? ', drop ' + t.drop : '' }}
                  } @else {
                    Not allocated
                  }
                </dd>
                <dt>Campus wallet</dt>
                <dd>
                  {{
                    d.wallet
                      ? inr(d.wallet.balance) + ' available · ' + cap(d.wallet.status)
                      : 'No wallet'
                  }}
                </dd>
              </dl>
            </div>
          }
        }
      }
    } @else {
      <rp-page-head
        title="Faculty & Teacher Directory"
        [sub]="
          'Teachers of the class-teacher and subject-teacher mapping' +
          (year() ? ' for ' + year() : '') +
          '.'
        "
      />

      <div class="row g12 wrap" style="align-items: center">
        <div class="fld-in" style="min-width: 260px; flex: 1 1 260px; max-width: 380px">
          <rp-icon name="search" [size]="16" />
          <input
            id="to-q"
            type="search"
            maxlength="60"
            placeholder="Search teacher..."
            aria-label="Search teachers"
            [value]="q()"
            (input)="q.set(val($event)); page.set(1)"
          />
        </div>
        <div style="min-width: 180px">
          <rp-dd
            inputId="to-class"
            [options]="classOptions()"
            [value]="cls()"
            placeholder="All Classes"
            (changed)="cls.set($event); page.set(1)"
          />
        </div>
        <div style="min-width: 140px">
          <rp-dd
            inputId="to-size"
            [options]="sizes"
            [value]="'' + size()"
            (changed)="size.set(+$event); page.set(1)"
          />
        </div>
      </div>

      @if (error()) {
        <div class="note tone-bad" role="alert" id="to-error">
          <rp-icon name="alert" [size]="17" />
          <div class="grow">{{ error() }}</div>
          <button type="button" class="btn btn-sec btn-sm" (click)="load()">Try again</button>
        </div>
      } @else if (loading()) {
        <div class="card pad" aria-busy="true" id="to-loading">
          <p class="t-sm t-muted">Loading teacher directory...</p>
          <div class="sk" style="height: 220px; border-radius: 16px"></div>
        </div>
      } @else if (!shown().length) {
        <rp-empty
          icon="users"
          title="No teachers found matching your filter criteria"
          text="Try another name or class."
        />
      } @else {
        <div class="card">
          <div class="tbl-wrap">
            <table class="tbl" id="to-table">
              <thead>
                <tr>
                  <th>Teacher Name</th>
                  <th>Primary Class</th>
                  <th>Role</th>
                  <th class="r">Assignments</th>
                  <th class="r">Action</th>
                </tr>
              </thead>
              <tbody>
                @for (t of pageRows(); track t.id) {
                  <tr>
                    <td>
                      <b class="t-sb">{{ person(t.name) }}</b>
                    </td>
                    <td>{{ primaryClassOf(t) }}</td>
                    <td>{{ roles(t) }}</td>
                    <td class="r t-num">{{ t.assignments }}</td>
                    <td class="r">
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs"
                        [attr.data-teacher]="t.id"
                        (click)="view(t.id)"
                      >
                        <rp-icon name="eye" [size]="15" /><span>View</span>
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <rp-pager
            [total]="shown().length"
            [page]="page()"
            [size]="size()"
            (go)="page.set($event)"
          />
        </div>
      }
    }
  </div>`,
})
export class PrincipalTeachers implements OnInit {
  private readonly api = inject(PrincipalApi);
  protected readonly person = person;
  protected readonly primaryClassOf = primaryClassOf;
  protected readonly sizes: readonly DropdownOption[] = [
    { v: '10', l: '10 items' },
    { v: '50', l: '50 items' },
    { v: '100', l: '100 items' },
  ];
  protected readonly all = signal<readonly OverviewTeacher[]>([]);
  protected readonly classes = signal<readonly { id: string; name: string }[]>([]);
  protected readonly year = signal('');
  protected readonly q = signal('');
  protected readonly cls = signal('');
  protected readonly size = signal(10);
  protected readonly page = signal(1);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly openId = signal<string | null>(null);
  protected readonly detail = signal<TeacherDetail | null>(null);
  protected readonly detailError = signal('');
  protected readonly tabs = DETAIL_TABS;
  protected readonly tab = signal<DetailTab>('academic');
  protected readonly inr = inr;
  private seq = 0;

  /** The console's class filter reads the class master (RNG-ACA-405). */
  protected readonly classOptions = computed<DropdownOption[]>(() => [
    { v: '', l: 'All Classes' },
    ...this.classes().map((c) => ({ v: c.id, l: c.name })),
  ]);
  /** Search and class together (AND), on the page. */
  protected readonly shown = computed(() => {
    const q = this.q().trim().toLowerCase();
    const cls = this.cls();
    return this.all().filter(
      (t) => (!cls || t.classIds.includes(cls)) && (!q || t.name.toLowerCase().includes(q)),
    );
  });
  protected readonly pageRows = computed(() => {
    const from = (this.page() - 1) * this.size();
    return this.shown().slice(from, from + this.size());
  });

  ngOnInit() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      const r = await this.api.teacherOverview();
      this.all.set(r.items);
      this.classes.set(r.classes);
      this.year.set(r.year.label);
    } catch {
      this.error.set('Failed to fetch teacher overview data. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  /** The teacher's academic detail, in place of the list (SRS 20.33). */
  protected async view(id: string) {
    const n = ++this.seq;
    this.openId.set(id);
    this.detail.set(null);
    this.detailError.set('');
    this.tab.set('academic');
    try {
      const d = await this.api.teacher(id);
      if (n === this.seq) this.detail.set(d);
    } catch {
      if (n === this.seq)
        this.detailError.set('Failed to fetch teacher details. Please try again.');
    }
  }

  protected back() {
    this.seq++;
    this.openId.set(null);
    this.detail.set(null);
    this.detailError.set('');
  }

  protected roles(t: OverviewTeacher) {
    return t.roles.map((r) => ROLE[r]).join(' · ');
  }
  protected role(r: TeacherRole) {
    return ROLE[r];
  }
  protected mobile(m: string) {
    return formatMobile(m);
  }
  /** User type, employee number and the year. */
  protected subOf(d: TeacherDetail) {
    return [d.userType, d.employeeNo, d.year.label].filter(Boolean).join(' · ');
  }
  /** Today in a word: on leave, the day's status with the check-in, or not marked. */
  protected todayText(d: TeacherDetail) {
    if (d.today.onLeave) return 'On leave today';
    if (!d.today.status) return 'Not marked today';
    const s = TODAY[d.today.status] ?? d.today.status;
    return d.today.checkInAt ? `${s} today · in at ${formatTime(d.today.checkInAt)}` : `${s} today`;
  }
  protected dayName(n: number) {
    return DAYS[n - 1] ?? `Day ${n}`;
  }
  protected leaveState(s: string) {
    return LEAVE_STATE[s] ?? this.cap(s);
  }
  protected cap(s: string | null | undefined) {
    return s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '';
  }
  protected date(v: string) {
    return formatDate(v);
  }
  protected value(v: unknown) {
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    return v === null || v === undefined || v === '' ? '—' : String(v);
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
}
