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
import { formatDateTime } from '../../../Utils/format';
import type { IconName } from '../../../Utils/icons';
import { parseAmount } from '../../../Utils/money';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { amountText, cleanTyped } from '../../../Utils/typing';
import { inr, inrPaise, paiseOf } from '../Settlements/settlement-format';
import { MISMATCH_KIND, PLATFORM_TYPE, REASON_CODES, RESOLUTION, difference } from './recon-format';
import { ReconApi, type Mismatch, type Resolution } from './recon.api';

type Field = 'transactionRef' | 'amount' | 'reasonCode' | 'remarks';

const CHOICES: readonly { v: Resolution; icon: IconName; title: string; sub: string }[] = [
  { v: 'REFUND', icon: 'undo', title: 'Request a refund', sub: 'Money goes back to the member' },
  {
    v: 'CHARGEBACK',
    icon: 'alert',
    title: 'Raise a chargeback',
    sub: 'Dispute with the card scheme or gateway',
  },
  {
    v: 'EXPLAINED',
    icon: 'checkc',
    title: 'Explain it',
    sub: 'Recorded with remarks; nothing moves',
  },
  {
    v: 'ADJUSTED',
    icon: 'sliders',
    title: 'Adjusted elsewhere',
    sub: 'Corrected outside CampusOne; nothing moves here',
  },
];

/**
 * Resolve a mismatch (prototype ob.rec.mm; REC-004): what was found, then how it is resolved — a
 * refund or chargeback request for a transaction reference (money moves only when that request is
 * decided), or an explanation or adjustment with remarks. A resolved mismatch opens read-only.
 */
