import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The CampusOne brand mark: the client's CampusOne logo (2026-10-21) on a white rounded tile, so it reads on
 * light and dark backgrounds alike. It replaces the prototype's RP.mark (two rings with a tap arc).
 */
@Component({
  selector: 'rp-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<img
    class="mk"
    src="campusone-mark.svg"
    [attr.width]="size()"
    [attr.height]="size()"
    alt="CampusOne"
    aria-hidden="true"
    draggable="false"
  />`,
})
export class Mark {
  readonly size = input(32);
}
