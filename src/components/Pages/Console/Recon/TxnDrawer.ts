import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Amount, type MoneyLike } from '../../../Shared/Amount';
import { Modal } from '../../../Shared/Overlays';

/** What the drawer shows: the amount, the status, the details and what the ledger holds. */
export interface TxnView {
  readonly reference: string;
  readonly amount: MoneyLike;
  readonly sign?: '+' | '−' | null;
  readonly caption: string;
  readonly status: { readonly l: string; readonly tone: string };
  readonly kv: readonly { readonly k: string; readonly v: string; readonly mono?: boolean }[];
  readonly ledger: string;
}

/**
 * The transaction drawer (prototype cm.tx.open): the amount and status, the details (when, mode,
 * from, to, settlement) and the ledger note. Opened from a transaction or a statement line.
 */
@Component({
  selector: 'rp-txn-drawer',
  imports: [Amount, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @let t = view();
    <rp-modal
      title="Transaction"
      [sub]="t.reference"
      icon="receipt"
      [drawer]="true"
      [slim]="true"
      cls="cm-m"
      [foot]="false"
      (closed)="closed.emit()"
    >
      <div class="cm-dr">
        <div class="stack g16">
          <div class="cm-hero">
            <div class="grow">
              <div><rp-amt [value]="t.amount" [sign]="t.sign ?? null" cls="big" /></div>
              <div class="t-sm t-muted mt4">{{ t.caption }}</div>
            </div>
            <span [class]="'chip dot lg tone-' + t.status.tone">{{ t.status.l }}</span>
          </div>
          <dl class="kv">
            @for (x of t.kv; track x.k) {
              <dt>{{ x.k }}</dt>
              <dd>
                @if (!x.v) {
                  <span class="t-faint">—</span>
                } @else if (x.mono) {
                  <span class="t-mono">{{ x.v }}</span>
                } @else {
                  {{ x.v }}
                }
              </dd>
            }
          </dl>
          <div class="sec-h"><h3>Ledger entries</h3></div>
          <p class="t-sm t-muted">{{ t.ledger }}</p>
        </div>
      </div>
    </rp-modal>
  `,
})
export class TxnDrawer {
  readonly view = input.required<TxnView>();
  readonly closed = output<void>();
}
