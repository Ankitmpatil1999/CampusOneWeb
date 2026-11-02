import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Empty, Kpi } from '../../../Shared/Blocks';
import { HBars, type HBarItem } from '../../../Shared/Charts';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { formatDate, formatTime } from '../../../Utils/format';
import {
  AttendanceApi,
  type AttendanceOverview,
  type AttendanceType,
} from '../Attendance/attendance.api';
import { exportCsv, pct } from '../Attendance/attendance-format';
import { plural } from '../Fees/fee-format';
import { num, problemText, today } from '../Structure/academic-format';
import type { VisitorLog } from './frontdesk.api';

const SIZE = 120;
const THICK = 14;
const R = (SIZE - THICK) / 2;
const C = 2 * Math.PI * R;

/**
 * Quick report (prototype fdReport; ATT-008, ATT-013, ATT-015): today's gate attendance of students
 * and staff, visitors (by purpose) and visits to each place, with the visitor log's export.
 */
@Component({
  selector: 'rp-frontdesk-report',
  imports: [Empty, HBars, Icon, Kpi],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @if (loading() && !day()) {
      <div class="stack g16" aria-busy="true" aria-label="Loading">
        <div class="c-grid k4 cc-kp">
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="sk" style="height: 104px; border-radius: 16px"></div>
          }
        </div>
        <div class="sk" style="height: 220px; border-radius: 16px"></div>
      </div>
    } @else if (error()) {
      <div class="card pad">
        <rp-empty icon="alertc" title="Couldn't load the report" [text]="error()">
          <button type="button" class="btn btn-sec btn-sm" (click)="load()">
            <span>Try again</span>
          </button>
        </rp-empty>
      </div>
    } @else if (day(); as d) {
      <div class="c-grid k4 cc-kp" id="fd-kpis">
        <rp-kpi
          label="Students in today"
          icon="school"
          tone="ok"
          [value]="studentsPct() + '%'"
          [delta]="num(studentsIn()) + ' of ' + num(d.students.total)"
        />
        <rp-kpi
          label="Staff in today"
          icon="briefcase"
          tone="brand"
          [value]="num(staffIn()) + '/' + num(staffTotal())"
        />
        <rp-kpi
          label="Visitors today"
          icon="door"
          [value]="num(visitors().total)"
          [delta]="num(visitors().inside) + ' still on campus'"
        />
        <rp-kpi
          label="Place visits today"
          icon="bookopen"
          tone="violet"
          [value]="num(placeVisits())"
        />
      </div>
      <div class="c-grid k3">
        <div class="card pad stack g12">
          <h3 class="t-h4">Gate attendance · students</h3>
          @if (d.holiday || d.sunday) {
            <p class="t-sm t-muted">No school today{{ d.holiday ? ' — ' + d.holiday : '' }}.</p>
          } @else {
            <div class="row g16">
              <div class="ring" [style.width.px]="size" [style.height.px]="size">
                <svg [attr.width]="size" [attr.height]="size" aria-hidden="true">
                  <circle
                    [attr.cx]="size / 2"
                    [attr.cy]="size / 2"
                    [attr.r]="r"
                    fill="none"
                    stroke="var(--surface-3)"
                    [attr.stroke-width]="thick"
                  />
                  @for (p of donut(); track p.l; let i = $index) {
                    <circle
                      [attr.cx]="size / 2"
                      [attr.cy]="size / 2"
                      [attr.r]="r"
                      fill="none"
                      [attr.stroke]="p.c"
                      [attr.stroke-width]="thick"
                      [attr.stroke-dasharray]="p.dash"
                      [attr.stroke-dashoffset]="p.offset"
                      [style.animation]="'fade .5s ' + i * 0.12 + 's both'"
                    >
                      <title>{{ p.l }}: {{ p.v }}</title>
                    </circle>
                  }
                </svg>
                <div class="ring-c">
                  <b class="t-num" style="font-size: 18px">{{ studentsPct() }}%</b>
                </div>
              </div>
              <div class="stack g6">
                @for (p of parts(); track p.l) {
                  <div class="row g8 t-sm">
                    <i class="cc-dot" [style.background]="p.c"></i
                    ><span class="grow">{{ p.l }}</span
                    ><b class="t-num">{{ num(p.v) }}</b>
                  </div>
                }
              </div>
            </div>
          }
        </div>
        <div class="card pad stack g12">
          <h3 class="t-h4">Visitors by purpose</h3>
          @if (byPurpose().length) {
            <rp-hbars [items]="byPurpose()" />
          } @else {
            <p class="t-sm t-muted">No visitors yet today.</p>
          }
        </div>
        <div class="card pad stack g12">
          <h3 class="t-h4">Visits by place</h3>
          @if (byPlace().length) {
            <rp-hbars [items]="byPlace()" />
          } @else {
            <p class="t-sm t-muted">No place visits yet today.</p>
          }
        </div>
      </div>
      <div class="row end g8">
        <button
          type="button"
          class="btn btn-sec btn-sm"
          id="fd-exv"
          [disabled]="!visitors().total"
          (click)="exportVisitors()"
        >
          <rp-icon name="download" [size]="15" /><span>Export visitors</span>
        </button>
      </div>
    }
  `,
})
export class FrontDeskReport {
  private readonly api = inject(AttendanceApi);
  private readonly overlays = inject(Overlays);

  /** Today's visitor log. */
  readonly log = input<VisitorLog | null>(null);

  protected readonly num = num;
  protected readonly size = SIZE;
  protected readonly thick = THICK;
  protected readonly r = R;
  protected readonly day = signal<AttendanceOverview | null>(null);
  private readonly types = signal<readonly AttendanceType[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  protected readonly visitors = computed(() => this.log()?.counts ?? { total: 0, inside: 0 });
  protected readonly studentsIn = computed(() => {
    const s = this.day()?.students;
    return s ? s.present + s.late + s.halfDay : 0;
  });
  protected readonly studentsPct = computed(() =>
    pct(this.studentsIn(), this.day()?.students.total ?? 0),
  );
  protected readonly staffTotal = computed(() => {
    const s = this.day()?.staff;
    return s ? s.teachers.total + s.others.total : 0;
  });
  protected readonly staffIn = computed(() => {
    const s = this.day()?.staff;
    if (!s) return 0;
    return [s.teachers, s.others].reduce((n, g) => n + g.present + g.late + g.halfDay, 0);
  });
  protected readonly placeVisits = computed(() =>
    this.types().reduce((n, t) => n + t.checkInsToday, 0),
  );
  protected readonly parts = computed(() => {
    const s = this.day()?.students;
    if (!s) return [];
    return [
      { v: s.present + s.halfDay, c: 'var(--ok)', l: 'Present' },
      { v: s.late, c: 'var(--accent)', l: 'Late' },
      { v: s.absent, c: 'var(--bad)', l: 'Absent' },
      { v: s.notMarked, c: 'var(--violet)', l: 'Not marked' },
    ];
  });
  protected readonly donut = computed(() => {
    const parts = this.parts();
    const tot = parts.reduce((n, p) => n + p.v, 0) || 1;
    let acc = 0;
    return parts.map((p) => {
      const len = (C * p.v) / tot;
      const out = { ...p, dash: `${Math.max(0, len - 2)} ${C}`, offset: -acc };
      acc += len;
      return out;
    });
  });
  protected readonly byPurpose = computed<HBarItem[]>(() => {
    const m = new Map<string, number>();
    for (const v of this.log()?.items ?? []) m.set(v.purpose, (m.get(v.purpose) ?? 0) + 1);
    return [...m.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  });
  protected readonly byPlace = computed<HBarItem[]>(() =>
    this.types()
      .filter((t) => t.checkInsToday)
      .map((t) => ({ label: t.name, value: t.checkInsToday }))
      .sort((a, b) => b.value - a.value),
  );

  constructor() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const [d, t] = await Promise.all([this.api.overview(today()), this.api.types()]);
      this.day.set(d);
      this.types.set(t.items);
      this.error.set('');
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }

  /** cc.fd.exv: today's visitor log as CSV. */
  protected exportVisitors() {
    const items = this.log()?.items ?? [];
    exportCsv(
      `visitors_${today()}.csv`,
      ['Visitor', 'Mobile', 'Purpose', 'Meeting', 'In', 'Out'],
      items.map((v) => [
        v.name,
        v.mobile,
        v.purpose,
        v.toMeet ?? '',
        `${formatDate(v.checkedInAt)} ${formatTime(v.checkedInAt)}`,
        v.checkedOutAt ? `${formatDate(v.checkedOutAt)} ${formatTime(v.checkedOutAt)}` : '',
      ]),
    );
    this.overlays.toast('Visitors exported', { sub: `${plural(items.length, 'row')} · CSV` });
  }
}
