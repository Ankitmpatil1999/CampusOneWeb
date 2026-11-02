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
import { formatDate, istBusinessDate } from '../../../Utils/format';
import { newIdempotencyKey } from '../../../Utils/ids';
import { PATTERNS, isRealDate } from '../../../Utils/patterns';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import type { Money } from '../Applications/applications.api';
import { inr } from '../Fees/fee-format';

/** What Record cash sends — the same fields and rules for an admission fee and an instalment. */
export interface CashEntry {
  /** YYYY-MM-DD, not in the future. */
  readonly receivedAt: string;
  /** From the counterfoil book; null: CampusOne numbers the receipt. */
  readonly receiptNo: string | null;
  readonly paidBy: string;
}

/**
 * The fee a cash collection is recorded against (ADM-022: an admission or application fee; FEE-047:
 * an instalment) and how it is recorded. The answer carries the receipt number.
 */
export interface CashTarget<R extends { readonly receiptNo: string }> {
  /** The fee's tile: "Admission fee", or the instalment ("Term 1"). */
  readonly fee: string;
  /** Under the title: the student and their numbers. */
  readonly sub: string;
  /** Named in the confirmation and the toast. */
  readonly student: string;
  readonly amount: Money;
  /** Who usually pays (the primary contact), filled in. */
  readonly payer: string;
  /** Records it once; the key makes a retry after a lost answer the same request. */
  readonly record: (entry: CashEntry, key: string) => Promise<R>;
}

type Field = 'rcpt' | 'date' | 'by';

/** The receipt number is already used in the school (ADM-022, FEE-047). */
const RECEIPT_TAKEN = new Set(['ADM.RECEIPT_TAKEN', 'FEE.RECEIPT_TAKEN']);

/**
 * Record cash collection (prototype cm.adm.cash; ADM-022, FEE-047): the fee and the mode, the
 * receipt number from the counterfoil book (left empty, CampusOne numbers it), the day it was received
 * (not in the future) and who paid. Cash is recorded once and can't be edited; a paid application
 * fee submits a declared draft. The admission fees page and Collect fee use the same dialog (client
 * 2026-10-22).
 */
@Component({
  selector: 'rp-cash-collection',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      title="Record cash collection"
      [sub]="target().sub"
      icon="rupee"
      cls="cm-m"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="cc-form">
        <div class="c-grid k2">
          <div class="cm-tile">
            <span>{{ target().fee }}</span
            ><b class="t-num">{{ amount() }}</b>
          </div>
          <div class="cm-tile"><span>Mode</span><b class="t-num">Cash</b></div>
        </div>
        <div class="fld" [class.invalid]="err('rcpt')">
          <label class="fld-l" for="cc-rcpt"
            >Receipt number<span class="opt">(optional)</span></label
          >
          <div class="fld-in">
            <input
              id="cc-rcpt"
              maxlength="30"
              autocomplete="off"
              aria-describedby="cc-rcpt-e"
              [value]="rcpt()"
              (input)="rcpt.set(val($event)); clear('rcpt')"
            />
          </div>
          <div class="fld-e" id="cc-rcpt-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('rcpt') }}</span>
          </div>
          <div class="fld-h">
            From the counterfoil book. Must be unique. Left empty, CampusOne numbers the receipt.
          </div>
        </div>
        <div class="fld" [class.invalid]="err('date')">
          <label class="fld-l" for="cc-date">Received on<span class="req">*</span></label>
          <div class="fld-in">
            <input
              id="cc-date"
              type="date"
              aria-describedby="cc-date-e"
              [attr.max]="today"
              [value]="date()"
              (input)="date.set(val($event)); clear('date')"
              (change)="date.set(val($event)); clear('date')"
            />
          </div>
          <div class="fld-e" id="cc-date-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('date') }}</span>
          </div>
        </div>
        <div class="fld" [class.invalid]="err('by')">
          <label class="fld-l" for="cc-by">Received from<span class="req">*</span></label>
          <div class="fld-in">
            <input
              id="cc-by"
              maxlength="100"
              autocomplete="off"
              placeholder="Name of the person who paid"
              aria-describedby="cc-by-e"
              [value]="by()"
              (input)="by.set(val($event)); clear('by')"
            />
          </div>
          <div class="fld-e" id="cc-by-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('by') }}</span>
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
          id="cc-save"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="save()"
        >
          <span>Record {{ amount() }}</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class CashCollection<R extends { readonly receiptNo: string }> implements OnInit {
  private readonly overlays = inject(Overlays);

  readonly target = input.required<CashTarget<R>>();
  readonly closed = output<void>();
  readonly recorded = output<R>();

  protected readonly today = istBusinessDate(new Date());
  protected readonly rcpt = signal('');
  protected readonly date = signal(this.today);
  protected readonly by = signal('');
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  private readonly key = newIdempotencyKey();

  ngOnInit() {
    this.by.set(this.target().payer);
  }

  protected amount() {
    return inr(this.target().amount);
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
    const rcpt = this.rcpt().trim();
    const by = this.by().trim().replace(/\s+/g, ' ');
    const e: Partial<Record<Field, string>> = {};
    if (rcpt && !/^[A-Za-z0-9/-]+$/.test(rcpt)) e.rcpt = 'Use letters, numbers, / and - only';
    if (!this.date()) e.date = 'Choose the date';
    else if (!isRealDate(this.date())) e.date = translate('VALIDATION.DATE');
    else if (this.date() > this.today) e.date = "The date can't be in the future";
    if (!by) e.by = 'Enter who paid';
    else if (!PATTERNS.personName.test(by)) e.by = 'Use letters only';
    this.errors.set(e);
    if (Object.values(e).some(Boolean)) return;
    const t = this.target();
    const ok = await this.overlays.confirm({
      title: `Record ${this.amount()} cash?`,
      text: `${rcpt ? `Receipt ${rcpt}` : 'A receipt'} for ${t.student}, received ${formatDate(this.date())}. Cash entries can't be edited later.`,
      ok: 'Record cash',
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      const out = await t.record(
        { receivedAt: this.date(), receiptNo: rcpt || null, paidBy: by },
        this.key,
      );
      this.overlays.toast('Cash collection recorded', { sub: `${out.receiptNo} · ${t.student}` });
      this.recorded.emit(out);
    } catch (x) {
      if (x instanceof ApiProblem && RECEIPT_TAKEN.has(x.code)) {
        this.errors.set({ rcpt: x.detail });
      } else if (x instanceof ApiProblem && x.errors.length) {
        const map: Record<string, Field> = { receiptNo: 'rcpt', receivedAt: 'date', paidBy: 'by' };
        const f: Partial<Record<Field, string>> = {};
        for (const y of x.errors) if (map[y.field]) f[map[y.field]!] = y.message;
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
