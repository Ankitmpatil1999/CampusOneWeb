import { DOCUMENT } from '@angular/common';
import { computed, inject, Injectable, signal } from '@angular/core';
import type { IconName } from './icons';

/**
 * The prototype's theme switch (its top bar's `shell.theme`): System → Light → Dark in turn,
 * remembered on this browser. System follows the device (`prefers-color-scheme`); Light and Dark
 * set `data-theme` on <html>, which src/theme/tokens.css and the prototype's layers key on.
 */
export type ThemeMode = 'system' | 'light' | 'dark';

const KEY = 'campusone.theme';
const ORDER: readonly ThemeMode[] = ['system', 'light', 'dark'];

function stored(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'dark' || v === 'system' || !v) {
      localStorage.setItem(KEY, 'light');
      return 'light';
    }
    return 'light';
  } catch {
    return 'light';
  }
}

@Injectable({ providedIn: 'root' })
export class Theme {
  private readonly doc = inject(DOCUMENT);
  readonly mode = signal<ThemeMode>(stored());
  /** The prototype's icon for each: a monitor (system), a sun (light), a moon (dark). */
  readonly icon = computed<IconName>(() =>
    this.mode() === 'dark' ? 'moon' : this.mode() === 'light' ? 'sun' : 'sun',
  );

  /** Puts the chosen theme on the page (before the first page renders, and on each change). */
  apply(): void {
    const root = this.doc.documentElement;
    const mode = this.mode();
    root.dataset['theme'] = mode || 'light';
  }

  /** The next theme in turn (RP.act "shell.theme"). */
  cycle(): void {
    const next = ORDER[(ORDER.indexOf(this.mode()) + 1) % ORDER.length] ?? 'system';
    this.mode.set(next);
    try {
      if (next === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // Private mode: the choice lasts for this page only.
    }
    this.apply();
  }
}
