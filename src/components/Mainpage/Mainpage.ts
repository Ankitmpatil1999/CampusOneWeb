import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { Header } from '../Header/Header';
import { Notifications } from '../Header/Notifications';
import { ConsoleBell } from '../Header/notifications.api';
import { Sidebar } from '../Sidebar/Sidebar';
import { OverlayHost } from '../Shared/Overlays';
import { NARROW, NavUi } from '../Utils/nav-ui';
import type { StaffSurface } from '../Utils/navigation';
import { SessionKeeper } from '../Utils/session-keeper';

/**
 * The prototype's console frame (`.c-app`): the menu on the left, the top bar and the routed page
 * on the right. The back office is the same frame in its deeper variant (`.c-app.op`). On narrow
 * screens the menu slides in over a scrim; on wide ones the top bar's sidebar button folds it to
 * its icon rail and back (`.c-app.rail`, prototype v4; client 2026-10-26). It keeps the session
 * alive while the area is in use (SessionKeeper). On the console it runs the notifications bell
 * (loaded on opening and every minute) and holds its drawer.
 */
@Component({
  selector: 'rp-mainpage',
  imports: [Header, Notifications, OverlayHost, Sidebar, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: block' },
  template: `
    <div
      class="c-app"
      [class.op]="surface === 'ops'"
      [class.nav-open]="ui.drawer()"
      [class.rail]="ui.rail()"
    >
      <aside rp-sidebar id="c-side" class="c-side" [surface]="surface"></aside>
      <div
        class="c-scrim"
        tabindex="-1"
        aria-hidden="true"
        (click)="ui.drawer.set(false)"
        (keydown.escape)="ui.drawer.set(false)"
      ></div>
      <div class="c-main">
        <header
          rp-header
          class="c-top"
          [surface]="surface"
          [menuShown]="narrow() ? ui.drawer() : !ui.rail()"
          (menu)="toggleMenu()"
        ></header>
        <div class="c-body">
          <router-outlet />
        </div>
      </div>
      <rp-notifications />
      <rp-overlays />
    </div>
  `,
})
export class Mainpage {
  protected readonly surface: StaffSurface =
    inject(ActivatedRoute).snapshot.data['surface'] === 'ops' ? 'ops' : 'console';
  protected readonly ui = inject(NavUi);
  /** The prototype's narrow layout: the menu slides in over the page. */
  protected readonly narrow = signal(false);

  protected toggleMenu() {
    const narrow = typeof matchMedia === 'function' && matchMedia(NARROW).matches;
    this.narrow.set(narrow);
    if (narrow) this.ui.drawer.set(true);
    else this.ui.setRail(!this.ui.rail());
  }

  constructor() {
    if (typeof matchMedia === 'function') {
      const mq = matchMedia(NARROW);
      this.narrow.set(mq.matches);
      const onChange = (e: MediaQueryListEvent) => this.narrow.set(e.matches);
      mq.addEventListener?.('change', onChange);
      inject(DestroyRef).onDestroy(() => mq.removeEventListener?.('change', onChange));
    }
    const keeper = inject(SessionKeeper);
    keeper.start(this.surface);
    inject(DestroyRef).onDestroy(() => keeper.stop());
    // The bell on both surfaces (the back office's since 2026-10-21).
    const bell = inject(ConsoleBell);
    bell.start(this.surface);
    inject(DestroyRef).onDestroy(() => bell.stop());
    // Opening a page closes the slide-in menu (narrow screens).
    toSignal(
      inject(Router).events.pipe(
        filter((e) => e instanceof NavigationEnd),
        map(() => this.ui.drawer.set(false)),
      ),
    );
  }
}
