/**
 * My timetable (Phase 10, teachers on the web; the app's m.t.tt): the teacher's week as a grid of
 * the school's periods by Monday–Saturday, today's column marked (ACA-047). A class teacher also
 * sees their class's week — every subject and its teacher, their own periods marked — as the app's
 * "My timetable | Class 7 B" switch does.
 */
import {
  ChangeDetectionStrategy,
  Component,
  type OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { t as tr } from '../../../Utils/t';
import { problemText, tRange } from '../Structure/academic-format';
import { ClassesApi, type Slot, type Timetable } from './classes.api';

@Component({
  selector: 'rp-teaching-timetable',
  imports: [Empty, Icon, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="c-page">
    <rp-page-head [title]="t('ui.web.nav.timetable')" [sub]="sub()" />
    @if (loading()) {
      <div class="sk" style="height: 360px; border-radius: 16px"></div>
    } @else if (error()) {
      <div class="note tone-bad" role="alert" id="ttb-error">
        <rp-icon name="alert" [size]="17" />
        <div class="grow">{{ error() }}</div>
        <button type="button" class="btn btn-sec btn-sm" (click)="load()">
          {{ t('ui.web.tch.retry') }}
        </button>
      </div>
    } @else if (tt(); as w) {
      @if (cls(); as c) {
        <div class="tabs" role="tablist" [attr.aria-label]="t('ui.web.nav.timetable')">
          <button
            type="button"
            class="tab"
            role="tab"
            id="ttb-tab-mine"
            [class.on]="!classView()"
            [attr.aria-selected]="!classView()"
            (click)="view.set('mine')"
          >
            {{ t('ui.web.tch.tt.mine') }}
          </button>
          <button
            type="button"
            class="tab"
            role="tab"
            id="ttb-tab-class"
            [class.on]="classView()"
            [attr.aria-selected]="classView()"
            (click)="view.set('class')"
          >
            {{ t('ui.web.tch.tt.class', { section: c.label }) }}
          </button>
        </div>
      }
      @if (!shown().length) {
        @if (classView()) {
          <rp-empty
            icon="calendar"
            [title]="t('ui.web.tch.tt.classEmpty', { section: cls()!.label })"
            [text]="t('ui.web.tch.tt.classEmptyText')"
          />
        } @else {
          <rp-empty
            icon="calendar"
            [title]="t('ui.web.tch.tt.empty')"
            [text]="t('ui.web.tch.tt.emptyText')"
          />
        }
      } @else {
        <div class="card">
          <div class="tbl-wrap">
            <table class="tbl" id="ttb-grid">
              <thead>
                <tr>
                  <th>{{ t('ui.web.tch.tt.period') }}</th>
                  @for (d of w.days; track d.day) {
                    <th [style.background]="d.day === w.today ? 'var(--brand-soft)' : null">
                      {{ t('ui.web.tch.day.' + d.day) }}
                      @if (d.day === w.today) {
                        <span class="chip dot tone-brand">{{ t('ui.web.tch.tt.today') }}</span>
                      }
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (p of w.periods; track p.id) {
                  <tr>
                    <td>
                      <b>{{ p.name }}</b>
                      <div class="t-muted t-sm">{{ range(p.startsAt, p.endsAt) }}</div>
                    </td>
                    @if (p.isBreak) {
                      <td [attr.colspan]="w.days.length" class="t-muted" style="text-align: center">
                        {{ t('ui.web.tch.tt.break') }}
                      </td>
                    } @else {
                      @for (d of w.days; track d.day) {
                        <td [style.background]="d.day === w.today ? 'var(--brand-soft)' : null">
                          @if (cell(d.day, p.id); as s) {
                            <div class="row g8" [attr.data-slot]="d.day + ':' + p.id">
                              <span
                                style="width: 4px; align-self: stretch; border-radius: 2px; flex: none"
                                [style.background]="s.subject.colour || 'var(--brand)'"
                              ></span>
                              <div>
                                <b>{{ s.subject.name }}</b>
                                <div class="t-muted t-sm">
                                  {{ classView() ? who(s) : s.section.label }}
                                </div>
                              </div>
                            </div>
                          } @else {
                            <span class="t-muted">—</span>
                          }
                        </td>
                      }
                    }
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
export class TeachingTimetable implements OnInit {
  private readonly api = inject(ClassesApi);
  protected readonly t = tr;
  protected readonly tt = signal<Timetable | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly view = signal<'mine' | 'class'>('mine');
  /** The class the teacher is class teacher of, its week beside theirs. */
  protected readonly cls = computed(() => this.tt()?.section ?? null);
  protected readonly classView = computed(() => this.view() === 'class' && !!this.cls());
  /** The week on show: mine, or my class's. */
  protected readonly shown = computed(() =>
    this.classView() ? (this.cls()?.slots ?? []) : (this.tt()?.mine ?? []),
  );
  protected readonly sub = computed(() => {
    const w = this.tt();
    if (!w) return '';
    return this.classView()
      ? tr('ui.web.tch.tt.classSub', { section: this.cls()!.label, year: w.year.label })
      : tr('ui.web.tch.tt.sub', { year: w.year.label });
  });
  /** The shown slots by "day:periodId". */
  private readonly slots = computed(() => {
    const map = new Map<string, Slot>();
    for (const s of this.shown()) map.set(`${s.day}:${s.period.id ?? ''}`, s);
    return map;
  });
  /** Me, to mark my own periods in my class's week. */
  private readonly me = computed(() => this.tt()?.mine[0]?.teacher.id ?? null);

  ngOnInit() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      // A class teacher's class comes with their own week (ACA-047 with classSectionId).
      const { items } = await this.api.classes();
      this.tt.set(await this.api.timetable(items.find((c) => c.classTeacher)?.id));
      this.error.set('');
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected range(a: string, b: string) {
    return tRange(a, b);
  }

  protected cell(day: number, periodId: string | undefined) {
    return this.slots().get(`${day}:${periodId ?? ''}`) ?? null;
  }

  protected who(s: Slot) {
    return s.teacher.id === this.me()
      ? tr('ui.web.tch.tt.you', { name: s.teacher.name })
      : s.teacher.name;
  }
}
