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
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { SessionContext } from '../../../../Context/SessionContext';
import { inrText } from '../../../Shared/Amount';
import { Avatar } from '../../../Shared/Avatar';
import { Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate, formatMobile, titleCase } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { ACCEPTS, IFSC_BANKS, QR_KINDS, STATUS, maskedAccount, plural } from './merchant-format';
import { MerchantsApi, type MerchantDetail, type MerchantQr, type QrKind } from './merchants.api';

type QrSlot = (typeof QR_KINDS)[number];
type Channel = 'dynamicQr' | 'nfc';

const CHANNELS: readonly {
  readonly k: Channel;
  readonly l: string;
  /** As it reads inside a sentence. */
  readonly phrase: string;
  readonly sub: string;
  readonly icon: 'qr' | 'nfc';
}[] = [
  {
    k: 'dynamicQr',
    l: 'Dynamic QR codes',
    phrase: 'dynamic QR codes',
    sub: 'The counter shows a code for the exact amount of each sale.',
    icon: 'qr',
  },
  {
    k: 'nfc',
    l: 'NFC card taps',
    phrase: 'NFC card taps',
    sub: "Members tap their campus card on the merchant's reader.",
    icon: 'nfc',
  },
];
const REASON = { label: 'Reason', min: 5, max: 300 } as const;
const NAME_MIN = 3;
const NAME_MAX = 40;

const attr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The merchant drawer (prototype merBody / merFoot; PAY-031): profile, collection channels
 * (PAY-020), masked bank details, the static codes with their printable cards (PAY-021…023,
 * PAY-029), and the footer's rename (PAY-018), e-mail (PAY-024) and status (PAY-019). Settlement
 * lines arrive with settlements (Phase 6).
 */
