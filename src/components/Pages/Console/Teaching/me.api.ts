/**
 * The teacher's own side on the web (client 2026-10-12): their leave (ACA-057…059), school notices
 * and notifications (COM-011…015), messages (COM-016…021), their attendance (ATT-023), the school
 * calendar (ACA-066) and their school bus (TRN-034) — the app's `/me` routes, reached with the
 * console session (teaching access) as the teacher routes are.
 */
import { Injectable, inject } from '@angular/core';
import { TeachingHttp } from './teaching.http';

// --- my leave ------------------------------------------------------------------------------------------

export type StaffLeaveType = 'CASUAL' | 'MEDICAL' | 'EARNED';
/** Where a request stands: with the coordinator, then the principal, then decided (or cancelled). */
export type StaffLeaveState =
  'PENDING' | 'WITH_PRINCIPAL' | 'REJECTED_BY_COORDINATOR' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface LeaveBalance {
  readonly type: StaffLeaveType;
  readonly label: string;
  readonly total: number;
  readonly used: number;
  readonly pending: number;
  readonly left: number;
}

interface Review {
  readonly status: string;
  readonly by: string | null;
  readonly at: string | null;
  readonly remarks: string | null;
}

export interface MyLeave {
  readonly id: string;
  readonly reference: string;
  readonly type: StaffLeaveType;
  readonly typeLabel: string;
  readonly from: string;
  readonly to: string;
  readonly days: number;
  readonly reason: string;
  readonly appliedAt: string | null;
  readonly needsCoordinator: boolean;
  readonly coordinator: Review | null;
  readonly final: Review | null;
  readonly state: StaffLeaveState;
  readonly version: number;
}

export interface MyLeaves {
  readonly year: { readonly id: string; readonly label: string };
  readonly reviewedBy: 'COORDINATOR_THEN_PRINCIPAL' | 'PRINCIPAL';
  readonly balances: readonly LeaveBalance[];
  readonly items: readonly MyLeave[];
}

// --- notices and notifications --------------------------------------------------------------------------

export interface Notice {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly text: string;
  readonly category: {
    readonly code: string;
    readonly label: string;
    readonly colour: string | null;
  } | null;
  readonly important: boolean;
  readonly ackRequired: boolean;
  readonly acknowledged: boolean;
  readonly acknowledgedAt: string | null;
  readonly author: string | null;
  readonly source: string;
  readonly classSection: string | null;
  readonly sentAt: string | null;
}

export interface Notices {
  readonly unacknowledged: number;
  readonly items: readonly Notice[];
  readonly nextCursor: string | null;
}

export interface Notification {
  readonly id: string;
  readonly category: string;
  readonly title: string;
  readonly body: string | null;
  readonly link: string | null;
  readonly read: boolean;
  readonly at: string;
}

export interface Notifications {
  readonly unread: number;
  readonly items: readonly Notification[];
  readonly nextCursor: string | null;
}

// --- messages -------------------------------------------------------------------------------------------

export type DmGroup = 'STUDENT' | 'PARENT' | 'TEACHER' | 'STAFF' | 'PRINCIPAL';

/** A parent's child, shown beside the parent (client 2026-10-23). */
export interface DmChild {
  readonly name: string;
  readonly classSection: string | null;
  /** How the parent is related: FATHER, MOTHER, GUARDIAN … */
  readonly relation: string;
}

export interface Contact {
  readonly profileId: string;
  readonly name: string;
  readonly roleLabel: string;
  readonly sub: string | null;
  /** A parent's children (none for anyone else). */
  readonly children?: readonly DmChild[];
  readonly conversationId: string | null;
}

export interface Contacts {
  readonly allowed: readonly DmGroup[];
  readonly notAllowed: readonly DmGroup[];
  readonly perMinute: number;
  readonly maxChars: number;
  readonly groups: readonly {
    readonly group: DmGroup;
    readonly total: number;
    readonly items: readonly Contact[];
  }[];
}

export interface Correspondent {
  readonly profileId: string;
  readonly name: string;
  readonly roleLabel: string;
  readonly group: DmGroup | null;
  readonly classSection: string | null;
  /** A parent's children (none for anyone else). */
  readonly children?: readonly DmChild[];
}

export interface Conversation {
  readonly conversationId: string;
  readonly with: Correspondent;
  readonly lastMessage: {
    readonly text: string;
    readonly mine: boolean;
    readonly status: string;
    readonly at: string | null;
  } | null;
  readonly unread: number;
  readonly archived: boolean;
  readonly canSend: boolean;
}

export interface Conversations {
  readonly counts: {
    readonly active: number;
    readonly archived: number;
    readonly unreadConversations: number;
  };
  readonly items: readonly Conversation[];
  readonly nextCursor: string | null;
}

