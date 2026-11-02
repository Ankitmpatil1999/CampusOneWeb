import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ViewEncapsulation,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
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
  imports: [Icon, Mark, OverlayHost, RouterOutlet],
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
          <!-- The school's own logo, else its initials (client 2026-10-15). -->
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
          <div class="grow">
            <b>{{ i.name }}</b
            ><small>Admissions{{ i.city ? ' · ' + i.city : '' }}</small>
          </div>
        } @else {
          <rp-mark [size]="42" />
          <div class="grow"><b>Admissions</b><small>School admissions on CampusOne</small></div>
        }
        <span class="t-xs t-muted row g6"
          ><rp-icon name="lock" [size]="13" /> Secure form · powered by CampusOne</span
        >
      </header>
      <main class="pub-main"><router-outlet /></main>
      <footer class="pub-foot">
        <rp-mark [size]="16" /> Applications are processed by
        {{ inst()?.shortName || inst()?.name || 'the school' }}. Only the details this form asks for
        are shared with the school.
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
