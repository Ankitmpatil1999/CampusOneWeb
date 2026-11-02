/**
 * The teacher's day, classes, rosters, timetable, registers and student leave (ACA-044…047,
 * ATT-019…022, ACA-055/056) — the app's teacher routes, reached with the console session.
 */
import { Injectable, inject } from '@angular/core';
import { TeachingHttp } from './teaching.http';

export interface Period {
  readonly id?: string;
  readonly name: string;
  readonly startsAt: string;
  readonly endsAt: string;
}
export interface Slot {
  readonly day: number;
  readonly period: Period;
  readonly subject: { readonly id: string; readonly name: string; readonly colour: string };
  readonly teacher: { readonly id: string; readonly name: string };
  readonly section: { readonly id: string; readonly label: string };
}
export interface Today {
  readonly year: { readonly id: string; readonly label: string };
  readonly date: string;
  readonly teacher: { readonly name: string };
  readonly assigned: boolean;
  readonly classTeacherOf: readonly {
    readonly id: string;
    readonly label: string;
    readonly students: number;
    readonly registerMarked: number;
  }[];
  readonly subjectSections: readonly {
    readonly id: string;
    readonly label: string;
    readonly subjects: readonly {
      readonly id: string;
      readonly name: string;
      readonly colour: string;
    }[];
  }[];
  readonly periods: readonly (Slot & { readonly state: 'DONE' | 'NOW' | 'LATER' })[];
  readonly homeworkToReview: number;
}
export interface ClassItem {
  readonly id: string;
  readonly label: string;
  readonly students: number;
  readonly classTeacher: boolean;
  readonly subjects: readonly {
    readonly id: string;
    readonly name: string;
    readonly colour: string;
  }[];
}
export interface Roster {
  readonly section: { readonly id: string; readonly label: string; readonly classTeacher: boolean };
  readonly items: readonly {
    readonly id: string;
    readonly name: string;
    readonly admissionNo: string | null;
    readonly gender: string | null;
    readonly attendanceToday: string | null;
  }[];
}
export interface Timetable {
  readonly year: { readonly id: string; readonly label: string };
  readonly days: readonly { readonly day: number; readonly label: string }[];
  readonly periods: readonly (Period & { readonly isBreak: boolean })[];
  readonly mine: readonly Slot[];
  /** The asked section's whole week (`classSectionId`), every teacher's periods in it. */
  readonly section: {
    readonly id: string;
    readonly label: string;
    readonly slots: readonly Slot[];
  } | null;
  readonly today: number;
}
export type DailyStatus = 'PRESENT' | 'LATE' | 'HALF_DAY' | 'ABSENT';
export interface Register {
  readonly date: string;
  readonly section: { readonly id: string; readonly label: string };
  readonly sections: readonly { readonly id: string; readonly label: string }[];
  /** The holiday's title, when the date is one. */
  readonly holiday: string | null;
  readonly sunday: boolean;
  readonly counts: {
    readonly students: number;
    readonly present: number;
    readonly late: number;
    readonly halfDay: number;
    readonly absent: number;
    readonly notMarked: number;
    readonly onLeave: number;
  };
  readonly items: readonly {
    readonly student: {
      readonly id: string;
      readonly name: string;
      readonly admissionNo: string | null;
    };
    readonly status: DailyStatus | null;
    readonly method: string | null;
    readonly remark: string | null;
    readonly onApprovedLeave: boolean;
  }[];
}
/** ATT-028: MARKED now, or ALREADY recorded (by an earlier tap or mark). */
export interface CardTapResult {
  readonly result: 'MARKED' | 'ALREADY';
  readonly status: DailyStatus;
  readonly student: { readonly id: string; readonly name: string };
  readonly at: string;
}
export interface MyPeriod {
  readonly slotId: string;
  readonly period: Period;
  readonly subject: { readonly name: string; readonly colour: string };
  readonly section: { readonly id: string; readonly label: string };
  readonly students: number;
  readonly captured: number;
  readonly state: 'DONE' | 'NOW' | 'LATER' | null;
}
export interface StudentLeave {
  readonly id: string;
  readonly reference: string;
  readonly student: {
    readonly id: string;
    readonly name: string;
    readonly admissionNo: string | null;
  };
  readonly section: { readonly id: string; readonly label: string };
  readonly from: string;
  readonly to: string;
  readonly schoolDays: number;
  readonly reason: string;
  readonly document: { readonly name: string } | null;
  readonly appliedBy: string | null;
  readonly appliedAt: string | null;
  readonly status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  readonly decidedBy: string | null;
  readonly remarks: string | null;
}
export interface LeaveList {
  readonly classTeacher: boolean;
  readonly counts: {
    readonly pending: number;
    readonly approved: number;
    readonly rejected: number;
    readonly all: number;
  };
  readonly items: readonly StudentLeave[];
}

@Injectable({ providedIn: 'root' })
export class ClassesApi {
  private readonly http = inject(TeachingHttp);

  today() {
    return this.http.get<Today>('/teacher/today');
  }
  classes() {
    return this.http.get<{ items: readonly ClassItem[] }>('/teacher/classes');
  }
  roster(sectionId: string) {
    return this.http.get<Roster>(`/teacher/classes/${encodeURIComponent(sectionId)}/students`);
  }
  /** My week and, with a section I teach, that section's week too. */
  timetable(sectionId?: string) {
    return this.http.get<Timetable>('/teacher/timetable', { classSectionId: sectionId });
  }
  register(sectionId: string | null, date: string) {
    return this.http.get<Register>('/teacher/attendance/register', {
      classSectionId: sectionId,
      date,
    });
  }
  saveRegister(
    sectionId: string,
    date: string,
    entries: readonly { studentId: string; status: DailyStatus; remark?: string | null }[],
  ) {
    return this.http.send<{ date: string }>('PUT', '/teacher/attendance/register', {
      classSectionId: sectionId,
      date,
      entries,
    });
  }
  periods(date: string) {
    return this.http.get<{ date: string; items: readonly MyPeriod[] }>(
      '/teacher/attendance/periods',
      { date },
    );
  }
  /** ATT-028: a student's card on this computer's reader (today only). */
  cardTap(
    body:
      | { cardToken: string; mode: 'DAILY'; classSectionId: string }
      | { cardToken: string; mode: 'PERIOD'; slotId: string },
  ) {
    return this.http.send<CardTapResult>('POST', '/teacher/attendance/card-taps', body);
  }
  markPeriod(
    slotId: string,
    date: string,
    entries: readonly { studentId: string; status: 'PRESENT' | 'LATE' | 'ABSENT' }[],
  ) {
    return this.http.send<unknown>(
      'PUT',
      `/teacher/attendance/periods/${encodeURIComponent(slotId)}`,
      { date, entries },
    );
  }
  leaves(status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'all') {
    return this.http.get<LeaveList>('/teacher/student-leaves', { status });
  }
  decide(id: string, decision: 'APPROVED' | 'REJECTED', remarks: string | null) {
    return this.http.send<StudentLeave>(
      'POST',
      `/teacher/student-leaves/${encodeURIComponent(id)}/decision`,
      { decision, remarks },
    );
  }
}
