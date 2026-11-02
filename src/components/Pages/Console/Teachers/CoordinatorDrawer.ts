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
import { plural } from '../Fees/fee-format';
import { problemText } from '../Structure/academic-format';
import type { AcademicYear } from '../Structure/academic-year';
import { SearchSelect } from '../../../Shared/SearchSelect';
import type { ClassView } from '../Structure/structure.api';
import {
  TeachersApi,
  type Assignment,
  type AssignmentList,
  type TeacherOption,
} from './teachers.api';

/** A coordinator and the classes they oversee this year (one assignment per class). */
export interface CoordinatorGroup {
  readonly teacher: { readonly id: string; readonly name: string };
  readonly assignments: readonly Assignment[];
}

/**
 * Allocate the classes an academic coordinator oversees (prototype cc.co.edit / cc.co.save;
 * ACA-022/023): a class overseen by another coordinator can't be ticked; classes added are assigned
 * and classes unticked are withdrawn (kept as history).
 */
@Component({
  selector: 'rp-coordinator-drawer',
  imports: [Icon, Modal, SearchSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      title="Coordinator allocation"
      [sub]="year().label"
      icon="briefcase"
      [drawer]="true"
      [slim]="true"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="co-body">
        @if (error()) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ error() }}</div>
          </div>
        }
        <div class="fld" [class.invalid]="err('m')">
          <label class="fld-l" for="co-m-b">Coordinator<span class="req">*</span></label>
          <rp-search-select
            inputId="co-m"
            placeholder="Choose a coordinator"
            empty="No active teachers yet"
            [options]="teacherOptions()"
            [value]="teacherId()"
            [disabled]="!!group()"
            (changed)="pickTeacher($event)"
          />
          <div class="fld-e" id="co-m-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('m') }}</span>
          </div>
        </div>
        <div class="fs">
          <h4><rp-icon name="school" [size]="16" />Classes overseen</h4>
          <div class="fs-b">
            <div class="cc-checks cols" id="co-classes">
              @for (c of sortedClasses(); track c.id) {
                <label class="chk"
                  ><input
                    type="checkbox"
                    [checked]="picked().has(c.id)"
                    [disabled]="taken().has(c.id)"
                    (change)="toggle(c.id)"
                  /><span
                    >{{ c.name }}{{ taken().has(c.id) ? ' (another coordinator)' : '' }}</span
                  ></label
                >
              } @empty {
                <p class="t-sm t-muted">No classes yet.</p>
              }
            </div>
            @if (err('c')) {
              <div class="fld invalid" style="margin-top: 10px">
                <div class="fld-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('c') }}</span>
                </div>
              </div>
            }
          </div>
        </div>
      </div>
      <div modal-foot class="cc-foot">
        <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="co-save"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="save()"
        >
          <rp-icon name="check" [size]="17" /><span>Save allocation</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class CoordinatorDrawer implements OnInit {
  private readonly api = inject(TeachersApi);
  private readonly overlays = inject(Overlays);

  /** The allocation being changed; null for a new coordinator. */
  readonly group = input<CoordinatorGroup | null>(null);
  readonly groups = input.required<readonly CoordinatorGroup[]>();
  readonly teachers = input.required<readonly TeacherOption[]>();
  readonly classes = input.required<readonly ClassView[]>();
  readonly year = input.required<AcademicYear>();
  readonly closed = output<void>();
  readonly changed = output<AssignmentList>();

  protected readonly teacherId = signal('');
  protected readonly picked = signal<ReadonlySet<string>>(new Set());
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected readonly sortedClasses = computed(() =>
    [...this.classes()].sort((a, b) => a.order - b.order),
  );
  /** The chosen coordinator's current allocation (a new pick may already have one). */
  private readonly mine = computed(
    () => this.groups().find((g) => g.teacher.id === this.teacherId()) ?? null,
  );
  protected readonly taken = computed(
    () =>
      new Set(
        this.groups()
          .filter((g) => g.teacher.id !== this.teacherId())
          .flatMap((g) => g.assignments.map((a) => a.class.id)),
      ),
  );
  protected readonly teacherOptions = computed<DropdownOption[]>(() => {
    const list = this.teachers().map((t) => ({
      v: t.id,
      l: person(t.name),
      sub: t.employeeNo ?? t.userType,
    }));
    const g = this.group();
    // An allocation whose coordinator is no longer an active teacher still shows its name.
    return g && !list.some((o) => o.v === g.teacher.id)
      ? [{ v: g.teacher.id, l: person(g.teacher.name), sub: '' }, ...list]
      : list;
  });

  ngOnInit() {
    const g = this.group();
    if (g) this.pickTeacher(g.teacher.id);
  }

  protected pickTeacher(id: string) {
    this.teacherId.set(id);
    this.picked.set(new Set(this.mine()?.assignments.map((a) => a.class.id) ?? []));
    this.clear('m');
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
  protected toggle(id: string) {
    const s = new Set(this.picked());
    if (s.has(id)) s.delete(id);
    else s.add(id);
    this.picked.set(s);
    this.clear('c');
  }

  protected async save() {
    if (this.busy()) return;
    const e: Record<string, string> = {};
    if (!this.teacherId()) e['m'] = translate('VALIDATION.REQUIRED');
    if (!this.picked().size) e['c'] = 'Choose at least one class';
    this.errors.set(e);
    if (Object.keys(e).length) return;
    const now = this.mine()?.assignments ?? [];
    const add = [...this.picked()].filter((id) => !now.some((a) => a.class.id === id));
    const drop = now.filter((a) => !this.picked().has(a.class.id));
    this.busy.set(true);
    try {
      let last: AssignmentList | null = null;
      if (add.length) {
        last = await this.api.assign({
          yearId: this.year().id,
          kind: 'COORDINATOR',
          teacherId: this.teacherId(),
          classIds: add,
        });
      }
      for (const a of drop) last = await this.api.withdraw(a.id);
      const name = this.teacherOptions().find((o) => o.v === this.teacherId())?.l ?? '';
      this.overlays.toast('Coordinator allocation saved', {
        sub: `${name} · ${plural(this.picked().size, 'class', 'classes')}`,
      });
      if (last) this.changed.emit(last);
      else this.closed.emit();
    } catch (x) {
      this.error.set(problemText(x));
    } finally {
      this.busy.set(false);
    }
  }
}
