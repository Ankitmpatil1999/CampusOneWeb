import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AreasService } from '../Utils/areas.service';
import type { IconName } from '../Utils/icons';
import { ApiHealth } from '../Shared/ApiHealth';
import { Icon } from '../Shared/Icon';
import { Mark } from '../Shared/Mark';

/** The prototype's surface icons (its top tabs). */
const ICONS: Record<string, IconName> = {
  console: 'monitor',
  backoffice: 'server',
  portal: 'cloud',
  admissions: 'globe',
  terminal: 'nfc',
};

/**
 * Landing page of the web application: one app serves the console, the back office, the SaaS portal,
 * the admission pages and the terminals (ADR-0014); a back-office host shows only the back office.
 * Drawn with the prototype's card and list rows.
 */
@Component({
  selector: 'rp-dashboard',
  imports: [ApiHealth, Icon, Mark, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:block;min-height:100vh;background:var(--bg)' },
  template: `
    <main class="cp-am" style="min-height: 100vh">
      <div class="cp-af">
        <div class="row g12">
          <rp-mark [size]="40" />
          <div class="cp-af-h">
            <h1>CampusOne</h1>
            <p style="margin-top: 2px">Campus wallets, payments and school management.</p>
          </div>
        </div>
        <ul class="list areas">
          @for (a of areas(); track a.path) {
            <li>
              <a class="li" [routerLink]="['/', a.path]">
                <span class="li-ic"><rp-icon [name]="a.icon" [size]="18" /></span>
                <span class="li-main"
                  ><span class="li-t">{{ a.title }}</span
                  ><span class="li-s wrap">{{ a.purpose }}</span></span
                >
                <span class="li-chev"><rp-icon name="right" [size]="16" /></span>
              </a>
            </li>
          }
        </ul>
        <div class="row between t-xs t-muted">
          <span>Service status</span>
          <rp-api-health />
        </div>
      </div>
    </main>
  `,
  styles: `
    .areas a.li {
      text-decoration: none;
      color: inherit;
    }
  `,
})
export class Dashboard {
  private readonly all = inject(AreasService).areas;
  protected readonly areas = computed(() =>
    this.all().map((a) => ({ ...a, icon: ICONS[a.path] ?? 'grid' })),
  );
}
