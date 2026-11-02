/**
 * The principal on the web (client 2026-10-13): the app's principal routes — the school overview
 * (ACA-060), teacher and staff leave for decision (ACA-061, ACA-062), people (ACA-064), academics
 * (ACA-063), the day's attendance (ATT-026), the school's announcements (COM-024, COM-026,
 * COM-027, COM-030, COM-031) and the Student and Teacher Overviews (SRS 20.32, 20.33; ACA-079…081)
 * — reached with the console session holding the Principal role, as the teacher routes are.
 */
import { Injectable, inject } from '@angular/core';
import type {
  AckPage,
  Announcement,
  AnnouncementList,
  Channel,
  NewAnnouncement,
} from '../Announcements/announcements.api';
import { TeachingHttp } from '../Teaching/teaching.http';
import type { MyLeave } from '../Teaching/me.api';

export interface Year {
  readonly id: string;
  readonly label: string;
}

export interface DayCount {
  readonly total: number;
  /** On time + late + half day. */
  readonly attended: number;
  /** Each count of the day (client 2026-10-25); absent from an API before then. */
  readonly present?: number;
  readonly late?: number;
  readonly halfDay?: number;
  readonly absent: number;
  readonly notMarked: number;
  readonly percentage: number | null;
}

export interface Overview {
  readonly year: Year;
  readonly date: string;
  readonly principal: { readonly name: string };
  readonly people: { readonly students: number; readonly teachers: number; readonly staff: number };
  readonly attendanceToday: {
    readonly students: DayCount;
    readonly teachers: DayCount;
    readonly staff: DayCount;
  };
  readonly staffOnLeaveToday: number;
  readonly approvals: {
    readonly teacherLeaveAwaitingYou: number;
    readonly teacherLeaveWithCoordinator: number;
    readonly studentLeavePending: number;
  };
  readonly academics: {
    readonly sections: number;
    readonly topPerformers: number;
    readonly needsSupport: number;
    readonly upcomingExams: number;
  };
}

// --- teacher and staff leave ----------------------------------------------------------------------

export type LeaveQueue = 'AWAITING' | 'COORDINATOR' | 'DECIDED';

export interface StaffLeave extends MyLeave {
  readonly staff: { readonly id: string; readonly name: string; readonly type: string };
  readonly balance: { readonly total: number; readonly left: number };
  /** Others away on some of the same days (approved, or waiting for the principal). */
  readonly alsoAway: readonly string[];
}

export interface StaffLeaves {
  readonly year: Year;
  readonly counts: {
    readonly awaiting: number;
    readonly coordinator: number;
    readonly decided: number;
  };
  readonly items: readonly StaffLeave[];
}

// --- people, academics, attendance ----------------------------------------------------------------

export type PeopleType = 'STUDENTS' | 'TEACHERS' | 'STAFF';

export interface StudentRow {
  readonly id: string;
  readonly name: string;
  readonly admissionNo: string | null;
  readonly class: string;
  readonly section: string;
  readonly status: string;
}

export interface StaffRow {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly status: string;
  readonly classTeacherOf: readonly string[];
  readonly subjects: readonly string[];
}

export interface People {
  readonly year: Year;
  readonly type: PeopleType;
  readonly items: readonly (StudentRow | StaffRow)[];
  readonly nextCursor: string | null;
}

export type Standing = 'Top Performer' | 'Needs Support' | 'Average';

export interface UpcomingExam {
  readonly id: string;
  readonly name: { readonly id: string; readonly name: string };
  readonly section: { readonly id: string; readonly label: string };
  readonly subject: { readonly id: string; readonly name: string };
  readonly date: string;
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly maxMarks: number;
}

export interface Academics {
  readonly year: Year;
  readonly sections: readonly {
    readonly section: { readonly id: string; readonly label: string };
    readonly average: number;
    readonly passRate: number;
    readonly standing: Standing;
  }[];
  readonly upcomingExams: readonly UpcomingExam[];
  readonly timetables: readonly {
    readonly section: { readonly id: string; readonly label: string };
    readonly lessonsAWeek: number;
  }[];
}

export interface SectionDay {
  readonly section: { readonly id: string; readonly label: string };
  readonly students: number;
  /** On time + late + half day. */
  readonly attended: number;
  /** Each count of the day (client 2026-10-25); absent from an API before then. */
  readonly present?: number;
  readonly late?: number;
  readonly halfDay?: number;
  readonly absent: number;
  readonly percentage: number | null;
}

