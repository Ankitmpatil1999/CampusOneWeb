import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { problemText } from '../Structure/academic-format';
import { ExamsApi, type ExamName } from './exams.api';

/**
 * Add an exam name (prototype cc.exn.edit / cc.exn.save; ACA-038): 3–40 characters, unique in the
 * institution (any case). Names are shared by every year.
 */
@Component({
  selector: 'rp-exam-name-modal',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal title="Add an exam name" icon="award" [dismiss]="!busy()" (closed)="closed.emit()">
      <div class="stack g12">
        <div class="fld" [class.invalid]="error()">
          <label class="fld-l" for="en-n">Exam name<span class="req">*</span></label>
          <div class="fld-in">
            <input
              id="en-n"
              maxlength="40"
              autocomplete="off"
              placeholder="e.g. Unit Test 3"
              aria-describedby="en-n-e"
              [value]="name()"
              (input)="name.set(val($event)); error.set('')"
              (keydown.enter)="save()"
            />
          </div>
          <div class="fld-e" id="en-n-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ error() }}</span>
          </div>
        </div>
      </div>
      <div modal-foot class="cc-foot">
        <span class="grow"></span>
        <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="en-save"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="save()"
        >
          <span>Save</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class ExamNameModal {
  private readonly api = inject(ExamsApi);
  private readonly overlays = inject(Overlays);

  readonly names = input<readonly ExamName[]>([]);
  readonly closed = output<void>();
  readonly saved = output<ExamName>();

  protected readonly name = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }

  protected async save() {
    if (this.busy()) return;
    const n = this.name().trim();
    if (!n) return this.error.set(translate('VALIDATION.REQUIRED'));
    if (n.length < 3 || n.length > 40) return this.error.set(translate('ACA.EXAM_NAME'));
    if (this.names().some((x) => x.name.toLowerCase() === n.toLowerCase())) {
      return this.error.set(translate('ACA.EXAM_NAME_TAKEN', { name: n }));
    }
    this.busy.set(true);
    try {
      const out = await this.api.addName(n);
      this.overlays.toast('Exam name added', { sub: out.name });
      this.saved.emit(out);
    } catch (x) {
      this.error.set(x instanceof ApiProblem ? (x.errors[0]?.message ?? x.detail) : problemText(x));
    } finally {
      this.busy.set(false);
    }
  }
}
