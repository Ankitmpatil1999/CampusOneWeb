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
import { Amount, amountPaise, inrText } from '../../../Shared/Amount';
import { Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import {
  formatDate,
  formatDateTime,
  formatInr,
  formatTime,
  istBusinessDate,
  titleCase,
} from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { HeldCreditsApi, type HeldCredit } from './held-credits.api';
import {
  MembersApi,
  type MemberDetail,
  type MemberStatus,
  type Money,
  type StatementRow,
  type TransactionPermission,
  type Wallet,
  type WalletKind,
} from './members.api';

/** The member's transaction permission as last recorded (BR-13; on unless turned off). */
export interface PermissionState {
  readonly enabled: boolean;
  readonly reason: string | null;
  readonly changedAt: string | null;
}

const STATUS: Record<MemberStatus, { l: string; tone: string }> = {
  ACTIVE: { l: 'Active', tone: 'ok' },
  INACTIVE: { l: 'Inactive', tone: 'neutral' },
  SUSPENDED: { l: 'Suspended', tone: 'bad' },
};
const KIND: Record<WalletKind, { wallet: string; balance: string }> = {
  CAMPUS: { wallet: 'Campus wallet', balance: 'Balance' },
  MERCHANT: { wallet: 'Merchant wallet', balance: 'Balance' },
  ALLOWANCE: { wallet: 'Allowance wallet', balance: 'Allowance balance' },
  PERSONAL: { wallet: 'Personal wallet', balance: 'Personal balance' },
};
const PAGE = 20;
const HELD: Record<string, { l: string; tone: string }> = {
  HELD: { l: 'Held', tone: 'warn' },
  PROCESSED: { l: 'Posted to the wallet', tone: 'ok' },
  RETURNED: { l: 'Returned to the sender', tone: 'neutral' },
};
const REASON = { label: 'Reason (recorded on the member)', min: 5, max: 300 } as const;

/** One line of the wallets list (the prototype's kv pairs). */
type Line =
  | { k: string; l: string; t: 'wallet'; w: Wallet }
  | { k: string; l: string; t: 'amt'; m: Money }
  | { k: string; l: string; t: 'mono'; v: string }
  | { k: string; l: string; t: 'none' };

/** The prototype's wallet number (fmt.wallet): 410200981 → "4102 00981", else groups of four. */
export function walletNo(no: string): string {
  return no.length === 9 ? `${no.slice(0, 4)} ${no.slice(4)}` : no.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * The member drawer's wallets (prototype mStatus, "Wallets"; WAL-008) with the money held while the
 * member is suspended or inactive and, for a role that sees transactions, each held bank credit
 * (WAL-010, CR-08), the transaction permission toggle (IDN-056, BR-13) and the campus wallet's
 * statement (WAL-009) with a cursor "Load more".
 * Balances are read-only here: only the payment engine changes a balance.
 */
@Component({
  selector: 'rp-member-wallet',
  imports: [Amount, Empty, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <div class="fs">
      <h4>
        <rp-icon name="wallet" [size]="15" /> Wallets
        <span class="t-xs t-muted" style="font-weight: 500">status follows the member</span>
      </h4>
      <div class="fs-b stack g12">
        @if (walletsError()) {
          <div class="note tone-bad">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ walletsError() }}</div>
          </div>
        } @else if (!wallets()) {
          <p class="t-sm t-muted">Loading the wallets…</p>
        } @else {
          <dl class="kv">
            @for (r of lines(); track r.k) {
              <dt>{{ r.l }}</dt>
              <dd>
                @if (r.t === 'wallet') {
                  <span class="t-mono">{{ no(r.w.walletNo) }}</span> ·
                  <span [class]="'chip dot tone-' + statusOf(r.w.status).tone">{{
                    statusOf(r.w.status).l
                  }}</span>
                } @else if (r.t === 'amt') {
                  <rp-amt [value]="r.m" />
                } @else if (r.t === 'mono') {
                  <span class="t-mono">{{ r.v }}</span>
                } @else {
                  <span class="t-faint">—</span>
                }
              </dd>
            }
          </dl>
          @if (held(); as h) {
            <div class="note tone-warn" id="cp-held-note">
              <rp-icon name="hourglass" [size]="17" />
              <div class="grow">
                @if (member().status === 'INACTIVE') {
                  <b>{{ h.amount }} held</b> from {{ h.from }} while inactive. It posts to the
                  wallet when the member is active again (OI-WAL-24).
                } @else {
                  <b>{{ h.amount }} held</b> from {{ h.from }} while suspended. It posts to the
                  wallet when the suspension is lifted (OI-WAL-24).
                }
              </div>
            </div>
          }
        }
        <div class="li" style="min-height: 52px">
          <span class="li-ic sm"><rp-icon name="zap" [size]="16" /></span>
          <span class="li-main"
            ><span class="li-t wrap">Payments allowed</span
            ><span class="li-s wrap"
              >When off, the member can't spend from the campus wallet. Receiving money is not
              affected.</span
            >
            @if (permission().changedAt) {
              <span class="li-s wrap" id="cp-m-txn-last"
                >{{ permission().enabled ? 'Turned on' : 'Turned off' }}
                {{ dt(permission().changedAt!)
                }}{{ permission().reason ? ' · ' + permission().reason : '' }}</span
              >
            }
          </span>
          <span class="cp-why" [attr.title]="toggleWhy() || null"
            ><button
              type="button"
              class="toggle"
              role="switch"
              id="cp-m-txn"
              aria-label="Payments allowed"
              [attr.aria-checked]="permission().enabled ? 'true' : 'false'"
              [disabled]="!!toggleWhy() || busy()"
              (click)="toggle()"
            ></button
          ></span>
        </div>
      </div>
    </div>

    @if (heldList().length) {
      <div class="fs">
        <h4>
          <rp-icon name="hourglass" [size]="15" /> Held bank credits
          <span class="t-xs t-muted" style="font-weight: 500">newest first</span>
        </h4>
        <div class="fs-b" style="padding: 0">
          <div class="tbl-wrap" style="border: 0; border-radius: 0">
            <table class="tbl dense" id="cp-held">
              <thead>
                <tr>
                  <th>Credited</th>
                  <th>From</th>
                  <th class="r">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (c of heldList(); track c.id) {
                  <tr>
                    <td>
                      <div class="cell-t t-num" style="font-weight: 550">
                        {{ date(c.creditedAt) }}
                      </div>
                      <div class="cell-s">{{ time(c.creditedAt) }}</div>
                    </td>
                    <td>
                      <div class="cell-t">{{ c.sender ? name(c.sender) : 'Bank credit' }}</div>
                      <div class="cell-s">
                        {{ c.mode }} · UTR <span class="t-mono">{{ c.utr }}</span>
                      </div>
                    </td>
                    <td class="r"><rp-amt [value]="c.amount" /></td>
                    <td>
                      <span [class]="'chip dot tone-' + heldStatus(c).tone">{{
                        heldStatus(c).l
                      }}</span>
                      @if (c.resolvedAt) {
                        <div class="cell-s">
                          {{ date(c.resolvedAt) }}{{ c.reason ? ' · ' + c.reason : '' }}
                        </div>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    } @else if (heldError()) {
      <p class="t-sm t-muted" id="cp-held-error">
        Couldn't load the held bank credits: {{ heldError() }}
      </p>
    }

    <div class="fs">
      <h4>
        <rp-icon name="receipt" [size]="15" /> Statement
        <span class="t-xs t-muted" style="font-weight: 500">campus wallet · newest first</span>
      </h4>
      <div class="fs-b stack g12">
        <div class="c-form">
          <div class="fld">
            <label class="fld-l" for="cp-st-from">From<span class="opt">(optional)</span></label>
            <div class="fld-in">
              <input
                id="cp-st-from"
                type="date"
                [attr.max]="to() || today"
                [value]="from()"
                (change)="setFrom($event)"
              />
            </div>
          </div>
          <div class="fld" [class.invalid]="rangeError()">
            <label class="fld-l" for="cp-st-to">To<span class="opt">(optional)</span></label>
            <div class="fld-in">
              <input
                id="cp-st-to"
                type="date"
                aria-describedby="cp-st-to-e"
                [attr.min]="from() || null"
                [attr.max]="today"
                [value]="to()"
                (change)="setTo($event)"
              />
            </div>
            <div class="fld-e" id="cp-st-to-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ rangeError() }}</span>
            </div>
          </div>
        </div>
        @if (error()) {
          <div class="note tone-bad">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ error() }}</div>
            <button type="button" class="btn btn-sec btn-sm" (click)="reload()">
              <span>Try again</span>
            </button>
          </div>
        } @else if (loading() && !rows().length) {
          <rp-empty icon="hourglass" title="Loading the statement…" />
        } @else if (!rows().length) {
          <rp-empty
            icon="receipt"
            [title]="from() || to() ? 'No transactions in these dates' : 'No transactions yet'"
            [text]="
              from() || to()
                ? 'Widen the dates or clear them to see every movement.'
                : 'Money added, payments, transfers and refunds appear here as they happen.'
            "
          />
        } @else {
          <div class="tbl-wrap">
            <table class="tbl dense">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Transaction</th>
                  <th class="r">Amount</th>
                  <th class="r">Balance</th>
                </tr>
              </thead>
              <tbody>
                @for (r of rows(); track r.id) {
                  <tr>
                    <td>
                      <div class="cell-t t-num" style="font-weight: 550">{{ date(r.at) }}</div>
                      <div class="cell-s">{{ time(r.at) }}</div>
                    </td>
                    <td>
                      <div class="cell-t">{{ r.title }}</div>
                      <div class="cell-s">
                        {{ party(r) }}<span class="t-mono">{{ r.reference }}</span>
                      </div>
                    </td>
                    <td class="r">
                      <rp-amt
                        [value]="r.amount"
                        [sign]="r.direction === 'CREDIT' ? '+' : '−'"
                        [cls]="r.direction === 'CREDIT' ? 'cr' : ''"
                      />
                    </td>
                    <td class="r">
                      @if (r.balanceAfter) {
                        <rp-amt [value]="r.balanceAfter" />
                      } @else {
                        <span class="t-faint">—</span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="pager">
            <span
              >{{ rows().length }} movement{{ rows().length === 1 ? '' : 's'
              }}{{ next() ? ' shown' : '' }}</span
            >
            @if (next()) {
              <button
                type="button"
                class="btn btn-sec btn-sm"
                id="cp-st-more"
                [class.is-busy]="loading()"
                [disabled]="loading()"
                (click)="loadMore()"
              >
                <rp-icon name="down" [size]="15" /><span>Load more</span>
              </button>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class MemberWallet {
  private readonly api = inject(MembersApi);
  private readonly heldApi = inject(HeldCreditsApi);
  private readonly overlays = inject(Overlays);

  readonly member = input.required<MemberDetail>();
  /** WAL-008, loaded with the drawer (null while loading). */
  readonly wallets = input<readonly Wallet[] | null>(null);
  readonly walletsError = input('');
  readonly permission = input<PermissionState>({ enabled: true, reason: null, changedAt: null });
  /** Why the user may not change the permission (read-only role, no members.status). */
  readonly why = input('');
  /** The role sees transactions (recon.view): the held bank credits are listed (WAL-010). */
  readonly heldAccess = input(false);
  /** IDN-056 answered: the new permission and the member's new version. */
  readonly changed = output<TransactionPermission>();
  /** The member changed elsewhere (412 / 428): the drawer reloads it. */
  readonly stale = output<void>();

  protected readonly today = istBusinessDate();
  protected readonly busy = signal(false);
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly rows = signal<readonly StatementRow[]>([]);
  protected readonly next = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  private seq = 0;
  /** This member's held bank credits (WAL-010); null until read or without the grant. */
  protected readonly heldItems = signal<readonly HeldCredit[] | null>(null);
  protected readonly heldError = signal('');
  private heldSeq = 0;

  protected readonly rangeError = computed(() =>
    this.from() && this.to() && this.to() < this.from()
      ? "The end date can't be before the start date."
      : '',
  );
  protected readonly toggleWhy = computed(() => {
    if (this.why()) return this.why();
    return this.member().status !== 'ACTIVE'
      ? "Only an active member's payments can be turned on or off."
      : '';
  });
  /** The prototype's kv: each wallet's number and status, its balance, then the top-up account. */
  protected readonly lines = computed<Line[]>(() => {
    const list = this.wallets() ?? [];
    const order: WalletKind[] = ['CAMPUS', 'MERCHANT', 'ALLOWANCE', 'PERSONAL'];
    const main = list.find((w) => w.kind === 'CAMPUS' || w.kind === 'MERCHANT');
    const out: Line[] = [];
    if (!main) {
      out.push({ k: 'c', l: 'Campus wallet', t: 'none' }, { k: 'cb', l: 'Balance', t: 'none' });
    }
    for (const kind of order) {
      for (const w of list.filter((x) => x.kind === kind)) {
        out.push({ k: `${w.id}-w`, l: KIND[kind].wallet, t: 'wallet', w });
        out.push({ k: `${w.id}-b`, l: KIND[kind].balance, t: 'amt', m: w.balance });
      }
    }
    if (!list.some((w) => w.kind === 'ALLOWANCE') && main?.kind !== 'MERCHANT') {
      out.push(
        { k: 'a', l: 'Allowance wallet', t: 'none' },
        { k: 'ab', l: 'Allowance balance', t: 'none' },
      );
    }
    out.push(
      main?.virtualAccount
        ? { k: 'va', l: 'Virtual account for top-ups', t: 'mono', v: main.virtualAccount }
        : { k: 'va', l: 'Virtual account for top-ups', t: 'none' },
    );
    return out;
  });
  protected readonly heldList = computed(() => this.heldItems() ?? []);
  /** The prototype's note: the money held (WAL-008) and, once WAL-010 is read, from how many credits. */
  protected readonly held = computed(() => {
    const w = (this.wallets() ?? []).find((x) => x.kind === 'CAMPUS' || x.kind === 'MERCHANT');
    const open = (this.heldItems() ?? []).filter((c) => c.status === 'HELD');
    const amount =
      w && /[1-9]/.test(w.held.amount)
        ? inrText(w.held)
        : open.length
          ? formatInr(open.reduce((s, c) => s + amountPaise(c.amount), 0))
          : '';
    if (!amount) return null;
    const n = open.length;
    const from = this.heldItems() && n ? `${n} bank credit${n === 1 ? '' : 's'}` : 'bank credits';
    return { amount, from };
  });

  /** Only another member (not a reload of the same one) starts over. */
  private readonly memberId = computed(() => this.member().id);

  constructor() {
    effect(() => {
      // A new member or other dates load the statement from the newest movement.
      this.memberId();
      this.from();
      this.to();
      untracked(() => void this.load());
    });
    effect(() => {
      // Another member (or the grant) reads the held credits again.
      const id = this.memberId();
      const can = this.heldAccess();
      untracked(() => void this.loadHeld(id, can));
    });
  }

  /** WAL-010, filtered to this member. */
  private async loadHeld(id: string, can: boolean) {
    const n = ++this.heldSeq;
    this.heldItems.set(null);
    this.heldError.set('');
    if (!can) return;
    try {
      const items = await this.heldApi.ofMember(id);
      if (n === this.heldSeq) this.heldItems.set(items);
    } catch (e) {
      if (n === this.heldSeq) {
        this.heldError.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
      }
    }
  }

  private async load(cursor?: string) {
    if (this.rangeError()) return;
    const id = ++this.seq;
    this.loading.set(true);
    try {
      const s = await this.api.statement(this.member().id, {
        ...(this.from() ? { from: this.from() } : {}),
        ...(this.to() ? { to: this.to() } : {}),
        ...(cursor ? { cursor } : {}),
        limit: PAGE,
      });
      if (id !== this.seq) return;
      this.rows.set(cursor ? [...this.rows(), ...s.items] : s.items);
      this.next.set(s.nextCursor);
      this.error.set('');
    } catch (e) {
      if (id !== this.seq) return;
      if (e instanceof ApiProblem && e.status === 404 && !cursor) {
        // No campus wallet yet: nothing to show.
        this.rows.set([]);
        this.next.set(null);
        this.error.set('');
      } else {
        this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
      }
    } finally {
      if (id === this.seq) this.loading.set(false);
    }
  }

  protected loadMore() {
    const c = this.next();
    if (c && !this.loading()) void this.load(c);
  }
  protected reload() {
    void this.load();
  }
  protected setFrom(e: Event) {
    this.from.set((e.target as HTMLInputElement).value);
  }
  protected setTo(e: Event) {
    this.to.set((e.target as HTMLInputElement).value);
  }

  /** IDN-056: a reason is recorded either way; the member's version guards the change. */
  protected async toggle() {
    if (this.toggleWhy() || this.busy()) return;
    const m = this.member();
    const name = titleCase(m.name);
    const on = this.permission().enabled;
    const ok = await this.overlays.confirm(
      on
        ? {
            title: `Turn off payments for ${name}?`,
            text: "They won't be able to spend from the campus wallet until you turn this back on. Receiving money isn't affected.",
            ok: 'Turn off payments',
            tone: 'warn',
            reason: { ...REASON, placeholder: 'e.g. The parent asked to pause spending' },
          }
        : {
            title: `Turn on payments for ${name}?`,
            text: 'They can spend from the campus wallet again.',
            ok: 'Turn on payments',
            tone: 'brand',
            icon: 'zap',
            reason: { ...REASON, placeholder: 'e.g. The parent asked to allow spending again' },
          },
    );
    if (!ok) return;
    this.busy.set(true);
    try {
      const r = await this.api.setPermission(m.id, m.version, {
        enabled: !on,
        reason: ok.reason ?? '',
      });
      this.changed.emit(r);
      this.overlays.toast(r.enabled ? 'Payments turned on' : 'Payments turned off', {
        sub: name,
      });
    } catch (e) {
      this.overlays.toast('Not changed', {
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
      if (e instanceof ApiProblem && (e.status === 412 || e.status === 428)) this.stale.emit();
    } finally {
      this.busy.set(false);
    }
  }

  protected heldStatus(c: HeldCredit) {
    return HELD[c.status] ?? { l: c.status, tone: 'neutral' };
  }
  protected name(v: string) {
    return titleCase(v);
  }
  protected statusOf(s: MemberStatus) {
    return STATUS[s] ?? { l: s, tone: 'neutral' };
  }
  protected no(v: string) {
    return walletNo(v);
  }
  protected party(r: StatementRow) {
    const who = r.counterparty
      ? `${r.direction === 'CREDIT' ? 'From' : 'To'} ${r.counterparty} · `
      : '';
    return `${who}${r.channelLabel} · `;
  }
  protected date(v: string) {
    return formatDate(v);
  }
  protected time(v: string) {
    return formatTime(v);
  }
  protected dt(v: string) {
    return formatDateTime(v);
  }
}
