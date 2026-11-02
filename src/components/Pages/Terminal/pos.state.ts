/**
 * The point of sale's state (prototype t.pos; SRS 12.8–12.10, 9.10): the menu and the cart, the
 * collection flow of one order (instrument → one-time NFC request → card tap → result), the day's
 * orders, and the offline queue. While offline, orders are kept on the counter and each card tap is
 * stored as a capture signed with the device key; when the connection returns they are sent once as
 * a batch (each capture is posted at most once on the server, so a re-send changes nothing).
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiProblem } from '../../Utils/problem';
import { translate } from '../../Utils/translate';
import {
  TerminalApi,
  money,
  paiseOf,
  priceLine,
  type Instrument,
  type OrderType,
  type PosBatch,
  type PosCollection,
  type PosMenu,
  type PosOrder,
  type PosOrders,
  type PosRequest,
} from './terminal.api';
import { TerminalDevice } from './terminal.device';
import { newUuid } from '../../Utils/ids';

export type Tab = 'counter' | 'orders' | 'menu' | 'tags';
export type Stage = 'instrument' | 'waiting' | 'result' | 'queued' | 'expired';

/** An order made while offline: kept on the counter, priced as the server prices it. */
export interface LocalOrder {
  readonly localId: string;
  readonly type: OrderType;
  readonly lines: readonly { itemId: string; name: string; qty: number; unit: number }[];
  readonly subtotal: number;
  readonly tax: number;
  readonly total: number;
  readonly at: string;
}

/** One card tap stored on the counter while offline (12.10). */
export interface QueuedCapture {
  readonly captureKey: string;
  readonly orderId?: string;
  readonly order?: { type: OrderType; lines: { itemId: string; qty: number }[] };
  readonly localId?: string;
  readonly label: string;
  readonly items: string;
  readonly cardToken: string;
  readonly instrument: 'WALLET' | 'ALLOWANCE';
  readonly amountPaise: number;
  readonly capturedAt: string;
  readonly signature: string;
  status: 'Queued' | 'Posted' | 'Failed';
  reason?: string;
  reference?: string;
}

export interface Flow {
  readonly order: {
    id?: string;
    localId?: string;
    number: string;
    type: OrderType;
    items: string;
    total: number;
  };
  stage: Stage;
  instrument?: Instrument;
  request?: PosRequest;
  result?: {
    ok: boolean;
    reason?: string;
    collection?: PosCollection;
    at: string;
  };
  queued?: QueuedCapture;
}

export interface SyncState {
  readonly ids: readonly string[];
  shown: number;
  out: Record<string, { kind: 'ok' | 'ack' | 'bad'; text: string }>;
  done: boolean;
}

const QUEUE = 'rp_pos_queue';
const LOCAL = 'rp_pos_local_orders';
const read = <T>(k: string): T[] => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? '[]') as T[];
  } catch {
    return [];
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    // Private mode: the queue lives for this page only.
  }
};

export const itemsText = (lines: readonly { name: string; qty: number }[]) =>
  lines.map((l) => `${l.name}${l.qty > 1 ? ` ×${l.qty}` : ''}`).join(', ');
export const problemText = (e: unknown) =>
  e instanceof ApiProblem ? e.detail || translate(e.code, e.params) : translate('GEN.INTERNAL');

@Injectable()
export class PosState {
  private readonly api = inject(TerminalApi);
  private readonly device = inject(TerminalDevice);

  readonly tab = signal<Tab>('counter');
  readonly menu = signal<PosMenu | null>(null);
  readonly orders = signal<PosOrders | null>(null);
  readonly loadError = signal('');
  readonly cat = signal<string>('all');
  readonly cart = signal<ReadonlyMap<string, number>>(new Map());
  readonly otype = signal<OrderType>('DINE_IN');
  readonly flow = signal<Flow | null>(null);
  readonly busy = signal(false);
  /** Offline: switched on by the operator, or the browser lost the network. */
  readonly forcedOffline = signal(false);
  readonly netDown = signal(typeof navigator !== 'undefined' && !navigator.onLine);
  readonly offline = computed(() => this.forcedOffline() || this.netDown());
  readonly queue = signal<readonly QueuedCapture[]>(read<QueuedCapture>(QUEUE));
  readonly localOrders = signal<readonly LocalOrder[]>(read<LocalOrder>(LOCAL));
  readonly sync = signal<SyncState | null>(null);

  readonly items = computed(() =>
    (this.menu()?.categories ?? []).flatMap((c) => c.items.map((i) => ({ ...i, cat: c.name }))),
  );
  readonly queued = computed(() => this.queue().filter((q) => q.status === 'Queued'));

