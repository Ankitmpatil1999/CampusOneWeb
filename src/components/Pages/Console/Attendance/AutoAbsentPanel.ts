import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Empty, Kpi } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { Pager } from '../../../Shared/Pager';
import { formatDate, formatTime } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { plural } from '../Fees/fee-format';
import { minutesOf, nowMinutes, num, problemText, t12, today } from '../Structure/academic-format';
import { AttendanceApi, type AttendanceOverview, type AutoAbsent } from './attendance.api';
import { StaffTimings } from './StaffTimings';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const PAGE = 8;

/**
 * Auto-absent (prototype autoAbsentView, cc.aa.set; ATT-011, ATT-012; FR-ATT-06; OQ-14): who has no
 * record today and in which class-sections, the cut-off, and the settings — on or off, the cut-off
 * time (07:00–18:00) and whether staff are included. Once the cut-off has passed on a school day the
 * scheduled run marks each of them Absent and tells the families; its runs are listed below. The
 * staff timings by role (client 2026-10-23) sit between the settings and the runs.
 */
@Component({
  selector: 'rp-auto-absent',
  imports: [Empty, Icon, Kpi, Pager, StaffTimings],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @if (loading() && !setting()) {
      <div class="c-grid s21" aria-busy="true" aria-label="Loading">
        <div class="sk" style="height: 330px; border-radius: 16px"></div>
        <div class="sk" style="height: 330px; border-radius: 16px"></div>
      </div>
    } @else if (error()) {
      <div class="card pad">
        <rp-empty icon="alertc" title="Couldn't load auto-absent" [text]="error()">
          <button type="button" class="btn btn-sec btn-sm" (click)="load()">
            <span>Try again</span>
          </button>
        </rp-empty>
      </div>
    } @else if (setting(); as a) {
      <div class="c-grid s21">
        <div class="card pad stack g16" id="aa-today">
          <div class="row g12">
            <span class="li-ic" style="background: var(--violet-soft); color: var(--violet)"
              ><rp-icon name="timer" [size]="20"
            /></span>
            <div class="grow">
              <h3 class="t-h3">Mark absent everyone without a record today</h3>
              <p class="t-sm t-muted">
                Each is marked Absent and their family gets an attendance alert. The run starts by
                itself every 15 minutes once the cut-off has passed on a school day, and never marks
                anyone twice.
              </p>
            </div>
          </div>
          <div class="c-grid k3 cc-kp">
            <rp-kpi
              label="Without a record"
              icon="hourglass"
              tone="violet"
              [value]="num(pending())"
            />
            <rp-kpi
              label="Class-sections affected"
              icon="school"
              [value]="num(affected().length)"
            />
            <rp-kpi
              label="Cut-off"
              icon="clock"
              [value]="t12(a.cutoff)"
              [delta]="early() ? 'Not reached yet' : 'Passed'"
            />
          </div>
          @if (affected().length) {
            <div class="row g6 wrap">
              @for (s of affected().slice(0, 18); track s.id) {
                <span class="tag"
                  >{{ s.label }} <b class="t-num">{{ s.n }}</b></span
                >
              }
              @if (affected().length > 18) {
                <span class="t-xs t-muted">+{{ affected().length - 18 }} more</span>
              }
            </div>
          }
          <div class="row between wrap g8">
            <span class="t-sm t-muted" id="aa-state">{{ state() }}</span>
            <span [class]="'chip dot tone-' + (a.enabled ? 'ok' : 'neutral')">{{
              a.enabled ? 'On' : 'Off'
            }}</span>
          </div>
        </div>

        <div class="card pad stack g12" id="aa-settings">
          <h3 class="t-h4">Settings</h3>
          <label class="chk"
            ><input
              type="checkbox"
              id="aa-on"
              [checked]="enabled()"
              [disabled]="!!why()"
              (change)="enabled.set(checked($event))"
            /><span>Mark absent at the cut-off</span></label
          >
          <div class="fld" [class.invalid]="cutError()">
            <label class="fld-l" for="aa-cut">Cut-off time</label>
            <div class="fld-in">
              <input
                id="aa-cut"
                type="time"
                aria-describedby="aa-cut-e aa-cut-h"
                [value]="cutoff()"
                [readOnly]="!!why()"
                (input)="cutoff.set(val($event)); cutError.set('')"
              />
            </div>
            <div class="fld-e" id="aa-cut-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ cutError() }}</span>
            </div>
            <div class="fld-h" id="aa-cut-h">
              Between 7:00 AM and 6:00 PM, after the late cut-off
            </div>
          </div>
          <label class="chk"
            ><input
              type="checkbox"
              id="aa-staff"
              [checked]="staff()"
              [disabled]="!!why()"
              (change)="staff.set(checked($event))"
            /><span>Include staff</span></label
          >
          <p class="t-xs t-muted">
            Students are always included; staff only when ticked (OQ-14). Staff in a role with its
            own timing (below) follow that timing instead.
          </p>
          @if (!why()) {
            <button
              type="button"
              class="btn btn-sec btn-sm"
              id="aa-save"
              [class.is-busy]="busy()"
              [disabled]="busy()"
              (click)="save()"
            >
              <span>Save settings</span>
            </button>
          }
        </div>
      </div>

      <rp-staff-timings [why]="why()" />

      <div class="sec-h"><h3>Run history</h3></div>
      <div class="tbl-wrap">
        <table class="tbl" id="aa-runs">
          <thead>
            <tr>
              <th>Run at</th>
              <th>Started by</th>
              <th>For</th>
              <th>School day</th>
              <th class="r">Marked absent</th>
            </tr>
          </thead>
          <tbody>
            @for (r of shownRuns(); track $index) {
              <tr>
                <td>{{ r.ranAt ? fmt(r.ranAt) : fmtDay(r.date) }}</td>
                <td>System</td>
                <td>{{ r.timing ?? 'Cut-off' }}</td>
                <td>
                  @if (r.skippedHoliday) {
                    <span class="t-faint">Holiday — not run</span>
                  } @else {
                    {{ fmtDay(r.date) }}
                  }
                </td>
                <td class="r">{{ num(r.marked) }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="5">
                  <rp-empty
                    icon="timer"
                    title="No runs yet"
                    text="Runs appear here once auto-absent is on and its cut-off has passed."
                  />
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      @if (a.runs.length > pageSize) {
        <rp-pager
          [total]="a.runs.length"
          [page]="page()"
          [size]="pageSize"
          (go)="page.set($event)"
        />
      } @else if (a.runs.length) {
        <div class="pager">
          <span>{{ plural(a.runs.length, 'run') }}</span>
        </div>
      }
    }
  `,
})
export class AutoAbsentPanel {
  private readonly api = inject(AttendanceApi);
  private readonly overlays = inject(Overlays);

  /** Why the settings can't change ('' when they can). */
  readonly why = input('');
  /** The year in context is closed ('' when open). */
  readonly closedWhy = input('');

  protected readonly num = num;
  protected readonly plural = plural;
  protected readonly t12 = t12;
  protected readonly pageSize = PAGE;
  protected readonly setting = signal<AutoAbsent | null>(null);
  private readonly day = signal<AttendanceOverview | null>(null);
  protected readonly enabled = signal(false);
  protected readonly cutoff = signal('11:00');
  protected readonly staff = signal(false);
  protected readonly cutError = signal('');
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly page = signal(1);

  protected readonly early = computed(() => {
    const a = this.setting();
    return !!a && nowMinutes() < minutesOf(a.cutoff);
  });
  /** Today is a holiday or a Sunday: no one is marked. */
  private readonly noSchool = computed(() => !!this.day()?.holiday || !!this.day()?.sunday);
  protected readonly affected = computed(() =>
    (this.noSchool() ? [] : (this.day()?.sections ?? []))
      .filter((s) => s.notMarked > 0)
      .map((s) => ({ id: s.section.id, label: s.section.label, n: s.notMarked })),
  );
  protected readonly pending = computed(() => {
    const d = this.day();
    if (!d || this.noSchool()) return 0;
    const staff = this.setting()?.appliesTo.includes('STAFF')
      ? d.staff.teachers.notMarked + d.staff.others.notMarked
      : 0;
    return d.students.notMarked + staff;
  });
  protected readonly ranToday = computed(
    () => this.setting()?.runs.find((r) => r.date === today()) ?? null,
  );
  /** cc why: off, not a school day, already run, before the cut-off, or who will be marked. */
  protected readonly state = computed(() => {
    const a = this.setting();
    const d = this.day();
    if (!a) return '';
    if (!a.enabled) return 'Auto-absent is off — turn it on in Settings.';
    if (this.closedWhy()) return this.closedWhy();
    if (d && (d.holiday || d.sunday)) return 'Today isn’t a school day, so no one is marked.';
    const ran = this.ranToday();
    if (ran)
      return `Already run today${ran.ranAt ? ' at ' + formatTime(ran.ranAt) : ''} — ${plural(ran.marked, 'member')} marked absent.`;
    if (!this.pending()) return 'Everyone has a record today.';
    return `${plural(this.pending(), 'member')} will be marked absent ${
      this.early() ? 'at ' + t12(a.cutoff) : 'at the next run'
    }.`;
  });
  protected readonly shownRuns = computed(() =>
    (this.setting()?.runs ?? []).slice((this.page() - 1) * PAGE, this.page() * PAGE),
  );

  constructor() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const [a, d] = await Promise.all([this.api.autoAbsent(), this.api.overview(today())]);
      this.apply(a);
      this.day.set(d);
      this.error.set('');
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }

  private apply(a: AutoAbsent) {
    this.setting.set(a);
    this.enabled.set(a.enabled);
    this.cutoff.set(a.cutoff);
    this.staff.set(a.appliesTo.includes('STAFF'));
  }

  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected checked(e: Event) {
    return (e.target as HTMLInputElement).checked;
  }
  protected fmt(iso: string) {
    return `${formatDate(iso)}, ${formatTime(iso)}`;
  }
  protected fmtDay(d: string) {
    return formatDate(d);
  }

  /** cc.aa.set: check the cut-off, then save (If-Match). */
  protected async save() {
    const a = this.setting();
    if (!a || this.why()) return;
    const cut = this.cutoff().slice(0, 5);
    if (!cut) {
      this.cutError.set('Enter a cut-off time');
      return;
    }
    if (!TIME.test(cut) || cut < '07:00' || cut > '18:00') {
      this.cutError.set(translate('ATT.CUTOFF'));
      return;
    }
    this.busy.set(true);
    try {
      const out = await this.api.setAutoAbsent(a.version, {
        enabled: this.enabled(),
        cutoff: cut,
        appliesTo: this.staff() ? ['STUDENTS', 'STAFF'] : ['STUDENTS'],
      });
      this.apply(out);
      this.overlays.toast('Auto-absent settings saved', {
        sub: `${out.enabled ? 'On' : 'Off'} · cut-off ${t12(out.cutoff)}${
          out.appliesTo.includes('STAFF') ? ' · staff included' : ' · students only'
        }`,
      });
    } catch (e) {
      if (e instanceof ApiProblem && e.errors.some((f) => f.field === 'cutoff')) {
        this.cutError.set(e.errors.find((f) => f.field === 'cutoff')!.message);
      } else {
        this.overlays.toast('Settings not saved', { sub: problemText(e), tone: 'bad' });
        if (e instanceof ApiProblem && e.status === 412) void this.load();
      }
    } finally {
      this.busy.set(false);
    }
  }
}
