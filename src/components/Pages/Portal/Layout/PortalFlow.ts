import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SiteLogo } from '../Shared/PortalUi';

/**
 * The sign-up and sign-in frame (prototype `flowFrame`, layout "flow"): the brand panel on the left
 * with the page's own side content (`[flow-side]`), the top line (`[flow-top]`) and the form.
 */
@Component({
  selector: 'rp-sp-flow',
  imports: [SiteLogo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="sp-flow">
    <aside class="sp-fside">
      <button
        type="button"
        style="align-self: flex-start"
        aria-label="CampusOne for Schools home"
        (click)="home()"
      >
        <rp-sp-logo />
      </button>
      <ng-content select="[flow-side]" />
    </aside>
    <div class="sp-fmain">
      <div class="sp-ftop"><ng-content select="[flow-top]" /></div>
      <div class="sp-fbody"><ng-content /></div>
    </div>
  </div>`,
})
export class PortalFlow {
  private readonly router = inject(Router);

  protected home() {
    void this.router.navigateByUrl('/portal');
  }
}
