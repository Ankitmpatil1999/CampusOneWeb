import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { Pager } from '../../../Shared/Pager';
import { formatDate } from '../../../Utils/format';
import { person } from '../Applications/app-format';
import { plural } from '../Fees/fee-format';
import { academicsAccess, byLabel, num, problemText } from '../Structure/academic-format';
import { AcademicYears, YearBanner, YearPicker } from '../Structure/academic-year';
import { SearchSelect } from '../../../Shared/SearchSelect';
import { StructureApi, type ClassView, type SubjectView } from '../Structure/structure.api';
import { TeachersApi, type AssignmentList } from '../Teachers/teachers.api';
import { AcademicReport } from './AcademicReport';
import { ExamDrawer } from './ExamDrawer';
import { ExamNameModal } from './ExamNameModal';
import { ExamNewDrawer } from './ExamNewDrawer';
import { createdMarks, examTimes, marksChip, scheduleChip } from './exam-format';
import {
  ExamsApi,
  type Exam,
  type ExamList,
  type ExamName,
  type MarksGroup,
  type MarksStatus,
} from './exams.api';

type Tab = 'ex' | 'nm' | 'ms' | 'rp';
type ExSort = 'name' | 'cs' | 'subject' | 'date' | 'max' | 'status' | 'mk';
type MsSort = 'name' | 'key' | 'up' | 'val';
const PAGE = 12;

/**
 * c.exams — Exams & marks (SRS 20.9, 20.10, 20.16, FR-ACA-07/08, CR-13; ACA-034…041; prototype
 * c.exams): the year's exams (search, exam name, class-section and subject filters; the exam
 * drawer with its change, withdrawal and marks validation), the exam names, the marks status by
 * exam name and class-section with validation, and the academic report. A closed year is
 * read-only.
 */
