import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Empty, Kpi } from '../../../Shared/Blocks';
import { Bars, type BarItem } from '../../../Shared/Charts';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { person } from '../Applications/app-format';
import { EnrolmentsApi } from '../Enrol/enrolments.api';
import { plural, saveCsv } from '../Fees/fee-format';
import { byLabel, problemText } from '../Structure/academic-format';
import { YearPicker } from '../Structure/academic-year';
import { SearchSelect } from '../../../Shared/SearchSelect';
import { marksOf, pct1 } from './exam-format';
import { ExamsApi, type AcademicReport as Report, type Exam } from './exams.api';

type SortKey = 's' | 'n' | 'hi' | 'avg' | 'lo' | 'pass' | 'fail' | 'pp';

interface Row {
  readonly id: string;
  readonly name: string;
  readonly colour: string;
  readonly max: number;
  readonly n: number;
  readonly hi: number | null;
  readonly avg: number | null;
  readonly lo: number | null;
  readonly pass: number;
  readonly fail: number;
  readonly pp: number;
}

/**
 * The academic report tab of c.exams (prototype academicReport; ACA-041, RNG-ACA-450): one exam
 * name in one class-section, from validated marks (marks awaiting validation on request) — the class
 * average, who passed every subject, the top of the class, and per subject the highest, average and
 * lowest marks, passes, failures and the pass rate, the average by subject and the top five. The
 * figures are the server's; percentages are turned back into marks of each exam's maximum.
 */
