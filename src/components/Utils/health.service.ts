import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiProblem } from './problem';

export type ApiHealthState =
  | { readonly status: 'loading' }
  | { readonly status: 'up' }
  | { readonly status: 'down'; readonly message: string; readonly correlationId: string | null };

/** Checks that the API answers (GET /health/live, PLT-001) — the shell's "reports healthy" probe. */
@Injectable({ providedIn: 'root' })
export class ApiHealthService {
  private readonly http = inject(HttpClient);
  readonly state = signal<ApiHealthState>({ status: 'loading' });

  async check(): Promise<void> {
    this.state.set({ status: 'loading' });
    try {
      await firstValueFrom(this.http.get<{ status: string }>('/health/live'));
      this.state.set({ status: 'up' });
    } catch (e) {
      const p = e instanceof ApiProblem ? e : null;
      this.state.set({
        status: 'down',
        message: p?.detail ?? 'The service is temporarily unavailable. Please try again shortly.',
        correlationId: p?.correlationId ?? null,
      });
    }
  }
}
