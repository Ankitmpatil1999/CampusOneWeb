import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Amount } from '../../../Shared/Amount';
import { Icon } from '../../../Shared/Icon';
import { formatDate } from '../../../Utils/format';
import { feeChip } from '../Applications/app-format';
import type { AppStatus, FeeType } from '../Applications/applications.api';
import type { AdmissionFee } from './admission-fees.api';

/**
 * One fee of an application on the admission fees page (client 2026-10-12: the application and
 * admission fees together): the amount and its status, how and when it was paid with the receipt,
 * and what the accounts desk can do — confirm the receipt, open it, or collect the fee (one button
 * that asks how, client 2026-10-22: pay now, send a link or record cash).
 */
@Component({
  selector: 'rp-af-fee',
  imports: [Amount, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `@if (fee(); as f) {
      <div class="af-fee">
        <div class="row g8 wrap">
          <rp-amt [value]="f.amount" />
          <span [class]="'chip dot tone-' + chip().tone">{{ chip().l }}</span>
        </div>
        <div class="cell-s">
          @if (f.status === 'PAID') {
            {{ f.mode === 'CASH' ? 'Cash' : 'Online' }} ·
            <span class="t-mono">{{ f.receiptNo ?? '—' }}</span>
            @if (f.paidAt) {
              · {{ date(f.paidAt) }}
            }
            @if (f.confirmedAt) {
              · confirmed {{ date(f.confirmedAt) }}
            }
          } @else {
            {{ dueText() }}
          }
        </div>
        @if (f.status === 'PAID') {
          <div class="row g4 wrap">
            @if (!f.confirmedAt) {
              <span class="cp-why" [attr.title]="verifyWhy() || null"
                ><button
                  type="button"
                  class="btn btn-soft btn-xs af-confirm"
                  [class.is-busy]="confirming()"
                  [disabled]="!!verifyWhy() || confirming()"
                  (click)="confirm.emit(f)"
                >
                  <rp-icon name="checkc" [size]="15" /><span>Confirm receipt</span>
                </button></span
              >
            }
            <button type="button" class="btn btn-ghost btn-xs af-receipt" (click)="receipt.emit(f)">
              <rp-icon name="receipt" [size]="15" /><span>Receipt</span>
            </button>
          </div>
        } @else if (status() !== 'REJECTED') {
          <div class="row g4 wrap">
            <span class="cp-why" [attr.title]="collectWhy() || null"
              ><button
                type="button"
                class="btn btn-soft btn-xs af-collect"
                [class.is-busy]="busy()"
                [disabled]="!!collectWhy() || busy()"
                (click)="collect.emit(f)"
              >
                <rp-icon name="rupee" [size]="15" /><span>Collect fees</span>
              </button></span
            >
          </div>
        }
      </div>
    } @else {
      <span class="t-faint">{{ absentText() }}</span>
    }`,
})
export class FeeCell {
  /** The fee, or null when the application has none of this type (yet). */
  readonly fee = input<AdmissionFee | null>(null);
  readonly type = input.required<FeeType>();
  /** The application's status. */
  readonly status = input.required<AppStatus>();
  readonly verifyWhy = input('');
  readonly collectWhy = input('');
  readonly confirming = input(false);
  /** A collection of this fee is under way (a payment link, the gateway's checkout). */
  readonly busy = input(false);
  readonly confirm = output<AdmissionFee>();
  readonly receipt = output<AdmissionFee>();
  /** Collect fees: the page asks how (client 2026-10-22). */
  readonly collect = output<AdmissionFee>();

  protected readonly chip = computed(() => feeChip(this.fee()!));
  protected readonly dueText = computed(() => {
    const s = this.status();
    if (s === 'REJECTED') return 'Application rejected — not collected';
    if (this.type() === 'APPLICATION' && s === 'DRAFT') return 'Declared — submitted once paid';
    return 'Online, or in cash at the desk';
  });
  protected readonly absentText = computed(() => {
    const s = this.status();
    if (this.type() === 'APPLICATION') return 'No application fee';
    if (s === 'DRAFT') return 'Due once submitted';
    return s === 'REJECTED' ? '—' : 'No admission fee';
  });

  protected date(v: string) {
    return formatDate(v);
  }
}
