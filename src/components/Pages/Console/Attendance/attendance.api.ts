/**
 * Console attendance API (ATT-008…014): the day by class-section with teachers and staff, members'
 * attendance over a date range, manual marking, the auto-absent setting with its runs, and the
 * attendance types (places with a cooling-off interval). Writes send an Idempotency-Key; the
 * auto-absent setting is versioned (If-Match "v<n>", "v0" while never set).
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { newIdempotencyKey } from '../../../Utils/ids';
import type { YearRef } from '../Structure/academic-year';

export type DailyStatus = 'PRESENT' | 'LATE' | 'HALF_DAY' | 'ABSENT';
export type ReportType = 'STUDENT' | 'TEACHER' | 'STAFF' | 'ALL';

export interface DayCounts {
  readonly total: number;
  readonly present: number;
  readonly late: number;
  readonly halfDay: number;
  readonly absent: number;
  readonly notMarked: number;
}

export interface SectionDay {
  readonly section: { readonly id: string; readonly label: string };
  readonly students: number;
  readonly present: number;
  readonly late: number;
  readonly halfDay: number;
  readonly absent: number;
  readonly notMarked: number;
  /** Present, late and half day over the students; null without students. */
  readonly percentage: number | null;
}

/** ATT-008: one day of the year by class-section, with teachers and other staff. */
/** ATT-029: a staff member's day (client 2026-10-22). */
export interface StaffDay {
  readonly member: {
    readonly id: string;
    readonly name: string;
    readonly type: string;
    /** A teacher or the principal (else non-teaching staff). */
    readonly teaching: boolean;
    readonly hasCard: boolean;
  };
  readonly status: DailyStatus | null;
  readonly checkInAt: string | null;
  readonly checkOutAt: string | null;
  readonly method: 'NFC' | 'MANUAL' | null;
  readonly remark: string | null;
  readonly onApprovedLeave: boolean;
}

export interface StaffRoster {
  readonly date: string;
  readonly today: boolean;
  readonly counts: DayCounts & { readonly onCampus: number };
  readonly items: readonly StaffDay[];
}

/** ATT-030/031: what a check-in or check-out did. */
export interface StaffCheck {
  readonly result: 'CHECKED_IN' | 'CHECKED_OUT' | 'COMPLETE';
  readonly status: DailyStatus;
  readonly member: { readonly id: string; readonly name: string };
  readonly at: string;
}

export interface AttendanceOverview {
  readonly date: string;
  readonly year: YearRef;
  /** The holiday's title when the day is a holiday for everyone. */
  readonly holiday: string | null;
  readonly sunday: boolean;
  readonly students: DayCounts;
  readonly staff: { readonly teachers: DayCounts; readonly others: DayCounts };
  readonly sections: readonly SectionDay[];
}

export interface MemberAttendance {
  readonly member: {
    readonly id: string;
    readonly name: string;
    readonly admissionNo: string | null;
    readonly type: string;
  };
  readonly present: number;
  readonly late: number;
  readonly halfDay: number;
  readonly absent: number;
  readonly notMarked: number;
  readonly percentage: number | null;
}

/** ATT-009: members' attendance over a date range (100 a page). */
export interface AttendanceReport {
  readonly from: string;
  readonly to: string;
  readonly type: ReportType;
  readonly schoolDays: number;
  readonly items: readonly MemberAttendance[];
  readonly nextCursor: string | null;
}

export type StaffLeaveType = 'CASUAL' | 'MEDICAL' | 'EARNED';

/** ATT-032: one staff member's month for payroll. */
export interface PayrollRow {
  readonly member: {
    readonly id: string;
    readonly name: string;
    readonly employeeNo: string | null;
    readonly type: string;
    readonly teaching: boolean;
    readonly department: string | null;
    readonly joinedOn: string | null;
    readonly leftOn: string | null;
  };
  /** School days while employed, up to the last day read. */
  readonly workingDays: number;
  readonly present: number;
  readonly late: number;
  readonly halfDay: number;
  readonly paidLeave: number;
  readonly absent: number;
  readonly notMarked: number;
  readonly leave: { readonly casual: number; readonly medical: number; readonly earned: number };
  /** Days of the month before joining or after leaving. */
  readonly notEmployed: number;
  readonly lopDays: number;
  readonly payableDays: number;
  /** The days that aren't a plain Present, in date order. */
  readonly exceptions: readonly {
    readonly date: string;
    readonly kind: 'LATE' | 'HALF_DAY' | 'ABSENT' | 'LEAVE' | 'NOT_MARKED';
    readonly leaveType: StaffLeaveType | null;
  }[];
}