export interface StaffDay {
  readonly member: { readonly id: string; readonly name: string; readonly type: string };
  readonly status: 'PRESENT' | 'LATE' | 'HALF_DAY' | 'ABSENT' | null;
  readonly checkInAt: string | null;
  readonly checkOutAt: string | null;
  readonly onApprovedLeave: boolean;
}

export interface SchoolDay {
  readonly date: string;
  readonly type: PeopleType;
  readonly items: readonly (SectionDay | StaffDay)[];
}

// --- Student Overview (SRS 20.32) and Teacher Overview (SRS 20.33), client 2026-10-14 -------------

/** ACA-079: one student of the institution. */
export interface OverviewStudent {
  readonly id: string;
  readonly memberNo: string;
  readonly name: string;
  readonly class: string | null;
  readonly section: string | null;
  readonly admissionNo: string | null;
  readonly department: string | null;
  readonly status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  /** The primary contact (else the first guardian on record). */
  readonly contact: {
    readonly name: string;
    readonly relation: string;
    readonly mobile: string | null;
    readonly email: string | null;
  } | null;
}

export interface StudentOverview {
  readonly year: Year;
  readonly items: readonly OverviewStudent[];
}

type Money = { readonly amount: string; readonly currency: string };
export interface DetailAddress {
  readonly line1: string;
  readonly line2?: string | null;
  readonly city: string;
  readonly state: string;
  readonly pin: string;
}
export interface DetailPerson {
  readonly name: string;
  readonly mobile: string | null;
  readonly email: string | null;
  readonly occupation: string | null;
  /** The father's and the mother's, in rupees (client 2026-10-14). */
  readonly annualIncome?: number | null;
}
export type FeeRecordStatus = 'DUE' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';

/** ACA-082: one student in full (client 2026-10-14). */
export interface StudentDetail {
  readonly year: Year;
  readonly student: {
    readonly id: string;
    readonly memberNo: string;
    readonly name: string;
    readonly gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
    readonly dateOfBirth: string | null;
    readonly admissionNo: string | null;
    readonly joinedOn: string | null;
    readonly department: string | null;
    readonly status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
    readonly statusReason: string | null;
    readonly class: string | null;
    readonly section: string | null;
    readonly enrolledOn: string | null;
    readonly classTeacher: string | null;
    readonly mobile: string | null;
    readonly email: string | null;
    readonly campusOneAccount: boolean;
    readonly bloodGroup: string | null;
    readonly category: string | null;
    readonly medium: string | null;
    readonly allergies: string | null;
    readonly health: string | null;
    readonly aadhaar: string | null;
    readonly pan: string | null;
    readonly customFields: readonly { readonly label: string; readonly value: unknown }[];
  };
  readonly family: {
    readonly guardians: readonly {
      readonly name: string;
      readonly relation: string;
      readonly mobile: string | null;
      readonly email: string | null;
      readonly primary: boolean;
      readonly status: string;
    }[];
    readonly father: DetailPerson | null;
    readonly mother: DetailPerson | null;
    readonly guardian: (DetailPerson & { readonly relation: string | null }) | null;
    readonly children: 'SINGLE' | 'MORE' | null;
  };
  readonly addresses: {
    readonly residential: DetailAddress | null;
    readonly correspondence: DetailAddress | null;
    readonly sameAsResidential: boolean;
  } | null;
  readonly previousSchool: {
    readonly school: string;
    readonly lastClass: string | null;
    readonly result: string | null;
    readonly board: string | null;
  } | null;
  readonly admission: {
    readonly applicationNo: string;
    readonly admittedOn: string | null;
    readonly midTerm: boolean;
    readonly joiningDate: string | null;
    readonly fees: readonly {
      readonly feeType: 'APPLICATION' | 'ADMISSION';
      readonly amount: Money;
      readonly status: string;
      readonly receiptNo: string | null;
      /** The payment gateway's transaction ID (client 2026-10-16). */
      readonly transactionId?: string | null;
      readonly paidAt: string | null;
    }[];
  } | null;
  readonly transport: {
    readonly choice: { readonly opted: boolean; readonly stop: string | null } | null;
    readonly allocation: {
      readonly route: { readonly code: string; readonly name: string; readonly type: string };
      readonly stop: { readonly name: string; readonly landmark: string | null };
      readonly pickUp: string | null;
      readonly drop: string | null;
      readonly from: string | null;
      readonly to: string | null;
    } | null;
    readonly trips: readonly {
      readonly session: string;
      readonly direction: string;
      readonly startTime: string;
      readonly vehicle: { readonly name: string; readonly registration: string };
      readonly driver: { readonly name: string; readonly mobile: string | null };
      readonly attendant: string | null;
    }[];
  };
  readonly hostel: {
    readonly opted: boolean;
    readonly localGuardian: {
      readonly name: string;
      readonly relation: string | null;
      readonly mobile: string | null;
      readonly address: string | null;
    } | null;
  };
  readonly fees: {
    readonly structure: string | null;
    readonly summary: {
      readonly annual: Money;
      readonly paid: Money;
      readonly outstanding: Money;
      readonly paidPercent: number;
      readonly overdue: number;
    };
    readonly next: FeeRecordRow | null;
    readonly heads: readonly { readonly name: string; readonly amount: Money }[];
    readonly records: readonly FeeRecordRow[];
    readonly consent: {
      readonly valid: boolean;
      readonly validUntil: string | null;
      readonly agreedAt: string | null;
    } | null;
    readonly financing: { readonly status: string; readonly partnerName: string | null } | null;
  };
  readonly wallet: {
    readonly number: string | null;
    readonly status: string;
    readonly balance: Money;
  } | null;
  readonly attendance: {
    readonly days: number;
    readonly present: number;
    readonly late: number;
    readonly halfDay: number;
    readonly absent: number;
    readonly percentage: number | null;
  };
  readonly leave: { readonly pending: number; readonly approved: number; readonly days: number };
}

