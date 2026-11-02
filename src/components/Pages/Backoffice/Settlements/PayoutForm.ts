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
import { formatDateTime } from '../../../Utils/format';
import { parseAmount } from '../../../Utils/money';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { amountText, cleanTyped } from '../../../Utils/typing';
import { inr, inrPaise, paiseOf } from './settlement-format';
import { SettlementsApi, type SettlementDetail } from './settlements.api';

/** The bank's UTR as the server takes it (STL.UTR_FORMAT). */
const UTR = /^[A-Z0-9]{16,22}$/;

type Field = 'utr' | 'amount';

/**
 * Record the bank payout reference (prototype ob.stl.payout; STL-006): the UTR, written once, and
 * the amount the bank paid, which must equal the net payable now (merchants suspended since the run
 * are carried forward). Each merchant's share is then posted through the ledger.
 */
@Component({
  selector: 'rp-stl-payout',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <rp-modal
      title="Record the bank payout reference"
      [sub]="sub()"
      icon="bank"
      (closed)="closed.emit()"
    >
      <div class="stack g12">
        <div class="fld" [class.invalid]="err('utr')">
          <label class="fld-l" for="ob-po-utr"
            >UTR (bank reference)<span class="req">*</span></label
          >
          <div class="fld-in">
            <input
              id="ob-po-utr"
              name="ob-po-utr"
              type="text"
              autocomplete="off"
              maxlength="22"
              placeholder="e.g. RPSBN48213377"
              aria-describedby="ob-po-utr-e"
              [value]="utr()"
              (input)="set('utr', $event)"
            />
          </div>
          <div class="fld-e" id="ob-po-utr-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('utr') }}</span>
          </div>
        </div>
        <div class="fld" [class.invalid]="err('amount')">
          <label class="fld-l" for="ob-po-amt">Amount paid out<span class="req">*</span></label>
          <div class="fld-in">
            <span class="pre">₹</span
            ><input
              id="ob-po-amt"
              name="ob-po-amt"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              maxlength="14"
              aria-describedby="ob-po-amt-e ob-po-amt-h"
              [value]="amount()"
              (input)="set('amount', $event)"
            />
          </div>
          <div class="fld-e" id="ob-po-amt-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('amount') }}</span>
          </div>
          <div class="fld-h" id="ob-po-amt-h">{{ hint() }}</div>
        </div>
        <div class="note tone-warn">
          <rp-icon name="alert" [size]="17" />
          <div class="grow">
            Record the reference exactly as it appears on the bank statement. It can’t be changed
            afterwards.
          </div>
        </div>
      </div>
      <ng-container modal-foot>
        <button type="button" class="btn btn-sec" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="ob-po-save"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="save()"
        >
          <rp-icon name="check" [size]="17" /><span>Record payout</span>
        </button>
      </ng-container>
    </rp-modal>
  `,
})
export class PayoutForm {
  private readonly api = inject(SettlementsApi);
  private readonly overlays = inject(Overlays);

  readonly settlement = input.required<SettlementDetail>();
  readonly closed = output<void>();
  readonly saved = output<SettlementDetail>();
  /** The settlement changed meanwhile (412): the page reloads it. */
  readonly stale = output<void>();

  protected readonly utr = signal('');
  protected readonly amount = signal('');
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly busy = signal(false);

  protected readonly sub = computed(() => {
    const s = this.settlement();
    const at = s.final?.at ? ` · approved ${formatDateTime(s.final.at)}` : '';
    return `${s.settlementNo} · ${s.institution.name}${at}`;
  });
  protected readonly hint = computed(() => {
    const s = this.settlement();
    return paiseOf(s.payableNow) === paiseOf(s.net)
      ? `Must equal the settlement amount, ${inr(s.payableNow)}`
      : `Must equal the amount payable now, ${inr(s.payableNow)} — merchants suspended since the run are carried forward`;
  });

  protected err(k: Field) {
    return this.errors()[k] ?? '';
  }

  protected set(k: Field, e: Event) {
    // The amount takes numbers only (client 2026-10-14).
    const el = e.target as HTMLInputElement;
    const v = k === 'amount' ? cleanTyped(el, amountText) : el.value;
    (k === 'utr' ? this.utr : this.amount).set(v);
    this.errors.set({ ...this.errors(), [k]: '' });
  }

  protected async save() {
    if (this.busy()) return;
    const s = this.settlement();
    const utr = this.utr().trim().toUpperCase();
    const amount = this.amount().trim().replace(/,/g, '');
    const errors: Partial<Record<Field, string>> = {};
    if (!utr) errors.utr = 'Enter the UTR';
    else if (!UTR.test(utr)) errors.utr = translate('STL.UTR_FORMAT');
    const payable = paiseOf(s.payableNow);
    if (!amount) errors.amount = 'Enter the amount paid out';
    else {
      let paise: number | null = null;
      try {
        paise = parseAmount(amount, { allowZero: true });
      } catch {
        errors.amount = translate('VALIDATION.AMOUNT');
      }
      if (paise !== null && paise !== payable) {
        errors.amount = translate('STL.PAYOUT_AMOUNT', { amount: inrPaise(payable) });
      }
    }
    this.errors.set(errors);
    if (errors.utr || errors.amount) return;
    this.busy.set(true);
    try {
      const out = await this.api.payout(s.id, {
        utr,
        amount: (parseAmount(amount, { allowZero: true }) / 100).toFixed(2),
      });
      this.saved.emit(out);
    } catch (e) {
      if (!(e instanceof ApiProblem)) {
        this.overlays.toast('Payout not recorded', {
          sub: translate('GEN.UNAVAILABLE'),
          tone: 'bad',
        });
        return;
      }
      const field = (code: string): Field | null =>
        code === 'STL.UTR_FORMAT' || code === 'STL.UTR_TAKEN'
          ? 'utr'
          : code === 'STL.PAYOUT_AMOUNT' || code === 'VALIDATION.AMOUNT'
            ? 'amount'
            : null;
      const fe = e.errors.find((x) => x.field === 'utr' || x.field === 'amount');
      if (fe) {
        this.errors.set({ [fe.field]: fe.message });
      } else if (field(e.code)) {
        this.errors.set({ [field(e.code)!]: e.detail });
      } else {
        this.overlays.toast('Payout not recorded', { sub: e.detail, tone: 'bad' });
        if (e.status === 409 || e.status === 412 || e.status === 428) this.stale.emit();
      }
    } finally {
      this.busy.set(false);
    }
  }
}
