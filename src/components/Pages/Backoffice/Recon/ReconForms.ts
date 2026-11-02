/**
 * The reconciliation forms that are not a mismatch: request a refund (REC-018), raise a chargeback
 * (REC-006) and record a chargeback's outcome (REC-007; prototype ob.rec.cbdone). Each validates as
 * the server does and shows the register's wording for what the server refuses.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { parseAmount } from '../../../Utils/money';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { amountText, cleanTyped } from '../../../Utils/typing';
import { inr } from '../Settlements/settlement-format';
import { REASON_CODES, reasonLabel } from './recon-format';
import { ReconApi, type Chargeback, type Refund } from './recon.api';

type Field = 'transactionRef' | 'amount' | 'reasonCode' | 'remarks';

/** Field errors of a refused request, or a form-level message. */
function mapProblem(e: unknown): { errors: Partial<Record<Field, string>>; form: string } {
  if (!(e instanceof ApiProblem)) return { errors: {}, form: translate('GEN.UNAVAILABLE') };
  const f = e.errors.find((x) =>
    ['transactionRef', 'amount', 'reasonCode', 'remarks', 'reason'].includes(x.field),
  );
  if (f) return { errors: { [f.field === 'reason' ? 'remarks' : f.field]: f.message }, form: '' };
  if (e.code === 'REC.TXN_UNKNOWN') return { errors: { transactionRef: e.detail }, form: '' };
  if (e.code === 'REC.AMOUNT_ABOVE') return { errors: { amount: e.detail }, form: '' };
  return { errors: {}, form: e.detail };
}