export interface FeeRecordRow {
  readonly label: string;
  readonly dueDate: string;
  readonly amount: Money;
  readonly fine: Money;
  readonly paid: Money;
  readonly amountDue: Money;
  readonly status: FeeRecordStatus;
  readonly financed: boolean;
  readonly paidAt: string | null;
  readonly receipt: string | null;
}

export type TeacherRole = 'CLASS_TEACHER' | 'SUBJECT_TEACHER';

/** ACA-080: a teacher of the year's mapping, once. */
export interface OverviewTeacher {
  readonly id: string;
  readonly name: string;
  readonly primaryClass: { readonly class: string; readonly section: string | null } | null;
  readonly roles: readonly TeacherRole[];
  readonly assignments: number;
  /** The classes they teach in, for the class filter. */
  readonly classIds: readonly string[];
}

export interface TeacherOverview {
  readonly year: Year;
  readonly classes: readonly { readonly id: string; readonly name: string }[];
  readonly items: readonly OverviewTeacher[];
}

/** ACA-081: one teacher's academic detail. */
export interface TeacherDetail {
  readonly year: Year;
  readonly id: string;
  readonly name: string;
  readonly employeeNo: string | null;
  readonly userType: string;
  readonly email: string | null;
  readonly mobile: string | null;
  readonly counts: {
    readonly classes: number;
    readonly sections: number;
    readonly subjects: number;
  };
  readonly assignments: readonly {
    readonly kind: TeacherRole;
    readonly class: string;
    readonly section: string | null;
    readonly subject: string | null;
    readonly periodsAWeek: number;
  }[];
  // The rest the principal may want (client 2026-10-14).
  readonly memberNo: string;
  readonly department: string | null;
  readonly gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  readonly dateOfBirth: string | null;
  readonly joinedOn: string | null;
  readonly status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  readonly statusReason: string | null;
  readonly campusOneAccount: boolean;
  readonly consoleRoles: readonly string[];
  readonly customFields: readonly { readonly label: string; readonly value: unknown }[];
  readonly classTeacherOf: readonly {
    readonly class: string;
    readonly section: string;
    readonly students: number;
  }[];
  readonly coordinatorOf: readonly string[];
  readonly timetable: {
    readonly periodsAWeek: number;
    /** day: Monday = 1 … Saturday = 6. */
    readonly lessons: readonly {
      readonly day: number;
      readonly period: string;
      readonly startsAt: string | null;
      readonly endsAt: string | null;
      readonly class: string;
      readonly section: string;
      readonly subject: string;
    }[];
  };
  readonly today: {
    readonly date: string;
    readonly status: 'PRESENT' | 'LATE' | 'HALF_DAY' | 'ABSENT' | null;
    readonly checkInAt: string | null;
    readonly checkOutAt: string | null;
    readonly onLeave: boolean;
  };
  readonly attendance: {
    readonly days: number;
    readonly present: number;
    readonly late: number;
    readonly halfDay: number;
    readonly absent: number;
    readonly percentage: number | null;
  };
  readonly leave: {
    readonly balances: readonly {
      readonly type: string;
      readonly label: string;
      readonly total: number;
      readonly used: number;
      readonly pending: number;
      readonly left: number;
    }[];
    readonly recent: readonly {
      readonly type: string;
      readonly from: string | null;
      readonly to: string | null;
      readonly days: number;
      readonly state: string;
      readonly appliedAt: string | null;
    }[];
  };
  readonly homework: { readonly set: number; readonly open: number; readonly toReview: number };
  readonly exams: {
    readonly total: number;
    readonly marksEntered: number;
    readonly published: number;
    readonly marksDue: number;
    readonly upcoming: readonly {
      readonly exam: string;
      readonly class: string;
      readonly section: string;
      readonly subject: string;
      readonly date: string | null;
    }[];
  };
  readonly transport: {
    readonly route: { readonly code: string; readonly name: string };
    readonly stop: string;
    readonly pickUp: string | null;
    readonly drop: string | null;
  } | null;
  readonly wallet: { readonly status: string; readonly balance: Money } | null;
}

