/**
 * Console reports (RPT-002…004): the catalogue of reports the role may open, by area, with the
 * screen that owns each (CR-17); a report run for the year in context (CR-13) or a date range,
 * paged; and its export (CSV), prepared off the request and read through RPT-005.
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { newIdempotencyKey } from '../../../Utils/ids';

export type ColumnType = 'text' | 'number' | 'paise' | 'date' | 'datetime' | 'percent';

export interface ReportColumn {
  readonly key: string;
  readonly label: string;
  readonly type: ColumnType | string;
}

export interface ReportEntry {
  readonly id: string;
  readonly area: string;
  readonly title: string;
  readonly description: string;
  readonly task: string;
  /** The console screen that owns the report (c.members …). */
  readonly screen: string;
  /** now: as read; year: the year in context; range: a date range. */
  readonly period: 'now' | 'year' | 'range';
  readonly columns: readonly ReportColumn[];
}

export interface Catalogue {
  readonly areas: readonly string[];
  readonly reports: readonly ReportEntry[];
}

export type Cell = string | number | boolean | null | { amount: string; currency: string };

export interface ReportRun {
  readonly report: { id: string; title: string; area: string; period: string };
  readonly year: { id: string; label: string } | null;
  readonly period: { from: string; to: string } | null;
  readonly columns: readonly ReportColumn[];
  readonly rows: readonly Readonly<Record<string, Cell>>[];
  readonly nextCursor: string | null;
}

export interface RunParams {
  readonly yearId?: string;
  readonly from?: string;
  readonly to?: string;
}

const clean = (p: Record<string, string | undefined | null>) =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => !!v)) as Record<string, string>;

@Injectable({ providedIn: 'root' })
export class ReportsApi {
  private readonly http = inject(HttpClient);

  catalogue() {
    return firstValueFrom(this.http.get<Catalogue>('/api/v1/console/reports'));
  }

  run(id: string, p: RunParams & { cursor?: string | null }) {
    return firstValueFrom(
      this.http.get<ReportRun>(`/api/v1/console/reports/${encodeURIComponent(id)}`, {
        params: clean({ ...p }),
      }),
    );
  }

  exportReport(id: string, p: RunParams) {
    return firstValueFrom(
      this.http.post<{ exportId: string; status: string }>(
        `/api/v1/console/reports/${encodeURIComponent(id)}/exports`,
        clean({ ...p }),
        { headers: { 'Idempotency-Key': newIdempotencyKey() } },
      ),
    );
  }
}
