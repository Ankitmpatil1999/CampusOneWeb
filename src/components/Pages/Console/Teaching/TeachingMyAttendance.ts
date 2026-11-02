/**
 * My attendance (client 2026-10-12; the app's own attendance, ATT-023): a month of the teacher's
 * attendance — present, late, half day or absent, with the check-in and check-out times — the
 * school's holidays and their approved leave, and the month's figures.
 */
import {
  ChangeDetectionStrategy,
  Component,
  type OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Kpi, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { formatTime } from '../../../Utils/format';
import { t as tr } from '../../../Utils/t';
import { problemText, today } from '../Structure/academic-format';
import { type AttendanceDay, type AttendanceMonth, MeApi } from './me.api';

/** "2026-10" moved by whole months. */
export const shiftMonth = (month: string, by: number) => {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
};
/** "October 2026". */
export const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`),
  );

@Component({
  selector: 'rp-teaching-my-attendance',
  imports: [Icon, Kpi, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="c-page">
    <rp-page-head [title]="t('ui.web.nav.myAttendance')" [sub]="t('ui.web.tch.my.att.sub')">
      <div class="row g8">
        <button
          type="button"
          class="iconbtn"
          id="ma-prev"
          [attr.aria-label]="t('ui.web.tch.my.prevMonth')"
          (click)="go(-1)"
        >
          <rp-icon name="left" [size]="16" />
        </button>
        <b id="ma-month" style="min-width: 130px; text-align: center">{{ label() }}</b>
        <button
          type="button"
          class="iconbtn"
          id="ma-next"
          [attr.aria-label]="t('ui.web.tch.my.nextMonth')"
          [disabled]="month() >= thisMonth"
          (click)="go(1)"
        >
          <rp-icon name="right" [size]="16" />
        </button>
      </div>
    </rp-page-head>

    @if (error()) {
      <div class="note tone-bad" role="alert" id="ma-error">
        <rp-icon name="alert" [size]="17" />
        <div class="grow">{{ error() }}</div>
        <button type="button" class="btn btn-sec btn-sm" (click)="load()">
          {{ t('ui.web.tch.retry') }}
        </button>
      </div>
    } @else if (data(); as d) {
      <div class="c-grid k4" id="ma-kpis">
        <rp-kpi
          [label]="t('ui.web.tch.my.att.rate')"
          [value]="d.summary.percentage === null ? '—' : d.summary.percentage + '%'"
          icon="calcheck"
          [delta]="t('ui.web.tch.my.att.schoolDays', { n: d.summary.schoolDays })"
        />
        <rp-kpi
          [label]="t('ui.web.tch.my.att.present')"
          [value]="'' + d.summary.present"
          icon="checkc"
          tone="ok"
        />
        <rp-kpi
          [label]="t('ui.web.tch.my.att.lateHalf')"
          [value]="d.summary.late + ' · ' + d.summary.halfDay"
          icon="clock"
          tone="warn"
        />
        <rp-kpi
          [label]="t('ui.web.tch.my.att.absent')"
          [value]="'' + d.summary.absent"
          icon="xc"
          tone="bad"
          [delta]="t('ui.web.tch.my.att.notMarked', { n: d.summary.notMarked })"
        />
      </div>
      <div class="card pad">
        <div class="ma-grid" id="ma-grid" role="grid" [attr.aria-label]="label()">
          @for (w of weekdays; track w) {
            <div class="ma-wd" role="columnheader">{{ t('ui.web.tch.my.wd.' + w) }}</div>
          }
          @for (b of blanks(); track $index) {
            <div class="ma-d blank" aria-hidden="true"></div>
          }
          @for (day of d.items; track day.date) {
            <div
              role="gridcell"
              [class]="'ma-d ' + kind(day)"
              [attr.title]="title(day)"
              [id]="'ma-' + day.date"
            >
              <b>{{ +day.date.slice(8) }}</b>
              <span class="ma-s">{{ caption(day) }}</span>
            </div>
          }
        </div>
        <div class="row g12 wrap t-xs t-muted mt8" id="ma-legend">
          @for (k of legend; track k) {
            <span class="row g4"
              ><span [class]="'ma-dot ' + k"></span>{{ t('ui.web.tch.my.att.k.' + k) }}</span
            >
          }
        </div>
      </div>
    } @else {
      <div class="card pad"><div class="sk" style="height: 320px; border-radius: 16px"></div></div>
    }
  </div>`,
})
export class TeachingMyAttendance implements OnInit {
  private readonly api = inject(MeApi);
  protected readonly t = tr;
  protected readonly thisMonth = today().slice(0, 7);
  protected readonly weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
  protected readonly legend = ['present', 'late', 'absent', 'leave', 'holiday'] as const;
  protected readonly month = signal(today().slice(0, 7));
  protected readonly data = signal<AttendanceMonth | null>(null);
  protected readonly error = signal('');
  protected readonly label = computed(() => monthLabel(this.month()));
  /** Empty cells before the 1st, the week starting on Monday. */
  protected readonly blanks = computed(() => {
    const dow = new Date(`${this.month()}-01T00:00:00Z`).getUTCDay();
    return Array.from({ length: (dow + 6) % 7 });
  });
  private seq = 0;

  ngOnInit() {
    void this.load();
  }

  async load() {
    const n = ++this.seq;
    this.data.set(null);
    try {
      const d = await this.api.attendance(this.month());
      if (n !== this.seq) return;
      this.data.set(d);
      this.error.set('');
    } catch (e) {
      if (n === this.seq) this.error.set(problemText(e));
    }
  }

  protected go(by: number) {
    const next = shiftMonth(this.month(), by);
    if (next > this.thisMonth) return;
    this.month.set(next);
    void this.load();
  }

  protected kind(d: AttendanceDay) {
    if (d.future) return 'future';
    // A day off shows a check-in made on it (client 2026-10-25).
    if (d.holiday && !d.status) return 'holiday';
    if (d.sunday && !d.status) return 'sunday';
    if (d.onApprovedLeave && (!d.status || d.status === 'ABSENT')) return 'leave';
    switch (d.status) {
      case 'PRESENT':
        return 'present';
      case 'LATE':
      case 'HALF_DAY':
        return 'late';
      case 'ABSENT':
        return 'absent';
      default:
        return 'none';
    }
  }
  protected caption(d: AttendanceDay) {
    const k = this.kind(d);
    if (k === 'holiday') return d.holiday ?? '';
    if (k === 'future' || k === 'sunday' || k === 'none') return '';
    if (k === 'leave') return tr('ui.web.tch.my.att.k.leave');
    return tr(`ui.web.tch.my.att.st.${(d.status ?? '').toLowerCase()}`);
  }
  protected title(d: AttendanceDay) {
    const times = [d.checkInAt, d.checkOutAt].filter((x): x is string => !!x).map(formatTime);
    return [this.caption(d), times.join(' – ')].filter(Boolean).join(' · ') || null;
  }
}