@Component({
  selector: 'rp-merchant-drawer',
  imports: [Avatar, Empty, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      title="Merchant"
      [sub]="sub()"
      icon="store"
      [drawer]="true"
      cls="cm-m"
      [foot]="!!detail()"
      (closed)="closed.emit()"
    >
      <div class="cm-dr">
        @if (error()) {
          <rp-empty icon="alertc" title="Couldn't open the merchant" [text]="error()">
            <button type="button" class="btn btn-sec btn-sm" (click)="reload()">
              <span>Try again</span>
            </button>
          </rp-empty>
        } @else if (detail(); as m) {
          <div class="stack g16">
            @if (readOnly()) {
              <div class="note tone-info">
                <rp-icon name="lock" [size]="17" />
                <div class="grow">{{ readOnly() }}</div>
              </div>
            }
            <div class="cm-hero">
              <rp-av [name]="m.displayName" size="lg" [sq]="true" />
              <div class="grow">
                <div class="t-h3">{{ m.displayName }}</div>
                <div class="t-sm t-muted">
                  {{ subTypeLabel(m) }} merchant · {{ m.department ?? '—' }} ·
                  <span class="t-mono">{{ m.uniqueId }}</span>
                  @if (m.isFeeAccount) {
                    · Fee account
                  }
                </div>
              </div>
              <span [class]="'chip dot lg tone-' + status(m).tone">{{ status(m).l }}</span>
            </div>
            @if (m.status !== 'ACTIVE') {
              <div class="note tone-neutral">
                <rp-icon name="power" [size]="17" />
                <div class="grow">
                  <b>{{ status(m).l }}.</b>
                  {{ m.statusReason ? m.statusReason + '. ' : '' }}Its codes refuse payments,
                  allowances and coupons until the merchant is activated again.
                </div>
              </div>
            }
            <div class="c-grid k3">
              <div class="cm-tile">
                <span>Collections today</span><b class="t-num">{{ inr(m.today.amount) }}</b>
              </div>
              <div class="cm-tile">
                <span>Payments today</span><b class="t-num">{{ num(m.today.count) }}</b>
              </div>
              <div class="cm-tile">
                <span>Wallet balance</span
                ><b class="t-num">{{ m.wallet ? inr(m.wallet.balance) : '—' }}</b>
              </div>
            </div>

            <div class="sec-h"><h3>Profile</h3></div>
            <dl class="kv">
              <dt>Display name</dt>
              <dd>{{ m.displayName }}</dd>
              <dt>Operator</dt>
              <dd>{{ m.operator || '—' }}</dd>
              <dt>Mobile</dt>
              <dd>
                @if (m.mobile) {
                  {{ mobile(m.mobile) }}
                } @else {
                  <span class="t-faint">—</span>
                }
              </dd>
              <dt>E-mail</dt>
              <dd>
                @if (m.email) {
                  {{ m.email }}
                } @else {
                  <span class="t-faint">—</span>
                }
              </dd>
              <dt>Department</dt>
              <dd>
                @if (m.department) {
                  {{ m.department }}
                } @else {
                  <span class="t-faint">—</span>
                }
              </dd>
              <dt>Accepts</dt>
              <dd>
                <span class="cm-accs">
                  @for (a of acceptTags; track a.k) {
                    <span
                      class="cm-acc"
                      [class.on]="m.accepts[a.k]"
                      [attr.title]="
                        (m.accepts[a.k] ? 'Accepts ' : 'Does not accept ') + a.l.toLowerCase()
                      "
                      ><rp-icon [name]="a.icon" [size]="12" />{{ a.l }}</span
                    >
                  }
                </span>
              </dd>
              <dt>Onboarded</dt>
              <dd>
                @if (m.onboardedAt) {
                  {{ date(m.onboardedAt) }}
                } @else {
                  <span class="t-faint">—</span>
                }
              </dd>
            </dl>

            <div class="sec-h"><h3>Collection channels</h3></div>
            <div class="list">
              @for (c of channels; track c.k) {
                <div class="li" style="min-height: 52px">
                  <span class="li-ic sm"><rp-icon [name]="c.icon" [size]="16" /></span>
                  <span class="li-main"
                    ><span class="li-t wrap">{{ c.l }}</span
                    ><span class="li-s wrap">{{ c.sub }}</span></span
                  >
                  <span class="cp-why" [attr.title]="editWhy() || null"
                    ><button
                      type="button"
                      class="toggle"
                      role="switch"
                      [id]="'mer-ch-' + c.k"
                      [attr.aria-label]="c.l"
                      [attr.aria-checked]="m.channels[c.k] ? 'true' : 'false'"
                      [disabled]="!!editWhy() || busy() === 'ch-' + c.k"
                      (click)="channel(m, c.k)"
                    ></button
                  ></span>
                </div>
              }
            </div>

            <div class="sec-h">
              <h3>Bank details</h3>
              <span class="t-xs t-muted row g4"><rp-icon name="lock" [size]="12" /> Masked</span>
            </div>
            <dl class="kv">
              <dt>Account number</dt>
              <dd>
                @if (m.bank?.accountNumber) {
                  <span class="t-mono" id="mer-acct">{{ account(m) }}</span>
                } @else {
                  <span class="t-faint">—</span>
                }
              </dd>
              <dt>IFSC</dt>
              <dd>
                @if (m.bank?.ifsc) {
                  <span class="t-mono">{{ m.bank!.ifsc }}</span>
                } @else {
                  <span class="t-faint">—</span>
                }
              </dd>
              <dt>Bank</dt>
              <dd>
                @if (bankName(m)) {
                  {{ bankName(m) }}
                } @else {
                  <span class="t-faint">—</span>
                }
              </dd>
              <dt>Account holder</dt>
              <dd>
                @if (m.bank?.holderName) {
                  {{ holder(m) }}
                } @else {
                  <span class="t-faint">—</span>
                }
              </dd>
              <dt>Cancelled cheque</dt>
              <dd>
                @if (m.bank?.chequeFileId) {
                  <rp-icon name="filetext" [size]="13" /> On file
                } @else {
                  <span class="t-faint">—</span>
                }
              </dd>
            </dl>

            <div class="sec-h"><h3>Static QR codes</h3></div>
            <div class="note tone-info">
              <rp-icon name="info" [size]="17" />
              <div class="grow">
                Each code is generated once and can't be regenerated here. A lost or compromised
                code is re-issued by the CampusOne operator (OQ-17). Deactivating a code stops payments
                through it straight away.
              </div>
            </div>
            <div class="cm-qr-grid">
              @for (k of kinds; track k.kind) {
                @if (code(m, k.kind); as q) {
                  <div
                    class="cm-qr"
                    [class.is-off]="q.status !== 'ACTIVE'"
                    [attr.data-kind]="k.kind"
                  >
                    <div
                      class="qr"
                      [class.dim]="q.status !== 'ACTIVE'"
                      [innerHTML]="svg(m, k, q)"
                    ></div>
                    <div class="row g6" style="justify-content: center">
                      <b>{{ k.label }} QR</b
                      ><span
                        class="chip dot"
                        [class]="'chip dot tone-' + (q.status === 'ACTIVE' ? 'ok' : 'neutral')"
                        >{{ q.status === 'ACTIVE' ? 'Active' : 'Inactive' }}</span
                      >
                    </div>
                    <small>{{ k.sub }}</small>
                    <small class="t-faint"
                      >Generated {{ date(q.createdAt)
                      }}{{
                        q.status !== 'ACTIVE' && q.statusReason ? ' · ' + q.statusReason : ''
                      }}</small
                    >
                    <div class="row g6" style="justify-content: center; flex-wrap: wrap">
                      <button
                        type="button"
                        class="btn btn-sec btn-xs"
                        [attr.aria-label]="
                          'Download the ' + k.label.toLowerCase() + ' QR card (PDF)'
                        "
                        title="Download or print the counter card"
                        [class.is-busy]="busy() === 'card-' + q.id"
                        [disabled]="busy() === 'card-' + q.id"
                        (click)="card(m, k, q)"
                      >
                        <rp-icon name="download" [size]="15" /><span>Card</span>
                      </button>
                      <span class="cp-why" [attr.title]="editWhy() || null"
                        ><button
                          type="button"
                          class="btn btn-xs"
                          [class.btn-danger-o]="q.status === 'ACTIVE'"
                          [class.btn-ok]="q.status !== 'ACTIVE'"
                          [class.is-busy]="busy() === 'qr-' + q.id"
                          [disabled]="!!editWhy() || busy() === 'qr-' + q.id"
                          (click)="qrStatus(m, k, q)"
                        >
                          <span>{{ q.status === 'ACTIVE' ? 'Deactivate' : 'Activate' }}</span>
                        </button></span
                      >
                    </div>
                  </div>
                } @else {
                  <div class="cm-qr off" [attr.data-kind]="k.kind">
                    <div class="cm-qr-ph"><rp-icon [name]="k.icon" [size]="26" /></div>
                    <b>{{ k.label }} QR</b>
                    <small>{{
                      accepts(m, k.kind)
                        ? 'Not generated yet'
                        : k.kind === 'PAYMENT'
                          ? ''
                          : m.displayName + " doesn't accept " + k.label.toLowerCase() + 's'
                    }}</small>
                    @if (accepts(m, k.kind)) {
                      <span class="cp-why" [attr.title]="editWhy() || null"
                        ><button
                          type="button"
                          class="btn btn-soft btn-xs"
                          [class.is-busy]="busy() === 'gen-' + k.kind"
                          [disabled]="!!editWhy() || busy() === 'gen-' + k.kind"
                          (click)="generate(m, k)"
                        >
                          <span>Generate {{ k.label.toLowerCase() }} QR</span>
                        </button></span
                      >
                    } @else if (m.subType === 'VENDOR' && k.kind !== 'PAYMENT') {
                      <small class="t-faint"
                        >Vendors can't accept {{ k.label.toLowerCase() }}s (BR-42)</small
                      >
                    }
                  </div>
                }
              }
            </div>

            <div class="sec-h">
              <h3>Recent settlement lines</h3>
              <button type="button" class="linkbtn" (click)="settlements()">All settlements</button>
            </div>
            <rp-empty
              icon="bank"
              title="No settlement lines yet"
              text="Lines appear after the nightly 23:30 settlement run includes this merchant."
            />
          </div>
        } @else {
          <rp-empty icon="hourglass" title="Loading…" />
        }
      </div>
      <ng-container modal-foot>
        @if (detail(); as m) {
          <span class="cp-why" [attr.title]="editWhy() || null"
            ><button
              type="button"
              class="btn btn-sec"
              [disabled]="!!editWhy()"
              (click)="openRename(m)"
            >
              <rp-icon name="edit" [size]="17" /><span>Rename</span>
            </button></span
          >
          <span class="cp-why" [attr.title]="mailWhy(m) || null"
            ><button
              type="button"
              class="btn btn-ghost"
              [class.is-busy]="busy() === 'mail'"
              [disabled]="!!mailWhy(m) || busy() === 'mail'"
              (click)="mailAll(m)"
            >
              <rp-icon name="mail" [size]="17" /><span>E-mail all QR codes</span>
            </button></span
          >
          <span class="cp-why" [attr.title]="statusWhy(m) || null"
            ><button
              type="button"
              class="btn"
              id="mer-status"
              [class.btn-danger-o]="m.status === 'ACTIVE'"
              [class.btn-ok]="m.status !== 'ACTIVE'"
              [class.is-busy]="busy() === 'status'"
              [disabled]="!!statusWhy(m) || busy() === 'status'"
              (click)="changeStatus(m)"
            >
              <rp-icon name="power" [size]="17" /><span>{{
                m.status === 'ACTIVE' ? 'Deactivate merchant' : 'Activate merchant'
              }}</span>
            </button></span
          >
        }
      </ng-container>
    </rp-modal>

    @if (rename(); as r) {
      <rp-modal
        title="Rename merchant"
        sub="The new name shows on receipts, statements and the payer's confirmation screen."
        icon="edit"
        cls="cm-m"
        (closed)="rename.set(null)"
      >
        <div class="fld" [class.invalid]="renameError()">
          <label class="fld-l" for="mr-name"
            >Display name<span class="req">*</span
            ><span class="count">{{ r.value.length }}/{{ nameMax }}</span></label
          >
          <div class="fld-in">
            <input
              id="mr-name"
              name="mr-name"
              type="text"
              autocomplete="off"
              aria-describedby="mr-name-e"
              [attr.maxlength]="nameMax"
              [value]="r.value"
              (input)="renameInput($event)"
              (keydown.enter)="saveRename()"
            />
          </div>
          <div class="fld-e" id="mr-name-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ renameError() }}</span>
          </div>
        </div>
        <ng-container modal-foot>
          <button type="button" class="btn btn-sec" (click)="rename.set(null)">
            <span>Cancel</span>
          </button>
          <button
            type="button"
            class="btn btn-pri"
            id="mr-ok"
            [class.is-busy]="busy() === 'rename'"
            [disabled]="busy() === 'rename'"
            (click)="saveRename()"
          >
            <span>Rename</span>
          </button>
        </ng-container>
      </rp-modal>
    }
  `,
})
export class MerchantDrawer {
  private readonly api = inject(MerchantsApi);
  private readonly overlays = inject(Overlays);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly router = inject(Router);
  private readonly session = inject(SessionContext).console;

  readonly merchantId = input.required<string>();
  /** The other merchants' names (rename checks before sending; the server checks again). */
  readonly names = input<readonly { id: string; name: string }[]>([]);
  readonly closed = output<void>();
  /** Something the list shows changed (name, status, channels). */
  readonly changed = output<void>();

  protected readonly kinds = QR_KINDS;
  protected readonly acceptTags = ACCEPTS;
  protected readonly channels = CHANNELS;
  protected readonly nameMax = NAME_MAX;
  protected readonly noTask = "Your role doesn't include this task.";

  protected readonly detail = signal<MerchantDetail | null>(null);
  protected readonly error = signal('');
  /** The action in flight (one at a time). */
  protected readonly busy = signal('');
  protected readonly rename = signal<{ value: string } | null>(null);
  protected readonly renameError = signal('');
  private seq = 0;
  private readonly svgCache = new Map<string, SafeHtml>();

  protected readonly sub = computed(() => {
    const m = this.detail();
    return m ? `${m.uniqueId}${m.department ? ` · ${m.department}` : ''}` : '';
  });
  protected readonly readOnly = computed(() =>
    this.session()?.roles.some((r) => r.readOnly)
      ? 'Management has read-only access. The administrator makes changes here.'
      : '',
  );
  protected readonly editWhy = computed(
    () => this.readOnly() || (this.can('merchants.edit') ? '' : this.noTask),
  );

  constructor() {
    effect(() => {
      const id = this.merchantId();
      untracked(() => void this.load(id));
    });
  }

  private async load(id: string) {
    const n = ++this.seq;
    this.error.set('');
    try {
      const d = await this.api.detail(id);
      if (n !== this.seq) return;
      this.detail.set(d);
    } catch (e) {
      if (n !== this.seq) return;
      this.detail.set(null);
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  protected reload() {
    void this.load(this.merchantId());
  }

  /** A refused change: the problem in register wording; a stale version reloads the merchant. */
  private refused(title: string, e: unknown) {
    this.overlays.toast(title, {
      sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
      tone: 'bad',
    });
    if (e instanceof ApiProblem && (e.status === 412 || e.status === 428 || e.status === 409)) {
      this.reload();
    }
  }

  // --- reasons ---------------------------------------------------------------------------------------
  protected can(sub: string) {
    return this.session()?.subTasks.includes(sub) ?? false;
  }
  protected statusWhy(m: MerchantDetail) {
    if (this.readOnly()) return this.readOnly();
    if (!this.can('merchants.status')) return this.noTask;
    if (m.isFeeAccount && m.status === 'ACTIVE') return translate('MER.FEE_ACCOUNT_PROTECTED');
    return '';
  }
  protected mailWhy(m: MerchantDetail) {
    if (this.editWhy()) return this.editWhy();
    if (!m.email) return 'The merchant has no e-mail address. Add one on the member record.';
    if (!m.qrCodes.some((q) => q.status === 'ACTIVE')) return 'The merchant has no active codes.';
    return '';
  }

  // --- channels (PAY-020) ----------------------------------------------------------------------------
  protected async channel(m: MerchantDetail, k: Channel) {
    if (this.editWhy() || this.busy()) return;
    const c = CHANNELS.find((x) => x.k === k)!;
    const on = m.channels[k];
    const ok = await this.overlays.confirm({
      title: `${on ? 'Turn off' : 'Turn on'} ${c.phrase} for ${m.displayName}?`,
      text: on
        ? 'Payments through this channel are refused straight away.'
        : 'Members can pay through this channel straight away.',
      ok: on ? 'Turn off' : 'Turn on',
      tone: on ? 'warn' : 'brand',
      icon: c.icon,
    });
    if (!ok) return;
    this.busy.set(`ch-${k}`);
    try {
      const r = await this.api.channels(m.id, m.version, { ...m.channels, [k]: !on });
      this.detail.set(r);
      this.changed.emit();
      this.overlays.toast(`${c.l} turned ${on ? 'off' : 'on'}`, { sub: m.displayName });
    } catch (e) {
      this.refused('Not changed', e);
    } finally {
      this.busy.set('');
    }
  }

  // --- QR codes (PAY-022, PAY-023, PAY-029) ----------------------------------------------------------
  protected code(m: MerchantDetail, kind: QrKind) {
    return m.qrCodes.find((q) => q.kind === kind) ?? null;
  }
  /** What the server accepts (PAY-022): a payment code always; the others for a regular merchant. */
  protected accepts(m: MerchantDetail, kind: QrKind) {
    if (kind === 'PAYMENT') return true;
    return (
      m.subType === 'REGULAR' && (kind === 'ALLOWANCE' ? m.accepts.allowance : m.accepts.coupon)
    );
  }

  /** Our API's own SVG (trusted), sized for the card and labelled for screen readers. */
  protected svg(m: MerchantDetail, k: QrSlot, q: MerchantQr): SafeHtml {
    const key = `${q.id}:${q.version}:${m.displayName}`;
    let html = this.svgCache.get(key);
    if (!html) {
      const label = attr(`${k.label} QR code of ${m.displayName}`);
      html = this.sanitizer.bypassSecurityTrustHtml(
        q.svg.replace(
          /^\s*<svg\b/,
          `<svg width="112" height="112" role="img" aria-label="${label}"`,
        ),
      );
      this.svgCache.set(key, html);
    }
    return html;
  }

  protected async generate(m: MerchantDetail, k: QrSlot) {
    if (this.editWhy() || this.busy()) return;
    const ok = await this.overlays.confirm({
      title: `Generate ${m.displayName}'s ${k.label.toLowerCase()} QR?`,
      text: "A static code is generated once and can't be regenerated from the console.",
      ok: 'Generate QR',
      icon: 'qr',
    });
    if (!ok) return;
    this.busy.set(`gen-${k.kind}`);
    try {
      const q = await this.api.generateQr(m.id, k.kind);
      const cur = this.detail();
      if (cur?.id === m.id) {
        this.detail.set({ ...cur, qrCodes: [...cur.qrCodes.filter((x) => x.kind !== q.kind), q] });
      }
      this.overlays.toast(`${k.label} QR generated`, { sub: m.displayName });
    } catch (e) {
      this.refused('Not generated', e);
    } finally {
      this.busy.set('');
    }
  }

  protected async qrStatus(m: MerchantDetail, k: QrSlot, q: MerchantQr) {
    if (this.editWhy() || this.busy()) return;
    const on = q.status === 'ACTIVE';
    const ok = await this.overlays.confirm(
      on
        ? {
            title: `Deactivate ${m.displayName}'s ${k.label.toLowerCase()} QR?`,
            text: 'Scans of this code will be refused until it is activated again. The code itself stays the same.',
            ok: 'Deactivate QR',
            tone: 'bad',
            reason: { ...REASON, placeholder: 'e.g. Printed code damaged at the counter' },
          }
        : {
            title: `Activate ${m.displayName}'s ${k.label.toLowerCase()} QR?`,
            text: "Members can pay through this code again as soon as it's active.",
            ok: 'Activate QR',
            tone: 'brand',
            icon: 'qr',
          },
    );
    if (!ok) return;
    this.busy.set(`qr-${q.id}`);
    try {
      const r = await this.api.qrStatus(q, {
        status: on ? 'INACTIVE' : 'ACTIVE',
        reason: ok.reason ?? null,
      });
      const cur = this.detail();
      if (cur?.id === m.id) {
        this.detail.set({ ...cur, qrCodes: cur.qrCodes.map((x) => (x.id === r.id ? r : x)) });
      }
      this.overlays.toast(`${k.label} QR ${on ? 'deactivated' : 'activated'}`, {
        sub: m.displayName,
      });
    } catch (e) {
      this.refused('Not changed', e);
    } finally {
      this.busy.set('');
    }
  }

  protected async card(m: MerchantDetail, k: QrSlot, q: MerchantQr) {
    if (this.busy()) return;
    this.busy.set(`card-${q.id}`);
    const name = `${m.displayName} ${k.label} QR.pdf`;
    try {
      await this.api.card(q.id, name);
      this.overlays.toast('QR card downloaded', { sub: `${name} · print it for the counter` });
    } catch (e) {
      this.refused('Not downloaded', e);
    } finally {
      this.busy.set('');
    }
  }

  // --- footer: e-mail (PAY-024), status (PAY-019), rename (PAY-018) -----------------------------------
  protected async mailAll(m: MerchantDetail) {
    if (this.mailWhy(m) || this.busy()) return;
    this.busy.set('mail');
    try {
      const r = await this.api.emailQrs({ merchantIds: [m.id] });
      this.overlays.toast(
        r.sent ? `${plural(r.sent, 'QR code')} e-mailed` : 'No QR codes e-mailed',
        {
          sub: r.sent ? `Sent to ${m.email}` : 'The merchant has no active codes or no e-mail.',
          tone: r.sent ? 'ok' : 'warn',
        },
      );
    } catch (e) {
      this.refused('Not e-mailed', e);
    } finally {
      this.busy.set('');
    }
  }

  protected async changeStatus(m: MerchantDetail) {
    if (this.statusWhy(m) || this.busy()) return;
    const on = m.status === 'ACTIVE';
    const ok = await this.overlays.confirm(
      on
        ? {
            title: `Deactivate ${m.displayName}?`,
            text: "All of this merchant's codes stop accepting payments, allowances and coupons. Collections already made still settle tonight.",
            ok: 'Deactivate merchant',
            tone: 'bad',
            reason: { ...REASON, placeholder: 'e.g. Contract ended on 30 Sep' },
          }
        : {
            title: `Activate ${m.displayName}?`,
            text: 'The merchant can accept payments again through its active codes.',
            ok: 'Activate merchant',
            tone: 'brand',
            icon: 'power',
          },
    );
    if (!ok) return;
    this.busy.set('status');
    try {
      const r = await this.api.status(m.id, {
        to: on ? 'INACTIVE' : 'ACTIVE',
        reason: ok.reason ?? null,
      });
      this.detail.set(r);
      this.changed.emit();
      this.overlays.toast(on ? 'Merchant deactivated' : 'Merchant activated', {
        sub: m.displayName,
      });
    } catch (e) {
      this.refused('Not changed', e);
    } finally {
      this.busy.set('');
    }
  }

  protected openRename(m: MerchantDetail) {
    if (this.editWhy()) return;
    this.renameError.set('');
    this.rename.set({ value: m.displayName });
  }
  protected renameInput(e: Event) {
    this.rename.set({ value: (e.target as HTMLInputElement).value });
    this.renameError.set('');
  }

  /** The prototype's checks (cm.mer.rename), a confirmation, then PAY-018 with If-Match. */
  protected async saveRename() {
    const m = this.detail();
    const r = this.rename();
    if (!m || !r || this.busy()) return;
    const v = r.value.trim().replace(/\s+/g, ' ');
    let e = '';
    if (!v) e = translate('VALIDATION.REQUIRED');
    else if (v.length < NAME_MIN || v.length > NAME_MAX)
      e = `Use ${NAME_MIN}–${NAME_MAX} characters`;
    else if (v === m.displayName) e = "This is already the merchant's name";
    else if (this.names().some((o) => o.id !== m.id && o.name.toLowerCase() === v.toLowerCase())) {
      e = translate('MER.NAME_TAKEN');
    }
    if (e) {
      this.renameError.set(e);
      return;
    }
    const ok = await this.overlays.confirm({
      title: `Rename to “${v}”?`,
      text: `The merchant ID ${m.uniqueId} and codes stay the same.`,
      ok: 'Rename',
      icon: 'edit',
    });
    if (!ok) return;
    this.busy.set('rename');
    try {
      const saved = await this.api.update(m.id, m.version, { displayName: v });
      this.detail.set(saved);
      this.rename.set(null);
      this.changed.emit();
      this.overlays.toast('Merchant renamed', { sub: saved.displayName });
    } catch (err) {
      const field =
        err instanceof ApiProblem ? err.errors.find((x) => x.field === 'displayName') : null;
      if (field) this.renameError.set(field.message);
      else this.refused('Not renamed', err);
    } finally {
      this.busy.set('');
    }
  }

  protected settlements() {
    void this.router.navigate(['/console/settlements']);
  }

  // --- formatting ------------------------------------------------------------------------------------
  protected status(m: MerchantDetail) {
    return STATUS[m.status] ?? { l: m.status, tone: 'neutral' };
  }
  protected subTypeLabel(m: MerchantDetail) {
    return m.subType === 'VENDOR' ? 'Vendor' : 'Regular';
  }
  protected account(m: MerchantDetail) {
    return maskedAccount(m.bank?.accountNumber ?? null);
  }
  protected bankName(m: MerchantDetail) {
    return m.bank ? (m.bank.bankName ?? IFSC_BANKS[m.bank.ifsc.slice(0, 4)] ?? '') : '';
  }
  protected holder(m: MerchantDetail) {
    return titleCase(m.bank?.holderName ?? '');
  }
  protected inr(v: { amount: string }) {
    return inrText(v);
  }
  protected num(n: number) {
    return n.toLocaleString('en-IN');
  }
  protected mobile(v: string) {
    return formatMobile(v);
  }
  protected date(v: string) {
    return formatDate(v);
  }
}
