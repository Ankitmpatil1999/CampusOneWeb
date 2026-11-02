import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { inrText } from '../../../Shared/Amount';
import { Avatar } from '../../../Shared/Avatar';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate, formatDateTime } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { amountText, cleanTyped } from '../../../Utils/typing';
import { STATE, limitsText, moneyInput } from './allowance-format';
import { AllowancesApi, type AllowanceGrant, type Money } from './allowances.api';

const paiseOf = (v: string) => Math.round(Number(v) * 100);

/**
 * The allowance drawer (prototype alwDrawer; SRS 10.3; ALW-004): the student, the amount, the
 * balance and what was spent, the grant's terms and what happened to it (credited, lapsed or
 * cancelled). An administrator changes the daily limits while the grant is in force, and cancels a
 * grant that hasn't been credited yet (with a reason) — If-Match on both.
 */
@Component({
  selector: 'rp-allowance-drawer',
  imports: [Avatar, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      title="Allowance"
      [sub]="sub()"
      icon="gift"
      [drawer]="true"
      cls="cm-m"
      [foot]="canEdit() && (editable() || cancellable())"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="cm-dr">
        <div class="stack g16">
          @if (g(); as a) {
            <div class="cm-hero">
              <rp-av [name]="a.student.name" size="lg" />
              <div class="grow">
                <div class="t-h3">{{ a.student.name }}</div>
                <div class="t-sm t-muted">{{ who() }}</div>
              </div>
              <span [class]="'chip dot lg tone-' + state().tone">{{ state().l }}</span>
            </div>
            <div class="c-grid k3">
              <div class="cm-tile">
                <span>Allowance</span><b class="t-num">{{ inr(a.amount) }}</b>
              </div>
              <div class="cm-tile">
                <span>Balance</span
                ><b class="t-num">{{
                  a.state === 'SCHEDULED' || a.state === 'CANCELLED'
                    ? 'Not credited'
                    : a.balance
                      ? inr(a.balance)
                      : '—'
                }}</b>
              </div>
              <div class="cm-tile">
                <span>Spent today</span
                ><b class="t-num">{{ inr(a.today.spent) }} · {{ a.today.count }}×</b>
              </div>
            </div>
            <dl class="kv">
              <dt>Allowance</dt>
              <dd>{{ a.name || 'Allowance' }}</dd>
              <dt>Allowance wallet</dt>
              <dd>
                <span class="t-mono">{{ wallet(a.walletNo) }}</span>
              </dd>
              <dt>Start</dt>
              <dd>{{ date(a.startDate) }}</dd>
              <dt>Expiry</dt>
              <dd>{{ date(a.expiryDate) }}</dd>
              <dt>Daily limits</dt>
              <dd>{{ limits() || 'No daily limit' }}</dd>
              <dt>Spent in all</dt>
              <dd>{{ inr(a.spent) }}</dd>
              <dt>Issued by</dt>
              <dd>{{ a.issuedBy ? a.issuedBy.name + ' · ' : '' }}{{ date(a.issuedAt) }}</dd>
              <dt>Wallet status</dt>
              <dd>
                <span
                  [class]="'chip dot tone-' + (a.walletStatus === 'ACTIVE' ? 'ok' : 'neutral')"
                  >{{ walletStatus(a.walletStatus) }}</span
                >
              </dd>
              @if (a.expired) {
                <dt>Lapsed</dt>
                <dd>{{ inr(a.expired) }}</dd>
              }
              @if (a.cancelReason) {
                <dt>Cancelled because</dt>
                <dd>{{ a.cancelReason }}</dd>
              }
            </dl>

            @if (editing()) {
              <div class="card pad stack g12">
                <b class="t-h4">Daily limits</b>
                <div class="li" style="min-height: 48px">
                  <span class="li-ic sm"><rp-icon name="gauge" [size]="16" /></span>
                  <span class="li-main"
                    ><span class="li-t wrap" id="ad-lim-l">Set daily limits</span
                    ><span class="li-s wrap"
                      >Off: the student can spend the whole balance in a day.</span
                    ></span
                  >
                  <button
                    type="button"
                    class="toggle"
                    role="switch"
                    id="ad-lim"
                    aria-label="Set daily limits"
                    [attr.aria-checked]="lim()"
                    (click)="lim.set(!lim())"
                  ></button>
                </div>
                <div class="c-form">
                  <div class="fld" [class.cm-dim]="!lim()" [class.invalid]="countErr()">
                    <label class="fld-l" for="ad-count">Payments per day</label>
                    <div class="fld-in">
                      <input
                        id="ad-count"
                        inputmode="numeric"
                        maxlength="2"
                        aria-describedby="ad-count-e"
                        [disabled]="!lim()"
                        [value]="count()"
                        (input)="count.set(val($event)); countErr.set('')"
                      />
                    </div>
                    <div class="fld-e" id="ad-count-e" role="alert">
                      <rp-icon name="alertc" [size]="14" /><span>{{ countErr() }}</span>
                    </div>
                  </div>
                  <div class="fld" [class.cm-dim]="!lim()" [class.invalid]="amountErr()">
                    <label class="fld-l" for="ad-amount">Amount per day</label>
                    <div class="fld-in">
                      <span class="pre">₹</span
                      ><input
                        id="ad-amount"
                        inputmode="decimal"
                        aria-describedby="ad-amount-e"
                        [disabled]="!lim()"
                        [value]="amount()"
                        (input)="amount.set(money($event)); amountErr.set('')"
                      />
                    </div>
                    <div class="fld-e" id="ad-amount-e" role="alert">
                      <rp-icon name="alertc" [size]="14" /><span>{{ amountErr() }}</span>
                    </div>
                  </div>
                </div>
              </div>
            }

            <div class="sec-h"><h3>History</h3></div>
            @if (history().length) {
              <div class="tl">
                @for (h of history(); track h.t) {
                  <div class="tl-i" [class.done]="h.done" [class.bad]="h.bad">
                    <span class="tl-dot"
                      ><rp-icon [name]="h.icon" [size]="13" [stroke]="2.6"
                    /></span>
                    <div class="tl-c">
                      <div class="tl-t">{{ h.t }}</div>
                      <div class="tl-s">{{ h.s }}</div>
                    </div>
                  </div>
                }
              </div>
            } @else {
              <div class="note tone-neutral">
                <rp-icon name="calendar" [size]="17" />
                <div class="grow">
                  Nothing yet. The 00:05 job credits {{ inr(a.amount) }} on {{ date(a.startDate) }}.
                </div>
              </div>
            }
            @if (error()) {
              <div class="note tone-bad" role="alert">
                <rp-icon name="alertc" [size]="17" />
                <div class="grow">{{ error() }}</div>
              </div>
            }
          }
        </div>
      </div>
      <div modal-foot class="row g8" style="width: 100%">
        @if (cancellable()) {
          <button
            type="button"
            class="btn btn-sec"
            id="ad-cancel"
            [disabled]="busy()"
            (click)="cancel()"
          >
            <rp-icon name="x" [size]="17" /><span>Cancel allowance</span>
          </button>
        }
        <span class="grow"></span>
        @if (editable()) {
          @if (editing()) {
            <button
              type="button"
              class="btn btn-sec"
              [disabled]="busy()"
              (click)="editing.set(false)"
            >
              <span>Back</span>
            </button>
            <button
              type="button"
              class="btn btn-pri"
              id="ad-save"
              [disabled]="busy()"
              (click)="save()"
            >
              <rp-icon name="check" [size]="17" /><span>Save limits</span>
            </button>
          } @else {
            <button type="button" class="btn btn-sec" id="ad-limits" (click)="edit()">
              <rp-icon name="gauge" [size]="17" /><span>Change daily limits</span>
            </button>
          }
        }
      </div>
    </rp-modal>
  `,
})
export class AllowanceDrawer {
  private readonly api = inject(AllowancesApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).console;

  readonly grant = input.required<AllowanceGrant>();
  readonly defaults = input<{ dailyCount: number; dailyAmount: Money } | null>(null);
  readonly closed = output<void>();
  readonly changed = output<AllowanceGrant>();

  /** The grant as last saved here (the list's copy until a change). */
  private readonly saved = signal<AllowanceGrant | null>(null);
  protected readonly g = computed(() => this.saved() ?? this.grant());
  protected readonly editing = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly lim = signal(false);
  protected readonly count = signal('');
  protected readonly amount = signal('');
  protected readonly countErr = signal('');
  protected readonly amountErr = signal('');

  protected readonly state = computed(
    () => STATE[this.g().state] ?? { l: this.g().state, tone: 'neutral' },
  );
  protected readonly limits = computed(() => limitsText(this.g().dailyLimits));
  protected readonly who = computed(() =>
    [this.g().student.admissionNo, this.g().student.grade ?? 'Not enrolled']
      .filter(Boolean)
      .join(' · '),
  );
  protected readonly sub = computed(() =>
    [this.g().student.name, this.g().name].filter(Boolean).join(' · '),
  );
  protected readonly canEdit = computed(
    () =>
      !(this.session()?.roles.some((r) => r.readOnly) ?? false) &&
      (this.session()?.subTasks.includes('allowances.issue') ?? false),
  );
  /** Limits change while the grant is in force (scheduled or credited). */
  protected readonly editable = computed(
    () => this.canEdit() && (this.g().state === 'SCHEDULED' || this.g().state === 'ACTIVE'),
  );
  /** Only a grant not yet credited can be cancelled (no money to take back, OQ-08). */
  protected readonly cancellable = computed(() => this.canEdit() && this.g().state === 'SCHEDULED');
  protected readonly history = computed(() => {
    const a = this.g();
    const out: {
      t: string;
      s: string;
      icon: 'plus' | 'hourglass' | 'x';
      done: boolean;
      bad: boolean;
    }[] = [];
    if (a.creditedAt) {
      out.push({
        t: `Credited · ${inrText(a.amount)}`,
        s: `${formatDateTime(a.creditedAt)} · by the 00:05 job`,
        icon: 'plus',
        done: true,
        bad: false,
      });
    }
    if (a.state === 'EXPIRED' && a.endedAt) {
      out.push({
        t: `Lapsed · ${a.expired ? inrText(a.expired) : '₹0.00'}`,
        s: `${formatDateTime(a.endedAt)} · unspent balance returned to the school`,
        icon: 'hourglass',
        done: false,
        bad: true,
      });
    }
    if (a.state === 'CANCELLED' && a.endedAt) {
      out.push({
        t: 'Cancelled before its credit',
        s: `${formatDateTime(a.endedAt)}${a.cancelReason ? ' · ' + a.cancelReason : ''}`,
        icon: 'x',
        done: false,
        bad: true,
      });
    }
    return out.reverse();
  });

  protected edit() {
    const l = this.g().dailyLimits;
    const d = this.defaults();
    this.lim.set(!!l);
    this.count.set(String(l?.count ?? d?.dailyCount ?? 3));
    this.amount.set(
      (l?.amount ?? d?.dailyAmount ?? { amount: '200.00' }).amount.replace(/\.00$/, ''),
    );
    this.countErr.set('');
    this.amountErr.set('');
    this.editing.set(true);
  }

  protected async save() {
    let body: { dailyLimits: { count: number; amount: Money } | null } = { dailyLimits: null };
    if (this.lim()) {
      const n = Number(this.count());
      const amt = moneyInput(this.amount());
      let bad = false;
      if (!/^\d+$/.test(this.count()) || n < 1 || n > 20) {
        this.countErr.set('Enter 1 to 20 payments a day');
        bad = true;
      }
      if (!amt || paiseOf(amt) <= 0) {
        this.amountErr.set(translate('VALIDATION.AMOUNT'));
        bad = true;
      } else if (paiseOf(amt) > paiseOf(this.g().amount.amount)) {
        this.amountErr.set("The daily amount can't be more than the allowance");
        bad = true;
      }
      if (bad) return;
      body = { dailyLimits: { count: n, amount: { amount: amt!, currency: 'INR' } } };
    }
    await this.patch(body, 'Daily limits saved');
    this.editing.set(false);
  }

  protected async cancel() {
    const a = this.g();
    const r = await this.overlays.confirm({
      title: 'Cancel this allowance?',
      text: `${inrText(a.amount)} for ${a.student.name} won't be credited on ${formatDate(a.startDate)}.`,
      ok: 'Cancel allowance',
      cancel: 'Keep it',
      tone: 'bad',
      icon: 'x',
      reason: { label: 'Reason', min: 5, max: 200 },
    });
    if (!r) return;
    await this.patch({ status: 'INACTIVE', reason: r.reason ?? '' }, 'Allowance cancelled');
  }

  private async patch(
    body: {
      dailyLimits?: { count: number; amount: Money } | null;
      status?: 'INACTIVE';
      reason?: string;
    },
    done: string,
  ) {
    this.busy.set(true);
    this.error.set('');
    try {
      const g = await this.api.update(this.g(), body);
      this.saved.set(g);
      this.changed.emit(g);
      this.overlays.toast(done, { sub: g.student.name });
    } catch (e) {
      this.error.set(
        e instanceof ApiProblem
          ? e.status === 412
            ? 'Someone else changed this allowance. Close it and open it again.'
            : e.detail
          : translate('GEN.UNAVAILABLE'),
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected walletStatus(s: string) {
    return s === 'ACTIVE' ? 'Active' : s === 'SUSPENDED' ? 'Suspended' : 'Inactive';
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  /** An amount: numbers only, in the box too (client 2026-10-14). */
  protected money(e: Event) {
    return cleanTyped(e.target as HTMLInputElement, amountText);
  }
  protected inr(m: Money) {
    return inrText(m);
  }
  protected date(v: string) {
    return formatDate(v);
  }
  /** The wallet number grouped as the card shows it (565656 000000123). */
  protected wallet(no: string) {
    return no.length > 6 ? `${no.slice(0, 6)} ${no.slice(6)}` : no;
  }
}
