import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import type { IconName } from '../../../Utils/icons';

/** How Accounts collects a fee (client 2026-10-22). */
export type CollectWay = 'PAY_NOW' | 'LINK' | 'CASH';

/**
 * The three ways, the same wherever a fee is collected — the admission fees page and Collect fee
 * (client 2026-10-22): the gateway's checkout at once (no link), a payment link sent to the family,
 * or cash at the desk.
 */
export const COLLECT_WAYS: readonly {
  readonly v: CollectWay;
  readonly title: string;
  readonly sub: string;
  readonly icon: IconName;
}[] = [
  {
    v: 'PAY_NOW',
    title: 'Pay now',
    sub: 'Opens the payment gateway now — card, UPI or net banking. No link is sent.',
    icon: 'card',
  },
  {
    v: 'LINK',
    title: 'Send link',
    sub: 'A payment link that works for 1 day, sent to the student and parents by SMS, e-mail and in the app.',
    icon: 'send',
  },
  {
    v: 'CASH',
    title: 'Record cash',
    sub: 'Cash received at the desk, with a receipt.',
    icon: 'rupee',
  },
];

/**
 * The ways to collect, as choice cards. A way with a reason in `why` is shown with the reason and
 * can't be chosen. Side by side only where the three fit with their text on a few lines; else one
 * under another, full width (client 2026-10-22: the text wrapped word by word in Collect fee).
 */
@Component({
  selector: 'rp-collect-choices',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  styles: `
    .cw-box {
      container-type: inline-size;
      min-width: 0;
    }
    @container (max-width: 759px) {
      .ob-cgrid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
  template: `
    <div class="cw-box">
      <div
        class="ob-cgrid"
        [style.grid-template-columns]="stacked() ? 'minmax(0, 1fr)' : null"
        role="radiogroup"
        aria-label="How to collect"
      >
        @for (c of ways; track c.v) {
          @let off = !!why()[c.v] || disabled();
          <div
            class="choice"
            [id]="'cw-' + c.v"
            [class.on]="value() === c.v"
            [class.off]="off"
            [attr.tabindex]="off ? -1 : 0"
            role="radio"
            [attr.aria-checked]="value() === c.v"
            [attr.aria-disabled]="off || null"
            (click)="pick(c.v)"
            (keydown.enter)="pick(c.v)"
            (keydown.space)="$event.preventDefault(); pick(c.v)"
          >
            <span class="li-ic sm"><rp-icon [name]="c.icon" [size]="17" /></span>
            <span class="grow"
              ><span class="t-h4" style="display: block">{{ c.title }}</span
              ><span class="t-sm t-muted cw-sub" style="display: block; margin-top: 1px">{{
                why()[c.v] || c.sub
              }}</span></span
            ><span class="radio"></span>
          </div>
        }
      </div>
    </div>
  `,
})
export class CollectChoices {
  readonly value = input<CollectWay | null>(null);
  /** Why a way can't be used for this fee now. */
  readonly why = input<Partial<Record<CollectWay, string>>>({});
  readonly disabled = input(false);
  /** One card under another (a narrow dialog), whatever the room. */
  readonly stacked = input(false);
  readonly chosen = output<CollectWay>();

  protected readonly ways = COLLECT_WAYS;

  protected pick(v: CollectWay) {
    if (this.disabled() || this.why()[v]) return;
    this.chosen.emit(v);
  }
}
