/**
 * Pieces shared by the home variants (prototype HOME.*): the donut with its legend (ui.donut and
 * .cp-leg), the quick actions (.cp-qa), the alert rows (.cp-alert) and the collections chart of the
 * last ten days with the payment modes (read from the transactions report, one day per call).
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  type OnInit,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Card, Empty } from '../../../Shared/Blocks';
import { Bars } from '../../../Shared/Charts';
import { Icon } from '../../../Shared/Icon';
import type { IconName } from '../../../Utils/icons';
import { addDays, num, problemText } from '../Structure/academic-format';
import { HomeApi } from './home.api';
import { MODE_COLOURS, channelLabel, dayLabel, inr0, paise, pct } from './home-format';

export interface DonutPart {
  readonly l: string;
  readonly v: number;
  readonly c: string;
}

/** ui.donut beside its legend (.cp-donut): one arc per part with a 2 px gap. */
@Component({
  selector: 'rp-home-donut',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="cp-donut">
    <div class="ring" [style.width.px]="size()" [style.height.px]="size()">
      <svg [attr.width]="size()" [attr.height]="size()" role="img" [attr.aria-label]="aria()">
        <circle
          [attr.cx]="size() / 2"
          [attr.cy]="size() / 2"
          [attr.r]="r()"
          stroke="var(--surface-3)"
          [attr.stroke-width]="thick()"
        />
        @for (a of arcs(); track a.l; let i = $index) {
          <circle
            [attr.cx]="size() / 2"
            [attr.cy]="size() / 2"
            [attr.r]="r()"
            [attr.stroke]="a.c"
            [attr.stroke-width]="thick()"
            [attr.stroke-dasharray]="a.dash"
            [attr.stroke-dashoffset]="a.offset"
            [style.animation]="'fade .5s ' + i * 0.12 + 's both'"
          >
            <title>{{ a.l }}: {{ a.v }}</title>
          </circle>
        }
      </svg>
      <div class="ring-c">
        <div>
          <b class="t-num" style="font-size: 20px; display: block; font-family: var(--f-display)">{{
            num(total())
          }}</b>
          <small class="t-xs t-muted">{{ unit() }}</small>
        </div>
      </div>
    </div>
    <div class="cp-leg">
      @for (p of shown(); track p.l) {
        <div class="row between t-sm">
          <span class="row g8"><i class="cp-sw" [style.background]="p.c"></i>{{ p.l }}</span>
          <b class="t-num">{{ legend() === 'pct' ? share(p.v) : num(p.v) }}</b>
        </div>
      }
    </div>
  </div>`,
})
export class HomeDonut {
  readonly parts = input.required<readonly DonutPart[]>();
  readonly size = input(150);
  readonly thick = input(16);
  readonly unit = input('');
  readonly aria = input('Donut chart');
  /** pct: each part's share; count: its number (all parts listed). */
  readonly legend = input<'pct' | 'count'>('pct');
  protected readonly num = num;

  protected readonly r = computed(() => (this.size() - this.thick()) / 2);
  protected readonly total = computed(() => this.parts().reduce((s, p) => s + p.v, 0));
  protected readonly shown = computed(() =>
    this.legend() === 'pct' ? this.parts().filter((p) => p.v > 0) : this.parts(),
  );
  protected readonly arcs = computed(() => {
    const circ = 2 * Math.PI * this.r();
    const tot = this.total() || 1;
    let acc = 0;
    return this.parts()
      .filter((p) => p.v > 0)
      .map((p) => {
        const len = (circ * p.v) / tot;
        const out = { ...p, dash: `${Math.max(0, len - 2)} ${circ}`, offset: -acc };
        acc += len;
        return out;
      });
  });
  protected share(v: number) {
    return pct(this.total() ? (v * 100) / this.total() : 0);
  }
}

export interface QuickAction {
  readonly l: string;
  readonly icon: IconName;
  readonly path: string;
  /** Why the action is unavailable (read-only role); the button is disabled with this title. */
  readonly why?: string;
}

/** The quick-action tiles (.cp-qa). */
@Component({
  selector: 'rp-home-qa',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="cp-qa">
    @for (a of items(); track a.path + a.l) {
      <button type="button" [disabled]="!!a.why" [attr.title]="a.why || null" (click)="go(a.path)">
        <span class="cp-qa-ic"><rp-icon [name]="a.icon" [size]="18" /></span><span>{{ a.l }}</span>
      </button>
    }
  </div>`,
})
export class HomeQuickActions {
  private readonly router = inject(Router);
  readonly items = input.required<readonly QuickAction[]>();
  protected go(path: string) {
    void this.router.navigateByUrl(path);
  }
}

export interface Alert {
  readonly tone: 'bad' | 'warn' | 'info';
  readonly icon: IconName;
  readonly title: string;
  readonly sub: string;
  readonly path: string;
}

