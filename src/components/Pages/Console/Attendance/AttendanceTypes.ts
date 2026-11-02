import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { plural } from '../Fees/fee-format';
import { num, problemText } from '../Structure/academic-format';
import { AttendanceApi, type AttendanceType } from './attendance.api';
import { cooling } from './attendance-format';
import { TypeDrawer } from './TypeDrawer';

/**
 * Attendance types (prototype attTypesView; ATT-013; FR-ATT-07): the institution's places with the
 * cooling-off before the same person is counted again, the location readers set up with each and
 * today's check-ins; Add type opens the type drawer.
 */
@Component({
  selector: 'rp-attendance-types',
  imports: [Empty, Icon, TypeDrawer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <div class="row between wrap g8">
      <p class="t-sm t-muted">
        Readers and the front desk record visits against a type; each type has a cooling-off before
        the same person is counted again.
      </p>
      <span class="cp-why" [attr.title]="why() || null"
        ><button
          type="button"
          class="btn btn-pri btn-sm"
          id="at-new"
          [disabled]="!!why()"
          (click)="adding.set(true)"
        >
          <rp-icon name="plus" [size]="15" /><span>Add type</span>
        </button></span
      >
    </div>
    @if (loading() && !types()) {
      <div class="sk" style="height: 260px; border-radius: 16px" aria-busy="true"></div>
    } @else if (error()) {
      <div class="card pad">
        <rp-empty icon="alertc" title="Couldn't load the attendance types" [text]="error()">
          <button type="button" class="btn btn-sec btn-sm" (click)="load()">
            <span>Try again</span>
          </button>
        </rp-empty>
      </div>
    } @else {
      <div class="tbl-wrap">
        <table class="tbl" id="at-table">
          <thead>
            <tr>
              <th>Type</th>
              <th class="r">Cooling-off</th>
              <th class="r">Readers</th>
              <th class="r">Check-ins today</th>
            </tr>
          </thead>
          <tbody>
            @for (t of types() ?? []; track t.id) {
              <tr>
                <td>
                  <b class="t-sb">{{ t.name }}</b>
                </td>
                <td class="r">{{ cooling(t.cooldownSeconds) }}</td>
                <td class="r">{{ num(t.readers) }}</td>
                <td class="r">{{ num(t.checkInsToday) }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="4">
                  <rp-empty
                    icon="layers"
                    title="No attendance types yet"
                    text="Add a place such as the library or the sick room."
                  />
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      @if (types()?.length) {
        <div class="pager">
          <span>{{ plural(types()!.length, 'type') }}</span>
        </div>
      }
    }
    @if (adding()) {
      <rp-attendance-type-drawer
        [others]="types() ?? []"
        (closed)="adding.set(false)"
        (added)="adding.set(false); load()"
      />
    }
  `,
})
export class AttendanceTypes {
  private readonly api = inject(AttendanceApi);

  /** Why types can't be added ('' when they can). */
  readonly why = input('');

  protected readonly num = num;
  protected readonly plural = plural;
  protected readonly cooling = cooling;
  protected readonly types = signal<readonly AttendanceType[] | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly adding = signal(false);

  constructor() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.types.set((await this.api.types()).items);
      this.error.set('');
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }
}
