import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { ICON_PATHS, type IconName } from '../Utils/icons';

/**
 * The prototype's icon (RP.ic): `<svg class="ic">` with the RP.IP paths, a round stroke in the
 * current colour. The host is `display: contents` so the svg sits directly in the prototype's
 * layouts (`.c-item .ic`, `.btn svg` …).
 */
@Component({
  selector: 'rp-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<svg
    class="ic"
    [attr.width]="size()"
    [attr.height]="size()"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    [attr.stroke-width]="stroke()"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    [innerHTML]="paths()"
  ></svg>`,
})
export class Icon {
  private readonly sanitizer = inject(DomSanitizer);
  readonly name = input.required<IconName>();
  readonly size = input(18);
  readonly stroke = input(2);
  /** The paths are generated from the prototype (scripts/port-prototype.ts), never user input. */
  protected readonly paths = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(ICON_PATHS[this.name()] ?? ICON_PATHS.circle),
  );
}
