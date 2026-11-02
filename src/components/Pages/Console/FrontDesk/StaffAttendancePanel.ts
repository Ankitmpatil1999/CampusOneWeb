import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Avatar } from '../../../Shared/Avatar';
import { Empty, Kpi } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { formatTime } from '../../../Utils/format';
import { person } from '../Applications/app-format';
import { AttendanceApi, type StaffDay, type StaffRoster } from '../Attendance/attendance.api';
import { STATUS_CHIP } from '../Attendance/attendance-format';
import { num, problemText } from '../Structure/academic-format';
import { CardTaker, type TapLine } from '../Teaching/CardTaker';

type Who = 'ALL' | 'TEACHING' | 'OTHERS';
const REFRESH_MS = 30_000;

/**
 * Staff attendance at the front desk (client 2026-10-22; ATT-029…031): teachers, the principal and
 * non-teaching staff check in and out by tapping their card on the desk's USB reader (CampusOne Card
 * Reader), or the desk checks them in or out by name when they have no card with them. Today's list
 * shows each one's status and times; the same records reach the console's attendance pages, the
 * principal and the staff member's own app. Another day is changed in Attendance → Manual marking.
 */
@Component({
  selector: 'rp-staff-attendance',
  imports: [Avatar, CardTaker, Empty, Icon, Kpi],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack g16" id="sa">
      @if (loading() && !roster()) {
        <div class="stack g16" aria-busy="true" aria-label="Loading">
          <div class="c-grid k4 cc-kp">
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="sk" style="height: 104px; border-radius: 16px"></div>
            }
          </div>
          <div class="sk" style="height: 300px; border-radius: 16px"></div>
        </div>
      } @else if (error() && !roster()) {
        <div class="card pad">
          <rp-empty icon="alertc" title="Couldn't load staff attendance" [text]="error()">
            <button type="button" class="btn btn-sec btn-sm" (click)="load()">
              <span>Try again</span>
            </button>
          </rp-empty>
        </div>
      } @else if (roster(); as r) {
        <div class="c-grid k4 cc-kp" id="sa-kpis">
          <rp-kpi label="Staff" icon="users" [value]="num(r.counts.total)" />
          <rp-kpi label="On campus now" icon="door" tone="brand" [value]="num(r.counts.onCampus)" />
          <rp-kpi label="Late today" icon="clock" tone="warn" [value]="num(r.counts.late)" />
          <rp-kpi label="Not in yet" icon="hourglass" [value]="num(r.counts.notMarked)" />
        </div>
        @if (!why()) {
          <rp-card-taker [handle]="handle" [texts]="cardTexts" />
        }
        <div class="c-filters">
          <div class="pills" role="group" aria-label="Staff">
            @for (p of pills; track p.v) {
              <button
                type="button"
                class="pill"
                [class.on]="who() === p.v"
                [attr.aria-pressed]="who() === p.v"
                (click)="who.set(p.v)"
              >
                {{ p.l }}<span class="n">{{ num(countOf(p.v)) }}</span>
              </button>
            }
          </div>
          <label class="search"
            ><rp-icon name="search" [size]="16" /><input
              type="search"
              id="sa-q"
              placeholder="Name"
              aria-label="Search staff"
              autocomplete="off"
              [value]="q()"
              (input)="q.set(val($event))"
          /></label>
          <span class="fsum">Another day is changed in Attendance → Manual marking.</span>
        </div>
        <div class="tbl-wrap">
          <table class="tbl" id="sa-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>In</th>
                <th>Out</th>
                <th>Recorded</th>
                <th class="r">Action</th>
              </tr>
            </thead>
            <tbody>
              @for (s of rows(); track s.member.id) {
                <tr>
                  <td>
                    <div class="cell-main">
                      <rp-av [name]="person(s.member.name)" size="sm" />
                      <div style="min-width: 0">
                        <div class="cell-t t-clip">{{ person(s.member.name) }}</div>
                        <div class="cell-s t-clip">
                          {{ s.member.type }}{{ s.member.hasCard ? '' : ' · no card' }}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    @if (chip(s); as c) {
                      <span [class]="'chip dot tone-' + c.tone">{{ c.l }}</span>
                    } @else if (s.onApprovedLeave) {
                      <span class="chip dot tone-info">On leave</span>
                    } @else {
                      <span class="t-faint">Not in yet</span>
                    }
                  </td>
                  <td class="t-num">{{ s.checkInAt ? time(s.checkInAt) : '—' }}</td>
                  <td class="t-num">{{ s.checkOutAt ? time(s.checkOutAt) : '—' }}</td>
                  <td>
                    <span [attr.title]="s.remark || null">{{ how(s) }}</span>
                  </td>
                  <td class="r">
                    @if (canIn(s)) {
                      <span class="cp-why" [attr.title]="why() || null"
                        ><button
                          type="button"
                          class="btn btn-sec btn-sm"
                          [class.is-busy]="busy() === s.member.id"
                          [disabled]="!!why() || !!busy()"
                          (click)="check(s, 'IN')"
                        >
                          <rp-icon name="checkc" [size]="15" /><span>Check in</span>
                        </button></span
                      >
                    } @else if (canOut(s)) {
                      <span class="cp-why" [attr.title]="why() || null"
                        ><button
                          type="button"
                          class="btn btn-ghost btn-sm"
                          [class.is-busy]="busy() === s.member.id"
                          [disabled]="!!why() || !!busy()"
                          (click)="check(s, 'OUT')"
                        >
                          <rp-icon name="logout" [size]="15" /><span>Check out</span>
                        </button></span
                      >
                    } @else {
                      <span class="t-faint">—</span>
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6">
                    <rp-empty
                      icon="users"
                      title="No staff found"
                      text="Teachers, the principal and other staff appear here."
                    />
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class StaffAttendancePanel {
  private readonly api = inject(AttendanceApi);
  private readonly overlays = inject(Overlays);

  /** Why this user can't record staff attendance ('' when they can: attendance.mark). */
  readonly why = input('');

  protected readonly num = num;
  protected readonly person = person;
  protected readonly pills: readonly { v: Who; l: string }[] = [
    { v: 'ALL', l: 'All staff' },
    { v: 'TEACHING', l: 'Teaching' },
    { v: 'OTHERS', l: 'Non-teaching' },
  ];
  protected readonly cardTexts = {
    title: 'Staff cards',
    off: 'Start the reader, then each staff member taps their card: the first tap checks them in, the next checks them out.',
    on: 'Reading cards — each staff member taps their card on the reader.',
    count: (n: number) => `${n} recorded by card`,
  };

  protected readonly roster = signal<StaffRoster | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal<string | null>(null);
  protected readonly who = signal<Who>('ALL');
  protected readonly q = signal('');
  private seq = 0;

  protected readonly rows = computed(() => {
    const q = this.q().trim().toLowerCase();
    const who = this.who();
    return (this.roster()?.items ?? []).filter(
      (s) =>
        (who === 'ALL' || (who === 'TEACHING') === s.member.teaching) &&
        (!q || s.member.name.toLowerCase().includes(q)),
    );
  });

  constructor() {
    void this.load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void this.load();
    }, REFRESH_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  async load() {
    const n = ++this.seq;
    if (!this.roster()) this.loading.set(true);
    try {
      const r = await this.api.staff();
      if (n !== this.seq) return;
      this.roster.set(r);
      this.error.set('');
    } catch (e) {
      if (n === this.seq) this.error.set(problemText(e));
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
  }

  protected countOf(w: Who) {
    const items = this.roster()?.items ?? [];
    return w === 'ALL'
      ? items.length
      : items.filter((s) => (w === 'TEACHING') === s.member.teaching).length;
  }
  protected chip(s: StaffDay) {
    if (!s.status) return null;
    const c = STATUS_CHIP[s.status];
    return { l: c.l(), tone: c.tone };
  }
  protected canIn(s: StaffDay) {
    return !s.checkInAt;
  }
  protected canOut(s: StaffDay) {
    return !!s.checkInAt && !s.checkOutAt && s.status !== 'ABSENT' && s.status !== 'HALF_DAY';
  }
  protected how(s: StaffDay) {
    if (!s.method) return '—';
    return s.method === 'NFC' ? 'Card' : 'By hand';
  }
  protected time(iso: string) {
    return formatTime(iso);
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }

  /** A staff card on the reader (ATT-030). */
  protected readonly handle = async (token: string): Promise<TapLine> => {
    try {
      const out = await this.api.staffTap(token);
      void this.load();
      const status = STATUS_CHIP[out.status].l();
      return out.result === 'COMPLETE'
        ? {
            tone: 'info',
            name: person(out.member.name),
            text: `Already checked out today · ${status}`,
          }
        : {
            tone: 'ok',
            name: person(out.member.name),
            text: `${out.result === 'CHECKED_IN' ? 'Checked in' : 'Checked out'} · ${status}`,
          };
    } catch (e) {
      return { tone: 'bad', name: null, text: problemText(e) };
    }
  };

  /** Check in or out by name (ATT-031), with an optional reason kept with the record. */
  protected async check(s: StaffDay, action: 'IN' | 'OUT') {
    if (this.why() || this.busy()) return;
    const name = person(s.member.name);
    const res = await this.overlays.confirm({
      title: action === 'IN' ? `Check ${name} in?` : `Check ${name} out?`,
      text: `Now, ${formatTime(new Date())}. The time decides the status, as at the gate.`,
      ok: action === 'IN' ? 'Check in' : 'Check out',
      reason: {
        label: 'Reason (optional)',
        placeholder: action === 'IN' ? 'e.g. Forgot the card' : 'e.g. Left early for a meeting',
        max: 200,
        required: false,
      },
    });
    if (!res) return;
    this.busy.set(s.member.id);
    try {
      const out = await this.api.staffCheck(s.member.id, action, res.reason?.trim() || null);
      this.overlays.toast(action === 'IN' ? `${name} checked in` : `${name} checked out`, {
        sub: `${STATUS_CHIP[out.status].l()} · ${formatTime(out.at)}`,
      });
      await this.load();
    } catch (e) {
      this.overlays.toast(action === 'IN' ? 'Not checked in' : 'Not checked out', {
        sub: problemText(e),
        tone: 'bad',
      });
      void this.load();
    } finally {
      this.busy.set(null);
    }
  }
}
