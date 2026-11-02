import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
  type OnInit,
} from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { plural } from '../../Console/Fees/fee-format';
import { problemText } from '../../Console/Structure/academic-format';
import { QuizApi, type QuizTopic, type StagingQuestion, type UploadReport } from './quiz.api';

const LETTERS = ['A', 'B', 'C', 'D'] as const;
export const TOPIC_ICONS: readonly { v: string; l: string }[] = [
  { v: 'bulb', l: 'Light bulb' },
  { v: 'wallet', l: 'Wallet' },
  { v: 'piggy', l: 'Piggy bank' },
  { v: 'shieldck', l: 'Shield' },
  { v: 'bank', l: 'Bank' },
  { v: 'percent', l: 'Percent' },
  { v: 'alert', l: 'Warning' },
];
const MAX_BYTES = 2 * 1024 * 1024;

/** ob.qz.topic: a new topic or a renamed one (FIN-010, FIN-011). */
@Component({
  selector: 'rp-quiz-topic',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="topic() ? 'Rename ' + topic()!.name : 'New topic'"
      [sub]="
        topic()
          ? 'Members see the new name on their next quiz.'
          : 'New topics reach members when their questions are published.'
      "
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g12" id="qz-topic">
        <div class="fld" [class.invalid]="nameErr()">
          <label class="fld-l" for="qz-tp-n"
            >Topic name<span class="req">*</span
            ><span class="count">{{ name().length }}/60</span></label
          >
          <div class="fld-in">
            <input
              id="qz-tp-n"
              type="text"
              maxlength="60"
              autocomplete="off"
              aria-describedby="qz-tp-n-e"
              [value]="name()"
              (input)="name.set($any($event.target).value); nameErr.set('')"
            />
          </div>
          <div class="fld-e" id="qz-tp-n-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ nameErr() }}</span>
          </div>
        </div>
        <div class="fld">
          <label class="fld-l" for="qz-tp-d"
            >Short description<span class="opt">(optional)</span></label
          >
          <div class="fld-in">
            <input
              id="qz-tp-d"
              type="text"
              maxlength="200"
              autocomplete="off"
              [value]="desc()"
              (input)="desc.set($any($event.target).value)"
            />
          </div>
        </div>
        <div class="fld">
          <label class="fld-l" for="qz-tp-i">Icon</label>
          <div class="fld-in">
            <select id="qz-tp-i" (change)="icon.set($any($event.target).value)">
              @for (i of icons; track i.v) {
                <option [value]="i.v" [selected]="icon() === i.v">{{ i.l }}</option>
              }
            </select>
          </div>
        </div>
        @if (error()) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ error() }}</div>
          </div>
        }
      </div>
      <div modal-foot class="row g8">
        <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="qz-tp-save"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="save()"
        >
          <span>{{ topic() ? 'Save topic' : 'Create topic' }}</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class TopicModal implements OnInit {
  private readonly api = inject(QuizApi);
  readonly topic = input<QuizTopic | null>(null);
  readonly topics = input<readonly QuizTopic[]>([]);
  readonly closed = output<void>();
  readonly saved = output<QuizTopic>();

  protected readonly icons = TOPIC_ICONS;
  protected readonly name = signal('');
  protected readonly desc = signal('');
  protected readonly icon = signal('bulb');
  protected readonly nameErr = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  ngOnInit() {
    const t = this.topic();
    if (!t) return;
    this.name.set(t.name);
    this.desc.set(t.description ?? '');
    this.icon.set(t.icon ?? 'bulb');
  }

  protected async save() {
    const n = this.name().trim();
    const t = this.topic();
    if (n.length < 3 || n.length > 60) {
      this.nameErr.set(translate('FIN.TOPIC_NAME'));
      return;
    }
    if (this.topics().some((x) => x.id !== t?.id && x.name.toLowerCase() === n.toLowerCase())) {
      this.nameErr.set(translate('FIN.TOPIC_TAKEN'));
      return;
    }
    this.busy.set(true);
    this.error.set('');
    const body = { name: n, description: this.desc().trim() || null, icon: this.icon() };
    try {
      this.saved.emit(t ? await this.api.editTopic(t, body) : await this.api.addTopic(body));
    } catch (e) {
      if (e instanceof ApiProblem && (e.code.startsWith('FIN.TOPIC') || e.errors.length))
        this.nameErr.set(e.errors[0]?.message ?? problemText(e));
      else this.error.set(problemText(e));
    } finally {
      this.busy.set(false);
    }
  }
}

