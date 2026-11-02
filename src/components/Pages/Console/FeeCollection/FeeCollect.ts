import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Amount } from '../../../Shared/Amount';
import { Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { copyText } from '../../../Utils/clipboard';
import { formatDate, formatDateTime } from '../../../Utils/format';
import { newIdempotencyKey } from '../../../Utils/ids';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { CashCollection, type CashTarget } from '../AdmissionFees/CashCollection';
import { PaymentLinkSheet, type SentLink } from '../AdmissionFees/PaymentLinkSheet';
import { CollectChoices, type CollectWay } from '../Fees/CollectChoices';
import { deskCheckout } from '../Fees/desk-checkout';
import { inr, paiseOf, plural } from '../Fees/fee-format';
import { RECORD_STATUS } from '../FeeRecords/record-format';
import { InstalmentReceipt, PAY_MODE } from './InstalmentReceipt';
import {
  FeeCollectionApi,
  type CashCollected,
  type CollectInstalment,
  type CollectStudent,
  type FeeReceipt,
  type InstalmentCollection,
  type OnlineCollected,
  type PaymentRequest,
} from './fee-collection.api';

/**
 * Collect Fee (FEE-046…048, FEE-052…054; client 2026-10-19, 2026-10-22): a student's virtual account
 * number (VAN) and the year's instalments; one open instalment is picked and its outstanding amount
 * collected the ways the admission fees page offers too, with the same dialogs — Pay now (the
 * gateway's checkout at the desk, no link), Send link (a payment link that works for 1 day, sent to
 * the student and parents by SMS, e-mail and in the app; it opens the school's payment page; the
 * "Payment link sent" sheet shows where it went) or Record cash (the "Record cash collection"
 * dialog: the counterfoil's receipt number, the day and who paid). Collected, the receipt opens.
 * What was collected earlier is not a dead row: a paid instalment, or the Receipt action of any
 * instalment with a collection (a partly paid one stays pickable for the rest), opens its receipt
 * with the PDF (FEE-056, FEE-054) — or, paid in parts, the list of its receipts to open one. Every
 * student opens it (client 2026-10-22): with nothing to collect — all paid, financed or no fees —
 * the instalments and their receipts show with a "Nothing to collect" note instead of the choices.
 */
@Component({
  selector: 'rp-fee-collect',
  imports: [
    Amount,
    CashCollection,
    CollectChoices,
    Empty,
    Icon,
    InstalmentReceipt,
    Modal,
    PaymentLinkSheet,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="'Collect fee · ' + studentName()"
      [sub]="data() ? sub(data()!) : ''"
      icon="rupee"
      [wide]="true"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      @if (error()) {
        <rp-empty icon="alertc" title="Couldn't load the student's fees" [text]="error()">
          <button type="button" class="btn btn-sec btn-sm" (click)="load()">
            <span>Try again</span>
          </button>
        </rp-empty>
      } @else if (!data()) {
        <rp-empty icon="hourglass" title="Loading…" />
      } @else {
        @let d = data()!;
        <div class="note tone-info" id="fcl-van">
          <rp-icon name="bank" [size]="17" />
          <div class="grow">
            @if (d.van) {
              <!-- Spaced on purpose: whitespace between elements is dropped (client 2026-10-22). -->
              <b>VAN</b>&ngsp;<span class="t-mono">{{ d.van.number }}</span>
              @if (!d.van.active) {
                &ngsp;<span class="chip tone-warn">Inactive</span>
              }
            } @else {
              No virtual account number for this student.
            }
          </div>
          @if (d.van) {
            <button type="button" class="btn btn-ghost btn-sm" (click)="copy(d.van.number)">
              <rp-icon name="copy" [size]="15" /><span>Copy</span>
            </button>
          }
        </div>

        <div class="tbl-wrap mt12">
          <table class="tbl cc-nowrap" id="fcl-inst">
            <thead>
              <tr>
                @if (anyOpen()) {
                  <th></th>
                }
                <th>Instalment</th>
                <th>Due</th>
                <th class="r">Amount</th>
                <th class="r">Late fine</th>
                <th class="r">Paid</th>
                <th class="r">Outstanding</th>
                <th>Status</th>
                <th><span class="sr">Receipts</span></th>
              </tr>
            </thead>
            <tbody>
              @for (x of d.instalments; track x.recordId) {
                <!-- A paid instalment opens its receipt; the Receipt action does it from the keyboard. -->
                <tr
                  [class.t-faint]="!x.collectable && !x.collections.length"
                  [attr.data-act]="paidRow(x) ? '' : null"
                  (click)="paidRow(x) && receipts(x)"
                >
                  <!-- Nothing to collect: no column to pick from (client 2026-10-22). -->
                  @if (anyOpen()) {
                    <td>
                      <input
                        type="radio"
                        name="fcl-pick"
                        [attr.aria-label]="'Collect ' + x.label"
                        [disabled]="!x.collectable || busy()"
                        [checked]="picked() === x.recordId"
                        (change)="pick(x)"
                      />
                    </td>
                  }
                  <td>{{ x.label }}</td>
                  <td>{{ date(x.dueDate) }}</td>
                  <td class="r"><rp-amt [value]="x.amount" /></td>
                  <td class="r"><rp-amt [value]="x.fine" /></td>
                  <td class="r"><rp-amt [value]="x.paid" /></td>
                  <td class="r"><rp-amt [value]="x.outstanding" cls="t-b" /></td>
                  <td>
                    <span [class]="'chip dot tone-' + statusOf(x).tone">{{ statusOf(x).l }}</span>
                  </td>
                  <td class="r">
                    @if (x.collections.length) {
                      <button
                        type="button"
                        class="btn btn-ghost btn-sm fcl-rcpt"
                        [attr.aria-label]="
                          (x.collections.length > 1 ? 'Receipts of ' : 'Receipt of ') + x.label
                        "
                        [attr.aria-expanded]="
                          x.collections.length > 1 ? listFor() === x.recordId : null
                        "
                        (click)="$event.stopPropagation(); receipts(x)"
                      >
                        <rp-icon name="receipt" [size]="15" /><span>{{
                          x.collections.length > 1
                            ? plural(x.collections.length, 'receipt')
                            : 'Receipt'
                        }}</span>
                      </button>
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="8">
                    <rp-empty icon="receipt" [title]="'No instalments in ' + d.year.label" />
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (listed(); as x) {
          <!-- Paid in parts: each collection's receipt (FEE-046, FEE-056). -->
          <div class="card pad mt12 stack g8" id="fcl-rcpts">
            <div class="row between g8">
              <span
                >Receipts · <b>{{ x.label }}</b></span
              >
              <button
                type="button"
                class="x-btn"
                aria-label="Close the receipts"
                (click)="listFor.set('')"
              >
                <rp-icon name="x" [size]="16" />
              </button>
            </div>
            <div class="tbl-wrap">
              <table class="tbl cc-nowrap">
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Paid</th>
                    <th>Mode</th>
                    <th class="r">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  @for (c of x.collections; track c.collectionId) {
                    <tr
                      tabindex="0"
                      data-act
                      (click)="receiptId.set(c.collectionId)"
                      (keydown.enter)="receiptId.set(c.collectionId)"
                    >
                      <td>
                        <span class="t-mono">{{ c.receiptNo }}</span>
                      </td>
                      <td>{{ dateTime(c.paidAt) }}</td>
                      <td>
                        <span class="tag"
                          ><rp-icon [name]="modeOf(c).icon" [size]="12" />{{ modeOf(c).l }}</span
                        >
                      </td>
                      <td class="r"><rp-amt [value]="c.total" /></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }

        @if (selected(); as x) {
          <div class="card pad mt12 stack g12" id="fcl-pay">
            <span
              >Collect <b>{{ x.label }}</b> ·
              <rp-amt [value]="x.outstanding" cls="t-b" />
            </span>
            <rp-collect-choices
              [value]="method()"
              [disabled]="busy()"
              (chosen)="choose($event, x)"
            />

            @switch (method()) {
              @case ('PAY_NOW') {
                @if (payDone(); as p) {
                  <div class="note tone-ok" id="fcl-pay-done">
                    <rp-icon name="checkc" [size]="17" />
                    <div class="grow">
                      <b>{{ inr(p.amount) }} paid online.</b> Receipt
                      <span class="t-mono">{{ p.receiptNo }}</span> · transaction
                      <span class="t-mono">{{ p.transactionId }}</span>
                    </div>
                    <button
                      type="button"
                      class="btn btn-ghost btn-sm"
                      id="fcl-pay-receipt"
                      (click)="receipt.set(p.receipt)"
                    >
                      <rp-icon name="receipt" [size]="15" /><span>Receipt</span>
                    </button>
                  </div>
                } @else {
                  <div class="row between wrap g8">
                    <span class="t-sm t-muted"
                      >The family pays on this screen through the school's payment gateway — card,
                      UPI or net banking. No link is sent.</span
                    >
                    <button
                      type="button"
                      class="btn btn-pri"
                      id="fcl-pay-now"
                      [class.is-busy]="busy()"
                      [disabled]="busy()"
                      (click)="payNow(x)"
                    >
                      <rp-icon name="card" [size]="17" /><span
                        >Pay {{ inr(x.outstanding) }} now</span
                      >
                    </button>
                  </div>
                }
              }
              @case ('CASH') {
                @if (cashDone(); as c) {
                  <div class="note tone-ok" id="fcl-cash-done">
                    <rp-icon name="checkc" [size]="17" />
                    <div class="grow">
                      <b>{{ inr(c.amount) }} received in cash.</b> Receipt
                      <span class="t-mono">{{ c.receiptNo }}</span>
                    </div>
                    <button
                      type="button"
                      class="btn btn-ghost btn-sm"
                      id="fcl-cash-receipt"
                      (click)="receipt.set(c.receipt)"
                    >
                      <rp-icon name="receipt" [size]="15" /><span>Receipt</span>
                    </button>
                  </div>
                } @else {
                  <div class="row between wrap g8">
                    <span class="t-sm t-muted"
                      >Cash received at the desk: the receipt number from the counterfoil book, the
                      day it was received and who paid. A receipt is issued.</span
                    >
                    <button
                      type="button"
                      class="btn btn-pri"
                      id="fcl-cash"
                      [disabled]="busy()"
                      (click)="cashFor.set(cashTarget(x))"
                    >
                      <rp-icon name="rupee" [size]="17" /><span
                        >Record cash {{ inr(x.outstanding) }}</span
                      >
                    </button>
                  </div>
                }
              }
              @case ('LINK') {
                @if (link(); as l) {
                  <div class="note tone-ok" id="fcl-link-done">
                    <rp-icon name="send" [size]="17" />
                    <div class="grow">
                      <b>Payment link sent</b>
                      {{ sentText(l) }} · valid until {{ dateTime(l.expiresAt) }}.
                    </div>
                    <div class="row g4 wrap">
                      <button
                        type="button"
                        class="btn btn-ghost btn-sm"
                        id="fcl-link-show"
                        (click)="showLink(l, x)"
                      >
                        <rp-icon name="globe" [size]="15" /><span>Show link</span>
                      </button>
                      <button
                        type="button"
                        class="btn btn-ghost btn-sm"
                        id="fcl-check"
                        [disabled]="busy()"
                        (click)="check()"
                      >
                        <rp-icon name="refresh" [size]="15" /><span>Check payment</span>
                      </button>
                    </div>
                  </div>
                } @else if (!d.sendTo.mobile && !d.sendTo.email) {
                  <div class="note tone-warn">
                    <rp-icon name="alert" [size]="17" />
                    <div class="grow">
                      Neither the student nor a parent has a registered mobile number or e-mail
                      address. Add one on the student's profile, or use Pay now or Record cash.
                    </div>
                  </div>
                } @else {
                  <div class="row between wrap g8">
                    <span class="t-sm" id="fcl-send-to"
                      >Sends a link that works for 1 day to the student and parents by SMS, e-mail
                      and in the app ({{ both(d.sendTo.mobile, d.sendTo.email) }} and the parents on
                      record).</span
                    >
                    <button
                      type="button"
                      class="btn btn-pri"
                      id="fcl-link-send"
                      [disabled]="busy()"
                      (click)="request(x)"
                    >
                      <rp-icon name="send" [size]="17" /><span>Send payment link</span>
                    </button>
                  </div>
                }
              }
              @default {
                <p class="t-sm t-muted" id="fcl-how">Choose how to collect.</p>
              }
            }
          </div>
        } @else if (anyOpen()) {
          <p class="t-sm t-muted mt12" id="fcl-hint">Pick an instalment to collect.</p>
        } @else {
          <!-- A paid student, or one with no fees, opens here too: what there is, to see. -->
          <div class="note tone-info mt12" id="fcl-none">
            <rp-icon name="info" [size]="17" />
            <div class="grow"><b>Nothing to collect.</b> {{ noneText(d) }}</div>
          </div>
        }
      }
      <div modal-foot class="row g8">
        <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="closed.emit()">
          <span>Close</span>
        </button>
      </div>
    </rp-modal>

    @if (cashFor(); as t) {
      <rp-cash-collection
        [target]="t"
        (closed)="cashFor.set(null)"
        (recorded)="cashRecorded($event)"
      />
    }
    @if (sheet(); as s) {
      <rp-payment-link
        [link]="s.link"
        [fee]="s.fee"
        [sub]="s.sub"
        contactOn="the student's profile"
        (closed)="sheet.set(null)"
      />
    }
    @if (receipt(); as r) {
      <rp-instalment-receipt [receipt]="r" (closed)="receipt.set(null)" />
    } @else if (receiptId()) {
      <rp-instalment-receipt [collectionId]="receiptId()" (closed)="receiptId.set('')" />
    }
  `,
})
export class FeeCollect {
  private readonly api = inject(FeeCollectionApi);
  private readonly overlays = inject(Overlays);

  readonly studentId = input.required<string>();
  readonly studentName = input.required<string>();
  readonly yearId = input('');
  readonly closed = output<void>();
  /** Something was collected (or found paid): the page's figures change. */
  readonly changed = output<void>();

  protected readonly inr = inr;
  protected readonly plural = plural;
  protected readonly data = signal<CollectStudent | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly picked = signal('');
  /** How the instalment is collected; none until chosen (client 2026-10-22). */
  protected readonly method = signal<CollectWay | null>(null);
  protected readonly cashDone = signal<CashCollected | null>(null);
  protected readonly payDone = signal<OnlineCollected | null>(null);
  protected readonly link = signal<PaymentRequest | null>(null);
  /** Record cash collection, open for the instalment (the admission fees page's dialog). */
  protected readonly cashFor = signal<CashTarget<CashCollected> | null>(null);
  /** The "Payment link sent" sheet, open (the admission fees page's sheet). */
  protected readonly sheet = signal<{ link: SentLink; fee: string; sub: string } | null>(null);
  /** The receipt of what was just collected, open. */
  protected readonly receipt = signal<FeeReceipt | null>(null);
  /** An earlier collection's receipt, open (FEE-056). */
  protected readonly receiptId = signal('');
  /** The instalment paid in parts whose receipts are listed. */
  protected readonly listFor = signal('');
  /** One key per action shown, so a retry after a lost answer is not a second collection. */
  private key = newIdempotencyKey();

  protected readonly selected = computed(
    () => this.data()?.instalments.find((x) => x.recordId === this.picked()) ?? null,
  );
  protected readonly anyOpen = computed(
    () => !!this.data()?.instalments.some((x) => x.collectable),
  );
  protected readonly listed = computed(
    () =>
      this.data()?.instalments.find(
        (x) => x.recordId === this.listFor() && x.collections.length > 1,
      ) ?? null,
  );

  constructor() {
    queueMicrotask(() => void this.load());
  }

  protected async load() {
    this.error.set('');
    try {
      const d = await this.api.collectView(this.studentId(), this.yearId());
      this.data.set(d);
      // The first instalment that can be collected is picked.
      const keep = d.instalments.find((x) => x.recordId === this.picked() && x.collectable);
      if (!keep) {
        const first = d.instalments.find((x) => x.collectable);
        this.picked.set(first?.recordId ?? '');
      }
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  protected pick(x: CollectInstalment) {
    if (x.recordId === this.picked()) return;
    this.picked.set(x.recordId);
    this.reset();
  }

  /** Nothing left to pick, but something collected: the row opens its receipt. */
  protected paidRow(x: CollectInstalment) {
    return !x.collectable && x.collections.length > 0;
  }

  /** A collected instalment's receipt: the one there is, or the list of them (paid in parts). */
  protected receipts(x: CollectInstalment) {
    const [only, ...more] = x.collections;
    if (!only) return;
    if (more.length) this.listFor.set(this.listFor() === x.recordId ? '' : x.recordId);
    else this.receiptId.set(only.collectionId);
  }

  /** Record cash opens its dialog at once (client 2026-10-22); the others have their button. */
  protected choose(m: CollectWay, x: CollectInstalment) {
    this.method.set(m);
    if (m === 'CASH' && !this.cashDone()) this.cashFor.set(this.cashTarget(x));
  }

  /** A new instalment or a finished collection: the method's results start again. */
  private reset() {
    this.cashDone.set(null);
    this.payDone.set(null);
    this.link.set(null);
    this.key = newIdempotencyKey();
  }

  /** "Asha Rao · admission number TVPS/1 · Grade 6 A", under the dialogs' titles. */
  private who() {
    const s = this.data()?.student;
    if (!s) return this.studentName();
    return [s.name, s.admissionNo ? `admission number ${s.admissionNo}` : '', s.classSection ?? '']
      .filter(Boolean)
      .join(' · ');
  }

  /**
   * Pay now (FEE-052/053): the gateway's checkout at the desk for what is outstanding, no link;
   * paid once the server has verified the gateway's answer.
   */
  protected async payNow(x: CollectInstalment) {
    this.busy.set(true);
    try {
      const o = await this.api.order(x.recordId, newIdempotencyKey());
      const answer = await deskCheckout(this.overlays, o, `${x.label} · ${this.studentName()}`);
      if (!answer) {
        this.overlays.toast('Payment not completed', {
          tone: 'info',
          sub: 'The payment window was closed before paying.',
        });
        return;
      }
      const p = await this.api.verify(x.recordId, o.requestId, answer, newIdempotencyKey());
      this.payDone.set(p);
      this.receipt.set(p.receipt);
      this.overlays.toast('Paid online', { sub: `Receipt ${p.receiptNo}` });
      this.changed.emit();
      await this.reload(x.recordId);
    } catch (e) {
      this.refused(e);
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Record cash (FEE-047) through the admission fees page's dialog: the same fields and checks — the
   * counterfoil's receipt number (optional), the day received and who paid.
   */
  protected cashTarget(x: CollectInstalment): CashTarget<CashCollected> {
    return {
      fee: x.label,
      sub: this.who(),
      student: this.studentName(),
      amount: x.outstanding,
      payer: '',
      record: (entry, key) => this.api.cash(x.recordId, entry, key),
    };
  }

  /** Cash recorded: the receipt opens, and the instalments and the page's figures change. */
  protected async cashRecorded(c: CashCollected) {
    this.cashFor.set(null);
    this.cashDone.set(c);
    this.receipt.set(c.receipt);
    this.changed.emit();
    this.busy.set(true);
    try {
      await this.reload(c.recordId);
    } catch (e) {
      this.refused(e);
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Send link (FEE-048): to the student and parents by SMS, e-mail and in the app; the "Payment link
   * sent" sheet shows it and where it went.
   */
  protected async request(x: CollectInstalment) {
    this.busy.set(true);
    try {
      const r = await this.api.paymentRequest(x.recordId, 'LINK', this.key);
      this.link.set(r);
      this.showLink(r, x);
      // The next request is a new one.
      this.key = newIdempotencyKey();
    } catch (e) {
      this.refused(e);
    } finally {
      this.busy.set(false);
    }
  }

  /** The family may have paid from the link: the instalments again. */
  protected async check() {
    this.busy.set(true);
    try {
      const was = this.selected();
      await this.reload(this.picked());
      const now = this.data()?.instalments.find((x) => x.recordId === was?.recordId);
      if (was && now && !now.collectable) {
        this.overlays.toast(`${now.label} is paid`, { sub: inr(now.paid) });
        this.changed.emit();
      } else {
        this.overlays.toast('Not paid yet', { tone: 'info' });
      }
    } finally {
      this.busy.set(false);
    }
  }

  /** The instalments again; the picked one stays picked while the result is shown. */
  private async reload(recordId: string) {
    const d = await this.api.collectView(this.studentId(), this.yearId());
    this.data.set(d);
    this.picked.set(recordId);
  }

  private refused(e: unknown) {
    this.overlays.toast(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'), {
      tone: 'bad',
    });
    void this.load();
  }

  /** The "Payment link sent" sheet for the link (again, from "Show link"). */
  protected showLink(r: PaymentRequest, x: CollectInstalment) {
    this.sheet.set({
      link: {
        url: r.link,
        amount: r.amount,
        expiresAt: r.expiresAt,
        sms: r.sentTo?.mobiles ?? [],
        email: r.sentTo?.emails ?? [],
        inApp: r.sentTo?.inApp ?? 0,
      },
      fee: x.label,
      sub: this.who(),
    });
  }

  protected copy(text: string) {
    void copyText(text).then(() => this.overlays.toast('Copied'));
  }

  /** "••••••4321 and r•••@example.in", or the one there is. */
  protected both(mobile: string | null | undefined, email: string | null | undefined) {
    return [mobile, email].filter(Boolean).join(' and ');
  }

  /** "by SMS to ••••••4321 · by e-mail to r•••@example.in · in the app to 2 people". */
  protected sentText(r: PaymentRequest) {
    const s = r.sentTo;
    const to = [
      s?.mobiles.length ? `by SMS to ${s.mobiles.join(', ')}` : '',
      s?.emails.length ? `by e-mail to ${s.emails.join(', ')}` : '',
      s?.inApp ? `in the app to ${plural(s.inApp, 'person', 'people')}` : '',
    ].filter(Boolean);
    return to.length
      ? to.join(' · ')
      : 'to no one — the school’s SMS and e-mail are off and no one has the app';
  }

  protected modeOf(c: InstalmentCollection) {
    return PAY_MODE[c.mode];
  }

  protected statusOf(x: CollectInstalment) {
    if (x.financed) return { l: 'Financed', tone: 'violet' };
    const s = RECORD_STATUS[x.status];
    return { l: s.l(), tone: s.tone };
  }

  /**
   * Why nothing can be collected: no instalments this year, what is open is the financing
   * partner's, or everything is paid (a paid instalment opens its receipt).
   */
  protected noneText(d: CollectStudent) {
    if (!d.instalments.length) return `${d.student.name} has no fees in ${d.year.label}.`;
    if (d.instalments.some((x) => x.financed && paiseOf(x.outstanding) > 0)) {
      return 'What is still open is paid by the financing partner.';
    }
    const receipts = d.instalments.some((x) => x.collections.length);
    return `Every instalment of ${d.year.label} is paid${receipts ? ' — a paid instalment opens its receipt.' : '.'}`;
  }

  protected sub(d: CollectStudent) {
    return `${d.student.classSection ?? 'Not enrolled'} · ${d.student.admissionNo ?? '—'} · ${d.year.label}`;
  }
  protected date(d: string) {
    return formatDate(d);
  }
  protected dateTime(d: string) {
    return formatDateTime(d);
  }
}
