/**
 * The console home (RPT-001, SRS 24.4, FR-RPT-02): the variant of the signed-in role and its key
 * figures. The home cards read the lists the module pages already use (approvals, tickets,
 * settlements, readers, trips …); each loads on its own, so a card the role can't open stays out.
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { TerminalStatus } from '../Readers/readers.api';

export type HomeVariant =
  | 'admin'
  | 'management'
  | 'accountant'
  | 'counsellor'
  | 'coordinator'
  | 'transport'
  | 'grievance'
  | 'frontdesk';

export interface Money {
  readonly amount: string;
  readonly currency: string;
}

export interface AttendanceToday {
  readonly students: number;
  readonly attended: number;
  readonly absent: number;
  /** null: no students. */
  readonly percentage: number | null;
}

/** The figures of every variant; each variant fills its own. */
export interface HomeKpis {
  readonly members?: { active: number; inactive: number; suspended: number };
  readonly collectionsToday?: { count: number; amount: Money };
  readonly collectionsThisMonth?: { count: number; amount: Money };
  readonly attendanceToday?: AttendanceToday;
  readonly pendingApprovals?: number;
  readonly feeCollectionRate?: number | null;
  readonly collectedThisYear?: Money;
  readonly dueAhead?: Money;
  readonly overdue?: number;
  readonly consentPending?: number;
  readonly waitingForReview?: number;
  readonly admitted?: number;
  readonly midTermApplications?: number;
  readonly teacherLeaveToReview?: number;
  readonly exams?: number;
  readonly periodsAWeek?: number;
  readonly tripsToday?: { total: number; completed: number };
  readonly passengersAllocated?: number;
  readonly vehicles?: { inService: number; total: number; crew: number };
  readonly cancelledThisWeek?: number;
  readonly open?: number;
  readonly escalated?: number;
  readonly awaitingChecker?: number;
  readonly resolvedOrClosed?: number;
  readonly gateCheckInsToday?: { total: number; late: number };
  readonly readers?: { online: number; total: number };
  readonly locationCheckInsToday?: number;
}

export interface HomeView {
  readonly variant: HomeVariant;
  readonly date: string;
  readonly year: { id: string; label: string } | null;
  readonly kpis: HomeKpis;
}

/* ---- the lists the cards read (only the fields they show) ---- */

export interface ApprovalItem {
  readonly id: string;
  readonly no: string;
  readonly module: string;
  readonly area: string;
  readonly action: string;
  readonly summary: string;
  readonly status: string;
  readonly maker: { name: string; you: boolean } | null;
  readonly raisedAt: string;
}

export interface TicketItem {
  readonly id: string;
  readonly ticketNo: string;
  readonly issue: string;
  readonly status: string;
  readonly statusLabel: string;
  readonly priority: number;
  readonly member: { name: string } | null;
  readonly transaction: { amount: Money } | null;
  readonly createdAt: string;
}

export interface AnnouncementItem {
  readonly id: string;
  readonly title: string;
  readonly author: string | null;
  readonly channels: readonly string[];
  readonly targets: { groups: readonly string[] };
  readonly createdAt: string;
  readonly withdrawn: unknown;
}

export interface SettlementItem {
  readonly id: string;
  readonly settlementNo: string;
  readonly date: string;
  readonly status: string;
  readonly lines: number;
  readonly net: Money;
  readonly final?: { remarks?: string | null } | null;
}

export interface ReaderItem {
  readonly id: string;
  readonly name: string;
  readonly location: string;
  readonly purpose: string;
  readonly status: TerminalStatus;
  readonly paired: boolean;
  readonly lastSeenAt: string | null;
  readonly online: boolean;
}

export interface JobRun {
  readonly runId: string;
  readonly job: { id: string; name: string };
  readonly status: string;
  readonly runStatus: string;
  readonly note: string | null;
  readonly startedAt: string;
}

export interface InvoiceItem {
  readonly id: string;
  readonly invoiceNo: string;
  readonly trigger: string;
  readonly period: string;
  readonly total: Money;
  readonly dueOn: string;
  readonly status: string;
  readonly lines: readonly { description: string }[];
}

export interface TripItem {
  readonly id: string;
  readonly session: string;
  readonly route: { code: string; name: string };
  readonly vehicle: { name: string; registration: string; capacity: number } | null;
  readonly driver: string | null;
  readonly plannedStart: string;
  readonly status: 'SCHEDULED' | 'STARTED' | 'COMPLETED' | 'CANCELLED';
}

export interface RouteItem {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly active: boolean;
  readonly passengers: number;
}

export interface LeaveItem {
  readonly id: string;
  readonly staff: { name: string };
  readonly typeLabel: string;
  readonly dates: string;
  readonly reason: string;
  readonly needsCoordinator: boolean;
  readonly coordinator: unknown;
  readonly final: unknown;
}

export interface CalendarItem {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly colour: string | null;
  readonly audience: { kind: string; targets?: readonly { name: string }[] };
  readonly occurrences: readonly { start: string; end: string }[];
}

export interface ApplicationItem {
  readonly id: string;
  readonly applicationNo: string;
  readonly source: string;
  readonly name: string;
  readonly class: { name: string } | null;
  readonly submittedAt: string | null;
}

export interface ApplicationList {
  readonly counts: Readonly<Record<string, number>>;
  readonly items: readonly ApplicationItem[];
}

export interface AdmissionLink {
  readonly current: {
    readonly url: string;
    readonly qrSvg: string;
    readonly year: string;
    readonly status: string;
  } | null;
}

export interface AttendanceOverview {
  readonly sections: readonly {
    section: { id: string; label: string };
    students: number;
    notMarked: number;
    percentage: number | null;
  }[];
}

export interface FeeClassRow {
  readonly classSection: string;
  readonly billed: Money;
  readonly collected: Money;
}

export interface ReportRows {
  readonly rows: readonly Readonly<Record<string, unknown>>[];
}

@Injectable({ providedIn: 'root' })
export class HomeApi {
  private readonly http = inject(HttpClient);

  home() {
    return firstValueFrom(this.http.get<HomeView>('/api/v1/console/home'));
  }

  /** A list a home card reads. */
  get<T>(url: string, params: Record<string, string | number> = {}) {
    return firstValueFrom(this.http.get<T>(`/api/v1/console/${url}`, { params }));
  }

  /** A report's rows (RPT-003) for the cards that chart payments by day or by channel. */
  report(id: string, params: Record<string, string> = {}) {
    return firstValueFrom(
      this.http.get<ReportRows>(`/api/v1/console/reports/${encodeURIComponent(id)}`, { params }),
    );
  }
}
