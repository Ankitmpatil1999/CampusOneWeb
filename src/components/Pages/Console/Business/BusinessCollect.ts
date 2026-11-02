/**
 * Collect a payment on the web (client 2026-10-13; the merchant app's collect screen, PAY-009…012):
 * the merchant asks for an amount, and the payer either scans the dynamic QR code with the CampusOne app
 * or taps a campus card on the reader (CampusOne Card Reader on this computer). The request's status is
 * checked every two seconds until it is paid, fails, expires or is cancelled.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Amount, inrText } from '../../../Shared/Amount';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import {
  type CardWatch,
  cardReader,
  ensureCardReader,
  readCardToken,
  readerProblem,
  watchCards,
} from '../../../Utils/card-reader';
import { MoneyError, parseAmount, toMoneyDto } from '../../../Utils/money';
import { translate } from '../../../Utils/translate';
import { amountText, cleanTyped } from '../../../Utils/typing';
import { problemText } from '../Structure/academic-format';
import {
  BusinessApi,
  type MerchantHome,
  type RequestCreated,
  type RequestKind,
  type RequestState,
} from './business.api';

type Stage = 'form' | 'waiting' | 'done' | 'ended';

/** The most a single request asks for on the web (the server applies the school's own limits). */
const MAX_PAISE = 10_00_000_00;
const POLL_MS = 2000;

