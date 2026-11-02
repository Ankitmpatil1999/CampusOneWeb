/**
 * Set homework or classwork (ACA-049) in the prototype's drawer: the class and subject from the
 * teacher's assignments, a title, instructions (typed, or spoken — speech to text, client
 * 2026-10-12), the due date (homework after today, classwork from today) and a file or a link. The
 * same checks as the server run first; its field errors land on the field.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Dictation, withPhrase } from '../../../Shared/Dictation';
import { Dropdown } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { ApiProblem } from '../../../Utils/problem';
import { t as tr } from '../../../Utils/t';
import { addDays, problemText, today } from '../Structure/academic-format';
import { ClassesApi, type Roster } from './classes.api';
import { type Homework, type HomeworkChoice, type HomeworkKind, WorkApi } from './work.api';

type Field = 'class' | 'students' | 'title' | 'instructions' | 'dueDate' | 'file' | 'link';
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_INSTRUCTIONS = 600;
const TYPES = /\.(pdf|png|jpe?g)$/i;
const FIELD_OF: Readonly<Record<string, Field>> = {
  classSectionId: 'class',
  subjectId: 'class',
  // No student enrolled in the section this year (client 2026-10-14: it read "fill in all
  // mandatory fields").
  studentIds: 'class',
  title: 'title',
  instructions: 'instructions',
  dueDate: 'dueDate',
  fileId: 'file',
  link: 'link',
};

@Component({
  selector: 'rp-homework-form',
  imports: [Dictation, Dropdown, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<rp-modal
    [title]="t('ui.web.tch.hw.formTitle')"
    [sub]="t('ui.web.tch.hw.formSub')"
    icon="bookopen"
    [drawer]="true"
    [wide]="true"
    [dismiss]="!busy()"
    (closed)="closed.emit()"
  >
    <div class="stack g16" id="hw-form">
      @if (error()) {
        <div class="note tone-bad" role="alert">
          <rp-icon name="alertc" [size]="17" />
          <div class="grow">{{ error() }}</div>
        </div>
      }
      <div class="c-form">
        <div class="fld">
          <span class="fld-l">{{ t('ui.web.tch.hw.type') }}</span>
          <div
            class="seg"
            role="radiogroup"
            id="hw-type"
            [attr.aria-label]="t('ui.web.tch.hw.type')"
          >
            @for (k of kinds; track k) {
              <button
                type="button"
                role="radio"
                [class.on]="kind() === k"
                [attr.aria-checked]="kind() === k"
                [style.background]="kind() === k ? 'var(--surface)' : null"
                [style.box-shadow]="kind() === k ? 'var(--shadow-1)' : null"
                (click)="setKind(k)"
              >
                {{ t(k === 'HOMEWORK' ? 'ui.web.tch.hw.homework' : 'ui.web.tch.hw.classwork') }}
              </button>
            }
          </div>
        </div>
        <div class="fld" [class.invalid]="err('class')">
          <label class="fld-l" for="hw-class-b"
            >{{ t('ui.web.tch.hw.class') }}<span class="req">*</span></label
          >
          <rp-dd
            inputId="hw-class"
            [placeholder]="t('ui.web.tch.hw.pickClass')"
            [options]="classOptions()"
            [value]="pair()"
            (changed)="setPair($event)"
          />
          <div class="fld-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('class') }}</span>
          </div>
        </div>
        <!-- The whole class, or chosen students of it (client 2026-10-15). -->
        <div class="full">
          <div class="fld" [class.invalid]="err('students')">
            <span class="fld-l">{{ t('ui.web.tch.hw.who') }}</span>
            <div
              class="seg"
              role="radiogroup"
              id="hw-who"
              [attr.aria-label]="t('ui.web.tch.hw.who')"
            >
              @for (w of whos; track w) {
                <button
                  type="button"
                  role="radio"
                  [class.on]="who() === w"
                  [attr.aria-checked]="who() === w"
                  [style.background]="who() === w ? 'var(--surface)' : null"
                  [style.box-shadow]="who() === w ? 'var(--shadow-1)' : null"
                  (click)="setWho(w)"
                >
                  {{ t(w === 'all' ? 'ui.web.tch.hw.whole' : 'ui.web.tch.hw.some') }}
                </button>
              }
            </div>
            @if (who() === 'some') {
              <div class="stack g8" id="hw-students" style="margin-top: 8px">
                @if (!pair()) {
                  <p class="t-sm t-muted">{{ t('ui.web.tch.hw.pickClassFirst') }}</p>
                } @else if (rosterError()) {
                  <div class="note tone-bad" role="alert">
                    <rp-icon name="alertc" [size]="17" />
                    <div class="grow">{{ rosterError() }}</div>
                  </div>
                } @else if (!roster()) {
                  <p class="t-sm t-muted">{{ t('ui.web.tch.hw.loadingStudents') }}</p>
                } @else {
                  <div class="row g8 wrap">
                    <label class="search grow"
                      ><rp-icon name="search" [size]="16" /><input
                        type="search"
                        id="hw-st-q"
                        autocomplete="off"
                        [placeholder]="t('ui.web.tch.hw.searchStudents')"
                        [value]="q()"
                        (input)="q.set(val($event))"
                    /></label>
                    <span class="t-sm t-muted" id="hw-st-n">{{
                      t('ui.web.tch.hw.picked', { n: picked().size })
                    }}</span>
                    <button
                      type="button"
                      class="btn btn-ghost btn-sm"
                      id="hw-st-all"
                      (click)="pickShown()"
                    >
                      {{ t('ui.web.tch.hw.pickAll') }}
                    </button>
                    <button type="button" class="btn btn-ghost btn-sm" (click)="picked.set(none)">
                      {{ t('ui.web.tch.hw.pickNone') }}
                    </button>
                  </div>
                  <div class="card list" style="max-height: 260px; overflow: auto">
                    @for (s of shown(); track s.id; let i = $index) {
                      <label class="li" style="cursor: pointer">
                        <input
                          type="checkbox"
                          [id]="'hw-st-' + i"
                          [checked]="picked().has(s.id)"
                          (change)="toggle(s.id)"
                        />
                        <span class="li-main"
                          ><span class="li-t">{{ s.name }}</span
                          ><span class="li-s">{{ s.admissionNo ?? '' }}</span></span
                        >
                      </label>
                    } @empty {
                      <p class="t-sm t-muted" style="padding: 12px">
                        {{ t('ui.web.tch.hw.noMatch') }}
                      </p>
                    }
                  </div>
                }
              </div>
            }
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('students') }}</span>
            </div>
          </div>
        </div>
        <div class="full">
          <div class="fld" [class.invalid]="err('title')">
            <label class="fld-l" for="hw-t"
              >{{ t('ui.web.tch.hw.title') }}<span class="req">*</span
              ><span class="count">{{ title().length }}/80</span></label
            >
            <div class="fld-in">
              <input
                id="hw-t"
                type="text"
                maxlength="80"
                autocomplete="off"
                [placeholder]="t('ui.web.tch.hw.titlePh')"
                [value]="title()"
                (input)="title.set(val($event)); clear('title')"
              />
            </div>
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('title') }}</span>
            </div>
          </div>
        </div>
        <div class="full">
          <div class="fld" [class.invalid]="err('instructions')">
            <label class="fld-l" for="hw-x"
              >{{ t('ui.web.tch.hw.instructions') }}<span class="req">*</span
              ><span class="count">{{ instructions().length }}/600</span></label
            >
            <div class="fld-in">
              <textarea
                id="hw-x"
                rows="5"
                maxlength="600"
                [placeholder]="t('ui.web.tch.hw.instructionsPh')"
                [value]="instructions()"
                (input)="instructions.set(val($event)); clear('instructions')"
              ></textarea>
            </div>
            <!-- Speech to text, for homework and classwork alike (client 2026-10-12). -->
            <rp-dictate fid="hw-x-speak" [disabled]="busy()" (heard)="addSpoken($event)" />
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('instructions') }}</span>
            </div>
          </div>
        </div>
        <div class="fld" [class.invalid]="err('dueDate')">
          <label class="fld-l" for="hw-due"
            >{{ t('ui.web.tch.hw.dueDate') }}<span class="req">*</span></label
          >
          <div class="fld-in">
            <input
              id="hw-due"
              type="date"
              [min]="minDue()"
              [value]="due()"
              (change)="due.set(val($event)); clear('dueDate')"
            />
          </div>
          <div class="fld-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('dueDate') }}</span>
          </div>
        </div>
        <div></div>
      </div>

      <div class="fs">
        <h4>
          <rp-icon name="clip" [size]="15" />{{ t('ui.web.tch.hw.material') }}
          <span class="opt">{{ t('ui.web.tch.hw.optional') }}</span>
        </h4>
        <div class="fs-b stack g12">
          <div class="fld" [class.invalid]="err('file')">
            <label class="upl" [class.done]="!!file()" for="hw-file"
              ><span class="upl-ic"
                ><rp-icon [name]="file() ? 'checkc' : 'upload'" [size]="20" /></span
              ><span class="grow" style="min-width: 0"
                ><span class="t-h4 t-clip" style="display: block">{{
                  file()?.name ?? t('ui.web.tch.hw.file')
                }}</span
                ><span class="t-xs t-muted">{{
                  file() ? kb(file()!.size) : t('ui.web.tch.hw.fileHint')
                }}</span></span
              ><input
                type="file"
                id="hw-file"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                (change)="pick($event)"
            /></label>
            @if (file()) {
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                id="hw-file-x"
                (click)="file.set(null)"
              >
                <rp-icon name="x" [size]="15" /><span>{{ t('ui.web.tch.hw.removeFile') }}</span>
              </button>
            }
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('file') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('link')">
            <label class="fld-l" for="hw-link">{{ t('ui.web.tch.hw.link') }}</label>
            <div class="fld-in">
              <input
                id="hw-link"
                type="url"
                maxlength="300"
                [placeholder]="t('ui.web.tch.hw.linkPh')"
                [value]="link()"
                (input)="link.set(val($event)); clear('link')"
              />
            </div>
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('link') }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div modal-foot class="cc-foot">
      <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="closed.emit()">
        <span>{{ t('ui.web.tch.hw.cancel') }}</span>
      </button>
      <button
        type="button"
        class="btn btn-pri"
        id="hw-send"
        [class.is-busy]="busy()"
        [disabled]="busy()"
        (click)="send()"
      >
        <rp-icon name="send" [size]="17" /><span>{{ t('ui.web.tch.hw.send') }}</span>
      </button>
    </div>
  </rp-modal>`,
})
export class HomeworkForm {
  private readonly api = inject(WorkApi);
  private readonly classes = inject(ClassesApi);
  private readonly overlays = inject(Overlays);
  protected readonly t = tr;
  readonly choices = input.required<readonly HomeworkChoice[]>();
  readonly closed = output<void>();
  readonly saved = output<Homework>();

  protected readonly kinds: readonly HomeworkKind[] = ['HOMEWORK', 'CLASSWORK'];
  protected readonly kind = signal<HomeworkKind>('HOMEWORK');
  protected readonly pair = signal('');
  protected readonly title = signal('');
  protected readonly instructions = signal('');
  protected readonly due = signal(addDays(today(), 1));
  protected readonly file = signal<File | null>(null);
  protected readonly link = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  private readonly errors = signal<Partial<Record<Field, string>>>({});
  private readonly dictation = viewChild(Dictation);

  /** For the whole class, or chosen students of it (client 2026-10-15). */
  protected readonly whos = ['all', 'some'] as const;
  protected readonly who = signal<'all' | 'some'>('all');
  protected readonly roster = signal<Roster['items'] | null>(null);
  protected readonly rosterError = signal('');
  protected readonly none: ReadonlySet<string> = new Set();
  protected readonly picked = signal<ReadonlySet<string>>(this.none);
  protected readonly q = signal('');
  /** The section whose students are loaded (or being loaded). */
  private rosterOf = '';
  protected readonly shown = computed(() => {
    const q = this.q().trim().toLowerCase();
    const all = this.roster() ?? [];
    return q
      ? all.filter(
          (s) =>
            s.name.toLowerCase().includes(q) || (s.admissionNo ?? '').toLowerCase().includes(q),
        )
      : all;
  });

  protected readonly classOptions = computed(() =>
    this.choices().map((c) => ({
      v: `${c.section.id}|${c.subject.id}`,
      l: `${c.section.label} · ${c.subject.name}`,
      sub: c.students
        ? tr('ui.web.tch.hw.students', { n: c.students })
        : tr('ui.web.tch.hw.noStudentsShort'),
    })),
  );
  /** Homework is due after today; classwork may be due today. */
  protected readonly minDue = computed(() =>
    this.kind() === 'HOMEWORK' ? addDays(today(), 1) : today(),
  );

  protected setPair(v: string) {
    this.pair.set(v);
    this.clear('class');
    if (this.who() === 'some') void this.loadRoster();
  }

  protected setWho(w: 'all' | 'some') {
    this.who.set(w);
    this.clear('students');
    if (w === 'some') void this.loadRoster();
  }

  /** The chosen section's students; choices are kept only for the same section. */
  private async loadRoster() {
    const sid = this.pair().split('|')[0] ?? '';
    if (!sid || sid === this.rosterOf) return;
    this.rosterOf = sid;
    this.roster.set(null);
    this.rosterError.set('');
    this.picked.set(this.none);
    try {
      const r = await this.classes.roster(sid);
      if (this.rosterOf === sid) this.roster.set(r.items);
    } catch (e) {
      if (this.rosterOf === sid) {
        this.rosterError.set(problemText(e));
        this.rosterOf = '';
      }
    }
  }

  protected toggle(id: string) {
    const next = new Set(this.picked());
    if (!next.delete(id)) next.add(id);
    this.picked.set(next);
    this.clear('students');
  }

  protected pickShown() {
    this.picked.set(new Set([...this.picked(), ...this.shown().map((s) => s.id)]));
    this.clear('students');
  }

  protected setKind(k: HomeworkKind) {
    this.kind.set(k);
    if (this.due() < this.minDue()) this.due.set(this.minDue());
    this.clear('dueDate');
  }

  protected err(f: Field) {
    return this.errors()[f] ?? '';
  }
  protected clear(f: Field) {
    this.errors.update((e) => ({ ...e, [f]: '' }));
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }

  /** A phrase spoken (speech to text) joins the instructions, within their 600 characters. */
  protected addSpoken(text: string) {
    const next = withPhrase(this.instructions(), text);
    if (next.length > MAX_INSTRUCTIONS) this.dictation()?.note(tr('ui.web.dictate.full'));
    this.instructions.set(next.slice(0, MAX_INSTRUCTIONS));
    this.clear('instructions');
  }
  protected kb(n: number) {
    return n < 1024 * 1024
      ? `${Math.max(1, Math.round(n / 1024))} KB`
      : `${(n / 1048576).toFixed(1)} MB`;
  }

  protected pick(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0] ?? null;
    input.value = '';
    this.clear('file');
    if (!f) return;
    if (f.size > MAX_BYTES) return this.fail('file', tr('ui.web.tch.hw.fileBig'));
    if (!TYPES.test(f.name)) return this.fail('file', tr('ui.web.tch.hw.fileType'));
    this.file.set(f);
  }

  private fail(f: Field, msg: string) {
    this.errors.update((e) => ({ ...e, [f]: msg }));
  }

  /** The server's own rules, checked before sending. */
  private check() {
    const e: Partial<Record<Field, string>> = {};
    const title = this.title().trim();
    const instructions = this.instructions().trim();
    if (!this.pair()) e.class = tr('ui.web.tch.hw.needClass');
    else {
      // Homework goes to the section's students of the year: none enrolled, nobody to set it for.
      const [sid, subId] = this.pair().split('|');
      const c = this.choices().find((x) => x.section.id === sid && x.subject.id === subId);
      if (c && !c.students) e.class = tr('ui.web.tch.hw.noStudents', { section: c.section.label });
    }
    if (this.who() === 'some' && this.pair() && !this.picked().size) {
      e.students = tr('ui.web.tch.hw.needStudents');
    }
    if (title.length < 3 || title.length > 80) e.title = tr('ACA.HW_TITLE');
    if (instructions.length < 10 || instructions.length > 600) {
      e.instructions = tr('ACA.HW_INSTRUCTIONS');
    }
    if (!this.due()) e.dueDate = tr('VALIDATION.DATE');
    else if (this.due() < this.minDue()) {
      e.dueDate = tr(this.kind() === 'HOMEWORK' ? 'ACA.DUE_IN_PAST' : 'ACA.CLASSWORK_DUE');
    }
    if (this.file() && this.link().trim()) e.link = tr('ui.web.tch.hw.oneMaterial');
    this.errors.set(e);
    return Object.values(e).every((v) => !v);
  }

  protected async send() {
    if (this.busy() || !this.check()) return;
    const [classSectionId, subjectId] = this.pair().split('|') as [string, string];
    this.busy.set(true);
    this.error.set('');
    try {
      const f = this.file();
      const fileId = f ? (await this.api.upload(f)).fileId : null;
      const out = await this.api.setHomework({
        classSectionId,
        subjectId,
        type: this.kind(),
        title: this.title().trim(),
        instructions: this.instructions().trim(),
        dueDate: this.due(),
        fileId,
        link: this.link().trim() || null,
        ...(this.who() === 'some' ? { studentIds: [...this.picked()] } : {}),
      });
      this.overlays.toast(tr('ui.web.tch.hw.sent'), {
        sub: tr('ui.web.tch.hw.sentSub', { section: out.section.label, subject: out.subject.name }),
      });
      this.saved.emit(out);
    } catch (e) {
      const fields = e instanceof ApiProblem ? e.errors : [];
      const placed = fields.filter((x) => FIELD_OF[x.field.split('.')[0]!]);
      for (const x of placed) {
        const f = FIELD_OF[x.field.split('.')[0]!]!;
        // Chosen students the server refused go under the list.
        const some = this.who() === 'some' && x.field.startsWith('studentIds');
        this.fail(some ? 'students' : f, x.message);
      }
      // The server's own words when no field takes them, not a generic "mandatory fields".
      if (!placed.length) this.error.set(fields[0]?.message || problemText(e));
    } finally {
      this.busy.set(false);
    }
  }
}
