import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SessionContext } from '../../../../Context/SessionContext';
import { Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { translate } from '../../../Utils/translate';
import { person } from '../Applications/app-format';
import { plural, saveCsv } from '../Fees/fee-format';
import {
  DAY_NAMES,
  academicsAccess,
  minutesOf,
  nowMinutes,
  num,
  problemText,
  tRange,
  today,
  weekday,
} from '../Structure/academic-format';
import { AcademicYears, YearBanner, YearPicker } from '../Structure/academic-year';
import { BulkUpload, type UploadCheck } from '../Structure/BulkUpload';
import { SearchSelect } from '../../../Shared/SearchSelect';
import { StructureApi, type ClassView, type PeriodList } from '../Structure/structure.api';
import { TeachersApi, type AssignmentList, type TeacherOption } from '../Teachers/teachers.api';
import { TimetableSlotModal } from './TimetableSlotModal';
import {
  TimetableApi,
  type ClashList,
  type Timetable,
  type TtPeriod,
  type TtSlot,
} from './timetable.api';

type View = 'class' | 'teacher';
const DAYS = [1, 2, 3, 4, 5, 6];

interface WeekCell {
  readonly section: { id: string; label: string };
  readonly subject: { name: string; colour: string };
}

/**
 * c.timetable — Timetable (SRS 20.8, FR-ACA-05, CR-13; ACA-024…026; prototype c.timetable): for the
 * academic year in context, a class-section's week (periods × Monday–Saturday, breaks across, today
 * and the current period marked) where a click sets a period's subject and teacher; the teachers
 * timetabled in two classes at once (clashes) with a drawer to open each; and each teacher's week
 * with periods, class-sections, free periods and clashes. A closed year is read-only. Weeks can also
 * be uploaded as a sheet (client 2026-10-21): each class-section in it gets the sheet's whole week.
 */
@Component({
  selector: 'rp-console-timetable',
  imports: [
    BulkUpload,
    Empty,
    Icon,
    Kpi,
    Modal,
    PageHead,
    SearchSelect,
    TimetableSlotModal,
    YearBanner,
    YearPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <rp-year-banner />
    <div class="c-page">
      <rp-page-head
        title="Timetable"
        sub="Class timetables with clash checks, and each teacher's week"
      >
        @if (!access.denied()) {
          <span class="cp-why" [attr.title]="access.yearWhy() || null"
            ><button
              type="button"
              class="btn btn-sec"
              id="tt-upload"
              [disabled]="!!access.yearWhy() || !years.selected()"
              (click)="uploading.set(true)"
            >
              <rp-icon name="upload" [size]="17" /><span>Upload timetables</span>
            </button></span
          >
          <button
            type="button"
            class="btn btn-sec"
            id="tt-export"
            [disabled]="!tt()"
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
        <div class="c-filters">
          <rp-year-picker inputId="tt-year" />
          <div class="seg cc-seg" role="radiogroup" aria-label="View" style="flex: 0 0 auto">
            <span
              class="seg-ind"
              style="width: calc((100% - 8px) / 2)"
              [style.left]="
                'calc(3px + ' + (view() === 'class' ? 0 : 1) + ' * ((100% - 8px) / 2 + 2px))'
              "
            ></span>
            <button
              type="button"
              role="radio"
              [class.on]="view() === 'class'"
              [attr.aria-checked]="view() === 'class'"
              (click)="view.set('class')"
            >
              <rp-icon name="school" [size]="14" />Class view
            </button>
            <button
              type="button"
              role="radio"
              [class.on]="view() === 'teacher'"
              [attr.aria-checked]="view() === 'teacher'"
              (click)="toTeacher()"
            >
              <rp-icon name="user" [size]="14" />Teacher view
            </button>
          </div>
          @if (view() === 'class') {
            <div class="fld">
              <rp-search-select
                inputId="f-cls"
                placeholder="Choose a class-section"
                empty="No class-sections yet"
                [options]="sectionOptions()"
                [value]="sectionId()"
                (changed)="sectionId.set($event)"
              />
            </div>
          } @else {
            <div class="fld">
              <rp-search-select
                inputId="f-tch"
                placeholder="Choose a teacher"
                empty="No active teachers yet"
                [options]="teacherOptions()"
                [value]="teacherId()"
                (changed)="pickTeacher($event)"
              />
            </div>
          }
          @if (clashes(); as c) {
            @if (c.clashes.length) {
              <span class="fsum"
                ><button
                  type="button"
                  class="btn btn-ghost btn-sm"
                  id="tt-clashes"
                  (click)="clashOpen.set(true)"
                >
                  <rp-icon name="alert" [size]="15" /><span
                    >{{ plural(c.clashes.length, 'clash', 'clashes') }} to resolve</span
                  >
                </button></span
              >
            } @else {
              <span class="fsum"><rp-icon name="checkc" [size]="14" /> No teacher clashes</span>
            }
          }
        </div>

        @if (lookupError()) {
          <div class="card pad">
            <rp-empty icon="alertc" title="Couldn't load the timetable" [text]="lookupError()">
              <button type="button" class="btn btn-sec btn-sm" (click)="lookups()">
                <span>Try again</span>
              </button>
            </rp-empty>
          </div>
        } @else if (periods() && !teaching().length) {
          <div class="card pad">
            <rp-empty
              icon="clock"
              title="No periods yet"
              text="Set up the bell schedule — the teaching periods and breaks of the school day — before building timetables."
            >
              <button type="button" class="btn btn-sec btn-sm" (click)="goPeriods()">
                <span>Open Classes & subjects</span>
              </button>
            </rp-empty>
          </div>
        } @else if (view() === 'teacher') {
          @if (!teacherId()) {
            <div class="card pad">
              <rp-empty
                icon="user"
                title="Choose a teacher"
                text="See a teacher's week across every class-section they teach."
              />
            </div>
          } @else if (!week()) {
            <div class="sk" style="height: 420px; border-radius: 16px" aria-busy="true"></div>
          } @else {
            <div class="c-grid k4 cc-kp">
              <rp-kpi label="Periods a week" icon="grid" [value]="num(teacherStats().total)" />
              <rp-kpi label="Class-sections" icon="users" [value]="num(teacherStats().sections)" />
              <rp-kpi label="Free periods" icon="coffee" [value]="num(teacherStats().free)" />
              <rp-kpi
                label="Clashes"
                icon="alert"
                [tone]="teacherStats().clashes ? 'bad' : 'ok'"
                [value]="num(teacherStats().clashes)"
                [delta]="teacherStats().clashes ? 'Two classes at once' : 'None'"
              />
            </div>
            @if (combined(); as name) {
              <div class="note tone-brand">
                <rp-icon name="layers" [size]="17" />
                <div class="grow">
                  {{ name }} is a class teacher and a subject teacher — one combined portal.
                </div>
              </div>
            }
            <div class="cc-ttw">
              <table class="cc-tt" id="tt-teacher">
                <thead>
                  <tr>
                    <th>Period</th>
                    @for (d of days; track d) {
                      <th [class.now]="d === nowDay()">{{ dayName(d) }}</th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (p of bell(); track p.id) {
                    @if (p.isBreak) {
                      <tr class="brk">
                        <td>Break</td>
                        <td [attr.colspan]="days.length">{{ p.name }} · {{ range(p) }}</td>
                      </tr>
                    } @else {
                      <tr [class.nowr]="isNow(p)">
                        <td>
                          <b>{{ p.name }}</b
                          ><small>{{ range(p) }}</small>
                        </td>
                        @for (d of days; track d) {
                          <td [class.now]="d === nowDay()">
                            @for (o of weekAt(d, p.id); track o.section.id) {
                              <button
                                type="button"
                                class="slot"
                                [class.clash]="weekAt(d, p.id).length > 1"
                                [style.--c]="o.subject.colour"
                                [attr.title]="'Open ' + o.section.label"
                                (click)="goSection(o.section.id)"
                              >
                                <b>{{ o.section.label }}</b
                                ><small
                                  >{{ o.subject.name
                                  }}{{ weekAt(d, p.id).length > 1 ? ' · clash' : '' }}</small
                                >
                              </button>
                            } @empty {
                              <span class="slot free">Free</span>
                            }
                          </td>
                        }
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>
          }
        } @else {
          @if (!sectionOptions().length && classesLoaded()) {
            <div class="card pad">
              <rp-empty
                icon="school"
                title="No class-sections yet"
                text="Add classes and sections in Classes & subjects, then build each section's week here."
              />
            </div>
          } @else if (ttError()) {
            <div class="card pad">
              <rp-empty icon="alertc" title="Couldn't load the timetable" [text]="ttError()">
                <button type="button" class="btn btn-sec btn-sm" (click)="loadTt()">
                  <span>Try again</span>
                </button>
              </rp-empty>
            </div>
          } @else if (!tt()) {
            <div class="stack g12" aria-busy="true" aria-label="Loading">
              <div class="sk" style="height: 20px; width: 60%; border-radius: 8px"></div>
              <div class="sk" style="height: 420px; border-radius: 16px"></div>
            </div>
          } @else {
            @if (!access.yearWhy()) {
              <p class="t-sm t-muted">
                Click a period to set the subject and teacher. Only teachers assigned to that
                subject for {{ tt()!.section.label }} are offered, and a teacher can't be in two
                classes at once.
              </p>
            }
            <div class="cc-ttw">
              <table class="cc-tt" id="tt-class">
                <thead>
                  <tr>
                    <th>Period</th>
                    @for (d of days; track d) {
                      <th [class.now]="d === nowDay()">{{ dayName(d) }}</th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (p of bell(); track p.id) {
                    @if (p.isBreak) {
                      <tr class="brk">
                        <td>Break</td>
                        <td [attr.colspan]="days.length">{{ p.name }} · {{ range(p) }}</td>
                      </tr>
                    } @else {
                      <tr [class.nowr]="isNow(p)">
                        <td>
                          <b>{{ p.name }}</b
                          ><small>{{ range(p) }}</small>
                        </td>
                        @for (d of days; track d) {
                          <td [class.now]="d === nowDay()">
                            @if (slotAt(d, p.id); as x) {
                              <button
                                type="button"
                                class="slot"
                                [class.clash]="isClash(d, p.id)"
                                [style.--c]="x.subject.colour"
                                [disabled]="!!access.yearWhy()"
                                [attr.title]="
                                  x.subject.name +
                                  ' · ' +
                                  person(x.teacher.name) +
                                  (isClash(d, p.id) ? ' · teacher clash' : '')
                                "
                                (click)="cell.set({ day: d, period: p })"
                              >
                                <b>{{ x.subject.name }}</b
                                ><small
                                  >{{ person(x.teacher.name)
                                  }}{{ isClash(d, p.id) ? ' · clash' : '' }}</small
                                >
                              </button>
                            } @else {
                              <button
                                type="button"
                                class="slot empty"
                                [disabled]="!!access.yearWhy()"
                                [attr.aria-label]="'Add a lesson on ' + dayName(d) + ' ' + p.name"
                                (click)="cell.set({ day: d, period: p })"
                              >
                                @if (access.yearWhy()) {
                                  —
                                } @else {
                                  <rp-icon name="plus" [size]="14" /> Add
                                }
                              </button>
                            }
                          </td>
                        }
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>
            <div class="c-grid s21">
              <div class="card pad stack g10">
                <h3 class="t-h4">Periods a week by subject</h3>
                @if (perSubject().length) {
                  <div class="cc-subleg">
                    @for (s of perSubject(); track s.name) {
                      <span
                        ><i class="cc-dot" [style.background]="s.colour"></i>{{ s.name }}
                        <b class="t-num">{{ s.n }}</b></span
                      >
                    }
                  </div>
                } @else {
                  <p class="t-sm t-muted">No lessons yet.</p>
                }
              </div>
              <div class="card pad">
                <dl class="kv">
                  <dt>Class teacher</dt>
                  <dd>
                    @if (classTeacher(); as n) {
                      {{ n }}
                    } @else {
                      <span class="t-warn">Not assigned</span>
                    }
                  </dd>
                  <dt>Lessons a week</dt>
                  <dd>{{ num(tt()!.slots.length) }}</dd>
                  <dt>Year</dt>
                  <dd>
                    <span class="tag"
                      ><rp-icon name="calendar" [size]="12" />{{ tt()!.year.label }}</span
                    >
                  </dd>
                </dl>
              </div>
            </div>
          }
        }
      }
    </div>

    @if (cell(); as c) {
      <rp-timetable-slot
        [tt]="tt()!"
        [day]="c.day"
        [period]="c.period"
        (closed)="cell.set(null)"
        (saved)="cell.set(null); tt.set($event); loadClashes()"
        (stale)="loadTt()"
      />
    }
    @if (uploading()) {
      <rp-bulk-upload
        title="Upload timetables"
        [sub]="uploadSub()"
        columns="Columns: class, section, day (Monday to Saturday), period (as in the bell schedule), subject (code or name), teacher (employee ID or mobile number), teacher name."
        [head]="['Class', 'Section', 'Day', 'Period', 'Lesson']"
        [templateFn]="templateFn"
        [upload]="uploadFn"
        (closed)="uploading.set(false)"
        (imported)="uploaded()"
      />
    }
    @if (clashOpen()) {
      <rp-modal
        title="Teacher clashes"
        sub="The same teacher timetabled in two classes in one period"
        icon="alert"
        [drawer]="true"
        [slim]="true"
        [foot]="false"
        (closed)="clashOpen.set(false)"
      >
        <div class="stack g12" id="tt-clash-list">
          @for (c of clashes()?.clashes ?? []; track c.teacher.id + c.day + c.period.id) {
            <div class="card pad stack g8">
              <div class="row between">
                <b>{{ person(c.teacher.name) }}</b
                ><span class="t-sm t-muted">{{ dayName(c.day) }} · {{ c.period.name }}</span>
              </div>
              @for (s of c.sections; track s.id) {
                <div class="row between t-sm">
                  <span>{{ s.label }} · {{ s.subject }}</span>
                  <button
                    type="button"
                    class="btn btn-ghost btn-xs"
                    (click)="clashOpen.set(false); goSection(s.id)"
                  >
                    <span>Open</span>
                  </button>
                </div>
              }
            </div>
          }
        </div>
      </rp-modal>
    }
  `,
})
export class ConsoleTimetable {
  private readonly api = inject(TimetableApi);
  private readonly structure = inject(StructureApi);
  private readonly teachersApi = inject(TeachersApi);
  private readonly overlays = inject(Overlays);
  private readonly router = inject(Router);
  protected readonly years = inject(AcademicYears);
  private readonly session = inject(SessionContext).console;
  protected readonly access = academicsAccess(this.session, this.years);

  protected readonly days = DAYS;
  protected readonly num = num;
  protected readonly plural = plural;
  protected readonly person = person;

  protected readonly view = signal<View>('class');
  protected readonly sectionId = signal('');
  protected readonly teacherId = signal('');
  protected readonly classes = signal<readonly ClassView[]>([]);
  protected readonly classesLoaded = signal(false);
  protected readonly periods = signal<PeriodList | null>(null);
  protected readonly teachers = signal<readonly TeacherOption[]>([]);
  protected readonly lookupError = signal('');
  protected readonly tt = signal<Timetable | null>(null);
  protected readonly ttError = signal('');
  protected readonly clashes = signal<ClashList | null>(null);
  protected readonly week = signal<ClashList['teacherWeek']>(null);
  protected readonly assignments = signal<AssignmentList | null>(null);
  protected readonly cell = signal<{ day: number; period: TtPeriod } | null>(null);
  protected readonly clashOpen = signal(false);
  protected readonly uploading = signal(false);
  private ttSeq = 0;
  private weekSeq = 0;
  /** A teacher chosen in the teacher view (or the link); until then it follows the class in view. */
  private teacherPicked = false;

  protected readonly sectionOptions = computed<DropdownOption[]>(() =>
    [...this.classes()]
      .sort((a, b) => a.order - b.order)
      .flatMap((c) => c.sections.map((s) => ({ v: s.id, l: `${c.name} ${s.name}` }))),
  );
  protected readonly teacherOptions = computed<DropdownOption[]>(() =>
    this.teachers().map((t) => ({ v: t.id, l: person(t.name), sub: t.employeeNo ?? t.userType })),
  );
  /** The bell schedule: the timetable's when loaded, else the institution's. */
  protected readonly bell = computed<readonly TtPeriod[]>(
    () => this.tt()?.periods ?? this.periods()?.items ?? [],
  );
  protected readonly teaching = computed(() =>
    (this.periods()?.items ?? []).filter((p) => !p.isBreak),
  );
  private readonly isCurrentYear = computed(() => !!this.years.selected()?.current);
  protected readonly nowDay = computed(() => (this.isCurrentYear() ? weekday(today()) : 0));
  private readonly slots = computed(
    () => new Map((this.tt()?.slots ?? []).map((s) => [`${s.day}|${s.periodId}`, s] as const)),
  );
  private readonly clashSet = computed(() => {
    const sid = this.tt()?.section.id;
    return new Set(
      (this.clashes()?.clashes ?? [])
        .filter((c) => c.sections.some((s) => s.id === sid))
        .map((c) => `${c.day}|${c.period.id}`),
    );
  });
  private readonly weekMap = computed(() => {
    const m = new Map<string, WeekCell[]>();
    for (const w of this.week() ?? []) {
      const k = `${w.day}|${w.periodId}`;
      m.set(k, [...(m.get(k) ?? []), { section: w.section, subject: w.subject }]);
    }
    return m;
  });
  protected readonly teacherStats = computed(() => {
    const w = this.week() ?? [];
    const cells = this.weekMap();
    return {
      total: w.length,
      sections: new Set(w.map((x) => x.section.id)).size,
      free: Math.max(0, DAYS.length * this.teaching().length - cells.size),
      clashes: [...cells.values()].filter((a) => a.length > 1).length,
    };
  });
  protected readonly perSubject = computed(() => {
    const m = new Map<string, { name: string; colour: string; n: number }>();
    for (const s of this.tt()?.slots ?? []) {
      const x = m.get(s.subject.id) ?? { name: s.subject.name, colour: s.subject.colour, n: 0 };
      x.n++;
      m.set(s.subject.id, x);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  });
  protected readonly classTeacher = computed(() => {
    const sid = this.tt()?.section.id;
    const a = this.assignments()?.classTeachers.find((r) => r.section.id === sid)?.assignment;
    return a ? person(a.teacher.name) : '';
  });
  protected readonly uploadSub = computed(
    () =>
      `For ${this.years.selected()?.label ?? ''}. Each class-section in the file gets exactly the file's week: a row with no subject and no teacher is a free period, and a class-section with any problem is skipped whole. Class-sections not in the file keep their timetable.`,
  );
  protected readonly combined = computed(() => {
    const id = this.teacherId();
    const l = this.assignments();
    const a = [
      ...(l?.subjectTeachers ?? []),
      ...(l?.classTeachers.map((r) => r.assignment) ?? []),
    ].find((x) => x?.teacher.id === id);
    return a?.teacher.combined ? person(a.teacher.name) : '';
  });

  constructor() {
    const q = inject(ActivatedRoute).snapshot.queryParamMap;
    if (q.get('section')) this.sectionId.set(q.get('section')!);
    if (q.get('teacher')) {
      this.teacherPicked = true;
      this.teacherId.set(q.get('teacher')!);
      this.view.set('teacher');
    }
    effect(() => {
      // The year or the section changes the week shown.
      this.years.selectedId();
      this.sectionId();
      if (this.years.loaded() && this.sectionId()) untracked(() => void this.loadTt());
    });
    effect(() => {
      this.years.selectedId();
      if (this.years.loaded()) {
        untracked(() => {
          void this.loadClashes();
          void this.loadAssignments();
        });
      }
    });
    effect(() => {
      this.years.selectedId();
      this.teacherId();
      if (this.years.loaded() && this.teacherId()) untracked(() => void this.loadWeek());
    });
    if (!this.access.denied()) {
      void this.years.load();
      void this.lookups();
    }
  }

  protected async lookups() {
    this.lookupError.set('');
    const [c, p, t] = await Promise.allSettled([
      this.structure.classes(),
      this.structure.periods(),
      this.teachersApi.teachers(),
    ]);
    if (c.status === 'fulfilled') {
      this.classes.set(c.value.items);
      if (!this.sectionId()) this.sectionId.set(this.sectionOptions()[0]?.v ?? '');
    }
    this.classesLoaded.set(true);
    if (p.status === 'fulfilled') this.periods.set(p.value);
    if (t.status === 'fulfilled') {
      this.teachers.set(t.value);
      if (!this.teacherId()) this.teacherId.set(t.value[0]?.id ?? '');
    }
    const failed = [c, p].find((r) => r.status === 'rejected');
    if (failed && failed.status === 'rejected') this.lookupError.set(problemText(failed.reason));
  }

  protected async loadTt() {
    const id = this.sectionId();
    if (!id) return;
    const n = ++this.ttSeq;
    this.tt.set(null);
    this.ttError.set('');
    try {
      const t = await this.api.timetable(id, this.years.selectedId() || undefined);
      if (n === this.ttSeq) this.tt.set(t);
    } catch (e) {
      if (n === this.ttSeq) this.ttError.set(problemText(e));
    }
  }

  protected async loadClashes() {
    try {
      this.clashes.set(await this.api.clashes(this.years.selectedId() || undefined));
    } catch {
      this.clashes.set(null);
    }
  }

  private async loadWeek() {
    const n = ++this.weekSeq;
    this.week.set(null);
    try {
      const r = await this.api.clashes(this.years.selectedId() || undefined, this.teacherId());
      if (n === this.weekSeq) this.week.set(r.teacherWeek ?? []);
    } catch (e) {
      if (n === this.weekSeq) {
        this.week.set([]);
        this.overlays.toast("Couldn't load the teacher's week", {
          tone: 'bad',
          sub: problemText(e),
        });
      }
    }
  }

  private async loadAssignments() {
    try {
      this.assignments.set(
        await this.teachersApi.assignments(this.years.selectedId() || undefined),
      );
    } catch {
      this.assignments.set(null);
    }
  }

  /** The teacher view opens on the class teacher of the class-section in view (as the prototype). */
  protected toTeacher() {
    if (!this.teacherPicked) {
      const sid = this.tt()?.section.id ?? this.sectionId();
      const ct = this.assignments()?.classTeachers.find((r) => r.section.id === sid)?.assignment;
      if (ct && this.teachers().some((t) => t.id === ct.teacher.id))
        this.teacherId.set(ct.teacher.id);
    }
    this.view.set('teacher');
  }

  protected pickTeacher(id: string) {
    this.teacherPicked = true;
    this.teacherId.set(id);
  }

  protected goSection(id: string) {
    this.view.set('class');
    this.sectionId.set(id);
  }

  protected goPeriods() {
    void this.router.navigate(['/console/structure'], { queryParams: { tab: 'periods' } });
  }

  protected readonly templateFn = () => this.api.template(this.years.selected());

  /** The server's row report as the dialog shows it; counts are rows, the summary weeks and lessons. */
  protected readonly uploadFn = async (file: File, commit: boolean, key: string) => {
    const r = await this.api.upload(file, commit, key, this.years.selectedId() || undefined);
    const out: UploadCheck = {
      accepted: r.accepted,
      rejected: r.rejected,
      imported: r.committed ? r.accepted : 0,
      summary: [
        plural(r.sections, 'class-section'),
        plural(r.lessons, 'lesson'),
        r.skippedSections ? `${plural(r.skippedSections, 'class-section')} skipped` : '',
      ]
        .filter(Boolean)
        .join(' · '),
      rows: r.rows.map((x) => ({
        row: x.row,
        cells: [
          x.className,
          x.section,
          x.day,
          x.period,
          x.subject || x.teacher
            ? `${x.subject} · ${x.teacherName ? person(x.teacherName) : x.teacher}`
            : '—',
        ],
        accepted: x.accepted,
        reason: x.code ? translate(x.code, x.params) : '',
        note: x.outcome === 'FREE' ? 'Free period' : '',
      })),
    };
    return out;
  };

  /** After an import the week in view and the clashes are read again. */
  protected uploaded() {
    this.uploading.set(false);
    void this.loadTt();
    void this.loadClashes();
    if (this.teacherId()) void this.loadWeek();
  }

  /** The section's week as CSV (prototype cc.tt.export). */
  protected export() {
    const t = this.tt();
    if (!t) return;
    const name = `timetable_${t.section.label.replace(/\s+/g, '_')}_${t.year.label}.csv`;
    saveCsv(name, [
      ['Period', 'Time', ...DAYS.map((d) => this.dayName(d))],
      ...t.periods
        .filter((p) => !p.isBreak)
        .map((p) => [
          p.name,
          `${p.startsAt}-${p.endsAt}`,
          ...DAYS.map((d) => {
            const x = this.slotAt(d, p.id);
            return x ? `${x.subject.name} (${person(x.teacher.name)})` : '';
          }),
        ]),
    ]);
    this.overlays.toast(`CSV export prepared · ${plural(this.teaching().length, 'row')}`, {
      sub: name,
    });
  }

  // --- formatting ------------------------------------------------------------------------------------
  protected dayName(d: number) {
    return DAY_NAMES[d - 1] ?? '';
  }
  protected range(p: TtPeriod) {
    return tRange(p.startsAt, p.endsAt);
  }
  protected isNow(p: TtPeriod) {
    if (!this.nowDay() || this.nowDay() > 6) return false;
    const m = nowMinutes();
    return m >= minutesOf(p.startsAt) && m < minutesOf(p.endsAt);
  }
  protected slotAt(d: number, periodId: string): TtSlot | undefined {
    return this.slots().get(`${d}|${periodId}`);
  }
  protected isClash(d: number, periodId: string) {
    return this.clashSet().has(`${d}|${periodId}`);
  }
  protected weekAt(d: number, periodId: string): readonly WeekCell[] {
    return this.weekMap().get(`${d}|${periodId}`) ?? [];
  }
}
