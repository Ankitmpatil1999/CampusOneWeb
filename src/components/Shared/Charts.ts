/**
 * The prototype's small charts: vertical bars (ui.bars, an SVG `.chart` of `.bar-r` rects with the
 * highlighted bar and the axis labels) and horizontal bars (ui.hbars, a label, a value and a `.bar`
 * meter per row). Values are plain numbers (paise for money); `fmt` formats them for the labels and
 * the tooltips.
 */
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface BarItem {
  readonly label: string;
  readonly value: number;
}

export interface HBarItem {
  readonly label: string;
  readonly value: number;
  /** The full length (100%) of this row's meter; the largest value otherwise. */
  readonly max?: number;
  readonly tone?: 'ok' | 'warn' | 'bad' | null;
}

const PAD = 18;

@Component({
  selector: 'rp-bars',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<svg
    class="chart"
    [attr.viewBox]="'0 0 ' + w() + ' ' + h()"
    role="img"
    [attr.aria-label]="aria()"
  >
    <line class="grid-l" x1="0" [attr.x2]="w()" [attr.y1]="h() - pad + 0.5" [attr.y2]="h() - pad + 0.5" />
    @for (b of bars(); track $index) {
      <rect
        class="bar-r grow-y"
        [class.hi]="$index === hi()"
        [style.animation-delay.ms]="$index * 40"
        [style.transform-origin]="b.origin"
        [attr.x]="b.x"
        [attr.y]="b.y"
        [attr.width]="b.w"
        [attr.height]="b.h"
        [attr.rx]="b.rx"
      >
        <title>{{ b.title }}</title>
      </rect>
    }
    @for (l of labels(); track $index) {
      @if (l.text) {
        <text [attr.x]="l.x" [attr.y]="h() - 4" text-anchor="middle">{{ l.text }}</text>
      }
    }
  </svg>`,
})
export class Bars {
  readonly items = input.required<readonly BarItem[]>();
  readonly w = input(320);
  readonly h = input(130);
  /** The highlighted bar (the prototype's `hi`, usually today). */
  readonly hi = input(-1);
  readonly aria = input('Bar chart');
  readonly fmt = input<(v: number) => string>((v) => String(v));
  protected readonly pad = PAD;

  private readonly step = computed(() => (this.w() - 8) / Math.max(1, this.items().length));
  protected readonly bars = computed(() => {
    const items = this.items();
    const max = Math.max(...items.map((i) => i.value), 1) * 1.1;
    const bw = this.step();
    const gap = Math.min(10, bw * 0.32);
    const H = this.h();
    return items.map((it, i) => {
      const h = Math.max(2, ((H - PAD) * it.value) / max);
      const x = 4 + i * bw + gap / 2;
      return {
        x,
        y: H - PAD - h,
        w: bw - gap,
        h,
        rx: Math.min(6, (bw - gap) / 3),
        origin: `${x + (bw - gap) / 2}px ${H - PAD}px`,
        title: `${it.label}: ${this.fmt()(it.value)}`,
      };
    });
  });
  /** With more than 12 bars only about eight labels and the last one are drawn. */
  protected readonly labels = computed(() => {
    const items = this.items();
    const n = items.length;
    const bw = this.step();
    return items.map((it, i) => ({
      x: 4 + i * bw + bw / 2,
      text: n > 12 && i % Math.ceil(n / 8) !== 0 && i !== n - 1 ? '' : it.label,
    }));
  });
}

@Component({
  selector: 'rp-hbars',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="stack g8">
    @for (r of rows(); track $index) {
      <div class="stack g4">
        <div class="row between t-sm">
          <span class="t-ink2 t-clip">{{ r.label }}</span><b class="t-num">{{ r.text }}</b>
        </div>
        <div
          class="bar"
          [class]="'bar' + (r.tone ? ' ' + r.tone : '')"
          role="meter"
          [attr.aria-label]="r.label"
          [attr.aria-valuenow]="r.pct"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <i [style.width.%]="r.pct"></i>
        </div>
      </div>
    }
  </div>`,
})
export class HBars {
  readonly items = input.required<readonly HBarItem[]>();
  readonly fmt = input<(v: number) => string>((v) => String(v));
  protected readonly rows = computed(() => {
    const items = this.items();
    const max = Math.max(...items.map((i) => i.max || i.value), 1);
    return items.map((i) => ({
      label: i.label,
      text: this.fmt()(i.value),
      tone: i.tone ?? null,
      pct: Math.round(Math.min(100, Math.max(0, (100 * i.value) / (i.max || max))) * 10) / 10,
    }));
  });
}
