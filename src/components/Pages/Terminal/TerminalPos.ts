/**
 * t.pos — the canteen point of sale (FR-PAY-03/04/06, FR-MER-03/04, BR-15; SRS 12.8–12.10, 9.10;
 * prototype t.pos): the counter (menu tiles, cart, order type, totals priced as the server prices
 * them), collecting an order by card tap against a one-time request, the day's orders, the menu and
 * the operator tags. Offline, orders and card taps stay on the counter and are sent once later.
 *
 * The prototype's "Simulate a card tap" panel is its demo; a counter has a card reader instead, which
 * types the card's token into the reader field (keyboard-wedge NFC readers do exactly that).
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
  type OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { Countdown } from '../../Shared/Countdown';
import { Icon } from '../../Shared/Icon';
import { Overlays } from '../../Shared/Overlays';
import { formatTime } from '../../Utils/format';
import { translate } from '../../Utils/translate';
import { PosMenuTab } from './PosMenuTab';
import { PosOrdersTab } from './PosOrdersTab';
import { PosTagsTab } from './PosTagsTab';
import { PosState, problemText, type Tab } from './pos.state';
import { TerminalApi, paiseOf, type Instrument } from './terminal.api';
import { TerminalDevice } from './terminal.device';
import { PURPOSES, TapZone, TermBar, TermMark } from './TerminalChrome';
import { avColor, initialsOf, inr, inr0, maskCard } from './terminal.format';
import { cardReader, ensureCardReader, watchCards } from '../../Utils/card-reader';
import { ReaderLaunch } from '../../Shared/ReaderLaunch';

const INST: Record<Instrument, { label: string; icon: 'wallet' | 'gift' | 'ticket'; sub: string }> =
  {
    WALLET: { label: 'Wallet', icon: 'wallet', sub: 'Campus wallet · most payments' },
    ALLOWANCE: { label: 'Allowance', icon: 'gift', sub: 'Allowance wallet · daily limits apply' },
    COUPON: { label: 'Coupon', icon: 'ticket', sub: "Today's meal-slot coupon covers the order" },
  };

@Component({
  selector: 'rp-terminal-pos',
  imports: [
    Countdown,
    Icon,
    PosMenuTab,
    PosOrdersTab,
    PosTagsTab,
    ReaderLaunch,
    TapZone,
    TermBar,
    TermMark,
  ],
  providers: [PosState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: flex; flex-direction: column; flex: 1; min-height: 0' },
  template: `<div class="tm-root tm-pos" [class.is-off]="s.offline()">
    <rp-term-bar
      icon="store"
      [name]="menu()?.terminal?.name ?? cfgName()"
      [sub]="barSub()"
      [purpose]="pos.label"
      [online]="!s.offline()"
      [signout]="true"
      (signedOut)="signOut()"
    >
      @if (s.queued().length) {
        <span class="tm-qbadge"
          ><rp-icon name="cloudoff" [size]="13" /><span>{{ s.queued().length }} offline</span></span
        >
      }
      <button
        type="button"
        class="tm-offbtn"
        role="switch"
        [attr.aria-checked]="s.forcedOffline()"
        title="Keep orders and card taps on this counter while the connection is unreliable"
        (click)="s.setOffline(!s.forcedOffline())"
      >
        <span class="tm-sw" aria-hidden="true"></span><span>Offline mode</span>
      </button>
    </rp-term-bar>
    <div class="tm-tabs">
      <nav class="tm-tabs-l" aria-label="Point of sale">
        @for (t of tabs; track t.k) {
          <button
            type="button"
            class="tm-tab"
            [class.on]="s.tab() === t.k"
            [id]="'tm-tab-' + t.k"
            (click)="s.tab.set(t.k)"
          >
            <rp-icon [name]="t.icon" [size]="15" /><span>{{ t.label }}</span>
            @if (t.k === 'counter' && s.flow()) {
              <i>•</i>
            }
            @if (t.k === 'orders' && unpaid()) {
              <i>{{ unpaid() }}</i>
            }
          </button>
        }
      </nav>
      <span class="tm-opr">
        @if (menu()?.operator; as op) {
          <span class="av xs" [style.--av]="avColor(op.name)" aria-hidden="true">{{
            initialsOf(op.name)
          }}</span>
          <span class="t-clip"
            >Operator <b>{{ op.name }}</b> · since {{ time(op.since) }}</span
          >
        } @else {
          No operator signed in
        }
      </span>
    </div>
    @if (s.offline()) {
      <div class="tm-offbar">
        <rp-icon name="cloudoff" [size]="15" /><span
          ><b>Offline.</b> Orders and card taps are stored on this counter and sent once when the
          connection returns.</span
        >
      </div>
    }
    <div class="term-body tm-pbody">
      @if (s.loadError()) {
        <div class="tm-empty" style="margin: 24px">
          <rp-icon name="alertc" [size]="16" /><span>{{ s.loadError() }}</span>
          <button type="button" class="tm-link" (click)="s.load()">Try again</button>
        </div>
      } @else if (!menu()) {
        <div class="tm-empty" style="margin: 24px">
          <rp-icon name="sync" [size]="16" /><span>Loading the menu…</span>
        </div>
      } @else {
        @switch (s.tab()) {
          @case ('orders') {
            <rp-pos-orders />
          }
          @case ('menu') {
            <rp-pos-menu />
          }
          @case ('tags') {
            <rp-pos-tags />
          }
          @default {
            @if (s.flow(); as f) {
              <div class="tm-collect">
                <section class="tm-col-main">
                  <div class="tm-ord-h">
                    <button type="button" class="tm-link" (click)="back()">
                      <rp-icon name="arrowl" [size]="14" /> Counter
                    </button>
                    <div class="grow">
                      <div class="eyebrow">Collect payment · {{ typeLabel(f.order.type) }}</div>
                      <h2>
                        <span class="t-mono">{{ f.order.number }}</span> ·
                        <span class="t-num">{{ inr(f.order.total) }}</span>
                      </h2>
                      <p class="t-clip">{{ f.order.items }}</p>
                    </div>
                    <span class="chip dot" [class]="'tone-' + statusTone()">{{
                      statusLabel()
                    }}</span>
                  </div>
                  @switch (f.stage) {
                    @case ('instrument') {
                      <div class="tm-inst-h">How is the student paying?</div>
                      <div class="tm-insts">
                        @for (k of instruments; track k) {
                          <button
                            type="button"
                            class="tm-inst"
                            [id]="'tm-inst-' + k"
                            [disabled]="(s.offline() && k === 'COUPON') || s.busy()"
                            [attr.title]="
                              s.offline() && k === 'COUPON'
                                ? 'Coupons need a connection to check today’s coupon'
                                : null
                            "
                            (click)="choose(k)"
                          >
                            <span class="tm-inst-ic"
                              ><rp-icon [name]="inst[k].icon" [size]="26" /></span
                            ><b>{{ inst[k].label }}</b
                            ><small>{{
                              s.offline() && k === 'COUPON' ? 'Needs a connection' : inst[k].sub
                            }}</small>
                          </button>
                        }
                      </div>
                      @if (s.offline()) {
                        <div class="note tone-warn">
                          <rp-icon name="cloudoff" [size]="17" />
                          <div class="grow">
                            <b>Offline mode.</b> The card tap is stored on this counter and sent
                            once when the connection returns (FR-PAY-06).
                          </div>
                        </div>
                      } @else {
                        <div class="note tone-info">
                          <rp-icon name="shieldck" [size]="17" />
                          <div class="grow">
                            A payment request with a one-time nonce is created for this order. It's
                            valid for {{ ttlMinutes() }} and can be used once (BR-15).
                          </div>
                        </div>
                      }
                    }
                    @case ('waiting') {
                      @if (f.request; as r) {
                        <div class="tm-wait">
                          <div class="tm-wait-l">
                            <rp-countdown
                              [total]="r.ttlSeconds"
                              [left]="left()"
                              [size]="150"
                              [stroke]="8"
                              caption="to tap"
                            />
                          </div>
                          <div class="tm-wait-r">
                            <div class="eyebrow">
                              NFC payment request
                              <span class="srs" title="SRS reference">FR-PAY-04</span>
                            </div>
                            <div class="tm-amt t-num">{{ inr(f.order.total) }}</div>
                            <dl class="tm-idkv sm">
                              <div>
                                <dt>Request</dt>
                                <dd class="t-mono">{{ short(r.requestId) }}</dd>
                              </div>
                              <div>
                                <dt>One-time nonce</dt>
                                <dd class="t-mono tm-nonce">{{ nonceText(r.nonce) }}</dd>
                              </div>
                              <div>
                                <dt>Instrument</dt>
                                <dd>{{ inst[f.instrument!].label }}</dd>
                              </div>
                              <div>
                                <dt>Valid until</dt>
                                <dd>{{ time(r.expiresAt) }}</dd>
                              </div>
                            </dl>
                            <p class="tm-muted">
                              <rp-icon name="nfc" [size]="14" /> Waiting for a card tap…
                            </p>
                            <div class="row g8 wrap">
                              <button
                                type="button"
                                class="btn btn-sec btn-sm"
                                (click)="cancelRequest()"
                              >
                                <span>Cancel request</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      } @else {
                        <div class="tm-wait">
                          <div class="tm-wait-l">
                            <rp-tapzone
                              cls="tm-tz-md"
                              [icon]="s.offline() ? 'cloudoff' : 'ticket'"
                            />
                          </div>
                          <div class="tm-wait-r">
                            <div class="eyebrow">
                              {{ s.offline() ? 'Offline capture' : 'Coupon' }}
                            </div>
                            <div class="tm-amt t-num">
                              {{ s.offline() ? inr(f.order.total) : 'Coupon' }}
                            </div>
                            <dl class="tm-idkv sm">
                              <div>
                                <dt>Instrument</dt>
                                <dd>{{ inst[f.instrument!].label }}</dd>
                              </div>
                              <div>
                                <dt>{{ s.offline() ? 'Stored as' : 'Covers' }}</dt>
                                <dd>
                                  {{
                                    s.offline()
                                      ? 'Next offline capture on this counter'
                                      : "The holder's coupon usable now"
                                  }}
                                </dd>
                              </div>
                            </dl>
                            <p class="tm-muted">
                              {{
                                s.offline()
                                  ? 'Ask the student to tap their card. It is kept on this counter and sent when the connection returns — exactly once.'
                                  : 'Ask the student to tap their card.'
                              }}
                            </p>
                            <div class="row g8 wrap">
                              <button
                                type="button"
                                class="btn btn-sec btn-sm"
                                (click)="s.cancelRequest()"
                              >
                                <span>Change instrument</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      }
                    }
                    @case ('result') {
                      @if (f.result; as x) {
                        <div class="tm-pres" [class.tm-ok]="x.ok" [class.tm-bad]="!x.ok">
                          <rp-term-mark [tone]="x.ok ? 'ok' : 'bad'" />
                          <h2>
                            {{
                              x.ok
                                ? f.instrument === 'COUPON'
                                  ? 'Coupon redeemed'
                                  : 'Payment received'
                                : "Payment didn't go through"
                            }}
                          </h2>
                          @if (x.ok && x.collection; as c) {
                            <div class="tm-amt t-num">
                              {{ c.coupon ? c.coupon.type + ' coupon' : inr(f.order.total) }}
                            </div>
                            @if (c.order.payer; as p) {
                              <div class="tm-payer">
                                <span
                                  class="av lg"
                                  [style.--av]="avColor(p.name)"
                                  aria-hidden="true"
                                  >{{ initialsOf(p.name) }}</span
                                >
                                <div>
                                  <b>{{ p.name }}</b
                                  ><small>{{ inst[f.instrument!].label }} · NFC</small>
                                </div>
                              </div>
                            }
                            <dl class="tm-idkv sm">
                              <div>
                                <dt>Order</dt>
                                <dd class="t-mono">{{ c.order.number }}</dd>
                              </div>
                              <div>
                                <dt>Reference</dt>
                                <dd class="t-mono">{{ c.receipt?.reference ?? '—' }}</dd>
                              </div>
                              <div>
                                <dt>Instrument</dt>
                                <dd>{{ inst[f.instrument!].label }} · NFC</dd>
                              </div>
                              <div>
                                <dt>Paid at</dt>
                                <dd>{{ time(x.at) }}</dd>
                              </div>
                            </dl>
                          } @else {
                            <p class="tm-reason">{{ x.reason }}</p>
                            <p class="tm-muted">The order stays unpaid. No money moved.</p>
                          }
                          <div class="tm-pres-a">
                            @if (x.ok) {
                              <button
                                type="button"
                                class="btn btn-accent btn-lg"
                                (click)="newOrder()"
                              >
                                <rp-icon name="plus" [size]="17" /><span>New order</span>
                              </button>
                            } @else {
                              <button type="button" class="btn btn-accent btn-lg" (click)="retry()">
                                <rp-icon name="refresh" [size]="17" /><span>Try again</span>
                              </button>
                              <button
                                type="button"
                                class="btn btn-sec btn-lg"
                                (click)="s.cancelRequest()"
                              >
                                <span>Choose another instrument</span>
                              </button>
                            }
                          </div>
                        </div>
                      }
                    }
                    @case ('queued') {
                      <div class="tm-pres tm-warn">
                        <rp-term-mark tone="warn" icon="cloudoff" />
                        <h2>Stored on this counter</h2>
                        <div class="tm-amt t-num">{{ inr(f.order.total) }}</div>
                        <p class="tm-muted">
                          Card {{ maskCard(f.queued?.cardToken ?? '') }} was captured offline as
                          <b class="t-mono">{{ f.order.number }}</b
                          >. It will be sent once when the connection returns; the order stays
                          pending until then.
                        </p>
                        <div class="tm-pres-a">
                          <button type="button" class="btn btn-accent btn-lg" (click)="newOrder()">
                            <rp-icon name="plus" [size]="17" /><span>New order</span>
                          </button>
                        </div>
                      </div>
                    }
                    @case ('expired') {
                      <div class="tm-pres tm-warn">
                        <rp-term-mark tone="warn" icon="hourglass" />
                        <h2>Request expired</h2>
                        <p class="tm-muted">
                          Payment requests and their one-time nonce last {{ ttlMinutes() }}. No
                          money moved and the nonce can't be used again.
                        </p>
                        <div class="tm-pres-a">
                          <button type="button" class="btn btn-accent btn-lg" (click)="retry()">
                            <rp-icon name="refresh" [size]="17" /><span
                              >Start a new collection</span
                            >
                          </button>
                          <button
                            type="button"
                            class="btn btn-sec btn-lg"
                            (click)="s.cancelRequest()"
                          >
                            <span>Choose another instrument</span>
                          </button>
                        </div>
                      </div>
                    }
                  }
                </section>
                <aside class="tm-side">
                  <div class="tm-sim">
                    <div class="tm-h"><rp-icon name="nfc" [size]="14" /> Card reader</div>
                    @if (!reader()) {
                      <div style="margin-bottom: 12px">
                        <rp-reader-launch [block]="true" />
                      </div>
                    }
                    <p class="tm-hint">
                      {{
                        f.stage === 'waiting'
                          ? readerNote() ||
                            (reader()
                              ? 'Ask the student to tap their card on the reader. It is read on its own.'
                              : 'Ask the student to tap their card on the counter reader.')
                          : 'Start a collection to enable card taps.'
                      }}
                    </p>
                    <form class="tm-readin" (submit)="$event.preventDefault(); readCard()">
                      <div class="fld">
                        <label class="fld-l" for="tm-card">Card</label>
                        <div class="fld-in">
                          <input
                            id="tm-card"
                            autocomplete="off"
                            spellcheck="false"
                            placeholder="Tap a card — the reader types its token"
                            [disabled]="f.stage !== 'waiting' || s.busy()"
                            [value]="card()"
                            (input)="card.set(asValue($event))"
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        class="btn btn-sec btn-block"
                        [disabled]="f.stage !== 'waiting' || !card().trim() || s.busy()"
                      >
                        <rp-icon name="nfc" [size]="17" /><span>{{
                          s.busy() ? 'Reading…' : 'Read card'
                        }}</span>
                      </button>
                    </form>
                  </div>
                </aside>
              </div>
            } @else {
              <div class="tm-counter">
                <section class="tm-menu">
                  <div class="tm-cats" role="tablist">
                    <button
                      type="button"
                      role="tab"
                      class="tm-cat"
                      [class.on]="s.cat() === 'all'"
                      [attr.aria-selected]="s.cat() === 'all'"
                      (click)="s.cat.set('all')"
                    >
                      All<span>{{ availableCount() }}</span>
                    </button>
                    @for (c of menu()!.categories; track c.id) {
                      <button
                        type="button"
                        role="tab"
                        class="tm-cat"
                        [class.on]="s.cat() === c.id"
                        [attr.aria-selected]="s.cat() === c.id"
                        (click)="s.cat.set(c.id)"
                      >
                        {{ c.name }}<span>{{ availableIn(c.id) }}</span>
                      </button>
                    }
                  </div>
                  @if (shown().length) {
                    <div class="tm-grid">
                      @for (i of shown(); track i.id) {
                        <button
                          type="button"
                          class="tm-tile"
                          [class.off]="!i.available"
                          [class.in]="!!qtyOf(i.id)"
                          [disabled]="!i.available"
                          [title]="i.available ? 'Add ' + i.name : 'Not available today'"
                          (click)="s.add(i.id)"
                        >
                          <span class="tm-tile-c">{{ i.cat }}</span
                          ><span class="tm-tile-n">{{ i.name }}</span
                          ><span class="tm-tile-p t-num">{{ inr0(paise(i.price)) }}</span>
                          @if (!i.available) {
                            <span class="tm-tile-na">Not available</span>
                          } @else if (qtyOf(i.id)) {
                            <span class="tm-tile-q t-num">{{ qtyOf(i.id) }}</span>
                          } @else {
                            <span class="tm-tile-add"><rp-icon name="plus" [size]="16" /></span>
                          }
                        </button>
                      }
                    </div>
                  } @else {
                    <div class="tm-empty">
                      <rp-icon name="utensils" [size]="16" /><span
                        >No items in this category. Add some from the Menu tab.</span
                      >
                    </div>
                  }
                </section>
                <aside class="tm-cart" aria-label="Current order">
                  <div class="tm-h">
                    <rp-icon name="cart" [size]="14" /> Current order
                    @if (s.lines().length) {
                      <button type="button" class="tm-link tm-h-r" (click)="s.clear()">
                        Clear
                      </button>
                    }
                  </div>
                  <div class="tm-otype">
                    <button
                      type="button"
                      [class.on]="s.otype() === 'DINE_IN'"
                      (click)="s.otype.set('DINE_IN')"
                    >
                      Dine-in
                    </button>
                    <button
                      type="button"
                      [class.on]="s.otype() === 'TAKEAWAY'"
                      (click)="s.otype.set('TAKEAWAY')"
                    >
                      Takeaway
                    </button>
                  </div>
                  <div class="tm-lines">
                    @for (l of s.lines(); track l.id) {
                      <div class="tm-line">
                        <span class="grow"
                          ><b class="t-clip">{{ l.name }}</b
                          ><small>{{ inr0(l.unit) }} each</small></span
                        >
                        <span class="tm-qty"
                          ><button
                            type="button"
                            [attr.aria-label]="'One less ' + l.name"
                            (click)="s.qty(l.id, -1)"
                          >
                            <rp-icon name="minus" [size]="14" /></button
                          ><b class="t-num">{{ l.qty }}</b
                          ><button
                            type="button"
                            [attr.aria-label]="'One more ' + l.name"
                            (click)="s.qty(l.id, 1)"
                          >
                            <rp-icon name="plus" [size]="14" /></button
                        ></span>
                        <b class="t-num tm-line-a">{{ inr(l.unit * l.qty) }}</b>
                      </div>
                    } @empty {
                      <div class="tm-empty tm-empty-col">
                        <rp-icon name="cart" [size]="22" /><b>No items yet</b
                        ><span>Tap items on the menu to add them.</span>
                      </div>
                    }
                  </div>
                  <div class="tm-tot">
                    <div>
                      <span>Subtotal</span><b class="t-num">{{ inr(s.totals().sub) }}</b>
                    </div>
                    <div>
                      <span>{{ s.totals().gstLabel }}</span
                      ><b class="t-num">{{ inr(s.totals().tax) }}</b>
                    </div>
                    <div class="big">
                      <span>Total</span><b class="t-num">{{ inr(s.totals().total) }}</b>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="btn btn-accent btn-lg btn-block"
                    id="tm-order"
                    [disabled]="!s.lines().length || s.busy() || !menu()?.operator"
                    [title]="s.lines().length ? '' : 'Add at least one item first'"
                    (click)="createOrder()"
                  >
                    <span>{{
                      s.lines().length ? 'Create order · ' + inr(s.totals().total) : 'Create order'
                    }}</span>
                  </button>
                </aside>
              </div>
            }
          }
        }
      }
    </div>
    @if (s.sync(); as y) {
      <div class="tm-sync-ov">
        <div class="tm-sync" role="dialog" aria-label="Sync offline captures">
          <div class="tm-sync-h">
            <span class="tm-sync-ic" [class.spin]="!syncDone()"
              ><rp-icon [name]="syncDone() ? 'checkc' : 'sync'" [size]="22"
            /></span>
            <div class="grow">
              <h2>{{ syncDone() ? 'Sync complete' : 'Sending offline captures' }}</h2>
              <p>{{ syncLine() }}</p>
            </div>
          </div>
          <div class="bar" [class.ok]="syncDone()">
            <i [style.width.%]="syncPct()"></i>
          </div>
          <div class="tm-sync-l">
            @for (id of y.ids; track id; let i = $index) {
              <div class="tm-sync-r" [class]="rowState(id, i)">
                <span class="tm-sync-d">
                  @switch (rowState(id, i)) {
                    @case ('run') {
                      <i class="tm-spin"></i>
                    }
                    @case ('ok') {
                      <rp-icon name="check" [size]="13" [stroke]="3" />
                    }
                    @case ('ack') {
                      <rp-icon name="copy" [size]="12" />
                    }
                    @case ('bad') {
                      <rp-icon name="x" [size]="13" [stroke]="3" />
                    }
                  }
                </span>
                <span class="grow"
                  ><b
                    ><span class="t-mono">{{ captureOf(id)?.label }}</span> ·
                    {{ inr(captureOf(id)?.amountPaise ?? 0) }}</b
                  ><small>{{
                    i < y.shown && y.out[id]
                      ? y.out[id]!.text
                      : 'Captured ' +
                        time(captureOf(id)?.capturedAt ?? null) +
                        ' · card ' +
                        maskCard(captureOf(id)?.cardToken ?? '')
                  }}</small></span
                >
              </div>
            }
          </div>
          @if (syncDone()) {
            <div class="tm-sync-f">
              <button type="button" class="btn btn-accent" (click)="s.closeSync()">
                <span>Done</span>
              </button>
            </div>
          }
        </div>
      </div>
    }
  </div>`,
})
export class TerminalPos implements OnInit {
  protected readonly s = inject(PosState);
  private readonly device = inject(TerminalDevice);
  private readonly api = inject(TerminalApi);
  private readonly router = inject(Router);
  private readonly overlays = inject(Overlays);

  protected readonly pos = PURPOSES.POS;
  protected readonly inst = INST;
  protected readonly instruments: readonly Instrument[] = ['WALLET', 'ALLOWANCE', 'COUPON'];
  protected readonly tabs: readonly {
    k: Tab;
    label: string;
    icon: 'cart' | 'receipt' | 'utensils' | 'key';
  }[] = [
    { k: 'counter', label: 'Counter', icon: 'cart' },
    { k: 'orders', label: 'Orders', icon: 'receipt' },
    { k: 'menu', label: 'Menu', icon: 'utensils' },
    { k: 'tags', label: 'Operator tags', icon: 'key' },
  ];
  protected readonly menu = this.s.menu;
  protected readonly card = signal('');
  /** CampusOne Card Reader is running on this computer (client 2026-10-08). */
  protected readonly reader = cardReader();
  protected readonly readerNote = signal('');
  private readonly destroyRef = inject(DestroyRef);
  protected readonly now = signal(Date.now());
  protected readonly inr = inr;
  protected readonly inr0 = inr0;
  protected readonly avColor = avColor;
  protected readonly initialsOf = initialsOf;
  protected readonly paise = paiseOf;

  protected readonly cfgName = computed(
    () => this.device.config()?.terminal.name ?? 'Point of sale',
  );
  protected readonly barSub = computed(() => {
    const c = this.device.config();
    return [c?.terminal.location, this.menu()?.outlet.name ?? c?.merchant]
      .filter(Boolean)
      .join(' · ');
  });
  protected readonly unpaid = computed(
    () => (this.s.orders()?.summary.unpaid.count ?? 0) + this.s.localOrders().length,
  );
  protected readonly shown = computed(() =>
    this.s.items().filter((i) => this.s.cat() === 'all' || i.categoryId === this.s.cat()),
  );
  protected readonly availableCount = computed(
    () => this.s.items().filter((i) => i.available).length,
  );
  protected readonly left = computed(() => {
    const r = this.s.flow()?.request;
    return r ? Math.max(0, Math.round((Date.parse(r.expiresAt) - this.now()) / 1000)) : 0;
  });
  protected readonly ttlMinutes = computed(() => {
    const sec = this.s.flow()?.request?.ttlSeconds ?? 120;
    return sec % 60 ? `${sec} seconds` : `${sec / 60} minute${sec === 60 ? '' : 's'}`;
  });
  protected readonly statusLabel = computed(() => {
    const f = this.s.flow();
    if (!f) return '';
    if (f.result?.ok) return 'Paid';
    if (f.result && !f.result.ok) return 'Failed';
    return 'Pending';
  });
  protected readonly statusTone = computed(() =>
    this.statusLabel() === 'Paid' ? 'ok' : this.statusLabel() === 'Failed' ? 'bad' : 'warn',
  );
  protected readonly syncDone = computed(() => {
    const y = this.s.sync();
    return !!y && y.shown >= y.ids.length && Object.keys(y.out).length > 0;
  });
  protected readonly syncPct = computed(() => {
    const y = this.s.sync();
    return y ? Math.round((100 * Math.min(y.shown, y.ids.length)) / Math.max(1, y.ids.length)) : 0;
  });
  protected readonly syncLine = computed(() => {
    const y = this.s.sync();
    if (!y) return '';
    if (!this.syncDone()) return `${Math.min(y.shown, y.ids.length)} of ${y.ids.length} sent`;
    const vals = Object.values(y.out);
    const n = (k: string) => vals.filter((v) => v.kind === k).length;
    return `${n('ok')} posted · ${n('ack')} already synced (acknowledged, not duplicated) · ${n('bad')} failed`;
  });

  constructor() {
    const tick = setInterval(() => {
      this.now.set(Date.now());
      const f = this.s.flow();
      if (f?.stage === 'waiting' && f.request && this.left() <= 0) this.s.expire();
      const y = this.s.sync();
      if (y && Object.keys(y.out).length && y.shown < y.ids.length)
        this.s.sync.set({ ...y, shown: y.shown + 1 });
    }, 700);
    inject(DestroyRef).onDestroy(() => clearInterval(tick));
  }

  async ngOnInit() {
    if (this.device.signedOut || !(await this.device.paired())) {
      await this.router.navigateByUrl('/terminal');
      return;
    }
    await this.s.load();
    const m = this.menu();
    if (m && !m.operator) {
      const tags = await this.api.tags().catch(() => ({ items: [] }));
      if (tags.items.some((t) => t.status === 'ACTIVE')) {
        await this.router.navigateByUrl('/terminal');
        return;
      }
      // No operator tag yet: the first one is registered here (MER-011).
      this.s.tab.set('tags');
    }
    // CampusOne Card Reader reads the card while a collection waits for a tap.
    const watch = watchCards(
      async (token) => {
        this.readerNote.set('');
        if (this.s.flow()?.stage !== 'waiting' || this.s.busy()) return;
        this.card.set(token);
        await this.readCard();
      },
      { onProblem: (m) => this.readerNote.set(m) },
    );
    this.destroyRef.onDestroy(() => watch.stop());
  }

  protected time(v: string | null) {
    return v ? formatTime(v) : '—';
  }
  protected typeLabel(t: string) {
    return t === 'TAKEAWAY' ? 'Takeaway' : 'Dine-in';
  }
  protected short(id: string) {
    return id.replace(/-/g, '').slice(-10).toUpperCase();
  }
  protected nonceText(n: string) {
    const s = n
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 8)
      .toUpperCase();
    return `${s.slice(0, 4)} ${s.slice(4)}`;
  }
  protected readonly maskCard = maskCard;
  protected qtyOf(id: string) {
    return this.s.cart().get(id) ?? 0;
  }
  protected availableIn(catId: string) {
    return this.s.items().filter((i) => i.categoryId === catId && i.available).length;
  }
  protected captureOf(id: string) {
    return this.s.queue().find((q) => q.captureKey === id);
  }
  protected rowState(id: string, i: number) {
    const y = this.s.sync();
    if (!y) return 'wait';
    if (i < y.shown && y.out[id]) return y.out[id]!.kind;
    return i === y.shown ? 'run' : 'wait';
  }
  protected asValue(e: Event) {
    return (e.target as HTMLInputElement).value;
  }

  protected async createOrder() {
    try {
      const f = await this.s.createOrder();
      if (f)
        this.overlays.toast(`Order ${f.order.number} created`, {
          sub: `${inr(f.order.total)} · payment pending`,
        });
    } catch (e) {
      this.overlays.toast(problemText(e), { tone: 'bad' });
    }
  }

  protected async choose(k: Instrument) {
    // A card collection opens CampusOne Card Reader when it isn't running (client 2026-10-08).
    if (!this.reader()) void ensureCardReader();
    try {
      await this.s.choose(k);
      if (this.s.flow()?.request) {
        this.overlays.toast('Payment request created', {
          tone: 'info',
          sub: `nonce valid for ${this.ttlMinutes()}`,
        });
      }
      setTimeout(() => document.getElementById('tm-card')?.focus(), 0);
    } catch (e) {
      this.overlays.toast(problemText(e), { tone: 'bad' });
    }
  }

  protected async readCard() {
    const token = this.card();
    this.card.set('');
    const f = this.s.flow();
    await this.s.tap(token);
    const after = this.s.flow();
    if (after?.stage === 'queued') {
      this.overlays.toast('Tap stored offline', {
        tone: 'info',
        sub: 'sent when the connection returns',
      });
    } else if (after?.result?.ok && f) {
      const c = after.result.collection;
      this.overlays.toast(c?.coupon ? 'Coupon redeemed' : `${inr(f.order.total)} received`, {
        sub: `${c?.order.payer?.name ?? ''} · ${f.order.number}`,
      });
    }
  }

  protected async cancelRequest() {
    const ok = await this.overlays.confirm({
      title: 'Cancel this payment request?',
      text: 'The nonce is discarded and the order stays unpaid. You can start a new collection straight away.',
      ok: 'Cancel request',
      cancel: 'Keep waiting',
      tone: 'warn',
    });
    if (ok) await this.s.cancelRequest();
  }

  protected async retry() {
    const f = this.s.flow();
    if (!f?.instrument) return;
    this.s.flow.set({ ...f, stage: 'instrument', result: undefined, request: undefined });
    await this.choose(f.instrument);
  }

  protected async back() {
    const f = this.s.flow();
    if (f?.stage === 'waiting' && f.request) {
      await this.s.cancelRequest();
      this.overlays.toast('Request cancelled — the order stays unpaid', {
        tone: 'info',
        sub: 'Collect it later from Orders',
      });
    }
    this.s.flow.set(null);
  }

  protected newOrder() {
    this.s.flow.set(null);
    this.s.tab.set('counter');
  }

  protected async signOut() {
    const ok = await this.overlays.confirm({
      title: 'Sign out of this terminal?',
      text: 'The counter stops taking orders and card taps until an operator signs in again.',
      ok: 'Sign out',
      tone: 'warn',
      icon: 'logout',
    });
    if (!ok) return;
    await this.api.operatorSignOut().catch(() => undefined);
    this.device.signOut();
    this.overlays.toast('Terminal signed out', { tone: 'info', sub: this.cfgName() });
    await this.router.navigateByUrl('/terminal');
  }

  protected readonly translate = translate;
}
