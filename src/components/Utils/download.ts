/**
 * Saves a file the API returns (an invoice PDF, an export): fetched through the HTTP client so the
 * session cookie, CSRF and error handling apply, then handed to the browser as a download.
 */
import type { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export async function downloadFile(
  http: HttpClient,
  url: string,
  fileName: string,
  headers: Readonly<Record<string, string>> = {},
) {
  const blob = await firstValueFrom(http.get(url, { responseType: 'blob', headers }));
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
