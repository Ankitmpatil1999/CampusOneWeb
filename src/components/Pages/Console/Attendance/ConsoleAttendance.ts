import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Avatar } from '../../../Shared/Avatar';
import { Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Pager } from '../../../Shared/Pager';
import { formatDate, formatTime } from '../../../Utils/format';
import { person } from '../Applications/app-format';
import { plural } from '../Fees/fee-format';
import { AcademicYears, YearBanner, YearPicker } from '../Structure/academic-year';
import {
  addDays,
  daysBetween,
  num,
  problemText,
  today,
  weekday,
} from '../Structure/academic-format';
import { StructureApi, type ClassView } from '../Structure/structure.api';
import { TeachersApi } from '../Teachers/teachers.api';
import {
  AttendanceApi,
  type AttendanceOverview,
  type AttendanceReport,
  type MemberAttendance,
  type SectionDay,
  type StaffDay,
  type StaffRoster,
} from './attendance.api';
import {
  STATUS_CHIP,
  attTone,
  dayStatus,
  exportCsv,
  pct,
  pctText,
  taskAccess,
} from './attendance-format';
import { AttendanceTypes } from './AttendanceTypes';
import { AutoAbsentPanel } from './AutoAbsentPanel';
import { ManualMarking } from './ManualMarking';
import { SectionDrawer } from './SectionDrawer';

type Tab = 'ov' | 'mk' | 'aa' | 'ty';
type Mode = 'Day' | 'Range';
type MemberType = 'STUDENT' | 'TEACHER' | 'STAFF';
type SortKey = 'l' | 'strength' | 'present' | 'late' | 'absent' | 'unmarked' | 'pct';

/** The most days a range reads (one overview a school day). */
const MAX_RANGE = 31;
const PAGE = 15;

/** A class-section's row: the day, or the range summed (and averaged a day). */
export interface SectionRow {
  readonly id: string;
  readonly label: string;
  readonly order: number;
  readonly classId: string;
  readonly teacher: string;
  readonly strength: number;
  readonly total: number;
  readonly present: number;
  readonly halfDay: number;
  readonly late: number;
  readonly absent: number;
  readonly unmarked: number;
  readonly days: number;
  readonly pct: number;
}

/**
 * c.attendance — Attendance (SRS 21.10, 21.11, FR-ATT-05…07, CR-10, CR-13; ATT-008…014; prototype
 * c.attendance): the day — or a range of days — by class-section for students and by person for
 * teaching and non-teaching staff, with a class-section's drawer; manual marking of a class-section
 * for a date (overrides kept in the audit trail, families told of every Absent); the auto-absent
 * setting and its runs (OQ-14); and the attendance types (places with a cooling-off).
 */
