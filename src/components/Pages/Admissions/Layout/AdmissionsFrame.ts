import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ViewEncapsulation,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { CAMPUSONE_WEB_CONFIG } from '../../../../Config';
import { Icon } from '../../../Shared/Icon';
import { Mark } from '../../../Shared/Mark';
import { OverlayHost } from '../../../Shared/Overlays';
import { AdmissionsContext, crest } from '../admissions.store';

/**
 * The public admission page's frame (prototype 07_shell.js, surface "p"): the school's header with
 * its crest, the routed page and the footer. A family reaches it from the school's admission link
 * or QR; the header names the school of that link (ADM-001).
 */
@Component({
  selector: 'rp-admissions-frame',
  imports: [Icon, Mark, OverlayHost, RouterLink, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: block; min-height: 100%' },
  // Not encapsulated: the prototype's `.x > .ic` rules, restated for an icon inside its rp-icon host.
  encapsulation: ViewEncapsulation.None,
  styles: `
    .pub {
      min-height: 100vh;
    }
    .pub-top .mk {
      border-radius: 12px;
      flex: none;
    }
    .pa-res-none > rp-icon > .ic {
      color: var(--ink-3);
      flex: none;
      margin-top: 2px;
    }
    .pa-mid > rp-icon > .ic {
      color: var(--accent-2);
      flex: none;
      margin-top: 1px;
    }
    .pa-feebox > rp-icon > .ic {
      color: var(--brand-2);
      flex: none;
      margin-top: 1px;
    }
  `,
  template: `
    <div class="pub" id="pubroot">
      <header class="pub-top">
        @if (inst(); as i) {
          <div class="pub-brand-wrap">
            @if (logo(); as src) {
              <img
                class="crest"
                id="pa-logo"
                [src]="src"
                [alt]="i.name + ' logo'"
                style="object-fit: contain; background: #fff"
                (error)="logoFailed.set(true)"
              />
            } @else {
              <span class="crest" aria-hidden="true">{{ crestOf(i.name) }}</span>
            }
            <div class="pub-inst-info">
              <div class="pub-inst-title-row">
                <b class="pub-inst-name">{{ i.name }}</b>
                <span class="pub-status-pill"><span class="pub-pulse-dot"></span>Admissions Open</span>
              </div>
              <small class="pub-inst-sub">Autonomous Engineering Institution · Approved by AICTE, Affiliated to RTMNU{{ i.city ? ' · ' + i.city : '' }}</small>
            </div>
          </div>
        } @else {
          <div class="pub-brand-wrap">
            <rp-mark [size]="42" />
            <div class="pub-inst-info">
              <b class="pub-inst-name">College Admissions</b>
              <small class="pub-inst-sub">Centralized Online Admission Portal</small>
            </div>
          </div>
        }
        <div class="pub-top-trust">
          <a
            routerLink="/admissions/brochure"
            class="pub-trust-pill"
            style="text-decoration: none; cursor: pointer; color: #EA580C; font-weight: 700; background: rgba(234, 88, 12, 0.1); border: 1px solid rgba(234, 88, 12, 0.25)"
          >
            <rp-icon name="book" [size]="13" /> College Brochure & Courses
          </a>
          <span class="pub-trust-pill">
            <rp-icon name="lock" [size]="13" /> 256-Bit SSL Encrypted
          </span>
          <span class="pub-trust-pill secondary">
            <rp-icon name="sparkles" [size]="12" /> NexCoreGen Secured
          </span>
        </div>
      </header>

      <main class="pub-main"><router-outlet /></main>

      <footer class="pub-foot">
        <div class="pub-foot-inner">
          <div class="pub-foot-meta">
            <b>{{ inst()?.name || 'Priyadarshini Bhagwati College of Engineering' }}</b>
            <p>Campus Admissions Cell: Harpur Nagar, Umred Road, Nagpur, Maharashtra 440009 · Helpline: +91 (0712) 2712345 / 9876543210</p>
          </div>
          <div class="pub-foot-legal">
            <span>© 2026 NexCoreGen Technology Pvt Ltd · Certified Educational SaaS Platform</span>
            <span>All submissions are securely encrypted & directly processed by the college admissions cell.</span>
          </div>
        </div>
      </footer>
    </div>
    <rp-overlays [fixed]="true" />
  `,
})
export class AdmissionsFrame {
  private readonly ctx = inject(AdmissionsContext);
  protected readonly inst = computed(() => this.ctx.landing()?.institution ?? null);
  private readonly apiBase = inject(CAMPUSONE_WEB_CONFIG, { optional: true })?.apiBaseUrl ?? '';
  /** A logo that didn't load shows the initials instead. */
  protected readonly logoFailed = signal(false);
  protected readonly logo = computed(() => {
    const url = this.inst()?.logoUrl;
    return url && !this.logoFailed() ? this.apiBase + url : null;
  });

  constructor() {
    const router = inject(Router);
    const sub = router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => scrollTop(false));
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  protected crestOf(name: string) {
    return crest(name);
  }
}

/** Scrolls the page to the top (a step or a result changed), gently unless motion is reduced. */
export function scrollTop(smooth = true) {
  // jsdom (unit tests) has no scrolling
  if (typeof navigator === 'undefined' || /jsdom/i.test(navigator.userAgent)) return;
  const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  globalThis.scrollTo?.({ top: 0, behavior: smooth && !reduce ? 'smooth' : 'auto' });
}
