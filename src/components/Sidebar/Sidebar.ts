import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { CAMPUSONE_WEB_CONFIG } from '../../Config';
import { SessionContext, type InstitutionChoice } from '../../Context/SessionContext';
import { Avatar } from '../Shared/Avatar';
import { Icon } from '../Shared/Icon';
import { InstitutionList } from '../Shared/InstitutionList';
import { Mark } from '../Shared/Mark';
import { Modal, Overlays } from '../Shared/Overlays';
import { titleCase } from '../Utils/format';
import { ApiProblem } from '../Utils/problem';
import { translate } from '../Utils/translate';
import { t as tr } from '../Utils/t';
import { NavUi } from '../Utils/nav-ui';
import {
  pathOf,
  visibleNav,
  type NavGroup,
  type NavItem,
  type StaffSurface,
} from '../Utils/navigation';

/** The page's menu path: /console/attendance → attendance, /console → home. */
function pathOfUrl(url: string) {
  return url.split(/[?#]/)[0]!.split('/').filter(Boolean)[1] ?? 'home';
}

/**
 * The prototype's menu (`.c-side`, v4 blue refresh): the institution (or CampusOne back office) at the
 * top, then the person's parent tasks — a single page (Dashboard, Reports) as one row, every other
 * task a row that folds its sub-tasks open beneath it, one task open at a time — and the person
 * with sign-out at the bottom. Opening a page opens its task; a person with a single task finds it
 * open. On wide screens the menu folds to an icon rail (`.c-app.rail`), where a task's icon opens
 * the full menu at that task. Which entries show still follows the session's sub-tasks.
 */
@Component({
  // Attribute selector: the host is the <aside class="c-side"> itself, as in the prototype markup.
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'aside[rp-sidebar]',
  imports: [Avatar, Icon, InstitutionList, Mark, Modal, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-brand">
      @if (surface() === 'ops') {
        <rp-mark [size]="34" />
        <div class="nv-bt" style="min-width: 0">
          <b>CampusOne back office</b><small>Platform operator</small>
        </div>
      } @else {
        <!-- The school's own logo, else its initials (client 2026-10-15). -->
        @if (logo(); as src) {
          <img
            id="c-logo"
            [src]="src"
            [alt]="(institution()?.name ?? '') + ' logo'"
            width="34"
            height="34"
            style="border-radius: 28%; object-fit: contain; background: #fff; flex: none"
            (error)="logoFailed.set(true)"
          />
        } @else {
          <rp-av [name]="institution()?.name ?? 'CampusOne'" [sq]="true" [px]="34" color="#0C6F7D" />
        }
        <div class="nv-bt" style="min-width: 0">
          <b>{{ institution()?.name }}</b
          ><small>Institution console · {{ institution()?.city }}</small>
        </div>
      }
      <button
        type="button"
        class="iconbtn nv-x"
        aria-label="Close menu"
        (click)="ui.drawer.set(false)"
      >
        <rp-icon name="x" [size]="18" />
      </button>
    </div>
    <nav class="c-nav" [attr.aria-label]="surface() === 'ops' ? 'Back office' : 'Console'">
      @for (g of groups(); track g.k; let i = $index; let last = $last) {
        @if (g.solo) {
          <!-- The closing single page (Reports) sits at the foot of the menu, under a rule. -->
          @if (last && i > 0) {
            <div class="nv-sep" aria-hidden="true"></div>
          }
          <a
            class="nv-solo"
            [class.on]="isOn(g.items[0]!)"
            [routerLink]="link(g.items[0]!.id)"
            [attr.data-tab]="g.items[0]!.id"
            [attr.aria-current]="isOn(g.items[0]!) ? 'page' : null"
            [attr.title]="label(g)"
          >
            <span class="nv-pic"><rp-icon [name]="g.icon" [size]="18" /></span>
            <span class="nv-lbl grow t-clip">{{ label(g) }}</span>
          </a>
        } @else {
          <div
            class="nv-grp"
            [class.open]="openK() === g.k"
            [class.has-on]="curGroup()?.k === g.k"
            [class.nv-anim]="ui.anim() === g.k"
            [class.nv-flash]="ui.flash() === g.k"
            [attr.data-grp]="g.k"
          >
            <button
              type="button"
              class="nv-par"
              [attr.aria-expanded]="openK() === g.k"
              [attr.aria-controls]="subId(g)"
              [attr.title]="label(g)"
              (click)="toggle(g)"
            >
              <span class="nv-pic"><rp-icon [name]="g.icon" [size]="18" /></span>
              <span class="nv-lbl grow t-clip">{{ label(g) }}</span>
              <span class="nv-chev"><rp-icon name="down" [size]="16" /></span>
            </button>
            <div
              class="nv-sub"
              role="group"
              [id]="subId(g)"
              [attr.aria-label]="label(g)"
              [attr.inert]="openK() === g.k ? null : ''"
            >
              <div class="nv-sub-in">
                @for (it of g.items; track it.id) {
                  <a
                    class="nv-item"
                    [class.on]="isOn(it)"
                    [routerLink]="link(it.id)"
                    [attr.data-tab]="it.id"
                    [attr.aria-current]="isOn(it) ? 'page' : null"
                  >
                    <rp-icon [name]="it.icon" [size]="16" />
                    <span class="grow t-clip">{{ it.key ? t(it.key) : it.label }}</span>
                  </a>
                }
              </div>
            </div>
          </div>
        }
      }
    </nav>
    <div class="c-user">
      <rp-av [name]="name()" size="sm" />
      <div class="grow nv-bt" style="min-width: 0">
        <b class="t-clip" style="display: block">{{ name() }}</b
        ><small class="t-clip">{{ role() }}</small>
      </div>
      <!-- Someone at several institutions moves between them (client 2026-10-27). -->
      @if (institutions().length > 1) {
        <button
          type="button"
          class="iconbtn"
          id="c-switch"
          title="Switch institution"
          aria-label="Switch institution"
          (click)="switching.set(true)"
        >
          <rp-icon name="building" [size]="17" />
        </button>
      }
      <button
        type="button"
        class="iconbtn"
        title="Sign out"
        aria-label="Sign out"
        (click)="signOut()"
      >
        <rp-icon name="logout" [size]="17" />
      </button>
    </div>
    @if (switching()) {
      <rp-modal
        title="Switch institution"
        sub="The console opens for the institution you choose."
        icon="building"
        [foot]="false"
        [dismiss]="!opening()"
        (closed)="switching.set(false)"
      >
        <rp-inst-list
          [institutions]="institutions()"
          [current]="institution()?.id ?? null"
          [busy]="opening()"
          (picked)="switchTo($event)"
        />
      </rp-modal>
    }
  `,
})
export class Sidebar {
  /** Translated pages' labels in the language in use (Phase 10). */
  protected readonly t = tr;
  private readonly sessions = inject(SessionContext);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly ui = inject(NavUi);
  readonly surface = input.required<StaffSurface>();
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  private readonly path = computed(() => pathOfUrl(this.url()));

  private readonly session = computed(() =>
    this.surface() === 'ops' ? this.sessions.ops() : this.sessions.console(),
  );
  protected readonly institution = computed(() => this.sessions.console()?.institution ?? null);
  private readonly apiBase = inject(CAMPUSONE_WEB_CONFIG, { optional: true })?.apiBaseUrl ?? '';
  /** A logo that didn't load shows the initials instead. */
  protected readonly logoFailed = signal(false);
  protected readonly logo = computed(() => {
    const url = this.institution()?.logoUrl;
    return url && !this.logoFailed() ? this.apiBase + url : null;
  });
  protected readonly name = computed(() => titleCase(this.session()?.name ?? ''));
  protected readonly role = computed(() => {
    if (this.surface() === 'ops') return this.sessions.ops()?.role.name ?? '';
    return (this.sessions.console()?.roles ?? []).map((r) => r.name).join(', ');
  });
  protected readonly groups = computed(() =>
    visibleNav(this.surface(), this.session()?.subTasks ?? []),
  );
  /** The task holding the page in use. */
  protected readonly curGroup = computed(
    () => this.groups().find((g) => g.items.some((it) => this.isOn(it))) ?? null,
  );
  protected readonly openK = computed(() => this.ui.open()[this.surface()] ?? null);

  /** The person's institutions (client 2026-10-27): "Switch institution" when more than one. */
  protected readonly institutions = signal<readonly InstitutionChoice[]>([]);
  protected readonly switching = signal(false);
  protected readonly opening = signal<string | null>(null);
  private readonly overlays = inject(Overlays);

  private readonly institutionId = computed(() =>
    this.surface() === 'console' ? (this.institution()?.id ?? null) : null,
  );

  constructor() {
    // The person's institutions, asked once the console session is known.
    effect(() => {
      const id = this.institutionId();
      if (!id) return;
      untracked(() =>
        this.sessions.myInstitutions().then(
          (list) => this.institutions.set(list),
          () => this.institutions.set([]),
        ),
      );
    });
    // Opening a page opens its task (prototype paintConsoleChrome); a person with a single task
    // finds it open. Folding a task by hand stays until the next page opens.
    effect(() => {
      const g = this.curGroup();
      this.path();
      untracked(() => {
        const s = this.surface();
        if (g && !g.solo) this.ui.setOpen(s, g.k);
        else if (this.ui.open()[s] === undefined) {
          const parents = this.groups().filter((x) => !x.solo);
          if (parents.length === 1) this.ui.setOpen(s, parents[0]!.k);
        }
      });
    });
    // The task opened from the dashboard ("More in the menu") scrolls into sight.
    effect(() => {
      const k = this.ui.flash();
      if (!k) return;
      setTimeout(() => {
        const el = this.host.nativeElement.querySelector<HTMLElement>(`[data-grp="${k}"]`);
        el?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
        el?.querySelector<HTMLElement>('.nv-par')?.focus({ preventScroll: true });
      }, 120);
    });
  }

  protected label(g: NavGroup) {
    return g.key ? tr(g.key) : g.group;
  }

  protected subId(g: NavGroup) {
    return `nvg-${this.surface()}-${g.k}`;
  }

  protected isOn(it: NavItem) {
    return pathOf(it.id) === this.path();
  }

  protected toggle(g: NavGroup) {
    this.ui.toggle(this.surface(), g.k);
    if (this.openK() !== g.k) return;
    setTimeout(() => {
      this.host.nativeElement
        .querySelector<HTMLElement>(`[data-grp="${g.k}"]`)
        ?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    }, 320);
  }

  /** Moves the session to another institution, then opens the console afresh for it. */
  protected async switchTo(i: InstitutionChoice) {
    if (this.opening()) return;
    if (i.id === this.institution()?.id) {
      this.switching.set(false);
      return;
    }
    this.opening.set(i.id);
    try {
      await this.sessions.chooseInstitution(i.id);
      this.sessions.restart('/console');
    } catch (e) {
      this.overlays.toast("Couldn't switch the institution", {
        tone: 'bad',
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
      });
    } finally {
      this.opening.set(null);
    }
  }

  protected link(id: string) {
    const area = this.surface() === 'ops' ? '/backoffice' : '/console';
    const path = pathOf(id);
    return path === 'home' ? [area] : [area, path];
  }

  protected async signOut() {
    const surface = this.surface();
    await this.sessions.signOut(surface).catch(() => undefined);
    await this.router.navigateByUrl(surface === 'ops' ? '/backoffice/signin' : '/console/signin');
  }
}
