/**
 * Homework (Phase 10, teachers on the web; the app's m.t.hw): what the teacher set this year by
 * filter (all, to review, homework, classwork) with the submission counts, the form to set new work
 * and each one's submissions to review (ACA-048…051, ACA-075).
 */
import { ChangeDetectionStrategy, Component, type OnInit, inject, signal } from '@angular/core';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { formatDate } from '../../../Utils/format';
import { refreshWhileVisible } from '../../../Utils/live';
import { t as tr } from '../../../Utils/t';
import { problemText } from '../Structure/academic-format';
import { HomeworkForm } from './HomeworkForm';
import { HomeworkSubmissions } from './HomeworkSubmissions';
import { type Homework, type HomeworkFilter, type HomeworkList, WorkApi } from './work.api';

/** How often the list is read again while the page is open. */
const REFRESH_MS = 20_000;

const FILTERS: readonly { readonly v: HomeworkFilter; readonly key: string }[] = [
  { v: 'all', key: 'ui.web.tch.hw.all' },
  { v: 'review', key: 'ui.web.tch.hw.review' },
  { v: 'HOMEWORK', key: 'ui.web.tch.hw.homework' },
  { v: 'CLASSWORK', key: 'ui.web.tch.hw.classwork' },
];

@Component({
  selector: 'rp-teaching-homework',
  imports: [Empty, HomeworkForm, HomeworkSubmissions, Icon, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="c-page">
    <rp-page-head [title]="t('ui.web.nav.homework')" [sub]="t('ui.web.tch.hw.sub')">
      <button
        type="button"
        class="btn btn-pri"
        id="hw-new"
        [disabled]="!list()?.choices?.length"
        [title]="list() && !list()!.choices.length ? t('ui.web.tch.hw.noClasses') : ''"
        (click)="creating.set(true)"
      >
        <rp-icon name="plus" [size]="17" /><span>{{ t('ui.web.tch.hw.new') }}</span>
      </button>
    </rp-page-head>

    @if (error()) {
      <div class="note tone-bad" role="alert" id="hw-error">
        <rp-icon name="alert" [size]="17" />
        <div class="grow">{{ error() }}</div>
        <button type="button" class="btn btn-sec btn-sm" (click)="load()">
          {{ t('ui.web.tch.retry') }}
        </button>
      </div>
    } @else {
      <div class="tabs" role="tablist" [attr.aria-label]="t('ui.web.nav.homework')">
        @for (f of filters; track f.v) {
          <button
            type="button"
            class="tab"
            role="tab"
            [id]="'hw-tab-' + f.v"
            [class.on]="filter() === f.v"
            [attr.aria-selected]="filter() === f.v"
            (click)="pick(f.v)"
          >
            {{ t(f.key) }}
            @if (list(); as l) {
              <span class="n">{{ count(l, f.v) }}</span>
            }
          </button>
        }
      </div>

      @if (loading()) {
        <div class="card pad">
          <div class="sk" style="height: 240px; border-radius: 16px"></div>
        </div>
      } @else if (!list()?.items?.length) {
        <rp-empty
          icon="bookopen"
          [title]="t('ui.web.tch.hw.empty')"
          [text]="t('ui.web.tch.hw.emptyText')"
        />
      } @else {
        <div class="stack g12" id="hw-list">
          @for (h of list()!.items; track h.id; let i = $index) {
            <div class="card pad row g12 wrap" [id]="'hw-' + i">
              <span
                style="width: 4px; align-self: stretch; border-radius: 2px; flex: none"
                [style.background]="h.subject.colour || 'var(--brand)'"
              ></span>
              <div class="grow stack g4" style="min-width: 0">
                <div class="row g8 wrap">
                  <b>{{ h.title }}</b>
                  <span class="chip" [class.tone-accent]="h.kind === 'CLASSWORK'">{{
                    t(h.kind === 'HOMEWORK' ? 'ui.web.tch.hw.homework' : 'ui.web.tch.hw.classwork')
                  }}</span>
                  @if (h.closed) {
                    <span class="chip">{{ t('ui.web.tch.hw.closed') }}</span>
                  }
                  @if (h.counts.toReview) {
                    <span class="chip dot tone-warn"
                      >{{ t('ui.web.tch.hw.review') }} · {{ h.counts.toReview }}</span
                    >
                  }
                </div>
                <div class="t-sm t-muted">
                  {{ h.section.label }} · {{ h.subject.name }} ·
                  {{ t('ui.web.tch.hw.due', { date: date(h.dueDate) }) }}
                  <!-- Set for chosen students only (client 2026-10-15). -->
                  @if (!h.wholeClass) {
                    · {{ t('ui.web.tch.hw.forSome', { n: h.counts.students }) }}
                  }
                </div>
                <div class="t-sm">
                  {{
                    t('ui.web.tch.hw.counts', {
                      reviewed: h.counts.reviewed,
                      toReview: h.counts.toReview,
                      notSubmitted: h.counts.notSubmitted,
                    })
                  }}
                </div>
              </div>
              <button
                type="button"
                class="btn btn-sec btn-sm"
                [id]="'hw-open-' + i"
                (click)="opened.set(h)"
              >
                {{ t('ui.web.tch.hw.open') }}
              </button>
            </div>
          }
        </div>
      }
    }

    @if (creating() && list(); as l) {
      <rp-homework-form [choices]="l.choices" (closed)="creating.set(false)" (saved)="created()" />
    }
    @if (opened(); as h) {
      <rp-homework-submissions
        [homework]="h"
        (closed)="opened.set(null)"
        (changedCounts)="refresh()"
      />
    }
  </div>`,
})
export class TeachingHomework implements OnInit {
  private readonly api = inject(WorkApi);
  protected readonly t = tr;
  protected readonly filters = FILTERS;
  protected readonly filter = signal<HomeworkFilter>('all');
  protected readonly list = signal<HomeworkList | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly creating = signal(false);
  protected readonly opened = signal<Homework | null>(null);

  constructor() {
    // Work handed in shows in the counts without a reload (client 2026-10-15).
    refreshWhileVisible(() => (this.loading() ? undefined : this.refresh()), REFRESH_MS);
  }

  ngOnInit() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    await this.refresh();
    this.loading.set(false);
  }

  /** The list again without the skeleton (after a review or a new piece of work). */
  async refresh() {
    try {
      this.list.set(await this.api.homework(this.filter()));
      this.error.set('');
    } catch (e) {
      this.error.set(problemText(e));
    }
  }

  protected pick(f: HomeworkFilter) {
    if (f === this.filter()) return;
    this.filter.set(f);
    void this.load();
  }

  protected created() {
    this.creating.set(false);
    void this.refresh();
  }

  protected count(l: HomeworkList, f: HomeworkFilter) {
    return f === 'all'
      ? l.counts.all
      : f === 'review'
        ? l.counts.review
        : f === 'HOMEWORK'
          ? l.counts.homework
          : l.counts.classwork;
  }
  protected date(v: string) {
    return formatDate(v);
  }
}
