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
import { formatDate, istBusinessDate } from '../../../Utils/format';
import { isRealDate } from '../../../Utils/patterns';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { appName } from './app-format';
import { ApplicationsApi, type Application } from './applications.api';

type Field = 'no' | 'dt' | 'due';

/**
 * The transfer certificate of a mid-term application (prototype cc.app.tc / cc.app.tc.save;
 * ADM-017, CR-14): the certificate received (its number and date of issue), or an undertaking
 * recorded with the date it will be produced. One of the two is needed before approval.
 */
@Component({
  selector: 'rp-transfer-certificate',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      title="Transfer certificate"
      [sub]="sub()"
      icon="filetext"
      cls="cm-m"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="tc-form">
        <div class="cc-radios" role="radiogroup" aria-label="Transfer certificate">
          <label class="chk"
            ><input
              type="radio"
              name="tc-k"
              value="TC"
              [checked]="kind() === 'TC'"
              (change)="kind.set('TC')"
            /><span>Certificate received</span></label
          >
          <label class="chk"
            ><input
              type="radio"
              name="tc-k"
              value="UNDERTAKING"
              [checked]="kind() === 'UNDERTAKING'"
              (change)="kind.set('UNDERTAKING')"
            /><span>Record an undertaking</span></label
          >
        </div>
        @if (kind() === 'TC') {
          <div class="c-form">
            <div class="fld" [class.invalid]="err('no')">
              <label class="fld-l" for="tc-no">Certificate number<span class="req">*</span></label>
              <div class="fld-in">
                <input
                  id="tc-no"
                  maxlength="40"
                  autocomplete="off"
                  aria-describedby="tc-no-e"
                  [value]="no()"
                  (input)="no.set(val($event)); clear('no')"
                />
              </div>
              <div class="fld-e" id="tc-no-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('no') }}</span>
              </div>
            </div>
            <div class="fld" [class.invalid]="err('dt')">
              <label class="fld-l" for="tc-dt">Date of issue<span class="req">*</span></label>
              <div class="fld-in">
                <input
                  id="tc-dt"
                  type="date"
                  aria-describedby="tc-dt-e"
                  [attr.max]="today"
                  [value]="dt()"
                  (input)="dt.set(val($event)); clear('dt')"
                  (change)="dt.set(val($event)); clear('dt')"
                />
              </div>
              <div class="fld-e" id="tc-dt-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('dt') }}</span>
              </div>
            </div>
          </div>
        } @else {
          <div class="fld" [class.invalid]="err('due')">
            <label class="fld-l" for="tc-due"
              >Certificate to be produced by<span class="req">*</span></label
            >
            <div class="fld-in">
              <input
                id="tc-due"
                type="date"
                aria-describedby="tc-due-e"
                [attr.min]="today"
                [value]="due()"
                (input)="due.set(val($event)); clear('due')"
                (change)="due.set(val($event)); clear('due')"
              />
            </div>
            <div class="fld-e" id="tc-due-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('due') }}</span>
            </div>
            <div class="fld-h">
              The family's undertaking is recorded against this application. An overdue undertaking
              is flagged here.
            </div>
          </div>
        }
        <p class="t-xs t-muted">
          The certificate is needed before approval; a recorded undertaking with a due date is the
          only exception.
        </p>
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
          id="tc-save"
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
export class TransferCertificate implements OnInit {
  private readonly api = inject(ApplicationsApi);
  private readonly overlays = inject(Overlays);

  readonly application = input.required<Application>();
  /** The choice the dialog opens on. */
  readonly mode = input<'TC' | 'UNDERTAKING'>('TC');
  readonly closed = output<void>();
  readonly saved = output<Application>();

  protected readonly today = istBusinessDate(new Date());
  protected readonly kind = signal<'TC' | 'UNDERTAKING'>('TC');
  protected readonly no = signal('');
  protected readonly dt = signal('');
  protected readonly due = signal('');
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected readonly sub = computed(() => {
    const a = this.application();
    return `${appName(a)}${a.joiningDate ? ` · joining ${formatDate(a.joiningDate)}` : ''}`;
  });

  ngOnInit() {
    this.kind.set(this.mode());
    const tc = this.application().tc;
    if (tc) {
      this.no.set(tc.number ?? '');
      this.dt.set(tc.date ?? '');
      this.due.set(tc.dueDate ?? '');
    }
  }

  protected err(f: Field) {
    return this.errors()[f] ?? '';
  }
  protected clear(f: Field) {
    if (this.errors()[f]) this.errors.update((e) => ({ ...e, [f]: '' }));
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }

  protected async save() {
    this.error.set('');
    const e: Partial<Record<Field, string>> = {};
    if (this.kind() === 'TC') {
      if (!this.no().trim()) e.no = 'Enter the certificate number';
      if (!this.dt()) e.dt = 'Enter the date of issue';
      else if (!isRealDate(this.dt())) e.dt = translate('VALIDATION.DATE');
      else if (this.dt() > this.today) e.dt = "The date of issue can't be in the future";
    } else if (!this.due()) {
      e.due = 'Enter the date the certificate will be produced';
    } else if (!isRealDate(this.due())) {
      e.due = translate('VALIDATION.DATE');
    } else if (this.due() <= this.today) {
      e.due = 'The due date must be after today';
    }
    this.errors.set(e);
    if (Object.values(e).some(Boolean)) return;
    this.busy.set(true);
    try {
      const out = await this.api.transferCertificate(
        this.application().id,
        this.kind() === 'TC'
          ? { mode: 'TC', number: this.no().trim(), date: this.dt() }
          : { mode: 'UNDERTAKING', dueDate: this.due() },
      );
      this.overlays.toast(this.kind() === 'TC' ? 'Certificate recorded' : 'Undertaking recorded', {
        sub: out.applicationNo,
      });
      this.saved.emit(out);
    } catch (x) {
      if (x instanceof ApiProblem && x.errors.length) {
        const f: Partial<Record<Field, string>> = {};
        for (const y of x.errors) {
          if (y.field === 'number') f.no = y.message;
          if (y.field === 'date') f.dt = y.message;
          if (y.field === 'dueDate') f.due = y.message;
        }
        this.errors.set(f);
        if (!Object.keys(f).length) this.error.set(x.detail);
      } else {
        this.error.set(x instanceof ApiProblem ? x.detail : translate('GEN.UNAVAILABLE'));
      }
    } finally {
      this.busy.set(false);
    }
  }
}
