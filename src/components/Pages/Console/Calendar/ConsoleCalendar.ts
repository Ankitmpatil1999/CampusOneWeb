import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { Pager } from '../../../Shared/Pager';
import { formatDate, formatDateTime, istBusinessDate } from '../../../Utils/format';
import { translate } from '../../../Utils/translate';
import { plural, saveCsv } from '../Fees/fee-format';
import {
  MONTHS,
  academicsAccess,
  addDays,
  daysBetween,
  dshort,
  num,
  problemText,
  today,
  weekday,
} from '../Structure/academic-format';
import { AcademicYears, YearBanner, YearPicker } from '../Structure/academic-year';
import { NewYearModal, nextYearAfter } from './NewYearModal';
import { BulkUpload, type UploadCheck } from '../Structure/BulkUpload';
import { StructureApi, type ClassView } from '../Structure/structure.api';
import { CalendarApi, type CalendarEntry, type CalendarList } from './calendar.api';
import {
  CAL_TONE,
  REMINDER_LABELS,
  audienceText,
  entryDates,
  entryTimes,
  recurrenceLabel,
  shortTime,
} from './calendar-format';
import { CalendarEntryDrawer } from './CalendarEntryDrawer';

type View = 'Month' | 'List';
type SortKey = 'start' | 'title' | 'type' | 'recur';
const PAGE = 12;
const LEGEND = ['Holiday', 'Exam', 'Event', 'PTM'];

interface Cell {
  readonly d: string;
  readonly day: number;
  readonly out: boolean;
  readonly today: boolean;
  readonly hol: boolean;
  readonly sun: boolean;
  readonly canAdd: boolean;
  readonly events: readonly { e: CalendarEntry; start: string }[];
  readonly more: number;
}

/**
 * c.calendar — Academic calendar (SRS 20.2, FR-ACA-02, CR-13; ACA-004…008; prototype c.calendar):
 * one calendar per academic year (the year in context) with its key figures — entries, holidays and
 * days off, exam windows, what's next; the month grid (Monday first, today and holidays marked,
 * "+" on a day adds an entry) and the list (sortable, with deleted entries restorable); type filters;
 * the entry drawer; the spreadsheet upload (checked, then imported) and the CSV download. A closed
 * year is read-only.
 */
