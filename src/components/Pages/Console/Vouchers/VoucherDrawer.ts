import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { inrText } from '../../../Shared/Amount';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate, formatTime } from '../../../Utils/format';
import { newIdempotencyKey } from '../../../Utils/ids';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { VOUCHER_STATUS } from './voucher-format';
import { VouchersApi, type Voucher } from './vouchers.api';

/**
 * The voucher drawer (prototype cm.vch.open; FEE-034, FEE-035): the status and attempts, the reason
 * a transfer failed and the next automatic try, the voucher's ledgers, the voucher as sent to the
 * package and its answer, and "Retry posting" for a failed one.
 */
@Component({
  selector: 'rp-voucher-drawer',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="'Voucher ' + v().reference"
      [sub]="v().eventLabel + ' · ' + v().company"
      icon="filetext"
      [drawer]="true"
      [slim]="true"
      cls="cm-m"
      [foot]="v().status === 'FAILED'"
      (closed)="closed.emit()"
    >
      <div class="cm-dr">
        <div class="stack g16">
          <div class="row g8">
            <span [class]="'chip dot lg tone-' + st().tone">{{ st().l() }}</span>
            <span class="t-sm t-muted">{{ attempts() }}</span>
          </div>
          @if (v().status === 'FAILED') {
            <div class="note tone-bad" id="vch-error">
              <rp-icon name="alertc" [size]="17" />
              <div class="grow">
                {{ v().lastError ?? 'The accounting package refused the voucher.' }}
                <div class="t-xs mt4">{{ nextTry() }}</div>
              </div>
            </div>
          }
          @if (v().status === 'PENDING') {
            <div class="note tone-info">
              <rp-icon name="hourglass" [size]="17" />
              <div class="grow">Waiting for the next run of the accounting transfer.</div>
            </div>
          }
          <dl class="kv" id="vch-kv">
            <dt>Amount</dt>
            <dd>{{ inr(v().amount) }}</dd>
            <dt>Date</dt>
            <dd>{{ date(v().date) }}</dd>
            <dt>Debit</dt>
            <dd>{{ v().debitLedger }}</dd>
            <dt>Credit</dt>
            <dd>{{ v().creditLedger }}</dd>
            <dt>Company</dt>
            <dd>{{ v().company }}</dd>
            <dt>Posting reference</dt>
            <dd>
              <span class="t-mono">{{ v().reference }}</span>
            </dd>
            <dt>External reference</dt>
            <dd>
              @if (v().externalRef) {
                <span class="t-mono">{{ v().externalRef }}</span>
              } @else {
                <span class="t-faint">—</span>
              }
            </dd>
            @if (v().transferredAt) {
              <dt>Transferred</dt>
              <dd>{{ when(v().transferredAt) }}</dd>
            }
          </dl>
          <div class="sec-h"><h3>Voucher sent</h3></div>
          <pre class="cm-code">{{ request() }}</pre>
          <div class="sec-h"><h3>Response</h3></div>
          @if (response(); as r) {
            <pre class="cm-code">{{ r }}</pre>
          } @else {
            <p class="t-sm t-muted">Not sent yet.</p>
          }
        </div>
      </div>
      <ng-container modal-foot>
        @if (editWhy()) {
          <span class="cp-why" [attr.title]="editWhy()"
            ><button type="button" class="btn btn-pri" disabled>
              <rp-icon name="refresh" [size]="17" /><span>Retry posting</span>
            </button></span
          >
        } @else {
          <button
            type="button"
            class="btn btn-pri"
            id="vch-retry"
            [class.is-busy]="busy()"
            [disabled]="busy()"
            (click)="retry()"
          >
            <rp-icon name="refresh" [size]="17" /><span>Retry posting</span>
          </button>
        }
      </ng-container>
    </rp-modal>
  `,
})
export class VoucherDrawer {
  private readonly api = inject(VouchersApi);
  private readonly overlays = inject(Overlays);

  readonly voucher = input.required<Voucher>();
  /** Why this person can't retry ('' when they can). */
  readonly editWhy = input('');
  readonly closed = output<void>();
  readonly retried = output<Voucher>();

  protected readonly inr = inrText;
  protected readonly busy = signal(false);
  /** The voucher as it is after a retry from here. */
  private readonly after = signal<Voucher | null>(null);
  protected readonly v = computed(() => {
    const a = this.after();
    return a && a.id === this.voucher().id ? a : this.voucher();
  });
  protected readonly st = computed(() => VOUCHER_STATUS[this.v().status]);
  protected readonly attempts = computed(() => {
    const n = this.v().attempts;
    return `${n} attempt${n === 1 ? '' : 's'}`;
  });
  protected readonly nextTry = computed(() => {
    const at = this.v().nextAttemptAt;
    return at
      ? `Tried again automatically ${formatDate(at)}, ${formatTime(at)}; retry now to force.`
      : 'No automatic tries are left; retry it now.';
  });
  /** The voucher as the transfer sends it (company, date, ledgers, narration, reference). */
  protected readonly request = computed(() => {
    const v = this.v();
    const amount = v.amount.amount;
    return JSON.stringify(
      {
        company: v.company,
        date: v.date,
        reference: v.reference,
        narration: v.narration ?? '',
        ledgers: [
          { name: v.debitLedger, dr: amount },
          { name: v.creditLedger, cr: amount },
        ],
      },
      null,
      2,
    );
  });
  protected readonly response = computed(() => {
    const v = this.v();
    if (v.status === 'TRANSFERRED') {
      return JSON.stringify({ status: 'OK', reference: v.externalRef }, null, 2);
    }
    if (v.status === 'FAILED') {
      return JSON.stringify({ status: 'ERROR', message: v.lastError }, null, 2);
    }
    return null;
  });

  protected async retry() {
    const v = this.v();
    if (this.busy() || this.editWhy()) return;
    const ok = await this.overlays.confirm({
      title: `Retry ${v.reference}?`,
      text: "The same reference is sent, so a voucher the package already accepted isn't posted twice.",
      ok: 'Retry posting',
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      const out = await this.api.retry(v.id, newIdempotencyKey());
      this.after.set(out);
      if (out.status === 'TRANSFERRED') {
        this.overlays.toast('Voucher transferred', {
          sub: `${out.reference}${out.externalRef ? ' · ' + out.externalRef : ''}`,
        });
      } else {
        this.overlays.toast(
          translate('ACC.PACKAGE_REFUSED', { reason: out.lastError ?? '' }).replace(/:\s*$/, '.'),
          { tone: 'bad', sub: out.reference },
        );
      }
      this.retried.emit(out);
    } catch (e) {
      this.overlays.toast("Couldn't retry the voucher", {
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
    } finally {
      this.busy.set(false);
    }
  }

  protected date(d: string) {
    return formatDate(d);
  }
  protected when(v: string | null) {
    return v ? `${formatDate(v)}, ${formatTime(v)}` : '—';
  }
}
