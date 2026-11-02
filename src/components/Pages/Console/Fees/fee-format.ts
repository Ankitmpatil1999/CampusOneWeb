/**
 * Display and pricing helpers of the fee screens (prototype 4. FEE STRUCTURES: fsChip, clsList,
 * fsSums, fmt.inrK). The live totals use the API's one formula (fees.service structureTotals): a
 * head's part of each instalment is whole rupees by share with the remainder on the last, and an
 * instalment is the sum of the mandatory heads' parts — so the screen shows what the server saves.
 */
import { amountPaise } from '../../../Shared/Amount';
import { formatInr, groupIndian } from '../../../Utils/format';
import { formatAmount } from '../../../Utils/money';
import { translate } from '../../../Utils/translate';
import type { Money, StructureState } from './fees.api';

/** The states as the prototype shows them (fsChip: Pending approval in violet). */
export const STRUCTURE_STATE: Readonly<Record<StructureState, { l: () => string; tone: string }>> =
  {
    DRAFT: { l: () => translate('status.fee_structure_version.draft'), tone: 'neutral' },
    PENDING: { l: () => translate('status.fee_structure_version.pending'), tone: 'violet' },
    ACTIVE: { l: () => translate('status.fee_structure_version.active'), tone: 'ok' },
    SUPERSEDED: { l: () => translate('status.fee_structure_version.superseded'), tone: 'neutral' },
  };

/** API money → paise. */
export const paiseOf = (m: Money | { amount: string }) => amountPaise(m);
/** Paise → API money. */
export const money = (paise: number): Money => ({ amount: formatAmount(paise), currency: 'INR' });
/** "₹1,24,560.00". */
export const inr = (m: Money | { amount: string }) => formatInr(amountPaise(m));

/** A typed rupee amount → paise; null when it isn't a number with up to two decimals. */
export function rupeesToPaise(v: string): number | null {
  const s = v.trim().replace(/,/g, '');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
  const [w = '0', f = ''] = s.split('.');
  return Number(w) * 100 + Number(`${f}00`.slice(0, 2));
}

/** Paise → the text an amount field starts with ("1500" or "1500.50"). */
export function paiseToInput(p: number): string {
  return p % 100 ? (p / 100).toFixed(2) : String(p / 100);
}

/** "33.33" → 3333 basis points; null when not a share above 0 with up to two decimals. */
export function shareBp(share: string): number | null {
  const s = share.trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  const [w = '0', f = ''] = s.split('.');
  const bp = Number(w) * 100 + Number(`${f}00`.slice(0, 2));
  return bp > 0 && bp <= 10_000 ? bp : null;
}

/** Basis points → "40" or "33.33". */
export const pctText = (bp: number) => (bp % 100 ? (bp / 100).toFixed(2) : String(bp / 100));

/** A head's part of each instalment: whole rupees by share, the remainder on the last. */
export function headParts(amount: number, sharesBp: readonly number[]): number[] {
  if (!sharesBp.length) return [];
  const parts = sharesBp.map((bp) => Math.floor((amount * bp) / 1_000_000) * 100);
  const last = parts.length - 1;
  parts[last] = amount - parts.slice(0, last).reduce((a, b) => a + b, 0);
  return parts;
}

/** The one formula: instalments are the sums of the heads' parts (mandatory, then with optional). */
export function structureTotals(
  heads: readonly { amount: number; optional: boolean }[],
  sharesBp: readonly number[],
) {
  const sum = (list: readonly { amount: number }[]) =>
    sharesBp.map((_, i) => list.reduce((a, h) => a + (headParts(h.amount, sharesBp)[i] ?? 0), 0));
  const mandatory = heads.filter((h) => !h.optional);
  return {
    total: mandatory.reduce((a, h) => a + h.amount, 0),
    optional: heads.filter((h) => h.optional).reduce((a, h) => a + h.amount, 0),
    instalments: sum(mandatory),
    withOptional: sum(heads),
  };
}

/** "Grade 6" → "6" (the prototype's class short names in lists). */
export const classShort = (name: string) => name.replace(/^Grade\s+/i, '');

/** "6, 7, 8" (clsList). */
export const classList = (classes: readonly { name: string }[]) =>
  classes.map((c) => classShort(c.name)).join(', ');

/** Compact rupees for the key figures (fmt.inrK): ₹26.2k, ₹2.31 L, ₹1.20 Cr. */
export function inrK(paise: number): string {
  const r = paise / 100;
  const trim = (s: string) => s.replace(/\.0+$/, '');
  if (Math.abs(r) >= 1e7) return `₹${trim((r / 1e7).toFixed(2))} Cr`;
  if (Math.abs(r) >= 1e5) return `₹${trim((r / 1e5).toFixed(2))} L`;
  if (Math.abs(r) >= 1e3) return `₹${trim((r / 1e3).toFixed(1))}k`;
  return `₹${groupIndian(String(Math.round(Math.abs(r))))}`;
}

/** Whole rupees (fmt.inr0): "₹17,100". */
export const inr0 = (paise: number) => `₹${groupIndian(String(Math.round(Math.abs(paise) / 100)))}`;

/** "1 structure", "13 structures" (fmt.plural); `many` for irregular plurals. */
export function plural(n: number, noun: string, many = `${noun}s`): string {
  return `${n.toLocaleString('en-IN')} ${n === 1 ? noun : many}`;
}

/** Percentage with one decimal (pct): a ÷ b. */
export function rate(a: number, b: number): number {
  return b ? Math.round((1000 * a) / b) / 10 : 0;
}

/** A CSV cell, quoted when needed. */
export function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Saves text as a CSV file in the browser. */
export function saveCsv(fileName: string, rows: readonly (readonly (string | number)[])[]) {
  const text = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  const href = URL.createObjectURL(new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
