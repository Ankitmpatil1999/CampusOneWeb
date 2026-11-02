import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  type OnInit,
} from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import type { IconName } from '../../../Utils/icons';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { plural } from '../../Console/Fees/fee-format';
import { num, problemText } from '../../Console/Structure/academic-format';
import {
  QuizApi,
  type Leaderboard,
  type QuizTopic,
  type StagingQuestion,
  type UploadReport,
} from './quiz.api';
import { LETTERS, QuestionModal, TOPIC_ICONS, TopicModal, UploadModal } from './QuizModals';

type Tab = 'topics' | 'staging' | 'uploads' | 'lead';
const REASON = { min: 10, max: 300 } as const;

interface TopicChange {
  readonly topic: QuizTopic;
  readonly fresh: number;
  readonly withdrawn: number;
}

/**
 * o.quiz — Quiz question bank (SRS 28.8–28.11, CR-01, OI-FIN-16/18; FIN-009…017; prototype
 * o.quiz): topics with their published, staging and attempt counts; the staging bank as question
 * cards with add, edit and remove; a sheet upload into a topic's staging with its check report;
 * publishing what staging holds; and the platform leaderboard (operators only, recorded).
 */
@Component({
  selector: 'rp-backoffice-quiz',
  imports: [Empty, Icon, PageHead, QuestionModal, TopicModal, UploadModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Quiz question bank"
        sub="One platform-wide bank of financial-literacy topics and questions. Edits happen in staging and reach members only when published."
      >
        @if (canEdit() && topics()) {
          <button type="button" class="btn btn-sec" id="qz-upload" (click)="uploading.set(true)">
            <rp-icon name="upload" [size]="17" /><span>Upload spreadsheet</span>
          </button>
          <button
            type="button"
            class="btn btn-pri"
            id="qz-publish"
            [class.is-busy]="publishing()"
            [disabled]="!changeCount() || publishing()"
            (click)="publish()"
          >
            <rp-icon name="send" [size]="17" /><span>{{
              changeCount() ? 'Publish ' + plural(changeCount(), 'change') : 'Nothing to publish'
            }}</span>
          </button>
        }
      </rp-page-head>

      @if (!canEdit()) {
        <rp-empty
          icon="lock"
          title="This page isn't part of your role"
          text="The question bank is kept by the platform administrator. Pages your role can open are listed in the menu."
        />
      } @else if (loading() && !topics()) {
        <div class="stack g16" aria-busy="true" aria-label="Loading">
          <div class="sk" style="height: 44px; border-radius: 12px"></div>
          <div class="sk" style="height: 320px; border-radius: 16px"></div>
        </div>
      } @else if (error() && !topics()) {
        <div class="card pad">
          <rp-empty icon="alertc" title="Couldn't load the question bank" [text]="error()">
            <button type="button" class="btn btn-sec btn-sm" (click)="load()">
              <span>Try again</span>
            </button>
          </rp-empty>
        </div>
      } @else if (topics(); as ts) {
        <div class="tabs" role="tablist" aria-label="Question bank">
          @for (t of tabs(); track t.v) {
            <button
              type="button"
              class="tab"
              role="tab"
              [id]="'qz-tab-' + t.v"
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
          @case ('topics') {
            <div class="row between wrap">
              <span class="t-sm t-muted">{{ topicsText() }}</span>
              <button
                type="button"
                class="btn btn-soft btn-sm"
                id="qz-new-topic"
                (click)="editTopic.set('new')"
              >
                <rp-icon name="plus" [size]="15" /><span>New topic</span>
              </button>
            </div>
            <div class="tbl-wrap">
              <table class="tbl" id="qz-topics">
                <thead>
                  <tr>
                    <th>Topic</th>
                    <th>Status</th>
                    <th class="r">Published questions</th>
                    <th class="r">In staging</th>
                    <th class="r">Attempts</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (t of ts; track t.id) {
                    <tr>
                      <td>
                        <div class="cell-main">
                          <span class="li-ic sm"><rp-icon [name]="iconOf(t)" [size]="15" /></span>
                          <div class="stack" style="gap: 1px">
                            <span class="cell-t">{{ t.name }}</span>
                            @if (t.description) {
                              <span class="cell-s">{{ t.description }}</span>
                            }
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          class="chip dot"
                          [class]="'chip dot tone-' + (t.status === 'ACTIVE' ? 'ok' : 'neutral')"
                          >{{ statusLabel(t) }}</span
                        >
                      </td>
                      <td class="r">{{ num(t.published) }}</td>
                      <td class="r">
                        {{ num(t.staging) }}
                        @if (freshIn(t.id)) {
                          <span class="t-xs t-warn">· {{ num(freshIn(t.id)) }} unpublished</span>
                        }
                      </td>
                      <td class="r">{{ num(t.attempts) }}</td>
                      <td>
                        <div class="row-acts">
                          <button
                            type="button"
                            class="btn btn-ghost btn-xs"
                            (click)="editTopic.set(t)"
                          >
                            <span>Rename</span>
                          </button>
                          <button
                            type="button"
                            class="btn btn-ghost btn-xs"
                            [class.is-busy]="busy() === t.id"
                            [disabled]="!!busy()"
                            (click)="toggleTopic(t)"
                          >
                            <span>{{ t.status === 'ACTIVE' ? 'Withdraw' : 'Restore' }}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="6">
                        <rp-empty
                          icon="bulb"
                          title="No topics yet"
                          text="Add the first topic, then its questions."
                        />
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
          @case ('staging') {
            <div class="c-filters">
              <div class="pills" role="group" aria-label="Topic">
                <button
                  type="button"
                  class="pill"
                  [class.on]="!topicFilter()"
                  [attr.aria-pressed]="!topicFilter()"
                  (click)="topicFilter.set('')"
                >
                  Every topic<span class="n">{{ staging().length }}</span>
                </button>
                @for (t of ts; track t.id) {
                  <button
                    type="button"
                    class="pill"
                    [class.on]="topicFilter() === t.id"
                    [attr.aria-pressed]="topicFilter() === t.id"
                    (click)="topicFilter.set(t.id)"
                  >
                    {{ t.name }}<span class="n">{{ countIn(t.id) }}</span>
                  </button>
                }
              </div>
              <span class="fsum"
                ><button
                  type="button"
                  class="btn btn-pri btn-sm"
                  id="qz-add-q"
                  (click)="editQ.set('new')"
                >
                  <rp-icon name="plus" [size]="15" /><span>Add question</span>
                </button></span
              >
            </div>
            @if (withdrawals().length) {
              <div class="note tone-warn">
                <rp-icon name="alert" [size]="17" />
                <div class="grow">
                  @for (w of withdrawals(); track w.topic.id; let last = $last) {
                    <b>{{ plural(w.withdrawn, 'published question') }}</b> of {{ w.topic.name
                    }}{{ last ? '' : ', ' }}
                  }
                  no longer in staging will be <b>withdrawn</b> from members when you publish.
                </div>
              </div>
            }
            @if (stagingLoading() && !staging().length) {
              <div class="sk" style="height: 320px; border-radius: 16px" aria-busy="true"></div>
            } @else {
              <div class="ob-qgrid" id="qz-staging">
                @for (q of shownQuestions(); track q.id) {
                  <div class="card pad ob-q">
                    <div class="row between g8">
                      <span class="t-xs t-muted">{{ q.topic.name }}</span>
                      <span class="chip" [class]="'chip tone-' + (q.published ? 'ok' : 'info')">{{
                        q.published ? 'Published' : 'Not yet published'
                      }}</span>
                    </div>
                    <p class="t-h4 mt8">{{ q.text }}</p>
                    <div class="ob-opts">
                      @for (o of q.options; track $index; let i = $index) {
                        <div class="ob-opt" [class.ok]="i === q.correct">
                          <b>{{ letters[i] }}</b
                          ><span class="grow">{{ o }}</span>
                          @if (i === q.correct) {
                            <rp-icon name="checkc" [size]="15" />
                          }
                        </div>
                      }
                    </div>
                    @if (q.explanation) {
                      <p class="t-sm t-muted mt8"><b>Why:</b> {{ q.explanation }}</p>
                    }
                    <div class="row g6 mt12">
                      <button type="button" class="btn btn-sec btn-xs" (click)="editQ.set(q)">
                        <rp-icon name="edit" [size]="13" /><span>Edit</span>
                      </button>
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs"
                        [class.is-busy]="busy() === q.id"
                        [disabled]="!!busy()"
                        (click)="remove(q)"
                      >
                        <rp-icon name="trash" [size]="13" /><span>Remove from staging</span>
                      </button>
                    </div>
                  </div>
                } @empty {
                  <div class="card pad" style="grid-column: 1 / -1">
                    <rp-empty
                      icon="bulb"
                      title="No questions in staging"
                      text="Add a question or upload a spreadsheet."
                    />
                  </div>
                }
              </div>
            }
          }
          @case ('uploads') {
            @if (uploads().length) {
              <div class="stack g12" id="qz-uploads">
                @for (u of uploads(); track $index) {
                  <div class="card pad">
                    <div class="row between wrap g8">
                      <div>
                        <b class="t-sm">{{ u.file }}</b>
                        <div class="t-xs t-muted">{{ u.topic }} · {{ u.at }}</div>
                      </div>
                      <div class="row g6">
                        <span class="chip tone-ok">{{ num(u.report.accepted) }} staged</span>
                        @if (u.report.skipped) {
                          <span class="chip tone-neutral"
                            >{{ num(u.report.skipped) }} duplicates skipped</span
                          >
                        }
                        @if (u.report.rejected.length) {
                          <span class="chip tone-bad"
                            >{{ num(u.report.rejected.length) }} rejected</span
                          >
                        }
                      </div>
                    </div>
                    @if (u.report.rejected.length) {
                      <div class="tbl-wrap mt12">
                        <table class="tbl dense">
                          <thead>
                            <tr>
                              <th class="r" style="width: 80px">Row</th>
                              <th>Why it was rejected</th>
                            </tr>
                          </thead>
                          <tbody>
                            @for (r of u.report.rejected; track r.row) {
                              <tr>
                                <td class="r t-num">{{ r.row }}</td>
                                <td>{{ r.reason }}</td>
                              </tr>
                            }
                          </tbody>
                        </table>
                      </div>
                    }
                  </div>
                }
              </div>
            } @else {
              <div class="card pad">
                <rp-empty
                  icon="upload"
                  title="No uploads in this session"
                  text="Upload a spreadsheet to check its blocks and stage the good ones. Each upload is recorded in the activity log."
                >
                  <button type="button" class="btn btn-sec btn-sm" (click)="uploading.set(true)">
                    <span>Upload spreadsheet</span>
                  </button>
                </rp-empty>
              </div>
            }
          }
          @case ('lead') {
            <div class="note tone-brand">
              <rp-icon name="shieldck" [size]="17" />
              <div class="grow">
                <b>Platform leaderboard — operator only.</b> A ranking across institutions is a
                cross-institution read, so it's reserved to the platform operator and each view is
                recorded in the access record with your reason. Only first names and the school are
                shown. Members see only their own institution's leaderboard.
              </div>
            </div>
            <div class="c-filters">
              <div class="fld grow" [class.invalid]="leadErr()" style="min-width: 280px">
                <div class="fld-in">
                  <input
                    id="qz-lb-why"
                    type="text"
                    placeholder="Why you are looking (recorded)"
                    aria-label="Reason"
                    aria-describedby="qz-lb-why-e"
                    [attr.maxlength]="reasonMax"
                    [value]="leadReason()"
                    (input)="leadReason.set($any($event.target).value); leadErr.set('')"
                    (keydown.enter)="showBoard()"
                  />
                </div>
                <div class="fld-e" id="qz-lb-why-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ leadErr() }}</span>
                </div>
              </div>
              <div class="seg" role="radiogroup" aria-label="Period" style="min-width: 220px">
                <span
                  class="seg-ind"
                  style="width: calc((100% - 8px) / 2)"
                  [style.left]="
                    'calc(3px + ' + (period() === 'year' ? 1 : 0) + ' * ((100% - 8px) / 2 + 2px))'
                  "
                ></span>
                <button
                  type="button"
                  role="radio"
                  [class.on]="period() === 'all'"
                  [attr.aria-checked]="period() === 'all'"
                  (click)="period.set('all')"
                >
                  All time
                </button>
                <button
                  type="button"
                  role="radio"
                  [class.on]="period() === 'year'"
                  [attr.aria-checked]="period() === 'year'"
                  (click)="period.set('year')"
                >
                  This year
                </button>
              </div>
              <button
                type="button"
                class="btn btn-pri"
                id="qz-lb-go"
                [class.is-busy]="leadLoading()"
                [disabled]="leadLoading()"
                (click)="showBoard()"
              >
                <rp-icon name="trophy" [size]="17" /><span>Show leaderboard</span>
              </button>
            </div>
            @if (board(); as b) {
              <div class="tbl-wrap">
                <table class="tbl" id="qz-board">
                  <thead>
                    <tr>
                      <th class="r">Rank</th>
                      <th>Member</th>
                      <th>Institution</th>
                      <th class="r">Attempts</th>
                      <th class="r">Average score (ranked on)</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of b.items; track r.rank + r.name + r.institution) {
                      <tr>
                        <td class="r">
                          <b
                            class="ob-rank"
                            [class.r1]="r.rank === 1"
                            [class.r2]="r.rank === 2"
                            [class.r3]="r.rank === 3"
                            >{{ r.rank }}</b
                          >
                        </td>
                        <td>
                          <span class="cell-t">{{ r.name }}</span>
                        </td>
                        <td>{{ r.institution }}</td>
                        <td class="r">{{ num(r.attempts) }}</td>
                        <td class="r">
                          <b class="t-num">{{ r.average.toFixed(1) }}%</b>
                        </td>
                      </tr>
                    } @empty {
                      <tr>
                        <td colspan="5">
                          <rp-empty
                            icon="trophy"
                            title="No finished attempts yet"
                            text="Students appear here once they finish a quiz."
                          />
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
                <div class="pager">
                  <span
                    >{{ plural(b.ranked, 'student') }} ranked across
                    {{ plural(b.institutions, 'institution') }} ·
                    {{ b.period === 'year' ? 'this academic year' : 'all time' }}</span
                  >
                </div>
              </div>
            } @else if (!leadLoading()) {
              <div class="card pad">
                <rp-empty
                  icon="trophy"
                  title="State why, then show the leaderboard"
                  text="The view is recorded with your reason, refusals included."
                />
              </div>
            }
          }
        }
      }
    </div>

    @if (editTopic(); as t) {
      <rp-quiz-topic
        [topic]="t === 'new' ? null : t"
        [topics]="topics() ?? []"
        (closed)="editTopic.set(null)"
        (saved)="topicSaved($event)"
      />
    }
    @if (editQ(); as q) {
      <rp-quiz-question
        [question]="q === 'new' ? null : q"
        [topics]="topics() ?? []"
        [topic]="topicFilter()"
        (closed)="editQ.set(null)"
        (saved)="questionSaved($event, q === 'new')"
      />
    }
    @if (uploading() && topics()) {
      <rp-quiz-upload
        [topics]="topics()!"
        (closed)="uploading.set(false)"
        (done)="uploaded($event)"
      />
    }
  `,
})
export class BackofficeQuiz implements OnInit {
  private readonly api = inject(QuizApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).ops;

  protected readonly num = num;
  protected readonly plural = plural;
  protected readonly letters = LETTERS;
  protected readonly reasonMax = REASON.max;

  protected readonly topics = signal<readonly QuizTopic[] | null>(null);
  protected readonly staging = signal<readonly StagingQuestion[]>([]);
  protected readonly loading = signal(true);
  protected readonly stagingLoading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal('');
  protected readonly publishing = signal(false);
  protected readonly tab = signal<Tab>('topics');
  protected readonly topicFilter = signal('');
  protected readonly editTopic = signal<QuizTopic | 'new' | null>(null);
  protected readonly editQ = signal<StagingQuestion | 'new' | null>(null);
  protected readonly uploading = signal(false);
  protected readonly uploads = signal<
    readonly { report: UploadReport; topic: string; file: string; at: string }[]
  >([]);
  protected readonly leadReason = signal('');
  protected readonly leadErr = signal('');
  protected readonly leadLoading = signal(false);
  protected readonly period = signal<'all' | 'year'>('all');
  protected readonly board = signal<Leaderboard | null>(null);

  private readonly can = (s: string) => this.session()?.subTasks.includes(s) ?? false;
  protected readonly canEdit = computed(() => !this.session() || this.can('quiz.edit'));
  protected readonly canBoard = computed(() => this.can('xi.aggregate'));
  protected readonly tabs = computed(() => [
    { v: 'topics' as Tab, l: 'Topics', n: this.topics()?.length ?? 0 },
    { v: 'staging' as Tab, l: 'Staging', n: this.staging().length },
    { v: 'uploads' as Tab, l: 'Uploads', n: this.uploads().length },
    ...(this.canBoard() ? [{ v: 'lead' as Tab, l: 'Platform leaderboard', n: null }] : []),
  ]);

  /** Per topic: staging questions not yet published, and published ones staging no longer holds. */
  protected readonly changes = computed<TopicChange[]>(() =>
    (this.topics() ?? []).map((topic) => {
      const qs = this.staging().filter((q) => q.topic.id === topic.id);
      const fresh = qs.filter((q) => !q.published).length;
      const kept = qs.length - fresh;
      return { topic, fresh, withdrawn: Math.max(0, topic.published - kept) };
    }),
  );
  protected readonly changeCount = computed(() =>
    this.changes()
      .filter((c) => c.topic.status === 'ACTIVE')
      .reduce((s, c) => s + c.fresh + c.withdrawn, 0),
  );
  protected readonly withdrawals = computed(() => this.changes().filter((c) => c.withdrawn > 0));
  protected readonly topicsText = computed(() => {
    const ts = this.topics() ?? [];
    const live = ts.filter((t) => t.status === 'ACTIVE' && t.published > 0).length;
    const fresh = this.changes().reduce((s, c) => s + c.fresh, 0);
    const gone = this.changes().reduce((s, c) => s + c.withdrawn, 0);
    return `${plural(live, 'topic')} published to members · ${num(fresh)} new or changed and ${num(gone)} to withdraw in staging`;
  });
  protected readonly shownQuestions = computed(() =>
    this.topicFilter()
      ? this.staging().filter((q) => q.topic.id === this.topicFilter())
      : this.staging(),
  );

  ngOnInit() {
    if (!this.canEdit()) return;
    void this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const [t] = await Promise.all([this.api.topics(), this.loadStaging()]);
      this.topics.set(t.items);
      this.error.set('');
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }

  private async loadStaging() {
    this.stagingLoading.set(true);
    try {
      this.staging.set(await this.api.staging());
    } finally {
      this.stagingLoading.set(false);
    }
  }

  protected iconOf(t: QuizTopic): IconName {
    return (TOPIC_ICONS.some((i) => i.v === t.icon) ? t.icon : 'bulb') as IconName;
  }
  protected statusLabel(t: QuizTopic) {
    return translate(`status.quizTopic.${t.status.toLowerCase()}`);
  }
  protected freshIn(id: string) {
    return this.changes().find((c) => c.topic.id === id)?.fresh ?? 0;
  }
  protected countIn(id: string) {
    return this.staging().filter((q) => q.topic.id === id).length;
  }

  protected topicSaved(t: QuizTopic) {
    const was = this.editTopic();
    this.editTopic.set(null);
    this.overlays.toast(was === 'new' ? 'Topic created' : 'Topic saved', { sub: t.name });
    void this.reloadTopics();
  }

  private async reloadTopics() {
    try {
      this.topics.set((await this.api.topics()).items);
    } catch (e) {
      this.overlays.toast("Couldn't refresh the topics", { sub: problemText(e), tone: 'bad' });
    }
  }

  /** ob.qz.tst: withdraw a topic from members, or restore it. */
  protected async toggleTopic(t: QuizTopic) {
    const off = t.status === 'ACTIVE';
    const ok = await this.overlays.confirm({
      title: off ? `Withdraw ${t.name}?` : `Restore ${t.name}?`,
      text: off
        ? 'Members stop seeing the topic. Its questions and past attempts are kept.'
        : 'Members see the topic again with its published questions.',
      ok: off ? 'Withdraw' : 'Restore',
      tone: off ? 'warn' : 'brand',
      icon: 'bulb',
    });
    if (!ok) return;
    this.busy.set(t.id);
    try {
      await this.api.editTopic(t, { status: off ? 'WITHDRAWN' : 'ACTIVE' });
      this.overlays.toast(off ? 'Topic withdrawn' : 'Topic restored', { sub: t.name });
      await this.reloadTopics();
    } catch (e) {
      this.overlays.toast(`Couldn't change ${t.name}`, { sub: problemText(e), tone: 'bad' });
    } finally {
      this.busy.set('');
    }
  }

  protected questionSaved(q: StagingQuestion, added: boolean) {
    this.editQ.set(null);
    this.overlays.toast(added ? 'Question added to staging' : 'Question saved in staging', {
      sub: q.topic.name,
    });
    void this.loadStaging();
    void this.reloadTopics();
  }

  /** ob.qz.rm: out of staging (a published copy is withdrawn when the topic is next published). */
  protected async remove(q: StagingQuestion) {
    const ok = await this.overlays.confirm({
      title: 'Remove this question from staging?',
      text: q.published
        ? 'Members keep seeing it until you publish; publishing then withdraws it.'
        : "It hasn't been published, so members never see it.",
      ok: 'Remove',
      tone: 'bad',
      icon: 'trash',
    });
    if (!ok) return;
    this.busy.set(q.id);
    try {
      await this.api.editQuestion(q, { removed: true });
      this.overlays.toast('Question removed from staging', { sub: q.topic.name });
      await Promise.all([this.loadStaging(), this.reloadTopics()]);
    } catch (e) {
      this.overlays.toast("Couldn't remove the question", { sub: problemText(e), tone: 'bad' });
    } finally {
      this.busy.set('');
    }
  }

  protected uploaded(u: { report: UploadReport; topic: string; file: string }) {
    this.uploading.set(false);
    const d = new Date();
    this.uploads.update((l) => [
      {
        ...u,
        at: d
          .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
          .toUpperCase(),
      },
      ...l,
    ]);
    this.tab.set('uploads');
    void this.loadStaging();
    void this.reloadTopics();
  }

  /** ob.qz.pub: FIN-016 — members are served exactly what staging holds. */
  protected async publish() {
    const list = this.changes().filter(
      (c) => c.topic.status === 'ACTIVE' && (c.fresh || c.withdrawn),
    );
    if (!list.length) return;
    const parts = list.map(
      (c) =>
        `${c.topic.name} — ${[
          c.fresh ? `${c.fresh} new or changed` : '',
          c.withdrawn ? `${c.withdrawn} withdrawn` : '',
        ]
          .filter(Boolean)
          .join(', ')}`,
    );
    const ok = await this.overlays.confirm({
      title: `Publish ${plural(this.changeCount(), 'change')} to members?`,
      text: `${parts.join('; ')}. Published questions that staging no longer holds are withdrawn, so members are served exactly what staging holds. Past attempts are kept.`,
      ok: 'Publish',
      tone: 'warn',
      icon: 'send',
    });
    if (!ok) return;
    this.publishing.set(true);
    try {
      const r = await this.api.publish(list.map((c) => c.topic.id));
      this.overlays.toast('Published to members', {
        sub: `${num(r.published)} new · ${num(r.updated)} changed · ${num(r.withdrawn)} withdrawn`,
      });
      await Promise.all([this.loadStaging(), this.reloadTopics()]);
    } catch (e) {
      this.overlays.toast("Couldn't publish", { sub: problemText(e), tone: 'bad' });
    } finally {
      this.publishing.set(false);
    }
  }

  /** FIN-017: the platform leaderboard, recorded with the reason (RPT.XI_* on refusal). */
  protected async showBoard() {
    const why = this.leadReason().trim();
    if (why.length < REASON.min || why.length > REASON.max) {
      this.leadErr.set(translate('RPT.XI_REASON'));
      return;
    }
    this.leadLoading.set(true);
    try {
      this.board.set(await this.api.leaderboard(this.period(), why));
      this.overlays.toast('Leaderboard view recorded', {
        sub: 'In the access record with your reason',
      });
    } catch (e) {
      this.leadErr.set(
        e instanceof ApiProblem && e.errors.length ? e.errors[0]!.message : problemText(e),
      );
    } finally {
      this.leadLoading.set(false);
    }
  }
}
