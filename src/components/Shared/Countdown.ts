import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** ui.cd: a ring that empties as the time runs out, with the time left in the middle. */
@Component({
  selector: 'rp-countdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="cd" [style.width.px]="size()" [style.height.px]="size()" role="timer">
    <svg [attr.width]="size()" [attr.height]="size()">
      <circle
        class="trk"
        [attr.cx]="size() / 2"
        [attr.cy]="size() / 2"
        [attr.r]="radius()"
        [attr.stroke-width]="stroke()"
      />
      <circle
        class="val"
        [attr.cx]="size() / 2"
        [attr.cy]="size() / 2"
        [attr.r]="radius()"
        [attr.stroke-width]="stroke()"
        [attr.stroke-dasharray]="circumference()"
        [attr.stroke-dashoffset]="offset()"
      />
    </svg>
    <div class="cd-c">
      <div>
        <b
          class="cd-t t-num"
          [style.font-size.px]="fontSize()"
          style="font-weight: 650; display: block; line-height: 1"
          >{{ label() }}</b
        >
        @if (caption()) {
          <small class="t-xs t-muted">{{ caption() }}</small>
        }
      </div>
    </div>
  </div>`,
})
export class Countdown {
  readonly total = input.required<number>();
  readonly left = input.required<number>();
  readonly size = input(64);
  readonly stroke = input(4);
  readonly caption = input<string | null>(null);
  protected readonly radius = computed(() => (this.size() - this.stroke()) / 2);
  protected readonly circumference = computed(() => 2 * Math.PI * this.radius());
  protected readonly offset = computed(
    () => this.circumference() * (1 - Math.max(0, Math.min(1, this.left() / (this.total() || 1)))),
  );
  protected readonly fontSize = computed(() => Math.round(this.size() / 4.2));
  /** fmt.dur: "42" below a minute, otherwise "m:ss". */
  protected readonly label = computed(() => {
    const s = Math.max(0, Math.round(this.left()));
    return s < 60 ? String(s) : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  });
}
