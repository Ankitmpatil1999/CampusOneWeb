import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SessionContext } from '../../../../Context/SessionContext';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { person } from '../Applications/app-format';
import { translate } from '../../../Utils/translate';
import { ApiProblem } from '../../../Utils/problem';
import { TeachersApi, type AssignmentList } from '../Teachers/teachers.api';
import { academicsAccess, num, problemText, t12 } from './academic-format';
import { AcademicYears } from './academic-year';
import { BulkUpload, type UploadCheck } from './BulkUpload';
import { PeriodDrawer } from './PeriodDrawer';
import { SubjectDrawer } from './SubjectDrawer';
import { SubjectMapping } from './SubjectMapping';
import {
  StructureApi,
  type ClassSubjects,
  type ClassView,
  type PeriodList,
  type PeriodView,
  type SectionInput,
  type SubjectView,
} from './structure.api';

type Tab = 'classes' | 'subjects' | 'map' | 'periods';
type SortKey = 'order' | 'name' | 'students' | 'subjects';
type SubSortKey = 'code' | 'name' | 'classes' | 'teachers' | 'periodsAWeek';
const TABS: readonly Tab[] = ['classes', 'subjects', 'map', 'periods'];

/** Limits of the class form (ACA-010/011: name ≤ 40, order 0…999, ≤ 30 sections, capacity 1…500). */
const MAX_SECTIONS = 30;
const ORDER_MAX = 1000;
const CAPACITY = { min: 1, max: 500 } as const;

interface SectionDraft {
  readonly key: string;
  readonly id: string | null;
  readonly name: string;
  readonly capacity: string;
  readonly students: number;
}

interface Draft {
  readonly cls: ClassView | null;
  readonly name: string;
  readonly order: string;
  readonly sections: readonly SectionDraft[];
}

/**
 * c.structure — Classes & subjects (SRS 20.4–20.6, FR-ACA-03; ACA-009…011, ACA-014…020; prototype
 * c.structure): classes in promotion order with their sections, students, mapped subjects and class
 * teachers of the current year (a class is added or edited in a drawer; a sheet adds classes in
 * bulk); subjects with their code and colour; the class × subject mapping; and the bell schedule
 * (periods and breaks) with the school day drawn as a bar.
 */
