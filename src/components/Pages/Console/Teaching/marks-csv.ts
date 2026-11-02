/**
 * Marks to and from a spreadsheet (Phase 10): the class as a CSV sheet to fill in Excel or Sheets,
 * the filled sheet read back in the browser (nothing is saved until the teacher saves), and a column
 * pasted from a spreadsheet. A mark is whole or half, from 0 to the maximum; "AB", "A" or "absent"
 * means absent; an empty cell leaves the student as they are.
 */
import type { MarksRow } from './marks.api';

export type CellValue =
  { readonly absent: true } | { readonly marks: number } | { readonly blank: true };
export type CellProblem = 'format' | 'range';

/** One typed or pasted cell. */
export function readCell(raw: string, max: number): CellValue | CellProblem {
  const v = raw.trim().toLowerCase();
  if (!v) return { blank: true };
  if (v === 'ab' || v === 'a' || v === 'absent') return { absent: true };
  if (!/^\d{1,4}(\.(0|5))?$/.test(v)) return 'format';
  const n = Number(v);
  return n > max ? 'range' : { marks: n };
}

const BOM = String.fromCharCode(0xfeff);
const quote = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** The sheet: admission number, student, marks (empty, a number, or AB). UTF-8 with a BOM for Excel. */
export function marksSheet(
  rows: readonly MarksRow[],
  header: readonly [string, string, string],
): string {
  const lines = [header.map(quote).join(',')];
  for (const r of rows) {
    const mark = r.absent ? 'AB' : r.marks === null ? '' : String(r.marks);
    lines.push([r.student.admissionNo ?? '', r.student.name, mark].map(quote).join(','));
  }
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

/** CSV cells, quotes and all; the first line is the header. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  const src = text.startsWith(BOM) ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (q) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',' || c === ';' || c === '\t') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

export interface SheetProblem {
  /** The line in the sheet (2 = the first student under the header). */
  readonly line: number;
  readonly admissionNo: string;
  readonly reason: 'unknown' | 'duplicate' | CellProblem | 'noAdmissionNo';
}

export interface SheetResult {
  /** Student id → the value read. */
  readonly values: ReadonlyMap<string, Exclude<CellValue, { blank: true }>>;
  readonly blank: number;
  readonly problems: readonly SheetProblem[];
}

/** Matches the sheet's lines to the class by admission number; every refused line says why. */
export function readSheet(text: string, rows: readonly MarksRow[], max: number): SheetResult {
  const byNo = new Map(
    rows
      .filter((r) => r.student.admissionNo)
      .map((r) => [r.student.admissionNo!.trim().toLowerCase(), r]),
  );
  const values = new Map<string, Exclude<CellValue, { blank: true }>>();
  const seen = new Set<string>();
  const problems: SheetProblem[] = [];
  let blank = 0;
  const lines = parseCsv(text);
  lines.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const no = (cells[0] ?? '').trim();
    if (!no) {
      problems.push({ line, admissionNo: '', reason: 'noAdmissionNo' });
      return;
    }
    const row = byNo.get(no.toLowerCase());
    if (!row) {
      problems.push({ line, admissionNo: no, reason: 'unknown' });
      return;
    }
    if (seen.has(row.student.id)) {
      problems.push({ line, admissionNo: no, reason: 'duplicate' });
      return;
    }
    seen.add(row.student.id);
    const v = readCell(cells[2] ?? '', max);
    if (v === 'format' || v === 'range') problems.push({ line, admissionNo: no, reason: v });
    else if ('blank' in v) blank++;
    else values.set(row.student.id, v);
  });
  return { values, blank, problems };
}

/** A pasted block: one value per line (the first column when tabs separate several). */
export function pastedColumn(text: string): string[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines.map((l) => (l.split('\t')[0] ?? '').trim());
}
