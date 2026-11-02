import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { PortalContext } from '../../../../Context/PortalContext';
import { Avatar } from '../../../Shared/Avatar';
import { Icon } from '../../../Shared/Icon';
import { LanguageMenu } from '../../../Shared/LanguageMenu';
import { Mark } from '../../../Shared/Mark';
import { OverlayHost, Overlays } from '../../../Shared/Overlays';
import { titleCase } from '../../../Utils/format';
import type { IconName } from '../../../Utils/icons';
import { PortalStore } from '../portal.store';
import { shownStatus, toneOf } from '../Shared/PortalUi';

interface NavItem {
  readonly path: string;
  readonly label: string;
  readonly icon: IconName;
  readonly n?: string | number | null;
  readonly tone?: string;
}

/**
 * The signed-in account frame (prototype `appFrame` / `appNav`, layout "app"): the header with the
 * institution, its status, the website link and sign-out; the menu (Get started · Subscription ·
 * Settings) with the checklist progress and unpaid invoices; the routed page.
 */
@Component({
  selector: 'rp-portal-app',
  imports: [Avatar, Icon, Mark, NgTemplateOutlet, OverlayHost, RouterOutlet, LanguageMenu],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: block; height: 100%' },
  template: `
    <div class="sp-app">
      <header class="sp-ahead">
        <button type="button" aria-label="Account home" (click)="go(store.home())">
          <rp-mark [size]="28" />
        </button>
        @if (ctx.session(); as s) {
          <div class="sp-inst">
            <rp-av [name]="s.institution.name" size="sm" [sq]="true" color="#0C6F7D" />
            <div style="min-width: 0">
              <b>{{ s.institution.name }}</b
              ><small>{{ s.institution.identifier }}</small>
            </div>
            <span [class]="'chip dot tone-' + tone(shown())">{{ shown() }}</span>
          </div>
        }
        <span class="grow"></span>
        <rp-lang-menu />
        <button type="button" class="btn btn-ghost btn-sm hide-sm" (click)="go('/portal')">
          <rp-icon name="globe" [size]="15" /><span>Website</span>
        </button>
        <div class="sp-me">
          <rp-av [name]="me()" size="sm" />
          <span class="nm"
            ><b>{{ me() }}</b
            ><small>Administrator</small></span
          >
        </div>
        <button
          type="button"
          class="iconbtn"
          title="Sign out"
          aria-label="Sign out"
          (click)="signOut()"
        >
          <rp-icon name="logout" [size]="20" />
        </button>
      </header>
      <nav class="sp-anav" aria-label="Account">
        @if (getStarted().length) {
          <div class="g">Get started</div>
          @for (it of getStarted(); track it.path) {
            <ng-container *ngTemplateOutlet="item; context: { $implicit: it }" />
          }
        }
        <div class="g">Subscription</div>
        @for (it of subscription(); track it.path) {
          <ng-container *ngTemplateOutlet="item; context: { $implicit: it }" />
        }
        <div class="g">Settings</div>
        @for (it of settings; track it.path) {
          <ng-container *ngTemplateOutlet="item; context: { $implicit: it }" />
        }
        <div class="help">
          <b>Your onboarding team</b>Write to
          <span class="t-mono">onboarding&#64;campusone.example</span> — we reply within one working
          day.
        </div>
      </nav>
      <main class="sp-page"><router-outlet /></main>
    </div>
    <ng-template #item let-it>
      <button type="button" class="it" [class.on]="active(it.path)" (click)="go(it.path)">
        <rp-icon [name]="it.icon" [size]="17" /><span class="grow t-clip">{{ it.label }}</span>
        @if (it.n) {
          <span class="n" [class]="'n ' + (it.tone ?? '')">{{ it.n }}</span>
        }
      </button>
    </ng-template>
    <rp-overlays [fixed]="true" />
  `,
})
export class PortalApp {
  private readonly router = inject(Router);
  private readonly overlays = inject(Overlays);
  protected readonly ctx = inject(PortalContext);
  protected readonly store = inject(PortalStore);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly me = computed(() => titleCase(this.ctx.session()?.name ?? 'Administrator'));
  protected readonly shown = computed(
    () =>
      this.store.shown() ?? shownStatus(this.ctx.session()?.institution.status ?? 'ACTIVE', null),
  );

  protected readonly getStarted = computed<NavItem[]>(() => {
    const a = this.store.account();
    const status = this.shown();
    const out: NavItem[] = [];
    const done = a?.onboarding.done ?? 0;
    const total = a?.onboarding.total ?? 0;
    if (status === 'Pending activation' || done < total) {
      out.push({
        path: '/portal/onboard',
        label: 'Onboarding',
        icon: 'clipcheck',
        n: total ? `${done}/${total}` : null,
        tone: done === total ? '' : 'warn',
      });
    }
    if (status === 'Pending activation' || status === 'Trial') {
      out.push({
        path: '/portal/activate',
        label: status === 'Trial' ? 'Choose a plan' : 'Go live',
        icon: 'power',
      });
    }
    return out;
  });

  protected readonly subscription = computed<NavItem[]>(() => [
    { path: '/portal/account', label: 'Overview', icon: 'dash' },
    { path: '/portal/plan', label: 'Plan & usage', icon: 'layers' },
    {
      path: '/portal/billing',
      label: 'Billing',
      icon: 'receipt',
      n: this.store.unpaid().length || null,
      tone: this.store.late() ? 'bad' : 'warn',
    },
    { path: '/portal/notices', label: 'Notices & history', icon: 'history' },
  ]);

  protected readonly settings: readonly NavItem[] = [
    { path: '/portal/details', label: 'Institution details', icon: 'building' },
    { path: '/portal/data', label: 'Data & cancellation', icon: 'archive' },
  ];

  constructor() {
    void this.store.refresh();
  }

  protected tone(s: string) {
    return toneOf(s);
  }

  /** The step pages belong to Onboarding in the menu. */
  protected active(path: string) {
    const here = this.url().split(/[?#]/)[0] ?? '';
    if (path === '/portal/onboard') return here === path || here.startsWith('/portal/step/');
    return here === path;
  }

  protected go(path: string) {
    void this.router.navigateByUrl(path);
  }

  /** sp.signout */
  protected async signOut() {
    const ok = await this.overlays.confirm({
      title: 'Sign out of the portal?',
      text: "You'll need your password and a one-time code to sign in again.",
      ok: 'Sign out',
      icon: 'logout',
    });
    if (!ok) return;
    try {
      await this.ctx.signOut();
    } finally {
      this.store.clear();
      await this.router.navigateByUrl('/portal');
      this.overlays.toast('Signed out');
    }
  }
}
