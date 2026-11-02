import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { Empty } from '../../../Shared/Blocks';
import type { DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { formatDate } from '../../../Utils/format';
import { person } from '../Applications/app-format';
import { plural } from '../Fees/fee-format';
import { problemText } from '../Structure/academic-format';
import { SearchSelect } from '../../../Shared/SearchSelect';
import {
  AttendanceApi,
  type AttendanceOverview,
  type DailyStatus,
  type MemberAttendance,
} from './attendance.api';
import { STATUS_CHIP, dayStatus } from './attendance-format';

type Mark = DailyStatus;
/** The staff groups in the picker (client 2026-10-22), beside the class-sections. */
const STAFF_GROUPS: readonly DropdownOption[] = [
  { v: '@TEACHER', l: 'Teaching staff', sub: 'Teachers and the principal' },
  { v: '@STAFF', l: 'Non-teaching staff', sub: 'Office, transport and support staff' },
];

/**
 * Manual marking (prototype manualView, cc.att.mk / allp / save; ATT-010; FR-ATT-05): one
 * class-section on a date — each student's recorded status and a Present / Absent toggle; the
 * changes are saved together after a confirmation. An override keeps the old and new status, who
 * changed it and when; every Absent tells the family. Holidays and Sundays take no attendance.
 * Staff too (client 2026-10-22): Teaching or Non-teaching staff on a date, each Present, Late, Half
 * day or Absent — corrections to what the gate or the front desk recorded.
 */
@Component({
  selector: 'rp-manual-marking',
  imports: [Empty, Icon, SearchSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <div class="c-filters" id="mk-filters">
      <div class="fld">
        <rp-search-select
          inputId="f-mk"
          placeholder="Choose a class-section or staff"
          [options]="options()"
          [value]="section()"
          (changed)="picked.emit({ section: $event, date: date() })"
        />
      </div>
      <div class="fld cc-date">
        <div class="fld-in">
          <input
            id="f-md"
            type="date"
            aria-label="Date"
            [min]="minDate()"
            [max]="maxDate()"
            [value]="date()"
            (change)="pickDate($event)"
          />
        </div>
      </div>
      <span class="fsum row g8">
        @if (count()) {
          <span>{{ plural(count(), 'change') }} not saved</span>
          <button type="button" class="btn btn-ghost btn-sm" (click)="changes.set({})">
            <span>Discard</span>
          </button>
        }
        @if (!why() && school()) {
          <button
            type="button"
            class="btn btn-sec btn-sm"
            id="mk-allp"
            [disabled]="busy() || !rows().length"
            (click)="allPresent()"
          >
            <span>Mark everyone present</span>
          </button>
          <button
            type="button"
            class="btn btn-pri btn-sm"
            id="mk-save"
            [class.is-busy]="busy()"
            [disabled]="!count() || busy()"
            (click)="save()"
          >
            <rp-icon name="check" [size]="15" /><span>{{
              count() ? 'Save ' + plural(count(), 'change') : 'Save'
            }}</span>
          </button>
        }
      </span>
    </div>

    @if (!section()) {
      <rp-empty
        icon="school"
        title="Choose a class-section or staff"
        text="Its students, or the staff, appear here."
      />
    } @else if (loading() && !roster()) {
      <div class="stack g12" aria-busy="true" aria-label="Loading">
        <div class="sk" style="height: 50px; border-radius: 12px"></div>
        <div class="sk" style="height: 320px; border-radius: 16px"></div>
      </div>
    } @else if (error()) {
      <div class="card pad">
        <rp-empty icon="alertc" title="Couldn't load the class-section" [text]="error()">
          <button type="button" class="btn btn-sec btn-sm" (click)="load()">
            <span>Try again</span>
          </button>
        </rp-empty>
      </div>
    } @else if (day()?.holiday) {
      <rp-empty
        icon="sun"
        [title]="fmt(date()) + ' is a holiday'"
        text="Attendance isn't taken on holidays."
      />
    } @else if (day()?.sunday) {
      <rp-empty icon="calendar" title="No school on this date" text="Choose a school day." />
    } @else {
      @if (why()) {
        <div class="note tone-info">
          <rp-icon name="lock" [size]="17" />
          <div class="grow">{{ why() }}</div>
        </div>
      } @else {
        <div class="note tone-info">
          <rp-icon name="history" [size]="17" />
          <div class="grow">
            Changing a recorded status keeps the old and new status, who changed it and when, in the
            attendance audit trail.
            {{
              staff()
                ? 'A staff member is told of an Absent.'
                : 'Families are told of every Absent.'
            }}
          </div>
        </div>
      }
      <div class="tbl-wrap">
        <table class="tbl dense" id="mk-table">
          <thead>
            <tr>
              <th>#</th>
              <th>{{ staff() ? 'Staff member' : 'Student' }}</th>
              <th>Recorded</th>
              <th>Mark as</th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.member.id; let i = $index) {
              <tr [class.cc-chg]="!!changes()[r.member.id]">
                <td class="t-num t-muted">{{ i + 1 }}</td>
                <td>
                  <b class="t-sb">{{ name(r) }}</b>
                  <div class="cell-s">
                    {{ staff() ? r.member.type : (r.member.admissionNo ?? '') }}
                  </div>
                </td>
                <td>
                  @if (recorded(r); as s) {
                    <span [class]="'chip dot tone-' + chip(s).tone">{{ chip(s).l }}</span>
                  } @else {
                    <span class="t-faint">Not marked</span>
                  }
                </td>
                <td>
                  <div class="cc-mkg" role="group" [attr.aria-label]="'Mark ' + name(r)">
                    @for (m of marks(); track m) {
                      <button
                        type="button"
                        class="cc-mk"
                        [class.on]="effective(r) === m"
                        [class.ok]="effective(r) === m && (m === 'PRESENT' || m === 'LATE')"
                        [class.bad]="effective(r) === m && m === 'ABSENT'"
                        [attr.aria-pressed]="effective(r) === m"
                        [disabled]="!!why() || busy()"
                        (click)="toggle(r, m)"
                      >
                        {{ chip(m).l }}
                      </button>
                    }
                  </div>
                  @if (changes()[r.member.id]; as next) {
                    <div class="cell-s">
                      {{ recorded(r) ? chip(recorded(r)!).l : 'Not marked' }} → {{ chip(next).l }}
                    </div>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="4">
                  <rp-empty
                    icon="users"
                    [title]="
                      staff() ? 'No staff of this type' : 'No students in this class-section'
                    "
                  />
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      @if (rows().length) {
        <div class="pager">
          <span>{{
            staff() ? plural(rows().length, 'person', 'people') : plural(rows().length, 'student')
          }}</span>
        </div>
      }
    }
  `,
})
export class ManualMarking {
  private readonly api = inject(AttendanceApi);
  private readonly overlays = inject(Overlays);

  readonly sections = input<readonly DropdownOption[]>([]);
  readonly section = input('');
  readonly date = input('');
  readonly minDate = input('');
  readonly maxDate = input('');
  /** Why marking is locked ('' when the user can mark). */
  readonly why = input('');
  readonly picked = output<{ section: string; date: string }>();
  readonly saved = output<void>();

  protected readonly plural = plural;
  /** Staff, not a class-section, is chosen. */
  protected readonly staff = computed(() => this.section().startsWith('@'));
  protected readonly options = computed(() => [...STAFF_GROUPS, ...this.sections()]);
  /** Students: Present or Absent; staff: every status. */
  protected readonly marks = computed<readonly Mark[]>(() =>
    this.staff() ? ['PRESENT', 'LATE', 'HALF_DAY', 'ABSENT'] : ['PRESENT', 'ABSENT'],
  );
  protected readonly roster = signal<readonly MemberAttendance[] | null>(null);
  protected readonly day = signal<AttendanceOverview | null>(null);
  protected readonly changes = signal<Readonly<Record<string, Mark>>>({});
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  private seq = 0;

  protected readonly rows = computed(() =>
    [...(this.roster() ?? [])].sort((a, b) => this.name(a).localeCompare(this.name(b))),
  );
  protected readonly count = computed(() => Object.keys(this.changes()).length);
  protected readonly school = computed(
    () => !!this.day() && !this.day()!.holiday && !this.day()!.sunday,
  );
  private readonly label = computed(
    () => this.options().find((s) => s.v === this.section())?.l ?? 'the class-section',
  );

  constructor() {
    effect(() => {
      this.section();
      this.date();
      untracked(() => {
        this.changes.set({});
        void this.load();
      });
    });
  }

  async load() {
    const section = this.section();
    const date = this.date();
    if (!section || !date) return;
    const n = ++this.seq;
    this.loading.set(true);
    try {
      const [day, r] = await Promise.all([
        this.api.overview(date),
        section.startsWith('@')
          ? this.api.reportAll({
              from: date,
              to: date,
              type: section === '@TEACHER' ? 'TEACHER' : 'STAFF',
            })
          : this.api.reportAll({ from: date, to: date, type: 'STUDENT', classSection: section }),
      ]);
      if (n !== this.seq) return;
      this.day.set(day);
      this.roster.set(r.items);
      this.error.set('');
    } catch (e) {
      if (n === this.seq) this.error.set(problemText(e));
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
  }

  protected name(r: MemberAttendance) {
    return person(r.member.name);
  }
  protected recorded(r: MemberAttendance) {
    return dayStatus(r);
  }
  protected chip(s: DailyStatus) {
    return { l: STATUS_CHIP[s].l(), tone: STATUS_CHIP[s].tone };
  }
  /** What the toggle shows: the change, else the record (late and half day count as present). */
  protected effective(r: MemberAttendance): Mark | null {
    const next = this.changes()[r.member.id];
    if (next) return next;
    const cur = dayStatus(r);
    // Staff: the recorded status itself; students: late and half day count as present.
    if (this.staff()) return cur;
    return cur === 'ABSENT' ? 'ABSENT' : cur ? 'PRESENT' : null;
  }
  protected fmt(d: string) {
    return formatDate(d);
  }

  protected pickDate(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    if (v) this.picked.emit({ section: this.section(), date: v });
  }

  /** cc.att.mk: choosing the recorded status again drops the change. */
  protected toggle(r: MemberAttendance, m: Mark) {
    if (this.why()) return;
    const cur = dayStatus(r);
    const same =
      cur === m || (!this.staff() && m === 'PRESENT' && (cur === 'LATE' || cur === 'HALF_DAY'));
    this.changes.update((c) => {
      const out = { ...c };
      if (same) delete out[r.member.id];
      else out[r.member.id] = m;
      return out;
    });
  }

  /** cc.att.allp: everyone not marked, or absent, becomes present. */
  protected allPresent() {
    const out: Record<string, Mark> = {};
    for (const r of this.rows()) {
      const s = dayStatus(r);
      if (!s || s === 'ABSENT') out[r.member.id] = 'PRESENT';
    }
    this.changes.set(out);
  }

  /** cc.att.save: confirm, then save every change at once (ATT-010). */
  protected async save() {
    const c = this.changes();
    const ids = Object.keys(c);
    if (!ids.length || this.why()) return;
    const over = this.rows().filter((r) => ids.includes(r.member.id) && dayStatus(r)).length;
    const ok = await this.overlays.confirm({
      title: `Save ${plural(ids.length, 'change')} for ${this.label()}?`,
      text: `${formatDate(this.date())}. ${
        over
          ? `${over} existing record${over === 1 ? ' is' : 's are'} overridden — the old and new status are kept in the audit trail.`
          : 'New records are created as manual attendance.'
      }`,
      ok: 'Save attendance',
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      const out = await this.api.markDaily(
        this.date(),
        ids.map((memberId) => ({ memberId, status: c[memberId]! })),
      );
      this.changes.set({});
      this.overlays.toast(`Attendance saved for ${this.label()}`, {
        sub: `${plural(out.saved + out.overridden, 'record')} · audit recorded`,
      });
      this.saved.emit();
      await this.load();
    } catch (e) {
      this.overlays.toast('Attendance not saved', { sub: problemText(e), tone: 'bad' });
    } finally {
      this.busy.set(false);
    }
  }
}
