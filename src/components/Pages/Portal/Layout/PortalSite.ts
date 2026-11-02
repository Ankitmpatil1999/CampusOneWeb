import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { PortalContext } from '../../../../Context/PortalContext';
import { Icon } from '../../../Shared/Icon';
import { OverlayHost } from '../../../Shared/Overlays';
import { SiteLogo, Terms } from '../Shared/PortalUi';

/**
 * The public website of the customer portal (prototype `siteNav` / `siteFoot`, layout "site"): the
 * sticky top bar with Product, Pricing and the two anchors, sign-in and the trial button (or "Your
 * account" when signed in), the routed page and the footer with the terms.
 */
@Component({
  selector: 'rp-portal-site',
  imports: [Icon, OverlayHost, RouterOutlet, SiteLogo, Terms],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: block; height: 100%' },
  template: `
    <div class="sp-site">
      <header class="sp-nav">
        <button type="button" aria-label="CampusOne for Schools home" (click)="go('/portal')">
          <rp-sp-logo />
        </button>
        <nav class="sp-links" aria-label="Site">
          <button type="button" [class.on]="page() === 'home'" (click)="go('/portal')">
            Product
          </button>
          <button type="button" [class.on]="page() === 'pricing'" (click)="go('/portal/pricing')">
            Pricing
          </button>
          <button type="button" (click)="anchor('how')">How onboarding works</button>
          <button type="button" (click)="anchor('faq')">Questions</button>
        </nav>
        <span class="grow"></span>
        @if (signedIn()) {
          <button type="button" class="btn btn-pri btn-sm" (click)="go(accountHome())">
            <rp-icon name="user" [size]="15" /><span>Your account</span>
          </button>
        } @else {
          <button type="button" class="btn btn-ghost btn-sm hide-sm" (click)="go('/portal/signin')">
            <span>Sign in</span>
          </button>
          <button type="button" class="btn btn-accent btn-sm" (click)="go('/portal/signup')">
            <span>Start free trial</span>
          </button>
        }
      </header>
      <main class="sp-main"><router-outlet /></main>
      <footer class="sp-foot">
        <div class="sp-wrap">
          <div class="stack g8">
            <rp-sp-logo />
            <p>CampusOne is a campus payments and school management platform.</p>
          </div>
          <nav aria-label="Footer">
            <button type="button" (click)="go('/portal/pricing')">Pricing</button>
            <button type="button" (click)="go('/portal/signin')">Sign in</button>
            <button type="button" (click)="go('/portal/signup')">Start a trial</button>
            <button type="button" (click)="terms.set('sub')">Subscription terms</button>
            <button type="button" (click)="terms.set('dp')">Data processing</button>
          </nav>
        </div>
      </footer>
    </div>
    @if (terms(); as k) {
      <rp-sp-terms [kind]="k" (closed)="terms.set(null)" />
    }
    <rp-overlays [fixed]="true" />
  `,
})
export class PortalSite {
  private readonly router = inject(Router);
  private readonly ctx = inject(PortalContext);
  protected readonly terms = signal<'sub' | 'dp' | null>(null);
  protected readonly signedIn = computed(() => !!this.ctx.session());
  /** SP.homeFor: the checklist before go-live, the overview after. */
  protected readonly accountHome = computed(() =>
    this.ctx.session()?.institution.status === 'PENDING_ACTIVATION'
      ? '/portal/onboard'
      : '/portal/account',
  );
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );
  protected readonly page = computed(() =>
    this.url().split(/[?#]/)[0]?.endsWith('/pricing') ? 'pricing' : 'home',
  );

  constructor() {
    void this.ctx.loadQuietly();
  }

  protected go(path: string) {
    void this.router.navigateByUrl(path);
  }

  /** sp.anchor: scrolls to the section on the home page (opening it first). */
  protected async anchor(id: 'how' | 'faq') {
    if (this.page() !== 'home') await this.router.navigateByUrl('/portal');
    setTimeout(() => {
      const el = document.getElementById(`sp-${id}`);
      if (!el) return;
      const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: el.offsetTop - 70, behavior: reduce ? 'auto' : 'smooth' });
    }, 120);
  }
}
