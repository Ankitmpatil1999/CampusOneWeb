/**
 * A merchant's collections on the web (client 2026-10-13; PAY-014): every payment received, newest
 * first, by date range and status, with the total of what matches.
 */
import { ChangeDetectionStrategy, Component, type OnInit, inject, signal } from '@angular/core';
import { Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { Amount, inrText } from '../../../Shared/Amount';
import { Icon } from '../../../Shared/Icon';
import { formatDate, formatTime } from '../../../Utils/format';
import { translate } from '../../../Utils/translate';
import { addDays, num, problemText, today } from '../Structure/academic-format';
import {
  BusinessApi,
  type Collection,
  type CollectionStatus,
  type Collections,
} from './business.api';

type Pill = '' | CollectionStatus;

const PILLS: readonly { v: Pill; l: string }[] = [
  { v: '', l: 'All' },
  { v: 'SUCCESS', l: 'Paid' },
  { v: 'PENDING', l: 'Pending' },
  { v: 'FAILURE', l: 'Failed' },
];

const STATUS: Readonly<Record<CollectionStatus, { l: string; tone: string }>> = {
  SUCCESS: { l: 'Paid', tone: 'ok' },
  PENDING: { l: 'Pending', tone: 'warn' },
  FAILURE: { l: 'Failed', tone: 'bad' },
};

const CHANNEL: Readonly<Record<string, string>> = {
  QR: 'QR code',
  STATIC_QR: 'QR code',
  DYNAMIC_QR: 'Dynamic QR',
  NFC: 'Campus card',
  POS: 'Point of sale',
  TERMINAL: 'Terminal',
};

@Component({
  selector: 'rp-business-collections',
  imports: [Amount, Empty, Icon, Kpi, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="c-page">
    <rp-page-head title="Collections" sub="Every payment to you, newest first." />

    <div class="c-filters">
      <div class="fld-in" style="width: 170px">
        <input
          id="bl-from"
          type="date"
          aria-label="From"
          [max]="to()"
          [value]="from()"
          (change)="setFrom($event)"
        />
      </div>
      <div class="fld-in" style="width: 170px">
        <input
          id="bl-to"
          type="date"
          aria-label="To"
          [min]="from()"
          [max]="todayDate"
          [value]="to()"
          (change)="setTo($event)"
        />
      </div>
      <div class="pills" role="group" aria-label="Status">
        @for (p of pills; track p.v) {
          <button
            type="button"
            class="pill"
            [id]="'bl-st-' + (p.v || 'all').toLowerCase()"
            [class.on]="status() === p.v"
            [attr.aria-pressed]="status() === p.v"
            (click)="setStatus(p.v)"
          >
            {{ p.l }}
          </button>
        }
      </div>
    </div>

    @if (error()) {
      <div class="note tone-bad" role="alert" id="bl-error">
        <rp-icon name="alert" [size]="17" />
        <div class="grow">{{ error() }}</div>
        <button type="button" class="btn btn-sec btn-sm" (click)="load()">Try again</button>
      </div>
    } @else if (!data()) {
      <div class="card pad"><div class="sk" style="height: 260px; border-radius: 16px"></div></div>
    } @else if (data(); as d) {
      <div class="c-grid k2" id="bl-totals">
        <rp-kpi label="Total" [value]="inr(d.totals.amount)" icon="rupee" tone="ok" />
        <rp-kpi label="Payments" [value]="num(d.totals.count)" icon="receipt" />
      </div>
      <div class="tbl-wrap">
        <table class="tbl" id="bl-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Payer</th>
              <th>Reference</th>
              <th>How</th>
              <th class="r">Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            @for (c of items(); track c.id) {
              <tr>
                <td>
                  {{ formatDate(c.at) }}
                  <div class="cell-s">{{ formatTime(c.at) }}</div>
                </td>
                <td>{{ c.payer }}</td>
                <td class="t-mono t-xs">{{ c.reference }}</td>
                <td>{{ channel(c.channel) }}</td>
                <td class="r"><rp-amt [value]="c.amount" /></td>
                <td>
                  <span class="chip dot" [class]="'chip dot tone-' + statusOf(c).tone">{{
                    statusOf(c).l
                  }}</span>
                  @if (c.failureCode) {
                    <div class="cell-s">{{ failure(c.failureCode) }}</div>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="6">
                  <rp-empty
                    icon="receipt"
                    title="No payments in these dates"
                    text="Try a wider date range or another status."
                  />
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      @if (d.nextCursor) {
        <div class="row" style="justify-content: center">
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            id="bl-more"
            [class.is-busy]="loading()"
            [disabled]="loading()"
            (click)="load(true)"
          >
            <span>Show older payments</span>
          </button>
        </div>
      }
    }
  </div>`,
})
export class BusinessCollections implements OnInit {
  private readonly api = inject(BusinessApi);
  protected readonly pills = PILLS;
  protected readonly num = num;
  protected readonly inr = inrText;
  protected readonly formatDate = formatDate;
  protected readonly formatTime = formatTime;
  protected readonly todayDate = today();
  protected readonly from = signal(addDays(today(), -29));
  protected readonly to = signal(today());
  protected readonly status = signal<Pill>('');
  protected readonly data = signal<Collections | null>(null);
  protected readonly items = signal<readonly Collection[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  private seq = 0;

  ngOnInit() {
    void this.load();
  }

  protected setFrom(e: Event) {
    this.from.set((e.target as HTMLInputElement).value);
    void this.load();
  }
  protected setTo(e: Event) {
    this.to.set((e.target as HTMLInputElement).value);
    void this.load();
  }
  protected setStatus(p: Pill) {
    this.status.set(p);
    void this.load();
  }

  async load(more = false) {
    const id = ++this.seq;
    this.loading.set(true);
    try {
      const d = await this.api.collections({
        from: this.from(),
        to: this.to(),
        status: this.status() || null,
        cursor: more ? this.data()?.nextCursor : null,
      });
      if (id !== this.seq) return;
      this.items.set(more ? [...this.items(), ...d.items] : d.items);
      this.data.set(d);
      this.error.set('');
    } catch (e) {
      if (id === this.seq) this.error.set(problemText(e));
    } finally {
      if (id === this.seq) this.loading.set(false);
    }
  }

  protected statusOf(c: Collection) {
    return STATUS[c.status];
  }
  protected channel(c: string) {
    return (
      CHANNEL[c] ??
      c
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/^./, (x) => x.toUpperCase())
    );
  }
  protected failure(code: string) {
    return translate(code);
  }
}