/** ATT-032: the staff's month for payroll — loss of pay and payable days (client 2026-10-22). */
export interface PayrollMonth {
  /** "2026-10". */
  readonly month: string;
  readonly from: string;
  readonly to: string;
  /** The last day read (today in a running month); null before the month begins. */
  readonly through: string | null;
  readonly complete: boolean;
  readonly days: number;
  readonly workingDays: number;
  readonly sundays: number;
  readonly holidays: readonly { readonly date: string; readonly title: string }[];
  readonly counts: {
    readonly staff: number;
    readonly withLop: number;
    readonly notMarked: number;
  };
  readonly items: readonly PayrollRow[];
}

export interface MarkEntry {
  readonly memberId: string;
  readonly status: DailyStatus;
  readonly remark?: string | null;
}

export interface AutoAbsent {
  readonly enabled: boolean;
  /** "10:30" */
  readonly cutoff: string;
  readonly appliesTo: readonly ('STUDENTS' | 'STAFF')[];
  readonly version: number;
  readonly runs: readonly {
    readonly date: string;
    readonly marked: number;
    readonly skippedHoliday: boolean;
    readonly ranAt: string | null;
    /** The staff timing the run was for; null (or absent): the school's cut-off. */
    readonly timing?: string | null;
  }[];
}

/** The six times of a staff timing, "HH:MM" (client 2026-10-23). */
export interface StaffTimingTimes {
  readonly loginTime: string;
  readonly lateLoginTime: string;
  readonly halfDayTime: string;
  readonly absentTime: string;
  readonly earlyLogoutTime: string;
  readonly logoutTime: string;
}

/** ATT-033: a staff timing for one or more roles. */
export interface StaffTiming extends StaffTimingTimes {
  readonly id: string;
  readonly name: string;
  readonly roles: readonly { readonly id: string; readonly name: string }[];
  /** Active staff who follow it. */
  readonly staff: number;
  readonly version: number;
}

/** A role a timing can be for, and the timing it is in. */
export interface StaffTimingRole {
  readonly id: string;
  readonly name: string;
  readonly timingId: string | null;
}

export interface StaffTimingInput extends StaffTimingTimes {
  readonly name: string;
  readonly roleIds: readonly string[];
}

export interface AttendanceType {
  readonly id: string;
  readonly name: string;
  readonly cooldownSeconds: number;
  readonly checkInsToday: number;
  /** Location readers set up with this type. */
  readonly readers: number;
}

const once = () => ({ 'Idempotency-Key': newIdempotencyKey() });

@Injectable({ providedIn: 'root' })
export class AttendanceApi {
  private readonly http = inject(HttpClient);

  overview(date: string, yearId = '') {
    return firstValueFrom(
      this.http.get<AttendanceOverview>('/api/v1/console/attendance/overview', {
        params: { date, ...(yearId ? { yearId } : {}) },
      }),
    );
  }

  report(f: {
    from: string;
    to: string;
    type: ReportType;
    classSection?: string;
    cursor?: string | null;
  }) {
    return firstValueFrom(
      this.http.get<AttendanceReport>('/api/v1/console/attendance/reports', {
        params: {
          from: f.from,
          to: f.to,
          type: f.type,
          ...(f.classSection ? { classSection: f.classSection } : {}),
          ...(f.cursor ? { cursor: f.cursor } : {}),
        },
      }),
    );
  }

