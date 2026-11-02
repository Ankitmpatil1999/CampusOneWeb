/**
 * Languages and translations (IDN-070…074, FR-PLT-01, NFR-40): the languages members can choose
 * with their coverage, adding one (it starts switched off), switching one on or off and choosing the
 * default (the fallback); every label by screen with its text in each language, and saving a
 * reviewed translation (placeholders kept).
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { newIdempotencyKey } from '../../../Utils/ids';

export interface Language {
  readonly code: string;
  readonly name: string;
  readonly nativeName: string;
  readonly enabled: boolean;
  readonly isDefault: boolean;
  /** Optimistic locking: sent back as If-Match. */
  readonly version: number;
  readonly translations: {
    readonly reviewed: number;
    readonly machine: number;
    readonly missing: number;
  };
}

export interface LanguageList {
  /** Every key of the English bundle. */
  readonly keys: number;
  readonly items: readonly Language[];
}

export interface TranslationText {
  readonly text: string;
  /** HUMAN (reviewed) or MACHINE. */
  readonly source: string;
  readonly reviewedAt: string | null;
  readonly version: number;
}

export interface TranslationRow {
  readonly key: string;
  readonly screen: string;
  readonly en: string;
  readonly placeholders: readonly string[];
  readonly texts: Readonly<Record<string, TranslationText | null>>;
}

export interface TranslationPage {
  readonly languages: readonly string[];
  readonly screens: readonly string[];
  readonly total: number;
  readonly items: readonly TranslationRow[];
  readonly nextCursor: string | null;
}

const clean = (p: Record<string, string | undefined | null>) =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => !!v)) as Record<string, string>;

@Injectable({ providedIn: 'root' })
export class LanguagesApi {
  private readonly http = inject(HttpClient);

  list() {
    return firstValueFrom(this.http.get<LanguageList>('/api/v1/ops/languages'));
  }

  add(body: { code: string; name: string; native: string }) {
    return firstValueFrom(
      this.http.post<Language>('/api/v1/ops/languages', body, {
        headers: { 'Idempotency-Key': newIdempotencyKey() },
      }),
    );
  }

  /** `version`: the one read, sent as If-Match (412 when someone else changed it first). */
  update(code: string, body: { enabled?: boolean; isDefault?: boolean }, version: number) {
    return firstValueFrom(
      this.http.patch<Language>(`/api/v1/ops/languages/${encodeURIComponent(code)}`, body, {
        headers: { 'If-Match': `"v${version}"` },
      }),
    );
  }

  translations(q: { screen?: string; missingIn?: string; q?: string; cursor?: string | null }) {
    return firstValueFrom(
      this.http.get<TranslationPage>('/api/v1/ops/translations', { params: clean(q) }),
    );
  }

  /** `versions`: the version read for each edited language (null where it had no text). */
  save(
    key: string,
    texts: Readonly<Record<string, string>>,
    versions: Readonly<Record<string, number | null>>,
  ) {
    return firstValueFrom(
      this.http.put<unknown>(`/api/v1/ops/translations/${encodeURIComponent(key)}`, {
        texts,
        versions,
      }),
    );
  }
}