/** Request a refund, or raise a chargeback, for a transaction reference. */
@Component({
  selector: 'rp-rec-new',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <rp-modal
      [title]="kind() === 'refund' ? 'Request a refund' : 'Raise a chargeback'"
      [sub]="
        kind() === 'refund'
          ? 'A payment or transfer between two wallets; another officer processes it.'
          : 'Against a movement that credited a wallet — once per movement.'
      "
      [icon]="kind() === 'refund' ? 'undo' : 'alert'"
      (closed)="closed.emit()"
    >
      <div class="stack g12">
        <div class="fld" [class.invalid]="err('transactionRef')">
          <label class="fld-l" for="ob-rn-ref"
            >Transaction reference<span class="req">*</span></label
          >
          <div class="fld-in">
            <input
              id="ob-rn-ref"
              type="text"
              autocomplete="off"
              maxlength="35"
              placeholder="e.g. PAY260929LLWNYZ1719"
              aria-describedby="ob-rn-ref-e"
              [value]="ref()"
              (input)="set('transactionRef', $event)"
            />
          </div>
          <div class="fld-e" id="ob-rn-ref-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('transactionRef') }}</span>
          </div>
        </div>
        <div
          [class.c-form]="kind() === 'chargeback'"
          [class.stack]="kind() === 'refund'"
          [class.g12]="kind() === 'refund'"
        >
          <div class="fld" [class.invalid]="err('amount')">
            <label class="fld-l" for="ob-rn-amt"
              >{{ kind() === 'refund' ? 'Refund amount' : 'Requested amount'
              }}<span class="opt">(optional)</span></label
            >
            <div class="fld-in">
              <span class="pre">₹</span
              ><input
                id="ob-rn-amt"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                maxlength="14"
                aria-describedby="ob-rn-amt-e ob-rn-amt-h"
                [value]="amount()"
                (input)="set('amount', $event)"
              />
            </div>
            <div class="fld-e" id="ob-rn-amt-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('amount') }}</span>
            </div>
            <div class="fld-h" id="ob-rn-amt-h">Leave empty for the transaction’s whole amount</div>
          </div>
          @if (kind() === 'chargeback') {
            <div class="fld" [class.invalid]="err('reasonCode')">
              <label class="fld-l" for="ob-rn-code">Reason code<span class="req">*</span></label>
              <div class="fld-in">
                <select
                  id="ob-rn-code"
                  aria-describedby="ob-rn-code-e"
                  (change)="code.set(value($event))"
                >
                  @for (r of codes; track r.v) {
                    <option [value]="r.v" [selected]="code() === r.v">{{ r.v }} · {{ r.l }}</option>
                  }
                </select>
              </div>
              <div class="fld-e" id="ob-rn-code-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('reasonCode') }}</span>
              </div>
            </div>
          }
        </div>
        @if (kind() === 'refund') {
          <div class="fld" [class.invalid]="err('remarks')">
            <label class="fld-l" for="ob-rn-why">Reason<span class="req">*</span></label>
            <div class="fld-in">
              <textarea
                id="ob-rn-why"
                rows="2"
                maxlength="500"
                placeholder="e.g. Canteen charged ₹15 above the menu price"
                aria-describedby="ob-rn-why-e"
                [value]="remarks()"
                (input)="set('remarks', $event)"
              ></textarea>
            </div>
            <div class="fld-e" id="ob-rn-why-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('remarks') }}</span>
            </div>
          </div>
        }
        @if (formError()) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ formError() }}</div>
          </div>
        }
      </div>
      <ng-container modal-foot>
        <button type="button" class="btn btn-sec" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="ob-rn-go"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="save()"
        >
          <rp-icon name="check" [size]="17" /><span>{{
            kind() === 'refund' ? 'Request refund' : 'Raise chargeback'
          }}</span>
        </button>
      </ng-container>
    </rp-modal>
  `,
})
export class ReconNew {
  private readonly api = inject(ReconApi);
  readonly kind = input.required<'refund' | 'chargeback'>();
  readonly closed = output<void>();
  readonly created = output<Refund | Chargeback>();

  protected readonly codes = REASON_CODES;
  protected readonly ref = signal('');
  protected readonly amount = signal('');
  protected readonly code = signal(REASON_CODES[0]!.v);
  protected readonly remarks = signal('');
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly formError = signal('');
  protected readonly busy = signal(false);

  protected err(k: Field) {
    return this.errors()[k] ?? '';
  }
  protected set(k: Field, e: Event) {
    // The amount takes numbers only (client 2026-10-14).
    const el = e.target as HTMLInputElement;
    const v = k === 'amount' ? cleanTyped(el, amountText) : el.value;
    ({
      transactionRef: this.ref,
      amount: this.amount,
      reasonCode: this.code,
      remarks: this.remarks,
    })[k].set(v);
    this.errors.set({ ...this.errors(), [k]: '' });
    this.formError.set('');
  }
  protected value(e: Event) {
    return (e.target as HTMLSelectElement).value;
  }

  protected async save() {
    if (this.busy()) return;
    const errors: Partial<Record<Field, string>> = {};
    const ref = this.ref().trim().toUpperCase();
    if (!ref) errors.transactionRef = translate('REC.REFERENCE_REQUIRED');
    let amount: string | undefined;
    const a = this.amount().trim().replace(/,/g, '');
    if (a) {
      try {
        amount = (parseAmount(a) / 100).toFixed(2);
      } catch {
        errors.amount = translate('VALIDATION.AMOUNT');
      }
    }
    const remarks = this.remarks().trim();
    if (this.kind() === 'refund' && (remarks.length < 3 || remarks.length > 500)) {
      errors.remarks = translate('REC.REMARKS');
    }
    this.errors.set(errors);
    if (Object.values(errors).some(Boolean)) return;
    this.busy.set(true);
    try {
      const out =
        this.kind() === 'refund'
          ? await this.api.requestRefund({
              transactionRef: ref,
              reason: remarks,
              ...(amount ? { amount } : {}),
            })
          : await this.api.raiseChargeback({
              transactionRef: ref,
              reasonCode: this.code(),
              ...(amount ? { amount } : {}),
            });
      this.created.emit(out);
    } catch (e) {
      const p = mapProblem(e);
      this.errors.set(p.errors);
      this.formError.set(p.form);
    } finally {
      this.busy.set(false);
    }
  }
}

/** Record a chargeback's outcome: reversed through the ledger, or upheld (a won dispute). */
@Component({
  selector: 'rp-rec-cb-complete',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <rp-modal
      title="Record the outcome"
      [sub]="c().originalReference + ' · ' + money(c().amount) + ' · ' + codeText()"
      (closed)="closed.emit()"
    >
      <div class="stack g12">
        <div class="stack g8" role="radiogroup" aria-label="Outcome">
          @for (o of outcomes(); track o.v) {
            <div
              class="choice"
              [class.on]="outcome() === o.v"
              tabindex="0"
              role="radio"
              [attr.aria-checked]="outcome() === o.v"
              (click)="outcome.set(o.v)"
              (keydown.enter)="outcome.set(o.v)"
              (keydown.space)="$event.preventDefault(); outcome.set(o.v)"
            >
              <span class="grow"
                ><span class="t-h4" style="display: block">{{ o.title }}</span
                ><span class="t-sm t-muted" style="display: block; margin-top: 1px">{{
                  o.sub
                }}</span></span
              ><span class="radio"></span>
            </div>
          }
        </div>
        <div class="fld" [class.invalid]="err()">
          <label class="fld-l" for="ob-cbd-note">Outcome<span class="req">*</span></label>
          <div class="fld-in">
            <textarea
              id="ob-cbd-note"
              rows="2"
              maxlength="500"
              placeholder="e.g. Scheme accepted — refund issued"
              aria-describedby="ob-cbd-note-e"
              [value]="remarks()"
              (input)="remarks.set(value($event)); err.set('')"
            ></textarea>
          </div>
          <div class="fld-e" id="ob-cbd-note-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err() }}</span>
          </div>
        </div>
        @if (formError()) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ formError() }}</div>
          </div>
        }
      </div>
      <ng-container modal-foot>
        <button type="button" class="btn btn-sec" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="ob-cbd-go"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="save()"
        >
          <rp-icon name="check" [size]="17" /><span>Mark completed</span>
        </button>
      </ng-container>
    </rp-modal>
  `,
})
export class ChargebackComplete {
  private readonly api = inject(ReconApi);
  private readonly overlays = inject(Overlays);
  readonly c = input.required<Chargeback>();
  readonly closed = output<void>();
  readonly completed = output<Chargeback>();
  readonly stale = output<void>();

