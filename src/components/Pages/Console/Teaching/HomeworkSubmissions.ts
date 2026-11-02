/**
 * A homework's submissions (ACA-050) in the prototype's drawer: each student it went to with what
 * they handed in (file, link, note, late), reviewed with one of the school's grades and feedback
 * (ACA-051, If-Match on the submission), and a reminder to those who haven't submitted (ACA-075).
 */
import {
  ChangeDetectionStrategy,
  Component,
  type OnInit,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate, formatDateTime } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { t as tr } from '../../../Utils/t';
import { problemText } from '../Structure/academic-format';
import { type Homework, type SubmissionRow, type Submissions, WorkApi } from './work.api';

interface Draft {
  readonly grade?: string;
  readonly feedback?: string;
}

@Component({
  selector: 'rp-homework-submissions',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<rp-modal
    [title]="homework().title"
    [sub]="
      t('ui.web.tch.hw.subsSub', {
        section: homework().section.label,
        subject: homework().subject.name,
        date: date(homework().dueDate),
      })
    "
    icon="bookopen"
    [drawer]="true"
    [wide]="true"
    (closed)="closed.emit()"
  >
    <div class="stack g12" id="hs-body">
      @if (data(); as d) {
        <div class="row g8 wrap">
          <span class="chip dot tone-ok">{{ t('ui.web.tch.hw.counts', countParams(d)) }}</span>
          <span class="grow"></span>
          <button
            type="button"
            class="btn btn-sec btn-sm"
            id="hs-remind"
            [disabled]="d.homework.closed || !d.homework.counts.notSubmitted || busy() === 'remind'"
            (click)="remind()"
          >
            <rp-icon name="bell" [size]="15" /><span>{{ t('ui.web.tch.hw.remind') }}</span>
          </button>
        </div>
        <div class="tbl-wrap">
          <table class="tbl" id="hs-grid">
            <thead>
              <tr>
                <th>{{ t('ui.web.tch.hw.student') }}</th>
                <th>{{ t('ui.web.tch.hw.handedIn') }}</th>
                <th>{{ t('ui.web.tch.hw.grade') }}</th>
                <th>{{ t('ui.web.tch.hw.feedback') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (r of d.rows; track r.student.id; let i = $index) {
                <tr>
                  <td>
                    <b>{{ r.student.name }}</b>
                    <div class="t-muted t-sm t-mono">{{ r.student.admissionNo ?? '' }}</div>
                  </td>
                  @if (r.submission; as s) {
                    <td>
                      <div class="row g8 wrap">
                        <span class="t-sm">{{ s.submittedAt ? dateTime(s.submittedAt) : '' }}</span>
                        @if (s.late) {
                          <span class="chip tone-warn">{{ t('ui.web.tch.hw.late') }}</span>
                        }
                        <span
                          class="chip dot"
                          [class]="s.status === 'REVIEWED' ? 'tone-ok' : 'tone-info'"
                          >{{ statusLabel(s.status) }}</span
                        >
                      </div>
                      @if (s.file?.url) {
                        <a class="t-sm" target="_blank" rel="noopener" [href]="s.file!.url">{{
                          t('ui.web.tch.hw.openFile', { name: s.file!.name })
                        }}</a>
                      }
                      @if (s.link) {
                        <a class="t-sm" target="_blank" rel="noopener noreferrer" [href]="s.link">{{
                          t('ui.web.tch.hw.openLink')
                        }}</a>
                      }
                      @if (s.note) {
                        <div class="t-sm t-muted">
                          {{ t('ui.web.tch.hw.note', { text: s.note }) }}
                        </div>
                      }
                    </td>
                    <td>
                      <div
                        class="seg"
                        role="radiogroup"
                        style="width: max-content"
                        [id]="'hs-g-' + i"
                        [attr.aria-label]="t('ui.web.tch.hw.gradeOf', { name: r.student.name })"
                      >
                        @for (g of d.grades; track g) {
                          <button
                            type="button"
                            role="radio"
                            [class.on]="gradeOf(s.id, s.grade) === g"
                            [attr.aria-checked]="gradeOf(s.id, s.grade) === g"
                            [style.background]="
                              gradeOf(s.id, s.grade) === g ? 'var(--surface)' : null
                            "
                            [style.box-shadow]="
                              gradeOf(s.id, s.grade) === g ? 'var(--shadow-1)' : null
                            "
                            (click)="edit(s.id, { grade: g })"
                          >
                            {{ g }}
                          </button>
                        }
                      </div>
                    </td>
                    <td>
                      <div class="fld-in" style="min-width: 180px">
                        <input
                          [id]="'hs-f-' + i"
                          maxlength="300"
                          [attr.aria-label]="
                            t('ui.web.tch.hw.feedbackOf', { name: r.student.name })
                          "
                          [value]="feedbackOf(s.id, s.feedback)"
                          (input)="edit(s.id, { feedback: val($event) })"
                        />
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        class="btn btn-pri btn-sm"
                        [id]="'hs-save-' + i"
                        [disabled]="!changed(r) || busy() === s.id"
                        (click)="review(r)"
                      >
                        {{ t('ui.web.tch.hw.save') }}
                      </button>
                    </td>
                  } @else {
                    <td colspan="4" class="t-muted">{{ t('ui.web.tch.hw.notSubmitted') }}</td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else if (error()) {
        <div class="note tone-bad" role="alert">
          <rp-icon name="alert" [size]="17" />
          <div class="grow">{{ error() }}</div>
          <button type="button" class="btn btn-sec btn-sm" (click)="load()">
            {{ t('ui.web.tch.retry') }}
          </button>
        </div>
      } @else {
        <div class="sk" style="height: 240px; border-radius: 16px"></div>
      }
    </div>
    <div modal-foot class="cc-foot">
      <button type="button" class="btn btn-sec" (click)="closed.emit()">
        <span>{{ t('ui.web.tch.close') }}</span>
      </button>
    </div>
  </rp-modal>`,
})
export class HomeworkSubmissions implements OnInit {
  private readonly api = inject(WorkApi);
  private readonly overlays = inject(Overlays);
  protected readonly t = tr;
  readonly homework = input.required<Homework>();
  readonly closed = output<void>();
  /** A review or reminder changed the counts. */
  readonly changedCounts = output<void>();

  protected readonly data = signal<Submissions | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal<string | null>(null);
  private readonly drafts = signal<Readonly<Record<string, Draft>>>({});
  protected readonly countParams = (d: Submissions) => ({
    reviewed: d.homework.counts.reviewed,
    toReview: d.homework.counts.toReview,
    notSubmitted: d.homework.counts.notSubmitted,
  });

  ngOnInit() {
    void this.load();
  }

  async load() {
    try {
      this.data.set(await this.api.submissions(this.homework().id));
      this.error.set('');
    } catch (e) {
      this.error.set(problemText(e));
    }
  }

  protected gradeOf(id: string, saved: string | null) {
    return this.drafts()[id]?.grade ?? saved;
  }
  protected feedbackOf(id: string, saved: string | null) {
    return this.drafts()[id]?.feedback ?? saved ?? '';
  }
  protected edit(id: string, d: Draft) {
    this.drafts.update((x) => ({ ...x, [id]: { ...x[id], ...d } }));
  }
  protected changed(r: SubmissionRow) {
    const s = r.submission;
    if (!s) return false;
    const grade = this.gradeOf(s.id, s.grade);
    return (
      !!grade &&
      (grade !== s.grade || this.feedbackOf(s.id, s.feedback).trim() !== (s.feedback ?? ''))
    );
  }

  protected async review(r: SubmissionRow) {
    const s = r.submission;
    if (!s || !this.changed(r)) return;
    this.busy.set(s.id);
    try {
      await this.api.review(
        s.id,
        s.version,
        this.gradeOf(s.id, s.grade)!,
        this.feedbackOf(s.id, s.feedback).trim() || null,
      );
      this.overlays.toast(tr('ui.web.tch.hw.reviewed'), {
        sub: tr('ui.web.tch.hw.reviewedSub', { name: r.student.name }),
      });
      this.drafts.update((x) => {
        const rest = { ...x };
        delete rest[s.id];
        return rest;
      });
      this.changedCounts.emit();
      await this.load();
    } catch (e) {
      if (e instanceof ApiProblem && e.status === 412) {
        this.overlays.toast(tr('ui.web.tch.hw.conflict'), { tone: 'bad' });
        await this.load();
      } else {
        const msg =
          e instanceof ApiProblem && e.errors.length ? e.errors[0]!.message : problemText(e);
        this.overlays.toast(msg, { tone: 'bad' });
      }
    } finally {
      this.busy.set(null);
    }
  }

  protected async remind() {
    this.busy.set('remind');
    try {
      const out = await this.api.remind(this.homework().id);
      this.overlays.toast(tr('ui.web.tch.hw.reminded'), {
        sub: tr('ui.web.tch.hw.remindedSub', { n: out.students }),
      });
    } catch (e) {
      this.overlays.toast(problemText(e), { tone: 'bad' });
    } finally {
      this.busy.set(null);
    }
  }

  protected statusLabel(s: string) {
    return tr(`status.submission.${s.toLowerCase()}`);
  }
  protected date(v: string) {
    return formatDate(v);
  }
  protected dateTime(v: string) {
    return formatDateTime(v);
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
}
