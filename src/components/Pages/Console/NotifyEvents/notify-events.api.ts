/** Notification settings per event (COM-032/033; client 2026-10-16). */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface NotifyEvent {
  readonly event: string;
  readonly label: string;
  readonly description: string;
  readonly email: boolean;
  readonly alert: boolean;
  readonly version: number;
}

export interface NotifyEventList {
  /** Whether e-mail can go at all (the platform's and the school's e-mail channels). */
  readonly emailChannel: boolean;
  readonly items: readonly NotifyEvent[];
}

export interface NotifyEventChange {
  readonly event: string;
  readonly version: number;
  readonly email?: boolean;
  readonly alert?: boolean;
}

@Injectable({ providedIn: 'root' })
export class NotifyEventsApi {
  private readonly http = inject(HttpClient);

  list() {
    return firstValueFrom(this.http.get<NotifyEventList>('/api/v1/console/notification-events'));
  }

  update(changes: readonly NotifyEventChange[]) {
    return firstValueFrom(
      this.http.patch<NotifyEventList>('/api/v1/console/notification-events', { changes }),
    );
  }
}
