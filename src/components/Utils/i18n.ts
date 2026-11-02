/**
 * The web in the person's language (Phase 10; client request 2026-10-05). The language is this
 * browser's choice, else the account's (`preferredLang`, shared with the app). At start-up its bundle
 * is loaded once and becomes the bundle `translate` uses, so register texts (messages, statuses) and
 * the translated pages read in that language; the language menu saves the choice and reloads.
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, type OnDestroy, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DomTranslator, buildDictionary } from './dom-translate';
import { MESSAGES_EN } from './messages.en';
import { WEB_STRINGS_EN } from './strings.en';
import { useBundle } from './translate';
import { SURFACE_HEADER } from './web-session';

export interface WebLanguage {
  readonly code: string;
  readonly name: string;
  readonly nativeName: string;
}

const KEY = 'rp.lang';
/** The English of the pages by key (`npm run ui-text`), served with the app's static files. */
export const UI_TEXT_URL = '/i18n/ui-text.en.json';
/** Until the list arrives: English and Kannada, Kannada next to English (client 2026-10-02). */
const FALLBACK: readonly WebLanguage[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
];

const stored = (): string | null => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const store = (lang: string) => {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // a private window: the choice lasts until the page reloads
  }
};

@Injectable({ providedIn: 'root' })
export class I18n implements OnDestroy {
  private readonly http = inject(HttpClient);
  readonly lang = signal('en');
  readonly languages = signal<readonly WebLanguage[]>(FALLBACK);
  /** The bundle holds machine drafts not yet reviewed. */
  readonly machineDraft = signal(false);
  private listed = false;
  private pages: DomTranslator | null = null;

  /** Start-up: the chosen language's bundle before the first page renders. */
  async init(): Promise<void> {
    useBundle({ ...MESSAGES_EN, ...WEB_STRINGS_EN });
    const lang = stored();
    if (lang && lang !== 'en') {
      try {
        const b = await firstValueFrom(
          this.http.get<{ messages: Record<string, string>; machineDraft?: boolean }>(
            `/api/v1/i18n/${encodeURIComponent(lang)}`,
          ),
        );
        useBundle({ ...MESSAGES_EN, ...WEB_STRINGS_EN, ...b.messages });
        this.lang.set(lang);
        this.machineDraft.set(!!b.machineDraft);
        await this.translatePages(b.messages);
      } catch {
        // unknown or switched off: English
      }
    }
    if (typeof document !== 'undefined') document.documentElement.lang = this.lang();
  }

  /**
   * The pages written in English (all but the keyed ones) follow the language: their English text
   * list is loaded and the page's English is swapped as it is drawn (ADR-0018). Without the list
   * the pages stay in English; register texts and keyed pages are translated either way.
   */
  private async translatePages(bundle: Readonly<Record<string, string>>): Promise<void> {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    try {
      const english = await firstValueFrom(
        this.http.get<Record<string, string>>(UI_TEXT_URL, {
          headers: { 'Cache-Control': 'no-cache' },
        }),
      );
      this.pages?.stop();
      this.pages = new DomTranslator(buildDictionary(english, bundle));
      this.pages.start(document.body);
    } catch {
      // the pages stay in English
    }
  }

  /** The languages the platform has switched on (Kannada next to English). */
  async loadLanguages(): Promise<void> {
    if (this.listed) return;
    try {
      const r = await firstValueFrom(
        this.http.get<{ items: readonly WebLanguage[] }>('/api/v1/languages'),
      );
      if (r.items.length) this.languages.set(r.items);
      this.listed = true;
    } catch {
      // keep the fallback
    }
  }

  /** The menu: saved for the account when signed in (console, back office), then the page reloads. */
  async change(lang: string, surface?: 'console' | 'ops'): Promise<void> {
    if (lang === this.lang()) return;
    if (surface) {
      try {
        await firstValueFrom(
          this.http.put(
            '/api/v1/me/language',
            { lang },
            { headers: { [SURFACE_HEADER]: surface } },
          ),
        );
      } catch {
        // the browser keeps the choice even if the account can't
      }
    }
    store(lang);
    this.reload();
  }

  /** After sign-in: the account's language, when this browser hasn't chosen one yet. */
  adopt(preferred: string | null | undefined): void {
    if (!preferred || stored() !== null || preferred === this.lang()) return;
    store(preferred);
    this.reload();
  }

  ngOnDestroy(): void {
    this.pages?.stop();
  }

  /** Overridden in tests. */
  reload(): void {
    location.reload();
  }
}