  /** The cart priced as the server will price it. */
  readonly lines = computed(() => {
    const inclusive = !!this.menu()?.pricesIncludeGst;
    return [...this.cart().entries()]
      .map(([id, qty]) => {
        const i = this.items().find((x) => x.id === id);
        if (!i) return null;
        const unit = paiseOf(i.price);
        return { ...i, qty, unit, ...priceLine(unit, qty, Math.round(i.gstRate * 100), inclusive) };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  });
  readonly totals = computed(() => {
    const ls = this.lines();
    const rates = [...new Set(ls.map((l) => l.gstRate))];
    return {
      sub: ls.reduce((a, l) => a + l.net, 0),
      tax: ls.reduce((a, l) => a + l.tax, 0),
      total: ls.reduce((a, l) => a + l.total, 0),
      gstLabel:
        rates.length === 1 ? `GST ${rates[0]}%` : `GST ${this.menu()?.defaultGstRate ?? 5}%`,
    };
  });

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.netDown.set(false);
        if (!this.forcedOffline()) void this.startSync();
      });
      window.addEventListener('offline', () => this.netDown.set(true));
    }
  }

  async load() {
    try {
      this.menu.set(await this.api.menu());
      this.loadError.set('');
      await this.refreshOrders();
    } catch (e) {
      this.loadError.set(problemText(e));
    }
  }

  async refreshOrders() {
    if (this.offline()) return;
    try {
      this.orders.set(await this.api.orders());
    } catch {
      // The counter keeps working; the list refreshes on the next change.
    }
  }

  // --- cart ---------------------------------------------------------------------------------------
  add(id: string) {
    const m = new Map(this.cart());
    m.set(id, (m.get(id) ?? 0) + 1);
    this.cart.set(m);
  }
  qty(id: string, d: number) {
    const m = new Map(this.cart());
    const q = Math.max(0, (m.get(id) ?? 0) + d);
    if (q) m.set(id, q);
    else m.delete(id);
    this.cart.set(m);
  }
  clear() {
    this.cart.set(new Map());
  }

  /** MER-006 online; offline the order is kept on the counter until the captures are sent. */
  async createOrder() {
    const ls = this.lines();
    if (!ls.length) return;
    this.busy.set(true);
    try {
      if (this.offline()) {
        const t = this.totals();
        const local: LocalOrder = {
          localId: `OFF-${String(this.localOrders().length + 1).padStart(4, '0')}-${Date.now().toString(36).slice(-4).toUpperCase()}`,
          type: this.otype(),
          lines: ls.map((l) => ({ itemId: l.id, name: l.name, qty: l.qty, unit: l.unit })),
          subtotal: t.sub,
          tax: t.tax,
          total: t.total,
          at: new Date().toISOString(),
        };
        this.localOrders.set([...this.localOrders(), local]);
        write(LOCAL, this.localOrders());
        this.flow.set({
          order: {
            localId: local.localId,
            number: local.localId,
            type: local.type,
            items: itemsText(local.lines),
            total: local.total,
          },
          stage: 'instrument',
        });
      } else {
        const o = await this.api.createOrder(
          this.otype(),
          ls.map((l) => ({ itemId: l.id, qty: l.qty })),
        );
        this.startFlow(o);
        void this.refreshOrders();
      }
      this.clear();
      this.tab.set('counter');
      return this.flow();
    } finally {
      this.busy.set(false);
    }
  }

  startFlow(o: PosOrder) {
    this.flow.set({
      order: {
        id: o.id,
        number: o.number,
        type: o.type,
        items: itemsText(o.lines),
        total: paiseOf(o.total),
      },
      stage: 'instrument',
    });
    this.tab.set('counter');
  }

  // --- collecting ---------------------------------------------------------------------------------
  /** MER-017: a one-time request; a coupon needs no request. Offline: wait for the tap. */
  async choose(instrument: Instrument) {
    const f = this.flow();
    if (!f) return;
    if (this.offline() || instrument === 'COUPON') {
      this.flow.set({ ...f, instrument, stage: 'waiting', request: undefined });
      return;
    }
    this.busy.set(true);
    try {
      const request = await this.api.createRequest(f.order.id!, instrument);
      this.flow.set({ ...f, instrument, request, stage: 'waiting' });
    } finally {
      this.busy.set(false);
    }
  }

  /** MER-018: the request goes; the order stays unpaid. */
  async cancelRequest() {
    const f = this.flow();
    if (f?.request && f.stage === 'waiting') {
      try {
        await this.api.cancelRequest(f.request.requestId);
      } catch {
        // Expired or used already: nothing to cancel.
      }
    }
    if (f) this.flow.set({ ...f, stage: 'instrument', request: undefined, result: undefined });
  }

  expire() {
    const f = this.flow();
    if (f?.stage === 'waiting' && f.request) this.flow.set({ ...f, stage: 'expired' });
  }

  /** A card read on the counter: collected now (MER-008), or stored for the sync (12.10). */
  async tap(cardToken: string) {
    const f = this.flow();
    if (!f || f.stage !== 'waiting' || !f.instrument) return;
    const token = cardToken.trim().toUpperCase();
    if (!token) return;
    if (this.offline()) return this.capture(f, token);
    this.busy.set(true);
    try {
      const out = await this.api.collect(f.order.id!, {
        instrument: f.instrument,
        cardToken: token,
        ...(f.request ? { requestId: f.request.requestId, nonce: f.request.nonce } : {}),
      });
      this.flow.set({
        ...f,
        stage: 'result',
        result: { ok: true, collection: out, at: new Date().toISOString() },
      });
    } catch (e) {
      this.flow.set({
        ...f,
        stage: 'result',
        result: { ok: false, reason: problemText(e), at: new Date().toISOString() },
      });
    } finally {
      this.busy.set(false);
      void this.refreshOrders();
    }
    return this.flow()?.result;
  }

  private async capture(f: Flow, cardToken: string) {
    const instrument = f.instrument === 'ALLOWANCE' ? 'ALLOWANCE' : 'WALLET';
    const captureKey = `OFF-${newUuid()}`;
    const capturedAt = new Date().toISOString();
    const local = f.order.localId
      ? this.localOrders().find((o) => o.localId === f.order.localId)
      : undefined;
    const message = `${captureKey}.${cardToken}.${f.order.total}.${f.order.id ?? ''}.${capturedAt}`;
    const q: QueuedCapture = {
      captureKey,
      ...(f.order.id ? { orderId: f.order.id } : {}),
      ...(local
        ? {
            order: {
              type: local.type,
              lines: local.lines.map((l) => ({ itemId: l.itemId, qty: l.qty })),
            },
            localId: local.localId,
          }
        : {}),
      label: f.order.number,
      items: f.order.items,
      cardToken,
      instrument,
      amountPaise: f.order.total,
      capturedAt,
      signature: await this.device.sign(message),
      status: 'Queued',
    };
    this.queue.set([...this.queue(), q]);
    write(QUEUE, this.queue());
    this.flow.set({ ...f, stage: 'queued', queued: q });
  }

  // --- offline sync (MER-009) ---------------------------------------------------------------------
  setOffline(off: boolean) {
    if (off) {
      const f = this.flow();
      if (f?.stage === 'waiting' && f.request) void this.cancelRequest();
      this.forcedOffline.set(true);
      return;
    }
    this.forcedOffline.set(false);
    const f = this.flow();
    if (f?.stage === 'waiting' && !f.request && f.instrument !== 'COUPON')
      this.flow.set({ ...f, stage: 'instrument' });
    if (!this.netDown()) void this.startSync();
  }

  async startSync(): Promise<PosBatch | null> {
    const pending = this.queued();
    if (!pending.length || this.offline()) {
      void this.refreshOrders();
      return null;
    }
    const s: SyncState = { ids: pending.map((q) => q.captureKey), shown: 0, out: {}, done: false };
    this.sync.set({ ...s });
    let batch: PosBatch;
    try {
      batch = await this.api.sync(
        newUuid(),
        pending.map((q) => ({
          captureKey: q.captureKey,
          ...(q.orderId ? { orderId: q.orderId } : {}),
          ...(q.order ? { order: q.order } : {}),
          cardToken: q.cardToken,
          instrument: q.instrument,
          amount: money(q.amountPaise),
          capturedAt: q.capturedAt,
          signature: q.signature,
        })),
      );
    } catch (e) {
      this.sync.set({
        ...s,
        done: true,
        out: Object.fromEntries(
          s.ids.map((id) => [id, { kind: 'bad' as const, text: problemText(e) }]),
        ),
      });
      return null;
    }
    const byKey = new Map(batch.captures.map((c) => [c.captureKey, c]));
    const next = this.queue().map((q) => {
      const c = byKey.get(q.captureKey);
      if (!c) return q;
      if (c.outcome === 'ACCEPTED')
        return { ...q, status: 'Posted' as const, reference: c.reference ?? undefined };
      if (c.outcome === 'REFUSED')
        return { ...q, status: 'Failed' as const, reason: c.code ? translate(c.code) : undefined };
      return q;
    });
    this.queue.set(next);
    write(QUEUE, next);
    const done = new Set(
      next
        .filter((q) => q.status !== 'Queued')
        .map((q) => q.localId)
        .filter(Boolean),
    );
    this.localOrders.set(this.localOrders().filter((o) => !done.has(o.localId)));
    write(LOCAL, this.localOrders());
    const out: SyncState['out'] = {};
    for (const id of s.ids) {
      const c = byKey.get(id);
      out[id] = !c
        ? { kind: 'bad', text: 'Not processed' }
        : c.replayed
          ? { kind: 'ack', text: 'Already synced — acknowledged, not duplicated' }
          : c.outcome === 'ACCEPTED'
            ? {
                kind: 'ok',
                text: `Posted · ${c.reference ?? ''}${c.order ? ` · ${c.order.number}` : ''}`,
              }
            : { kind: 'bad', text: c.code ? translate(c.code) : 'Refused' };
    }
    this.sync.set({ ...s, out });
    void this.refreshOrders();
    return batch;
  }

  /** Clears captures that are settled, keeping the day's history short. */
  closeSync() {
    this.sync.set(null);
    const f = this.flow();
    if (f?.stage === 'queued') this.flow.set(null);
  }
}
