/**
 * Helpers of c.frontdesk: the people of the school as the attendance report lists them (the front
 * desk has the attendance task, not the members task), the visit's length and the purposes the
 * prototype offers.
 */
import type { DropdownOption } from '../../../Shared/Dropdown';
import { person } from '../Applications/app-format';
import type { AttendanceApi, ReportType } from '../Attendance/attendance.api';
import { today } from '../Structure/academic-format';

export interface Person {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly admissionNo: string | null;
  readonly kind: Exclude<ReportType, 'ALL'>;
}

/** Students, teaching and other staff (the attendance report of today, every page). */
export async function loadPeople(
  api: AttendanceApi,
  kinds: readonly Exclude<ReportType, 'ALL'>[] = ['STUDENT', 'TEACHER', 'STAFF'],
): Promise<Person[]> {
  const d = today();
  const out: Person[] = [];
  for (const kind of kinds) {
    const r = await api.reportAll({ from: d, to: d, type: kind });
    for (const x of r.items)
      out.push({
        id: x.member.id,
        name: person(x.member.name),
        type: x.member.type,
        admissionNo: x.member.admissionNo,
        kind,
      });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export const personOptions = (list: readonly Person[]): DropdownOption[] =>
  list.map((p) => ({
    v: p.id,
    l: p.name,
    sub: p.kind === 'STUDENT' ? (p.admissionNo ?? p.type) : p.type,
  }));

/** The visit's length in whole minutes (at least 1). */
export const visitMinutes = (from: string, to: string) =>
  Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 60_000));

/** The prototype's visit purposes (cc.vis.new). */
export const PURPOSES = [
  'Parent meeting',
  'Admission enquiry',
  'Vendor delivery',
  'Interview',
  'Maintenance',
  'Official visit',
  'Other',
] as const;
