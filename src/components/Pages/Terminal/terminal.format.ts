/** Display helpers of the terminal screens (prototype fmt.inr / inr0, ui.av colours, maskTok). */
import { formatInr } from '../../Utils/format';

export const inr = (p: number) => formatInr(p);
export const inr0 = (p: number) => formatInr(p).replace(/\.00$/, '');

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

const AVC = [
  '#0C6F7D',
  '#B4582B',
  '#5E4BB0',
  '#1F7A4D',
  '#A23E6A',
  '#2D5DA8',
  '#8A6A12',
  '#3C6E71',
  '#8C3B3B',
  '#4F6D2E',
];
/** ui.avColor: one colour per name. */
export const avColor = (name: string) => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVC[h % AVC.length]!;
};

/** maskTok: the first three and last three characters of a card token. */
export const maskCard = (t: string) => (t.length > 5 ? `${t.slice(0, 3)}••${t.slice(-3)}` : t);
