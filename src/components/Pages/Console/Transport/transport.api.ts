/**
 * Console transport API (TRN-001…026): routes with their ordered stops, the stops master, vehicles,
 * crew, sessions, vehicle assignments, passenger allocations, the day's trips with their stops and
 * events, cancelling a scheduled trip, and the eight reports. Masters are never deleted — they are
 * deactivated (OI-TRN-29). Creates send an Idempotency-Key; edits send If-Match "v<version>".
 * Maps (client 2026-10-21, TRN-038…042): a route's road distances, the bus's position on a trip, and
 * the transport fee by distance.
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { newIdempotencyKey } from '../../../Utils/ids';
import type { YearRef } from '../Structure/academic-year';

export type RouteType = 'MORNING' | 'EVENING' | 'SPECIAL' | 'EMERGENCY';
export type Direction = 'PICKUP' | 'DROP';
export type CrewRole = 'DRIVER' | 'ATTENDANT';
export type TripStatus = 'SCHEDULED' | 'STARTED' | 'COMPLETED' | 'CANCELLED';
export type StopStatus = 'UPCOMING' | 'REACHED' | 'DEPARTED' | 'SKIPPED';
export type Weekday = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export interface Stop {
  readonly id: string;
  readonly name: string;
  readonly landmark: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly active: boolean;
  /** Active routes the stop is on. */
  readonly routes: number;
  readonly version: number;
}

export interface RouteStop {
  readonly seq: number;
  readonly stop: {
    readonly id: string;
    readonly name: string;
    readonly landmark: string | null;
    readonly active: boolean;
    readonly lat?: number | null;
    readonly lng?: number | null;
  };
  readonly arrival: string | null;
  readonly departure: string | null;
  /** From the previous stop. */
  readonly distanceKm: number;
  /** From the school (the first stop) along the route, one way: what the transport fee uses. */
  readonly fromSchoolKm?: number;
}

export interface Route {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly type: RouteType;
  readonly mapLink: string | null;
  readonly active: boolean;
  readonly distanceKm: number;
  /** Passengers allocated now or later. */
  readonly passengers: number;
  readonly stops: readonly RouteStop[];
  readonly version: number;
}

export interface Vehicle {
  readonly id: string;
  readonly name: string;
  readonly registration: string;
  readonly capacity: number;
  readonly gps: { readonly enabled: boolean; readonly device: string | null };
  readonly active: boolean;
  readonly version: number;
}

export interface Crew {
  readonly id: string;
  readonly member: { readonly id: string; readonly name: string };
  readonly role: CrewRole;
  readonly licenceNo: string | null;
  readonly licenceExpiry: string | null;
  readonly licenceExpired: boolean;
  readonly employeeRef: string;
  readonly active: boolean;
  readonly version: number;
}

export interface Session {
  readonly id: string;
  readonly name: string;
  readonly direction: Direction;
  readonly startTime: string;
  readonly endTime: string | null;
  readonly days: readonly Weekday[];
  readonly daily: boolean;
  readonly active: boolean;
  readonly version: number;
}

export interface Assignment {
  readonly id: string;
  readonly route: { readonly id: string; readonly code: string; readonly name: string };
  readonly session: {
    readonly id: string;
    readonly name: string;
    readonly direction: Direction;
    readonly startTime: string;
  };
  readonly vehicle: { readonly id: string; readonly name: string; readonly registration: string };
  readonly driver: { readonly id: string; readonly name: string };
  readonly attendant: { readonly id: string; readonly name: string } | null;
  readonly from: string;
  readonly to: string;
  readonly active: boolean;
  readonly version: number;
}

export interface AllocationRow {
  /**
   * The student's choice on the admission form (client 2026-10-12): opted for school transport or
   * not, with the pick-up stop preferred. Null: no choice on record (eligible, as before).
   */
  readonly transport?: { readonly opted: boolean; readonly stop: string | null } | null;
  readonly member: {
    readonly id: string;
    readonly name: string;
    readonly admissionNo: string | null;
    readonly class: string | null;
    readonly section: string | null;
    readonly type: string;
  };
  readonly allocation: {
    readonly id: string;
    readonly route: { readonly id: string; readonly code: string; readonly name: string };
    readonly stop: { readonly id: string; readonly name: string };
    readonly from: string;
    readonly to: string;
    readonly version: number;
  } | null;
}

