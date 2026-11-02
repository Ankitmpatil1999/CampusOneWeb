import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { Modal } from '../../../Shared/Overlays';
import { CollectChoices, type CollectWay } from '../Fees/CollectChoices';
import { inr, money, paiseOf } from '../Fees/fee-format';
import type { AdmissionFee } from './admission-fees.api';

/**
 * Collect fees (client 2026-10-22): the one button on a fee of the admission fees page asks how —
 * Pay now (the gateway's checkout at the desk, no link), Send link (a payment link sent to the
 * family) or Record cash — the same choices as Collect fee on the fee collection page. From the
 * counsellor's form (client 2026-10-23) the admission fee chosen "Pay now" comes `also`: Pay now
 * takes both in one payment, as the public form does; cash records the admission fee next.
 */
@Component({
  selector: 'rp-collect-fee',
  imports: [CollectChoices, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="'Collect fees · ' + (fee().student ?? fee().applicationNo)"
      [sub]="fee().applicationNo"
      icon="rupee"
      cls="cm-m"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="cf-body">
        <div class="c-grid k2">
          <div class="cm-tile">
            <span>{{ feeName() }}</span
            ><b class="t-num">{{ feeAmount() }}</b>
          </div>
          @if (also(); as a) {
            <div class="cm-tile" id="cf-also">
              <span>Admission fee</span><b class="t-num">{{ inr(a.amount) }}</b>
            </div>
          } @else {
            <div class="cm-tile">
              <span>Application</span><b class="t-mono">{{ fee().applicationNo }}</b>
            </div>
          }
        </div>
        @if (also()) {
          <div class="note tone-brand" id="cf-both">
            <rp-icon name="info" [size]="17" />
            <div class="grow">
              Both fees, {{ amount() }}: Pay now takes them in one payment, with a receipt for each.
              With cash, the application fee is recorded first, then the admission fee.
            </div>
          </div>
        }
        <rp-collect-choices
          [value]="way()"
          [why]="why()"
          [stacked]="true"
          (chosen)="way.set($event)"
        />
      </div>
      <div modal-foot class="row g8">
        <button type="button" class="btn btn-sec" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="cf-go"
          [disabled]="!way()"
          (click)="chosen.emit(way()!)"
        >
          <span>{{ goLabel() }}</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class CollectFee {
  readonly fee = input.required<AdmissionFee>();
  /** The admission fee collected with it (the counsellor's form chose "Pay now"). */
  readonly also = input<AdmissionFee | null>(null);
  /** Why a way can't be used for this fee now. */
  readonly why = input<Partial<Record<CollectWay, string>>>({});
  readonly closed = output<void>();
  readonly chosen = output<CollectWay>();

  protected readonly way = signal<CollectWay | null>(null);
  protected readonly feeName = computed(() =>
    this.fee().feeType === 'APPLICATION' ? 'Application fee' : 'Admission fee',
  );
  protected readonly inr = inr;
  protected readonly feeAmount = computed(() => inr(this.fee().amount));
  /** What is collected: the fee, and the admission fee with it. */
  protected readonly amount = computed(() => {
    const a = this.also();
    return a ? inr(money(paiseOf(this.fee().amount) + paiseOf(a.amount))) : this.feeAmount();
  });
  protected readonly goLabel = computed(() => {
    switch (this.way()) {
      case 'PAY_NOW':
        return `Pay ${this.amount()} now`;
      case 'LINK':
        return 'Send link';
      case 'CASH':
        return 'Record cash';
      default:
        return 'Continue';
    }
  });
}
