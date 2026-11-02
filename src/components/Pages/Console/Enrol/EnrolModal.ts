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
import { type DropdownOption } from '../../../Shared/Dropdown';
import { Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { person } from '../Applications/app-format';
import { StudentSelect, type StudentOption } from '../FeeRecords/StudentSelect';
import { dayInYear, problemText } from '../Structure/academic-format';
import type { AcademicYear } from '../Structure/academic-year';
import { SearchSelect } from '../../../Shared/SearchSelect';
import type { ClassView } from '../Structure/structure.api';
import { EnrolmentsApi, type Enrolment } from './enrolments.api';

/**
 * Enrol a student (prototype cc.en.new; ACA-028; FR-ACA-04): an active student not yet enrolled
 * this year, the class-section and the date (inside the year). One enrolment per student and year;
 * the student and their parents are told.
 */
@Component({
  selector: 'rp-enrol-modal',
  imports: [Empty, Icon, Modal, SearchSelect, StudentSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      title="Enrol a student"
      [sub]="year().label + ' · one enrolment per student per year'"
      icon="grad"
      [narrow]="false"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      @if (notEnrolled() === 0) {
        <rp-empty
          icon="checkc"
          [title]="'Every active student is enrolled in ' + year().label"
          text="New admissions are enrolled when the counsellor approves them."
        />
      } @else {
        <div class="stack g16" id="ne-body">
          @if (error()) {
            <div class="note tone-bad" role="alert">
              <rp-icon name="alertc" [size]="17" />
              <div class="grow">{{ error() }}</div>
            </div>
          }
          <div class="fld" [class.invalid]="err('m')">
            <label class="fld-l" for="ne-m-b">Student<span class="req">*</span></label>
            <rp-student-select
              inputId="ne-m"
              [exclude]="enrolled()"
              [value]="student()"
              (valueChange)="student.set($event); clear('m')"
            />
            <div class="fld-e" id="ne-m-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('m') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('k')">
            <label class="fld-l" for="ne-k-b">Class-section<span class="req">*</span></label>
            <rp-search-select
              inputId="ne-k"
              placeholder="Choose"
              empty="No class-sections yet"
              [options]="sectionOptions()"
              [value]="sectionId()"
              (changed)="sectionId.set($event); clear('k')"
            />
            <div class="fld-e" id="ne-k-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('k') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('d')">
            <label class="fld-l" for="ne-d">Enrolled from<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="ne-d"
                type="date"
                aria-describedby="ne-d-e"
                [attr.min]="year().startsOn"
                [attr.max]="year().endsOn"
                [value]="date()"
                (change)="date.set(val($event)); clear('d')"
              />
            </div>
            <div class="fld-e" id="ne-d-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('d') }}</span>
            </div>
          </div>
          <p class="t-xs t-muted">The student and their parents are notified.</p>
        </div>
      }
      <div modal-foot class="cc-foot">
        @if (notEnrolled() === 0) {
          <button type="button" class="btn btn-sec" (click)="closed.emit()">
            <span>Close</span>
          </button>
        } @else {
          <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="closed.emit()">
            <span>Cancel</span>
          </button>
          <button
            type="button"
            class="btn btn-pri"
            id="ne-go"
            [class.is-busy]="busy()"
            [disabled]="busy()"
            (click)="save()"
          >
            <rp-icon name="check" [size]="17" /><span>Enrol</span>
          </button>
        }
      </div>
    </rp-modal>
  `,
})
export class EnrolModal implements OnInit {
  private readonly api = inject(EnrolmentsApi);
  private readonly overlays = inject(Overlays);

  readonly year = input.required<AcademicYear>();
  readonly classes = input.required<readonly ClassView[]>();
  /** Students already enrolled this year (not offered). */
  readonly enrolled = input<readonly string[]>([]);
  /** Active students not enrolled yet, when known (0 shows "everyone is enrolled"). */
  readonly notEnrolled = input<number | null>(null);
  readonly closed = output<void>();
  readonly saved = output<Enrolment>();

  protected readonly student = signal<StudentOption | null>(null);
  protected readonly sectionId = signal('');
  protected readonly date = signal('');
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected readonly sectionOptions = computed<DropdownOption[]>(() =>
    [...this.classes()]
      .sort((a, b) => a.order - b.order)
      .flatMap((c) =>
        c.sections.map((s) => ({
          v: s.id,
          l: `${c.name} ${s.name}`,
          sub: `${s.students} students`,
        })),
      ),
  );

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
    if (!this.student()) e['m'] = translate('VALIDATION.REQUIRED');
    if (!this.sectionId()) e['k'] = translate('VALIDATION.REQUIRED');
    const d = this.date();
    if (!d) e['d'] = translate('VALIDATION.REQUIRED');
    else if (d < y.startsOn || d > y.endsOn) {
      e['d'] = translate('ACA.DATE_OUTSIDE_YEAR', {
        label: y.label,
        from: formatDate(y.startsOn),
        to: formatDate(y.endsOn),
      });
    }
    this.errors.set(e);
    if (Object.keys(e).length) return;
    this.busy.set(true);
    try {
      const out = await this.api.enrol({
        yearId: y.id,
        studentId: this.student()!.id,
        sectionId: this.sectionId(),
        enrolledOn: d,
      });
      this.overlays.toast('Student enrolled', {
        sub: `${person(out.student.name)} · ${out.class.name} ${out.section.name} · family notified`,
      });
      this.saved.emit(out);
    } catch (x) {
      if (x instanceof ApiProblem && /ALREADY_ENROLLED|NOT_A_STUDENT/.test(x.code)) {
        this.errors.set({ m: x.detail });
      } else if (x instanceof ApiProblem && x.errors.some((f) => f.field === 'enrolledOn')) {
        this.errors.set({ d: x.errors.find((f) => f.field === 'enrolledOn')!.message });
      } else if (x instanceof ApiProblem && x.errors.some((f) => f.field === 'studentId')) {
        this.errors.set({ m: x.errors.find((f) => f.field === 'studentId')!.message });
      } else this.error.set(problemText(x));
    } finally {
      this.busy.set(false);
    }
  }
}