@Component({
  selector: 'rp-console-attendance',
  imports: [
    AttendanceTypes,
    AutoAbsentPanel,
    Avatar,
    Dropdown,
    Empty,
    Icon,
    Kpi,
    ManualMarking,
    PageHead,
    Pager,
    SectionDrawer,
    YearBanner,
    YearPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <rp-year-banner />
    <div class="c-page">
      <rp-page-head title="Attendance" [sub]="sub()">
        @if (!access.denied() && tab() === 'ov') {
          <button
            type="button"
            class="btn btn-sec"
            id="att-export"
            [disabled]="!canExport()"
            (click)="export()"
          >
            <rp-icon name="download" [size]="17" /><span>Export</span>
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
        @if (access.management()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow">
              <b>Read-only.</b> Management can view this page but not change it.
            </div>
          </div>
        }
        <div class="tabs" role="tablist" aria-label="Attendance">
          @for (t of tabs; track t.v) {
            <button
              type="button"
              class="tab"
              role="tab"
              [id]="'att-tab-' + t.v"
              [class.on]="tab() === t.v"
              [attr.aria-selected]="tab() === t.v"
              (click)="tab.set(t.v)"
            >
              <rp-icon [name]="t.icon" [size]="15" />{{ t.l }}
            </button>
          }
        </div>

        @switch (tab()) {
          @case ('mk') {
            <rp-manual-marking
              [sections]="sectionOptions()"
              [section]="markSection()"
              [date]="markDate()"
              [minDate]="minDate()"
              [maxDate]="maxDate()"
              [why]="markWhy()"
              (picked)="markSection.set($event.section); markDate.set($event.date)"
              (saved)="load()"
            />
          }
          @case ('aa') {
            <rp-auto-absent [why]="configWhy()" [closedWhy]="closedWhy()" />
          }
          @case ('ty') {
            <rp-attendance-types [why]="configWhy()" />
          }
          @default {
            <div class="c-filters" id="att-filters">
              <rp-year-picker inputId="att-year" />
              <div class="seg" role="radiogroup" aria-label="Day or range" style="flex: 0 0 auto">
                <span
                  class="seg-ind"
                  style="width: calc((100% - 8px) / 2)"
                  [style.left]="
                    'calc(3px + ' + (mode() === 'Day' ? 0 : 1) + ' * ((100% - 8px) / 2 + 2px))'
                  "
                ></span>
                @for (m of modes; track m) {
                  <button
                    type="button"
                    role="radio"
                    [class.on]="mode() === m"
                    [attr.aria-checked]="mode() === m"
                    (click)="setMode(m)"
                  >
                    {{ m }}
                  </button>
                }
              </div>
              @if (mode() === 'Day') {
                <div class="fld cc-date">
                  <div class="fld-in">
                    <input
                      id="f-d"
                      type="date"
                      aria-label="Date"
                      [min]="minDate()"
                      [max]="maxDate()"
                      [value]="date()"
                      (change)="pickDate($event)"
                    />
                  </div>
                </div>
              } @else {
                <div class="fld cc-date">
                  <div class="fld-in">
                    <input
                      id="f-from"
                      type="date"
                      aria-label="From"
                      [min]="minDate()"
                      [max]="maxDate()"
                      [value]="from()"
                      (change)="pickRange($event, 'from')"
                    />
                  </div>
                </div>
                <span class="t-muted">to</span>
                <div class="fld cc-date">
                  <div class="fld-in">
                    <input
                      id="f-to"
                      type="date"
                      aria-label="To"
                      [min]="minDate()"
                      [max]="maxDate()"
                      [value]="to()"
                      (change)="pickRange($event, 'to')"
                    />
                  </div>
                </div>
              }
              <div class="pills" role="group" aria-label="Member type">
                @for (p of memberTypes; track p.v) {
                  <button
                    type="button"
                    class="pill"
                    [class.on]="mt() === p.v"
                    [attr.aria-pressed]="mt() === p.v"
                    (click)="setType(p.v)"
                  >
                    {{ p.l }}
                  </button>
                }
              </div>
              @if (mt() === 'STUDENT') {
                <div class="fld">
                  <rp-dd
                    inputId="f-cls"
                    placeholder="All classes"
                    [options]="classOptions()"
                    [value]="cls()"
                    (changed)="cls.set($event); sec.set('all'); page.set(1)"
                  />
                </div>
                @if (cls() && sectionPills().length > 1) {
                  <div class="pills" role="group" aria-label="Section">
                    @for (p of sectionPills(); track p.v) {
                      <button
                        type="button"
                        class="pill"
                        [class.on]="sec() === p.v"
                        [attr.aria-pressed]="sec() === p.v"
                        (click)="sec.set(p.v); page.set(1)"
                      >
                        {{ p.l }}
                      </button>
                    }
                  </div>
                }
              }
            </div>

            @if (rangeError()) {
              <div class="note tone-warn" role="alert">
                <rp-icon name="alertc" [size]="17" />
                <div class="grow">{{ rangeError() }}</div>
              </div>
            } @else if (loading() && !loaded()) {
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
                <rp-empty icon="alertc" title="Couldn't load attendance" [text]="error()">
                  <button type="button" class="btn btn-sec btn-sm" (click)="load()">
                    <span>Try again</span>
                  </button>
                </rp-empty>
              </div>
            } @else if (noSchool()) {
              <rp-empty
                icon="sun"
                [title]="
                  day()?.holiday ? day()!.holiday + ' — no school' : 'No school on this date'
                "
                text="It's a holiday or a Sunday. Choose another date."
              />
            } @else if (mt() === 'STUDENT') {
              <!-- Each count of the day (client 2026-10-25): present, late, half day, absent, not marked. -->
              <div class="c-grid k5 cc-kp" id="att-kpis">
                <rp-kpi
                  [label]="
                    mode() === 'Day' ? (isToday() ? 'Present today' : 'Present') : 'Attendance'
                  "
                  icon="checkc"
                  tone="ok"
                  [value]="pctText(totals().pct)"
                  [delta]="
                    mode() === 'Day'
                      ? num(totals().attended) + ' of ' + num(totals().total) + ' students'
                      : plural(schoolDays(), 'school day')
                  "
                />
                <rp-kpi
                  label="Late"
                  icon="clock"
                  tone="warn"
                  [value]="num(perDay(totals().late))"
                  [delta]="mode() === 'Day' ? 'Checked in after the cut-off' : 'Average a day'"
                />
                <rp-kpi
                  label="Half day"
                  icon="hourglass"
                  tone="warn"
                  [value]="num(perDay(totals().halfDay))"
                  [delta]="mode() === 'Day' ? 'Counted as present' : 'Average a day'"
                />
                <rp-kpi
                  label="Absent"
                  icon="userx"
                  tone="bad"
                  [value]="num(perDay(totals().absent))"
                  [delta]="mode() === 'Day' ? 'Includes leave' : 'Average a day'"
                />
                <rp-kpi
                  [label]="isToday() ? 'Not marked yet' : 'Unmarked'"
                  icon="hourglass"
                  [tone]="totals().unmarked ? 'violet' : null"
                  [value]="num(totals().unmarked)"
                  [delta]="isToday() && totals().unmarked ? 'Auto-absent at the cut-off' : ''"
                />
              </div>
              <div class="tbl-wrap">
                <table class="tbl" id="att-table">
                  <thead>
                    <tr>
                      @for (c of columns; track c.k) {
                        <th
                          class="sort"
                          [class.r]="c.r"
                          [style.width]="c.w || null"
                          [class.asc]="sort()?.k === c.k && sort()?.dir === 'asc'"
                          [class.desc]="sort()?.k === c.k && sort()?.dir === 'desc'"
                          [attr.aria-sort]="ariaSort(c.k)"
                          (click)="sortBy(c.k)"
                        >
                          {{ c.l
                          }}<span class="sa" aria-hidden="true">{{
                            sort()?.k === c.k && sort()?.dir === 'desc' ? '↓' : '↑'
                          }}</span>
                        </th>
                      }
                      <th aria-label="Open"></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of shown(); track r.id) {
                      <tr
                        tabindex="0"
                        [attr.aria-label]="r.label"
                        (click)="drill.set(r)"
                        (keydown.enter)="drill.set(r)"
                      >
                        <td>
                          <b class="t-sb">{{ r.label }}</b>
                          <div class="cell-s">
                            {{ r.teacher ? 'Class teacher ' + r.teacher : 'No class teacher' }}
                          </div>
                        </td>
                        <td class="r">{{ num(r.strength) }}</td>
                        <td class="r">
                          {{ num(perDay(r.present + r.halfDay)) }}
                          @if (r.halfDay) {
                            <div class="cell-s">incl. {{ num(perDay(r.halfDay)) }} half day</div>
                          }
                        </td>
                        <td class="r">{{ num(perDay(r.late)) }}</td>
                        <td class="r">
                          @if (perDay(r.absent)) {
                            <span class="t-bad t-sb">{{ num(perDay(r.absent)) }}</span>
                          } @else {
                            0
                          }
                        </td>
                        <td class="r">
                          @if (r.unmarked) {
                            <span class="t-sb" style="color: var(--violet)">{{
                              num(r.unmarked)
                            }}</span>
                          } @else {
                            0
                          }
                        </td>
                        <td>
                          @if (r.days && r.total) {
                            <div class="cc-pbar">
                              <span class="t-num">{{ r.pct }}%</span>
                              <div [class]="'bar ' + tone(r.pct)">
                                <i [style.width.%]="r.pct"></i>
                              </div>
                            </div>
                          } @else if (!r.total) {
                            <span class="t-faint">No students</span>
                          } @else {
                            <span class="t-faint">Holiday</span>
                          }
                        </td>
                        <td>
                          <span class="row-acts"><rp-icon name="right" [size]="15" /></span>
                        </td>
                      </tr>
                    } @empty {
                      <tr>
                        <td [attr.colspan]="columns.length + 1">
                          <rp-empty
                            icon="calcheck"
                            title="No class-sections here"
                            text="Try another class."
                          />
                        </td>
                      </tr>
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
                  <span>{{ plural(rows().length, 'class-section') }}</span>
                </div>
              }
            } @else {
              <div class="c-grid k5 cc-kp" id="att-kpis">
                @if (mode() === 'Day') {
                  <rp-kpi
                    label="Present"
                    icon="checkc"
                    tone="ok"
                    [value]="num(staffDay().present + staffDay().late + staffDay().halfDay)"
                    [delta]="
                      'of ' +
                      num(staffDay().total) +
                      ' ' +
                      typeLabel().toLowerCase() +
                      ' · ' +
                      num(staffDay().present) +
                      ' on time'
                    "
                  />
                  <rp-kpi
                    label="Late"
                    icon="clock"
                    tone="warn"
                    [value]="num(staffDay().late)"
                    delta="After the late cut-off"
                  />
                  <rp-kpi
                    label="Half day"
                    icon="hourglass"
                    tone="warn"
                    [value]="num(staffDay().halfDay)"
                    delta="Counted as present"
                  />
                  <rp-kpi
                    label="On leave or absent"
                    icon="plane"
                    tone="violet"
                    [value]="num(staffDay().absent)"
                  />
                  <rp-kpi
                    [label]="isToday() ? 'Not in yet' : 'No record'"
                    icon="hourglass"
                    [value]="num(staffDay().notMarked)"
                  />
                } @else {
                  <rp-kpi
                    label="Average attendance"
                    icon="gauge"
                    tone="brand"
                    [value]="pctText(staffAverage(), 1)"
                  />
                  <rp-kpi
                    label="School days"
                    icon="calendar"
                    [value]="num(staff()?.schoolDays ?? 0)"
                  />
                  <rp-kpi
                    label="Late arrivals"
                    icon="clock"
                    tone="warn"
                    [value]="num(staffLate())"
                  />
                  <rp-kpi
                    label="Half days"
                    icon="hourglass"
                    tone="warn"
                    [value]="num(staffHalfDays())"
                  />
                  <rp-kpi label="People" icon="users" [value]="num(staffRows().length)" />
                }
              </div>
              <div class="tbl-wrap">
                <table class="tbl" id="att-staff">
                  <thead>
                    <tr>
                      <th>Name</th>
                      @if (mode() === 'Day') {
                        <th>Status</th>
                        <th>In</th>
                        <th>Out</th>
                      } @else {
                        <th style="width: 220px">Attendance</th>
                        <th class="r">Late</th>
                        <th class="r">Absent</th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of staffShown(); track r.member.id) {
                      <tr>
                        <td>
                          <div class="cell-main">
                            <rp-av [name]="person(r.member.name)" size="sm" />
                            <div style="min-width: 0">
                              <div class="cell-t t-clip">{{ person(r.member.name) }}</div>
                              <div class="cell-s t-clip">{{ r.member.type }}</div>
                            </div>
                          </div>
                        </td>
                        @if (mode() === 'Day') {
                          <td>
                            @if (chipOf(r); as c) {
                              <span [class]="'chip dot tone-' + c.tone">{{ c.l }}</span>
                            } @else {
                              <span class="t-faint">{{
                                isToday() ? 'Not in yet' : 'No record'
                              }}</span>
                            }
                          </td>
                          <td class="t-num">{{ inOut(r.member.id, 'in') }}</td>
                          <td class="t-num">{{ inOut(r.member.id, 'out') }}</td>
                        } @else {
                          <td>
                            <div class="cc-pbar">
                              <span class="t-num">{{ r.percentage ?? 0 }}%</span>
                              <div [class]="'bar ' + tone(r.percentage ?? 0)">
                                <i [style.width.%]="r.percentage ?? 0"></i>
                              </div>
                            </div>
                          </td>
                          <td class="r">{{ num(r.late) }}</td>
                          <td class="r">
                            @if (r.absent) {
                              <b class="t-bad">{{ num(r.absent) }}</b>
                            } @else {
                              0
                            }
                          </td>
                        }
                      </tr>
                    } @empty {
                      <tr>
                        <td [attr.colspan]="4">
                          <rp-empty
                            icon="users"
                            [title]="'No ' + typeLabel().toLowerCase()"
                            text="Members of this type appear here."
                          />
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              @if (staffRows().length > 12) {
                <rp-pager
                  [total]="staffRows().length"
                  [page]="page()"
                  [size]="12"
                  (go)="page.set($event)"
                />
              } @else if (staffRows().length) {
                <div class="pager">
                  <span>{{ plural(staffRows().length, 'person', 'people') }}</span>
                </div>
              }
            }
          }
        }
      }
    </div>

    @if (drill(); as d) {
      <rp-attendance-section
        [section]="d"
        [mode]="mode()"
        [date]="date()"
        [from]="rangeFrom()"
        [to]="rangeTo()"
        [markWhy]="markWhy()"
        (closed)="drill.set(null)"
        (mark)="toMarking(d.id)"
      />
    }
  `,
})
export class ConsoleAttendance {
  private readonly api = inject(AttendanceApi);
  private readonly structure = inject(StructureApi);
  private readonly teachers = inject(TeachersApi);
  protected readonly years = inject(AcademicYears);
  private readonly session = inject(SessionContext).console;

  protected readonly access = taskAccess(this.session, 'attendance.view');
  protected readonly pageSize = PAGE;
  protected readonly num = num;
  protected readonly plural = plural;
  protected readonly person = person;
  protected readonly pctText = pctText;
  protected readonly tabs: readonly {
    v: Tab;
    l: string;
    icon: 'chart' | 'edit' | 'timer' | 'layers';
  }[] = [
    { v: 'ov', l: 'Overview', icon: 'chart' },
    { v: 'mk', l: 'Manual marking', icon: 'edit' },
    { v: 'aa', l: 'Auto-absent', icon: 'timer' },
    { v: 'ty', l: 'Attendance types', icon: 'layers' },
  ];
  protected readonly modes: readonly Mode[] = ['Day', 'Range'];
  protected readonly memberTypes: readonly { v: MemberType; l: string }[] = [
    { v: 'STUDENT', l: 'Students' },
    { v: 'TEACHER', l: 'Teaching staff' },
    { v: 'STAFF', l: 'Non-teaching staff' },
  ];
  protected readonly columns: readonly { k: SortKey; l: string; r?: boolean; w?: string }[] = [
    { k: 'l', l: 'Class-section' },
    { k: 'strength', l: 'Students', r: true },
    { k: 'present', l: 'Present', r: true },
    { k: 'late', l: 'Late', r: true },
    { k: 'absent', l: 'Absent', r: true },
    { k: 'unmarked', l: 'Not marked', r: true },
    { k: 'pct', l: 'Attendance', w: '200px' },
  ];

  protected readonly tab = signal<Tab>('ov');
  protected readonly mode = signal<Mode>('Day');
  protected readonly mt = signal<MemberType>('STUDENT');
  // The report opens on today, a Sunday too: staff are checked in on any day (client 2026-10-25).
  protected readonly date = signal(today());
  protected readonly from = signal(addDays(today(), -6));
  protected readonly to = signal(today());
  protected readonly cls = signal('');
  protected readonly sec = signal('all');
  protected readonly page = signal(1);
  protected readonly sort = signal<{ k: SortKey; dir: 'asc' | 'desc' } | null>(null);
  protected readonly drill = signal<SectionRow | null>(null);
  protected readonly markSection = signal('');
  protected readonly markDate = signal(schoolDay(today()));

  protected readonly day = signal<AttendanceOverview | null>(null);
  protected readonly range = signal<readonly AttendanceOverview[]>([]);
  protected readonly staff = signal<AttendanceReport | null>(null);
  /** The day's check-in and check-out of each staff member (Day view). */
  protected readonly staffTimes = signal<ReadonlyMap<string, StaffDay>>(new Map());
  private readonly classes = signal<readonly ClassView[]>([]);
  private readonly classTeacher = signal<ReadonlyMap<string, string>>(new Map());
  protected readonly loading = signal(true);
  protected readonly loaded = signal(false);
  protected readonly error = signal('');
  private seq = 0;

  protected readonly sub = computed(() => {
    const y = this.years.selected();
    return `Daily attendance by class-section and member type${y ? ' · ' + y.label : ''}`;
  });
  protected readonly minDate = computed(() => this.years.selected()?.startsOn ?? '');
  protected readonly maxDate = computed(() => {
    const y = this.years.selected();
    const t = today();
    return y && y.endsOn < t ? y.endsOn : t;
  });
  protected readonly closedWhy = computed(() =>
    this.years.closed() ? `${this.years.selected()?.label} is closed.` : '',
  );
  protected readonly markWhy = computed(
    () =>
      this.access.why('attendance.mark') ||
      (this.years.closed()
        ? `You're viewing ${this.years.selected()?.label}, which is closed. Records are read-only.`
        : ''),
  );
  protected readonly configWhy = computed(() => this.access.why('attendance.config'));
  protected readonly isToday = computed(() => this.mode() === 'Day' && this.date() === today());
  protected readonly typeLabel = computed(
    () => this.memberTypes.find((t) => t.v === this.mt())?.l ?? '',
  );

  /** The range in order (from ≤ to), within the year. */
  protected readonly rangeFrom = computed(() =>
    this.from() <= this.to() ? this.from() : this.to(),
  );
  protected readonly rangeTo = computed(() => (this.from() <= this.to() ? this.to() : this.from()));
  protected readonly rangeError = computed(() =>
    this.mode() === 'Range' &&
    this.mt() === 'STUDENT' &&
    daysBetween(this.rangeFrom(), this.rangeTo()) + 1 > MAX_RANGE
      ? `Choose a range of up to ${MAX_RANGE} days.`
      : '',
  );

  protected readonly classOptions = computed<DropdownOption[]>(() => [
    { v: '', l: 'All classes' },
    ...this.classes().map((c) => ({ v: c.id, l: c.name })),
  ]);
  protected readonly sectionPills = computed(() => {
    const c = this.classes().find((x) => x.id === this.cls());
    return c
      ? [
          { v: 'all', l: 'All sections' },
          ...c.sections.map((s) => ({ v: s.id, l: `Section ${s.name}` })),
        ]
      : [];
  });
  /** Every class-section of the year (manual marking's dropdown). */
  protected readonly sectionOptions = computed<DropdownOption[]>(() => {
    const o = this.day() ?? this.range().at(-1);
    return (o?.sections ?? []).map((s) => ({ v: s.section.id, l: s.section.label }));
  });

  /**
   * Sunday or a holiday (the day, or every day of the range). A day off on which someone of the
   * group shown was recorded shows them (client 2026-10-25: staff are checked in on any day).
   */
  protected readonly noSchool = computed(() => {
    if (this.mode() === 'Day') {
      const d = this.day();
      return !!d && (!!d.holiday || d.sunday) && !this.recordedOnDay();
    }
    return this.mt() === 'STUDENT' && this.loaded() && !this.schoolDays();
  });
  /** Someone of the group shown has a record on the day. */
  private readonly recordedOnDay = computed(() => {
    if (this.mt() === 'STUDENT')
      return this.allRows().some((r) => r.present + r.late + r.halfDay + r.absent > 0);
    const s = this.staffDay();
    return s.present + s.late + s.halfDay + s.absent > 0;
  });
  private readonly schoolOverviews = computed(() =>
    this.mode() === 'Day'
      ? this.day()
        ? [this.day()!]
        : []
      : this.range().filter((o) => !o.holiday && !o.sunday),
  );
  protected readonly schoolDays = computed(() => this.schoolOverviews().length);

  private readonly sectionClass = computed(() => {
    const m = new Map<string, { classId: string; order: number }>();
    for (const c of this.classes())
      for (const s of c.sections) m.set(s.id, { classId: c.id, order: c.order });
    return m;
  });

  protected readonly allRows = computed<SectionRow[]>(() => {
    const days = this.schoolOverviews();
    const last = this.mode() === 'Day' ? this.day() : this.range().at(-1);
    if (!last) return [];
    return last.sections.map((s, i) => {
      const a = { total: 0, present: 0, halfDay: 0, late: 0, absent: 0, unmarked: 0, days: 0 };
      for (const o of days) {
        const g: SectionDay | undefined = o.sections.find((x) => x.section.id === s.section.id);
        if (!g) continue;
        a.days++;
        a.total += g.students;
        a.present += g.present;
        a.halfDay += g.halfDay;
        a.late += g.late;
        a.absent += g.absent;
        a.unmarked += g.notMarked;
      }
      const sc = this.sectionClass().get(s.section.id);
      return {
        id: s.section.id,
        label: s.section.label,
        order: i,
        classId: sc?.classId ?? '',
        teacher: this.classTeacher().get(s.section.id) ?? '',
        strength: s.students,
        ...a,
        pct: pct(a.present + a.halfDay + a.late, a.total),
      };
    });
  });
  protected readonly rows = computed(() => {
    const cls = this.cls();
    const sec = this.sec();
    const list = this.allRows().filter(
      (r) => (!cls || r.classId === cls) && (sec === 'all' || r.id === sec),
    );
    const s = this.sort();
    if (!s) return list;
    const val = (r: SectionRow): number =>
      s.k === 'l'
        ? r.order
        : s.k === 'strength'
          ? r.strength
          : s.k === 'present'
            ? r.present + r.halfDay
            : s.k === 'pct'
              ? r.pct
              : r[s.k];
    return [...list].sort((a, b) => (s.dir === 'asc' ? val(a) - val(b) : val(b) - val(a)));
  });
  protected readonly shown = computed(() =>
    this.rows().slice((this.page() - 1) * PAGE, this.page() * PAGE),
  );
  protected readonly totals = computed(() => {
    const r = this.rows();
    const sum = (k: 'total' | 'present' | 'halfDay' | 'late' | 'absent' | 'unmarked') =>
      r.reduce((n, x) => n + x[k], 0);
    const attended = sum('present') + sum('halfDay') + sum('late');
    return {
      total: sum('total'),
      attended,
      late: sum('late'),
      halfDay: sum('halfDay'),
      absent: sum('absent'),
      unmarked: sum('unmarked'),
      pct: pct(attended, sum('total')),
    };
  });

  protected readonly staffDay = computed(() => {
    const d = this.day();
    const empty = { total: 0, present: 0, late: 0, halfDay: 0, absent: 0, notMarked: 0 };
    if (!d) return empty;
    return this.mt() === 'TEACHER' ? d.staff.teachers : d.staff.others;
  });
  protected readonly staffRows = computed(() =>
    [...(this.staff()?.items ?? [])].sort((a, b) =>
      person(a.member.name).localeCompare(person(b.member.name)),
    ),
  );
  protected readonly staffShown = computed(() =>
    this.staffRows().slice((this.page() - 1) * 12, this.page() * 12),
  );
  protected readonly staffAverage = computed(() => {
    const r = this.staffRows();
    return r.length ? r.reduce((n, x) => n + (x.percentage ?? 0), 0) / r.length : 0;
  });
  protected readonly staffLate = computed(() => this.staffRows().reduce((n, x) => n + x.late, 0));
  protected readonly staffHalfDays = computed(() =>
    this.staffRows().reduce((n, x) => n + x.halfDay, 0),
  );
  protected readonly canExport = computed(
    () => this.loaded() && !this.error() && this.mt() === 'STUDENT' && !this.noSchool(),
  );

  constructor() {
    if (!this.access.denied()) {
      void this.years.load();
      void this.loadReference();
    }
    // Reload when the year, the date, the range, the mode or the member type changes.
    effect(() => {
      if (this.access.denied() || !this.years.loaded()) return;
      this.years.selectedId();
      this.mode();
      this.mt();
      this.date();
      this.rangeFrom();
      this.rangeTo();
      untracked(() => void this.load());
    });
    // Another year: its last day in range.
    effect(() => {
      const y = this.years.selected();
      if (!y) return;
      const d = this.date();
      if (d < y.startsOn || d > y.endsOn) {
        const day = y.endsOn < today() ? y.endsOn : today();
        this.date.set(day);
        this.to.set(day);
        this.from.set(addDays(day, -6) < y.startsOn ? y.startsOn : addDays(day, -6));
        this.markDate.set(schoolDay(day));
      }
    });
  }

  async load() {
    if (this.rangeError()) return;
    const n = ++this.seq;
    this.loading.set(true);
    const yearId = this.years.selectedId();
    try {
      if (this.mode() === 'Day') {
        const d = await this.api.overview(this.date(), yearId);
        let staff: AttendanceReport | null = null;
        let times: StaffRoster | null = null;
        if (this.mt() !== 'STUDENT') {
          [staff, times] = await Promise.all([
            this.api.reportAll({ from: d.date, to: d.date, type: this.mt() }),
            // Check-in and check-out times, from the gate or the front desk (client 2026-10-22).
            this.api
              .staff({ date: d.date, type: this.mt() === 'TEACHER' ? 'TEACHERS' : 'STAFF' })
              .catch(() => null),
          ]);
        }
        if (n !== this.seq) return;
        this.day.set(d);
        this.staff.set(staff);
        this.staffTimes.set(new Map((times?.items ?? []).map((x) => [x.member.id, x])));
      } else if (this.mt() === 'STUDENT') {
        const dates: string[] = [];
        for (let d = this.rangeFrom(); d <= this.rangeTo(); d = addDays(d, 1))
          if (weekday(d) !== 7) dates.push(d);
        const out: AttendanceOverview[] = [];
        for (let i = 0; i < dates.length; i += 4) {
          out.push(
            ...(await Promise.all(dates.slice(i, i + 4).map((d) => this.api.overview(d, yearId)))),
          );
        }
        if (n !== this.seq) return;
        this.range.set(out);
        this.day.set(null);
      } else {
        const r = await this.api.reportAll({
          from: this.rangeFrom(),
          to: this.rangeTo(),
          type: this.mt(),
        });
        if (n !== this.seq) return;
        this.staff.set(r);
        this.day.set(null);
      }
      if (!this.markSection()) {
        const first = (this.day() ?? this.range().at(-1))?.sections[0];
        if (first) this.markSection.set(first.section.id);
      }
      this.error.set('');
      this.loaded.set(true);
    } catch (e) {
      if (n === this.seq) this.error.set(problemText(e));
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
  }

  /** The classes (for the class filter) and the class teachers (the Class-section column). */
  private async loadReference() {
    try {
      this.classes.set((await this.structure.classes()).items);
    } catch {
      // The class filter then lists nothing but "All classes".
    }
    if (this.access.can('academics.view')) {
      try {
        const a = await this.teachers.assignments(this.years.selectedId() || undefined);
        this.classTeacher.set(
          new Map(
            a.classTeachers
              .filter((x) => x.assignment)
              .map((x) => [x.section.id, person(x.assignment!.teacher.name)]),
          ),
        );
      } catch {
        // No class teacher names.
      }
    }
  }

  protected perDay(v: number) {
    return this.mode() === 'Day' ? v : Math.round(v / Math.max(1, this.schoolDays()));
  }
  protected tone(p: number) {
    return attTone(p);
  }
  /** A staff member's check-in or check-out time on the day ('—' when none). */
  protected inOut(memberId: string, which: 'in' | 'out') {
    const x = this.staffTimes().get(memberId);
    const at = which === 'in' ? x?.checkInAt : x?.checkOutAt;
    return at ? formatTime(at) : '—';
  }

  protected chipOf(r: MemberAttendance) {
    const s = dayStatus(r);
    return s ? { l: STATUS_CHIP[s].l(), tone: STATUS_CHIP[s].tone } : null;
  }

  protected setMode(m: Mode) {
    this.mode.set(m);
    this.page.set(1);
  }
  protected setType(t: MemberType) {
    this.mt.set(t);
    this.page.set(1);
  }
  protected pickDate(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    if (v) {
      this.date.set(v);
      this.page.set(1);
    }
  }
  protected pickRange(e: Event, k: 'from' | 'to') {
    const v = (e.target as HTMLInputElement).value;
    if (!v) return;
    (k === 'from' ? this.from : this.to).set(v);
    this.page.set(1);
  }
  protected sortBy(k: SortKey) {
    const s = this.sort();
    this.sort.set({ k, dir: s?.k === k && s.dir === 'asc' ? 'desc' : 'asc' });
    this.page.set(1);
  }
  protected ariaSort(k: SortKey) {
    const s = this.sort();
    return s?.k === k ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  }

  /** The drawer's Mark attendance: the manual marking tab on this class-section and date. */
  protected toMarking(sectionId: string) {
    this.drill.set(null);
    this.markSection.set(sectionId);
    this.markDate.set(this.date());
    this.tab.set('mk');
  }

  /** cc.att.export: the day (or range) by class-section. */
  protected export() {
    const label = this.mode() === 'Day' ? this.date() : `${this.rangeFrom()}_${this.rangeTo()}`;
    exportCsv(
      `attendance_${label}.csv`,
      [
        'Class-section',
        'Students',
        'Present',
        'Half day',
        'Late',
        'Absent',
        'Not marked',
        'Attendance %',
      ],
      this.rows().map((r) => [
        r.label,
        r.strength,
        this.perDay(r.present),
        this.perDay(r.halfDay),
        this.perDay(r.late),
        this.perDay(r.absent),
        r.unmarked,
        r.days && r.total ? r.pct : 'Holiday',
      ]),
    );
  }

  protected fmtDate(d: string) {
    return formatDate(d);
  }
}

/** A school day on or before `d` (Sunday → Saturday). */
function schoolDay(d: string) {
  return weekday(d) === 7 ? addDays(d, -1) : d;
}
