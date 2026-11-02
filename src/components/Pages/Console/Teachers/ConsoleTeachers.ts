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
import { Avatar } from '../../../Shared/Avatar';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { Pager } from '../../../Shared/Pager';
import { translate } from '../../../Utils/translate';
import { person } from '../Applications/app-format';
import { plural } from '../Fees/fee-format';
import { academicsAccess, byLabel, num, problemText } from '../Structure/academic-format';
import { AcademicYears, YearBanner, YearPicker } from '../Structure/academic-year';
import { BulkUpload, type UploadCheck } from '../Structure/BulkUpload';
import { StructureApi, type ClassView, type SubjectView } from '../Structure/structure.api';
import { ClassTeacherModal } from './ClassTeacherModal';
import { CoordinatorDrawer, type CoordinatorGroup } from './CoordinatorDrawer';
import { SubjectTeacherDrawer, type SectionChoice } from './SubjectTeacherDrawer';
import {
  TeachersApi,
  type Assignment,
  type AssignmentKind,
  type AssignmentList,
  type ClassTeacherRow,
  type SheetKind,
  type TeacherOption,
} from './teachers.api';

type Tab = 'ct' | 'st' | 'co';
type CtSort = 'l' | 't';
type StSort = 'teacher' | 'subject' | 'cs' | 'pw';
type CoSort = 'name' | 'sections' | 'students';
const PAGE = 12;

/**
 * c.teachers — Teacher assignments (SRS 20.7, FR-ACA-03, BR-52, CR-02, CR-13; ACA-021…023;
 * prototype c.teachers): for the academic year in context — the class teacher of every
 * class-section (one per section and year; assigned, changed or removed in a dialog), the subject
 * teachers with their periods a week (assigned in a drawer, removed unless still timetabled), and
 * the coordinators with the classes they oversee. Teachers holding both kinds of assignment get one
 * combined portal (CR-02). An empty year can copy an earlier year's assignments; a closed year is
 * read-only. Class and subject teachers can also be uploaded as a sheet (client 2026-10-21): the
 * template carries the year's assignments, and an upload adds or replaces, never removes.
 */
