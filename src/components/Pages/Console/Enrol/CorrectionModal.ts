import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { person } from '../Applications/app-format';
import { problemText } from '../Structure/academic-format';
import type { AcademicYear } from '../Structure/academic-year';
import { SearchSelect } from '../../../Shared/SearchSelect';
import type { ClassView } from '../Structure/structure.api';
import { EnrolmentsApi, type CorrectionResult, type Enrolment } from './enrolments.api';

/**
 * Ask to correct an enrolment of a closed year (prototype cc.en.corr; ACA-030; CR-13, OI-ACA-60):
 * the right class-section and the reason with its evidence (10–500). The year stays closed: the
 * administrator approves the request in Approvals and it is recorded as an adjustment — unless an
 * Institution Administrator's own request applies directly (ADR-0015).
 */
@Component({
  selector: 'rp-correction-modal',
  imports: [Icon, Modal, SearchSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      title="Request a correction"
      [sub]="sub()"
      icon="edit"
      [narrow]="false"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="cr-body">
        <div class="note tone-info">
          <rp-icon name="lock" [size]="17" />
          <div class="grow">
            The year stays closed. The correction is recorded as an adjustment against
            {{ year().label }} once the institution administrator approves it.
          </div>
        </div>
        @if (error()) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ error() }}</div>
          </div>
        }
        <div class="fld" [class.invalid]="err('k')">
          <label class="fld-l" for="cr-k-b"
            >Correct grade and section to<span class="req">*</span></label
          >
          <rp-search-select
            inputId="cr-k"
            placeholder="Choose"
            [options]="sectionOptions()"
            [value]="sectionId()"
            (changed)="sectionId.set($event); clear('k')"
          />
          <div class="fld-e" id="cr-k-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('k') }}</span>
          </div>
        </div>
        <div class="fld" [class.invalid]="err('r')">
          <label class="fld-l" for="cr-r">Reason and evidence<span class="req">*</span></label>
          <div class="fld-in">
            <textarea
              id="cr-r"
              rows="3"
              maxlength="500"
              placeholder="e.g. Register shows 6 B from July 2025; entered as 6 A in error"
              aria-describedby="cr-r-e"
              [value]="reason()"
              (input)="reason.set(val($event)); clear('r')"
            ></textarea>
          </div>
          <div class="fld-e" id="cr-r-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('r') }}</span>
          </div>
        </div>
      </div>
      <div modal-foot class="cc-foot">
        <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="cr-go"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="send()"
        >
          <rp-icon name="send" [size]="17" /><span>Send for approval</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class CorrectionModal {
  private readonly api = inject(EnrolmentsApi);
  private readonly overlays = inject(Overlays);

  readonly enrolment = input.required<Enrolment>();
  readonly classes = input.required<readonly ClassView[]>();
  readonly year = input.required<AcademicYear>();
  readonly closed = output<void>();
  readonly sent = output<CorrectionResult>();

  protected readonly sectionId = signal('');
  protected readonly reason = signal('');
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected readonly sub = computed(() => {
    const e = this.enrolment();
    return `${person(e.student.name)} · ${e.class.name} ${e.section.name} · ${this.year().label} (closed)`;
  });
  protected readonly sectionOptions = computed<DropdownOption[]>(() =>
    [...this.classes()]
      .sort((a, b) => a.order - b.order)
      .flatMap((c) => c.sections.map((s) => ({ v: s.id, l: `${c.name} ${s.name}` })))
      .filter((o) => o.v !== this.enrolment().section.id),
  );

  protected err(k: string) {
    return this.errors()[k] ?? '';
  }
  protected clear(k: string) {
    this.error.set('');
    if (!this.errors()[k]) return;
    const e = { ...this.errors() };
    delete e[k];
    this.errors.set(e);
  }
  protected val(e: Event) {
    return (e.target as HTMLTextAreaElement).value;
  }

  protected async send() {
    if (this.busy()) return;
    const e: Record<string, string> = {};
    if (!this.sectionId()) e['k'] = translate('VALIDATION.REQUIRED');
    const r = this.reason().trim();
    if (r.length < 10 || r.length > 500) e['r'] = translate('ACA.REASON', { min: 10, max: 500 });
    this.errors.set(e);
    if (Object.keys(e).length) return;
    this.busy.set(true);
    try {
      const out = await this.api.correct({
        enrolmentId: this.enrolment().id,
        sectionId: this.sectionId(),
        reason: r,
      });
      const to = this.sectionOptions().find((o) => o.v === this.sectionId())?.l ?? '';
      if (out.appliedDirectly) {
        this.overlays.toast('Correction applied', {
          sub: `${person(this.enrolment().student.name)} · ${to} · recorded against ${this.year().label}`,
        });
      } else {
        this.overlays.toast('Correction sent for approval', {
          sub: 'Academics · the administrator decides in Approvals',
        });
      }
      this.sent.emit(out);
    } catch (x) {
      if (x instanceof ApiProblem && x.errors.some((f) => f.field === 'reason')) {
        this.errors.set({ r: x.errors.find((f) => f.field === 'reason')!.message });
      } else this.error.set(problemText(x));
    } finally {
      this.busy.set(false);
    }
  }
}