@Component({
  selector: 'rp-rec-resolve',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <rp-modal
      [title]="open() ? 'Resolve the mismatch' : 'Mismatch · resolved'"
      [sub]="kindLabel() + ' · ' + (m().statement.key ?? m().platform?.reference ?? '—')"
      icon="scale"
      [narrow]="!open()"
      (closed)="closed.emit()"
    >
      <div class="stack g12">
        <dl class="kv">
          <dt>Transaction</dt>
          <dd>
            @if (m().platform?.reference; as r) {
              <span class="t-mono">{{ r }}</span>
            } @else {
              <span class="t-faint">—</span>
            }
          </dd>
          <dt>Institution</dt>
          <dd>{{ m().institution?.name ?? 'Not identified' }}</dd>
          <dt>Kind</dt>
          <dd>{{ kindLabel() }}</dd>
          <dt>Platform</dt>
          <dd>
            @if (m().platform; as p) {
              {{ p.amount ? money(p.amount) : '—' }} · {{ platformType(p.type) }}
            } @else {
              <span class="t-muted">Not on platform</span>
            }
          </dd>
          <dt>Statement</dt>
          <dd>
            @if (m().statement.amount; as a) {
              {{ money(a) }}{{ m().statement.status ? ' · ' + outcome(m().statement.status) : '' }}
            } @else {
              <span class="t-muted">Not in statement</span>
            }
          </dd>
          <dt>Found in</dt>
          <dd>
            {{ m().statement.fileName
            }}{{ m().statement.rowNo ? ' · row ' + m().statement.rowNo : '' }}
          </dd>
        </dl>

        @if (!open()) {
          <div class="note tone-ok">
            <rp-icon name="checkc" [size]="17" />
            <div class="grow">
              <b>{{ resolution(m().resolution) }}</b>
              @if (m().resolved; as r) {
                · {{ r.by ?? 'by a later statement' }}{{ r.at ? ' · ' + dt(r.at) : '' }}
              }
              @if (m().remarks) {
                <div class="t-sm" style="margin-top: 4px">“{{ m().remarks }}”</div>
              }
            </div>
          </div>
        } @else {
          <div
            class="ob-cgrid"
            style="grid-template-columns: repeat(2, minmax(0, 1fr))"
            role="radiogroup"
            aria-label="Resolution"
          >
            @for (c of choices; track c.v) {
              <div
                class="choice"
                [class.on]="action() === c.v"
                tabindex="0"
                role="radio"
                [attr.aria-checked]="action() === c.v"
                (click)="choose(c.v)"
                (keydown.enter)="choose(c.v)"
                (keydown.space)="$event.preventDefault(); choose(c.v)"
              >
                <span class="li-ic sm"><rp-icon [name]="c.icon" [size]="17" /></span>
                <span class="grow"
                  ><span class="t-h4" style="display: block">{{ c.title }}</span
                  ><span class="t-sm t-muted" style="display: block; margin-top: 1px">{{
                    c.sub
                  }}</span></span
                ><span class="radio"></span>
              </div>
            }
          </div>
          @if (money_()) {
            <div class="c-form">
              <div class="fld" [class.invalid]="err('transactionRef')">
                <label class="fld-l" for="ob-rs-ref"
                  >Transaction reference<span class="req">*</span></label
                >
                <div class="fld-in">
                  <input
                    id="ob-rs-ref"
                    type="text"
                    autocomplete="off"
                    maxlength="35"
                    placeholder="e.g. RPEPDICAR7A29B9J02U3E81Y4L662770119"
                    aria-describedby="ob-rs-ref-e ob-rs-ref-h"
                    [value]="ref()"
                    (input)="set('transactionRef', $event)"
                  />
                </div>
                <div class="fld-e" id="ob-rs-ref-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('transactionRef') }}</span>
                </div>
                <div class="fld-h" id="ob-rs-ref-h">
                  The wallet movement’s reference, as on its receipt
                </div>
              </div>
              <div class="fld" [class.invalid]="err('amount')">
                <label class="fld-l" for="ob-rs-amt"
                  >{{ action() === 'REFUND' ? 'Refund amount' : 'Requested amount'
                  }}<span class="opt">(optional)</span></label
                >
                <div class="fld-in">
                  <span class="pre">₹</span
                  ><input
                    id="ob-rs-amt"
                    type="text"
                    inputmode="decimal"
                    autocomplete="off"
                    maxlength="14"
                    aria-describedby="ob-rs-amt-e ob-rs-amt-h"
                    [value]="amount()"
                    (input)="set('amount', $event)"
                  />
                </div>
                <div class="fld-e" id="ob-rs-amt-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('amount') }}</span>
                </div>
                <div class="fld-h" id="ob-rs-amt-h">
                  Leave empty for the transaction’s whole amount
                </div>
              </div>
              @if (action() === 'CHARGEBACK') {
                <div class="fld" [class.invalid]="err('reasonCode')">
                  <label class="fld-l" for="ob-rs-code"
                    >Reason code<span class="req">*</span></label
                  >
                  <div class="fld-in">
                    <select
                      id="ob-rs-code"
                      aria-describedby="ob-rs-code-e"
                      (change)="code.set(value($event))"
                    >
                      @for (r of codes; track r.v) {
                        <option [value]="r.v" [selected]="code() === r.v">
                          {{ r.v }} · {{ r.l }}
                        </option>
                      }
                    </select>
                  </div>
                  <div class="fld-e" id="ob-rs-code-e" role="alert">
                    <rp-icon name="alertc" [size]="14" /><span>{{ err('reasonCode') }}</span>
                  </div>
                </div>
              }
            </div>
          }
          <div class="fld" [class.invalid]="err('remarks')">
            <label class="fld-l" for="ob-rs-why"
              >{{ action() === 'REFUND' ? 'Reason' : 'Remarks' }}<span class="req">*</span></label
            >
            <div class="fld-in">
              <textarea
                id="ob-rs-why"
                rows="2"
                maxlength="500"
                [placeholder]="placeholder()"
                aria-describedby="ob-rs-why-e"
                [value]="remarks()"
                (input)="set('remarks', $event)"
              ></textarea>
            </div>
            <div class="fld-e" id="ob-rs-why-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('remarks') }}</span>
            </div>
          </div>
          @if (formError()) {
            <div class="note tone-bad" role="alert">
              <rp-icon name="alertc" [size]="17" />
              <div class="grow">{{ formError() }}</div>
            </div>
          }
        }
      </div>
      <ng-container modal-foot>
        <button type="button" class="btn btn-sec" (click)="closed.emit()">
          <span>{{ open() ? 'Cancel' : 'Close' }}</span>
        </button>
        @if (open()) {
          <button
            type="button"
            class="btn btn-pri"
            id="ob-rs-go"
            [class.is-busy]="busy()"
            [disabled]="busy() || !canResolve()"
            [attr.title]="canResolve() ? null : why()"
            (click)="save()"
          >
            <rp-icon name="check" [size]="17" /><span>Resolve mismatch</span>
          </button>
        }
      </ng-container>
    </rp-modal>
  `,
})
export class MismatchResolve implements OnInit {
  private readonly api = inject(ReconApi);
  private readonly overlays = inject(Overlays);

  readonly m = input.required<Mismatch>();
  /** Holds recon.resolve (and recon.chargeback for a chargeback). */
  readonly canResolve = input(true);
  readonly canChargeback = input(true);
  readonly why = input('');
  readonly closed = output<void>();
  readonly resolved = output<Mismatch>();
  readonly stale = output<void>();

  protected readonly choices = CHOICES;
  protected readonly codes = REASON_CODES;
  protected readonly action = signal<Resolution>('EXPLAINED');
  protected readonly ref = signal('');
  protected readonly amount = signal('');
  protected readonly code = signal(REASON_CODES[0]!.v);
  protected readonly remarks = signal('');
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly formError = signal('');
  protected readonly busy = signal(false);

  protected readonly open = computed(() => this.m().status === 'OPEN');
  protected readonly kindLabel = computed(() => MISMATCH_KIND[this.m().kind].l);
  protected readonly money_ = computed(() => {
    const a = this.action();
    return a === 'REFUND' || a === 'CHARGEBACK';
  });
  protected readonly placeholder = computed(
    () =>
      ({
        REFUND: 'e.g. Canteen charged ₹15 above the menu price',
        CHARGEBACK: 'e.g. Gateway reports the payment as disputed by the card holder',
        EXPLAINED: 'e.g. Credited after the statement cut-off; in tomorrow’s statement',
        ADJUSTED: 'e.g. The bank corrected the amount on its side',
      })[this.action()],
  );

  ngOnInit() {
    // A statement row is a bank or gateway record (a UTR, a settlement number, a payment id), not a
    // wallet movement: a refund or chargeback names the movement's own reference, typed here.
    const m = this.m();
    const d = difference(m);
    const p = paiseOf(m.platform?.amount);
    this.amount.set(d ? (Math.abs(d) / 100).toFixed(2) : p ? (p / 100).toFixed(2) : '');
  }

  protected choose(v: Resolution) {
    this.action.set(v);
    this.errors.set({});
    this.formError.set('');
  }
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

  protected async save() {
    if (this.busy() || !this.canResolve()) return;
    const action = this.action();
    const errors: Partial<Record<Field, string>> = {};
    const remarks = this.remarks().trim();
    if (remarks.length < 3 || remarks.length > 500) errors.remarks = translate('REC.REMARKS');
    let amount: string | undefined;
    let paise = 0;
    if (this.money_()) {
      if (!this.ref().trim()) errors.transactionRef = translate('REC.REFERENCE_REQUIRED');
      const a = this.amount().trim().replace(/,/g, '');
      if (a) {
        try {
          paise = parseAmount(a);
          amount = (paise / 100).toFixed(2);
        } catch {
          errors.amount = translate('VALIDATION.AMOUNT');
        }
      }
      if (action === 'CHARGEBACK' && !this.canChargeback()) {
        errors.reasonCode = 'Your role doesn’t hold “Raise and complete chargebacks”.';
      }
    }
    this.errors.set(errors);
    if (Object.values(errors).some(Boolean)) return;
    const m = this.m();
    const ref = this.ref().trim().toUpperCase();
    if (action === 'REFUND' || action === 'CHARGEBACK') {
      const ok = await this.overlays.confirm(
        action === 'REFUND'
          ? {
              title: amount ? `Request a refund of ${inrPaise(paise)}?` : 'Request a refund?',
              text: `Against ${ref}${m.institution?.name ? ` (${m.institution.name})` : ''}. It stays Requested until another officer processes it; only then does the money move, through the ledger.`,
              ok: 'Request refund',
            }
          : {
              title: 'Raise a chargeback?',
              text: `${amount ? inrPaise(paise) + ' on ' : ''}${ref} · reason code ${this.code()}. The case stays Raised until it is accepted or disputed, then completed.`,
              ok: 'Raise chargeback',
              tone: 'warn',
            },
      );
      if (!ok) return;
    }
    this.busy.set(true);
    try {
      const out = await this.api.resolve(m, {
        action,
        remarks,
        ...(this.money_() ? { transactionRef: ref } : {}),
        ...(this.money_() && amount ? { amount } : {}),
        ...(action === 'CHARGEBACK' ? { reasonCode: this.code() } : {}),
      });
      this.resolved.emit(out);
    } catch (e) {
      if (!(e instanceof ApiProblem)) {
        this.formError.set(translate('GEN.UNAVAILABLE'));
        return;
      }
      const field = e.errors.find((x) =>
        ['transactionRef', 'amount', 'reasonCode', 'remarks'].includes(x.field),
      );
      if (field) {
        this.errors.set({ [field.field]: field.message });
      } else if (e.code === 'REC.TXN_UNKNOWN') {
        this.errors.set({ transactionRef: e.detail });
      } else if (e.code === 'REC.AMOUNT_ABOVE') {
        this.errors.set({ amount: e.detail });
      } else if (e.status === 412 || e.status === 428 || e.code === 'REC.TRANSITION_INVALID') {
        this.overlays.toast('Not resolved', { sub: e.detail, tone: 'bad' });
        this.stale.emit();
      } else {
        this.formError.set(e.detail);
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected money(a: { amount: string }) {
    return inr(a);
  }
  /** A statement outcome as written ("SUCCESS") in sentence case. */
  protected outcome(s: string | null) {
    return s ? s.charAt(0) + s.slice(1).toLowerCase() : '';
  }
  protected platformType(t: string) {
    return PLATFORM_TYPE[t] ?? t;
  }
  protected resolution(r: Resolution | null) {
    return r ? RESOLUTION[r] : 'Resolved';
  }
  protected dt(v: string) {
    return formatDateTime(v);
  }
  protected value(e: Event) {
    return (e.target as HTMLSelectElement).value;
  }
}