@Component({
  selector: 'rp-console-calendar',
  imports: [
    BulkUpload,
    CalendarEntryDrawer,
    Empty,
    Icon,
    Kpi,
    PageHead,
    Pager,
    YearBanner,
    YearPicker,
    NewYearModal,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (addingYear()) {
      <rp-new-year
        [suggestion]="nextYear()"
        (closed)="addingYear.set(false)"
        (created)="yearAdded($event)"
      />
    }
    <rp-year-banner />
    <div class="c-page">
      <rp-page-head title="Academic calendar" [sub]="sub()">
        @if (!access.denied()) {
          <span class="cp-why" [attr.title]="access.yearWhy() || null"
            ><button
              type="button"
              class="btn btn-sec"
              id="cal-upload"
              [disabled]="!!access.yearWhy() || !list()"
              (click)="uploading.set(true)"
            >
              <rp-icon name="upload" [size]="17" /><span>Upload</span>
            </button></span
          >
          <span class="cp-why" [attr.title]="access.editWhy() || null"
            ><button
              type="button"
              class="btn btn-sec"
              id="cal-year-new"
              [disabled]="!!access.editWhy() || !years.loaded()"
              (click)="addingYear.set(true)"
            >
              <rp-icon name="calendar" [size]="17" /><span>New year</span>
            </button></span
          >
          <button
            type="button"
            class="btn btn-sec"
            id="cal-dl"
            [disabled]="!list()"
            (click)="download()"
          >
            <rp-icon name="download" [size]="17" /><span>Download</span>
          </button>
          <span class="cp-why" [attr.title]="access.yearWhy() || null"
            ><button
              type="button"
              class="btn btn-pri"
              id="cal-new"
              [disabled]="!!access.yearWhy() || !list()"
              (click)="openNew('')"
            >
              <rp-icon name="plus" [size]="17" /><span>Add entry</span>
            </button></span
          >
        }
      </rp-page-head>

      @if (access.denied()) {
        <rp-empty
          icon="lock"
          title="You don't have access to this page"
          [text]="access.deniedText()"
        />
      } @else {
        @if (access.management()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow">
              <b>Read-only.</b> Management can view this page but not change it.
            </div>
          </div>
        }
        @if (loading() && !list()) {
          <div class="stack g16" aria-busy="true" aria-label="Loading">
            <div class="c-grid k4 cc-kp">
              @for (i of [1, 2, 3, 4]; track i) {
                <div class="sk" style="height: 104px; border-radius: 16px"></div>
              }
            </div>
            <div class="sk" style="height: 44px; border-radius: 12px"></div>
            <div class="sk" style="height: 420px; border-radius: 16px"></div>
          </div>
        } @else if (error()) {
          <div class="card pad">
            <rp-empty icon="alertc" title="Couldn't load the calendar" [text]="error()">
              <button type="button" class="btn btn-sec btn-sm" (click)="load()">
                <span>Try again</span>
              </button>
            </rp-empty>
          </div>
        } @else if (list(); as l) {
          <div class="c-grid k4 cc-kp">
            <rp-kpi
              label="Entries this year"
              icon="calendar"
              [value]="num(l.counts.entries)"
              [delta]="l.year.label"
            />
            <rp-kpi
              label="Holidays"
              icon="sun"
              tone="bad"
              [value]="num(l.counts.holidays)"
              [delta]="
                l.counts.holidayDays + ' day' + (l.counts.holidayDays === 1 ? '' : 's') + ' off'
              "
            />
            <rp-kpi label="Exam windows" icon="award" tone="violet" [value]="num(l.counts.exams)" />
            <rp-kpi
              label="Next up"
              icon="clock"
              tone="brand"
              [value]="next() ? dshort(next()!.start) : '—'"
              [delta]="next() ? next()!.e.title : 'Nothing scheduled'"
            />
          </div>

          <div class="c-filters">
            <rp-year-picker inputId="cal-year" />
            <div class="seg cc-seg" role="radiogroup" aria-label="View" style="flex: 0 0 auto">
              <span
                class="seg-ind"
                style="width: calc((100% - 8px) / 2)"
                [style.left]="
                  'calc(3px + ' + (view() === 'Month' ? 0 : 1) + ' * ((100% - 8px) / 2 + 2px))'
                "
              ></span>
              <button
                type="button"
                role="radio"
                [class.on]="view() === 'Month'"
                [attr.aria-checked]="view() === 'Month'"
                (click)="view.set('Month')"
              >
                <rp-icon name="grid" [size]="14" />Month
              </button>
              <button
                type="button"
                role="radio"
                [class.on]="view() === 'List'"
                [attr.aria-checked]="view() === 'List'"
                (click)="view.set('List')"
              >
                <rp-icon name="list" [size]="14" />List
              </button>
            </div>
            <div class="pills" role="group" aria-label="Type">
              <button
                type="button"
                class="pill"
                [class.on]="type() === ''"
                [attr.aria-pressed]="type() === ''"
                (click)="type.set(''); page.set(1)"
              >
                All types
              </button>
              @for (t of typePills(); track t.v) {
                <button
                  type="button"
                  class="pill"
                  [class.on]="type() === t.v"
                  [attr.aria-pressed]="type() === t.v"
                  (click)="type.set(t.v); page.set(1)"
                >
                  {{ t.v }}<span class="n">{{ t.n }}</span>
                </button>
              }
            </div>
            @if (view() === 'List') {
              <label class="chk"
                ><input
                  type="checkbox"
                  id="f-del"
                  [checked]="showDeleted()"
                  (change)="showDeleted.set(checked($event)); page.set(1)"
                /><span>Show deleted</span></label
              >
            }
          </div>

          @if (view() === 'List') {
            <div class="tbl-wrap">
              <table class="tbl" id="cal-table">
                <thead>
                  <tr>
                    @for (c of columns; track c.k) {
                      <th
                        [class.sort]="c.sort"
                        [class.asc]="c.sort && sort()?.k === c.k && sort()?.dir === 'asc'"
                        [class.desc]="c.sort && sort()?.k === c.k && sort()?.dir === 'desc'"
                        [attr.aria-sort]="c.sort ? ariaSort(c.k) : null"
                        (click)="c.sort && sortBy(c.k)"
                      >
                        {{ c.l }}
                        @if (c.sort) {
                          <span class="sa" aria-hidden="true">{{
                            sort()?.k === c.k && sort()?.dir === 'desc' ? '↓' : '↑'
                          }}</span>
                        }
                      </th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (e of shown(); track e.id) {
                    <tr
                      tabindex="0"
                      [class.cc-del]="!!e.deleted"
                      (click)="openEntry(e)"
                      (keydown.enter)="openEntry(e)"
                    >
                      <td>
                        <b class="t-sb">{{ dates(e) }}</b>
                        <div class="cell-s">{{ times(e) }}</div>
                      </td>
                      <td>
                        <div class="row g8">
                          <i class="cc-dot" [style.background]="e.colour"></i
                          ><span class="t-sb">{{ e.title }}</span>
                        </div>
                        @if (e.location) {
                          <div class="cell-s">{{ e.location }}</div>
                        }
                      </td>
                      <td>
                        <span [class]="'chip dot tone-' + tone(e.type)">{{ e.type }}</span>
                      </td>
                      <td>
                        <span class="t-sm">{{ audience(e) }}</span>
                      </td>
                      <td>
                        @if (e.recurrence !== 'NONE') {
                          {{ recurrence(e) }}
                          @if (e.repeatUntil) {
                            <div class="cell-s">until {{ dshort(e.repeatUntil) }}</div>
                          }
                        } @else {
                          <span class="t-faint">—</span>
                        }
                      </td>
                      <td>
                        @if (e.reminders.length) {
                          <span class="t-sm">{{ reminders(e) }}</span>
                        } @else {
                          <span class="t-faint">None</span>
                        }
                      </td>
                      <td>
                        @if (e.deleted) {
                          <span class="chip dot">Deleted</span>&ngsp;
                          @if (!access.yearWhy()) {
                            <button
                              type="button"
                              class="btn btn-ghost btn-xs"
                              (click)="$event.stopPropagation(); restore(e)"
                            >
                              <span>Restore</span>
                            </button>
                          }
                        }
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td [attr.colspan]="columns.length">
                        <rp-empty
                          icon="calendar"
                          [title]="'No entries for ' + l.year.label"
                          [text]="
                            type()
                              ? 'Try another type.'
                              : 'Add holidays, exams and events, or upload a spreadsheet.'
                          "
                        >
                          @if (!access.yearWhy()) {
                            <button type="button" class="btn btn-pri" (click)="openNew('')">
                              <rp-icon name="plus" [size]="17" /><span>Add entry</span>
                            </button>
                          }
                        </rp-empty>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (rows().length > pageSize) {
              <rp-pager
                [total]="rows().length"
                [page]="page()"
                [size]="pageSize"
                (go)="page.set($event)"
              />
            } @else if (rows().length) {
              <div class="pager">
                <span>{{ plural(rows().length, 'entry', 'entries') }}</span>
              </div>
            }
          } @else {
            <div class="card pad stack g12" id="cal-month">
              <div class="row between wrap g8">
                <div class="row g8">
                  <button
                    type="button"
                    class="btn btn-sec btn-sm btn-icon"
                    aria-label="Previous month"
                    title="Previous month"
                    [disabled]="!canPrev()"
                    (click)="shift(-1)"
                  >
                    <rp-icon name="left" [size]="15" />
                  </button>
                  <h3 class="t-h3" style="min-width: 150px; text-align: center" aria-live="polite">
                    {{ monthLabel() }}
                  </h3>
                  <button
                    type="button"
                    class="btn btn-sec btn-sm btn-icon"
                    aria-label="Next month"
                    title="Next month"
                    [disabled]="!canNext()"
                    (click)="shift(1)"
                  >
                    <rp-icon name="right" [size]="15" />
                  </button>
                  @if (todayInYear()) {
                    <button type="button" class="btn btn-ghost btn-sm" (click)="toToday()">
                      <span>Today</span>
                    </button>
                  }
                </div>
                <div class="legend">
                  @for (g of legend(); track g.l) {
                    <span><i [style.background]="g.c"></i>{{ g.l }}</span>
                  }
                </div>
              </div>
              <div class="cc-cal" role="grid" [attr.aria-label]="monthLabel()">
                @for (d of weekdays; track d) {
                  <div class="dh" role="columnheader">{{ d }}</div>
                }
                @for (c of cells(); track c.d) {
                  <div
                    class="dc"
                    role="gridcell"
                    [class.out]="c.out"
                    [class.today]="c.today"
                    [class.hol]="c.hol"
                    [class.sun]="c.sun"
                  >
                    <div class="row between">
                      <span class="dn">{{ c.day }}</span>
                      @if (c.canAdd) {
                        <button
                          type="button"
                          class="cc-add"
                          [attr.aria-label]="'Add an entry on ' + date(c.d)"
                          (click)="openNew(c.d)"
                        >
                          <rp-icon name="plus" [size]="13" />
                        </button>
                      }
                    </div>
                    @for (o of c.events; track o.e.id + o.start) {
                      <button
                        type="button"
                        class="ev"
                        [class.del]="!!o.e.deleted"
                        [style.--c]="o.e.colour"
                        [attr.title]="o.e.title + (o.e.allDay ? '' : ' · ' + time(o.e.startTime))"
                        (click)="openEntry(o.e)"
                      >
                        <span class="t-clip">
                          @if (!o.e.allDay) {
                            <b>{{ time(o.e.startTime) }}</b>
                          }
                          {{ o.e.title }}</span
                        >
                      </button>
                    }
                    @if (c.more) {
                      <span class="more">+{{ c.more }} more</span>
                    }
                  </div>
                }
              </div>
            </div>
          }
        }
      }
    </div>

    @if (open(); as o) {
      <rp-calendar-entry
        [entry]="o.entry"
        [dateIso]="o.date"
        [year]="yearOf()!"
        [types]="list()?.types ?? []"
        [holidayTypes]="list()?.holidayTypes ?? []"
        [reminderNames]="list()?.reminders ?? {}"
        [classes]="classes()"
        [readOnly]="access.yearWhy()"
        (closed)="open.set(null)"
        (saved)="afterSave($event)"
        (deleted)="open.set(null); load()"
        (stale)="load()"
      />
    }
    @if (uploading()) {
      <rp-bulk-upload
        title="Upload calendar entries"
        [sub]="'Entries are added to the ' + (list()?.year?.label ?? '') + ' calendar.'"
        columns="Columns: type, title, start date, end date, all day, colour."
        noun="entry"
        nouns="entries"
        [head]="['Type', 'Title', 'Dates']"
        [templateFile]="template()"
        [upload]="uploadFn"
        (closed)="uploading.set(false)"
        (imported)="uploaded($event)"
      />
    }
  `,
})
export class ConsoleCalendar {
  private readonly api = inject(CalendarApi);
  private readonly structure = inject(StructureApi);
  private readonly overlays = inject(Overlays);
  protected readonly years = inject(AcademicYears);
  private readonly session = inject(SessionContext).console;
  protected readonly access = academicsAccess(this.session, this.years);
  protected readonly addingYear = signal(false);
  protected readonly nextYear = computed(() =>
    nextYearAfter(this.years.items(), istBusinessDate(new Date())),
  );

  /** ACA-002 done: the year list reloads, so the picker and the roll-over see the new year. */
  protected async yearAdded(label: string) {
    this.addingYear.set(false);
    await this.years.load(true);
    this.overlays.toast(`Academic year ${label} added`, {
      sub: 'Make it current when it starts; the roll-over can now move students into it',
    });
  }

  protected readonly pageSize = PAGE;
  protected readonly plural = plural;
  protected readonly num = num;
  protected readonly dshort = dshort;
  protected readonly weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  protected readonly columns: readonly {
    k: SortKey | 'aud' | 'rem' | 'st';
    l: string;
    sort: boolean;
  }[] = [
    { k: 'start', l: 'Date', sort: true },
    { k: 'title', l: 'Title', sort: true },
    { k: 'type', l: 'Type', sort: true },
    { k: 'aud', l: 'Audience', sort: false },
    { k: 'recur', l: 'Repeats', sort: true },
    { k: 'rem', l: 'Reminders', sort: false },
    { k: 'st', l: '', sort: false },
  ];

  protected readonly list = signal<CalendarList | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly classes = signal<readonly ClassView[]>([]);
  protected readonly view = signal<View>('Month');
  protected readonly type = signal('');
  protected readonly showDeleted = signal(false);
  protected readonly page = signal(1);
  protected readonly sort = signal<{ k: SortKey; dir: 'asc' | 'desc' } | null>(null);
  /** The month shown, "YYYY-MM" ('' = this month, or the year's first). */
  protected readonly month = signal('');
  protected readonly open = signal<{ entry: CalendarEntry | null; date: string } | null>(null);
  protected readonly uploading = signal(false);
  private seq = 0;

  protected readonly yearOf = computed(() => this.years.selected());
  protected readonly sub = computed(() => {
    const y = this.list()?.year.label ?? this.years.selected()?.label;
    return y
      ? `One calendar for ${y} — holidays, exams, events and meetings`
      : 'One calendar per academic year — holidays, exams, events and meetings';
  });
  private readonly live = computed(() => (this.list()?.items ?? []).filter((e) => !e.deleted));
  protected readonly typePills = computed(() => {
    const l = this.list();
    const types = l?.types ?? [];
    return types
      .map((t) => ({ v: t, n: this.live().filter((e) => e.type === t).length }))
      .filter((t) => t.n || LEGEND.includes(t.v));
  });
  protected readonly next = computed(() => {
    const t = today();
    let best: { e: CalendarEntry; start: string } | null = null;
    for (const e of this.live()) {
      for (const o of e.occurrences ?? []) {
        if (o.end >= t && (!best || o.start < best.start)) best = { e, start: o.start };
      }
    }
    return best;
  });
  protected readonly rows = computed(() => {
    const list = (this.list()?.items ?? []).filter(
      (e) => (this.showDeleted() || !e.deleted) && (!this.type() || e.type === this.type()),
    );
    const s = this.sort() ?? { k: 'start' as const, dir: 'asc' as const };
    const val = (e: CalendarEntry) =>
      s.k === 'start'
        ? `${e.startDate} ${e.startTime ?? ''}`
        : s.k === 'title'
          ? e.title
          : s.k === 'type'
            ? e.type
            : e.recurrence;
    return [...list].sort((a, b) => {
      const c = val(a).localeCompare(val(b), 'en', { numeric: true });
      return s.dir === 'desc' ? -c : c;
    });
  });
  protected readonly shown = computed(() =>
    this.rows().slice((this.page() - 1) * PAGE, this.page() * PAGE),
  );

  // --- the month grid ------------------------------------------------------------------------------
  protected readonly todayInYear = computed(() => {
    const y = this.list()?.year;
    const t = today();
    return !!y?.startsOn && !!y.endsOn && t >= y.startsOn && t <= y.endsOn;
  });
  private readonly ym = computed(() => {
    const m = this.month();
    if (m) return m;
    const y = this.list()?.year;
    return (this.todayInYear() || !y?.startsOn ? today() : y.startsOn).slice(0, 7);
  });
  protected readonly monthLabel = computed(() => {
    const [y, m] = this.ym().split('-').map(Number) as [number, number];
    return `${MONTHS[m - 1]} ${y}`;
  });
  protected readonly canPrev = computed(() => {
    const y = this.list()?.year;
    return !y?.startsOn || `${this.ym()}-01` > y.startsOn;
  });
  protected readonly canNext = computed(() => {
    const y = this.list()?.year;
    return !y?.endsOn || `${this.shifted(1)}-01` <= y.endsOn;
  });
  protected readonly legend = computed(() =>
    LEGEND.map((t) => ({
      l: t,
      c: this.live().find((e) => e.type === t)?.colour ?? '#5E7479',
    })),
  );
  protected readonly cells = computed<Cell[]>(() => {
    const y = this.list()?.year;
    const first = `${this.ym()}-01`;
    const [yy, mm] = this.ym().split('-').map(Number) as [number, number];
    const last = new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
    const start = addDays(first, 1 - weekday(first));
    const t = today();
    const occs = this.live()
      .filter((e) => !this.type() || e.type === this.type())
      .flatMap((e) => (e.occurrences ?? []).map((o) => ({ e, start: o.start, end: o.end })));
    const canAdd = !this.access.yearWhy();
    const out: Cell[] = [];
    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i);
      if (i >= 35 && d > last) break;
      const evs = occs
        .filter((o) => o.start <= d && o.end >= d)
        .sort((a, b) => (a.e.startTime ?? '').localeCompare(b.e.startTime ?? ''));
      const out_ = d.slice(0, 7) !== this.ym();
      out.push({
        d,
        day: Number(d.slice(8)),
        out: out_,
        today: d === t,
        hol: evs.some((o) => o.e.type === 'Holiday'),
        sun: weekday(d) === 7,
        canAdd: canAdd && !out_ && !!y?.startsOn && !!y.endsOn && d >= y.startsOn && d <= y.endsOn,
        events: evs.slice(0, 3),
        more: Math.max(0, evs.length - 3),
      });
    }
    return out;
  });

  protected readonly template = computed(() => {
    const y = (this.list()?.year.startsOn ?? today()).slice(0, 4);
    return {
      name: 'calendar_template.csv',
      rows: [
        ['type', 'title', 'start_date', 'end_date', 'all_day', 'colour'],
        ['Holiday', 'Kannada Rajyotsava', `${y}-11-01`, `${y}-11-01`, 'Yes', '#8C3B3B'],
      ],
    };
  });

  protected readonly uploadFn = async (file: File, commit: boolean, key: string) => {
    const r = await this.api.upload(file, commit, key, this.years.selectedId() || undefined);
    const y = r.year;
    const out: UploadCheck = {
      accepted: r.accepted,
      rejected: r.rejected,
      imported: r.imported,
      rows: r.rows.map((x) => ({
        row: x.row,
        cells: [x.type, x.title, x.startDate ? entryRange(x.startDate, x.endDate) : '—'],
        accepted: x.accepted,
        reason: x.code
          ? translate(x.code, {
              title: x.title,
              date: x.startDate ? formatDate(x.startDate) : '',
              label: y.label,
              from: y.startsOn ? formatDate(y.startsOn) : '',
              to: y.endsOn ? formatDate(y.endsOn) : '',
              max: 500,
            })
          : '',
      })),
    };
    return out;
  };

  constructor() {
    effect(() => {
      // A new year in context reloads the calendar.
      this.years.selectedId();
      if (this.years.loaded()) {
        untracked(() => {
          this.month.set('');
          this.page.set(1);
          void this.load();
        });
      }
    });
    if (!this.access.denied()) {
      void this.years.load();
      void this.loadClasses();
    }
  }

  protected async load() {
    if (this.access.denied()) return;
    const n = ++this.seq;
    this.loading.set(true);
    try {
      const l = await this.api.list(this.years.selectedId() || undefined);
      if (n !== this.seq) return;
      this.list.set(l);
      this.error.set('');
    } catch (e) {
      if (n === this.seq) this.error.set(problemText(e));
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
  }

  private async loadClasses() {
    try {
      this.classes.set((await this.structure.classes()).items);
    } catch {
      // The audience then offers the whole institution and individuals only.
    }
  }

  private shifted(n: number) {
    const [y, m] = this.ym().split('-').map(Number) as [number, number];
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return d.toISOString().slice(0, 7);
  }
  protected shift(n: number) {
    this.month.set(this.shifted(n));
  }
  protected toToday() {
    this.month.set(today().slice(0, 7));
  }

  protected openNew(date: string) {
    if (this.access.yearWhy() || !this.yearOf()) return;
    this.open.set({ entry: null, date });
  }
  protected openEntry(e: CalendarEntry) {
    if (!this.yearOf()) return;
    this.open.set({ entry: e, date: '' });
  }

  protected afterSave(e: CalendarEntry) {
    this.open.set(null);
    this.month.set(e.startDate.slice(0, 7));
    void this.load();
  }

  protected async restore(e: CalendarEntry) {
    try {
      await this.api.change(e.id, e.version, { restore: true });
      this.overlays.toast('Entry restored', { sub: e.title });
      void this.load();
    } catch (x) {
      this.overlays.toast("Couldn't restore the entry", { tone: 'bad', sub: problemText(x) });
    }
  }

  protected uploaded(r: UploadCheck) {
    this.uploading.set(false);
    if (r.imported) void this.load();
  }

  /** The year's entries as CSV (prototype cc.cal.dl). */
  protected download() {
    const l = this.list();
    if (!l) return;
    saveCsv(`calendar_${l.year.label}.csv`, [
      ['Type', 'Title', 'Start', 'End', 'All day', 'Audience', 'Repeats', 'Until', 'Location'],
      ...this.live().map((e) => [
        e.type,
        e.title,
        e.allDay
          ? formatDate(e.startDate)
          : formatDateTime(`${e.startDate}T${e.startTime}:00+05:30`),
        e.allDay ? formatDate(e.endDate) : formatDateTime(`${e.endDate}T${e.endTime}:00+05:30`),
        e.allDay ? 'Yes' : 'No',
        audienceText(e),
        recurrenceLabel(e.recurrence),
        e.repeatUntil ? formatDate(e.repeatUntil) : '',
        e.location ?? '',
      ]),
    ]);
    this.overlays.toast(`CSV export prepared · ${plural(this.live().length, 'row')}`, {
      sub: `calendar_${l.year.label}.csv`,
    });
  }

  // --- formatting ------------------------------------------------------------------------------------
  protected sortBy(k: string) {
    const key = k as SortKey;
    const s = this.sort() ?? { k: 'start', dir: 'asc' };
    this.sort.set({ k: key, dir: s.k === key && s.dir === 'asc' ? 'desc' : 'asc' });
    this.page.set(1);
  }
  protected ariaSort(k: string) {
    const s = this.sort() ?? { k: 'start', dir: 'asc' };
    return s.k === k ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  }
  protected tone(t: string) {
    return CAL_TONE[t] ?? 'neutral';
  }
  protected dates(e: CalendarEntry) {
    return entryDates(e);
  }
  protected times(e: CalendarEntry) {
    return entryTimes(e);
  }
  protected audience(e: CalendarEntry) {
    return audienceText(e);
  }
  protected recurrence(e: CalendarEntry) {
    return recurrenceLabel(e.recurrence);
  }
  protected reminders(e: CalendarEntry) {
    const names = this.list()?.reminders;
    return e.reminders.map((r) => names?.[r] ?? REMINDER_LABELS[r]).join(', ');
  }
  protected date(d: string) {
    return formatDate(d);
  }
  protected time(t: string | null) {
    return shortTime(t);
  }
  protected checked(e: Event) {
    return (e.target as HTMLInputElement).checked;
  }
}

const entryRange = (a: string, b: string) =>
  b && b !== a && daysBetween(a, b) > 0 ? `${dshort(a)} – ${formatDate(b)}` : formatDate(a);
