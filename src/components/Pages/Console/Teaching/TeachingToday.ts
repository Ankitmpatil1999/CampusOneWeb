/**
 * Today (Phase 10, teachers on the web; the app's m.t.today): the day's periods in order with the
 * current one marked, the teacher's classes (class teacher or subject teacher) with the register's
 * progress, homework waiting for review, and each class's roster in a drawer (ACA-044…046).
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
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Modal } from '../../../Shared/Overlays';
import { TaskLauncher } from '../../../Shared/TaskLauncher';
import { formatDate, titleCase } from '../../../Utils/format';
import { greeting } from '../../../Utils/greeting';
import { ownHome } from '../../../Utils/navigation';
import { t as tr } from '../../../Utils/t';
import { problemText, tRange } from '../Structure/academic-format';
import { ClassesApi, type Roster, type Today } from './classes.api';

@Component({
  selector: 'rp-teaching',
  imports: [Empty, Icon, Modal, PageHead, RouterLink, TaskLauncher],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="c-page">
    @if (loading()) {
      <div class="sk" style="height: 64px; border-radius: 12px"></div>
      <div class="sk" style="height: 320px; border-radius: 16px; margin-top: 16px"></div>
    } @else if (error()) {
      <rp-page-head [title]="home() ? greet(session()?.name ?? '') : t('ui.web.nav.today')" />
      @if (home()) {
        <rp-task-launcher surface="console" />
      }
      <div class="note tone-bad" role="alert" id="tt-error">
        <rp-icon name="alert" [size]="17" />
        <div class="grow">{{ error() }}</div>
        <button type="button" class="btn btn-sec btn-sm" (click)="load()">
          {{ t('ui.web.tch.retry') }}
        </button>
      </div>
    } @else if (day(); as d) {
      <rp-page-head
        [title]="
          home()
            ? greet(d.teacher.name)
            : t('ui.web.tch.today.hello', { name: first(d.teacher.name) })
        "
        [sub]="t('ui.web.tch.today.sub', { date: date(d.date), year: d.year.label })"
      >
        <a class="btn btn-sec" routerLink="/console/teaching-attendance">
          <rp-icon name="calcheck" [size]="17" /><span>{{ t('ui.web.nav.attendance') }}</span>
        </a>
        <a class="btn btn-pri" routerLink="/console/teaching-marks">
          <rp-icon name="clipcheck" [size]="17" /><span>{{ t('ui.web.nav.marks') }}</span>
        </a>
      </rp-page-head>
      <!-- The teacher's dashboard (client 2026-10-27): the task cards under the greeting. -->
      @if (home()) {
        <rp-task-launcher surface="console" />
      }

      @if (!d.assigned) {
        <rp-empty
          icon="school"
          [title]="t('ui.web.tch.today.notAssigned')"
          [text]="t('ui.web.tch.today.notAssignedText')"
        />
      } @else {
        @if (d.homeworkToReview) {
          <a class="note tone-info" routerLink="/console/teaching-homework" id="tt-review">
            <rp-icon name="bookopen" [size]="17" />
            <div class="grow">{{ t('ui.web.tch.today.toReview', { n: d.homeworkToReview }) }}</div>
            <rp-icon name="right" [size]="16" />
          </a>
        }
        <div class="c-grid k2" style="align-items: start">
          <div class="card">
            <div class="card-h">
              <span class="t-h4">{{ t('ui.web.tch.today.periods') }}</span>
            </div>
            <div class="card-b stack g8" id="tt-periods">
              @for (p of d.periods; track p.period.startsAt + p.section.id) {
                <div
                  class="row g12"
                  style="padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line)"
                  [style.background]="p.state === 'NOW' ? 'var(--brand-soft)' : null"
                >
                  <span class="t-sm" style="width: 150px">{{
                    range(p.period.startsAt, p.period.endsAt)
                  }}</span>
                  <span
                    style="width: 10px; height: 10px; border-radius: 50%; flex: none"
                    [style.background]="p.subject.colour || 'var(--brand)'"
                  ></span>
                  <div class="grow" style="min-width: 0">
                    <b>{{ p.subject.name }}</b
                    ><span class="t-muted"> · {{ p.section.label }}</span>
                  </div>
                  @if (p.state === 'NOW') {
                    <span class="chip dot tone-brand">{{ t('ui.web.tch.today.now') }}</span>
                  } @else if (p.state === 'DONE') {
                    <span class="chip">{{ t('ui.web.tch.today.done') }}</span>
                  }
                </div>
              } @empty {
                <p class="t-muted" style="margin: 0">{{ t('ui.web.tch.today.noPeriods') }}</p>
              }
            </div>
          </div>
          <div class="card">
            <div class="card-h">
              <span class="t-h4">{{ t('ui.web.tch.today.classes') }}</span>
            </div>
            <div class="card-b stack g8" id="tt-classes">
              @for (c of d.classTeacherOf; track c.id) {
                <div
                  class="row g12 wrap"
                  style="padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line)"
                >
                  <div class="grow">
                    <div class="row g8 wrap">
                      <b>{{ c.label }}</b>
                      <span class="chip tone-accent">{{ t('ui.web.tch.today.classTeacher') }}</span>
                    </div>
                    @if (subjectsIn(d, c.id); as subs) {
                      <div class="t-muted t-sm">{{ subs }}</div>
                    }
                    <div class="t-muted t-sm">
                      {{ t('ui.web.tch.today.students', { n: c.students }) }} ·
                      {{
                        t('ui.web.tch.today.register', { n: c.registerMarked, total: c.students })
                      }}
                    </div>
                  </div>
                  <button type="button" class="btn btn-sec btn-sm" (click)="openRoster(c.id)">
                    {{ t('ui.web.tch.today.roster') }}
                  </button>
                  <a class="btn btn-pri btn-sm" routerLink="/console/teaching-attendance">
                    {{ t('ui.web.tch.today.takeRegister') }}
                  </a>
                </div>
              }
              @for (s of otherSections(d); track s.id) {
                <div
                  class="row g12 wrap"
                  style="padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line)"
                >
                  <div class="grow">
                    <b>{{ s.label }}</b>
                    <div class="t-muted t-sm">{{ subjects(s.subjects) }}</div>
                  </div>
                  <button type="button" class="btn btn-sec btn-sm" (click)="openRoster(s.id)">
                    {{ t('ui.web.tch.today.roster') }}
                  </button>
                </div>
              }
            </div>
          </div>
        </div>
      }
    }

    @if (roster(); as r) {
      <rp-modal
        [title]="t('ui.web.tch.roster.title', { section: r.section.label })"
        [drawer]="true"
        (closed)="roster.set(null)"
      >
        @if (r.items.length) {
          <div class="tbl-wrap">
            <table class="tbl" id="tt-roster">
              <thead>
                <tr>
                  <th>{{ t('ui.web.tch.roster.admission') }}</th>
                  <th>{{ t('ui.web.tch.roster.name') }}</th>
                  <th>{{ t('ui.web.tch.roster.today') }}</th>
                </tr>
              </thead>
              <tbody>
                @for (s of r.items; track s.id) {
                  <tr>
                    <td class="t-mono t-sm">{{ s.admissionNo ?? '—' }}</td>
                    <td>
                      <b>{{ s.name }}</b>
                    </td>
                    <td>{{ s.attendanceToday ? status(s.attendanceToday) : '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <p class="t-muted">{{ t('ui.web.tch.roster.empty') }}</p>
        }
        <ng-container modal-foot>
          <button type="button" class="btn btn-sec" (click)="roster.set(null)">
            <span>{{ t('ui.web.tch.close') }}</span>
          </button>
        </ng-container>
      </rp-modal>
    }
  </div>`,
})
export class TeachingToday implements OnInit {
  private readonly api = inject(ClassesApi);
  protected readonly session = inject(SessionContext).console;
  protected readonly t = tr;
  protected readonly greet = greeting;
  /** The teacher's own dashboard (no institution home): the greeting, then the task cards. */
  protected readonly home = computed(() => ownHome(this.session()?.subTasks ?? []) === 'teaching');
  protected readonly day = signal<Today | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly roster = signal<Roster | null>(null);

  ngOnInit() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.day.set(await this.api.today());
      this.error.set('');
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected async openRoster(sectionId: string) {
    try {
      this.roster.set(await this.api.roster(sectionId));
    } catch (e) {
      this.error.set(problemText(e));
    }
  }

  protected first(name: string) {
    return titleCase(name.trim().split(/\s+/)[0] ?? '');
  }
  protected date(v: string) {
    return formatDate(v);
  }
  protected range(a: string, b: string) {
    return tRange(a, b);
  }
  /** The subjects the teacher teaches in their own class (shown on its card, not twice). */
  protected subjectsIn(d: Today, sectionId: string) {
    const s = d.subjectSections.find((x) => x.id === sectionId);
    return s ? this.subjects(s.subjects) : '';
  }
  /** The sections taught as a subject teacher only. */
  protected otherSections(d: Today) {
    const own = new Set(d.classTeacherOf.map((c) => c.id));
    return d.subjectSections.filter((s) => !own.has(s.id));
  }
  protected subjects(list: readonly { name: string }[]) {
    return list.map((s) => s.name).join(', ');
  }
  protected status(code: string) {
    return tr(`status.attendance.${code === 'HALF_DAY' ? 'halfDay' : code.toLowerCase()}`);
  }
}
