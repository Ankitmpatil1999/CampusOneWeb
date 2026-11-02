import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Amount } from '../../../Shared/Amount';
import { Avatar } from '../../../Shared/Avatar';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDateTime, titleCase } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { AdmissionFeesApi, type AdmissionFee } from './admission-fees.api';

/**
 * A paid fee's receipt (prototype cm.rc.open; ADM-024): the institution, the receipt number, the
 * student, the application and admission numbers, the class, the year, when and how it was paid
 * and who paid at the desk, the amount, and the PDF to download.
 */
@Component({
  selector: 'rp-admission-receipt',
  imports: [Amount, Avatar, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      title="Receipt"
      [sub]="kind() + ' · ' + (fee().student ?? fee().applicationNo)"
      icon="receipt"
      [drawer]="true"
      [slim]="true"
      cls="cm-m"
      (closed)="closed.emit()"
    >
      @let f = fee();
      <div class="cm-dr">
        <div class="cm-rcpt" id="rc-body">
          <div class="cm-rcpt-h">
            <rp-av
              [name]="institution().name"
              [text]="initials()"
              [sq]="true"
              [px]="40"
              color="#0C6F7D"
            />
            <div class="grow">
              <b>{{ institution().name }}</b
              ><small>{{ institution().city }}</small>
            </div>
          </div>
          <div class="cm-rcpt-t">
            <span>{{ kind() }} receipt</span><b class="t-mono">{{ f.receiptNo ?? '—' }}</b>
          </div>
          <dl class="kv">
            <dt>Student</dt>
            <dd>{{ f.student ?? '—' }}</dd>
            <dt>Application no.</dt>
            <dd>
              <span class="t-mono">{{ f.applicationNo }}</span>
            </dd>
            @if (f.admissionNo) {
              <dt>Admission no.</dt>
              <dd>
                <span class="t-mono">{{ f.admissionNo }}</span>
              </dd>
            }
            <dt>Class</dt>
            <dd>{{ f.class ?? '—' }}</dd>
            <dt>Academic year</dt>
            <dd>{{ f.year }}</dd>
            <dt>Paid on</dt>
            <dd>{{ f.paidAt ? when(f.paidAt) : '—' }}</dd>
            <dt>Mode</dt>
            <dd>{{ f.mode === 'CASH' ? 'Cash' : 'Online' }}</dd>
            @if (f.transactionId) {
              <!-- The payment gateway's own ID (client 2026-10-16). -->
              <dt>Transaction ID</dt>
              <dd>
                <span class="t-mono" id="rc-txn">{{ f.transactionId }}</span>
              </dd>
            }
            @if (f.paidBy) {
              <dt>Received from</dt>
              <dd>{{ person(f.paidBy) }}</dd>
            }
          </dl>
          <div class="cm-rcpt-amt">
            <span>Amount received</span><rp-amt [value]="f.amount" cls="big" />
          </div>
          <p class="t-xs t-muted">
            Computer-generated receipt.
            {{
              f.mode === 'CASH'
                ? 'Cash received at the accounts desk.'
                : 'Paid online; verified against the gateway’s signature.'
            }}
          </p>
        </div>
      </div>
      <div modal-foot class="row g8">
        <button type="button" class="btn btn-sec" (click)="closed.emit()">
          <span>Close</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="rc-pdf"
          [class.is-busy]="busy()"
          [disabled]="busy() || !f.paymentId"
          (click)="pdf()"
        >
          <rp-icon name="download" [size]="17" /><span>Download PDF</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class AdmissionReceipt {
  private readonly api = inject(AdmissionFeesApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).console;

  readonly fee = input.required<AdmissionFee>();
  readonly closed = output<void>();

  protected readonly busy = signal(false);

  protected kind() {
    return this.fee().feeType === 'APPLICATION' ? 'Application fee' : 'Admission fee';
  }
  protected institution() {
    const i = this.session()?.institution;
    return { name: i?.name ?? 'CampusOne', city: i?.city ?? '' };
  }
  protected initials() {
    const s = this.session()?.institution.shortName ?? '';
    return s ? s.slice(0, 2).toUpperCase() : null;
  }
  protected when(d: string) {
    return formatDateTime(d);
  }
  protected person(n: string) {
    return titleCase(n);
  }

  protected async pdf() {
    const f = this.fee();
    if (!f.paymentId) return;
    this.busy.set(true);
    try {
      await this.api.receipt(f.paymentId, f.receiptNo);
      this.overlays.toast('Receipt downloaded', {
        sub: `${(f.receiptNo ?? f.paymentId).replace(/\//g, '-')}.pdf`,
      });
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