/** ob.qz.q: add a staging question or edit one (FIN-013, FIN-014). */
@Component({
  selector: 'rp-quiz-question',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="question() ? 'Edit a staging question' : 'Add a question to staging'"
      sub="Four options, exactly one correct. Members see the explanation when they review their answers."
      icon="bulb"
      [wide]="true"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g12" id="qz-q">
        <div class="fld">
          <label class="fld-l" for="qz-q-t">Topic</label>
          <div class="fld-in">
            <select
              id="qz-q-t"
              [disabled]="!!question()"
              (change)="topicId.set($any($event.target).value)"
            >
              @for (t of topics(); track t.id) {
                <option [value]="t.id" [selected]="topicId() === t.id">
                  {{ t.name }}{{ t.status === 'WITHDRAWN' ? ' (withdrawn)' : '' }}
                </option>
              }
            </select>
          </div>
        </div>
        <div class="fld" [class.invalid]="err('text')">
          <label class="fld-l" for="qz-q-q"
            >Question<span class="req">*</span
            ><span class="count">{{ text().length }}/500</span></label
          >
          <div class="fld-in">
            <textarea
              id="qz-q-q"
              rows="2"
              maxlength="500"
              aria-describedby="qz-q-q-e"
              [value]="text()"
              (input)="text.set($any($event.target).value); clear('text')"
            ></textarea>
          </div>
          <div class="fld-e" id="qz-q-q-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('text') }}</span>
          </div>
        </div>
        <div class="ob-optedit">
          @for (l of letters; track l; let i = $index) {
            <div class="ob-orow">
              <label class="chk" [attr.title]="'Mark ' + l + ' as the correct answer'"
                ><input
                  type="radio"
                  name="qz-q-ans"
                  [id]="'qz-q-a' + i"
                  [checked]="correct() === i"
                  (change)="correct.set(i); clear('correct')"
                /><span class="t-b">{{ l }}</span></label
              >
              <div class="fld" [class.invalid]="err('o' + i)">
                <div class="fld-in">
                  <input
                    type="text"
                    maxlength="200"
                    autocomplete="off"
                    [id]="'qz-q-o' + i"
                    [placeholder]="'Option ' + l"
                    [attr.aria-label]="'Option ' + l"
                    [value]="options()[i]"
                    (input)="setOption(i, $any($event.target).value)"
                  />
                </div>
              </div>
            </div>
          }
          @if (err('options') || err('correct')) {
            <div class="fld invalid">
              <div class="fld-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{
                  err('options') || err('correct')
                }}</span>
              </div>
            </div>
          }
          <p class="t-xs t-muted" style="margin: 0">
            Select the radio button beside the one correct option.
          </p>
        </div>
        <div class="fld">
          <label class="fld-l" for="qz-q-w">Explanation<span class="opt">(optional)</span></label>
          <div class="fld-in">
            <textarea
              id="qz-q-w"
              rows="2"
              maxlength="500"
              [value]="why()"
              (input)="why.set($any($event.target).value)"
            ></textarea>
          </div>
        </div>
        @if (error()) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ error() }}</div>
          </div>
        }
      </div>
      <div modal-foot class="row g8">
        <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="qz-q-save"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="save()"
        >
          <span>{{ question() ? 'Save question' : 'Add to staging' }}</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class QuestionModal implements OnInit {
  private readonly api = inject(QuizApi);
  readonly question = input<StagingQuestion | null>(null);
  readonly topics = input.required<readonly QuizTopic[]>();
  readonly topic = input('');
  readonly closed = output<void>();
  readonly saved = output<StagingQuestion>();

  protected readonly letters = LETTERS;
  protected readonly topicId = signal('');
  protected readonly text = signal('');
  protected readonly options = signal<readonly string[]>(['', '', '', '']);
  protected readonly correct = signal(-1);
  protected readonly why = signal('');
  protected readonly errors = signal<Readonly<Record<string, string>>>({});
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  ngOnInit() {
    const q = this.question();
    this.topicId.set(q?.topic.id ?? (this.topic() || this.topics()[0]?.id) ?? '');
    if (!q) return;
    this.text.set(q.text);
    this.options.set([...q.options]);
    this.correct.set(q.correct);
    this.why.set(q.explanation ?? '');
  }

  protected err(k: string) {
    return this.errors()[k] ?? '';
  }
  protected clear(k: string) {
    if (this.errors()[k]) this.errors.update((e) => ({ ...e, [k]: '' }));
    this.error.set('');
  }
  protected setOption(i: number, v: string) {
    this.options.update((o) => o.map((x, j) => (j === i ? v : x)));
    this.clear('o' + i);
    this.clear('options');
  }

  /** ob.qz.q.save's checks: a question, four different options, exactly one marked correct. */
  private validate() {
    const e: Record<string, string> = {};
    const t = this.text().trim();
    const o = this.options().map((x) => x.trim());
    if (t.length < 5) e['text'] = translate('FIN.QUESTION_MALFORMED');
    o.forEach((x, i) => {
      if (!x) e['o' + i] = ' ';
    });
    if (o.some((x) => !x)) e['options'] = translate('FIN.QUESTION_MALFORMED');
    else if (new Set(o.map((x) => x.toLowerCase())).size !== 4)
      e['options'] = 'The four options must be different.';
    if (this.correct() < 0) e['correct'] = 'Choose the correct option.';
    this.errors.set(e);
    return !Object.values(e).some((x) => x);
  }

  protected async save() {
    if (this.busy() || !this.validate()) return;
    this.busy.set(true);
    const body = {
      text: this.text().trim(),
      options: this.options().map((x) => x.trim()),
      correct: this.correct(),
      explanation: this.why().trim() || null,
    };
    try {
      const q = this.question();
      const r = q
        ? await this.api.editQuestion(q, body)
        : await this.api.addQuestion(this.topicId(), body);
      const topic = this.topics().find((t) => t.id === this.topicId());
      this.saved.emit({
        id: r.id ?? q?.id ?? '',
        topic: r.topic ?? { id: this.topicId(), name: topic?.name ?? '' },
        text: body.text,
        options: body.options,
        correct: body.correct,
        explanation: body.explanation,
        published: false,
        version: r.version ?? (q ? q.version + 1 : 1),
      });
    } catch (e) {
      if (e instanceof ApiProblem && e.code === 'FIN.QUESTION_DUPLICATE')
        this.errors.set({ text: problemText(e) });
      else this.error.set(problemText(e));
    } finally {
      this.busy.set(false);
    }
  }
}

