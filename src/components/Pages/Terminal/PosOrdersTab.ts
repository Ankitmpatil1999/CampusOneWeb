/** t.pos — the Orders tab (FR-PAY-06; MER-020, MER-007): today's orders, unpaid first. */
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Icon } from '../../Shared/Icon';
import { Overlays } from '../../Shared/Overlays';
import { formatInr, formatTime } from '../../Utils/format';
import { translate } from '../../Utils/translate';
import { PosState, itemsText, problemText } from './pos.state';
import { TerminalApi, paiseOf, type PosOrder } from './terminal.api';

const TONE: Record<string, string> = {
  Paid: 'ok',
  Pending: 'warn',
  Failed: 'bad',
  Cancelled: 'neutral',
  Queued: 'info',
  Posted: 'ok',
};

@Component({
  selector: 'rp-pos-orders',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="tm-orders">
    <div class="tm-kpis">
      <div class="tm-kpi">
        <span><rp-icon name="receipt" [size]="15" /> Orders today</span
        ><b class="t-num">{{ (sum()?.orders ?? 0) + s.localOrders().length }}</b>
      </div>
      <div class="tm-kpi">
        <span><rp-icon name="checkc" [size]="15" /> Collected</span
        ><b class="t-num">{{ inr(sum() ? paise(sum()!.collected) : 0) }}</b>
      </div>
      <div class="tm-kpi">
        <span><rp-icon name="clock" [size]="15" /> Unpaid</span
        ><b class="t-num">{{ unpaid().length }} · {{ inr0(unpaidPaise()) }}</b>
      </div>
      <div class="tm-kpi">
        <span><rp-icon name="cloudoff" [size]="15" /> Offline queue</span
        ><b class="t-num">{{ s.queued().length }}</b>
      </div>
    </div>
    <div class="tm-sec">
      <div class="tm-h">
        <rp-icon name="clock" [size]="14" /> Unpaid orders
        <span class="srs" title="SRS reference">FR-PAY-06</span>
      </div>
      @for (o of s.localOrders(); track o.localId) {
        <div class="tm-orow">
          <div class="tm-orow-m">
            <b
              ><span class="t-mono">{{ o.localId }}</span> · {{ time(o.at) }} ·
              {{ o.type === 'TAKEAWAY' ? 'Takeaway' : 'Dine-in' }}</b
            ><small class="t-clip">{{ items(o.lines) }}</small>
          </div>
          <b class="t-num tm-orow-t">{{ inr(o.total) }}</b>
          <span class="tm-orow-s"
            ><span class="chip dot tone-warn">Pending</span
            ><span class="tm-chip tm-warn"
              ><rp-icon name="cloudoff" [size]="11" /> offline</span
            ></span
          >
          <span class="tm-orow-a"><span class="tm-muted t-xs">Waiting to sync</span></span>
        </div>
      }
      @for (o of unpaid(); track o.id) {
        <div class="tm-orow">
          <div class="tm-orow-m">
            <b
              ><span class="t-mono">{{ o.number }}</span> · {{ time(o.createdAt) }} ·
              {{ o.type === 'TAKEAWAY' ? 'Takeaway' : 'Dine-in' }}</b
            ><small class="t-clip"
              >{{ items(o.lines)
              }}{{ o.lastFailureCode ? ' · ' + reason(o.lastFailureCode) : '' }}</small
            >
          </div>
          <b class="t-num tm-orow-t">{{ inr(paise(o.total)) }}</b>
          <span class="tm-orow-s"
            ><span class="chip dot" [class]="'tone-' + tone(o)">{{ label(o) }}</span></span
          >
          <span class="tm-orow-a">
            <button type="button" class="btn btn-accent btn-sm" (click)="s.startFlow(o)">
              <rp-icon name="nfc" [size]="15" /><span>Collect</span>
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-sm btn-icon"
              [attr.aria-label]="'Cancel order ' + o.number"
              (click)="cancel(o)"
            >
              <rp-icon name="x" [size]="15" />
            </button>
          </span>
        </div>
      }
      @if (!unpaid().length && !s.localOrders().length) {
        <div class="tm-empty">
          <rp-icon name="checkc" [size]="16" /><span
            >No unpaid orders. Everything has been collected.</span
          >
        </div>
      }
    </div>
    @if (s.queue().length) {
      <div class="tm-sec">
        <div class="tm-h">
          <rp-icon name="cloudoff" [size]="14" /> Offline captures
          <span class="tm-h-r">{{
            sum()?.lastSyncAt ? 'Last sync ' + time(sum()!.lastSyncAt) : ''
          }}</span>
        </div>
        @for (q of queueNewestFirst(); track q.captureKey) {
          <div class="tm-orow">
            <div class="tm-orow-m">
              <b
                ><span class="t-mono">{{ q.label }}</span> · {{ time(q.capturedAt) }}</b
              ><small
                >card {{ mask(q.cardToken) }} ·
                {{ q.instrument === 'ALLOWANCE' ? 'Allowance' : 'Wallet'
                }}{{ q.reference ? ' · ' + q.reference : ''
                }}{{ q.reason ? ' · ' + q.reason : '' }}</small
              >
            </div>
            <b class="t-num tm-orow-t">{{ inr(q.amountPaise) }}</b>
            <span class="tm-orow-s"
              ><span
                class="chip dot"
                [class]="
                  'tone-' + (q.status === 'Posted' ? 'ok' : q.status === 'Queued' ? 'info' : 'bad')
                "
                >{{ q.status }}</span
              ></span
            >
          </div>
        }
        @if (s.offline()) {
          <div class="note tone-info">
            <rp-icon name="cloudoff" [size]="17" />
            <div class="grow">Switch <b>Offline mode</b> off to send these captures.</div>
          </div>
        } @else if (s.queued().length) {
          <div>
            <button type="button" class="btn btn-sec btn-sm" (click)="s.startSync()">
              <rp-icon name="sync" [size]="15" /><span>Sync now</span>
            </button>
          </div>
        }
      </div>
    }
    <div class="tm-sec">
      <div class="tm-h"><rp-icon name="checkc" [size]="14" /> Paid today</div>
      @for (o of paid(); track o.id) {
        <div class="tm-orow">
          <div class="tm-orow-m">
            <b
              ><span class="t-mono">{{ o.number }}</span> · {{ time(o.createdAt) }} ·
              {{ o.type === 'TAKEAWAY' ? 'Takeaway' : 'Dine-in' }}</b
            ><small class="t-clip"
              >{{ items(o.lines) }}{{ o.payer ? ' · ' + o.payer.name : '' }}</small
            >
          </div>
          <b class="t-num tm-orow-t">{{ inr(paise(o.total)) }}</b>
          <span class="tm-orow-s"
            ><span class="chip dot tone-ok">Paid</span>
            @if (o.offline) {
              <span class="tm-chip tm-warn"><rp-icon name="cloudoff" [size]="11" /> offline</span>
            }
          </span>
          <span class="tm-orow-a"
            ><span class="t-mono t-xs tm-muted">{{
              o.reference ?? (o.instrument === 'COUPON' ? 'Coupon' : '')
            }}</span></span
          >
        </div>
      } @empty {
        <div class="tm-empty">
          <rp-icon name="receipt" [size]="16" /><span>No paid orders yet today.</span>
        </div>
      }
    </div>
  </div>`,
})
export class PosOrdersTab {
  protected readonly s = inject(PosState);
  private readonly api = inject(TerminalApi);
  private readonly overlays = inject(Overlays);

  protected readonly sum = computed(() => this.s.orders()?.summary ?? null);
  protected readonly unpaid = computed(() =>
    (this.s.orders()?.items ?? []).filter((o) => o.status === 'CREATED'),
  );
  protected readonly paid = computed(() =>
    (this.s.orders()?.items ?? []).filter((o) => o.status === 'PAID'),
  );
  protected readonly unpaidPaise = computed(
    () =>
      this.unpaid().reduce((a, o) => a + paiseOf(o.total), 0) +
      this.s.localOrders().reduce((a, o) => a + o.total, 0),
  );
  protected readonly queueNewestFirst = computed(() => [...this.s.queue()].reverse());

  protected readonly inr = (p: number) => formatInr(p);
  protected readonly inr0 = (p: number) => formatInr(p).replace(/\.00$/, '');
  protected readonly paise = paiseOf;
  protected readonly items = itemsText;
  protected time(v: string | null) {
    return v ? formatTime(v) : '—';
  }
  protected mask(t: string) {
    return t.length > 5 ? `${t.slice(0, 3)}••${t.slice(-3)}` : t;
  }
  protected reason(code: string) {
    return translate(code);
  }
  protected label(o: PosOrder) {
    return o.payment === 'FAILED' ? 'Failed' : 'Pending';
  }
  protected tone(o: PosOrder) {
    return TONE[this.label(o)] ?? 'neutral';
  }

  protected async cancel(o: PosOrder) {
    const ok = await this.overlays.confirm({
      title: `Cancel order ${o.number}?`,
      text: `${itemsText(o.lines)} · ${formatInr(paiseOf(o.total))}. The order won't be charged and can't be collected afterwards.`,
      ok: 'Cancel order',
      cancel: 'Keep order',
      tone: 'bad',
    });
    if (!ok) return;
    try {
      await this.api.cancelOrder(o.id);
      this.overlays.toast(`Order ${o.number} cancelled`, { tone: 'info' });
      await this.s.refreshOrders();
    } catch (e) {
      this.overlays.toast(problemText(e), { tone: 'bad' });
    }
  }
}
