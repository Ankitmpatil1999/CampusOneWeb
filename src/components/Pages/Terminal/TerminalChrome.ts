/**
 * The terminals' shared chrome (prototype 50_t_terminals.js "SHARED CHROME"): the kiosk screen,
 * the top bar with purpose, network state and clock, the NFC tap zone and the result mark. The kiosk
 * is deliberately dark: `.term-screen.tm-dark` maps the design tokens onto the kiosk palette.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Icon } from '../../Shared/Icon';
import { OverlayHost } from '../../Shared/Overlays';
import { formatTime } from '../../Utils/format';
import type { IconName } from '../../Utils/icons';
import type { TerminalPurpose } from './terminal.device';

/** The register's purposes as the kiosk names them (RC-16, CR-10). */
export const PURPOSES: Record<
  TerminalPurpose,
  { readonly label: string; readonly icon: IconName }
> = {
  ATTENDANCE: { label: 'Gate attendance', icon: 'door' },
  PERIOD_ATTENDANCE: { label: 'Period attendance', icon: 'calcheck' },
  LOCATION: { label: 'Location attendance', icon: 'pin' },
  COUPON: { label: 'Coupon counter', icon: 'ticket' },
  BALANCE_CHECK: { label: 'Balance check', icon: 'wallet' },
  CARD_ISSUE: { label: 'Card issue', icon: 'card' },
  POS: { label: 'Point of sale', icon: 'store' },
};

/** The kiosk screen: full window, dark, with its own toasts and dialogs. */
@Component({
  selector: 'rp-terminal-shell',
  imports: [RouterOutlet, OverlayHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .rp-term-full {
      position: fixed;
      inset: 0;
      border-radius: 0;
    }
  `,
  template: `<div class="term-screen tm-dark rp-term-full">
    <router-outlet />
    <rp-overlays [fixed]="true" />
  </div>`,
})
export class TerminalShell {}

/** termBar(): the device, its purpose in force, network, clock and sign-out. */
@Component({
  selector: 'rp-term-bar',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<header class="term-bar tm-bar">
    <span class="tm-dev" aria-hidden="true"><rp-icon [name]="icon()" [size]="18" /></span>
    <div class="tm-id">
      <b class="t-clip">{{ name() }}</b
      ><small class="t-clip">{{ sub() }}</small>
    </div>
    @if (purpose()) {
      <span
        class="tm-purpose"
        title="Purpose in force, configured when the terminal was registered (CR-10 · OI-ATT-27)"
        ><rp-icon name="target" [size]="13" /><span class="tm-pl">Purpose</span
        ><b>{{ purpose() }}</b></span
      >
    }
    <div class="tb-r">
      <ng-content />
      <span class="tm-net" [class.on]="online()" [class.off]="!online()"
        ><i></i><span>{{ online() ? 'Online' : 'Offline' }}</span></span
      >
      <span class="tm-clock t-num">{{ clock() }}</span>
      @if (signout()) {
        <button
          type="button"
          class="tm-out"
          aria-label="Sign out of this terminal"
          (click)="signedOut.emit()"
        >
          <rp-icon name="logout" [size]="15" /><span>Sign out</span>
        </button>
      }
    </div>
  </header>`,
})
export class TermBar {
  readonly icon = input<IconName>('nfc');
  readonly name = input('');
  readonly sub = input('');
  readonly purpose = input('');
  readonly online = input(true);
  readonly signout = input(false);
  readonly signedOut = output<void>();
  protected readonly clock = signal(formatTime(new Date()));

  constructor() {
    const t = setInterval(() => this.clock.set(formatTime(new Date())), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(t));
  }
}

/** tapzone(): the rings around the reader icon; `reading` while a card is read. */
@Component({
  selector: 'rp-tapzone',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="tapzone tm-tz" [class]="cls()" aria-hidden="true">
    <span class="tz-r"></span><span class="tz-r"></span><span class="tz-r"></span
    ><span class="tz-core"><rp-icon [name]="icon()" [size]="46" [stroke]="1.8" /></span>
  </div>`,
})
export class TapZone {
  readonly icon = input<IconName>('nfc');
  readonly cls = input('');
}

/** markHTML(): the animated result mark (ok tick, bad cross, or an icon). */
@Component({
  selector: 'rp-term-mark',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div
    class="res-mark tm-mark"
    [class.bad]="tone() === 'bad'"
    [class.warn]="tone() === 'warn'"
    [class.tm-info]="tone() === 'info'"
    aria-hidden="true"
  >
    <span class="rm-r"></span><span class="rm-r r2"></span
    ><span class="rm-core">
      @if (tone() === 'ok') {
        <svg
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      } @else if (tone() === 'bad') {
        <svg
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M17 7 7 17M7 7l10 10" />
        </svg>
      } @else {
        <rp-icon
          [name]="icon() ?? (tone() === 'warn' ? 'clock' : 'info')"
          [size]="28"
          [stroke]="2.4"
        />
      }
    </span>
  </div>`,
})
export class TermMark {
  readonly tone = input<'ok' | 'bad' | 'warn' | 'info'>('ok');
  readonly icon = input<IconName | null>(null);
}
