/**
 * Calendar (client 2026-10-12; the app's calendar and bus, ACA-066 and TRN-034): the school's
 * calendar for the teacher month by month — holidays, events and exams for everyone and those meant
 * for them — and, when they travel on the school bus, their route, stop and today's trips.
 */
import {
  ChangeDetectionStrategy,
  Component,
  type OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { formatDate } from '../../../Utils/format';
import { t as tr } from '../../../Utils/t';
import { problemText, today } from '../Structure/academic-format';
import { type CalendarItem, MeApi, type MyBus, type MyCalendar } from './me.api';
import { monthLabel, shiftMonth } from './TeachingMyAttendance';

interface Day {
  readonly date: string;
  readonly items: readonly {
    readonly item: CalendarItem;
    readonly start: string;
    readonly end: string;
  }[];
}

/** The month's last day, "2026-10" → "2026-10-31". */
const monthEnd = (month: string) => {
  const d = new Date(`${shiftMonth(month, 1)}-01T00:00:00Z`);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
};

const nextDay = (d: string) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
};

@Component({
  selector: 'rp-teaching-calendar',
  imports: [Empty, Icon, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="c-page">
    <rp-page-head [title]="t('ui.web.nav.calendar')" [sub]="t('ui.web.tch.my.cal.sub')">
      <div class="row g8">
        <button
          type="button"
          class="iconbtn"
          id="cal-prev"
          [attr.aria-label]="t('ui.web.tch.my.prevMonth')"
          (click)="go(-1)"
        >
          <rp-icon name="left" [size]="16" />
        </button>
        <b id="cal-month" style="min-width: 130px; text-align: center">{{ label() }}</b>
        <button
          type="button"
          class="iconbtn"
          id="cal-next"
          [attr.aria-label]="t('ui.web.tch.my.nextMonth')"
          (click)="go(1)"
        >
          <rp-icon name="right" [size]="16" />
        </button>
      </div>
    </rp-page-head>

    @if (bus()?.allocation; as a) {
      <div class="card pad stack g8" id="cal-bus">
        <div class="row g8 wrap">
          <rp-icon name="bus" [size]="18" />
          <b class="grow">{{ t('ui.web.tch.my.bus.title') }}</b>
          <span class="t-sm t-muted">{{
            t('ui.web.tch.my.bus.valid', { from: date(a.from), to: date(a.to) })
          }}</span>
        </div>
        <div>
          <span class="cc-rt">{{ a.route.code }}</span> {{ a.route.name }} ·
          {{ t('ui.web.tch.my.bus.stop', { stop: a.stop.name }) }}
          @if (a.stop.landmark) {
            <span class="t-muted"> ({{ a.stop.landmark }})</span>
          }
        </div>
        @if (bus()!.trips.length) {
          <div class="stack g4">
            @for (trip of bus()!.trips; track trip.id) {
              <div class="row g8 wrap t-sm">
                <b>{{ trip.session ?? trip.direction }}</b>
                <span class="t-muted"
                  >{{ trip.vehicle.name }} · {{ trip.vehicle.registration }}</span
                >
                <span class="grow"></span>
                @if (trip.myStop?.plannedTime) {
                  <span>{{ t('ui.web.tch.my.bus.at', { time: trip.myStop!.plannedTime! }) }}</span>
                }
                <span class="chip dot tone-neutral">{{ tripStatus(trip.status) }}</span>
              </div>
            }
          </div>
        } @else {
          <p class="t-sm t-muted">{{ t('ui.web.tch.my.bus.noTrips') }}</p>
        }
      </div>
    }

    @if (error()) {
      <div class="note tone-bad" role="alert" id="cal-error">
        <rp-icon name="alert" [size]="17" />
        <div class="grow">{{ error() }}</div>
        <button type="button" class="btn btn-sec btn-sm" (click)="load()">
          {{ t('ui.web.tch.retry') }}
        </button>
      </div>
    } @else if (!data()) {
      <div class="card pad"><div class="sk" style="height: 240px; border-radius: 16px"></div></div>
    } @else if (!days().length) {
      <rp-empty
        icon="calendar"
        [title]="t('ui.web.tch.my.cal.empty', { month: label() })"
        [text]="t('ui.web.tch.my.cal.emptyText')"
      />
    } @else {
      <div class="stack g12" id="cal-list">
        @for (d of days(); track d.date) {
          <div class="card pad stack g8" [id]="'cal-' + d.date" [class.cal-today]="d.date === day">
            <b>{{ dayLabel(d.date) }}</b>
            @for (e of d.items; track e.item.id + e.start) {
              <div class="row g8 wrap cal-e">
                <span
                  class="cal-sw"
                  [style.background]="e.item.colour || 'var(--brand-2)'"
                  aria-hidden="true"
                ></span>
                <div class="grow" style="min-width: 0">
                  <b>{{ e.item.title }}</b>
                  <span class="t-muted"> · {{ e.item.type }}</span>
                  <div class="t-sm t-muted">
                    {{ timing(e) }}
                    @if (e.item.location) {
                      · {{ e.item.location }}
                    }
                  </div>
                  @if (e.item.description) {
                    <div class="t-sm">{{ e.item.description }}</div>
                  }
                </div>
              </div>
            }
          </div>
        }
      </div>
    }
  </div>`,
})
export class TeachingCalendar implements OnInit {
  private readonly api = inject(MeApi);
  protected readonly t = tr;
  protected readonly day = today();
  protected readonly month = signal(today().slice(0, 7));
  protected readonly data = signal<MyCalendar | null>(null);
  protected readonly bus = signal<MyBus | null>(null);
  protected readonly error = signal('');
  protected readonly label = computed(() => monthLabel(this.month()));
  /** Each day of the month with what is on, an entry over several days on each of them. */
  protected readonly days = computed<Day[]>(() => {
    const d = this.data();
    if (!d) return [];
    const first = `${this.month()}-01`;
    const last = monthEnd(this.month());
    const by = new Map<string, Day['items'][number][]>();
    for (const item of d.items) {
      for (const o of item.occurrences) {
        for (let x = o.start < first ? first : o.start; x <= o.end && x <= last; x = nextDay(x)) {
          if (!by.has(x)) by.set(x, []);
          by.get(x)!.push({ item, start: o.start, end: o.end });
        }
      }
    }
    return [...by.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, items]) => ({ date, items }));
  });
  private seq = 0;

  ngOnInit() {
    void this.load();
    void this.loadBus();
  }

  async load() {
    const n = ++this.seq;
    this.data.set(null);
    try {
      const d = await this.api.calendar(`${this.month()}-01`, monthEnd(this.month()));
      if (n !== this.seq) return;
      this.data.set(d);
      this.error.set('');
    } catch (e) {
      if (n === this.seq) this.error.set(problemText(e));
    }
  }

  /** The school bus, when the teacher travels on it (nothing shows otherwise). */
  private async loadBus() {
    try {
      this.bus.set(await this.api.bus());
    } catch {
      this.bus.set(null);
    }
  }

  protected go(by: number) {
    this.month.set(shiftMonth(this.month(), by));
    void this.load();
  }

  protected dayLabel(d: string) {
    const w = new Intl.DateTimeFormat('en-IN', { weekday: 'long', timeZone: 'UTC' }).format(
      new Date(`${d}T00:00:00Z`),
    );
    return `${w}, ${formatDate(d)}${d === this.day ? ` · ${tr('ui.web.tch.my.cal.today')}` : ''}`;
  }
  protected timing(e: Day['items'][number]) {
    const span =
      e.start === e.end
        ? ''
        : tr('ui.web.tch.leave.dates', { from: formatDate(e.start), to: formatDate(e.end) });
    const time = e.item.allDay
      ? tr('ui.web.tch.my.cal.allDay')
      : [e.item.startTime, e.item.endTime].filter(Boolean).join(' – ');
    return [span, time].filter(Boolean).join(' · ');
  }
  protected tripStatus(s: string) {
    return tr(`ui.web.tch.my.bus.st.${s.toLowerCase()}`);
  }
  protected date(v: string) {
    return formatDate(v);
  }
}