  /** Every page of a report (the server pages by 100). */
  async reportAll(f: { from: string; to: string; type: ReportType; classSection?: string }) {
    const items: MemberAttendance[] = [];
    let cursor: string | null = null;
    let first: AttendanceReport | null = null;
    for (let i = 0; i < 30; i++) {
      const r: AttendanceReport = await this.report({ ...f, cursor });
      first ??= r;
      items.push(...r.items);
      if (!r.nextCursor) break;
      cursor = r.nextCursor;
    }
    return { ...first!, items, nextCursor: null } as AttendanceReport;
  }

  markDaily(date: string, entries: readonly MarkEntry[]) {
    return firstValueFrom(
      this.http.put<{ date: string; saved: number; overridden: number }>(
        '/api/v1/console/attendance/daily',
        { date, entries },
        { headers: once() },
      ),
    );
  }

  /** ATT-032: each staff member's month for payroll (client 2026-10-22). */
  payroll(month: string, type: 'ALL' | 'TEACHERS' | 'STAFF' = 'ALL') {
    return firstValueFrom(
      this.http.get<PayrollMonth>('/api/v1/console/attendance/payroll', {
        params: { month, ...(type !== 'ALL' ? { type } : {}) },
      }),
    );
  }

  // staff attendance at the front desk (client 2026-10-22)
  /** ATT-029: the staff of a date with their status and times. */
  staff(f: { date?: string; type?: 'ALL' | 'TEACHERS' | 'STAFF' } = {}) {
    return firstValueFrom(
      this.http.get<StaffRoster>('/api/v1/console/attendance/staff', {
        params: { ...(f.date ? { date: f.date } : {}), ...(f.type ? { type: f.type } : {}) },
      }),
    );
  }
  /** ATT-030: a staff card on the desk's reader — check in, or out. */
  staffTap(cardToken: string) {
    return firstValueFrom(
      this.http.post<StaffCheck>(
        '/api/v1/console/attendance/staff/card-taps',
        { cardToken },
        { headers: once() },
      ),
    );
  }
  /** ATT-031: check a staff member in or out by name, now. */
  staffCheck(memberId: string, action: 'IN' | 'OUT', remark?: string | null) {
    return firstValueFrom(
      this.http.post<StaffCheck>(
        '/api/v1/console/attendance/staff/checks',
        { memberId, action, ...(remark ? { remark } : {}) },
        { headers: once() },
      ),
    );
  }

  autoAbsent() {
    return firstValueFrom(this.http.get<AutoAbsent>('/api/v1/console/attendance/auto-absent'));
  }

  setAutoAbsent(
    version: number,
    body: { enabled: boolean; cutoff: string; appliesTo: readonly ('STUDENTS' | 'STAFF')[] },
  ) {
    return firstValueFrom(
      this.http.put<AutoAbsent>('/api/v1/console/attendance/auto-absent', body, {
        headers: { 'If-Match': `"v${version}"` },
      }),
    );
  }

  /** ATT-033…036: the staff timings by role (client 2026-10-23). */
  staffTimings() {
    return firstValueFrom(
      this.http.get<{ items: StaffTiming[]; roles: StaffTimingRole[] }>(
        '/api/v1/console/attendance/staff-timings',
      ),
    );
  }

  createStaffTiming(body: StaffTimingInput) {
    return firstValueFrom(
      this.http.post<StaffTiming>('/api/v1/console/attendance/staff-timings', body, {
        headers: once(),
      }),
    );
  }

  updateStaffTiming(id: string, version: number, body: StaffTimingInput) {
    return firstValueFrom(
      this.http.put<StaffTiming>(
        `/api/v1/console/attendance/staff-timings/${encodeURIComponent(id)}`,
        body,
        { headers: { 'If-Match': `"v${version}"` } },
      ),
    );
  }

  deleteStaffTiming(id: string) {
    return firstValueFrom(
      this.http.delete<void>(`/api/v1/console/attendance/staff-timings/${encodeURIComponent(id)}`),
    );
  }

  types() {
    return firstValueFrom(
      this.http.get<{ items: AttendanceType[] }>('/api/v1/console/attendance-types'),
    );
  }

  createType(body: { name: string; cooldownSeconds: number }) {
    return firstValueFrom(
      this.http.post<AttendanceType>('/api/v1/console/attendance-types', body, {
        headers: once(),
      }),
    );
  }
}