export interface AllocationPage {
  readonly year: YearRef;
  readonly items: readonly AllocationRow[];
  readonly nextCursor: string | null;
}

export interface Trip {
  readonly id: string;
  readonly date: string;
  readonly direction: Direction;
  readonly session: string;
  readonly route: { readonly id: string; readonly code: string; readonly name: string };
  readonly vehicle: {
    readonly id: string;
    readonly name: string;
    readonly registration: string;
    readonly capacity: number;
  };
  readonly driver: string;
  readonly attendant: string | null;
  readonly plannedStart: string;
  readonly status: TripStatus;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly cancelledAt: string | null;
  readonly cancelRemarks: string | null;
  readonly progress: { readonly stops: number; readonly passed: number };
  /** The latest position from the crew's phone (client 2026-10-21). */
  readonly bus?: BusPosition | null;
  /** Km run so far, from the phone's positions. */
  readonly kmRun?: number;
  readonly version: number;
}

export interface BusPosition {
  readonly lat: number;
  readonly lng: number;
  readonly speedKmph: number | null;
  readonly heading: number | null;
  readonly at: string | null;
}

export interface TripList {
  readonly date: string;
  readonly counts: {
    readonly scheduled: number;
    readonly started: number;
    readonly completed: number;
    readonly cancelled: number;
  };
  readonly items: readonly Trip[];
  readonly nextCursor: string | null;
}

export interface TripPassenger {
  readonly id: string;
  readonly name: string;
  readonly admissionNo: string | null;
  readonly classSection: string | null;
  readonly boarding: {
    readonly status: 'CHECKED_IN' | 'CHECKED_OUT' | 'NO_SHOW' | 'MISSED';
    readonly method: string | null;
    readonly stopSeq: number | null;
    readonly deviation: boolean;
  } | null;
}

export interface TripStop {
  readonly seq: number;
  readonly stop: {
    readonly id: string;
    readonly name: string;
    readonly landmark: string | null;
    readonly lat?: number | null;
    readonly lng?: number | null;
  };
  readonly plannedTime: string | null;
  readonly distanceKm: number;
  readonly status: StopStatus;
  readonly reachedAt: string | null;
  readonly departedAt: string | null;
  readonly skipRemarks: string | null;
  readonly passengers: readonly TripPassenger[];
}

export interface TripEvent {
  readonly event:
    'SCHEDULED' | 'STARTED' | 'REACHED' | 'DEPARTED' | 'SKIPPED' | 'COMPLETED' | 'CANCELLED';
  readonly seq: number | null;
  readonly remarks: string | null;
  readonly at: string | null;
  readonly by: string | null;
}

export interface TripDetail extends Trip {
  readonly stops: readonly TripStop[];
  readonly passengers: number;
  readonly boarded: number;
  /** The bus's path on this trip, oldest first ([lat, lng]). */
  readonly trail?: readonly (readonly [number, number])[];
  readonly events: readonly TripEvent[];
}

/** TRN-038: the road distance from each stop to the next (nothing saved). */
export interface RouteDistances {
  readonly provider: 'test' | 'google';
  /** Straight-line estimates (a test server), not road distances. */
  readonly estimate: boolean;
  readonly items: readonly {
    readonly seq: number;
    readonly stopId: string;
    readonly name: string;
    readonly distanceKm: number;
  }[];
  readonly totalKm: number;
}

/** TRN-040: the transport fee by distance. */
/** Per km of the round trip, or an amount a year by distance range (client 2026-10-22). */
export type FeeMode = 'PER_KM' | 'RANGE';
export interface FeeRange {
  /** Up to this distance from the school, one way; each range from the one before it. */
  readonly uptoKm: number;
  readonly yearlyPaise: number;
}

export interface FeeRule {
  readonly active: boolean;
  readonly mode: FeeMode;
  /** Per km of the round trip, per year. */
  readonly ratePerKm: { readonly amount: string; readonly currency: 'INR' };
  readonly ratePaisePerKm: number;
  readonly ranges: readonly (FeeRange & {
    readonly fromKm: number;
    readonly yearly: { readonly amount: string; readonly currency: 'INR' };
  })[];
  readonly dueDay: number;
  readonly year: { readonly id: string; readonly label: string; readonly months: number } | null;
  readonly version: number;
}

