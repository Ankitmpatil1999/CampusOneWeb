/**
 * A merchant's settlements on the web (client 2026-10-13; STL-012, STL-013): each day's settlement —
 * what was collected, the fee, adjustments and the net paid to the bank with its UTR — and, opened,
 * the transactions in it, including any carried forward from an earlier day.
 */
import {
  ChangeDetectionStrategy,
  Component,
  type OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { Amount, amountPaise } from '../../../Shared/Amount';
import { Icon } from '../../../Shared/Icon';
import { Modal } from '../../../Shared/Overlays';
import { formatDate, formatDateTime, formatInr } from '../../../Utils/format';
import { num, problemText } from '../Structure/academic-format';
import { BusinessApi, type Settlement, type SettlementDetail } from './business.api';

const tone = (s: Settlement) =>
  s.paidOut ? 'ok' : s.status === 'FAILED' || s.status === 'REJECTED' ? 'bad' : 'warn';

@Component({
  selector: 'rp-business-settlements',
  imports: [Amount, Empty, Icon, Kpi, Modal, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="c-page">
      <rp-page-head
        title="My settlements"
        sub="What was paid to your bank account, day by day, after the CampusOne fee."
      />

      @if (error()) {
        <div class="note tone-bad" role="alert" id="bs-error">
          <rp-icon name="alert" [size]="17" />
          <div class="grow">{{ error() }}</div>
          <button type="button" class="btn btn-sec btn-sm" (click)="load()">Try again</button>
        </div>
      } @else if (!items()) {
        <div class="card pad">
          <div class="sk" style="height: 260px; border-radius: 16px"></div>
        </div>
      } @else {
        <div class="c-grid k3" id="bs-kpis">
          <rp-kpi label="Paid to your bank" [value]="paidOut()" icon="bank" tone="ok" />
          <rp-kpi
            label="Not paid out yet"
            [value]="waiting()"
            icon="hourglass"
            [tone]="waitingCount() ? 'warn' : null"
            [delta]="num(waitingCount()) + ' settlement' + (waitingCount() === 1 ? '' : 's')"
          />
          <rp-kpi
            label="Settlements"
            [value]="num(items()!.length)"
            icon="layers"
            delta="Latest 100"
          />
        </div>
        <div class="tbl-wrap">
          <table class="tbl" id="bs-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Settlement</th>
                <th class="r">Collected</th>
                <th class="r">Fee</th>
                <th class="r">Adjustments</th>
                <th class="r">Net</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              @for (s of items(); track s.id) {
                <tr
                  tabindex="0"
                  [attr.aria-label]="'Settlement ' + s.settlementNo"
                  (click)="show(s)"
                  (keydown.enter)="show(s)"
                >
                  <td>{{ formatDate(s.date) }}</td>
                  <td>
                    <span class="t-mono t-xs">{{ s.settlementNo }}</span>
                    <div class="cell-s">
                      {{ s.lines }} transaction{{ s.lines === 1 ? '' : 's' }}
                    </div>
                  </td>
                  <td class="r"><rp-amt [value]="s.gross" /></td>
                  <td class="r"><rp-amt [value]="s.fee" /></td>
                  <td class="r"><rp-amt [value]="s.adjustments" /></td>
                  <td class="r"><rp-amt [value]="s.net" cls="t-b" /></td>
                  <td>
                    <span class="chip dot" [class]="'chip dot tone-' + tone(s)">{{
                      s.statusLabel
                    }}</span>
                    @if (s.paidOut?.utr) {
                      <div class="cell-s t-mono">UTR {{ s.paidOut!.utr }}</div>
                    }
                    @if (s.carriedForward) {
                      <div class="cell-s">Includes carried forward</div>
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="7">
                    <rp-empty
                      icon="bank"
                      title="No settlements yet"
                      text="Your collections are settled to your bank account each working day."
                    />
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    @if (open(); as s) {
      <rp-modal
        [title]="'Settlement ' + s.settlementNo"
        [sub]="formatDate(s.date) + ' · ' + s.statusLabel"
        icon="bank"
        [drawer]="true"
        (closed)="open.set(null)"
      >
        <div class="stack g16" id="bs-detail">
          <dl class="kv">
            <dt>Collected</dt>
            <dd><rp-amt [value]="s.gross" /></dd>
            <dt>CampusOne fee</dt>
            <dd><rp-amt [value]="s.fee" /></dd>
            <dt>Adjustments</dt>
            <dd><rp-amt [value]="s.adjustments" /></dd>
            <dt>Net to your bank</dt>
            <dd><rp-amt [value]="s.net" cls="t-b" /></dd>
            <dt>Paid out</dt>
            <dd>
              @if (s.paidOut; as p) {
                {{ p.at ? formatDateTime(p.at) : 'Yes' }}
                @if (p.utr) {
                  · UTR <span class="t-mono">{{ p.utr }}</span>
                }
              } @else {
                Not yet
              }
            </dd>
          </dl>
          @if (detailError()) {
            <div class="note tone-bad" role="alert">
              <rp-icon name="alertc" [size]="17" />
              <div class="grow">{{ detailError() }}</div>
            </div>
          } @else if (!detail()) {
            <div class="sk" style="height: 160px; border-radius: 12px"></div>
          } @else {
            <div class="tbl-wrap">
              <table class="tbl dense" id="bs-lines">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Reference</th>
                    <th class="r">Amount</th>
                    <th class="r">Fee</th>
                    <th class="r">Net</th>
                  </tr>
                </thead>
                <tbody>
                  @for (t of detail()!.transactions; track t.reference + t.at) {
                    <tr>
                      <td>{{ formatDateTime(t.at) }}</td>
                      <td>
                        <span class="t-mono t-xs">{{ t.reference }}</span>
                        @if (t.adjustment) {
                          <span class="tag">Adjustment</span>
                        }
                        @if (t.carried) {
                          <span class="tag">Carried forward</span>
                        }
                        @if (t.remarks) {
                          <div class="cell-s">{{ t.remarks }}</div>
                        }
                      </td>
                      <td class="r">
                        <rp-amt [value]="t.amount" [sign]="t.adjustment ? '−' : null" />
                      </td>
                      <td class="r"><rp-amt [value]="t.fee" /></td>
                      <td class="r">
                        <rp-amt [value]="t.net" [sign]="t.adjustment ? '−' : null" />
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
        <div modal-foot class="cc-foot">
          <span class="grow"></span>
          <button type="button" class="btn btn-sec" (click)="open.set(null)">
            <span>Close</span>
          </button>
        </div>
      </rp-modal>
    }`,
})
export class BusinessSettlements implements OnInit {
  private readonly api = inject(BusinessApi);
  protected readonly num = num;
  protected readonly tone = tone;
  protected readonly formatDate = formatDate;
  protected readonly formatDateTime = formatDateTime;
  protected readonly items = signal<readonly Settlement[] | null>(null);
  protected readonly error = signal('');
  protected readonly open = signal<Settlement | null>(null);
  protected readonly detail = signal<SettlementDetail | null>(null);
  protected readonly detailError = signal('');

  private readonly sum = (list: readonly Settlement[]) =>
    formatInr(list.reduce((n, s) => n + amountPaise(s.net), 0));
  protected readonly paidOut = computed(() =>
    this.sum((this.items() ?? []).filter((s) => !!s.paidOut)),
  );
  private readonly unpaid = computed(() => (this.items() ?? []).filter((s) => !s.paidOut));
  protected readonly waiting = computed(() => this.sum(this.unpaid()));
  protected readonly waitingCount = computed(() => this.unpaid().length);

  ngOnInit() {
    void this.load();
  }

  async load() {
    try {
      this.items.set((await this.api.settlements()).items);
      this.error.set('');
    } catch (e) {
      this.error.set(problemText(e));
    }
  }

  protected async show(s: Settlement) {
    this.open.set(s);
    this.detail.set(null);
    this.detailError.set('');
    try {
      const d = await this.api.settlement(s.id);
      if (this.open()?.id === s.id) this.detail.set(d);
    } catch (e) {
      if (this.open()?.id === s.id) this.detailError.set(problemText(e));
    }
  }
}
