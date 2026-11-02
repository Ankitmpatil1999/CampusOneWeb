/**
 * The prototype's amount (ui.amt): `<span class="amt">₹<w>1,24,560</w><dec>.00</dec></span>` — the
 * rupees grouped the Indian way and the paise smaller. API money arrives as a decimal string
 * (`{amount: "1250.00", currency: "INR"}`); it is never turned into a float.
 */
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatInr, groupIndian } from '../Utils/format';
import { parseAmount } from '../Utils/money';

export interface MoneyLike {
  readonly amount: string;
}

/** Splits an API amount ("-1250.5") into its sign, grouped rupees and paise. */
export function amountParts(m: MoneyLike | string): { neg: boolean; whole: string; dec: string } {
  const s = (typeof m === 'string' ? m : m.amount).trim();
  const neg = s.startsWith('-');
  const [r = '0', f = ''] = (neg ? s.slice(1) : s).split('.');
  const rupees = /^\d+$/.test(r) ? r.replace(/^0+(?=\d)/, '') : '0';
  const paise = /^\d*$/.test(f) ? `${f}00`.slice(0, 2) : '00';
  return { neg, whole: groupIndian(rupees), dec: `.${paise}` };
}

/** API amount → paise (signed), exactly. */
export function amountPaise(m: MoneyLike): number {
  const s = m.amount.trim();
  const neg = s.startsWith('-');
  const p = parseAmount(neg ? s.slice(1) : s, { allowZero: true });
  return neg ? -p : p;
}

/** API amount → "₹1,24,560.00" for text (toasts, notes, titles). */
export function inrText(m: MoneyLike): string {
  return formatInr(amountPaise(m));
}

@Component({
  selector: 'rp-amt',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<span [attr.class]="'amt' + (cls() ? ' ' + cls() : '')"
    >{{ signText() }}<span class="cur">₹</span><span class="w">{{ parts().whole }}</span
    ><span class="dec">{{ parts().dec }}</span></span
  >`,
})
export class Amount {
  readonly value = input.required<MoneyLike>();
  /** '+' or '−' in front (a credit or a debit); a negative amount shows '−' on its own. */
  readonly sign = input<'+' | '−' | null>(null);
  /** Extra classes: `cr` (credit, green), `t-b`, `big`. */
  readonly cls = input('');
  protected readonly parts = computed(() => amountParts(this.value()));
  protected readonly signText = computed(() => this.sign() ?? (this.parts().neg ? '−' : ''));
}