export interface Message {
  readonly id: string;
  readonly mine: boolean;
  readonly text: string;
  readonly status: 'SENT' | 'DELIVERED' | 'READ' | string;
  readonly at: string | null;
  readonly deliveredAt: string | null;
  readonly readAt: string | null;
}

export interface Thread {
  readonly conversation: {
    readonly id: string;
    readonly with: Correspondent;
    readonly archived: boolean;
    readonly canSend: boolean;
  };
  readonly items: readonly Message[];
  readonly olderCursor: string | null;
}

// --- my attendance, the calendar, my bus -----------------------------------------------------------------

export interface AttendanceDay {
  readonly date: string;
  readonly status: 'PRESENT' | 'LATE' | 'HALF_DAY' | 'ABSENT' | null;
  readonly checkInAt: string | null;
  readonly checkOutAt: string | null;
  readonly holiday: string | null;
  readonly sunday: boolean;
  readonly onApprovedLeave: boolean;
  readonly future: boolean;
}

export interface AttendanceMonth {
  readonly month: string;
  readonly summary: {
    readonly schoolDays: number;
    readonly present: number;
    readonly late: number;
    readonly halfDay: number;
    readonly absent: number;
    readonly notMarked: number;
    readonly percentage: number | null;
  };
  readonly items: readonly AttendanceDay[];
}

export interface CalendarItem {
  readonly id: string;
  readonly type: string;
  readonly holidayType: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly allDay: boolean;
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly location: string | null;
  readonly colour: string | null;
  readonly occurrences: readonly { readonly start: string; readonly end: string }[];
}

export interface MyCalendar {
  readonly year: { readonly id: string; readonly label: string };
  readonly from: string;
  readonly to: string;
  readonly items: readonly CalendarItem[];
}

export interface MyBus {
  readonly allocation: {
    readonly route: { readonly code: string; readonly name: string };
    readonly stop: { readonly id: string; readonly name: string; readonly landmark: string | null };
    readonly from: string;
    readonly to: string;
  } | null;
  readonly trips: readonly {
    readonly id: string;
    readonly session: string | null;
    readonly direction: string;
    readonly status: string;
    readonly plannedStart: string | null;
    readonly vehicle: { readonly name: string; readonly registration: string };
    readonly myStop: {
      readonly plannedTime: string | null;
      readonly status: string;
      readonly reachedAt: string | null;
    } | null;
  }[];
}

@Injectable({ providedIn: 'root' })
export class MeApi {
  private readonly http = inject(TeachingHttp);

  // my leave
  leaves() {
    return this.http.get<MyLeaves>('/me/staff-leaves');
  }
  applyLeave(body: { type: StaffLeaveType; from: string; to: string; reason: string }) {
    return this.http.send<MyLeave>('POST', '/me/staff-leaves', body);
  }
  cancelLeave(id: string) {
    return this.http.send<MyLeave>(
      'POST',
      `/me/staff-leaves/${encodeURIComponent(id)}/cancellation`,
      {},
    );
  }

  // notices and notifications
  notices(cursor?: string | null) {
    return this.http.get<Notices>('/me/announcements', { cursor });
  }
  acknowledge(id: string) {
    return this.http.send<Notice>(
      'POST',
      `/me/announcements/${encodeURIComponent(id)}/acknowledgement`,
      {},
    );
  }
  notifications(cursor?: string | null) {
    return this.http.get<Notifications>('/me/notifications', { cursor, limit: 30 });
  }
  markRead(body: { ids?: readonly string[]; all?: boolean }) {
    return this.http.send<void>('POST', '/me/notifications/read', body);
  }

  // messages
  contacts(q: string, group?: DmGroup | null) {
    return this.http.get<Contacts>('/me/contacts', { q, group });
  }
  conversations(archived: boolean) {
    return this.http.get<Conversations>('/me/conversations', { archived, limit: 50 });
  }
  thread(id: string, before?: string | null) {
    return this.http.get<Thread>(`/me/conversations/${encodeURIComponent(id)}/messages`, {
      before,
    });
  }
  start(recipientProfileId: string, text: string) {
    return this.http.send<{ conversationId: string; message: Message }>(
      'POST',
      '/me/conversations',
      { recipientProfileId, text },
    );
  }
  send(id: string, text: string) {
    return this.http.send<{ conversationId: string; message: Message }>(
      'POST',
      `/me/conversations/${encodeURIComponent(id)}/messages`,
      { text },
    );
  }
  archive(id: string, archived: boolean) {
    return this.http.send<void>('POST', `/me/conversations/${encodeURIComponent(id)}/archive`, {
      archived,
    });
  }

  // my attendance, the calendar, my bus
  attendance(month: string) {
    return this.http.get<AttendanceMonth>('/me/attendance', { month });
  }
  calendar(from: string, to: string) {
    return this.http.get<MyCalendar>('/me/calendar', { from, to });
  }
  bus() {
    return this.http.get<MyBus>('/me/transport');
  }
}
