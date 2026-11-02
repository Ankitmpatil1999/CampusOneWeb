import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { HBars, type HBarItem } from '../../../Shared/Charts';
import { Icon } from '../../../Shared/Icon';
import { Modal } from '../../../Shared/Overlays';
import type { XiColumn, XiComparison, XiDrill } from './crossinst.api';
import { readable, shortRange, valueText } from './xi-format';

const BREAKDOWNS: readonly { k: string; l: string; unit: 'count' | 'paise' | 'percent' }[] = [
  { k: 'membersByType', l: 'Active members by type', unit: 'count' },
  { k: 'attendanceByClass', l: 'Student attendance by class', unit: 'percent' },
  { k: 'feesByStatus', l: 'Fees falling due by status', unit: 'paise' },
  { k: 'dispatchesByKind', l: 'Messages sent by kind', unit: 'count' },
  { k: 'ticketsByStatus', l: 'Tickets raised by status', unit: 'count' },
];

/**
 * A drill-through (prototype ob.xi.drill.go; RPT-010): one institution of a comparison, recorded as
 * its own access — the comparison's figures and their breakdowns by type, class, status and kind,
 * still aggregated.
 */
@Component({
  selector: 'rp-xi-drill',
  imports: [HBars, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="d().institution.name + ' · drill-through'"
      [sub]="periodLabel() + ' · ' + range() + ' · aggregated figures'"
      icon="globe"
      [drawer]="true"
      [wide]="true"
      [foot]="false"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="xi-drill">
        <div class="note tone-brand">
          <rp-icon name="shieldck" [size]="17" />
          <div class="grow">
            Recorded as <b class="t-mono">{{ d().accessNo }}</b
            >, a separate access naming {{ d().institution.name }} (drill-through from
            {{ parent().accessNo }}). Figures are aggregated — no member or transaction is
            identifiable.
          </div>
        </div>
        <div class="c-grid k4 ob-mini">
          @for (c of tiles(); track c.key) {
            <div class="kpi" [attr.title]="c.definition">
              <span class="k-l">{{ c.label }}</span>
              <span class="k-v" style="font-size: 18px">
                @if (value(c) === '') {
                  <span class="ob-na"
                    ><rp-icon name="info" [size]="12" /> Not available for this period</span
                  >
                } @else {
                  {{ value(c) }}
                }
              </span>
            </div>
          }
        </div>
        @for (b of breakdowns(); track b.k) {
          <div class="fs">
            <h4><rp-icon name="chart" [size]="15" /> {{ b.l }}</h4>
            <div class="fs-b">
              @if (b.items.length) {
                <rp-hbars [items]="b.items" [fmt]="b.fmt" />
              } @else {
                <p class="t-sm t-muted" style="margin: 0">Nothing recorded in this period.</p>
              }
            </div>
          </div>
        }
      </div>
    </rp-modal>
  `,
})
export class DrillDrawer {
  readonly d = input.required<XiDrill>();
  readonly parent = input.required<XiComparison>();
  readonly periodLabel = input('');
  readonly closed = output<void>();

  protected readonly range = computed(() => shortRange(this.d().period.from, this.d().period.to));
  /** The comparison's columns, at most eight tiles. */
  protected readonly tiles = computed(() => this.parent().columns.slice(0, 8));
  protected readonly breakdowns = computed(() => {
    const got = this.d().figures.breakdowns;
    return BREAKDOWNS.filter((b) => got[b.k] !== undefined).map((b) => ({
      ...b,
      items: (got[b.k] ?? []).map<HBarItem>((x) => ({
        label: readable(x.label),
        value: x.value,
        ...(b.unit === 'percent' ? { max: 100 } : {}),
      })),
      fmt: (v: number) => valueText(v, b.unit),
    }));
  });

  protected value(c: XiColumn) {
    return valueText(this.d().figures.values[c.key], c.unit);
  }
}