export const REPORT_KINDS = [
  'daily-summary',
  'route-performance',
  'vehicle-utilisation',
  'driver-performance',
  'attendant-performance',
  'allocation',
  'cancelled-trips',
  'trip-stops',
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export interface TransportReport {
  readonly kind: ReportKind;
  readonly from: string;
  readonly to: string;
  readonly items: readonly Record<string, string | number | null>[];
}

export interface RouteInput {
  readonly code: string;
  readonly name: string;
  readonly description?: string | null;
  readonly type?: RouteType;
  readonly mapLink?: string | null;
  readonly active?: boolean;
}
export interface StopInput {
  readonly name: string;
  readonly landmark?: string | null;
  readonly lat?: number | null;
  readonly lng?: number | null;
  readonly active?: boolean;
}
export interface VehicleInput {
  readonly name: string;
  readonly registration: string;
  readonly capacity: number;
  readonly gpsEnabled?: boolean;
  readonly gpsDevice?: string | null;
  readonly active?: boolean;
}
export interface CrewInput {
  readonly memberId: string;
  readonly role: CrewRole;
  readonly licenceNo?: string | null;
  readonly licenceExpiry?: string | null;
  readonly employeeRef: string;
}
export interface CrewEdit {
  readonly licenceNo?: string | null;
  readonly licenceExpiry?: string | null;
  readonly employeeRef?: string;
  readonly active?: boolean;
}
export interface SessionInput {
  readonly name: string;
  readonly direction: Direction;
  readonly startTime: string;
  readonly endTime?: string | null;
  readonly days: readonly Weekday[];
  readonly active?: boolean;
}
export interface AssignmentInput {
  readonly routeId: string;
  readonly sessionId: string;
  readonly vehicleId: string;
  readonly driverId: string;
  readonly attendantId?: string | null;
  readonly from: string;
  readonly to: string;
}
export interface AssignmentEdit {
  readonly vehicleId?: string;
  readonly driverId?: string;
  readonly attendantId?: string | null;
  readonly to?: string;
  readonly active?: boolean;
}

const once = () => ({ 'Idempotency-Key': newIdempotencyKey() });
const match = (v: number) => ({ 'If-Match': `"v${v}"` });
const C = '/api/v1/console';

@Injectable({ providedIn: 'root' })
export class TransportApi {
  private readonly http = inject(HttpClient);

  private get<T>(path: string, params: Record<string, string> = {}) {
    return firstValueFrom(this.http.get<T>(C + path, { params }));
  }
  private post<T>(path: string, body: unknown) {
    return firstValueFrom(this.http.post<T>(C + path, body, { headers: once() }));
  }
  private patch<T>(path: string, version: number, body: unknown) {
    return firstValueFrom(this.http.patch<T>(C + path, body, { headers: match(version) }));
  }

  // masters
  routes() {
    return this.get<{ items: Route[] }>('/routes');
  }
  createRoute(body: RouteInput) {
    return this.post<Route>('/routes', body);
  }
  updateRoute(id: string, version: number, body: Partial<RouteInput>) {
    return this.patch<Route>(`/routes/${id}`, version, body);
  }
  setRouteStops(
    id: string,
    version: number,
    stops: readonly { stopId: string; seq: number; distanceKm: number }[],
  ) {
    return firstValueFrom(
      this.http.put<Route>(`${C}/routes/${id}/stops`, { stops }, { headers: match(version) }),
    );
  }
  stops() {
    return this.get<{ items: Stop[] }>('/stops');
  }
  createStop(body: StopInput) {
    return this.post<Stop>('/stops', body);
  }
  updateStop(id: string, version: number, body: Partial<StopInput>) {
    return this.patch<Stop>(`/stops/${id}`, version, body);
  }
  vehicles() {
    return this.get<{ items: Vehicle[] }>('/vehicles');
  }
  createVehicle(body: VehicleInput) {
    return this.post<Vehicle>('/vehicles', body);
  }
  updateVehicle(id: string, version: number, body: Partial<VehicleInput>) {
    return this.patch<Vehicle>(`/vehicles/${id}`, version, body);
  }
  crew() {
    return this.get<{ items: Crew[] }>('/crew');
  }
  createCrew(body: CrewInput) {
    return this.post<Crew>('/crew', body);
  }
  updateCrew(id: string, version: number, body: CrewEdit) {
    return this.patch<Crew>(`/crew/${id}`, version, body);
  }
  sessions() {
    return this.get<{ items: Session[] }>('/transport-sessions');
  }
  createSession(body: SessionInput) {
    return this.post<Session>('/transport-sessions', body);
  }
  updateSession(id: string, version: number, body: Partial<SessionInput>) {
    return this.patch<Session>(`/transport-sessions/${id}`, version, body);
  }

  // assignments and allocations
  assignments() {
    return this.get<{ items: Assignment[] }>('/vehicle-assignments');
  }
  createAssignment(body: AssignmentInput) {
    return this.post<Assignment>('/vehicle-assignments', body);
  }
  updateAssignment(id: string, version: number, body: AssignmentEdit) {
    return this.patch<Assignment>(`/vehicle-assignments/${id}`, version, body);
  }
  allocations(f: {
    kind: 'STUDENT' | 'STAFF';
    routeId?: string;
    assigned?: boolean | null;
    q?: string;
    cursor?: string | null;
  }) {
    return this.get<AllocationPage>('/passenger-allocations', {
      kind: f.kind,
      ...(f.routeId ? { routeId: f.routeId } : {}),
      ...(f.assigned === true || f.assigned === false ? { assigned: String(f.assigned) } : {}),
      ...(f.q?.trim() ? { q: f.q.trim() } : {}),
      ...(f.cursor ? { cursor: f.cursor } : {}),
    });
  }
  allocate(body: {
    memberIds: readonly string[];
    routeId: string;
    stopId: string;
    from: string;
    to: string;
  }) {
    return this.post<{
      allocated: number;
      ids: string[];
      fees?: { members: number; records: number; amount: { amount: string; currency: 'INR' } };
    }>('/passenger-allocations', body);
  }
  /** TRN-035: the family changed its mind after admission — opted for transport or not. */
  setTransportChoice(memberId: string, body: { opted: boolean; reason: string }) {
    return firstValueFrom(
      this.http.put<{
        memberId: string;
        transport: { opted: boolean; stop: string | null } | null;
      }>(`${C}/transport-choices/${memberId}`, body),
    );
  }
  endAllocation(id: string, body: { endDate: string; reason: string }) {
    return firstValueFrom(
      this.http.post<{ id: string; endDate: string; reason: string }>(
        `${C}/passenger-allocations/${id}/end`,
        body,
        { headers: once() },
      ),
    );
  }

  // trips and reports
  trips(f: { date?: string; status?: TripStatus; routeId?: string; vehicleId?: string } = {}) {
    return this.get<TripList>('/trips', {
      ...(f.date ? { date: f.date } : {}),
      ...(f.status ? { status: f.status } : {}),
      ...(f.routeId ? { routeId: f.routeId } : {}),
      ...(f.vehicleId ? { vehicleId: f.vehicleId } : {}),
    });
  }
  trip(id: string) {
    return this.get<TripDetail>(`/trips/${id}`);
  }
  cancelTrip(id: string, remarks: string) {
    return this.post<TripDetail>(`/trips/${id}/cancellation`, { remarks });
  }
  report(kind: ReportKind, from: string, to: string) {
    return this.get<TransportReport>(`/transport/reports/${kind}`, { from, to });
  }

  // maps and the transport fee by distance (client 2026-10-21)
  routeDistances(routeId: string) {
    return this.post<RouteDistances>(`/routes/${routeId}/distances`, {});
  }
  feeRule() {
    return this.get<FeeRule>('/transport/fee-rule');
  }
  setFeeRule(
    version: number,
    body: {
      active: boolean;
      mode: FeeMode;
      ratePaisePerKm?: number;
      ranges?: readonly FeeRange[];
      dueDay: number;
    },
  ) {
    return firstValueFrom(
      this.http.put<FeeRule>(`${C}/transport/fee-rule`, body, { headers: match(version) }),
    );
  }
  applyFeeRule() {
    return this.post<{
      allocations: number;
      members: number;
      records: number;
      amount: { amount: string; currency: 'INR' };
    }>('/transport/fee-rule/apply', {});
  }
}