@Component({
  selector: 'rp-console-structure',
  imports: [BulkUpload, Empty, Icon, Modal, PageHead, PeriodDrawer, SubjectDrawer, SubjectMapping],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Classes & subjects"
        sub="Classes, sections, subjects, the subjects each class studies and the bell schedule"
      >
        @if (!access.denied()) {
          @switch (tab()) {
            @case ('classes') {
              <span class="cp-why" [attr.title]="access.editWhy() || null"
                ><button
                  type="button"
                  class="btn btn-sec"
                  id="cs-upload"
                  [disabled]="!!access.editWhy()"
                  (click)="uploading.set(true)"
                >
                  <rp-icon name="upload" [size]="17" /><span>Upload classes</span>
                </button></span
              >
              <span class="cp-why" [attr.title]="access.editWhy() || null"
                ><button
                  type="button"
                  class="btn btn-pri"
                  [disabled]="!!access.editWhy()"
                  (click)="edit(null)"
                >
                  <rp-icon name="plus" [size]="17" /><span>Add class</span>
                </button></span
              >
            }
            @case ('subjects') {
              <span class="cp-why" [attr.title]="access.editWhy() || null"
                ><button
                  type="button"
                  class="btn btn-pri"
                  id="cs-add-subject"
                  [disabled]="!!access.editWhy()"
                  (click)="subjectOpen.set('new')"
                >
                  <rp-icon name="plus" [size]="17" /><span>Add subject</span>
                </button></span
              >
            }
            @case ('periods') {
              <span class="cp-why" [attr.title]="access.editWhy() || null"
                ><button
                  type="button"
                  class="btn btn-pri"
                  id="cs-add-period"
                  [disabled]="!!access.editWhy() || !periods()"
                  (click)="periodOpen.set('new')"
                >
                  <rp-icon name="plus" [size]="17" /><span>Add period</span>
                </button></span
              >
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
        <div class="tabs" role="tablist">
          @for (t of tabs(); track t.v) {
            <button
              type="button"
              class="tab"
              role="tab"
              [class.on]="tab() === t.v"
              [attr.aria-selected]="tab() === t.v"
              (click)="tab.set(t.v)"
            >
              {{ t.l }}
              @if (t.n !== null) {
                <span class="n">{{ t.n }}</span>
              }
            </button>
          }
        </div>
        @switch (tab()) {
          @case ('subjects') {
            @if (subjectsError()) {
              <div class="card pad">
                <rp-empty icon="alertc" title="Couldn't load the subjects" [text]="subjectsError()">
                  <button type="button" class="btn btn-sec btn-sm" (click)="loadSubjects()">
                    <span>Try again</span>
                  </button>
                </rp-empty>
              </div>
            } @else if (!subjectsLoaded()) {
              <div class="stack g8" aria-busy="true" aria-label="Loading">
                @for (i of [1, 2, 3, 4, 5, 6]; track i) {
                  <div class="sk" style="height: 40px; border-radius: 8px"></div>
                }
              </div>
            } @else {
              <div class="tbl-wrap">
                <table class="tbl" id="sub-table">
                  <thead>
                    <tr>
                      @for (c of subCols; track c.k) {
                        <th
                          class="sort"
                          [class.r]="c.r"
                          [class.asc]="subSort()?.k === c.k && subSort()?.dir === 'asc'"
                          [class.desc]="subSort()?.k === c.k && subSort()?.dir === 'desc'"
                          (click)="sortSubjects(c.k)"
                        >
                          {{ c.l
                          }}<span class="sa" aria-hidden="true">{{
                            subSort()?.k === c.k && subSort()?.dir === 'desc' ? '↓' : '↑'
                          }}</span>
                        </th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (s of sortedSubjects(); track s.id) {
                      <tr
                        tabindex="0"
                        (click)="subjectOpen.set(s)"
                        (keydown.enter)="subjectOpen.set(s)"
                      >
                        <td>
                          <span class="t-mono">{{ s.code }}</span>
                        </td>
                        <td>
                          <div class="row g8">
                            <i class="cc-dot" [style.background]="s.colour"></i
                            ><b class="t-sb">{{ s.name }}</b>
                          </div>
                        </td>
                        <td class="r">{{ num(s.classes) }}</td>
                        <td class="r">{{ num(s.teachers) }}</td>
                        <td class="r">{{ num(s.periodsAWeek) }}</td>
                      </tr>
                    } @empty {
                      <tr>
                        <td colspan="5">
                          <rp-empty
                            icon="book"
                            title="No subjects yet"
                            text="Add each subject with a short code and a colour, then map it to the classes that study it."
                          >
                            @if (!access.editWhy()) {
                              <button
                                type="button"
                                class="btn btn-sec"
                                (click)="subjectOpen.set('new')"
                              >
                                <rp-icon name="plus" [size]="17" /><span>Add subject</span>
                              </button>
                            }
                          </rp-empty>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              @if (subjects().length) {
                <div class="pager">
                  <span>{{ plural(subjects().length, 'subject') }}</span>
                </div>
              }
            }
          }
          @case ('map') {
            @if (mappingError() || subjectsError() || error()) {
              <div class="card pad">
                <rp-empty
                  icon="alertc"
                  title="Couldn't load the subject mapping"
                  [text]="mappingError() || subjectsError() || error()"
                >
                  <button type="button" class="btn btn-sec btn-sm" (click)="reloadAll()">
                    <span>Try again</span>
                  </button>
                </rp-empty>
              </div>
            } @else if (loading() || !subjectsLoaded() || !mappingLoaded()) {
              <div class="stack g8" aria-busy="true" aria-label="Loading">
                @for (i of [1, 2, 3, 4, 5, 6]; track i) {
                  <div class="sk" style="height: 40px; border-radius: 8px"></div>
                }
              </div>
            } @else {
              <rp-subject-mapping
                [classes]="classes()"
                [subjects]="subjects()"
                [mapping]="mapping()"
                [readOnly]="access.editWhy()"
                (saved)="loadMapping(); loadSubjects()"
              />
            }
          }
          @case ('periods') {
            @if (periodsError()) {
              <div class="card pad">
                <rp-empty icon="alertc" title="Couldn't load the periods" [text]="periodsError()">
                  <button type="button" class="btn btn-sec btn-sm" (click)="loadPeriods()">
                    <span>Try again</span>
                  </button>
                </rp-empty>
              </div>
            } @else if (!periods()) {
              <div class="stack g8" aria-busy="true" aria-label="Loading">
                @for (i of [1, 2, 3, 4, 5, 6]; track i) {
                  <div class="sk" style="height: 40px; border-radius: 8px"></div>
                }
              </div>
            } @else {
              <div class="c-grid s21">
                <div>
                  <div class="tbl-wrap">
                    <table class="tbl" id="per-table">
                      <thead>
                        <tr>
                          <th style="width: 44px">#</th>
                          <th>Name</th>
                          <th>Starts</th>
                          <th>Ends</th>
                          <th class="r">Length</th>
                          <th>Kind</th>
                          <th class="r">Timetable slots</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (p of periods()!.items; track p.id; let i = $index) {
                          <tr
                            tabindex="0"
                            (click)="periodOpen.set(p)"
                            (keydown.enter)="periodOpen.set(p)"
                          >
                            <td>
                              <span class="t-num t-muted">{{ i + 1 }}</span>
                            </td>
                            <td>
                              <b class="t-sb">{{ p.name }}</b>
                            </td>
                            <td>{{ t12(p.startsAt) }}</td>
                            <td>{{ t12(p.endsAt) }}</td>
                            <td class="r">{{ p.minutes }} min</td>
                            <td>
                              @if (p.isBreak) {
                                <span class="chip dot">Break</span>
                              } @else {
                                <span class="chip dot tone-brand">Teaching</span>
                              }
                            </td>
                            <td class="r">
                              @if (p.isBreak) {
                                <span class="t-faint">—</span>
                              } @else {
                                {{ num(p.timetableSlots) }}
                              }
                            </td>
                          </tr>
                        } @empty {
                          <tr>
                            <td colspan="7">
                              <rp-empty
                                icon="clock"
                                title="No periods yet"
                                text="Add the teaching periods and breaks of the school day. Timetables are built on them."
                              >
                                @if (!access.editWhy()) {
                                  <button
                                    type="button"
                                    class="btn btn-sec"
                                    (click)="periodOpen.set('new')"
                                  >
                                    <rp-icon name="plus" [size]="17" /><span>Add period</span>
                                  </button>
                                }
                              </rp-empty>
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                  @if (periods()!.items.length) {
                    <div class="pager">
                      <span>{{ plural(periods()!.items.length, 'period') }}</span>
                    </div>
                  }
                </div>
                <div class="card pad stack g12" id="per-day">
                  <h3 class="t-h4">School day</h3>
                  @if (bell().length) {
                    <div class="cc-bell">
                      @for (b of bell(); track b.id) {
                        <div
                          class="bi"
                          [class.brk]="b.isBreak"
                          [style.flex]="b.minutes"
                          [attr.title]="b.name + ' · ' + t12(b.startsAt) + '–' + t12(b.endsAt)"
                        >
                          <span>{{ b.short }}</span>
                        </div>
                      }
                    </div>
                    <div class="row between t-xs t-muted">
                      <span>{{ t12(bell()[0]!.startsAt) }}</span
                      ><span>{{ t12(bell()[bell().length - 1]!.endsAt) }}</span>
                    </div>
                  }
                  <dl class="kv">
                    <dt>Teaching periods</dt>
                    <dd>{{ periods()!.summary.teachingPeriods }}</dd>
                    <dt>Teaching time</dt>
                    <dd>{{ periods()!.summary.teachingMinutes }} min</dd>
                    <dt>Breaks</dt>
                    <dd>{{ periods()!.summary.breakMinutes }} min</dd>
                  </dl>
                  <p class="t-xs t-muted">
                    Periods can't overlap and must end after they start. A period used by a
                    timetable can't be removed.
                  </p>
                </div>
              </div>
            }
          }
          @default {
            @if (loading()) {
              <div class="stack g8" aria-busy="true" aria-label="Loading">
                @for (i of [1, 2, 3, 4, 5, 6, 7]; track i) {
                  <div class="sk" style="height: 40px; border-radius: 8px"></div>
                }
              </div>
            } @else if (error()) {
              <div class="card pad">
                <rp-empty icon="alertc" title="Couldn't load the classes" [text]="error()">
                  <button type="button" class="btn btn-sec btn-sm" (click)="load()">
                    <span>Try again</span>
                  </button>
                </rp-empty>
              </div>
            } @else {
              <div class="tbl-wrap">
                <table class="tbl" id="cls-table">
                  <thead>
                    <tr>
                      @for (c of cols; track c.k) {
                        <th
                          [class.sort]="c.sort"
                          [class.r]="c.r"
                          [class.asc]="c.sort && sort()?.k === c.k && sort()?.dir === 'asc'"
                          [class.desc]="c.sort && sort()?.k === c.k && sort()?.dir === 'desc'"
                          [style.width]="c.w"
                          (click)="c.sort && sortBy(c.k)"
                        >
                          {{ c.k === 'ct' ? teachersLabel() : c.l }}
                          @if (c.sort) {
                            <span class="sa">{{
                              sort()?.k === c.k && sort()?.dir === 'desc' ? '↓' : '↑'
                            }}</span>
                          }
                        </th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (c of rows(); track c.id) {
                      <tr tabindex="0" (click)="edit(c)" (keydown.enter)="edit(c)">
                        <td>
                          <span class="t-num t-muted">{{ c.order + 1 }}</span>
                        </td>
                        <td>
                          <b class="t-sb">{{ c.name }}</b>
                        </td>
                        <td>
                          <div class="row g4 wrap">
                            @for (s of c.sections; track s.id) {
                              <span class="tag"
                                >{{ s.name }}
                                <span class="t-faint t-num">{{ s.students }}</span></span
                              >
                            } @empty {
                              <span class="t-faint">—</span>
                            }
                          </div>
                        </td>
                        <td class="r">{{ num(c.students) }}</td>
                        <td class="r">
                          @if (subjectCount(c.id); as n) {
                            {{ n }}
                          } @else {
                            <span class="t-faint">—</span>
                          }
                        </td>
                        <td>
                          @if (ctCount(c); as ct) {
                            <span
                              class="chip dot"
                              [class.tone-ok]="ct.n === ct.of"
                              [class.tone-warn]="ct.n !== ct.of"
                              >{{ ct.n }} of {{ ct.of }}</span
                            >
                          } @else {
                            <span class="t-faint">—</span>
                          }
                        </td>
                        <td>
                          <span class="row-acts"><rp-icon name="edit" [size]="15" /></span>
                        </td>
                      </tr>
                    } @empty {
                      <tr>
                        <td [attr.colspan]="cols.length">
                          <rp-empty
                            icon="school"
                            title="No classes yet"
                            text="Add each class (grade) with its sections, in promotion order."
                          >
                            @if (!access.editWhy()) {
                              <button type="button" class="btn btn-sec" (click)="edit(null)">
                                <rp-icon name="plus" [size]="17" /><span>Add class</span>
                              </button>
                            }
                          </rp-empty>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              @if (rows().length) {
                <div class="pager">
                  <span>{{ rows().length }} {{ rows().length === 1 ? 'class' : 'classes' }}</span>
                </div>
              }
            }
          }
        }
      }
    </div>

    @if (draft(); as d) {
      <rp-modal
        [title]="d.cls ? d.cls.name : 'Add a class'"
        [sub]="
          d.cls
            ? plural(d.cls.sections.length, 'section') + ' · ' + plural(d.cls.students, 'student')
            : 'A class (grade) and its sections'
        "
        [drawer]="true"
        [slim]="true"
        icon="school"
        (closed)="draft.set(null)"
      >
        <div class="stack g16" id="cp-clf">
          @if (access.editWhy()) {
            <div class="note tone-info">
              <rp-icon name="lock" [size]="17" />
              <div class="grow">{{ access.editWhy() }}</div>
            </div>
          }
          @if (err('form')) {
            <div class="note tone-bad">
              <rp-icon name="alertc" [size]="17" />
              <div class="grow">{{ err('form') }}</div>
            </div>
          }
          <div class="c-form">
            <div class="fld" [class.invalid]="err('name')">
              <label class="fld-l" for="cp-cl-n">Class name<span class="req">*</span></label>
              <div class="fld-in">
                <input
                  id="cp-cl-n"
                  maxlength="40"
                  autocomplete="off"
                  placeholder="e.g. Grade 7"
                  aria-describedby="cp-cl-n-e"
                  [readOnly]="!!access.editWhy()"
                  [value]="d.name"
                  (input)="patch({ name: value($event) }, 'name')"
                />
              </div>
              <div class="fld-e" id="cp-cl-n-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('name') }}</span>
              </div>
            </div>
            <div class="fld" [class.invalid]="err('order')">
              <label class="fld-l" for="cp-cl-o">Order<span class="req">*</span></label>
              <div class="fld-in">
                <input
                  id="cp-cl-o"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  [attr.max]="orderMax"
                  aria-describedby="cp-cl-o-e"
                  [readOnly]="!!access.editWhy()"
                  [value]="d.order"
                  (input)="patch({ order: value($event) }, 'order')"
                />
              </div>
              <div class="fld-e" id="cp-cl-o-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('order') }}</span>
              </div>
              <div class="fld-h">Position in the promotion order</div>
            </div>
            <div class="full stack g8" id="cp-cl-secs">
              <span class="fld-l">Sections<span class="req">*</span></span>
              @for (s of d.sections; track s.key; let i = $index) {
                <div class="row g8 top">
                  <div class="fld grow" [class.invalid]="err('sec:' + s.key)">
                    <div class="fld-in">
                      <input
                        maxlength="20"
                        autocomplete="off"
                        placeholder="e.g. A"
                        [id]="'cp-cl-s' + i"
                        [attr.aria-label]="'Section ' + (i + 1) + ' name'"
                        [readOnly]="!!access.editWhy()"
                        [value]="s.name"
                        (input)="setSection(s.key, { name: value($event) }, 'sec:')"
                      />
                    </div>
                    <div class="fld-e" role="alert">
                      <rp-icon name="alertc" [size]="14" /><span>{{ err('sec:' + s.key) }}</span>
                    </div>
                  </div>
                  <div class="fld" style="width: 150px" [class.invalid]="err('cap:' + s.key)">
                    <div class="fld-in">
                      <input
                        type="number"
                        inputmode="numeric"
                        placeholder="Any"
                        [attr.min]="capacity.min"
                        [attr.max]="capacity.max"
                        [id]="'cp-cl-c' + i"
                        [attr.aria-label]="'Section ' + (i + 1) + ' capacity (optional)'"
                        [readOnly]="!!access.editWhy()"
                        [value]="s.capacity"
                        (input)="setSection(s.key, { capacity: value($event) }, 'cap:')"
                      /><span class="suf plain">seats</span>
                    </div>
                    <div class="fld-e" role="alert">
                      <rp-icon name="alertc" [size]="14" /><span>{{ err('cap:' + s.key) }}</span>
                    </div>
                  </div>
                  @if (!access.editWhy()) {
                    @if (s.students) {
                      <span class="cp-why" style="margin-top: 4px" [attr.title]="inUse(s)"
                        ><button
                          type="button"
                          class="iconbtn"
                          disabled
                          [attr.aria-label]="inUse(s)"
                        >
                          <rp-icon name="lock" [size]="15" /></button
                      ></span>
                    } @else {
                      <button
                        type="button"
                        class="iconbtn"
                        style="margin-top: 4px"
                        [attr.aria-label]="'Remove section ' + (s.name || i + 1)"
                        (click)="removeSection(s.key)"
                      >
                        <rp-icon name="x" [size]="16" />
                      </button>
                    }
                  }
                </div>
              } @empty {
                <p class="t-sm t-muted">No sections yet.</p>
              }
              <div class="fld" [class.invalid]="err('sections')">
                <div class="fld-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('sections') }}</span>
                </div>
                <div class="fld-h">
                  Each section needs a different name, e.g. A, B, C. Capacity is optional. A section
                  with students can't be removed.
                </div>
              </div>
              @if (!access.editWhy()) {
                <div>
                  <button
                    type="button"
                    class="btn btn-sec btn-sm"
                    [disabled]="d.sections.length >= maxSections"
                    (click)="addSection()"
                  >
                    <rp-icon name="plus" [size]="15" /><span>Add section</span>
                  </button>
                </div>
              }
            </div>
          </div>
          @if (d.cls && d.cls.sections.length) {
            <div class="fs">
              <h4><rp-icon name="users" [size]="16" />Sections this year</h4>
              <div class="fs-b">
                @for (s of d.cls.sections; track s.id) {
                  <div class="row between t-sm" style="padding: 6px 0">
                    <b>{{ d.cls.name }} {{ s.name }}</b
                    ><span class="t-muted"
                      >{{ plural(s.students, 'student')
                      }}{{ s.capacity ? ' · ' + s.capacity + ' seats' : '' }} ·
                      {{ classTeacherOf(s.id) }}</span
                    >
                  </div>
                }
              </div>
            </div>
          }
        </div>
        <ng-container modal-foot>
          @if (access.editWhy()) {
            <button type="button" class="btn btn-sec" (click)="draft.set(null)">
              <span>Close</span>
            </button>
          } @else {
            <button type="button" class="btn btn-ghost" (click)="draft.set(null)">
              <span>Cancel</span>
            </button>
            <button type="button" class="btn btn-pri" [class.is-busy]="busy()" (click)="save()">
              <rp-icon name="check" [size]="17" /><span>{{
                d.cls ? 'Save class' : 'Add class'
              }}</span>
            </button>
          }
        </ng-container>
      </rp-modal>
    }
    @if (subjectOpen(); as s) {
      <rp-subject-drawer
        [subject]="s === 'new' ? null : s"
        [subjects]="subjects()"
        [readOnly]="access.editWhy()"
        (closed)="subjectOpen.set(null)"
        (saved)="subjectOpen.set(null); loadSubjects()"
      />
    }
    @if (periodOpen(); as p) {
      <rp-period-drawer
        [period]="p === 'new' ? null : p"
        [schedule]="periods()!"
        [readOnly]="access.editWhy()"
        (closed)="periodOpen.set(null)"
        (saved)="periodOpen.set(null); periods.set($event)"
        (stale)="loadPeriods()"
      />
    }
    @if (uploading()) {
      <rp-bulk-upload
        title="Upload classes"
        sub="Add classes and sections in bulk. Existing classes gain any new sections."
        columns="Columns: class name, sections (comma-separated), order."
        noun="class"
        nouns="classes"
        [head]="['Class', 'Sections']"
        [templateFile]="template"
        [upload]="uploadFn"
        (closed)="uploading.set(false)"
        (imported)="uploaded($event)"
      />
    }
  `,
})
export class ConsoleStructure {
  private readonly api = inject(StructureApi);
  private readonly teachers = inject(TeachersApi);
  private readonly overlays = inject(Overlays);
  private readonly years = inject(AcademicYears);
  private readonly session = inject(SessionContext).console;
  protected readonly access = academicsAccess(this.session, this.years);

  protected readonly orderMax = ORDER_MAX;
  protected readonly maxSections = MAX_SECTIONS;
  protected readonly capacity = CAPACITY;
  protected readonly t12 = t12;
  protected readonly num = num;
  protected readonly cols: readonly {
    k: SortKey | 'sections' | 'ct' | 'e';
    l: string;
    sort: boolean;
    r?: boolean;
    w?: string;
  }[] = [
    { k: 'order', l: '#', sort: true, w: '48px' },
    { k: 'name', l: 'Class', sort: true },
    { k: 'sections', l: 'Sections', sort: false },
    { k: 'students', l: 'Students', sort: true, r: true },
    { k: 'subjects', l: 'Subjects', sort: true, r: true },
    { k: 'ct', l: 'Class teachers', sort: false },
    { k: 'e', l: '', sort: false },
  ];
  protected readonly subCols: readonly { k: SubSortKey; l: string; r?: boolean }[] = [
    { k: 'code', l: 'Code' },
    { k: 'name', l: 'Subject' },
    { k: 'classes', l: 'Classes', r: true },
    { k: 'teachers', l: 'Teachers', r: true },
    { k: 'periodsAWeek', l: 'Periods a week', r: true },
  ];
  protected readonly subSort = signal<{ k: SubSortKey; dir: 'asc' | 'desc' } | null>(null);
  protected readonly sortedSubjects = computed(() => {
    const s = this.subSort();
    if (!s) return this.subjects();
    return [...this.subjects()].sort((a, b) => {
      const x = a[s.k];
      const y = b[s.k];
      const c =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y), 'en', { numeric: true });
      return s.dir === 'desc' ? -c : c;
    });
  });
  protected readonly template = {
    name: 'classes_template.csv',
    rows: [
      ['class_name', 'sections', 'order'],
      ['Grade 11', 'Science, Commerce', '14'],
    ],
  };

  protected readonly tab = signal<Tab>('classes');
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly classes = signal<readonly ClassView[]>([]);
  protected readonly year = signal<{ id: string; label: string } | null>(null);
  protected readonly subjects = signal<readonly SubjectView[]>([]);
  protected readonly subjectsLoaded = signal(false);
  protected readonly subjectsError = signal('');
  protected readonly mapping = signal<ReadonlyMap<string, ClassSubjects>>(new Map());
  protected readonly mappingLoaded = signal(false);
  protected readonly mappingError = signal('');
  protected readonly periods = signal<PeriodList | null>(null);
  protected readonly periodsError = signal('');
  protected readonly assignments = signal<AssignmentList | null>(null);
  protected readonly sort = signal<{ k: SortKey; dir: 'asc' | 'desc' } | null>(null);
  protected readonly draft = signal<Draft | null>(null);
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly busy = signal(false);
  protected readonly subjectOpen = signal<SubjectView | 'new' | null>(null);
  protected readonly periodOpen = signal<PeriodView | 'new' | null>(null);
  protected readonly uploading = signal(false);
  private seq = 0;

  protected readonly tabs = computed(() => [
    {
      v: 'classes' as const,
      l: 'Classes & sections',
      n: this.loading() ? null : this.classes().length,
    },
    {
      v: 'subjects' as const,
      l: 'Subjects',
      n: this.subjectsLoaded() && !this.subjectsError() ? this.subjects().length : null,
    },
    { v: 'map' as const, l: 'Subject mapping', n: null },
    {
      v: 'periods' as const,
      l: 'Periods',
      n: this.periods()?.summary.teachingPeriods ?? null,
    },
  ]);
  protected readonly teachersLabel = computed(() => {
    const y = this.assignments()?.year ?? this.year();
    return y ? `Class teachers · ${y.label}` : 'Class teachers';
  });
  /** The bell bar: teaching periods as P1, P2 …, breaks by name (prototype cc-bell). */
  protected readonly bell = computed(() => {
    let n = 0;
    return (this.periods()?.items ?? []).map((p) => ({
      ...p,
      short: p.isBreak ? p.name : `P${++n}`,
    }));
  });
  protected readonly rows = computed(() => {
    const list = [...this.classes()].sort((a, b) => a.order - b.order);
    const s = this.sort();
    if (!s) return list;
    const get = (c: ClassView) =>
      s.k === 'order'
        ? c.order
        : s.k === 'students'
          ? c.students
          : s.k === 'subjects'
            ? (this.subjectCount(c.id) ?? -1)
            : c.name;
    list.sort((a, b) => {
      const x = get(a);
      const y = get(b);
      const r =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y), 'en', { numeric: true });
      return s.dir === 'desc' ? -r : r;
    });
    return list;
  });

  protected readonly uploadFn = async (file: File, commit: boolean, key: string) => {
    const r = await this.api.uploadClasses(file, commit, key);
    const out: UploadCheck = {
      accepted: r.accepted,
      rejected: r.rejected,
      imported: r.created + r.extended,
      rows: r.rows.map((x) => ({
        row: x.row,
        cells: [x.className, x.sections.join(', ')],
        accepted: x.accepted,
        reason: x.code
          ? x.code === 'ACA.CLASS_NAME_TAKEN'
            ? 'Already exists with these sections'
            : translate(x.code)
          : '',
      })),
    };
    return out;
  };

  constructor() {
    const t = inject(ActivatedRoute).snapshot.queryParamMap.get('tab') as Tab | null;
    if (t && TABS.includes(t)) this.tab.set(t);
    if (!this.access.denied()) this.reloadAll();
  }

  protected reloadAll() {
    void this.load().then(() => this.loadMapping());
    void this.loadSubjects();
    void this.loadPeriods();
    void this.loadAssignments();
  }

  protected async load() {
    this.loading.set(true);
    try {
      const r = await this.api.classes();
      this.classes.set(r.items);
      this.year.set(r.year);
      this.error.set('');
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected async loadSubjects() {
    try {
      this.subjects.set((await this.api.subjects()).items);
      this.subjectsError.set('');
    } catch (e) {
      this.subjectsError.set(problemText(e));
    } finally {
      this.subjectsLoaded.set(true);
    }
  }

  /** Each class's subjects (ACA-018; one request per class). */
  protected async loadMapping() {
    const n = ++this.seq;
    try {
      const list = await Promise.all(this.classes().map((c) => this.api.classSubjects(c.id)));
      if (n !== this.seq) return;
      this.mapping.set(new Map(list.map((m) => [m.class.id, m])));
      this.mappingError.set('');
    } catch (e) {
      if (n === this.seq) this.mappingError.set(problemText(e));
    } finally {
      if (n === this.seq) this.mappingLoaded.set(true);
    }
  }

  protected async loadPeriods() {
    try {
      this.periods.set(await this.api.periods());
      this.periodsError.set('');
    } catch (e) {
      this.periodsError.set(problemText(e));
    }
  }

  private async loadAssignments() {
    try {
      this.assignments.set(await this.teachers.assignments());
    } catch {
      // The class-teacher column then shows "—" (no current year, for example).
    }
  }

  protected subjectCount(classId: string): number | null {
    const m = this.mapping().get(classId);
    return m ? m.subjects.length : null;
  }

  protected ctCount(c: ClassView): { n: number; of: number } | null {
    const a = this.assignments();
    if (!a || !c.sections.length) return null;
    const rows = a.classTeachers.filter((x) => x.class.id === c.id);
    return { n: rows.filter((x) => x.assignment).length, of: c.sections.length };
  }

  protected classTeacherOf(sectionId: string) {
    const row = this.assignments()?.classTeachers.find((x) => x.section.id === sectionId);
    return row?.assignment
      ? `Class teacher ${person(row.assignment.teacher.name)}`
      : 'No class teacher';
  }

  protected uploaded(r: UploadCheck) {
    this.uploading.set(false);
    if (r.imported) void this.load().then(() => this.loadMapping());
  }

  protected value(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected plural(n: number, noun: string) {
    return `${num(n)} ${noun}${n === 1 ? '' : 's'}`;
  }
  protected err(k: string) {
    return this.errors()[k] ?? '';
  }
  protected inUse(s: SectionDraft) {
    return `Section ${s.name || ''} has ${this.plural(s.students, 'student')} — move them before removing it`;
  }

  protected sortSubjects(k: SubSortKey) {
    const s = this.subSort();
    this.subSort.set({ k, dir: s?.k === k && s.dir === 'asc' ? 'desc' : 'asc' });
  }

  protected sortBy(k: string) {
    const key = k as SortKey;
    const s = this.sort();
    this.sort.set({ k: key, dir: s?.k === key && s.dir === 'asc' ? 'desc' : 'asc' });
  }

  protected edit(c: ClassView | null) {
    this.errors.set({});
    const next = Math.max(0, ...this.classes().map((x) => x.order + 1)) + 1;
    this.draft.set({
      cls: c,
      name: c?.name ?? '',
      order: String(c ? c.order + 1 : next),
      sections: c
        ? c.sections.map((s) => ({
            key: s.id,
            id: s.id,
            name: s.name,
            capacity: s.capacity === null ? '' : String(s.capacity),
            students: s.students,
          }))
        : [this.blankSection('A')],
    });
  }

  private secSeq = 0;
  private blankSection(name = ''): SectionDraft {
    return { key: `new:${++this.secSeq}`, id: null, name, capacity: '', students: 0 };
  }

  protected patch(p: Partial<Draft>, k: string) {
    const d = this.draft();
    if (!d) return;
    this.draft.set({ ...d, ...p });
    this.clear(k, 'form');
  }

  protected setSection(key: string, p: Partial<SectionDraft>, prefix: 'sec:' | 'cap:') {
    const d = this.draft();
    if (!d) return;
    this.draft.set({
      ...d,
      sections: d.sections.map((s) => (s.key === key ? { ...s, ...p } : s)),
    });
    this.clear(prefix + key, prefix === 'sec:' ? 'sections' : '', 'form');
  }

  protected addSection() {
    const d = this.draft();
    if (!d || d.sections.length >= MAX_SECTIONS) return;
    this.draft.set({ ...d, sections: [...d.sections, this.blankSection()] });
    this.clear('sections');
    setTimeout(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>('#cp-cl-secs input[maxlength]');
      inputs[inputs.length - 1]?.focus();
    });
  }

  protected removeSection(key: string) {
    const d = this.draft();
    if (!d) return;
    this.draft.set({ ...d, sections: d.sections.filter((s) => s.key !== key) });
    this.clear('sec:' + key, 'cap:' + key, 'sections');
  }

  private clear(...keys: string[]) {
    const e = this.errors();
    if (!keys.some((k) => k && e[k])) return;
    const next = { ...e };
    for (const k of keys) delete next[k];
    this.errors.set(next);
  }

  /** Checks the form as the server does (ACA-010/011) so most mistakes show before saving. */
  private validate(d: Draft): Record<string, string> {
    const e: Record<string, string> = {};
    const name = d.name.trim();
    if (!name) e['name'] = translate('VALIDATION.REQUIRED');
    else if (name.length < 2) e['name'] = translate('VALIDATION.FORMAT');
    else if (
      this.classes().some((c) => c.id !== d.cls?.id && c.name.toLowerCase() === name.toLowerCase())
    ) {
      e['name'] = translate('ACA.CLASS_NAME_TAKEN');
    }
    const order = d.order.trim();
    if (!order) e['order'] = translate('VALIDATION.REQUIRED');
    else if (!/^\d+$/.test(order) || +order < 1 || +order > ORDER_MAX) {
      e['order'] = translate('VALIDATION.RANGE', { min: 1, max: ORDER_MAX });
    }
    if (!d.sections.length) e['sections'] = 'Enter at least one section';
    for (const s of d.sections) {
      if (!s.name.trim()) e['sec:' + s.key] = translate('VALIDATION.REQUIRED');
      const cap = s.capacity.trim();
      if (cap && (!/^\d+$/.test(cap) || +cap < CAPACITY.min || +cap > CAPACITY.max)) {
        e['cap:' + s.key] = translate('VALIDATION.RANGE', CAPACITY);
      }
    }
    const names = d.sections.map((s) => s.name.trim().toLowerCase()).filter(Boolean);
    if (new Set(names).size !== names.length) e['sections'] = translate('ACA.SECTION_NAMES');
    return e;
  }

  protected async save() {
    const d = this.draft();
    if (!d || this.busy() || this.access.editWhy()) return;
    const e = this.validate(d);
    this.errors.set(e);
    if (Object.keys(e).length) return;
    const sections: SectionInput[] = d.sections.map((s) => ({
      ...(s.id ? { id: s.id } : {}),
      name: s.name.trim(),
      capacity: s.capacity.trim() ? Number(s.capacity.trim()) : null,
    }));
    const body = { name: d.name.trim(), order: Number(d.order.trim()) - 1, sections };
    this.busy.set(true);
    try {
      const c = d.cls
        ? await this.api.changeClass(d.cls.id, d.cls.version, body)
        : await this.api.createClass(body);
      this.draft.set(null);
      await this.load();
      void this.loadMapping();
      void this.loadAssignments();
      this.overlays.toast(d.cls ? 'Class saved' : 'Class added', {
        sub: `${c.name} · sections ${c.sections.map((s) => s.name).join(', ')}`,
      });
    } catch (x) {
      if (x instanceof ApiProblem) {
        this.errors.set(this.problemErrors(x));
        if (x.status === 412 || x.status === 428) await this.load();
      } else {
        this.overlays.toast('Not saved', { sub: translate('GEN.UNAVAILABLE'), tone: 'bad' });
      }
    } finally {
      this.busy.set(false);
    }
  }

  /** Places the server's answer under the field it concerns (or above the form). */
  private problemErrors(x: ApiProblem): Record<string, string> {
    if (x.code === 'ACA.SECTION_IN_USE' || x.code === 'ACA.SECTION_NAMES') {
      return { sections: x.detail };
    }
    if (!x.errors.length) {
      return x.code === 'ACA.CLASS_NAME_TAKEN' ? { name: x.detail } : { form: x.detail };
    }
    const out: Record<string, string> = {};
    for (const fe of x.errors) {
      const k = fe.field.startsWith('sections')
        ? 'sections'
        : fe.field === 'name' || fe.field === 'order'
          ? fe.field
          : 'form';
      out[k] ??= fe.message;
    }
    return out;
  }
}
