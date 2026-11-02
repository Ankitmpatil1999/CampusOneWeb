import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { SessionContext } from '../../Context/SessionContext';
import { Icon } from '../Shared/Icon';
import { LanguageMenu } from '../Shared/LanguageMenu';
import { greeting } from '../Utils/greeting';
import { findItem, navOf, type StaffSurface } from '../Utils/navigation';
import { t as tr } from '../Utils/t';
import { Theme } from '../Utils/theme';
import { ConsoleBell } from './notifications.api';

/**
 * The prototype's top bar (`.c-top`): menu button on narrow screens, breadcrumbs (group / page),
 * the global search, the language, the theme switch (System → Light → Dark, as the prototype's top
 * bar has it), the notifications bell with its unread badge (console; the drawer is in the frame,
 * see Notifications) and the operator flag (back office). The academic-year picker joins with
 * academic years (Phase 7).
 */
@Component({
  // Attribute selector: the host is the <header class="c-top"> itself, as in the prototype markup.
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'header[rp-header]',
  imports: [Icon, LanguageMenu],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="iconbtn ham"
      aria-label="Menu"
      aria-controls="c-side"
      [attr.aria-expanded]="menuShown()"
      (click)="menu.emit()"
    >
      <rp-icon name="list" [size]="20" />
    </button>
    <!-- Wide screens: fold the menu to its icon rail and back (prototype v4 .nv-rail). -->
    <button
      type="button"
      class="iconbtn nv-rail"
      aria-controls="c-side"
      [attr.aria-label]="menuShown() ? 'Collapse sidebar' : 'Expand sidebar'"
      [attr.title]="menuShown() ? 'Collapse sidebar' : 'Expand sidebar'"
      [attr.aria-expanded]="menuShown()"
      (click)="menu.emit()"
    >
      <rp-icon name="sidebar" [size]="20" />
    </button>
    <div class="c-crumbs">
      @if (crumb().group; as g) {
        <span>{{ g }}</span
        ><span class="sep">/</span>
      }
      <b class="t-clip">{{ crumb().title }}</b>
    </div>
    <label class="search">
      <rp-icon name="search" [size]="15" />
      <input
        type="search"
        [placeholder]="
          surface() === 'ops' ? 'Search institutions, references' : 'Search members, references'
        "
        (keydown.enter)="search($event)"
      />
    </label>
    <rp-lang-menu [surface]="surface()" />
    <!-- The prototype's theme switch: System → Light → Dark. -->
    <button
      type="button"
      class="iconbtn"
      id="c-theme"
      [title]="themeLabel()"
      [attr.aria-label]="themeLabel()"
      (click)="theme.cycle()"
    >
      <rp-icon [name]="theme.icon()" [size]="20" />
    </button>
    <!-- The bell on the console and, since 2026-10-21, the back office (COM-035). -->
    <button
      type="button"
      class="iconbtn"
      title="Notifications"
      [attr.aria-label]="
        bell.unread() ? 'Notifications, ' + bell.unread() + ' unread' : 'Notifications'
      "
      (click)="bell.show()"
    >
      <rp-icon name="bell" [size]="20" />
      @if (bell.unread()) {
        <span class="badge">{{ bell.unread() > 99 ? '99+' : bell.unread() }}</span>
      }
    </button>
    @if (surface() === 'ops') {
      <span class="op-flag"><rp-icon name="shield" [size]="12" /> Operator</span>
    }
  `,
})
export class Header {
  private readonly router = inject(Router);
  private readonly sessions = inject(SessionContext);
  protected readonly bell = inject(ConsoleBell);
  protected readonly theme = inject(Theme);
  protected readonly themeLabel = computed(
    () =>
      ({ system: 'Theme: System', light: 'Theme: Light', dark: 'Theme: Dark' })[this.theme.mode()],
  );
  readonly surface = input.required<StaffSurface>();
  /** The menu in sight: slid in (narrow screens) or not folded to its icons (wide ones). */
  readonly menuShown = input(true);
  readonly menu = output<void>();

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly crumb = computed(() => {
    const path = (this.url().split('?')[0] ?? '').split('/')[2] ?? '';
    if (!path) {
      const name =
        this.surface() === 'ops' ? this.sessions.ops()?.name : this.sessions.console()?.name;
      return { group: '', title: greeting(name ?? '') };
    }
    const found = findItem(this.surface(), path);
    if (found) {
      const g = navOf(this.surface()).find((x) => x.items.includes(found.item));
      return {
        // A single-page task (Reports) is its own crumb (prototype v4).
        group: g?.solo ? '' : g?.key ? tr(g.key) : found.group,
        title: found.item.key ? tr(found.item.key) : found.item.title,
      };
    }
    return { group: '', title: path === 'search' ? 'Search' : 'Notifications' };
  });

  /** RP.gsearch: Enter opens the area's search page (/console/search?q=…); empty does nothing. */
  protected search(e: Event) {
    const q = (e.target as HTMLInputElement).value.trim();
    if (!q) return;
    void this.router.navigate([this.area(), 'search'], { queryParams: { q } });
  }

  private area() {
    return this.surface() === 'ops' ? '/backoffice' : '/console';
  }
}
