import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { translate } from '../../../Utils/translate';
import { person } from '../Applications/app-format';
import { plural } from '../Fees/fee-format';
import { problemText } from '../Structure/academic-format';
import type { AcademicYear } from '../Structure/academic-year';
import { SearchSelect } from '../../../Shared/SearchSelect';
import type { SubjectView } from '../Structure/structure.api';
import { TeachersApi, type AssignmentList, type TeacherOption } from './teachers.api';

export interface SectionChoice {
  readonly id: string;
  readonly label: string;
}

/**
 * Assign a subject teacher (prototype cc.as.new / cc.as.save; ACA-022): a teacher, a subject and the
 * class-sections they teach it in. The subject must be mapped to each class (ACA.SUBJECT_NOT_MAPPED)
 * and the same assignment can't be made twice; nothing is saved if any section is refused.
 */
@Component({
  selector: 'rp-subject-teacher-drawer',
  imports: [Dropdown, Icon, Modal, SearchSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      title="Assign a subject teacher"
      [sub]="year().label + ' · teacher, subject and the class-sections they teach'"
      icon="briefcase"
      [drawer]="true"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="st-body">
        @if (error()) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow"><b>Nothing was saved.</b><br />{{ error() }}</div>
          </div>
        }
        <div class="c-form">
          <div class="fld" [class.invalid]="err('t')">
            <label class="fld-l" for="as-t-b">Teacher<span class="req">*</span></label>
            <rp-search-select
              inputId="as-t"
              placeholder="Choose a teacher"
              empty="No active teachers yet"
              [options]="teacherOptions()"
              [value]="teacherId()"
              (changed)="teacherId.set($event); clear('t')"
            />
            <div class="fld-e" id="as-t-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('t') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('s')">
            <label class="fld-l" for="as-s-b">Subject<span class="req">*</span></label>
            <rp-dd
              inputId="as-s"
              placeholder="Choose a subject"
              [options]="subjectOptions()"
              [value]="subjectId()"
              (changed)="subjectId.set($event); clear('s')"
            />
            <div class="fld-e" id="as-s-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('s') }}</span>
            </div>
          </div>
        </div>
        <div class="fs">
          <h4><rp-icon name="users" [size]="16" />Class-sections</h4>
          <div class="fs-b">
            <div class="cc-checks cols" id="as-sections">
              @for (s of sections(); track s.id) {
                <label class="chk"
                  ><input
                    type="checkbox"
                    [checked]="picked().has(s.id)"
                    (change)="toggle(s.id)"
                  /><span>{{ s.label }}</span></label
                >
              } @empty {
                <p class="t-sm t-muted">No class-sections yet.</p>
              }
            </div>
            @if (err('k')) {
              <div class="fld invalid" style="margin-top: 10px">
                <div class="fld-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('k') }}</span>
                </div>
              </div>
            }
          </div>
        </div>
        <p class="t-xs t-muted">
          The subject must be mapped to the class. A teacher can act only on class-sections they're
          assigned to.
        </p>
      </div>
      <div modal-foot class="cc-foot">
        <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="as-save"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="save()"
        >
          <rp-icon name="check" [size]="17" /><span>Save assignments</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class SubjectTeacherDrawer {
  private readonly api = inject(TeachersApi);
  private readonly overlays = inject(Overlays);

  readonly teachers = input.required<readonly TeacherOption[]>();
  readonly subjects = input.required<readonly SubjectView[]>();
  readonly sections = input.required<readonly SectionChoice[]>();
  readonly year = input.required<AcademicYear>();
  readonly closed = output<void>();
  readonly changed = output<AssignmentList>();

  protected readonly teacherId = signal('');
  protected readonly subjectId = signal('');
  protected readonly picked = signal<ReadonlySet<string>>(new Set());
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected readonly teacherOptions = computed<DropdownOption[]>(() =>
    this.teachers().map((t) => ({
      v: t.id,
      l: person(t.name),
      sub: t.employeeNo ?? t.userType,
    })),
  );
  protected readonly subjectOptions = computed<DropdownOption[]>(() =>
    this.subjects().map((s) => ({ v: s.id, l: s.name, sub: s.code })),
  );

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
  protected toggle(id: string) {
    const s = new Set(this.picked());
    if (s.has(id)) s.delete(id);
    else s.add(id);
    this.picked.set(s);
    this.clear('k');
  }

  protected async save() {
    if (this.busy()) return;
    const e: Record<string, string> = {};
    if (!this.teacherId()) e['t'] = translate('VALIDATION.REQUIRED');
    if (!this.subjectId()) e['s'] = translate('VALIDATION.REQUIRED');
    if (!this.picked().size) e['k'] = 'Choose at least one class-section';
    this.errors.set(e);
    if (Object.keys(e).length) return;
    const ids = this.sections()
      .map((s) => s.id)
      .filter((id) => this.picked().has(id));
    this.busy.set(true);
    try {
      const r = await this.api.assign({
        yearId: this.year().id,
        kind: 'SUBJECT_TEACHER',
        teacherId: this.teacherId(),
        subjectId: this.subjectId(),
        sectionIds: ids,
      });
      const t = this.teachers().find((x) => x.id === this.teacherId());
      const s = this.subjects().find((x) => x.id === this.subjectId());
      const combined = r.subjectTeachers.some(
        (a) => a.teacher.id === this.teacherId() && a.teacher.combined,
      );
      this.overlays.toast('Subject teacher assigned', {
        sub: `${person(t?.name ?? '')} · ${s?.name ?? ''} · ${plural(ids.length, 'class-section')}${combined ? ' · combined portal' : ''}`,
      });
      this.changed.emit(r);
    } catch (x) {
      this.error.set(problemText(x));
    } finally {
      this.busy.set(false);
    }
  }
}
