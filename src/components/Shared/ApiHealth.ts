import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { ApiHealthService } from '../Utils/health.service';

/** Status of the API connection with loading, success and error states (prototype states). */
@Component({
  selector: 'rp-api-health',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (health.state().status) {
      @case ('loading') {
        <span class="chip chip--info" role="status" aria-live="polite">Checking the service…</span>
      }
      @case ('up') {
        <span class="chip chip--ok" role="status" aria-live="polite">Service available</span>
      }
      @case ('down') {
        <span class="chip chip--bad" role="alert">
          {{ downMessage() }}
          @if (correlationId(); as id) {
            <span class="ref">Ref {{ id }}</span>
          }
        </span>
        <button type="button" class="retry" (click)="health.check()">Try again</button>
      }
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      gap: 8px;
      align-items: center;
      font: var(--t-sm) / 1.4 var(--f-body);
    }
    .chip {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      padding: 4px 10px;
      border-radius: var(--r-full);
      border: 1px solid;
    }
    .chip--info {
      color: var(--info);
      background: var(--info-soft);
      border-color: var(--info-line);
    }
    .chip--ok {
      color: var(--ok);
      background: var(--ok-soft);
      border-color: var(--ok-line);
    }
    .chip--bad {
      color: var(--bad);
      background: var(--bad-soft);
      border-color: var(--bad-line);
    }
    .ref {
      font-family: var(--f-mono);
      font-size: var(--t-xs);
      opacity: 0.8;
    }
    .retry {
      font: inherit;
      padding: 4px 10px;
      border-radius: var(--r-sm);
      border: 1px solid var(--line-2);
      background: var(--surface);
      color: var(--ink);
      cursor: pointer;
    }
    .retry:focus-visible {
      outline: none;
      box-shadow: var(--focus);
    }
  `,
})
export class ApiHealth implements OnInit {
  protected readonly health = inject(ApiHealthService);

  ngOnInit(): void {
    void this.health.check();
  }

  protected downMessage(): string {
    const s = this.health.state();
    return s.status === 'down' ? s.message : '';
  }

  protected correlationId(): string | null {
    const s = this.health.state();
    return s.status === 'down' ? s.correlationId : null;
  }
}
