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
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { translate } from '../../../Utils/translate';
import { person } from '../Applications/app-format';
import { byLabel, problemText } from '../Structure/academic-format';
import type { AcademicYear } from '../Structure/academic-year';
import { SearchSelect } from '../../../Shared/SearchSelect';
import {
  TeachersApi,
  type AssignmentList,
  type ClassTeacherRow,
  type TeacherOption,
} from './teachers.api';

const label = (r: ClassTeacherRow) => `${r.class.name} ${r.section.name}`;

/**
 * Assign, change or remove a class-section's class teacher (prototype cc.ct.edit / save / remove;
 * ACA-022/023; BR-52): one class teacher per class-section and year; saving over one replaces them
 * for the rest of the year (the old assignment is kept as history).
 */
@Component({
  selector: 'rp-class-teacher-modal',
  imports: [Icon, Modal, SearchSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="row() ? 'Class teacher · ' + rowLabel(row()!) : 'Assign a class teacher'"
      [sub]="year().label + ' · one class teacher per class-section'"
      icon="usercheck"
      [narrow]="false"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="ct-body">
        @if (error()) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ error() }}</div>
          </div>
        }
        @if (!row()) {
          <div class="fld" [class.invalid]="err('k')">
            <label class="fld-l" for="ct-k-b">Class-section<span class="req">*</span></label>
            <rp-search-select
              inputId="ct-k"
              placeholder="Choose a class-section"
              [options]="sectionOptions()"
              [value]="sectionId()"
              (changed)="sectionId.set($event); clear('k')"
            />
            <div class="fld-e" id="ct-k-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('k') }}</span>
            </div>
          </div>
        }
        @if (current(); as c) {
          <div class="note tone-info">
            <rp-icon name="info" [size]="17" />
            <div class="grow">
              Currently <b>{{ person(c.teacher.name) }}</b
              >. Saving replaces them for the rest of {{ year().label }}.
            </div>
          </div>
        }
        <div class="fld" [class.invalid]="err('t')">
          <label class="fld-l" for="ct-t-b">Teacher<span class="req">*</span></label>
          <rp-search-select
            inputId="ct-t"
            placeholder="Choose a teacher"
            empty="No active teachers yet"
            [options]="teacherOptions()"
            [value]="teacherId()"
            (changed)="teacherId.set($event); clear('t')"
          />
          <div class="fld-e" id="ct-t-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('t') }}</span>
          </div>
        </div>
        @if (leading()) {
          <p class="t-xs t-muted" id="ct-one-class">
            A teacher can be the class teacher of one class only, so the
            {{ leading() === 1 ? 'teacher' : leading() + ' teachers' }} already leading a class
            {{ leading() === 1 ? "isn't" : "aren't" }} listed.
          </p>
        }
        <p class="t-xs t-muted">
          The class teacher reviews student leave, marks class attendance and sees the class roster.
          If they also teach a subject, both menus appear in one portal.
        </p>
      </div>
      <div modal-foot class="cc-foot">
        @if (current()) {
          <button
            type="button"
            class="btn btn-danger-o"
            id="ct-remove"
            [disabled]="busy()"
            (click)="remove()"
          >
            <span>Remove</span>
          </button>
        }
        <span class="grow"></span>
        <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="ct-save"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="save()"
        >
          <rp-icon name="check" [size]="17" /><span>Save</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class ClassTeacherModal implements OnInit {
  private readonly api = inject(TeachersApi);
  private readonly overlays = inject(Overlays);

  /** The class-section being changed; null to choose one. */
  readonly row = input<ClassTeacherRow | null>(null);
  readonly rows = input.required<readonly ClassTeacherRow[]>();
  readonly teachers = input.required<readonly TeacherOption[]>();
  readonly year = input.required<AcademicYear>();
  readonly closed = output<void>();
  readonly changed = output<AssignmentList>();

  protected readonly person = person;
  protected readonly sectionId = signal('');
  protected readonly teacherId = signal('');
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected readonly target = computed(
    () => this.row() ?? this.rows().find((r) => r.section.id === this.sectionId()) ?? null,
  );
  protected readonly current = computed(() => this.row()?.assignment ?? null);
  protected readonly sectionOptions = computed<DropdownOption[]>(() =>
    [...this.rows()]
      .sort((a, b) => byLabel(label(a), label(b)))
      .map((r) => ({
        v: r.section.id,
        l: label(r),
        sub: r.assignment ? `Has ${person(r.assignment.teacher.name)}` : 'No class teacher',
      })),
  );
  /**
   * One class per class teacher (client 2026-10-14): a teacher already leading another
   * class-section isn't offered (the server refuses it too: ACA.CLASS_TEACHER_ONE_CLASS).
   */
  protected readonly teacherOptions = computed<DropdownOption[]>(() => {
    const here = this.target()?.section.id;
    return this.teachers()
      .filter(
        (t) => !this.rows().some((r) => r.assignment?.teacher.id === t.id && r.section.id !== here),
      )
      .map((t) => ({
        v: t.id,
        l: person(t.name),
        sub: t.employeeNo ?? t.userType,
      }));
  });
  /** How many teachers are left out because they already lead a class. */
  protected readonly leading = computed(() => {
    const here = this.target()?.section.id;
    return this.teachers().filter((t) =>
      this.rows().some((r) => r.assignment?.teacher.id === t.id && r.section.id !== here),
    ).length;
  });

  ngOnInit() {
    this.teacherId.set(this.row()?.assignment?.teacher.id ?? '');
  }

  protected rowLabel(r: ClassTeacherRow) {
    return label(r);
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

  protected async save() {
    if (this.busy()) return;
    const e: Record<string, string> = {};
    const t = this.target();
    if (!t) e['k'] = translate('VALIDATION.REQUIRED');
    else if (!this.row() && t.assignment) {
      e['k'] = translate('ACA.CLASS_TEACHER_TAKEN', {
        section: label(t),
        year: this.year().label,
        name: person(t.assignment.teacher.name),
      });
    }
    if (!this.teacherId()) e['t'] = translate('VALIDATION.REQUIRED');
    this.errors.set(e);
    if (Object.keys(e).length || !t) return;
    if (t.assignment?.teacher.id === this.teacherId()) {
      this.closed.emit();
      return;
    }
    this.busy.set(true);
    try {
      const r = await this.api.assign({
        yearId: this.year().id,
        kind: 'CLASS_TEACHER',
        teacherId: this.teacherId(),
        sectionIds: [t.section.id],
        replace: !!t.assignment,
      });
      const mine = r.classTeachers.find((x) => x.section.id === t.section.id)?.assignment;
      const name = person(mine?.teacher.name ?? '');
      this.overlays.toast('Class teacher assigned', {
        sub: `${name} · ${label(t)}${mine?.teacher.combined ? ' · combined portal' : ''}`,
      });
      this.changed.emit(r);
    } catch (x) {
      this.error.set(problemText(x));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove() {
    const t = this.row();
    const a = this.current();
    if (!t || !a || this.busy()) return;
    const ok = await this.overlays.confirm({
      title: `Remove ${person(a.teacher.name)} as class teacher?`,
      text: `${label(t)} will have no class teacher until you assign one. Student leave for the class can't be reviewed meanwhile.`,
      ok: 'Remove',
      tone: 'bad',
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      const r = await this.api.withdraw(a.id);
      this.overlays.toast('Class teacher removed', { sub: label(t) });
      this.changed.emit(r);
    } catch (x) {
      this.error.set(problemText(x));
    } finally {
      this.busy.set(false);
    }
  }
}
