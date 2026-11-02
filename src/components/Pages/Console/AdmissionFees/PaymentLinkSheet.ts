import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDateTime } from '../../../Utils/format';
import type { Money } from '../Applications/applications.api';
import { inr, plural } from '../Fees/fee-format';
import { copyText } from '../../../Utils/clipboard';

/** A payment link as sent (ADM-023: the admission fee; FEE-048: an instalment). */
export interface SentLink {
  readonly url: string;
  readonly amount: Money;
  readonly expiresAt: string;
  /** Where it went (masked): the mobiles texted, the addresses e-mailed, the app accounts told. */
  readonly sms: readonly string[];
  readonly email: readonly string[];
  readonly inApp: number;
}

/**
 * A fee's payment link (prototype cm.adm.online; ADM-023, FEE-048): the amount, the link, how long it
 * works (1 day, client 2026-10-22) and where it was sent — by SMS and e-mail to the student and
 * parents, and in the app to those with a CampusOne account. The family pays on the gateway page
 * without signing in. The admission fees page and Collect fee show the same sheet (client
 * 2026-10-22).
 */
@Component({
  selector: 'rp-payment-link',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      title="Payment link sent"
      [sub]="sub()"
      icon="globe"
      cls="cm-m"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="pl-body">
        <div class="c-grid k2">
          <div class="cm-tile">
            <span>{{ fee() }}</span
            ><b class="t-num">{{ amount() }}</b>
          </div>
          <div class="cm-tile">
            <span>Link works until</span><b class="t-num">{{ until() }}</b>
          </div>
        </div>
        <div class="cp-link">
          <span class="t-mono t-clip" id="pl-url">{{ link().url }}</span
          ><button type="button" class="iconbtn" aria-label="Copy link" (click)="copy()">
            <rp-icon name="copy" [size]="16" />
          </button>
        </div>
        <dl class="kv" id="pl-sent">
          <dt>SMS</dt>
          <dd>{{ sms() || '—' }}</dd>
          <dt>E-mail</dt>
          <dd>{{ email() || '—' }}</dd>
          <dt>In the app</dt>
          <dd>{{ inApp() }}</dd>
        </dl>
        @if (nowhere()) {
          <div class="note tone-warn" id="pl-nowhere">
            <rp-icon name="alert" [size]="17" />
            <div class="grow">
              The link wasn't sent: the school's SMS and e-mail are off, or the family has no
              contact on {{ contactOn() }}. Copy it and share it with the family.
            </div>
          </div>
        } @else {
          <div class="note tone-info">
            <rp-icon name="info" [size]="17" />
            <div class="grow">
              The family pays on the gateway page; the fee is marked paid and the receipt issued
              when the gateway confirms it.
            </div>
          </div>
        }
      </div>
      <div modal-foot class="row g8">
        <button type="button" class="btn btn-sec" (click)="closed.emit()">
          <span>Close</span>
        </button>
        <button type="button" class="btn btn-pri" id="pl-copy" (click)="copy()">
          <rp-icon name="copy" [size]="17" /><span>Copy link</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class PaymentLinkSheet {
  private readonly overlays = inject(Overlays);

  readonly link = input.required<SentLink>();
  /** The fee's tile: "Admission fee", or the instalment ("Term 1"). */
  readonly fee = input.required<string>();
  /** Under the title: the student and their numbers. */
  readonly sub = input('');
  /** Where the family's contacts are kept, when the link went nowhere. */
  readonly contactOn = input('the application');
  readonly closed = output<void>();

  protected readonly sms = computed(() => this.link().sms.join(', '));
  protected readonly email = computed(() => this.link().email.join(', '));
  protected readonly inApp = computed(() => {
    const n = this.link().inApp;
    return n ? plural(n, 'person', 'people') : 'No one has the app yet';
  });
  protected readonly nowhere = computed(() => !this.sms() && !this.email() && !this.link().inApp);

  protected amount() {
    return inr(this.link().amount);
  }
  protected until() {
    return formatDateTime(this.link().expiresAt);
  }
  protected async copy() {
    try {
      await copyText(this.link().url);
      this.overlays.toast('Link copied', { sub: 'Paste it into an SMS or e-mail to the family.' });
    } catch {
      this.overlays.toast("Couldn't copy the link", {
        tone: 'bad',
        sub: 'Select the link and copy it.',
      });
    }
  }
}
