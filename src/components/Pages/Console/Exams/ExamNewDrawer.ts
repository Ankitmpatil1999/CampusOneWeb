import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  type OnInit,
} from '@angular/core';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { problemText } from '../Structure/academic-format';
import type { AcademicYear } from '../Structure/academic-year';
import { SearchSelect } from '../../../Shared/SearchSelect';
import { StructureApi, type ClassView } from '../Structure/structure.api';
import { marksError } from './exam-format';
import { ExamsApi, type Exam, type ExamName } from './exams.api';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Create an exam (prototype cc.ex.new / cc.ex.cls / cc.ex.save; ACA-035): an exam name for one
 * class-section and one of the subjects mapped to its class, with the date inside the year, the
 * start and end time and the maximum and pass marks. One exam per name, class-section and subject
 * in a year.
 */
@Component({
  selector: 'rp-exam-new',
  imports: [Dropdown, Icon, Modal, SearchSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      title="Create an exam"
      [sub]="year().label + ' · one exam per name, class-section and subject'"
      icon="award"
      [drawer]="true"
      [slim]="true"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16">
        @if (err('form')) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ err('form') }}</div>
          </div>
        }
        <div class="c-form">
          <div class="fld full" [class.invalid]="err('n')">
            <label class="fld-l" for="xe-n-b">Exam name<span class="req">*</span></label>
            <rp-dd
              inputId="xe-n"
              placeholder="Choose"
              [options]="nameOptions()"
              [value]="nameId()"
              (changed)="nameId.set($event); clear('n')"
            />
            <div class="fld-e" id="xe-n-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('n') }}</span>
            </div>
          </div>
          <div class="fld full" [class.invalid]="err('k')">
            <label class="fld-l" for="xe-k-b">Class-section<span class="req">*</span></label>
            <rp-search-select
              inputId="xe-k"
              placeholder="Choose"
              empty="No class-sections yet"
              [options]="sectionOptions()"
              [value]="sectionId()"
              (changed)="pickSection($event)"
            />
            <div class="fld-e" id="xe-k-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('k') }}</span>
            </div>
          </div>
          <div class="fld full" [class.invalid]="err('s')">
            <label class="fld-l" for="xe-s-b">Subject<span class="req">*</span></label>
            <rp-dd
              inputId="xe-s"
              [placeholder]="
                !sectionId()
                  ? 'Choose a class-section first'
                  : loadingSubjects()
                    ? 'Loading subjects…'
                    : subjectOptions().length
                      ? 'Choose a subject'
                      : 'No subjects mapped to this class'
              "
              [disabled]="!sectionId() || !subjectOptions().length"
              [options]="subjectOptions()"
              [value]="subjectId()"
              (changed)="subjectId.set($event); clear('s')"
            />
            <div class="fld-e" id="xe-s-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('s') }}</span>
            </div>
          </div>
          <div class="fld full" [class.invalid]="err('d')">
            <label class="fld-l" for="xe-d">Date<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="xe-d"
                type="date"
                aria-describedby="xe-d-e"
                [min]="year().startsOn"
                [max]="year().endsOn"
                [value]="date()"
                (input)="date.set(val($event)); clear('d')"
              />
            </div>
            <div class="fld-e" id="xe-d-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('d') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('st')">
            <label class="fld-l" for="xe-st">Starts<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="xe-st"
                type="time"
                aria-describedby="xe-st-e"
                [value]="start()"
                (input)="start.set(val($event)); clear('st')"
              />
            </div>
            <div class="fld-e" id="xe-st-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('st') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('et')">
            <label class="fld-l" for="xe-et">Ends<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="xe-et"
                type="time"
                aria-describedby="xe-et-e"
                [value]="end()"
                (input)="end.set(val($event)); clear('et')"
              />
            </div>
            <div class="fld-e" id="xe-et-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('et') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('max')">
            <label class="fld-l" for="xe-max">Maximum marks<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="xe-max"
                inputmode="numeric"
                maxlength="4"
                aria-describedby="xe-max-e"
                [value]="max()"
                (input)="max.set(val($event)); clear('max')"
              />
            </div>
            <div class="fld-e" id="xe-max-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('max') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('pass')">
            <label class="fld-l" for="xe-pass">Pass marks<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="xe-pass"
                inputmode="numeric"
                maxlength="4"
                aria-describedby="xe-pass-e"
                [value]="pass()"
                (input)="pass.set(val($event)); clear('pass')"
              />
            </div>
            <div class="fld-e" id="xe-pass-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('pass') }}</span>
            </div>
          </div>
        </div>
        <p class="t-xs t-muted">
          Students and parents see the exam on their schedule once it's created.
        </p>
      </div>
      <div modal-foot class="cc-foot">
        <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="xe-save"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="save()"
        >
          <rp-icon name="check" [size]="17" /><span>Create exam</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class ExamNewDrawer implements OnInit {
  private readonly api = inject(ExamsApi);
  private readonly structure = inject(StructureApi);
  private readonly overlays = inject(Overlays);

  readonly year = input.required<AcademicYear>();
  readonly names = input.required<readonly ExamName[]>();
  readonly classes = input.required<readonly ClassView[]>();
  /** The year's exams (a duplicate is refused before saving). */
  readonly exams = input<readonly Exam[]>([]);
  readonly closed = output<void>();
  readonly saved = output<readonly Exam[]>();

  protected readonly nameId = signal('');
  protected readonly sectionId = signal('');
  protected readonly subjectId = signal('');
  protected readonly date = signal('');
  protected readonly start = signal('09:30');
  protected readonly end = signal('12:30');
  protected readonly max = signal('100');
  protected readonly pass = signal('35');
  protected readonly subjects = signal<readonly { id: string; name: string }[]>([]);
  protected readonly loadingSubjects = signal(false);
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly busy = signal(false);
  private seq = 0;

  protected readonly nameOptions = computed<DropdownOption[]>(() =>
    this.names().map((n) => ({ v: n.id, l: n.name })),
  );
  private readonly sections = computed(() =>
    [...this.classes()]
      .sort((a, b) => a.order - b.order)
      .flatMap((c) =>
        c.sections.map((s) => ({ id: s.id, classId: c.id, label: `${c.name} ${s.name}` })),
      ),
  );
  protected readonly sectionOptions = computed<DropdownOption[]>(() =>
    this.sections().map((s) => ({ v: s.id, l: s.label })),
  );
  protected readonly subjectOptions = computed<DropdownOption[]>(() =>
    this.subjects().map((s) => ({ v: s.id, l: s.name })),
  );

  ngOnInit() {
    const names = this.names();
    this.nameId.set((names.find((n) => n.name === 'Half-yearly') ?? names[0])?.id ?? '');
  }

  protected err(k: string) {
    return this.errors()[k] ?? '';
  }
  protected clear(k: string) {
    if (!this.errors()[k] && !this.errors()['form']) return;
    const e = { ...this.errors() };
    delete e[k];
    delete e['form'];
    this.errors.set(e);
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }

  /** cc.ex.cls: the subjects mapped to the chosen class-section's class (ACA-018). */
  protected async pickSection(id: string) {
    this.sectionId.set(id);
    this.subjectId.set('');
    this.subjects.set([]);
    this.clear('k');
    const s = this.sections().find((x) => x.id === id);
    if (!s) return;
    const n = ++this.seq;
    this.loadingSubjects.set(true);
    try {
      const r = await this.structure.classSubjects(s.classId);
      if (n === this.seq) this.subjects.set(r.subjects);
    } catch (x) {
      if (n === this.seq) this.errors.set({ ...this.errors(), s: problemText(x) });
    } finally {
      if (n === this.seq) this.loadingSubjects.set(false);
    }
  }

  private validate(): Record<string, string> {
    const e: Record<string, string> = {};
    const y = this.year();
    const req = translate('VALIDATION.REQUIRED');
    if (!this.nameId()) e['n'] = req;
    if (!this.sectionId()) e['k'] = req;
    if (!this.subjectId()) e['s'] = req;
    const d = this.date();
    if (!d) e['d'] = req;
    else if (d < y.startsOn || d > y.endsOn) {
      e['d'] = translate('ACA.DATE_OUTSIDE_YEAR', {
        label: y.label,
        from: formatDate(y.startsOn),
        to: formatDate(y.endsOn),
      });
    }
    if (!TIME.test(this.start())) e['st'] = req;
    if (!TIME.test(this.end())) e['et'] = req;
    else if (!e['st'] && this.end() <= this.start()) e['et'] = translate('ACA.CAL_TIMES');
    const m = marksError(this.max(), this.pass());
    if (m.max) e['max'] = m.max;
    if (m.pass) e['pass'] = m.pass;
    if (!e['n'] && !e['k'] && !e['s']) {
      const dup = this.exams().find(
        (x) =>
          x.name.id === this.nameId() &&
          x.section.id === this.sectionId() &&
          x.subject.id === this.subjectId(),
      );
      if (dup) {
        e['n'] = translate('ACA.EXAM_EXISTS', {
          exam: dup.name.name,
          subject: dup.subject.name,
          section: dup.section.label,
          year: y.label,
        });
      }
    }
    return e;
  }

  protected async save() {
    if (this.busy()) return;
    const e = this.validate();
    this.errors.set(e);
    if (Object.keys(e).length) return;
    this.busy.set(true);
    try {
      const r = await this.api.create({
        yearId: this.year().id,
        examNameId: this.nameId(),
        sectionIds: [this.sectionId()],
        items: [
          {
            subjectId: this.subjectId(),
            date: this.date(),
            startTime: this.start(),
            endTime: this.end(),
            maxMarks: Number(this.max()),
            passMarks: Number(this.pass()),
          },
        ],
      });
      const x = r.items[0];
      this.overlays.toast('Exam created', {
        sub: x
          ? `${x.name.name} · ${x.section.label} · ${x.subject.name} · ${formatDate(x.date ?? this.date())}`
          : '',
      });
      this.saved.emit(r.items);
    } catch (x) {
      this.errors.set(this.problemErrors(x));
    } finally {
      this.busy.set(false);
    }
  }

  private problemErrors(x: unknown): Record<string, string> {
    if (!(x instanceof ApiProblem)) return { form: problemText(x) };
    if (x.code === 'ACA.EXAM_EXISTS') return { n: x.detail };
    if (x.code === 'ACA.SUBJECT_NOT_MAPPED') return { s: x.detail };
    const out: Record<string, string> = {};
    for (const f of x.errors) {
      const k = f.field.endsWith('.date')
        ? 'd'
        : f.field.endsWith('.endTime')
          ? 'et'
          : f.field.endsWith('.startTime')
            ? 'st'
            : f.field.startsWith('items.') && f.field.split('.').length === 2
              ? 'max'
              : f.field.endsWith('.subjectId')
                ? 's'
                : f.field === 'examNameId'
                  ? 'n'
                  : 'form';
      out[k] ??= f.message;
    }
    return Object.keys(out).length ? out : { form: x.detail };
  }
}
