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
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { person } from '../Applications/app-format';
import { plural } from '../Fees/fee-format';
import { dayInYear, problemText } from '../Structure/academic-format';
import type { AcademicYear } from '../Structure/academic-year';
import type { ClassView } from '../Structure/structure.api';
import { EnrolmentsApi, type Enrolment } from './enrolments.api';

/**
 * Move one or more students to another section of their class (prototype cc.en.xfer; ACA-029): the
 * section, the date it takes effect (inside the year) and a reason (4–200); the history is kept and
 * families are told. Moving up a class happens at roll-over (ACA.TRANSFER_SAME_CLASS).
 */
@Component({
  selector: 'rp-transfer-modal',
  imports: [Dropdown, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="title()"
      [sub]="cls()?.name + ' · ' + year().label"
      icon="arrowr"
      [narrow]="false"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="xf-body">
        @if (error()) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ error() }}</div>
          </div>
        }
        <div class="fld" [class.invalid]="err('s')">
          <label class="fld-l" for="xf-s-b">Move to section<span class="req">*</span></label>
          <rp-dd
            inputId="xf-s"
            placeholder="Choose a section"
            [options]="sectionOptions()"
            [value]="sectionId()"
            (changed)="sectionId.set($event); clear('s')"
          />
          <div class="fld-e" id="xf-s-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('s') }}</span>
          </div>
        </div>
        <div class="fld" [class.invalid]="err('d')">
          <label class="fld-l" for="xf-d">Effective from<span class="req">*</span></label>
          <div class="fld-in">
            <input
              id="xf-d"
              type="date"
              aria-describedby="xf-d-e"
              [attr.min]="year().startsOn"
              [attr.max]="year().endsOn"
              [value]="date()"
              (change)="date.set(val($event)); clear('d')"
            />
          </div>
          <div class="fld-e" id="xf-d-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('d') }}</span>
          </div>
        </div>
        <div class="fld" [class.invalid]="err('r')">
          <label class="fld-l" for="xf-r">Reason<span class="req">*</span></label>
          <div class="fld-in">
            <input
              id="xf-r"
              maxlength="200"
              autocomplete="off"
              placeholder="e.g. Balancing section strength"
              aria-describedby="xf-r-e"
              [value]="reason()"
              (input)="reason.set(val($event)); clear('r')"
            />
          </div>
          <div class="fld-e" id="xf-r-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('r') }}</span>
          </div>
        </div>
        <p class="t-xs t-muted">
          The class teacher, timetable and attendance register follow the new section from the
          effective date. Families are notified.
        </p>
      </div>
      <div modal-foot class="cc-foot">
        <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="xf-go"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="save()"
        >
          <rp-icon name="check" [size]="17" /><span>Transfer</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class TransferModal implements OnInit {
  private readonly api = inject(EnrolmentsApi);
  private readonly overlays = inject(Overlays);

  /** The students to move (all of one class). */
  readonly enrolments = input.required<readonly Enrolment[]>();
  readonly classes = input.required<readonly ClassView[]>();
  readonly year = input.required<AcademicYear>();
  readonly closed = output<void>();
  readonly saved = output<number>();
  /** Some students moved before one was refused: reload the list (the dialog stays open). */
  readonly changed = output<void>();

  protected readonly sectionId = signal('');
  protected readonly date = signal('');
  protected readonly reason = signal('');
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected readonly cls = computed(
    () => this.classes().find((c) => c.id === this.enrolments()[0]?.class.id) ?? null,
  );
  protected readonly title = computed(() => {
    const e = this.enrolments();
    return e.length === 1
      ? `Transfer ${person(e[0]!.student.name)}`
      : `Transfer ${e.length} students`;
  });
  protected readonly sectionOptions = computed<DropdownOption[]>(() => {
    const now = new Set(this.enrolments().map((e) => e.section.id));
    const c = this.cls();
    return (c?.sections ?? [])
      .filter((s) => !(now.size === 1 && now.has(s.id)))
      .map((s) => ({ v: s.id, l: `${c!.name} ${s.name}`, sub: `${s.students} students` }));
  });

  ngOnInit() {
    this.date.set(dayInYear(this.year()));
  }

  protected err(k: string) {
    return this.errors()[k] ?? '';
  }
  protected clear(k: string) {
    this.error.set('');
    if (!this.errors()[k]) return;
    const e = { ...this.errors() };
    delete e[k];
    this.errors.set(e);
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }

  protected async save() {
    if (this.busy()) return;
    const y = this.year();
    const e: Record<string, string> = {};
    if (!this.sectionId()) e['s'] = translate('VALIDATION.REQUIRED');
    const d = this.date();
    if (!d) e['d'] = translate('VALIDATION.REQUIRED');
    else if (d < y.startsOn || d > y.endsOn) {
      e['d'] = translate('ACA.DATE_OUTSIDE_YEAR', {
        label: y.label,
        from: formatDate(y.startsOn),
        to: formatDate(y.endsOn),
      });
    }
    const r = this.reason().trim();
    if (r.length < 4 || r.length > 200) e['r'] = translate('ACA.REASON', { min: 4, max: 200 });
    this.errors.set(e);
    if (Object.keys(e).length) return;
    this.busy.set(true);
    let moved = 0;
    try {
      for (const x of this.enrolments()) {
        if (x.section.id === this.sectionId()) continue;
        await this.api.transfer(x.id, { sectionId: this.sectionId(), effectiveOn: d, reason: r });
        moved++;
      }
      const to = this.sectionOptions().find((o) => o.v === this.sectionId())?.l ?? '';
      this.overlays.toast(`${plural(moved, 'student')} transferred`, {
        sub: `${to} · families notified`,
      });
      this.saved.emit(moved);
    } catch (x) {
      const f = x instanceof ApiProblem ? x.errors[0] : undefined;
      const msg = f?.message ?? problemText(x);
      this.error.set(moved ? `${plural(moved, 'student')} transferred. ${msg}` : msg);
      if (moved) this.changed.emit();
    } finally {
      this.busy.set(false);
    }
  }
}
