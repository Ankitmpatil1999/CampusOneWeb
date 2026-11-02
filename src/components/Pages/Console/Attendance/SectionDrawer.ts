import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  type OnInit,
} from '@angular/core';
import { Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Modal } from '../../../Shared/Overlays';
import { formatDate } from '../../../Utils/format';
import { person } from '../Applications/app-format';
import { dlong } from '../Exams/exam-format';
import { num, problemText } from '../Structure/academic-format';
import { AttendanceApi, type MemberAttendance } from './attendance.api';
import { STATUS_CHIP, attTone, dayStatus } from './attendance-format';
import type { SectionRow } from './ConsoleAttendance';

/**
 * A class-section's attendance (prototype cc.att.drill): on a day, each student's status with the
 * counts; over a range, each student's attendance, lateness and absences, lowest first. The day's
 * drawer offers Mark attendance (the manual marking tab on this class-section and date).
 */
@Component({
  selector: 'rp-attendance-section',
  imports: [Empty, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="section().label"
      [sub]="subtitle()"
      icon="calcheck"
      [drawer]="true"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="att-drill">
        @if (mode() === 'Day') {
          <div class="row g8 wrap">
            <span class="chip dot tone-ok"
              >{{ num(section().present + section().halfDay) }} present</span
            >
            <span class="chip dot tone-warn">{{ num(section().late) }} late</span>
            <span class="chip dot tone-bad">{{ num(section().absent) }} absent</span>
            @if (section().unmarked) {
              <span class="chip dot tone-violet">{{ num(section().unmarked) }} not marked</span>
            }
          </div>
        } @else {
          <p class="t-sm t-muted">
            {{ num(days()) }} school days · {{ fmt(from()) }} – {{ fmt(to()) }}. Lowest attendance
            first.
          </p>
        }
        @if (loading()) {
          <div class="sk" style="height: 280px; border-radius: 12px" aria-busy="true"></div>
        } @else if (error()) {
          <rp-empty icon="alertc" title="Couldn't load the students" [text]="error()">
            <button type="button" class="btn btn-sec btn-sm" (click)="load()">
              <span>Try again</span>
            </button>
          </rp-empty>
        } @else if (!rows().length) {
          <rp-empty icon="users" title="No students in this class-section" />
        } @else {
          <div class="tbl-wrap">
            <table class="tbl dense" [class.cc-nowrap]="mode() === 'Day'">
              <thead>
                <tr>
                  @if (mode() === 'Day') {
                    <th>#</th>
                    <th>Student</th>
                    <th>Status</th>
                  } @else {
                    <th>Student</th>
                    <th>Attendance</th>
                    <th class="r">Late</th>
                    <th class="r">Absent</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (r of rows(); track r.member.id; let i = $index) {
                  <tr>
                    @if (mode() === 'Day') {
                      <td class="t-num t-muted">{{ i + 1 }}</td>
                    }
                    <td>
                      <b class="t-sb">{{ name(r) }}</b>
                      <div class="cell-s">{{ r.member.admissionNo ?? '' }}</div>
                    </td>
                    @if (mode() === 'Day') {
                      <td>
                        @if (chip(r); as c) {
                          <span [class]="'chip dot tone-' + c.tone">{{ c.l }}</span>
                        } @else {
                          <span class="t-faint">Not marked</span>
                        }
                      </td>
                    } @else {
                      <td style="min-width: 170px">
                        <div class="cc-pbar">
                          <span class="t-num">{{ r.percentage ?? 0 }}%</span>
                          <div [class]="'bar ' + tone(r.percentage ?? 0)">
                            <i [style.width.%]="r.percentage ?? 0"></i>
                          </div>
                        </div>
                      </td>
                      <td class="r t-num">{{ r.late }}</td>
                      <td class="r t-num">
                        @if (r.absent) {
                          <b class="t-bad">{{ r.absent }}</b>
                        } @else {
                          0
                        }
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
      <div modal-foot class="cc-foot">
        <button type="button" class="btn btn-ghost" (click)="closed.emit()">
          <span>Close</span>
        </button>
        @if (mode() === 'Day' && !markWhy()) {
          <button type="button" class="btn btn-sec" id="att-tomark" (click)="mark.emit()">
            <rp-icon name="edit" [size]="17" /><span>Mark attendance</span>
          </button>
        }
      </div>
    </rp-modal>
  `,
})
export class SectionDrawer implements OnInit {
  private readonly api = inject(AttendanceApi);

  readonly section = input.required<SectionRow>();
  readonly mode = input<'Day' | 'Range'>('Day');
  readonly date = input('');
  readonly from = input('');
  readonly to = input('');
  /** Why the signed-in user can't mark ('' when they can). */
  readonly markWhy = input('');
  readonly closed = output<void>();
  readonly mark = output<void>();

  protected readonly num = num;
  protected readonly items = signal<readonly MemberAttendance[]>([]);
  protected readonly days = signal(0);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  protected readonly subtitle = computed(() =>
    this.mode() === 'Day'
      ? dlong(this.date())
      : `${this.fmt(this.from())} – ${this.fmt(this.to())}`,
  );
  protected readonly rows = computed(() => {
    const list = [...this.items()];
    if (this.mode() === 'Day') return list.sort((a, b) => this.name(a).localeCompare(this.name(b)));
    return list.sort((a, b) => (a.percentage ?? 0) - (b.percentage ?? 0));
  });

  ngOnInit() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      const day = this.mode() === 'Day';
      const r = await this.api.reportAll({
        from: day ? this.date() : this.from(),
        to: day ? this.date() : this.to(),
        type: 'STUDENT',
        classSection: this.section().id,
      });
      this.items.set(r.items);
      this.days.set(r.schoolDays);
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected name(r: MemberAttendance) {
    return person(r.member.name);
  }
  protected chip(r: MemberAttendance) {
    const s = dayStatus(r);
    return s ? { l: STATUS_CHIP[s].l(), tone: STATUS_CHIP[s].tone } : null;
  }
  protected tone(p: number) {
    return attTone(p);
  }
  protected fmt(d: string) {
    return d ? formatDate(d) : '';
  }
}
