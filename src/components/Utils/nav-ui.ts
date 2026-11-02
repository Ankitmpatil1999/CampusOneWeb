import { Injectable, signal } from '@angular/core';
import type { StaffSurface } from './navigation';

/** Where the prototype's frame switches to the slide-in menu (campusone.css, campusone-ocean.css). */
export const NARROW = '(max-width: 980px)';
const RAIL_KEY = 'rp.nav.mini';
function readRail() {
  try {
    return localStorage.getItem(RAIL_KEY) === '1';
  } catch {
    return false;
  }
}

const narrow = () => typeof matchMedia === 'function' && matchMedia(NARROW).matches;

/**
 * The menu's state, shared by the frame, the menu, the top bar and the home's task cards (prototype
 * v4 `state.navui`): the parent task open in each surface's menu (one at a time), the icon rail
 * (wide screens; this browser remembers it), the slide-in menu (narrow screens) and the short
 * flourishes the menu plays when a task opens (`nv-anim`) or is pointed to (`nv-flash`).
 * Presentation only: what the menu lists still follows the session's tasks.
 */
@Injectable({ providedIn: 'root' })
export class NavUi {
  /** The parent task open in each surface's menu; null when the person closed it. */
  readonly open = signal<Partial<Record<StaffSurface, string | null>>>({});
  readonly rail = signal(readRail());
  readonly drawer = signal(false);
  readonly anim = signal<string | null>(null);
  readonly flash = signal<string | null>(null);
  private timers: Record<string, ReturnType<typeof setTimeout>> = {};

  setRail(on: boolean) {
    this.rail.set(on);
    try {
      localStorage.setItem(RAIL_KEY, on ? '1' : '0');
    } catch {
      // A browser without storage keeps it for this visit only.
    }
  }

  setOpen(s: StaffSurface, k: string | null) {
    this.open.update((o) => ({ ...o, [s]: k }));
  }

  /** A parent row pressed: on the rail it opens the full menu at that task, else it folds. */
  toggle(s: StaffSurface, k: string) {
    if (this.rail() && !narrow()) {
      this.setRail(false);
      this.setOpen(s, k);
    } else {
      this.setOpen(s, this.open()[s] === k ? null : k);
    }
    if (this.open()[s] === k) this.pulse('anim', k, 700);
  }

  /** "More in the menu": open that task in the menu (the slide-in one on narrow screens). */
  reveal(s: StaffSurface, k: string) {
    if (this.rail()) this.setRail(false);
    this.setOpen(s, k);
    if (narrow()) this.drawer.set(true);
    this.pulse('anim', k, 700);
    this.pulse('flash', k, 1600);
  }

  private pulse(which: 'anim' | 'flash', k: string, ms: number) {
    this[which].set(k);
    clearTimeout(this.timers[which]);
    this.timers[which] = setTimeout(() => this[which].set(null), ms);
  }
}