  protected readonly outcome = signal<'REVERSED' | 'UPHELD'>('REVERSED');
  protected readonly remarks = signal('');
  protected readonly err = signal('');
  protected readonly formError = signal('');
  protected readonly busy = signal(false);
  protected readonly codeText = computed(() => {
    const l = reasonLabel(this.c().reasonCode);
    return l ? `${l} (${this.c().reasonCode})` : `Reason code ${this.c().reasonCode}`;
  });
  protected readonly outcomes = computed(() => {
    const list: { v: 'REVERSED' | 'UPHELD'; title: string; sub: string }[] = [
      {
        v: 'REVERSED',
        title: 'Reversed',
        sub: `${inr(this.c().amount)} is taken from ${this.c().wallet.name}’s wallet to the chargeback clearing account (a new ledger entry)`,
      },
    ];
    if (this.c().status === 'DISPUTED') {
      list.push({ v: 'UPHELD', title: 'Upheld', sub: 'The dispute was won — nothing moves' });
    }
    return list;
  });

  protected async save() {
    if (this.busy()) return;
    const remarks = this.remarks().trim();
    if (remarks.length < 3 || remarks.length > 500) {
      this.err.set(translate('REC.REMARKS'));
      return;
    }
    this.busy.set(true);
    try {
      this.completed.emit(await this.api.completeChargeback(this.c(), this.outcome(), remarks));
    } catch (e) {
      if (
        e instanceof ApiProblem &&
        (e.status === 412 || e.status === 428 || e.code === 'REC.TRANSITION_INVALID')
      ) {
        this.overlays.toast('Not completed', { sub: e.detail, tone: 'bad' });
        this.stale.emit();
        return;
      }
      const p = mapProblem(e);
      if (p.errors.remarks) this.err.set(p.errors.remarks);
      else this.formError.set(p.form || Object.values(p.errors)[0] || '');
    } finally {
      this.busy.set(false);
    }
  }

  protected money(a: { amount: string }) {
    return inr(a);
  }
  protected value(e: Event) {
    return (e.target as HTMLTextAreaElement).value;
  }
}