@Component({
  selector: 'rp-console-teachers',
  imports: [
    Avatar,
    BulkUpload,
    ClassTeacherModal,
    CoordinatorDrawer,
    Dropdown,
    Empty,
    Icon,
    Modal,
    PageHead,
    Pager,
    SubjectTeacherDrawer,
    YearBanner,
    YearPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <rp-year-banner />
    <div class="c-page">
      <rp-page-head title="Teacher assignments" [sub]="sub()">
        @if (!access.denied()) {
          @if (sheetKind(); as k) {
            <span class="cp-why" [attr.title]="access.yearWhy() || null"
              ><button
                type="button"
                class="btn btn-sec"
                id="tc-upload"
                [disabled]="!!access.yearWhy() || !list()"
                (click)="openUpload(k)"
              >
                <rp-icon name="upload" [size]="17" /><span>{{ uploadTitle(k) }}</span>
              </button></span
            >
          }
          <span class="cp-why" [attr.title]="access.yearWhy() || null"
            ><button
              type="button"
              class="btn btn-pri"
              id="tc-new"
              [disabled]="!!access.yearWhy() || !list()"
              (click)="create()"
            >
              <rp-icon name="plus" [size]="17" /><span>{{ createLabel() }}</span>
            </button></span
          >
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
        @if (loading() && !list()) {
          <div class="stack g16" aria-busy="true" aria-label="Loading">
            <div class="sk" style="height: 44px; border-radius: 12px"></div>
            <div class="stack g8">
              @for (i of [1, 2, 3, 4, 5, 6, 7]; track i) {
                <div class="sk" style="height: 40px; border-radius: 8px"></div>
              }
            </div>
          </div>
        } @else if (error()) {
          <div class="card pad">
            <rp-empty icon="alertc" title="Couldn't load the assignments" [text]="error()">
              <button type="button" class="btn btn-sec btn-sm" (click)="load()">
                <span>Try again</span>
              </button>
            </rp-empty>
          </div>
        } @else if (list(); as l) {
          @if (tab() !== 'co' ? combinedNote() : null; as c) {
            <div class="note tone-brand" id="tc-cr02">
              <rp-icon name="layers" [size]="17" />
              <div class="grow">
                <b
                  >{{ c.n }} {{ c.n === 1 ? 'teacher holds' : 'teachers hold' }} both a
                  class-teacher and a subject-teacher assignment</b
                >
                in {{ l.year.label }} — for example {{ c.name }}. They get one combined teacher
                portal whose menu is built from both assignments.
              </div>
            </div>
          }
          <div class="tabs" role="tablist" aria-label="Assignments">
            @for (t of tabs(); track t.v) {
              <button
                type="button"
                class="tab"
                role="tab"
                [class.on]="tab() === t.v"
                [attr.aria-selected]="tab() === t.v"
                (click)="tab.set(t.v); page.set(1)"
              >
                {{ t.l }}<span class="n">{{ t.n }}</span>
              </button>
            }
          </div>

          @switch (tab()) {
            @case ('st') {
              <div class="c-filters">
                <rp-year-picker inputId="tc-year" />
                <label class="search"
                  ><rp-icon name="search" [size]="16" /><input
                    type="search"
                    id="st-q"
                    placeholder="Teacher, class or subject"
                    aria-label="Search subject teachers"
                    autocomplete="off"
                    [value]="q()"
                    (input)="q.set(val($event)); page.set(1)"
                /></label>
                <div class="fld">
                  <rp-dd
                    inputId="f-sub"
                    placeholder="All subjects"
                    [options]="subjectFilter()"
                    [value]="subjectF()"
                    (changed)="subjectF.set($event); page.set(1)"
                  />
                </div>
                <div class="fld">
                  <rp-dd
                    inputId="f-cls"
                    placeholder="All classes"
                    [options]="classFilter()"
                    [value]="classF()"
                    (changed)="classF.set($event); page.set(1)"
                  />
                </div>
                <span class="fsum">{{ plural(stRows().length, 'assignment') }}</span>
              </div>
              @if (!l.subjectTeachers.length && copyFrom(); as from) {
                <div class="row end">
                  <span class="cp-why" [attr.title]="access.yearWhy() || null"
                    ><button
                      type="button"
                      class="btn btn-sec"
                      id="tc-copy"
                      [disabled]="!!access.yearWhy() || busy()"
                      (click)="copy('SUBJECT_TEACHER')"
                    >
                      <rp-icon name="copy" [size]="17" /><span
                        >Copy subject teachers from {{ from.label }}</span
                      >
                    </button></span
                  >
                </div>
              }
              <div class="tbl-wrap">
                <table class="tbl" id="st-table">
                  <thead>
                    <tr>
                      @for (c of stCols; track c.k) {
                        <th
                          class="sort"
                          [class.r]="c.r"
                          [class.asc]="stSort()?.k === c.k && stSort()?.dir === 'asc'"
                          [class.desc]="stSort()?.k === c.k && stSort()?.dir === 'desc'"
                          (click)="sortSt(c.k)"
                        >
                          {{ c.l
                          }}<span class="sa" aria-hidden="true">{{
                            stSort()?.k === c.k && stSort()?.dir === 'desc' ? '↓' : '↑'
                          }}</span>
                        </th>
                      }
                      <th>Portal</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (a of stShown(); track a.id) {
                      <tr>
                        <td>
                          <div class="cell-main">
                            <rp-av [name]="person(a.teacher.name)" size="sm" />
                            <div style="min-width: 0">
                              <div class="cell-t t-clip">{{ person(a.teacher.name) }}</div>
                              <div class="cell-s t-clip">{{ meta(a.teacher.id) }}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div class="row g8">
                            <i class="cc-dot" [style.background]="colour(a.subject?.id)"></i
                            >{{ a.subject?.name }}
                          </div>
                        </td>
                        <td>{{ sectionLabel(a) }}</td>
                        <td class="r">{{ num(a.periodsAWeek) }}</td>
                        <td>
                          @if (a.teacher.combined) {
                            <span class="chip dot tone-brand">Combined</span>
                          } @else {
                            <span class="chip dot">Subject teacher</span>
                          }
                        </td>
                        <td class="r">
                          @if (!access.yearWhy()) {
                            <button
                              type="button"
                              class="iconbtn"
                              title="Remove assignment"
                              [attr.aria-label]="
                                'Remove ' +
                                person(a.teacher.name) +
                                ', ' +
                                a.subject?.name +
                                ', ' +
                                sectionLabel(a)
                              "
                              (click)="removeSubject(a)"
                            >
                              <rp-icon name="trash" [size]="16" />
                            </button>
                          }
                        </td>
                      </tr>
                    } @empty {
                      <tr>
                        <td colspan="6">
                          <rp-empty
                            icon="briefcase"
                            [title]="'No subject-teacher assignments for ' + l.year.label"
                            [text]="
                              q() || subjectF() || classF()
                                ? 'Try clearing the filters.'
                                : 'Assign teachers to the subjects they teach in each class-section.'
                            "
                          />
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              @if (stRows().length > pageSize) {
                <rp-pager
                  [total]="stRows().length"
                  [page]="page()"
                  [size]="pageSize"
                  (go)="page.set($event)"
                />
              } @else if (stRows().length) {
                <div class="pager">
                  <span>{{ plural(stRows().length, 'assignment') }}</span>
                </div>
              }
            }
            @case ('co') {
              @if (years.options().length > 1) {
                <div class="c-filters"><rp-year-picker inputId="tc-year" /></div>
              }
              <p class="t-sm t-muted">
                A coordinator reviews teacher leave first and monitors attendance and exams for the
                classes they oversee.
              </p>
              <div class="tbl-wrap">
                <table class="tbl" id="co-table">
                  <thead>
                    <tr>
                      @for (c of coCols; track c.k) {
                        <th
                          [class.sort]="c.sort"
                          [class.r]="c.r"
                          [class.asc]="c.sort && coSort()?.k === c.k && coSort()?.dir === 'asc'"
                          [class.desc]="c.sort && coSort()?.k === c.k && coSort()?.dir === 'desc'"
                          (click)="c.sort && sortCo(c.k)"
                        >
                          {{ c.l }}
                          @if (c.sort) {
                            <span class="sa" aria-hidden="true">{{
                              coSort()?.k === c.k && coSort()?.dir === 'desc' ? '↓' : '↑'
                            }}</span>
                          }
                        </th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (g of coRows(); track g.teacher.id) {
                      <tr
                        [attr.tabindex]="access.yearWhy() ? null : 0"
                        (click)="openCoordinator(g)"
                        (keydown.enter)="openCoordinator(g)"
                      >
                        <td>
                          <div class="cell-main">
                            <rp-av [name]="person(g.teacher.name)" size="sm" />
                            <div style="min-width: 0">
                              <div class="cell-t t-clip">{{ person(g.teacher.name) }}</div>
                              <div class="cell-s t-clip">{{ meta(g.teacher.id) }}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div class="row g4 wrap">
                            @for (a of g.assignments; track a.id) {
                              <span class="tag">{{ a.class.name }}</span>
                            }
                          </div>
                        </td>
                        <td class="r">{{ num(sectionsOf(g)) }}</td>
                        <td class="r">{{ num(studentsOf(g)) }}</td>
                        <td>
                          <span class="tag"
                            ><rp-icon name="calendar" [size]="12" />{{ l.year.label }}</span
                          >
                        </td>
                      </tr>
                    } @empty {
                      <tr>
                        <td colspan="5">
                          <rp-empty
                            icon="briefcase"
                            [title]="'No coordinator allocations for ' + l.year.label"
                            text="Allocate the classes each academic coordinator oversees."
                          />
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              @if (groups().length) {
                <div class="pager">
                  <span>{{ plural(groups().length, 'allocation') }}</span>
                </div>
              }
            }
            @default {
              <div class="c-filters">
                <rp-year-picker inputId="tc-year" />
                <label class="search"
                  ><rp-icon name="search" [size]="16" /><input
                    type="search"
                    id="ct-q"
                    placeholder="Class or teacher"
                    aria-label="Search class teachers"
                    autocomplete="off"
                    [value]="q()"
                    (input)="q.set(val($event)); page.set(1)"
                /></label>
                <div class="pills" role="group" aria-label="Class teacher">
                  <button
                    type="button"
                    class="pill"
                    [class.on]="!unassigned()"
                    [attr.aria-pressed]="!unassigned()"
                    (click)="unassigned.set(false); page.set(1)"
                  >
                    All sections<span class="n">{{ l.classTeachers.length }}</span>
                  </button>
                  <button
                    type="button"
                    class="pill"
                    [class.on]="unassigned()"
                    [attr.aria-pressed]="unassigned()"
                    (click)="unassigned.set(true); page.set(1)"
                  >
                    No class teacher<span class="n">{{ vacant() }}</span>
                  </button>
                </div>
              </div>
              @if (!assignedCount() && copyFrom(); as from) {
                <div class="row end">
                  <span class="cp-why" [attr.title]="access.yearWhy() || null"
                    ><button
                      type="button"
                      class="btn btn-sec"
                      id="tc-copy"
                      [disabled]="!!access.yearWhy() || busy()"
                      (click)="copy('CLASS_TEACHER')"
                    >
                      <rp-icon name="copy" [size]="17" /><span
                        >Copy class teachers from {{ from.label }}</span
                      >
                    </button></span
                  >
                </div>
              }
              <div class="tbl-wrap">
                <table class="tbl" id="ct-table">
                  <thead>
                    <tr>
                      @for (c of ctCols; track c.k) {
                        <th
                          class="sort"
                          [class.asc]="ctSort()?.k === c.k && ctSort()?.dir === 'asc'"
                          [class.desc]="ctSort()?.k === c.k && ctSort()?.dir === 'desc'"
                          (click)="sortCt(c.k)"
                        >
                          {{ c.l
                          }}<span class="sa" aria-hidden="true">{{
                            ctSort()?.k === c.k && ctSort()?.dir === 'desc' ? '↓' : '↑'
                          }}</span>
                        </th>
                      }
                      <th>Also teaches here</th>
                      <th>Teacher portal</th>
                      <th>Year</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of ctShown(); track r.section.id) {
                      <tr>
                        <td>
                          <b class="t-sb">{{ rowLabel(r) }}</b>
                          <div class="cell-s">{{ plural(students(r.section.id), 'student') }}</div>
                        </td>
                        <td>
                          @if (r.assignment; as a) {
                            <div class="cell-main">
                              <rp-av [name]="person(a.teacher.name)" size="sm" />
                              <div style="min-width: 0">
                                <div class="cell-t t-clip">{{ person(a.teacher.name) }}</div>
                                <div class="cell-s t-clip">{{ meta(a.teacher.id) }}</div>
                              </div>
                            </div>
                          } @else {
                            <span class="chip dot tone-warn">Not assigned</span>
                          }
                        </td>
                        <td>
                          @if (r.assignment) {
                            @if (alsoTeaches(r); as s) {
                              <span class="t-sm">{{ s }}</span>
                            } @else {
                              <span class="t-faint">—</span>
                            }
                          }
                        </td>
                        <td>
                          @if (r.assignment; as a) {
                            @if (a.teacher.combined) {
                              <span
                                class="chip dot tone-brand"
                                title="Class-teacher and subject-teacher menus in one portal"
                                >Combined</span
                              >
                            } @else {
                              <span class="chip dot">Class teacher</span>
                            }
                          }
                        </td>
                        <td>
                          <span class="tag"
                            ><rp-icon name="calendar" [size]="12" />{{ l.year.label }}</span
                          >
                        </td>
                        <td class="r">
                          @if (!access.yearWhy()) {
                            <button
                              type="button"
                              class="btn btn-xs"
                              [class.btn-ghost]="!!r.assignment"
                              [class.btn-soft]="!r.assignment"
                              [attr.aria-label]="
                                (r.assignment ? 'Change' : 'Assign') +
                                ' the class teacher of ' +
                                rowLabel(r)
                              "
                              (click)="ctOpen.set({ row: r })"
                            >
                              <span>{{ r.assignment ? 'Change' : 'Assign' }}</span>
                            </button>
                          }
                        </td>
                      </tr>
                    } @empty {
                      <tr>
                        <td colspan="6">
                          <rp-empty
                            icon="users"
                            [title]="
                              l.classTeachers.length
                                ? 'No matching class-sections'
                                : 'No class teachers for ' + l.year.label
                            "
                            [text]="
                              l.classTeachers.length
                                ? 'Try a different search or clear the filters.'
                                : 'Add classes and sections first, then assign one class teacher to each class-section.'
                            "
                          />
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              @if (ctRows().length > pageSize) {
                <rp-pager
                  [total]="ctRows().length"
                  [page]="page()"
                  [size]="pageSize"
                  (go)="page.set($event)"
                />
              } @else if (ctRows().length) {
                <div class="pager">
                  <span>{{ plural(ctRows().length, 'class-section') }}</span>
                </div>
              }
            }
          }
        }
      }
    </div>

    @if (ctOpen(); as o) {
      <rp-class-teacher-modal
        [row]="o.row"
        [rows]="list()?.classTeachers ?? []"
        [teachers]="teachers()"
        [year]="years.selected()!"
        (closed)="ctOpen.set(null)"
        (changed)="ctOpen.set(null); list.set($event)"
      />
    }
    @if (stOpen()) {
      <rp-subject-teacher-drawer
        [teachers]="teachers()"
        [subjects]="subjects()"
        [sections]="sectionChoices()"
        [year]="years.selected()!"
        (closed)="stOpen.set(false)"
        (changed)="stOpen.set(false); list.set($event)"
      />
    }
    @if (coOpen(); as o) {
      <rp-coordinator-drawer
        [group]="o.group"
        [groups]="groups()"
        [teachers]="teachers()"
        [classes]="classes()"
        [year]="years.selected()!"
        (closed)="coOpen.set(null)"
        (changed)="coOpen.set(null); list.set($event)"
      />
    }
    @if (uploading(); as k) {
      <rp-bulk-upload
        [title]="uploadTitle(k)"
        [sub]="uploadSub()"
        [columns]="
          k === 'CLASS_TEACHER'
            ? 'Columns: class, section, teacher (employee ID or mobile number), teacher name.'
            : 'Columns: class, sections (comma-separated), subject (code or name), teacher (employee ID or mobile number), teacher name.'
        "
        [head]="
          k === 'CLASS_TEACHER'
            ? ['Class', 'Section', 'Teacher']
            : ['Class', 'Sections', 'Subject', 'Teacher']
        "
        [templateFn]="templateFn"
        [options]="replace()"
        [upload]="uploadFn"
        (closed)="uploading.set(null)"
        (imported)="uploaded()"
      >
        @if (k === 'CLASS_TEACHER') {
          <label bu-options class="chk"
            ><input
              type="checkbox"
              id="tc-replace"
              [checked]="replace()"
              (change)="replace.set(checked($event))"
            /><span
              >Replace class teachers already assigned (the previous teacher is kept as
              history)</span
            ></label
          >
        }
      </rp-bulk-upload>
    }
    @if (timetabled(); as a) {
      <rp-modal title="Assignment is on the timetable" icon="grid" (closed)="timetabled.set(null)">
        <p class="t-sm t-muted" style="line-height: 1.6">
          {{ person(a.teacher.name) }} has
          <b>{{ plural(a.periodsAWeek, (a.subject?.name ?? '') + ' period') }}</b> in
          {{ sectionLabel(a) }}. Give those periods to another teacher in the timetable first, then
          remove the assignment.
        </p>
        <div modal-foot class="cc-foot">
          <button type="button" class="btn btn-sec" (click)="timetabled.set(null)">
            <span>Close</span>
          </button>
          <button type="button" class="btn btn-pri" (click)="openTimetable(a)">
            <span>Open timetable</span>
          </button>
        </div>
      </rp-modal>
    }
  `,
})
export class ConsoleTeachers {
  private readonly api = inject(TeachersApi);
  private readonly structure = inject(StructureApi);
  private readonly overlays = inject(Overlays);
  private readonly router = inject(Router);
  protected readonly years = inject(AcademicYears);
  private readonly session = inject(SessionContext).console;
  protected readonly access = academicsAccess(this.session, this.years);

  protected readonly pageSize = PAGE;
  protected readonly plural = plural;
  protected readonly num = num;
  protected readonly person = person;
  protected readonly ctCols: readonly { k: CtSort; l: string }[] = [
    { k: 'l', l: 'Class-section' },
    { k: 't', l: 'Class teacher' },
  ];
  protected readonly stCols: readonly { k: StSort; l: string; r?: boolean }[] = [
    { k: 'teacher', l: 'Teacher' },
    { k: 'subject', l: 'Subject' },
    { k: 'cs', l: 'Class-section' },
    { k: 'pw', l: 'Periods a week', r: true },
  ];

  protected readonly coCols: readonly {
    k: CoSort | 'cl' | 'y';
    l: string;
    sort: boolean;
    r?: boolean;
  }[] = [
    { k: 'name', l: 'Coordinator', sort: true },
    { k: 'cl', l: 'Classes overseen', sort: false },
    { k: 'sections', l: 'Class-sections', sort: true, r: true },
    { k: 'students', l: 'Students', sort: true, r: true },
    { k: 'y', l: 'Year', sort: false },
  ];
  protected readonly coSort = signal<{ k: CoSort; dir: 'asc' | 'desc' } | null>(null);

  protected readonly tab = signal<Tab>('ct');
  protected readonly list = signal<AssignmentList | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly classes = signal<readonly ClassView[]>([]);
  protected readonly subjects = signal<readonly SubjectView[]>([]);
  protected readonly teachers = signal<readonly TeacherOption[]>([]);
  protected readonly q = signal('');
  protected readonly unassigned = signal(false);
  protected readonly subjectF = signal('');
  protected readonly classF = signal('');
  protected readonly page = signal(1);
  protected readonly ctSort = signal<{ k: CtSort; dir: 'asc' | 'desc' } | null>(null);
  protected readonly stSort = signal<{ k: StSort; dir: 'asc' | 'desc' } | null>(null);
  protected readonly ctOpen = signal<{ row: ClassTeacherRow | null } | null>(null);
  protected readonly stOpen = signal(false);
  protected readonly coOpen = signal<{ group: CoordinatorGroup | null } | null>(null);
  protected readonly timetabled = signal<Assignment | null>(null);
  protected readonly uploading = signal<SheetKind | null>(null);
  /** Class teachers: replace the ones already assigned (the old kept as history). */
  protected readonly replace = signal(false);
  private seq = 0;

  protected readonly sub = computed(() => {
    const y = this.list()?.year.label ?? this.years.selected()?.label;
    return `Class teachers, subject teachers and coordinators${y ? ' for ' + y : ''}`;
  });
  protected readonly createLabel = computed(() =>
    this.tab() === 'ct'
      ? 'Assign class teacher'
      : this.tab() === 'st'
        ? 'Assign subject teacher'
        : 'Allocate coordinator',
  );
  /** The sheet the tab offers (coordinators have none). */
  protected readonly sheetKind = computed<SheetKind | null>(() =>
    this.tab() === 'ct' ? 'CLASS_TEACHER' : this.tab() === 'st' ? 'SUBJECT_TEACHER' : null,
  );
  protected readonly uploadSub = computed(() => {
    const y = this.list()?.year.label ?? this.years.selected()?.label ?? '';
    return this.uploading() === 'CLASS_TEACHER'
      ? `For ${y}. The template lists every class-section with its class teacher — fill in the teacher column. An upload adds class teachers; it never removes one.`
      : `For ${y}. The template lists each class's subjects with their teachers; a row can name several sections. An upload adds subject teachers; it never removes one.`;
  });
  protected readonly groups = computed<CoordinatorGroup[]>(() => {
    type Group = { teacher: { id: string; name: string }; assignments: Assignment[] };
    const out = new Map<string, Group>();
    for (const a of this.list()?.coordinators ?? []) {
      const g: Group = out.get(a.teacher.id) ?? { teacher: a.teacher, assignments: [] };
      g.assignments.push(a);
      out.set(a.teacher.id, g);
    }
    return [...out.values()];
  });
  protected readonly coRows = computed(() => {
    const s = this.coSort();
    if (!s) return this.groups();
    const val = (g: CoordinatorGroup): string | number =>
      s.k === 'name'
        ? person(g.teacher.name)
        : s.k === 'sections'
          ? this.sectionsOf(g)
          : this.studentsOf(g);
    return [...this.groups()].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c =
        typeof x === 'number' && typeof y === 'number' ? x - y : byLabel(String(x), String(y));
      return s.dir === 'desc' ? -c : c;
    });
  });
  protected readonly assignedCount = computed(
    () => (this.list()?.classTeachers ?? []).filter((r) => r.assignment).length,
  );
  protected readonly vacant = computed(
    () => (this.list()?.classTeachers ?? []).filter((r) => !r.assignment).length,
  );
  protected readonly tabs = computed(() => [
    { v: 'ct' as const, l: 'Class teachers', n: this.assignedCount() },
    { v: 'st' as const, l: 'Subject teachers', n: this.list()?.subjectTeachers.length ?? 0 },
    { v: 'co' as const, l: 'Coordinators', n: this.groups().length },
  ]);
  protected readonly combinedNote = computed(() => {
    const l = this.list();
    if (!l?.combinedTeachers) return null;
    const ex = l.classTeachers.find((r) => r.assignment?.teacher.combined)?.assignment;
    return { n: l.combinedTeachers, name: person(ex?.teacher.name ?? '') };
  });
  /** An empty year can copy from the year before it (prototype cc.ct.copy). */
  protected readonly copyFrom = computed(() => {
    const y = this.years.selected();
    return y && y.status !== 'CLOSED' ? this.years.before(y) : null;
  });
  private readonly teacherMeta = computed(
    () => new Map(this.teachers().map((t) => [t.id, t.employeeNo ?? t.userType])),
  );
  private readonly sectionStudents = computed(
    () =>
      new Map(this.classes().flatMap((c) => c.sections.map((s) => [s.id, s.students] as const))),
  );
  protected readonly sectionChoices = computed<SectionChoice[]>(() =>
    [...this.classes()]
      .sort((a, b) => a.order - b.order)
      .flatMap((c) => c.sections.map((s) => ({ id: s.id, label: `${c.name} ${s.name}` }))),
  );
  protected readonly subjectFilter = computed<DropdownOption[]>(() => [
    { v: '', l: 'All subjects' },
    ...this.subjects().map((s) => ({ v: s.id, l: s.name })),
  ]);
  protected readonly classFilter = computed<DropdownOption[]>(() => [
    { v: '', l: 'All classes' },
    ...[...this.classes()].sort((a, b) => a.order - b.order).map((c) => ({ v: c.id, l: c.name })),
  ]);
  private readonly classOrder = computed(() => new Map(this.classes().map((c) => [c.id, c.order])));

  protected readonly ctRows = computed(() => {
    const q = this.q().trim().toLowerCase();
    const list = (this.list()?.classTeachers ?? []).filter(
      (r) =>
        (!this.unassigned() || !r.assignment) &&
        (!q ||
          this.rowLabel(r).toLowerCase().includes(q) ||
          (r.assignment?.teacher.name ?? '').toLowerCase().includes(q)),
    );
    const s = this.ctSort();
    const order = (r: ClassTeacherRow) =>
      `${String(this.classOrder().get(r.class.id) ?? 999).padStart(4, '0')} ${r.section.name}`;
    const val = (r: ClassTeacherRow) =>
      s?.k === 't' ? (r.assignment ? person(r.assignment.teacher.name) : '~') : order(r);
    const sorted = [...list].sort((a, b) => byLabel(val(a), val(b)));
    return s?.dir === 'desc' ? sorted.reverse() : sorted;
  });
  protected readonly ctShown = computed(() =>
    this.ctRows().slice((this.page() - 1) * PAGE, this.page() * PAGE),
  );
  protected readonly stRows = computed(() => {
    const q = this.q().trim().toLowerCase();
    const list = (this.list()?.subjectTeachers ?? []).filter(
      (a) =>
        (!this.subjectF() || a.subject?.id === this.subjectF()) &&
        (!this.classF() || a.class.id === this.classF()) &&
        (!q ||
          a.teacher.name.toLowerCase().includes(q) ||
          this.sectionLabel(a).toLowerCase().includes(q) ||
          (a.subject?.name ?? '').toLowerCase().includes(q)),
    );
    const s = this.stSort();
    if (!s) return list;
    const val = (a: Assignment): string | number =>
      s.k === 'teacher'
        ? person(a.teacher.name)
        : s.k === 'subject'
          ? (a.subject?.name ?? '')
          : s.k === 'cs'
            ? `${String(this.classOrder().get(a.class.id) ?? 999).padStart(4, '0')} ${a.section?.name ?? ''}`
            : a.periodsAWeek;
    return [...list].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c =
        typeof x === 'number' && typeof y === 'number' ? x - y : byLabel(String(x), String(y));
      return s.dir === 'desc' ? -c : c;
    });
  });
  protected readonly stShown = computed(() =>
    this.stRows().slice((this.page() - 1) * PAGE, this.page() * PAGE),
  );

  constructor() {
    const t = inject(ActivatedRoute).snapshot.queryParamMap.get('tab');
    if (t === 'ct' || t === 'st' || t === 'co') this.tab.set(t);
    effect(() => {
      this.years.selectedId();
      if (this.years.loaded()) untracked(() => void this.load());
    });
    if (!this.access.denied()) {
      void this.years.load();
      void this.lookups();
    }
  }

  protected async load() {
    if (this.access.denied()) return;
    const n = ++this.seq;
    this.loading.set(true);
    try {
      const l = await this.api.assignments(this.years.selectedId() || undefined);
      if (n !== this.seq) return;
      this.list.set(l);
      this.page.set(1);
      this.error.set('');
    } catch (e) {
      if (n === this.seq) this.error.set(problemText(e));
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
  }

  private async lookups() {
    const [c, s, t] = await Promise.allSettled([
      this.structure.classes(),
      this.structure.subjects(),
      this.api.teachers(),
    ]);
    if (c.status === 'fulfilled') this.classes.set(c.value.items);
    if (s.status === 'fulfilled') this.subjects.set(s.value.items);
    if (t.status === 'fulfilled') this.teachers.set(t.value);
  }

  protected create() {
    if (this.access.yearWhy() || !this.years.selected()) return;
    if (this.tab() === 'ct') this.ctOpen.set({ row: null });
    else if (this.tab() === 'st') this.stOpen.set(true);
    else this.coOpen.set({ group: null });
  }

  protected openUpload(k: SheetKind) {
    if (this.access.yearWhy() || !this.years.selected()) return;
    this.replace.set(false);
    this.uploading.set(k);
  }

  protected readonly templateFn = () =>
    this.api.template(this.uploading() ?? 'CLASS_TEACHER', this.years.selected());

  /** The server's row report as the dialog shows it; counts are rows, the summary assignments. */
  protected readonly uploadFn = async (file: File, commit: boolean, key: string) => {
    const kind = this.uploading() ?? 'CLASS_TEACHER';
    const r = await this.api.upload(kind, file, commit, key, {
      yearId: this.years.selectedId() || undefined,
      replace: kind === 'CLASS_TEACHER' && this.replace(),
    });
    const out: UploadCheck = {
      accepted: r.accepted,
      rejected: r.rejected,
      imported: r.committed ? r.accepted : 0,
      summary: [
        plural(r.created, 'new assignment'),
        r.replaced ? `${plural(r.replaced, 'class teacher')} replaced` : '',
        r.unchanged ? `${num(r.unchanged)} unchanged` : '',
      ]
        .filter(Boolean)
        .join(' · '),
      rows: r.rows.map((x) => ({
        row: x.row,
        cells: [
          x.className,
          x.sections,
          ...(kind === 'SUBJECT_TEACHER' ? [x.subject ?? ''] : []),
          x.teacherName ? person(x.teacherName) : x.teacher || '—',
        ],
        accepted: x.accepted,
        reason: x.code ? translate(x.code, x.params) : '',
        note:
          x.outcome === 'UNCHANGED'
            ? 'No change'
            : x.outcome === 'REPLACE'
              ? 'Replaces the current class teacher'
              : '',
      })),
    };
    return out;
  };

  protected uploaded() {
    this.uploading.set(null);
    void this.load();
  }

  protected openCoordinator(g: CoordinatorGroup) {
    if (this.access.yearWhy() || !this.years.selected()) return;
    this.coOpen.set({ group: g });
  }

  protected async copy(kind: AssignmentKind) {
    const from = this.copyFrom();
    const y = this.years.selected();
    if (!from || !y || this.access.yearWhy()) return;
    const what = kind === 'CLASS_TEACHER' ? 'class teachers' : 'subject teachers';
    const ok = await this.overlays.confirm({
      title: `Copy ${what} from ${from.label}?`,
      text: `Every ${from.label} assignment is copied into ${y.label}. Review and change them afterwards.`,
      ok: 'Copy assignments',
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      const r = await this.api.assign({ yearId: y.id, kind, copyFromYearId: from.id });
      this.list.set(r);
      this.overlays.toast('Assignments copied', {
        sub: `${plural(r.created, 'assignment')} · ${y.label}`,
      });
    } catch (e) {
      this.overlays.toast("Couldn't copy the assignments", { tone: 'bad', sub: problemText(e) });
    } finally {
      this.busy.set(false);
    }
  }

  protected async removeSubject(a: Assignment) {
    if (a.periodsAWeek) {
      this.timetabled.set(a);
      return;
    }
    const y = this.list()?.year.label ?? '';
    const ok = await this.overlays.confirm({
      title: 'Remove this assignment?',
      text: `${person(a.teacher.name)} will no longer teach ${a.subject?.name ?? ''} to ${this.sectionLabel(a)} in ${y}.`,
      ok: 'Remove',
      tone: 'bad',
    });
    if (!ok) return;
    try {
      this.list.set(await this.api.withdraw(a.id));
      this.overlays.toast('Assignment removed');
    } catch (e) {
      this.overlays.toast("Couldn't remove the assignment", { tone: 'bad', sub: problemText(e) });
    }
  }

  protected openTimetable(a: Assignment) {
    this.timetabled.set(null);
    void this.router.navigate(['/console/timetable'], {
      queryParams: a.section ? { section: a.section.id } : {},
    });
  }

  // --- formatting ------------------------------------------------------------------------------------
  protected rowLabel(r: ClassTeacherRow) {
    return `${r.class.name} ${r.section.name}`;
  }
  protected sectionLabel(a: Assignment) {
    return `${a.class.name}${a.section ? ' ' + a.section.name : ''}`;
  }
  protected uploadTitle(k: SheetKind) {
    return k === 'CLASS_TEACHER' ? 'Upload class teachers' : 'Upload subject teachers';
  }
  protected students(sectionId: string) {
    return this.sectionStudents().get(sectionId) ?? 0;
  }
  protected meta(teacherId: string) {
    return this.teacherMeta().get(teacherId) ?? '';
  }
  protected colour(subjectId: string | undefined) {
    return this.subjects().find((s) => s.id === subjectId)?.colour ?? '#5E7479';
  }
  protected alsoTeaches(r: ClassTeacherRow) {
    const t = r.assignment?.teacher.id;
    return (this.list()?.subjectTeachers ?? [])
      .filter((a) => a.teacher.id === t && a.section?.id === r.section.id)
      .map((a) => a.subject?.name ?? '')
      .join(', ');
  }
  protected sectionsOf(g: CoordinatorGroup) {
    return g.assignments.reduce(
      (n, a) => n + (this.classes().find((c) => c.id === a.class.id)?.sections.length ?? 0),
      0,
    );
  }
  protected studentsOf(g: CoordinatorGroup) {
    return g.assignments.reduce(
      (n, a) => n + (this.classes().find((c) => c.id === a.class.id)?.students ?? 0),
      0,
    );
  }
  protected sortCt(k: CtSort) {
    const s = this.ctSort();
    this.ctSort.set({ k, dir: s?.k === k && s.dir === 'asc' ? 'desc' : 'asc' });
  }
  protected sortCo(k: string) {
    const key = k as CoSort;
    const s = this.coSort();
    this.coSort.set({ k: key, dir: s?.k === key && s.dir === 'asc' ? 'desc' : 'asc' });
  }
  protected sortSt(k: StSort) {
    const s = this.stSort();
    this.stSort.set({ k, dir: s?.k === k && s.dir === 'asc' ? 'desc' : 'asc' });
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected checked(e: Event) {
    return (e.target as HTMLInputElement).checked;
  }
}
