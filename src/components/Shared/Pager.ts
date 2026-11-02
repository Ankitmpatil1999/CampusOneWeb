/**
 * The prototype table's pager (ui.table): "Showing 1–8 of 61" and the page buttons, with "…" where
 * pages are skipped (pagesList). Shown only when there is more than one page, unless `always`.
 */
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Icon } from './Icon';

/** The prototype's pagesList: every page up to 7, else 1 … p-1 p p+1 … n. */
export function pageList(p: number, n: number): (number | '…')[] {
  if (n <= 7) return Array.from({ length: n }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  if (p > 3) out.push('…');
  for (let i = Math.max(2, p - 1); i <= Math.min(n - 1, p + 1); i++) out.push(i);
  if (p < n - 2) out.push('…');
  out.push(n);
  return out;
}

@Component({
  selector: 'rp-pager',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `@if (total() > size() || (always() && total() > 0)) {
    <div class="pager">
      <span
        >Showing <b class="t-num">{{ from() }}–{{ to() }}</b> of
        <b class="t-num">{{ total().toLocaleString('en-IN') }}</b></span
      >
      <div class="pg">
        <button
          type="button"
          [disabled]="page() <= 1"
          aria-label="Previous"
          (click)="go.emit(page() - 1)"
        >
          <rp-icon name="left" [size]="14" />
        </button>
        @for (p of list(); track $index) {
          @if (p === '…') {
            <button type="button" disabled>…</button>
          } @else {
            <button
              type="button"
              [class.on]="p === page()"
              [attr.aria-current]="p === page() ? 'page' : null"
              (click)="go.emit(p)"
            >
              {{ p }}
            </button>
          }
        }
        <button
          type="button"
          [disabled]="page() >= pages()"
          aria-label="Next"
          (click)="go.emit(page() + 1)"
        >
          <rp-icon name="right" [size]="14" />
        </button>
      </div>
    </div>
  }`,
})
export class Pager {
  readonly total = input.required<number>();
  readonly page = input.required<number>();
  readonly size = input(12);
  /** Shown on a single page too ("Showing 1–8 of 8"), not only when there are more pages. */
  readonly always = input(false);
  readonly go = output<number>();
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / this.size())));
  protected readonly list = computed(() => pageList(this.page(), this.pages()));
  protected readonly from = computed(() => (this.page() - 1) * this.size() + 1);
  protected readonly to = computed(() => Math.min(this.page() * this.size(), this.total()));
}
