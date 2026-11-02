/**
 * Boxes that accept only some characters (an Aadhaar number takes digits, a PAN capitals and
 * digits). Cleaning only the value kept left a refused character showing in the box, as if it had
 * been accepted (client 2026-10-13: "Aadhaar number should allow only numerics"); the box is
 * cleaned too, with the caret kept where it was.
 */

/** Digits only (Aadhaar, PIN code, mobile). */
export const onlyDigits = (v: string) => v.replace(/\D/g, '');

/** Capitals and digits (PAN). */
export const panText = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * A phone number that may carry another country's code (client 2026-10-14: contact numbers take
 * numbers only): digits, and a "+" in front only.
 */
export const phoneText = (v: string) => {
  const t = v.trim();
  return (t.startsWith('+') ? '+' : '') + t.replace(/\D/g, '');
};

/**
 * An amount in rupees (client 2026-10-14: amounts take numbers only): digits, and one decimal
 * point with at most two digits after it (paise).
 */
export const amountText = (v: string) => {
  const [whole = '', ...rest] = v.replace(/[^\d.]/g, '').split('.');
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
};

/** Applies `rule` to what is in the box, in the box itself, and returns the result. */
export function cleanTyped(
  el: HTMLInputElement | HTMLTextAreaElement,
  rule: (v: string) => string,
) {
  const raw = el.value;
  const v = rule(raw);
  if (v !== raw) {
    const caret = rule(raw.slice(0, el.selectionStart ?? raw.length)).length;
    el.value = v;
    try {
      el.setSelectionRange(caret, caret);
    } catch {
      /* a box without a caret (not focused, or a type that has none) */
    }
  }
  return v;
}
