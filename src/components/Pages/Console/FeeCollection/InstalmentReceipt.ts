import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Amount } from '../../../Shared/Amount';
import { Avatar } from '../../../Shared/Avatar';
import { Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate, formatDateTime, titleCase } from '../../../Utils/format';
import type { IconName } from '../../../Utils/icons';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { FeeCollectionApi, type CollectionMode, type FeeReceipt } from './fee-collection.api';

/** How it was paid, in words and as the receipts list's tag. */
export const PAY_MODE: Readonly<Record<CollectionMode, { l: string; icon: IconName }>> = {
  CASH: { l: 'Cash', icon: 'rupee' },
  ONLINE: { l: 'Online', icon: 'globe' },
  WALLET: { l: 'Wallet', icon: 'wallet' },
};

/**
 * An instalment's receipt, opened once Record cash or Pay now has collected it (FEE-047, FEE-053;
 * client 2026-10-22), or for a collection made earlier — from a paid instalment in Collect fee or a
 * row of the receipts list (FEE-056) — as the admission fee's receipt: the school, the receipt
 * number, when and how it was paid and who paid at the desk (or the gateway's transaction ID), the
 * student with the admission number and class, the year, the instalment and its due date, the fee,
 * the late fine and the total, and the PDF to download (FEE-054).
 */
@Component({
  selector: 'rp-instalment-receipt',
  imports: [Amount, Avatar, Empty, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @let r = shown();
    <rp-modal
      title="Receipt"
      [sub]="r ? r.instalment.label + ' · ' + r.student.name : ''"
      icon="receipt"
      [drawer]="true"
      [slim]="true"
      cls="cm-m"
      (closed)="closed.emit()"
    >
      <div class="cm-dr">
        @if (error()) {
          <rp-empty icon="alertc" title="Couldn't load the receipt" [text]="error()">
            <button type="button" class="btn btn-sec btn-sm" (click)="load(collectionId())">
              <span>Try again</span>
            </button>
          </rp-empty>
        } @else if (!r) {
          <rp-empty icon="hourglass" title="Loading…" />
        } @else {
          <div class="cm-rcpt" id="ir-body">
            <div class="cm-rcpt-h">
              <rp-av
                [name]="r.school.name"
                [text]="initials()"
                [sq]="true"
                [px]="40"
                color="#0C6F7D"
              />
              <div class="grow">
                <b>{{ r.school.name }}</b
                ><small>{{ city() }}</small>
              </div>
            </div>
            <div class="cm-rcpt-t">
              <span>Fee receipt</span><b class="t-mono" id="ir-no">{{ r.receiptNo }}</b>
            </div>
            <dl class="kv" id="ir-kv">
              <dt>Paid on</dt>
              <dd>{{ when(r.paidAt) }}</dd>
              <dt>Mode</dt>
              <dd>{{ mode(r) }}</dd>
              @if (r.paidBy) {
                <dt>Received from</dt>
                <dd>{{ person(r.paidBy) }}</dd>
              }
              @if (r.transactionId) {
                <!-- The payment gateway's own ID (client 2026-10-16). -->
                <dt>Transaction ID</dt>
                <dd>
                  <span class="t-mono" id="ir-txn">{{ r.transactionId }}</span>
                </dd>
              }
              <dt>Student</dt>
              <dd>{{ r.student.name }}</dd>
              <dt>Admission no.</dt>
              <dd>
                <span class="t-mono">{{ r.student.admissionNo ?? '—' }}</span>
              </dd>
              <dt>Class</dt>
              <dd>{{ r.student.classSection ?? '—' }}</dd>
              <dt>Academic year</dt>
              <dd>{{ r.year ?? '—' }}</dd>
              <dt>Instalment</dt>
              <dd>{{ r.instalment.label }}</dd>
              <dt>Due date</dt>
              <dd>{{ date(r.instalment.dueDate) }}</dd>
              <dt>Fee</dt>
              <dd><rp-amt [value]="r.amount" /></dd>
              <dt>Late fine</dt>
              <dd><rp-amt [value]="r.fine" /></dd>
            </dl>
            <div class="cm-rcpt-amt">
              <span>Total received</span><rp-amt [value]="r.total" cls="big" />
            </div>
            <p class="t-xs t-muted">
              Computer-generated receipt.
              {{
                r.mode === 'CASH'
                  ? 'Cash received at the accounts desk.'
                  : r.mode === 'WALLET'
                    ? 'Paid from the campus wallet.'
                    : 'Paid online; verified against the gateway’s signature.'
              }}
            </p>
          </div>
        }
      </div>
      <div modal-foot class="row g8">
        <button type="button" class="btn btn-sec" (click)="closed.emit()">
          <span>Close</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="ir-pdf"
          [class.is-busy]="busy()"
          [disabled]="busy() || !r"
          (click)="pdf()"
        >
          <rp-icon name="download" [size]="17" /><span>Download PDF</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class InstalmentReceipt {
  private readonly api = inject(FeeCollectionApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).console;

  /** The receipt in hand (just collected), or… */
  readonly receipt = input<FeeReceipt | null>(null);
  /** …the collection whose receipt is fetched (FEE-056). */
  readonly collectionId = input('');
  readonly closed = output<void>();

  protected readonly busy = signal(false);
  private readonly loaded = signal<FeeReceipt | null>(null);
  protected readonly error = signal('');
  protected readonly shown = computed(() => this.receipt() ?? this.loaded());

  constructor() {
    effect(() => {
      const id = this.collectionId();
      if (id && !this.receipt()) untracked(() => void this.load(id));
    });
  }

  protected async load(id: string) {
    this.loaded.set(null);
    this.error.set('');
    try {
      const r = await this.api.receipt(id);
      if (id === this.collectionId()) this.loaded.set(r);
    } catch (e) {
      if (id === this.collectionId()) {
        this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
      }
    }
  }

  protected city() {
    return this.session()?.institution.city ?? '';
  }
  protected initials() {
    const s = this.session()?.institution.shortName ?? '';
    return s ? s.slice(0, 2).toUpperCase() : null;
  }
  protected when(d: string) {
    return formatDateTime(d);
  }
  protected date(d: string) {
    return formatDate(d);
  }
  protected person(n: string) {
    return titleCase(n);
  }

  protected mode(r: FeeReceipt) {
    return PAY_MODE[r.mode].l;
  }

  protected async pdf() {
    const r = this.shown();
    if (!r) return;
    this.busy.set(true);
    try {
      await this.api.receiptPdf(r.collectionId, r.receiptNo);
      this.overlays.toast('Receipt downloaded', { sub: `${r.receiptNo.replace(/\//g, '-')}.pdf` });
    } catch (e) {
      this.overlays.toast("Couldn't download the receipt", {
        tone: 'bad',
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
      });
    } finally {
      this.busy.set(false);
    }
  }
}