/** ob.qz.up: a sheet of six-row blocks (saved as CSV) into a topic's staging (FIN-015). */
@Component({
  selector: 'rp-quiz-upload',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      title="Upload questions from a spreadsheet"
      sub="Valid blocks go to staging — nothing reaches members until you publish."
      icon="upload"
      [narrow]="false"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g12" id="qz-up">
        <pre class="ob-pre">{{ sample }}</pre>
        <p class="t-xs t-muted" style="margin: 0">
          One question per block in the first column: the question, its four answers with the
          correct one ending “(Correct)”, then a blank row. Duplicates already in staging are
          skipped.
        </p>
        <div class="fld">
          <label class="fld-l" for="qz-up-t">Topic</label>
          <div class="fld-in">
            <select id="qz-up-t" (change)="topicId.set($any($event.target).value)">
              @for (t of topics(); track t.id) {
                <option [value]="t.id" [selected]="topicId() === t.id">{{ t.name }}</option>
              }
            </select>
          </div>
        </div>
        <div class="fld" [class.invalid]="fileErr()">
          <span class="fld-l">Spreadsheet</span>
          <label class="upl" [class.done]="!!file()" for="qz-up-f"
            ><span class="upl-ic"
              ><rp-icon [name]="file() ? 'checkc' : 'upload'" [size]="20" /></span
            ><span class="grow" style="min-width: 0"
              ><span class="t-h4 t-clip" style="display: block">{{
                file()?.name ?? 'Choose a file'
              }}</span
              ><span class="t-xs t-muted">{{
                file() ? size(file()!.size) + ' · ready to check' : 'CSV · up to 2 MB'
              }}</span></span
            ><input
              type="file"
              id="qz-up-f"
              accept=".csv,text/csv"
              aria-describedby="qz-up-f-e"
              (change)="pick($event)"
          /></label>
          <div class="fld-e" id="qz-up-f-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ fileErr() }}</span>
          </div>
        </div>
        @if (error()) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ error() }}</div>
          </div>
        }
      </div>
      <div modal-foot class="row g8">
        <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="qz-up-go"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="go()"
        >
          <rp-icon name="upload" [size]="17" /><span>Check and stage</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class UploadModal implements OnInit {
  private readonly api = inject(QuizApi);
  private readonly overlays = inject(Overlays);
  readonly topics = input.required<readonly QuizTopic[]>();
  readonly closed = output<void>();
  readonly done = output<{ report: UploadReport; topic: string; file: string }>();

  protected readonly sample =
    'What is a budget?\nA plan for spending and saving (Correct)\nA bank account\nA type of loan\nA shopping list\n\n…next block';
  protected readonly topicId = signal('');
  protected readonly file = signal<File | null>(null);
  protected readonly fileErr = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  ngOnInit() {
    this.topicId.set(
      this.topics().find((t) => t.status === 'ACTIVE')?.id ?? this.topics()[0]?.id ?? '',
    );
  }

  protected size(n: number) {
    return n < 1024 * 1024
      ? `${Math.max(1, Math.round(n / 1024))} KB`
      : `${(n / 1048576).toFixed(1)} MB`;
  }
  protected pick(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0] ?? null;
    this.fileErr.set('');
    this.error.set('');
    if (f && f.size > MAX_BYTES) {
      this.file.set(null);
      this.fileErr.set(translate('FILE.TOO_LARGE', { limit: '2 MB' }));
      return;
    }
    this.file.set(f);
  }

  protected async go() {
    const f = this.file();
    if (!f) {
      this.fileErr.set(translate('FIN.UPLOAD_FORMAT'));
      return;
    }
    this.busy.set(true);
    try {
      const r = await this.api.upload(this.topicId(), f);
      const topic = this.topics().find((t) => t.id === this.topicId())?.name ?? '';
      this.overlays.toast(`${plural(r.accepted, 'question')} staged`, {
        sub: `${topic}${r.rejected.length ? ` · ${plural(r.rejected.length, 'block')} rejected` : ''}${r.skipped ? ` · ${r.skipped} skipped` : ''}`,
        tone: r.rejected.length ? 'warn' : 'ok',
      });
      this.done.emit({ report: r, topic, file: f.name });
    } catch (e) {
      if (e instanceof ApiProblem && e.errors.some((x) => x.field === 'file'))
        this.fileErr.set(e.errors.find((x) => x.field === 'file')!.message);
      else this.error.set(problemText(e));
    } finally {
      this.busy.set(false);
    }
  }
}

export { LETTERS };