// --- announcements --------------------------------------------------------------------------------

export interface AnnouncementOptions {
  readonly categories: AnnouncementList['categories'];
  readonly channels: readonly Channel[];
}

@Injectable({ providedIn: 'root' })
export class PrincipalApi {
  private readonly http = inject(TeachingHttp);

  overview() {
    return this.http.get<Overview>('/principal/overview');
  }

  leaves(status: LeaveQueue) {
    return this.http.get<StaffLeaves>('/principal/teacher-leaves', { status });
  }
  /** ACA-062: remarks are required when rejecting. */
  decide(id: string, decision: 'APPROVED' | 'REJECTED', remarks: string | null) {
    return this.http.send<unknown>(
      'POST',
      `/principal/teacher-leaves/${encodeURIComponent(id)}/decision`,
      { decision, remarks },
    );
  }

  people(q: {
    type: PeopleType;
    q?: string;
    classSection?: string | null;
    cursor?: string | null;
  }) {
    return this.http.get<People>('/principal/people', q);
  }

  academics() {
    return this.http.get<Academics>('/principal/academics');
  }

  attendance(date: string, type: PeopleType) {
    return this.http.get<SchoolDay>('/principal/attendance', { date, type });
  }

  /** ACA-079 (SRS 20.32): every student, for the screen to search and filter. */
  studentOverview() {
    return this.http.get<StudentOverview>('/principal/student-overview');
  }
  /** ACA-082: one student in full (client 2026-10-14). */
  student(id: string) {
    return this.http.get<StudentDetail>(`/principal/student-overview/${encodeURIComponent(id)}`);
  }
  /** ACA-080 (SRS 20.33). */
  teacherOverview() {
    return this.http.get<TeacherOverview>('/principal/teacher-overview');
  }
  /** ACA-081 (SRS 20.33): one teacher. */
  teacher(id: string) {
    return this.http.get<TeacherDetail>(`/principal/teacher-overview/${encodeURIComponent(id)}`);
  }

  announcements(q: { category?: string | null; cursor?: string | null } = {}) {
    return this.http.get<AnnouncementList>('/principal/announcements', q);
  }
  options() {
    return this.http.get<AnnouncementOptions>('/me/announcement-options');
  }
  announce(body: NewAnnouncement) {
    return this.http.send<Announcement>('POST', '/principal/announcements', body);
  }
  acknowledgements(id: string, q: { acked?: 'true' | 'false'; cursor?: string | null } = {}) {
    return this.http.get<AckPage>(
      `/principal/announcements/${encodeURIComponent(id)}/acknowledgements`,
      q,
    );
  }
  remind(id: string, channels: readonly Channel[]) {
    return this.http.send<{ reminded: number }>(
      'POST',
      `/principal/announcements/${encodeURIComponent(id)}/reminders`,
      { channels },
    );
  }
}