@Component({
  selector: 'rp-console-exams',
  imports: [
    AcademicReport,
    Dropdown,
    Empty,
    ExamDrawer,
    ExamNameModal,
    ExamNewDrawer,
    Icon,
    PageHead,
    Pager,
    SearchSelect,
    YearBanner,
    YearPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <rp-year-banner />
    <div class="c-page">
      <rp-page-head title="Exams & marks" [sub]="sub()">
        @if (!access.denied()) {
          @switch (tab()) {
            @case ('ex') {
              <span class="cp-why" [attr.title]="access.yearWhy() || null"
                ><button
                  type="button"
                  class="btn btn-pri"
                  id="ex-new"
                  [disabled]="!!access.yearWhy() || !list()"
                  (click)="creating.set(true)"
                >
                  <rp-icon name="plus" [size]="17" /><span>Create exam</span>
                </button></span
              >
            }
            @case ('nm') {
              <span class="cp-why" [attr.title]="access.editWhy() || null"
                ><button
                  type="button"
                  class="btn btn-pri"
                  id="exn-new"
                  [disabled]="!!access.editWhy()"
                  (click)="naming.set(true)"
                >
                  <rp-icon name="plus" [size]="17" /><span>Add exam name</span>
                </button></span
              >
            }
            @case ('rp') {
              <button
                type="button"
                class="btn btn-sec"
                id="rp-export"
                [disabled]="!hasMarks()"
                (click)="report()?.export()"
              >
                <rp-icon name="download" [size]="17" /><span>Export report</span>
              </button>
            }
          }
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
        <div class="tabs" role="tablist" aria-label="Exams and marks">
          @for (t of tabs(); track t.v) {
            <button
              type="button"
              class="tab"
              role="tab"
              [id]="'ex-tab-' + t.v"
              [class.on]="tab() === t.v"
              [attr.aria-selected]="tab() === t.v"
              (click)="setTab(t.v)"
            >
              {{ t.l }}
              @if (t.n !== null) {
                <span class="n">{{ num(t.n) }}</span>
              }
            </button>
          }
        </div>

        @if (loading() && !list()) {
          <div class="stack g16" aria-busy="true" aria-label="Loading">
            <div class="sk" style="height: 44px; border-radius: 12px"></div>
            <div class="sk" style="height: 420px; border-radius: 16px"></div>
          </div>
        } @else if (error()) {
          <div class="card pad">
            <rp-empty icon="alertc" title="Couldn't load the exams" [text]="error()">
              <button type="button" class="btn btn-sec btn-sm" (click)="load()">
                <span>Try again</span>
              </button>
            </rp-empty>
          </div>
        } @else if (list(); as l) {
          @switch (tab()) {
            @case ('nm') {
              <div class="tbl-wrap">
                <table class="tbl" id="exn-table">
                  <thead>
                    <tr>
                      <th>Exam name</th>
                      <th class="r">Exams in {{ l.year.label }}</th>
                      <th class="r">All years</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (n of names(); track n.id) {
                      <tr>
                        <td>
                          <b class="t-sb">{{ n.name }}</b>
                        </td>
                        <td class="r">{{ num(n.examsThisYear) }}</td>
                        <td class="r">{{ num(n.examsAllYears) }}</td>
                      </tr>
                    } @empty {
                      <tr>
                        <td colspan="3">
                          <rp-empty
                            icon="award"
                            title="No exam names yet"
                            text="Add the names your school uses, such as Unit Test 1 and Half-yearly."
                          />
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              @if (names().length) {
                <div class="pager">
                  <span>{{ plural(names().length, 'exam name') }}</span>
                </div>
              }
            }
            @case ('ms') {
              <div class="c-filters">
                <rp-year-picker inputId="ms-year" />
                <div class="pills" role="group" aria-label="Exams">
                  @for (p of scopes; track p.v) {
                    <button
                      type="button"
                      class="pill"
                      [class.on]="scope() === p.v"
                      [attr.aria-pressed]="scope() === p.v"
                      (click)="setScope(p.v)"
                    >
                      {{ p.l }}
                    </button>
                  }
                </div>
                <span class="fsum"
                  >Marks move from Created to Valid once validated (FR-ACA-08).</span
                >
              </div>
              @if (msError()) {
                <div class="card pad">
                  <rp-empty icon="alertc" title="Couldn't load the marks status" [text]="msError()">
                    <button type="button" class="btn btn-sec btn-sm" (click)="loadStatus()">
                      <span>Try again</span>
                    </button>
                  </rp-empty>
                </div>
              } @else if (!status()) {
                <div class="sk" style="height: 320px; border-radius: 16px" aria-busy="true"></div>
              } @else {
                <div class="tbl-wrap">
                  <table class="tbl" id="ms-table">
                    <thead>
                      <tr>
                        @for (c of msColumns; track c.k) {
                          <th
                            [class.sort]="c.sort"
                            [class.r]="c.r"
                            [class.asc]="c.sort && msSort()?.k === c.k && msSort()?.dir === 'asc'"
                            [class.desc]="c.sort && msSort()?.k === c.k && msSort()?.dir === 'desc'"
                            [attr.aria-sort]="c.sort ? ariaSort(msSort(), c.k) : null"
                            (click)="c.sort && sortMs(c.k)"
                          >
                            {{ c.l }}
                            @if (c.sort) {
                              <span class="sa" aria-hidden="true">{{
                                msSort()?.k === c.k && msSort()?.dir === 'desc' ? '↓' : '↑'
                              }}</span>
                            }
                          </th>
                        }
                      </tr>
                    </thead>
                    <tbody>
                      @for (g of msShown(); track g.key) {
                        <tr [attr.aria-label]="g.examName + ' ' + g.section">
                          <td>
                            <b class="t-sb">{{ g.examName }}</b>
                            <div class="cell-s">
                              {{ g.firstDate ? date(g.firstDate) : 'Date to be set' }}
                            </div>
                          </td>
                          <td>{{ g.section }}</td>
                          <td>
                            <div class="cc-pbar">
                              <span class="t-num">{{ g.uploaded }}/{{ g.due || g.exams }}</span>
                              <div
                                [class]="
                                  'bar ' + (g.uploaded >= (g.due || g.exams) ? 'ok' : 'warn')
                                "
                                role="meter"
                                [attr.aria-label]="
                                  'Marks uploaded for ' + g.examName + ' ' + g.section
                                "
                                [attr.aria-valuenow]="upPct(g)"
                                aria-valuemin="0"
                                aria-valuemax="100"
                              >
                                <i [style.width.%]="upPct(g)"></i>
                              </div>
                            </div>
                          </td>
                          <td class="r">{{ num(counts(g).validated) }}</td>
                          <td>
                            <span [class]="'chip dot tone-' + groupChip(g).tone">{{
                              groupChip(g).l
                            }}</span>
                          </td>
                          <td class="r">
                            @if (!access.yearWhy() && counts(g).created) {
                              <button
                                type="button"
                                class="btn btn-soft btn-xs"
                                [disabled]="validating() === g.key"
                                [class.is-busy]="validating() === g.key"
                                (click)="validateGroup(g)"
                              >
                                <rp-icon name="checkc" [size]="14" /><span>Validate</span>
                              </button>
                            }
                          </td>
                        </tr>
                      } @empty {
                        <tr>
                          <td [attr.colspan]="msColumns.length">
                            <rp-empty
                              icon="award"
                              [title]="scope() === 'due' ? 'No exams held yet' : 'No exams yet'"
                              [text]="
                                scope() === 'due'
                                  ? 'Marks status appears once an exam in ' +
                                    l.year.label +
                                    ' has taken place.'
                                  : 'Create exams for each class-section and subject.'
                              "
                            />
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                @if (msRows().length > pageSize) {
                  <rp-pager
                    [total]="msRows().length"
                    [page]="msPage()"
                    [size]="pageSize"
                    (go)="msPage.set($event)"
                  />
                } @else if (msRows().length) {
                  <div class="pager">
                    <span>{{ plural(msRows().length, 'exam') }}</span>
                  </div>
                }
              }
            }
            @case ('rp') {
              <rp-academic-report
                [exams]="l.items"
                [yearId]="years.selectedId()"
                [yearLabel]="l.year.label"
              />
            }
            @default {
              <div class="c-filters">
                <rp-year-picker inputId="ex-year" />
                <label class="search"
                  ><rp-icon name="search" [size]="16" /><input
                    type="search"
                    id="ex-q"
                    placeholder="Exam, class or subject"
                    aria-label="Search exams"
                    autocomplete="off"
                    [value]="q()"
                    (input)="q.set(val($event)); page.set(1)"
                /></label>
                <div class="fld">
                  <rp-dd
                    inputId="f-nm"
                    placeholder="All exam names"
                    [options]="nameOptions()"
                    [value]="nameF()"
                    (changed)="nameF.set($event); page.set(1)"
                  />
                </div>
                <div class="fld">
                  <rp-search-select
                    inputId="f-key"
                    placeholder="All class-sections"
                    [options]="sectionOptions()"
                    [value]="sectionF()"
                    (changed)="sectionF.set($event); page.set(1)"
                  />
                </div>
                <div class="fld">
                  <rp-dd
                    inputId="f-sub"
                    placeholder="All subjects"
                    [options]="subjectOptions()"
                    [value]="subjectF()"
                    (changed)="subjectF.set($event); page.set(1)"
                  />
                </div>
                <span class="fsum">{{ plural(rows().length, 'exam') }}</span>
              </div>
              <div class="tbl-wrap">
                <table class="tbl" id="ex-table">
                  <thead>
                    <tr>
                      @for (c of exColumns; track c.k) {
                        <th
                          class="sort"
                          [class.r]="c.r"
                          [class.asc]="exSort().k === c.k && exSort().dir === 'asc'"
                          [class.desc]="exSort().k === c.k && exSort().dir === 'desc'"
                          [attr.aria-sort]="ariaSort(exSort(), c.k)"
                          (click)="sortEx(c.k)"
                        >
                          {{ c.l
                          }}<span class="sa" aria-hidden="true">{{
                            exSort().k === c.k && exSort().dir === 'desc' ? '↓' : '↑'
                          }}</span>
                        </th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (e of shown(); track e.id) {
                      <tr
                        tabindex="0"
                        [attr.aria-label]="
                          e.name.name + ' ' + e.section.label + ' ' + e.subject.name
                        "
                        (click)="openId.set(e.id)"
                        (keydown.enter)="openId.set(e.id)"
                      >
                        <td>
                          <b class="t-sb">{{ e.name.name }}</b>
                          <div class="cell-s">
                            <span class="tag" title="Academic year (CR-13)"
                              ><rp-icon name="calendar" [size]="12" />{{ e.year.label }}</span
                            >
                          </div>
                        </td>
                        <td>{{ e.section.label }}</td>
                        <td>
                          <div class="row g8">
                            <i class="cc-dot" [style.background]="e.subject.colour"></i
                            >{{ e.subject.name }}
                          </div>
                        </td>
                        <td>
                          @if (e.date) {
                            {{ date(e.date) }}
                            @if (times(e)) {
                              <div class="cell-s">{{ times(e) }}</div>
                            }
                          } @else {
                            <span class="t-faint">Date to be set</span>
                          }
                        </td>
                        <td class="r">
                          <span class="t-num">{{ e.maxMarks }} / {{ e.passMarks }}</span>
                        </td>
                        <td>
                          <span [class]="'chip dot tone-' + schedule(e).tone">{{
                            schedule(e).l
                          }}</span>
                        </td>
                        <td>
                          <span [class]="'chip dot tone-' + chip(e).tone">{{ chip(e).l }}</span>
                          @if (chip(e).n) {
                            <div class="cell-s">{{ chip(e).n }} of {{ chip(e).of }} students</div>
                          }
                        </td>
                      </tr>
                    } @empty {
                      <tr>
                        <td [attr.colspan]="exColumns.length">
                          <rp-empty
                            icon="award"
                            [title]="'No exams in ' + l.year.label + (filtered() ? ' match' : '')"
                            [text]="
                              filtered()
                                ? 'Try clearing the filters.'
                                : 'Create exams for each class-section and subject.'
                            "
                          >
                            @if (!filtered() && !access.yearWhy()) {
                              <button
                                type="button"
                                class="btn btn-pri"
                                (click)="creating.set(true)"
                              >
                                <rp-icon name="plus" [size]="17" /><span>Create exam</span>
                              </button>
                            }
                          </rp-empty>
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
                  <span>{{ plural(rows().length, 'exam') }}</span>
                </div>
              }
            }
          }
        }
      }
    </div>

    @if (openExam(); as e) {
      <rp-exam-drawer
        [exam]="e"
        [year]="years.selected()!"
        [teachers]="teachersOf(e)"
        [readOnly]="access.yearWhy()"
        (closed)="openId.set(null)"
        (changed)="afterChange($event)"
        (stale)="load()"
      />
    }
    @if (creating() && years.selected()) {
      <rp-exam-new
        [year]="years.selected()!"
        [names]="names()"
        [classes]="classes()"
        [exams]="list()?.items ?? []"
        (closed)="creating.set(false)"
        (saved)="afterCreate()"
      />
    }
    @if (naming()) {
      <rp-exam-name-modal
        [names]="names()"
        (closed)="naming.set(false)"
        (saved)="naming.set(false); loadNames()"
      />
    }
  `,
})
export class ConsoleExams {
  private readonly api = inject(ExamsApi);
  private readonly structure = inject(StructureApi);
  private readonly teachersApi = inject(TeachersApi);
  private readonly overlays = inject(Overlays);
  protected readonly years = inject(AcademicYears);
  private readonly session = inject(SessionContext).console;
  protected readonly access = academicsAccess(this.session, this.years);
  protected readonly report = viewChild(AcademicReport);

  protected readonly pageSize = PAGE;
  protected readonly plural = plural;
  protected readonly num = num;
  protected readonly scopes: readonly { v: 'due' | 'all'; l: string }[] = [
    { v: 'due', l: 'Held so far' },
    { v: 'all', l: 'All exams' },
  ];
  protected readonly exColumns: readonly { k: ExSort; l: string; r?: boolean }[] = [
    { k: 'name', l: 'Exam' },
    { k: 'cs', l: 'Class-section' },
    { k: 'subject', l: 'Subject' },
    { k: 'date', l: 'Date' },
    { k: 'max', l: 'Max / pass', r: true },
    { k: 'status', l: 'Schedule' },
    { k: 'mk', l: 'Marks' },
  ];
  protected readonly msColumns: readonly {
    k: MsSort | 'st' | 'a';
    l: string;
    sort: boolean;
    r?: boolean;
  }[] = [
    { k: 'name', l: 'Exam', sort: true },
    { k: 'key', l: 'Class-section', sort: true },
    { k: 'up', l: 'Uploaded', sort: true },
    { k: 'val', l: 'Validated', sort: true, r: true },
    { k: 'st', l: 'Status', sort: false },
    { k: 'a', l: '', sort: false },
  ];

  protected readonly tab = signal<Tab>('ex');
  protected readonly list = signal<ExamList | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly names = signal<readonly ExamName[]>([]);
  protected readonly classes = signal<readonly ClassView[]>([]);
  protected readonly subjects = signal<readonly SubjectView[]>([]);
  protected readonly assignments = signal<AssignmentList | null>(null);
  protected readonly status = signal<MarksStatus | null>(null);
  protected readonly msError = signal('');
  protected readonly scope = signal<'due' | 'all'>('due');
  protected readonly validating = signal<string | null>(null);
  protected readonly q = signal('');
  protected readonly nameF = signal('');
  protected readonly sectionF = signal('');
  protected readonly subjectF = signal('');
  protected readonly page = signal(1);
  protected readonly msPage = signal(1);
  protected readonly exSort = signal<{ k: ExSort; dir: 'asc' | 'desc' }>({ k: 'date', dir: 'asc' });
  protected readonly msSort = signal<{ k: MsSort; dir: 'asc' | 'desc' } | null>(null);
  protected readonly openId = signal<string | null>(null);
  protected readonly creating = signal(false);
  protected readonly naming = signal(false);
  private seq = 0;
  private statusSeq = 0;

  protected readonly sub = computed(() => {
    const y = this.list()?.year.label ?? this.years.selected()?.label;
    return `Exam schedule, marks upload status and the academic report${y ? ' for ' + y : ''}`;
  });
  protected readonly tabs = computed(() => [
    { v: 'ex' as const, l: 'Exams', n: this.list()?.items.length ?? null },
    { v: 'nm' as const, l: 'Exam names', n: this.list() ? this.names().length : null },
    { v: 'ms' as const, l: 'Marks status', n: null },
    { v: 'rp' as const, l: 'Academic report', n: null },
  ]);
  protected readonly hasMarks = computed(() =>
    (this.list()?.items ?? []).some((e) => e.marks.entered > 0),
  );
  protected readonly openExam = computed(() => {
    const id = this.openId();
    return id ? (this.list()?.items.find((e) => e.id === id) ?? null) : null;
  });

  // --- the exams tab -------------------------------------------------------------------------------
  protected readonly nameOptions = computed<DropdownOption[]>(() => [
    { v: '', l: 'All exam names' },
    ...this.names().map((n) => ({ v: n.id, l: n.name })),
  ]);
  protected readonly sectionOptions = computed<DropdownOption[]>(() => [
    { v: '', l: 'All class-sections' },
    ...[...this.classes()]
      .sort((a, b) => a.order - b.order)
      .flatMap((c) => c.sections.map((s) => ({ v: s.id, l: `${c.name} ${s.name}` }))),
  ]);
  protected readonly subjectOptions = computed<DropdownOption[]>(() => [
    { v: '', l: 'All subjects' },
    ...this.subjects().map((s) => ({ v: s.id, l: s.name })),
  ]);
  protected readonly filtered = computed(
    () => !!(this.q().trim() || this.nameF() || this.sectionF() || this.subjectF()),
  );
  protected readonly rows = computed(() => {
    const q = this.q().trim().toLowerCase();
    const list = (this.list()?.items ?? []).filter(
      (e) =>
        (!this.nameF() || e.name.id === this.nameF()) &&
        (!this.sectionF() || e.section.id === this.sectionF()) &&
        (!this.subjectF() || e.subject.id === this.subjectF()) &&
        (!q ||
          [e.name.name, e.subject.name, e.section.label].some((x) => x.toLowerCase().includes(q))),
    );
    const order = new Map(this.classes().map((c) => [c.id, c.order]));
    const s = this.exSort();
    const val = (e: Exam): string | number =>
      s.k === 'name'
        ? e.name.name
        : s.k === 'cs'
          ? (order.get(e.class.id) ?? 0) * 100 + e.section.name.charCodeAt(0)
          : s.k === 'subject'
            ? e.subject.name
            : s.k === 'date'
              ? `${e.date ?? '9999'} ${e.startTime ?? ''}`
              : s.k === 'max'
                ? e.maxMarks
                : s.k === 'status'
                  ? scheduleChip(e).l
                  : marksChip(e).n;
    return [...list].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y), 'en', { numeric: true });
      return s.dir === 'desc' ? -c : c;
    });
  });
  protected readonly shown = computed(() =>
    this.rows().slice((this.page() - 1) * PAGE, this.page() * PAGE),
  );

  // --- the marks status tab ------------------------------------------------------------------------
  protected readonly msRows = computed(() => {
    const items = this.status()?.items ?? [];
    const s = this.msSort();
    if (!s) return items;
    const val = (g: MarksGroup): string | number =>
      s.k === 'name'
        ? `${g.examName} ${g.firstDate ?? ''}`
        : s.k === 'key'
          ? g.section
          : s.k === 'up'
            ? g.uploaded / Math.max(1, g.due || g.exams)
            : this.counts(g).validated;
    return [...items].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c =
        typeof x === 'number' && typeof y === 'number' ? x - y : byLabel(String(x), String(y));
      return s.dir === 'desc' ? -c : c;
    });
  });
  protected readonly msShown = computed(() =>
    this.msRows().slice((this.msPage() - 1) * PAGE, this.msPage() * PAGE),
  );

  constructor() {
    effect(() => {
      // A new year in context reloads the page.
      this.years.selectedId();
      if (this.years.loaded()) {
        untracked(() => {
          this.page.set(1);
          this.msPage.set(1);
          this.openId.set(null);
          void this.load();
        });
      }
    });
    if (!this.access.denied()) {
      void this.years.load();
      void this.lookups();
    }
  }

  async load() {
    if (this.access.denied()) return;
    const n = ++this.seq;
    this.loading.set(true);
    const y = this.years.selectedId() || undefined;
    try {
      const [l, names] = await Promise.all([this.api.exams(y), this.api.names(y)]);
      if (n !== this.seq) return;
      this.list.set(l);
      this.names.set(names.items);
      this.error.set('');
    } catch (e) {
      if (n === this.seq) this.error.set(problemText(e));
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
    if (n === this.seq) {
      void this.loadSubjects();
      void this.loadAssignments();
      if (this.tab() === 'ms') void this.loadStatus();
    }
  }

  async loadNames() {
    try {
      this.names.set((await this.api.names(this.years.selectedId() || undefined)).items);
    } catch (e) {
      this.overlays.toast("Couldn't load the exam names", { tone: 'bad', sub: problemText(e) });
    }
  }

  async loadStatus() {
    const n = ++this.statusSeq;
    this.status.set(null);
    this.msError.set('');
    try {
      const s = await this.api.marksStatus(this.scope(), this.years.selectedId() || undefined);
      if (n === this.statusSeq) this.status.set(s);
    } catch (e) {
      if (n === this.statusSeq) this.msError.set(problemText(e));
    }
  }

  private async lookups() {
    try {
      this.classes.set((await this.structure.classes()).items);
    } catch {
      // The class-section filter then offers every class-section of the exams only.
    }
  }

  private async loadSubjects() {
    try {
      this.subjects.set(
        (await this.structure.subjects(this.years.selectedId() || undefined)).items,
      );
    } catch {
      // The subject filter then lists nothing but "All subjects".
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

  protected setTab(t: Tab) {
    this.tab.set(t);
    if (t === 'ms') void this.loadStatus();
  }
  protected setScope(s: 'due' | 'all') {
    this.scope.set(s);
    this.msPage.set(1);
    void this.loadStatus();
  }

  protected afterCreate() {
    this.creating.set(false);
    void this.load();
  }

  protected afterChange(e: Exam | null) {
    if (!e) this.openId.set(null);
    void this.load();
  }

  /** prototype cc.ms.val: every exam of the group awaiting validation, one after another. */
  protected async validateGroup(g: MarksGroup) {
    if (this.access.yearWhy() || this.validating()) return;
    const exams = (this.list()?.items ?? []).filter(
      (e) => g.examIds.includes(e.id) && createdMarks(e) > 0,
    );
    const marks = exams.reduce((n, e) => n + createdMarks(e), 0);
    if (!exams.length) return;
    const ok = await this.overlays.confirm({
      title: `Validate ${g.examName} marks for ${g.section}?`,
      text: `${plural(marks, 'mark')} across ${plural(exams.length, 'subject')} become Valid and appear on report cards for students and parents.`,
      ok: 'Validate marks',
    });
    if (!ok) return;
    this.validating.set(g.key);
    let done = 0;
    try {
      for (const e of exams) {
        await this.api.validate(e.id);
        done++;
      }
      this.overlays.toast('Marks validated', {
        sub: `${g.examName} · ${g.section} · ${plural(marks, 'mark')}`,
      });
    } catch (x) {
      this.overlays.toast(
        done ? `${plural(done, 'subject')} validated, then stopped` : "Couldn't validate the marks",
        { tone: 'bad', sub: problemText(x) },
      );
    } finally {
      this.validating.set(null);
      void this.load();
      void this.loadStatus();
    }
  }

  // --- formatting ----------------------------------------------------------------------------------
  protected teachersOf(e: Exam): string[] {
    return (this.assignments()?.subjectTeachers ?? [])
      .filter((a) => a.section?.id === e.section.id && a.subject?.id === e.subject.id)
      .map((a) => person(a.teacher.name));
  }
  /**
   * The group's exams with every saved mark Valid, and those with marks still Created — counted from
   * the exams themselves (the server counts an exam whose roster grew after validation as awaiting).
   */
  protected counts(g: MarksGroup) {
    const exams = (this.list()?.items ?? []).filter((e) => g.examIds.includes(e.id));
    if (!exams.length) return { validated: g.validated, awaiting: g.awaiting, created: g.awaiting };
    return {
      validated: exams.filter((e) => e.marks.entered > 0 && !createdMarks(e)).length,
      awaiting: exams.filter((e) => createdMarks(e) > 0).length,
      created: exams.reduce((n, e) => n + createdMarks(e), 0),
    };
  }
  protected groupChip(g: MarksGroup) {
    const c = this.counts(g);
    if (g.missing) return { l: `${g.missing} not uploaded`, tone: 'warn' };
    if (c.awaiting) return { l: `${c.awaiting} awaiting validation`, tone: 'info' };
    if (g.due) return { l: 'All validated', tone: 'ok' };
    return { l: 'Not due', tone: 'neutral' };
  }
  protected upPct(g: MarksGroup) {
    const of = g.due || g.exams;
    return of ? Math.round((100 * Math.min(g.uploaded, of)) / of) : 0;
  }
  protected schedule(e: Exam) {
    return scheduleChip(e);
  }
  protected chip(e: Exam) {
    return marksChip(e);
  }
  protected times(e: Exam) {
    return examTimes(e);
  }
  protected date(d: string) {
    return formatDate(d);
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected sortEx(k: ExSort) {
    const s = this.exSort();
    this.exSort.set({ k, dir: s.k === k && s.dir === 'asc' ? 'desc' : 'asc' });
    this.page.set(1);
  }
  protected sortMs(k: string) {
    const key = k as MsSort;
    const s = this.msSort();
    this.msSort.set({ k: key, dir: s?.k === key && s.dir === 'asc' ? 'desc' : 'asc' });
    this.msPage.set(1);
  }
  protected ariaSort(s: { k: string; dir: 'asc' | 'desc' } | null, k: string) {
    return s?.k === k ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  }
}
