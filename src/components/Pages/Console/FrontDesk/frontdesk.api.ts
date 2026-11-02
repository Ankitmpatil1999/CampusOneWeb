/**
 * Console front-desk API (ATT-015…018): the visitor log of a day (mobile masked) with who is still
 * inside, recording a visitor and checking one out, and recording a member at an attendance type
 * (method MANUAL, after the type's cooling-off). Creates send an Idempotency-Key.
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { newIdempotencyKey } from '../../../Utils/ids';

export interface Visitor {
  readonly id: string;
  readonly name: string;
  /** Masked: "••••••3210". */
  readonly mobile: string;
  readonly purpose: string;
  readonly toMeet: string | null;
  readonly checkedInAt: string;
  readonly checkedOutAt: string | null;
  readonly inside: boolean;
}

export interface VisitorLog {
  readonly date: string;
  readonly counts: { readonly total: number; readonly inside: number };
  readonly items: readonly Visitor[];
}

export interface LocationCheckIn {
  readonly member: { readonly id: string; readonly name: string };
  readonly location: string;
  readonly status: 'CHECK_IN';
  readonly method: 'MANUAL';
  readonly at: string;
}

const once = () => ({ 'Idempotency-Key': newIdempotencyKey() });

@Injectable({ providedIn: 'root' })
export class FrontDeskApi {
  private readonly http = inject(HttpClient);

  visitors(date?: string) {
    return firstValueFrom(
      this.http.get<VisitorLog>('/api/v1/console/visitors', { params: date ? { date } : {} }),
    );
  }

  record(body: { name: string; mobile: string; purpose: string; toMeet: string | null }) {
    return firstValueFrom(
      this.http.post<Visitor>('/api/v1/console/visitors', body, { headers: once() }),
    );
  }

  checkOut(id: string) {
    return firstValueFrom(
      this.http.post<Visitor>(`/api/v1/console/visitors/${id}/checkout`, {}, { headers: once() }),
    );
  }

  location(attendanceTypeId: string, memberId: string) {
    return firstValueFrom(
      this.http.post<LocationCheckIn>(
        '/api/v1/console/location-attendance',
        { attendanceTypeId, memberId },
        { headers: once() },
      ),
    );
  }
}
