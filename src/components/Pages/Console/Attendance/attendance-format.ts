/**
 * Helpers shared by the attendance and front-desk pages (prototype c.attendance, c.frontdesk) and the
 * transport pages: who may do what on a task (the prototype's denied / lockReason), the attendance
 * status chips with the register's labels (27.2), the attendance bar's tone, percentages as the
 * prototype prints them, and the CSV export (exportCsv).
 */
import { computed, type Signal } from '@angular/core';
import type { ConsoleSession } from '../../../../Context/SessionContext';
import { translate } from '../../../Utils/translate';
import { MANAGEMENT_WHY, NO_TASK } from '../Structure/academic-format';
import type { DailyStatus } from './attendance.api';

/**
 * The page's access for one task: `denied` without its view sub-task; `why(sub)` says why the role
 * can't do `sub` ('' when it can) — management is read-only.
 */
export function taskAccess(session: Signal<ConsoleSession | null>, view: string) {
  const can = (s: string) => session()?.subTasks.includes(s) ?? false;
  const management = computed(() => session()?.roles.some((r) => r.readOnly) ?? false);
  const denied = computed(() => !!session() && !can(view));
  const deniedText = computed(() => {
    const role = (session()?.roles ?? []).map((r) => r.name).join(', ');
    return `Your role (${role}) doesn't include this task. Ask the institution administrator if you need it.`;
  });
  const why = (sub: string) => (management() ? MANAGEMENT_WHY : can(sub) ? '' : NO_TASK);
  return { can, management, denied, deniedText, why };
}

/** The day's status as the register names it, with the prototype's tone (ui.status). */
export const STATUS_CHIP: Readonly<Record<DailyStatus, { l: () => string; tone: string }>> = {
  PRESENT: { l: () => translate('status.attendance.present'), tone: 'ok' },
  LATE: { l: () => translate('status.attendance.late'), tone: 'warn' },
  HALF_DAY: { l: () => translate('status.attendance.halfDay'), tone: 'warn' },
  ABSENT: { l: () => translate('status.attendance.absent'), tone: 'bad' },
};

/** The status a one-day report row stands for (counts are 0 or 1), or null when not marked. */
export function dayStatus(r: {
  present: number;
  late: number;
  halfDay: number;
  absent: number;
}): DailyStatus | null {
  if (r.present) return 'PRESENT';
  if (r.late) return 'LATE';
  if (r.halfDay) return 'HALF_DAY';
  if (r.absent) return 'ABSENT';
  return null;
}

/** The prototype's attTone: the attendance bar's colour. */
export const attTone = (p: number) => (p >= 90 ? 'ok' : p >= 75 ? 'warn' : 'bad');

/** RP pct: a whole percentage of a part (0 when there is no whole). */
export const pct = (part: number, whole: number) => (whole ? Math.round((part * 100) / whole) : 0);

/** fmt.pct: "95%", or "94.6%" with one decimal. */
export const pctText = (p: number, dec = 0) =>
  `${dec ? (Math.round(p * 10 ** dec) / 10 ** dec).toFixed(dec) : Math.round(p)}%`;

/** exportCsv: a UTF-8 CSV (with BOM, for spreadsheets) downloaded by the browser. */
export function exportCsv(fileName: string, head: readonly string[], rows: readonly unknown[][]) {
  const q = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [head, ...rows].map((r) => r.map(q).join(','));
  const blob = new Blob([String.fromCharCode(0xfeff) + lines.join('\r\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** "10 min" for a cooling-off in seconds ("45 s" under a minute). */
export const cooling = (seconds: number) =>
  seconds % 60 === 0 || seconds >= 120 ? `${Math.round(seconds / 60)} min` : `${seconds} s`;
