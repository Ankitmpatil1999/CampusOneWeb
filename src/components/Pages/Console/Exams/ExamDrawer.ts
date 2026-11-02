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
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate, formatDateTime } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { plural } from '../Fees/fee-format';
import { problemText } from '../Structure/academic-format';
import type { AcademicYear } from '../Structure/academic-year';
import {
  createdMarks,
  dlong,
  examDate,
  examTimes,
  held,
  marksChip,
  marksError,
  scheduleChip,
} from './exam-format';
import { ExamsApi, type Exam } from './exams.api';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * One exam (prototype cc.ex.open; ACA-034/036/040): its date and time, maximum and pass marks,
 * schedule, marks progress and subject teachers. The date, time and marks can change (marks only
 * while none are saved), an exam without marks can be withdrawn, and saved marks awaiting
 * validation are validated here. The console reads progress only; teachers enter the marks.
 */
@Component({
  selector: 'rp-exam-drawer',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @let e = exam();
    <rp-modal
      [title]="e.name.name + ' · ' + e.subject.name"
      [sub]="e.section.label + ' · ' + examDate(e) + ' · ' + e.year.label"
      icon="award"
      [drawer]="true"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="ex-body">
        @if (readOnly()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow">{{ readOnly() }}</div>
          </div>
        }
        @if (err('form')) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ err('form') }}</div>
          </div>
        }
        @if (!editing()) {
          <dl class="kv" id="ex-kv">
            <dt>Date</dt>
            <dd>
              {{ e.date ? dlong(e.date) : 'Date to be set' }}{{ times(e) ? ' · ' + times(e) : '' }}
            </dd>
            <dt>Maximum marks</dt>
            <dd>{{ e.maxMarks }}</dd>
            <dt>Pass marks</dt>
            <dd>{{ e.passMarks }}</dd>
            <dt>Schedule</dt>
            <dd>
              <span [class]="'chip dot tone-' + schedule().tone">{{ schedule().l }}</span>
            </dd>
            <dt>Marks</dt>
            <dd>
              <span [class]="'chip dot tone-' + chip().tone">{{ chip().l }}</span>
              @if (chip().n) {
                {{ chip().n }} of {{ chip().of }} students
              }
            </dd>
            <dt>Subject teachers</dt>
            <dd>{{ teachers().length ? teachers().join(', ') : 'None assigned' }}</dd>
          </dl>

          @if (e.marks.entered) {
            <div class="fs">
              <h4><rp-icon name="list" [size]="16" />Marks</h4>
              <div class="fs-b stack g12">
                <div class="c-grid k3">
                  <div class="cm-tile">
                    <span>Saved</span
                    ><b class="t-num">{{ e.marks.entered }} of {{ e.marks.students }}</b>
                  </div>
                  <div class="cm-tile">
                    <span>Valid</span><b class="t-num">{{ e.marks.valid }}</b>
                  </div>
                  <div class="cm-tile">
                    <span>Awaiting validation</span><b class="t-num">{{ created() }}</b>
                  </div>
                </div>
                <p class="t-xs t-muted">
                  {{
                    e.published
                      ? 'Published to students and parents on ' + when(e.published.at) + '.'
                      : 'Subject teachers enter and publish marks from the teacher portal; validated marks appear on report cards.'
                  }}
                </p>
              </div>
            </div>
          } @else {
            <div class="card pad">
              <div class="empty">
                <div class="empty-ic"><rp-icon name="award" [size]="26" /></div>
                <h4>{{ isHeld() ? 'No marks uploaded yet' : 'Not held yet' }}</h4>
                <p>
                  {{
                    isHeld()
                      ? 'Subject teachers upload marks from the teacher portal.'
                      : e.date
                        ? 'Scheduled for ' + date(e.date) + '.'
                        : 'Set the date to put the exam on the schedule.'
                  }}
                </p>
              </div>
            </div>
          }
        } @else {
          @if (e.marks.entered) {
            <div class="note tone-info">
              <rp-icon name="info" [size]="17" />
              <div class="grow">{{ hasMarks }}</div>
            </div>
          }
          <div class="c-form" id="ex-form">
            <div class="fld full" [class.invalid]="err('d')">
              <label class="fld-l" for="ex-d">Date<span class="req">*</span></label>
              <div class="fld-in">
                <input
                  id="ex-d"
                  type="date"
                  aria-describedby="ex-d-e"
                  [min]="year().startsOn"
                  [max]="year().endsOn"
                  [value]="d()"
                  (input)="d.set(val($event)); clear('d')"
                />
              </div>
              <div class="fld-e" id="ex-d-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('d') }}</span>
              </div>
            </div>
            <div class="fld" [class.invalid]="err('st')">
              <label class="fld-l" for="ex-st">Starts<span class="req">*</span></label>
              <div class="fld-in">
                <input
                  id="ex-st"
                  type="time"
                  aria-describedby="ex-st-e"
                  [value]="st()"
                  (input)="st.set(val($event)); clear('st')"
                />
              </div>
              <div class="fld-e" id="ex-st-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('st') }}</span>
              </div>
            </div>
            <div class="fld" [class.invalid]="err('et')">
              <label class="fld-l" for="ex-et">Ends<span class="req">*</span></label>
              <div class="fld-in">
                <input
                  id="ex-et"
                  type="time"
                  aria-describedby="ex-et-e"
                  [value]="et()"
                  (input)="et.set(val($event)); clear('et')"
                />
              </div>
              <div class="fld-e" id="ex-et-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('et') }}</span>
              </div>
            </div>
            <div class="fld" [class.invalid]="err('max')">
              <label class="fld-l" for="ex-max">Maximum marks<span class="req">*</span></label>
              <div class="fld-in">
                <input
                  id="ex-max"
                  inputmode="numeric"
                  maxlength="4"
                  aria-describedby="ex-max-e"
                  [disabled]="!!e.marks.entered"
                  [value]="max()"
                  (input)="max.set(val($event)); clear('max')"
                />
              </div>
              <div class="fld-e" id="ex-max-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('max') }}</span>
              </div>
            </div>
            <div class="fld" [class.invalid]="err('pass')">
              <label class="fld-l" for="ex-pass">Pass marks<span class="req">*</span></label>
              <div class="fld-in">
                <input
                  id="ex-pass"
                  inputmode="numeric"
                  maxlength="4"
                  aria-describedby="ex-pass-e"
                  [disabled]="!!e.marks.entered"
                  [value]="pass()"
                  (input)="pass.set(val($event)); clear('pass')"
                />
              </div>
              <div class="fld-e" id="ex-pass-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('pass') }}</span>
              </div>
            </div>
          </div>
          <p class="t-xs t-muted">Students and parents see the new date on their schedule.</p>
        }
      </div>
      <div modal-foot class="cc-foot">
        @if (editing()) {
          <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="cancelEdit()">
            <span>Cancel</span>
          </button>
          <button
            type="button"
            class="btn btn-pri"
            id="ex-save"
            [class.is-busy]="busy()"
            [disabled]="busy()"
            (click)="save()"
          >
            <rp-icon name="check" [size]="17" /><span>Save changes</span>
          </button>
        } @else {
          @if (!readOnly() && !e.marks.entered) {
            <button
              type="button"
              class="btn btn-danger-o"
              id="ex-withdraw"
              [disabled]="busy()"
              (click)="withdraw()"
            >
              <rp-icon name="trash" [size]="17" /><span>Withdraw exam</span>
            </button>
          }
          <span class="grow"></span>
          @if (!readOnly() && created() > 0) {
            <button
              type="button"
              class="btn btn-soft"
              id="ex-validate"
              [class.is-busy]="busy()"
              [disabled]="busy()"
              (click)="validate()"
            >
              <rp-icon name="checkc" [size]="17" /><span>Validate marks</span>
            </button>
          }
          @if (!readOnly()) {
            <button
              type="button"
              class="btn btn-sec"
              id="ex-edit"
              [disabled]="busy()"
              (click)="startEdit()"
            >
              <rp-icon name="edit" [size]="17" /><span>Change</span>
            </button>
          }
          <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="closed.emit()">
            <span>Close</span>
          </button>
        }
      </div>
    </rp-modal>
  `,
})
export class ExamDrawer implements OnInit {
  private readonly api = inject(ExamsApi);
  private readonly overlays = inject(Overlays);

  readonly exam = input.required<Exam>();
  readonly year = input.required<AcademicYear>();
  /** The subject teachers of the exam's class-section (teacher assignments). */
  readonly teachers = input<readonly string[]>([]);
  /** Why the exam can't change ('' when it can): the role or a closed year. */
  readonly readOnly = input('');
  readonly closed = output<void>();
  /** The exam as it is now (changed, validated) — or null when withdrawn. */
  readonly changed = output<Exam | null>();
  /** Someone changed the exam meanwhile: reload the page. */
  readonly stale = output<void>();

  protected readonly dlong = dlong;
  protected readonly examDate = examDate;
  protected readonly hasMarks = translate('ACA.EXAM_HAS_MARKS');
  protected readonly editing = signal(false);
  protected readonly busy = signal(false);
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly d = signal('');
  protected readonly st = signal('');
  protected readonly et = signal('');
  protected readonly max = signal('');
  protected readonly pass = signal('');

  protected readonly schedule = computed(() => scheduleChip(this.exam()));
  protected readonly chip = computed(() => marksChip(this.exam()));
  protected readonly isHeld = computed(() => held(this.exam()));
  protected readonly created = computed(() => createdMarks(this.exam()));

  ngOnInit() {
    this.fill();
  }

  private fill() {
    const e = this.exam();
    this.d.set(e.date ?? '');
    this.st.set(e.startTime ?? '');
    this.et.set(e.endTime ?? '');
    this.max.set(String(e.maxMarks));
    this.pass.set(String(e.passMarks));
  }

  protected times(e: Exam) {
    return examTimes(e);
  }
  protected date(d: string) {
    return formatDate(d);
  }
  protected when(iso: string) {
    return formatDateTime(iso);
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

  protected startEdit() {
    if (this.readOnly()) return;
    this.fill();
    this.errors.set({});
    this.editing.set(true);
  }
  protected cancelEdit() {
    this.errors.set({});
    this.editing.set(false);
  }

  private validateForm(): Record<string, string> {
    const e: Record<string, string> = {};
    const y = this.year();
    const req = translate('VALIDATION.REQUIRED');
    const d = this.d();
    if (!d) e['d'] = req;
    else if (d < y.startsOn || d > y.endsOn) {
      e['d'] = translate('ACA.DATE_OUTSIDE_YEAR', {
        label: y.label,
        from: formatDate(y.startsOn),
        to: formatDate(y.endsOn),
      });
    }
    if (!TIME.test(this.st())) e['st'] = req;
    if (!TIME.test(this.et())) e['et'] = req;
    else if (!e['st'] && this.et() <= this.st()) e['et'] = translate('ACA.CAL_TIMES');
    if (!this.exam().marks.entered) {
      const m = marksError(this.max(), this.pass());
      if (m.max) e['max'] = m.max;
      if (m.pass) e['pass'] = m.pass;
    }
    return e;
  }

  protected async save() {
    if (this.busy() || this.readOnly()) return;
    const e = this.validateForm();
    this.errors.set(e);
    if (Object.keys(e).length) return;
    const x = this.exam();
    this.busy.set(true);
    try {
      const out = await this.api.change(x.id, x.version, {
        date: this.d(),
        startTime: this.st(),
        endTime: this.et(),
        ...(x.marks.entered
          ? {}
          : { maxMarks: Number(this.max()), passMarks: Number(this.pass()) }),
      });
      this.overlays.toast('Exam updated', {
        sub: `${out.name.name} · ${out.section.label} · ${out.subject.name} · ${examDate(out)}`,
      });
      this.editing.set(false);
      this.changed.emit(out);
    } catch (p) {
      this.fail(p);
    } finally {
      this.busy.set(false);
    }
  }

  protected async withdraw() {
    const x = this.exam();
    if (this.busy() || this.readOnly() || x.marks.entered) return;
    const ok = await this.overlays.confirm({
      title: `Withdraw ${x.name.name} ${x.subject.name} for ${x.section.label}?`,
      text: 'The exam leaves the schedule of the class-section, its students and their parents. It can’t be brought back; create it again if needed.',
      ok: 'Withdraw exam',
      tone: 'bad',
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      await this.api.change(x.id, x.version, { withdraw: true });
      this.overlays.toast('Exam withdrawn', {
        sub: `${x.name.name} · ${x.section.label} · ${x.subject.name}`,
      });
      this.changed.emit(null);
    } catch (p) {
      this.fail(p);
    } finally {
      this.busy.set(false);
    }
  }

  protected async validate() {
    const x = this.exam();
    if (this.busy() || this.readOnly()) return;
    const n = createdMarks(x);
    const ok = await this.overlays.confirm({
      title: `Validate ${x.name.name} ${x.subject.name} marks for ${x.section.label}?`,
      text: `${plural(n, 'mark')} become Valid and appear on report cards for students and parents.`,
      ok: 'Validate marks',
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      const out = await this.api.validate(x.id);
      this.overlays.toast('Marks validated', {
        sub: `${out.name.name} · ${out.section.label} · ${out.subject.name} · ${plural(n, 'mark')}`,
      });
      this.changed.emit(out);
    } catch (p) {
      this.fail(p);
    } finally {
      this.busy.set(false);
    }
  }

  private fail(p: unknown) {
    if (p instanceof ApiProblem && (p.status === 412 || p.status === 428)) {
      this.stale.emit();
      this.errors.set({ form: problemText(p) });
      return;
    }
    if (p instanceof ApiProblem && p.errors.length && this.editing()) {
      const out: Record<string, string> = {};
      for (const f of p.errors) {
        const k = f.field.endsWith('date')
          ? 'd'
          : f.field.endsWith('endTime')
            ? 'et'
            : f.field.endsWith('startTime')
              ? 'st'
              : f.field === 'exam' || f.field.endsWith('Marks')
                ? 'max'
                : 'form';
        out[k] ??= f.message;
      }
      this.errors.set(out);
      return;
    }
    this.errors.set({ form: problemText(p) });
  }
}