@Component({
  selector: 'rp-academic-report',
  imports: [Bars, Dropdown, Empty, Icon, Kpi, SearchSelect, YearPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @if (!withMarks().length) {
      <div class="c-filters"><rp-year-picker inputId="rp-year" /></div>
      <div class="card pad">
        <rp-empty
          icon="chart"
          [title]="'No marks recorded for ' + yearLabel() + ' yet'"
          text="The report fills in as teachers upload marks and they're validated."
        />
      </div>
    } @else {
      <div class="c-filters">
        <rp-year-picker inputId="rp-year" />
        <div class="fld">
          <rp-dd
            inputId="f-rn"
            placeholder="Exam name"
            [options]="nameOptions()"
            [value]="nameId()"
            (changed)="pickName($event)"
          />
        </div>
        <div class="fld">
          <rp-search-select
            inputId="f-rk"
            placeholder="Class-section"
            [options]="sectionOptions()"
            [value]="sectionId()"
            (changed)="section.set($event)"
          />
        </div>
        @if (pending()) {
          <label class="chk"
            ><input
              type="checkbox"
              id="f-rinc"
              [checked]="include()"
              (change)="include.set(checked($event))"
            /><span>Include {{ plural(pending(), 'mark') }} awaiting validation</span></label
          >
        }
        <span class="fsum"
          ><span class="tag" title="Academic year (CR-13)"
            ><rp-icon name="calendar" [size]="12" />{{ yearLabel() }}</span
          ></span
        >
      </div>

      @if (error()) {
        <div class="card pad">
          <rp-empty icon="alertc" title="Couldn't load the report" [text]="error()">
            <button type="button" class="btn btn-sec btn-sm" (click)="load()">
              <span>Try again</span>
            </button>
          </rp-empty>
        </div>
      } @else if (!report()) {
        <div class="stack g16" aria-busy="true" aria-label="Loading">
          <div class="c-grid k4 cc-kp">
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="sk" style="height: 104px; border-radius: 16px"></div>
            }
          </div>
          <div class="sk" style="height: 300px; border-radius: 16px"></div>
        </div>
      } @else {
        @let r = report()!;
        <div class="c-grid k4 cc-kp" id="rp-kpis">
          <rp-kpi label="Class average" icon="gauge" tone="brand" [value]="pct1(r.classAverage)" />
          <rp-kpi
            label="Passed every subject"
            icon="checkc"
            tone="ok"
            [value]="r.passedEverySubject + '/' + r.students.length"
            [delta]="
              (r.students.length ? round((100 * r.passedEverySubject) / r.students.length) : 0) +
              '% of students'
            "
          />
          <rp-kpi
            label="Top of the class"
            icon="trophy"
            tone="accent"
            [value]="r.students.length ? firstName(r.students[0]!.name) : '—'"
            [delta]="r.students.length ? pct1(r.students[0]!.percentage) : ''"
          />
          <rp-kpi
            label="Subjects reported"
            icon="book"
            [value]="reported() + '/' + groupExams().length"
            [delta]="
              pending() && !include()
                ? plural(pending(), 'mark') + ' awaiting validation'
                : 'All validated'
            "
          />
        </div>

        <div class="tbl-wrap">
          <table class="tbl" id="rp-table">
            <thead>
              <tr>
                @for (c of columns; track c.k) {
                  <th
                    class="sort"
                    [class.r]="c.r"
                    [class.asc]="sort()?.k === c.k && sort()?.dir === 'asc'"
                    [class.desc]="sort()?.k === c.k && sort()?.dir === 'desc'"
                    [attr.aria-sort]="ariaSort(c.k)"
                    [style.width]="c.k === 'pp' ? '200px' : null"
                    (click)="sortBy(c.k)"
                  >
                    {{ c.l
                    }}<span class="sa" aria-hidden="true">{{
                      sort()?.k === c.k && sort()?.dir === 'desc' ? '↓' : '↑'
                    }}</span>
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @for (x of rows(); track x.id) {
                <tr>
                  <td>
                    <div class="row g8">
                      <i class="cc-dot" [style.background]="x.colour"></i
                      ><b class="t-sb">{{ x.name }}</b>
                    </div>
                  </td>
                  <td class="r">{{ x.n }}</td>
                  <td class="r">
                    {{ marks(x.hi, x.max) }}<span class="t-faint">/{{ x.max }}</span>
                  </td>
                  <td class="r">{{ marks(x.avg, x.max, true) }}</td>
                  <td class="r">{{ marks(x.lo, x.max) }}</td>
                  <td class="r">{{ x.pass }}</td>
                  <td class="r">
                    @if (x.fail) {
                      <span class="t-bad t-sb">{{ x.fail }}</span>
                    } @else {
                      0
                    }
                  </td>
                  <td>
                    <div class="cc-pbar">
                      <span class="t-num">{{ x.pp }}%</span>
                      <div
                        [class]="'bar ' + (x.pp >= 90 ? 'ok' : x.pp >= 70 ? 'warn' : 'bad')"
                        role="meter"
                        [attr.aria-label]="'Pass rate in ' + x.name"
                        [attr.aria-valuenow]="x.pp"
                        aria-valuemin="0"
                        aria-valuemax="100"
                      >
                        <i [style.width.%]="x.pp"></i>
                      </div>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td [attr.colspan]="columns.length">
                    <rp-empty
                      icon="chart"
                      title="No validated marks here yet"
                      [text]="
                        pending()
                          ? 'Validate the marks, or include the ones awaiting validation.'
                          : 'Marks appear once teachers upload them.'
                      "
                    />
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="pager">
          <span>{{ plural(rows().length, 'subject') }}</span>
        </div>

        @if (rows().length) {
          <div class="c-grid k2">
            <div class="card pad stack g12">
              <h3 class="t-h4">
                Average by subject <span class="t-xs t-muted t-m">% of maximum marks</span>
              </h3>
              <rp-bars
                [items]="bars()"
                [w]="420"
                [h]="150"
                [hi]="barHi()"
                [fmt]="pctFmt"
                aria="Average by subject, per cent of maximum marks"
              />
            </div>
            <div class="card pad stack g8">
              <h3 class="t-h4">Top 5 in {{ sectionLabel() }}</h3>
              <div class="list plain">
                @for (s of top(); track s.id; let i = $index) {
                  <div class="li">
                    <span class="cc-rank">{{ i + 1 }}</span>
                    <span class="li-main"
                      ><span class="li-t">{{ person(s.name) }}</span
                      ><span class="li-s">{{
                        admission()[s.id] ??
                          (s.failedSubjects
                            ? plural(s.failedSubjects, 'subject') + ' below pass marks'
                            : 'Passed every subject')
                      }}</span></span
                    >
                    <span class="li-r"
                      ><b class="t-num">{{ pct1(s.percentage) }}</b></span
                    >
                  </div>
                }
              </div>
            </div>
          </div>
        }
      }
    }
  `,
})
export class AcademicReport {
  private readonly api = inject(ExamsApi);
  private readonly enrolments = inject(EnrolmentsApi);
  private readonly overlays = inject(Overlays);

  /** The year's exams (the report's exam names and class-sections are those with marks). */
  readonly exams = input.required<readonly Exam[]>();
  readonly yearId = input('');
  readonly yearLabel = input('');

  protected readonly plural = plural;
  protected readonly person = person;
  protected readonly pct1 = pct1;
  protected readonly round = Math.round;
  protected readonly pctFmt = (v: number) => `${v}%`;
  protected readonly columns: readonly { k: SortKey; l: string; r: boolean }[] = [
    { k: 's', l: 'Subject', r: false },
    { k: 'n', l: 'Students', r: true },
    { k: 'hi', l: 'Highest', r: true },
    { k: 'avg', l: 'Average', r: true },
    { k: 'lo', l: 'Lowest', r: true },
    { k: 'pass', l: 'Passed', r: true },
    { k: 'fail', l: 'Failed', r: true },
    { k: 'pp', l: 'Pass %', r: false },
  ];

  protected readonly name = signal('');
  protected readonly section = signal('');
  protected readonly include = signal(false);
  protected readonly report = signal<Report | null>(null);
  protected readonly error = signal('');
  protected readonly sort = signal<{ k: SortKey; dir: 'asc' | 'desc' } | null>(null);
  /** Admission numbers of the year's students (from the enrolment list, when it loads). */
  protected readonly admission = signal<Readonly<Record<string, string>>>({});
  private seq = 0;
  private admissionYear: string | null = null;

  protected readonly withMarks = computed(() => this.exams().filter((e) => e.marks.entered > 0));
  protected readonly nameOptions = computed<DropdownOption[]>(() => {
    const seen = new Map<string, string>();
    for (const e of this.withMarks()) seen.set(e.name.id, e.name.name);
    return [...seen].map(([v, l]) => ({ v, l }));
  });
  protected readonly nameId = computed(() => {
    const o = this.nameOptions();
    return o.some((x) => x.v === this.name()) ? this.name() : (o[0]?.v ?? '');
  });
  protected readonly sectionOptions = computed<DropdownOption[]>(() => {
    const seen = new Map<string, string>();
    for (const e of this.withMarks()) {
      if (e.name.id === this.nameId()) seen.set(e.section.id, e.section.label);
    }
    return [...seen].map(([v, l]) => ({ v, l })).sort((a, b) => byLabel(a.l, b.l));
  });
  /** The chosen class-section, else the one with the most marks for the exam name. */
  protected readonly sectionId = computed(() => {
    const o = this.sectionOptions();
    if (o.some((x) => x.v === this.section())) return this.section();
    const marks = new Map<string, number>();
    for (const e of this.withMarks()) {
      if (e.name.id === this.nameId()) {
        marks.set(e.section.id, (marks.get(e.section.id) ?? 0) + e.marks.entered);
      }
    }
    return o.reduce<string>(
      (best, x) => ((marks.get(x.v) ?? 0) > (marks.get(best) ?? -1) ? x.v : best),
      o[0]?.v ?? '',
    );
  });
  protected readonly sectionLabel = computed(
    () => this.sectionOptions().find((o) => o.v === this.sectionId())?.l ?? '',
  );
  /** The chosen exam name's exams in the chosen class-section. */
  protected readonly groupExams = computed(() =>
    this.exams().filter((e) => e.name.id === this.nameId() && e.section.id === this.sectionId()),
  );
  /** Marks of the group still Created (saved, not yet validated). */
  protected readonly pending = computed(() =>
    this.groupExams().reduce((n, e) => n + (e.marks.entered - e.marks.valid), 0),
  );
  protected readonly reported = computed(
    () => (this.report()?.subjects ?? []).filter((s) => s.students > 0).length,
  );
  private readonly baseRows = computed<Row[]>(() =>
    (this.report()?.subjects ?? []).map((s) => {
      const max = this.groupExams().find((e) => e.subject.id === s.subject.id)?.maxMarks ?? 100;
      return {
        id: s.subject.id,
        name: s.subject.name,
        colour: s.subject.colour,
        max,
        n: s.students,
        hi: s.highest,
        avg: s.average,
        lo: s.lowest,
        pass: s.passed,
        fail: s.failed,
        pp: Math.round(s.passRate ?? 0),
      };
    }),
  );
  protected readonly rows = computed(() => {
    const s = this.sort();
    const rows = this.baseRows();
    if (!s) return rows;
    const val = (r: Row): string | number =>
      s.k === 's' ? r.name : ((s.k === 'pp' ? r.pp : (r[s.k] as number | null)) ?? -1);
    return [...rows].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c =
        typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return s.dir === 'desc' ? -c : c;
    });
  });
  protected readonly bars = computed<BarItem[]>(() =>
    this.baseRows().map((r) => ({
      label: r.name.split(' ')[0] ?? r.name,
      value: Math.round(r.avg ?? 0),
    })),
  );
  protected readonly barHi = computed(() => {
    const b = this.bars();
    return b.reduce((best, x, i) => (x.value > (b[best]?.value ?? -1) ? i : best), 0);
  });
  protected readonly top = computed(() => (this.report()?.students ?? []).slice(0, 5));

  constructor() {
    effect(() => {
      // A new exam name, class-section, year or the pending switch reloads the report.
      const name = this.nameId();
      const section = this.sectionId();
      this.include();
      this.yearId();
      if (name && section) untracked(() => void this.load());
    });
  }

  async load() {
    const n = ++this.seq;
    this.report.set(null);
    this.error.set('');
    try {
      const r = await this.api.report({
        ...(this.yearId() ? { yearId: this.yearId() } : {}),
        examNameId: this.nameId(),
        sectionId: this.sectionId(),
        includePending: this.include(),
      });
      if (n !== this.seq) return;
      this.report.set(r);
      void this.loadAdmission();
    } catch (e) {
      if (n === this.seq) this.error.set(problemText(e));
    }
  }

  private async loadAdmission() {
    const y = this.yearId();
    if (this.admissionYear === y) return;
    this.admissionYear = y;
    try {
      const { items } = await this.enrolments.all(y || undefined);
      const m: Record<string, string> = {};
      for (const x of items) if (x.student.admissionNo) m[x.student.id] = x.student.admissionNo;
      this.admission.set(m);
    } catch {
      // The top five then show how many subjects each student is below pass marks in.
      this.admissionYear = null;
    }
  }

  protected pickName(id: string) {
    this.name.set(id);
    this.section.set('');
  }

  protected marks(pct: number | null, max: number, average = false) {
    return marksOf(pct, max, average);
  }
  protected firstName(n: string) {
    return person(n).split(' ')[0] ?? n;
  }
  protected checked(e: Event) {
    return (e.target as HTMLInputElement).checked;
  }
  protected sortBy(k: SortKey) {
    const s = this.sort();
    this.sort.set({ k, dir: s?.k === k && s.dir === 'asc' ? 'desc' : 'asc' });
  }
  protected ariaSort(k: SortKey) {
    const s = this.sort();
    return s?.k === k ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  }

  /** prototype cc.rp.export: the report as CSV (subjects, then the students' standings). */
  export() {
    const r = this.report();
    if (!r) return;
    const exam = this.nameOptions().find((o) => o.v === this.nameId())?.l ?? '';
    const file = `academic_report_${exam}_${this.sectionLabel()}_${this.yearLabel()}.csv`
      .replace(/\s+/g, '_')
      .toLowerCase();
    saveCsv(file, [
      [
        'Exam',
        'Class-section',
        'Subject',
        'Students',
        'Highest',
        'Average',
        'Lowest',
        'Max',
        'Passed',
        'Failed',
        'Pass %',
      ],
      ...this.baseRows().map((x) => [
        exam,
        this.sectionLabel(),
        x.name,
        x.n,
        marksOf(x.hi, x.max),
        marksOf(x.avg, x.max, true),
        marksOf(x.lo, x.max),
        x.max,
        x.pass,
        x.fail,
        x.pp,
      ]),
      [],
      ['Rank', 'Student', 'Admission no.', 'Percentage', 'Subjects below pass marks'],
      ...r.students.map((s, i) => [
        i + 1,
        person(s.name),
        this.admission()[s.id] ?? '',
        s.percentage.toFixed(1),
        s.failedSubjects,
      ]),
    ]);
    this.overlays.toast(`CSV export prepared · ${plural(this.baseRows().length, 'row')}`, {
      sub: file,
    });
  }
}