/** The "Needs attention" rows (.cp-alert). */
@Component({
  selector: 'rp-home-alerts',
  imports: [Empty, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `@if (items().length) {
      <div class="stack g8">
        @for (a of items(); track a.title) {
          <button type="button" class="cp-alert" [class]="'cp-t-' + a.tone" (click)="go(a.path)">
            <span class="cp-al-ic"><rp-icon [name]="a.icon" [size]="16" /></span>
            <span class="grow"
              ><b>{{ a.title }}</b
              ><span>{{ a.sub }}</span></span
            >
            <rp-icon name="right" [size]="15" />
          </button>
        }
      </div>
    } @else {
      <rp-empty icon="checkc" title="All clear" text="No alerts right now." />
    }`,
})
export class HomeAlerts {
  private readonly router = inject(Router);
  readonly items = input.required<readonly Alert[]>();
  protected go(path: string) {
    void this.router.navigateByUrl(path);
  }
}

interface Day {
  readonly date: string;
  readonly paise: number;
  readonly count: number;
}

const DAYS = 10;

/**
 * "Collections — last 10 days" (successful payments of each day, today highlighted) and, for the
 * administrator, "Payment modes" (the payments of those days by channel).
 */
@Component({
  selector: 'rp-home-collections',
  imports: [Bars, Card, Empty, HomeDonut, Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-card title="Collections — last 10 days" icon="chart">
      <a card-right class="linkbtn" routerLink="/console/recon"
        >{{ linkLabel() }}<rp-icon name="right" [size]="14"
      /></a>
      @if (loading()) {
        <div class="sk" style="height: 230px; border-radius: 12px" aria-busy="true"></div>
      } @else if (error()) {
        <rp-empty icon="chart" title="Couldn't load the collections" [text]="error()" />
      } @else {
        <div class="cp-chart" id="home-collections">
          <rp-bars
            [items]="bars()"
            [w]="640"
            [h]="190"
            [hi]="bars().length - 1"
            [fmt]="inr0"
            aria="Collections for the last 10 days"
          />
        </div>
        @if (summary()) {
          <div class="row g16 wrap t-sm t-muted mt8">
            <span
              >10-day total <b class="t-num" style="color: var(--ink)">{{ inr0(total()) }}</b></span
            >
            <span
              >Daily average
              <b class="t-num" style="color: var(--ink)">{{ inr0(average()) }}</b></span
            >
            <span
              >Today so far
              <b class="t-num" style="color: var(--ink)">{{ inr0(todayPaise()) }}</b></span
            >
          </div>
        }
      }
    </rp-card>
    @if (modes()) {
      <rp-card title="Payment modes" icon="pie">
        <span card-right class="t-xs t-muted">last 10 days</span>
        @if (loading()) {
          <div class="sk" style="height: 160px; border-radius: 12px" aria-busy="true"></div>
        } @else if (parts().length) {
          <rp-home-donut [parts]="parts()" unit="payments" aria="Payments by mode" />
        } @else {
          <rp-empty
            icon="pie"
            title="No payments yet"
            text="Payments of the last 10 days by mode."
          />
        }
      </rp-card>
    }
  `,
})
export class HomeCollections implements OnInit {
  private readonly api = inject(HomeApi);
  /** The business date (IST) of the home. */
  readonly today = input.required<string>();
  /** Also show the payment modes card. */
  readonly modes = input(false);
  readonly summary = input(true);
  readonly linkLabel = input('Transactions');

  protected readonly inr0 = inr0;
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  private readonly days = signal<readonly Day[]>([]);
  private readonly channels = signal<ReadonlyMap<string, number>>(new Map());

  protected readonly bars = computed(() =>
    this.days().map((d) => ({ label: dayLabel(d.date, this.today()), value: d.paise })),
  );
  protected readonly total = computed(() => this.days().reduce((s, d) => s + d.paise, 0));
  protected readonly todayPaise = computed(() => this.days().at(-1)?.paise ?? 0);
  protected readonly average = computed(() => {
    const before = this.days().slice(0, -1);
    return before.length ? before.reduce((s, d) => s + d.paise, 0) / before.length : 0;
  });
  /** The four busiest channels and the rest as Other (the prototype's five modes). */
  protected readonly parts = computed<DonutPart[]>(() => {
    const list = [...this.channels()].sort((a, b) => b[1] - a[1]);
    const top = list.slice(0, 4).map(([k, v], i) => ({
      l: channelLabel(k),
      v,
      c: MODE_COLOURS[i] ?? 'var(--ink-4)',
    }));
    const rest = list.slice(4).reduce((s, [, v]) => s + v, 0);
    return rest ? [...top, { l: 'Other', v: rest, c: MODE_COLOURS[4]! }] : top;
  });

  ngOnInit() {
    void this.load();
  }

  async load() {
    const today = this.today();
    const dates = Array.from({ length: DAYS }, (_, i) => addDays(today, i - (DAYS - 1)));
    try {
      const runs = await Promise.all(
        dates.map((d) =>
          this.api.report('transactions-by-institution', { from: d, to: d }).then((r) => r.rows),
        ),
      );
      const channels = new Map<string, number>();
      this.days.set(
        runs.map((rows, i) => {
          let p = 0;
          let n = 0;
          for (const r of rows) {
            if (r['status'] !== 'SUCCESS') continue;
            const count = Number(r['count'] ?? 0);
            p += paise(r['amount'] as { amount: string; currency: string });
            n += count;
            const ch = String(r['channel'] ?? 'OTHER');
            channels.set(ch, (channels.get(ch) ?? 0) + count);
          }
          return { date: dates[i]!, paise: p, count: n };
        }),
      );
      this.channels.set(channels);
      this.error.set('');
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }
}