@Component({
  selector: 'rp-business-collect',
  imports: [Amount, Empty, Icon, PageHead, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="c-page">
    <rp-page-head
      title="Collect payment"
      sub="Ask for an amount: the payer scans the QR code with the CampusOne app, or taps a campus card on your reader."
    />

    @if (loadError()) {
      <div class="note tone-bad" role="alert" id="bc-load-error">
        <rp-icon name="alert" [size]="17" />
        <div class="grow">{{ loadError() }}</div>
        <button type="button" class="btn btn-sec btn-sm" (click)="loadHome()">Try again</button>
      </div>
    } @else if (!home()) {
      <div class="card pad"><div class="sk" style="height: 260px; border-radius: 16px"></div></div>
    } @else if (!ways().length) {
      <rp-empty
        icon="qr"
        title="Collecting an amount isn't switched on"
        text="Ask the school office to switch on dynamic QR or campus card payments for you. Payers can still pay with your static QR code."
      >
        <a class="btn btn-sec btn-sm" routerLink="/console/business-qr"><span>My QR codes</span></a>
      </rp-empty>
    } @else if (home()!.merchant.status !== 'ACTIVE') {
      <rp-empty
        icon="lock"
        title="Payments to you are paused"
        [text]="home()!.merchant.statusReason || 'Ask the school office.'"
      />
    } @else {
      <div class="c-grid k2">
        <div class="card pad stack g16" id="bc-form">
          <div class="fld" [class.invalid]="!!amountError()">
            <label class="fld-l" for="bc-amount">Amount (₹)<span class="req">*</span></label>
            <div class="fld-in">
              <span class="t-muted">₹</span>
              <input
                id="bc-amount"
                inputmode="decimal"
                autocomplete="off"
                placeholder="0.00"
                maxlength="12"
                [disabled]="stage() === 'waiting'"
                [value]="amount()"
                (input)="setAmount($event)"
                (keydown.enter)="create()"
              />
            </div>
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ amountError() }}</span>
            </div>
          </div>
          <div class="fld">
            <span class="fld-l">How the payer pays</span>
            <div class="pills" role="group" aria-label="How the payer pays">
              @for (w of ways(); track w.v) {
                <button
                  type="button"
                  class="pill"
                  [id]="'bc-way-' + w.v.toLowerCase()"
                  [class.on]="kind() === w.v"
                  [attr.aria-pressed]="kind() === w.v"
                  [disabled]="stage() === 'waiting'"
                  (click)="kind.set(w.v)"
                >
                  <rp-icon [name]="w.icon" [size]="15" /> {{ w.l }}
                </button>
              }
            </div>
          </div>
          @if (kind() === 'NFC') {
            <div class="note" [class]="reader() ? 'note tone-ok' : 'note tone-warn'" id="bc-reader">
              <rp-icon name="nfc" [size]="17" />
              <div class="grow">
                {{
                  reader()
                    ? 'CampusOne Card Reader is ready on this computer.'
                    : 'CampusOne Card Reader isn’t running on this computer. It starts when you create the request.'
                }}
              </div>
            </div>
          }
          @if (error()) {
            <div class="note tone-bad" role="alert" id="bc-error">
              <rp-icon name="alertc" [size]="17" />
              <div class="grow">{{ error() }}</div>
            </div>
          }
          <div class="row g8" style="justify-content: flex-end">
            <button
              type="button"
              class="btn btn-pri"
              id="bc-create"
              [class.is-busy]="busy()"
              [disabled]="busy() || stage() === 'waiting'"
              (click)="create()"
            >
              <rp-icon [name]="kind() === 'NFC' ? 'nfc' : 'qr'" [size]="17" /><span>{{
                kind() === 'NFC' ? 'Ask for a card tap' : 'Show QR code'
              }}</span>
            </button>
          </div>
        </div>

        <div
          class="card pad stack g12"
          id="bc-request"
          style="align-items: center; text-align: center"
        >
          @switch (stage()) {
            @case ('form') {
              <rp-empty
                [icon]="kind() === 'NFC' ? 'nfc' : 'qr'"
                title="Nothing to pay yet"
                text="Enter the amount and create the request: the QR code or the card prompt shows here."
              />
            }
            @case ('waiting') {
              @if (req(); as r) {
                <rp-amt [value]="r.amount" cls="big" />
                @if (r.kind === 'DYNAMIC_QR') {
                  <div class="qr" id="bc-qr" [innerHTML]="qr()"></div>
                  <b>Scan with the CampusOne app to pay</b>
                } @else {
                  <span class="li-ic" style="width: 72px; height: 72px"
                    ><rp-icon name="nfc" [size]="40"
                  /></span>
                  <b>Tap the campus card on the reader</b>
                  @if (readerNote()) {
                    <div class="note tone-warn" id="bc-reader-note">
                      <rp-icon name="alert" [size]="17" />
                      <div class="grow">{{ readerNote() }}</div>
                    </div>
                  }
                  <button
                    type="button"
                    class="btn btn-sec btn-sm"
                    id="bc-read"
                    [disabled]="busy()"
                    (click)="readNow()"
                  >
                    <rp-icon name="card" [size]="15" /><span>Read the card now</span>
                  </button>
                }
                <span class="chip dot tone-warn" id="bc-status">Waiting for payment</span>
                <span class="t-sm t-muted t-num">Expires in {{ countdown() }}</span>
                <button
                  type="button"
                  class="btn btn-ghost btn-sm"
                  id="bc-cancel"
                  [disabled]="busy()"
                  (click)="cancel()"
                >
                  <rp-icon name="x" [size]="15" /><span>Cancel request</span>
                </button>
              }
            }
            @case ('done') {
              <span
                class="li-ic"
                style="width: 64px; height: 64px; background: var(--ok-soft); color: var(--ok)"
                ><rp-icon name="check" [size]="34"
              /></span>
              @if (state(); as s) {
                <h3 class="t-h3" id="bc-done">{{ inr(s.amount) }} received</h3>
                @if (s.payer) {
                  <div>from {{ s.payer }}</div>
                }
                @if (s.receipt) {
                  <div class="t-sm t-muted">
                    Reference <span class="t-mono">{{ s.receipt.reference }}</span>
                  </div>
                }
              }
              <button type="button" class="btn btn-pri" id="bc-again" (click)="again()">
                <rp-icon name="plus" [size]="17" /><span>New payment</span>
              </button>
            }
            @case ('ended') {
              <span class="li-ic" style="width: 64px; height: 64px"
                ><rp-icon name="xc" [size]="34"
              /></span>
              <h3 class="t-h3" id="bc-ended">{{ endedTitle() }}</h3>
              <div class="t-sm t-muted">{{ endedText() }}</div>
              <button type="button" class="btn btn-pri" id="bc-again" (click)="again()">
                <rp-icon name="refresh" [size]="17" /><span>Try again</span>
              </button>
            }
          }
        </div>
      </div>
    }
  </div>`,
})
export class BusinessCollect implements OnInit {
  private readonly api = inject(BusinessApi);
  private readonly overlays = inject(Overlays);
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly inr = inrText;
  protected readonly reader = cardReader();

  protected readonly home = signal<MerchantHome | null>(null);
  protected readonly loadError = signal('');
  protected readonly amount = signal('');
  protected readonly amountError = signal('');
  protected readonly kind = signal<RequestKind>('DYNAMIC_QR');
  protected readonly stage = signal<Stage>('form');
  protected readonly req = signal<RequestCreated | null>(null);
  protected readonly state = signal<RequestState | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly readerNote = signal('');
  private readonly now = signal(Date.now());
  private watch: CardWatch | null = null;
  private polling = false;
  private lastPoll = 0;

  protected readonly ways = computed(() => {
    const c = this.home()?.merchant.channels;
    const out: { v: RequestKind; l: string; icon: 'qr' | 'nfc' }[] = [];
    if (c?.dynamicQr) out.push({ v: 'DYNAMIC_QR', l: 'Dynamic QR', icon: 'qr' });
    if (c?.nfc) out.push({ v: 'NFC', l: 'Campus card', icon: 'nfc' });
    return out;
  });
  protected readonly qr = computed<SafeHtml>(() => {
    const svg = this.req()?.svg;
    if (!svg) return '';
    // Our own API draws the code (trusted markup); shown 240 px square.
    return this.sanitizer.bypassSecurityTrustHtml(
      svg.replace(
        /^\s*<svg\b/,
        '<svg width="240" height="240" role="img" aria-label="Payment QR code"',
      ),
    );
  });
  protected readonly countdown = computed(() => {
    const r = this.req();
    if (!r) return '0:00';
    const s = Math.max(0, Math.round((Date.parse(r.expiresAt) - this.now()) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  });
  protected readonly endedTitle = computed(() => {
    switch (this.state()?.status) {
      case 'CANCELLED':
        return 'Request cancelled';
      case 'EXPIRED':
        return 'The request expired';
      default:
        return 'The payment failed';
    }
  });
  protected readonly endedText = computed(() => {
    const s = this.state();
    if (s?.status === 'CANCELLED') return 'Nothing was paid.';
    if (s?.status === 'EXPIRED') return 'No one paid in time. Nothing was paid.';
    return s?.failureCode ? translate(s.failureCode) : 'Nothing was paid.';
  });

  constructor() {
    const tick = setInterval(() => {
      this.now.set(Date.now());
      if (this.stage() === 'waiting' && Date.now() - this.lastPoll >= POLL_MS) void this.poll();
    }, 1000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(tick);
      this.stopWatch();
    });
  }

  ngOnInit() {
    void this.loadHome();
  }

  async loadHome() {
    try {
      const h = await this.api.home();
      this.home.set(h);
      this.loadError.set('');
      if (!h.merchant.channels.dynamicQr && h.merchant.channels.nfc) this.kind.set('NFC');
    } catch (e) {
      this.loadError.set(problemText(e));
    }
  }

  protected setAmount(e: Event) {
    // Numbers only (client 2026-10-14).
    this.amount.set(cleanTyped(e.target as HTMLInputElement, amountText));
    this.amountError.set('');
  }

  private paise(): number | null {
    try {
      return parseAmount(this.amount().replace(/,/g, ''), { maxPaise: MAX_PAISE });
    } catch (e) {
      this.amountError.set(
        e instanceof MoneyError && e.code === 'MONEY_PRECISION'
          ? 'Use at most two digits after the point.'
          : e instanceof MoneyError && e.code === 'MONEY_RANGE' && this.amount()
            ? 'Enter an amount above ₹0 and up to ₹10,00,000.'
            : 'Enter the amount to collect, e.g. 45 or 45.50.',
      );
      return null;
    }
  }

  /** PAY-009: a request for the amount; a card tap needs CampusOne Card Reader running. */
  protected async create() {
    if (this.busy() || this.stage() === 'waiting') return;
    const p = this.paise();
    if (p === null) return;
    this.busy.set(true);
    this.error.set('');
    try {
      if (this.kind() === 'NFC' && !this.reader()) void ensureCardReader();
      const r = await this.api.request(this.kind(), toMoneyDto(p));
      this.req.set(r);
      this.state.set(null);
      this.readerNote.set('');
      this.lastPoll = Date.now();
      this.stage.set('waiting');
      if (r.kind === 'NFC') this.startWatch();
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.busy.set(false);
    }
  }

  /** PAY-010: the request's status, until it is settled one way or the other. */
  private async poll() {
    const r = this.req();
    if (!r || this.polling) return;
    this.polling = true;
    this.lastPoll = Date.now();
    try {
      const s = await this.api.requestState(r.requestId);
      if (this.req()?.requestId !== r.requestId || this.stage() !== 'waiting') return;
      this.settle(s);
    } catch {
      // A missed check is retried on the next tick.
    } finally {
      this.polling = false;
    }
  }

  private settle(s: RequestState) {
    this.state.set(s);
    if (s.status === 'PENDING') return;
    this.stopWatch();
    this.stage.set(s.status === 'SUCCESS' ? 'done' : 'ended');
    if (s.status === 'SUCCESS') {
      this.overlays.toast(`${inrText(s.amount)} received`, {
        sub: [s.payer, s.receipt?.reference].filter(Boolean).join(' · '),
      });
    }
  }

  private startWatch() {
    this.stopWatch();
    this.watch = watchCards((token) => this.tap(token), {
      onProblem: (m) => this.readerNote.set(m),
    });
  }
  private stopWatch() {
    this.watch?.stop();
    this.watch = null;
  }

  protected async readNow() {
    if (!this.reader() && !(await ensureCardReader())) {
      this.readerNote.set(readerProblem(new Error('READER_APP_OFF')));
      return;
    }
    try {
      const token = await readCardToken();
      if (!token) {
        this.readerNote.set('Place the card on the reader and hold it still.');
        return;
      }
      await this.tap(token);
    } catch (e) {
      this.readerNote.set(readerProblem(e));
    }
  }

  /** PAY-012: the card read, with the request's one-time nonce. */
  private async tap(token: string) {
    const r = this.req();
    if (!r?.nonce || this.stage() !== 'waiting' || this.busy()) return;
    this.busy.set(true);
    this.readerNote.set('');
    try {
      await this.api.tap(r.requestId, token, r.nonce);
    } catch (e) {
      this.readerNote.set(problemText(e));
    } finally {
      this.busy.set(false);
    }
    await this.poll();
  }

  /** PAY-011: only while it waits for payment. */
  protected async cancel() {
    const r = this.req();
    if (!r) return;
    this.busy.set(true);
    try {
      this.settle(await this.api.cancelRequest(r.requestId));
    } catch (e) {
      this.overlays.toast(problemText(e), { tone: 'bad' });
      await this.poll();
    } finally {
      this.busy.set(false);
    }
  }

  protected again() {
    this.stopWatch();
    this.req.set(null);
    this.state.set(null);
    this.error.set('');
    this.readerNote.set('');
    this.stage.set('form');
    setTimeout(() => document.getElementById('bc-amount')?.focus(), 0);
  }
}
