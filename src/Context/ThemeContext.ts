import { Injectable, signal } from '@angular/core';

export type ThemeChoice = 'system' | 'light' | 'dark';
const STORAGE_KEY = 'rp.theme';

/**
 * Light / dark themes (brief §7.8). `system` follows the OS; an explicit choice sets
 * `data-theme` on <html>, which the token CSS reads. The choice is a per-browser convenience.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly choice = signal<ThemeChoice>(this.read());

  constructor() {
    this.apply(this.choice());
  }

  set(choice: ThemeChoice): void {
    this.choice.set(choice);
    this.apply(choice);
    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      /* storage unavailable (private mode) — the choice lasts for this page only */
    }
  }

  private read(): ThemeChoice {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v === 'light' || v === 'dark' ? v : 'system';
    } catch {
      return 'system';
    }
  }

  private apply(choice: ThemeChoice): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (choice === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', choice);
  }
}
