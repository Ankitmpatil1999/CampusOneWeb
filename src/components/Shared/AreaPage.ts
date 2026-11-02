import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Area } from '../../Config';
import { ApiHealth } from './ApiHealth';

/** Home of an area: its name, who it is for and the service status (Phase 1 placeholder). */
@Component({
  selector: 'rp-area-page',
  imports: [ApiHealth],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>{{ area().title }}</h1>
    <p class="purpose">{{ area().purpose }}</p>
    <section class="card" aria-labelledby="status-title">
      <h2 id="status-title">Service status</h2>
      <rp-api-health />
      <p class="note">Foundation build (Phase 1). Screens arrive in the phases of their modules.</p>
    </section>
  `,
  styles: `
    h1 {
      font: 600 var(--t-3xl) / 1.2 var(--f-display);
      margin: 0 0 8px;
    }
    .purpose {
      color: var(--ink-3);
      margin: 0 0 24px;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--r-lg);
      box-shadow: var(--shadow-1);
      padding: 20px;
    }
    h2 {
      font: 600 var(--t-lg) / 1.3 var(--f-display);
      margin: 0 0 12px;
    }
    .note {
      color: var(--ink-3);
      font-size: var(--t-sm);
      margin: 12px 0 0;
    }
  `,
})
export class AreaPage {
  readonly area = input.required<Area>();
}
