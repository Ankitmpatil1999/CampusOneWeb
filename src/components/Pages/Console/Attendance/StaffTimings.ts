import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { num, problemText, t12 } from '../Structure/academic-format';
import { AttendanceApi, type StaffTiming, type StaffTimingRole } from './attendance.api';
import { StaffTimingDrawer } from './StaffTimingDrawer';

/**
 * Staff timings by role on the Auto-absent page (client 2026-10-23; ATT-033…036): the school's
 * working day for staff — login and logout, late login, early logout, half-day and absent times —
 * as many timings as it needs, each for one or more roles. Add, change and remove.
 */
@Component({
  selector: 'rp-staff-timings',
  imports: [Empty, Icon, StaffTimingDrawer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <div class="sec-h row between wrap g8">
      <h3>Staff timings</h3>
      <span class="cp-why" [attr.title]="blocked() || null"
        ><button
          type="button"
          class="btn btn-pri btn-sm"
          id="st-new"
          [disabled]="!!blocked()"
          (click)="editing.set('new')"
        >
          <rp-icon name="plus" [size]="15" /><span>Add timing</span>
        </button></span
      >
    </div>
    <p class="t-sm t-muted">
      Staff only. Each timing is for one or more roles. Staff with no login by its absent time are
      marked Absent. Someone whose roles are in two timings follows the one higher in the list;
      staff in none follow the settings above.
    </p>
    @if (loading() && !items()) {
      <div class="sk" style="height: 160px; border-radius: 16px" aria-busy="true"></div>
    } @else if (error()) {
      <div class="card pad">
        <rp-empty icon="alertc" title="Couldn't load the staff timings" [text]="error()">
          <button type="button" class="btn btn-sec btn-sm" (click)="load()">
            <span>Try again</span>
          </button>
        </rp-empty>
      </div>
    } @else {
      <div class="tbl-wrap">
        <table class="tbl" id="st-table">
          <thead>
            <tr>
              <th>Timing</th>
              <th>Login – logout</th>
              <th>Late after</th>
              <th>Half day after</th>
              <th>Absent after</th>
              <th>Early logout before</th>
              <th class="r">Staff</th>
              <th class="r">Action</th>
            </tr>
          </thead>
          <tbody>
            @for (t of items() ?? []; track t.id) {
              <tr [attr.data-timing]="t.id">
                <td>
                  <b class="t-sb">{{ t.name }}</b>
                  <div class="t-xs t-muted">{{ roleNames(t) }}</div>
                </td>
                <td>{{ t12(t.loginTime) }} – {{ t12(t.logoutTime) }}</td>
                <td>{{ t12(t.lateLoginTime) }}</td>
                <td>{{ t12(t.halfDayTime) }}</td>
                <td>{{ t12(t.absentTime) }}</td>
                <td>{{ t12(t.earlyLogoutTime) }}</td>
                <td class="r t-num">{{ num(t.staff) }}</td>
                <td class="r">
                  @if (!why()) {
                    <div class="row g6" style="justify-content: flex-end">
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs"
                        [attr.data-edit]="t.id"
                        (click)="editing.set(t)"
                      >
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs"
                        [attr.data-remove]="t.id"
                        (click)="remove(t)"
                      >
                        <span>Delete</span>
                      </button>
                    </div>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="8">
                  <rp-empty
                    icon="clock"
                    title="No staff timings yet"
                    text="Add one for roles such as Teacher or Front desk."
                  />
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
    @if (editing(); as e) {
      <rp-staff-timing-drawer
        [timing]="e === 'new' ? null : e"
        [timings]="items() ?? []"
        [roles]="roles()"
        (closed)="editing.set(null)"
        (saved)="editing.set(null); load()"
      />
    }
  `,
})
export class StaffTimings {
  private readonly api = inject(AttendanceApi);
  private readonly overlays = inject(Overlays);

  /** Why the timings can't change ('' when they can). */
  readonly why = input('');

  protected readonly num = num;
  protected readonly t12 = t12;
  protected readonly items = signal<readonly StaffTiming[] | null>(null);
  protected readonly roles = signal<readonly StaffTimingRole[]>([]);
  protected readonly editing = signal<StaffTiming | 'new' | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  /** Why Add timing can't be used ('' when it can): no access, or the list (and roles) not loaded. */
  protected readonly blocked = computed(
    () =>
      this.why() ||
      (this.items()
        ? ''
        : this.error()
          ? 'The staff timings couldn’t be loaded — try again below'
          : 'Loading the staff timings…'),
  );

  constructor() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const r = await this.api.staffTimings();
      this.items.set(r.items);
      this.roles.set(r.roles);
      this.error.set('');
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected roleNames(t: StaffTiming) {
    return t.roles.map((r) => r.name).join(', ');
  }

  protected async remove(t: StaffTiming) {
    const ok = await this.overlays.confirm({
      title: `Delete “${t.name}”?`,
      text: `${t.staff === 1 ? 'Its 1 staff member follows' : `Its ${num(t.staff)} staff follow`} the settings above from now on.`,
      ok: 'Delete timing',
      tone: 'bad',
    });
    if (!ok) return;
    try {
      await this.api.deleteStaffTiming(t.id);
      this.overlays.toast('Staff timing deleted', { sub: t.name });
      await this.load();
    } catch (e) {
      this.overlays.toast("Couldn't delete the timing", { sub: problemText(e), tone: 'bad' });
    }
  }
}
