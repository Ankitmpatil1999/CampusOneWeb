/**
 * Prepared exports (RPT-004, COM-008, RPT-012 → RPT-005): an export is requested, prepared off the
 * request and read back through GET /api/v1/exports/{id} — a path without a surface prefix, so the
 * surface goes in the X-CampusOne-Surface header. Once READY the file is a short-lived signed link the
 * browser downloads.
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { SURFACE_HEADER } from '../../../Utils/web-session';

export type ExportStatus = 'REQUESTED' | 'RUNNING' | 'READY' | 'FAILED' | 'EXPIRED';

export interface ExportView {
  readonly exportId: string;
  readonly report: string;
  readonly status: ExportStatus;
  readonly rows: number | null;
  readonly truncated: boolean;
  readonly requestedAt: string;
  readonly readyAt: string | null;
  readonly expiresAt: string | null;
  readonly file: {
    readonly name: string;
    readonly sizeBytes: number;
    readonly url: string;
    readonly expiresAt: string;
  } | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Injectable({ providedIn: 'root' })
export class ExportsApi {
  private readonly http = inject(HttpClient);

  status(id: string, surface: 'console' | 'ops') {
    return firstValueFrom(
      this.http.get<ExportView>(`/api/v1/exports/${encodeURIComponent(id)}`, {
        headers: { [SURFACE_HEADER]: surface },
      }),
    );
  }

  /** Polls until the export is ready (or fails / expires); throws the register's problem. */
  async ready(id: string, surface: 'console' | 'ops', maxMs = 60_000): Promise<ExportView> {
    const until = Date.now() + maxMs;
    let wait = 600;
    for (;;) {
      const x = await this.status(id, surface);
      if (x.status === 'READY' && x.file) return x;
      if (x.status === 'FAILED' || x.status === 'EXPIRED') {
        const code = x.status === 'EXPIRED' ? 'RPT.EXPORT_EXPIRED' : 'GEN.INTERNAL';
        throw new ApiProblem(409, code, translate(code), null);
      }
      if (Date.now() > until)
        throw new ApiProblem(202, 'RPT.EXPORT_NOT_READY', translate('RPT.EXPORT_NOT_READY'), null);
      await sleep(wait);
      wait = Math.min(2_000, wait + 400);
    }
  }
}

/** Opens the signed link so the browser saves the file. */
export function download(file: { name: string; url: string }) {
  const a = document.createElement('a');
  a.href = file.url;
  a.download = file.name;
  a.rel = 'noopener';
  a.click();
}

/** "340 B", "12 KB", "1.2 MB". */
export function size(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
