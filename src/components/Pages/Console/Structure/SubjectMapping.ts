import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { ApiProblem } from '../../../Utils/problem';
import { plural } from '../Fees/fee-format';
import { problemText } from './academic-format';
import {
  StructureApi,
  type ClassSubjects,
  type ClassView,
  type SubjectView,
} from './structure.api';

/**
 * The "Subject mapping" tab (prototype c.structure map; ACA-018): a class × subject grid of ticks,
 * with an "All" tick per class that selects or clears every subject (client 2026-10-26).
 * Changes are kept until "Save mapping" (or "Discard"); each changed class is saved with its own
 * version. A subject still on a class's timetable can't be unmapped (ACA.SUBJECT_TIMETABLED): those
 * classes are listed in a dialog, as the prototype does, and the others are saved.
 */
@Component({
  selector: 'rp-subject-mapping',
  imports: [Empty, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <div class="row between wrap g8">
      <p class="t-sm t-muted">
        Tick the subjects each class studies. Timetables and exams only offer mapped subjects.
      </p>
      <div class="row g8">
        @if (changes()) {
          <span class="t-sm t-muted" id="mx-pending"
            >{{ plural(changes(), 'change') }} not saved</span
          >
          <button type="button" class="btn btn-ghost btn-sm" (click)="draft.set({})">
            <span>Discard</span>
          </button>
        }
        <span class="cp-why" [attr.title]="readOnly() || null"
          ><button
            type="button"
            class="btn btn-pri btn-sm"
            id="mx-save"
            [class.is-busy]="busy()"
            [disabled]="!!readOnly() || !changes() || busy()"
            (click)="save()"
          >
            <rp-icon name="check" [size]="15" /><span>Save mapping</span>
          </button></span
        >
      </div>
    </div>
    @if (!classes().length || !subjects().length) {
      <div class="card pad">
        <rp-empty
          icon="grid"
          [title]="!classes().length ? 'No classes yet' : 'No subjects yet'"
          [text]="
            !classes().length
              ? 'Add classes and sections first, then tick the subjects each class studies.'
              : 'Add subjects first, then tick the subjects each class studies.'
          "
        />
      </div>
    } @else {
      <div class="tbl-wrap cc-mx">
        <table class="tbl dense" id="mx-table">
          <thead>
            <tr>
              <th>Class</th>
              <th class="c" title="Select all subjects for the class">All</th>
              @for (s of subjects(); track s.id) {
                <th class="c" [attr.title]="s.name">
                  <i class="cc-dot" [style.background]="s.colour"></i> {{ s.code }}
                </th>
              }
            </tr>
          </thead>
          <tbody>
            @for (c of rows(); track c.id) {
              <tr>
                <td>
                  <b class="t-sb">{{ c.name }}</b>
                </td>
                <td class="c">
                  <input
                    type="checkbox"
                    class="tbl-chk"
                    [checked]="count(c.id) === subjects().length"
                    [indeterminate]="count(c.id) > 0 && count(c.id) < subjects().length"
                    [disabled]="!!readOnly() || !mapping().has(c.id)"
                    [attr.aria-label]="'All subjects for ' + c.name"
                    (change)="toggleAll(c.id, $event)"
                  />
                </td>
                @for (s of subjects(); track s.id) {
                  <td class="c" [class.chg]="draft()[c.id + '|' + s.id] !== undefined">
                    <input
                      type="checkbox"
                      class="tbl-chk"
                      [checked]="on(c.id, s.id)"
                      [disabled]="!!readOnly() || !mapping().has(c.id)"
                      [attr.aria-label]="c.name + ' studies ' + s.name"
                      (change)="toggle(c.id, s.id, $event)"
                    />
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
    @if (blocked().length) {
      <rp-modal
        title="Some subjects are still timetabled"
        icon="alert"
        [narrow]="false"
        (closed)="blocked.set([])"
      >
        <div class="stack g12">
          <p class="t-sm t-muted">
            Remove these periods from the timetable first, then unmap the subject.
          </p>
          <div class="list plain">
            @for (b of blocked(); track $index) {
              <div class="li">
                <span class="li-ic sm"><rp-icon name="grid" [size]="16" /></span
                ><span class="li-main"
                  ><span class="li-t wrap">{{ b }}</span></span
                >
              </div>
            }
          </div>
        </div>
        <div modal-foot class="cc-foot">
          <button type="button" class="btn btn-pri" (click)="blocked.set([])">
            <span>OK</span>
          </button>
        </div>
      </rp-modal>
    }
  `,
})
export class SubjectMapping {
  private readonly api = inject(StructureApi);
  private readonly overlays = inject(Overlays);

  readonly classes = input.required<readonly ClassView[]>();
  readonly subjects = input.required<readonly SubjectView[]>();
  /** Each class's mapped subjects (ACA-018), by class id. */
  readonly mapping = input.required<ReadonlyMap<string, ClassSubjects>>();
  readonly readOnly = input('');
  /** Some classes were saved: reload the mapping. */
  readonly saved = output<void>();

  protected readonly plural = plural;
  /** class|subject → ticked, for the cells changed and not saved yet. */
  protected readonly draft = signal<Readonly<Record<string, boolean>>>({});
  protected readonly busy = signal(false);
  protected readonly blocked = signal<readonly string[]>([]);
  protected readonly changes = computed(() => Object.keys(this.draft()).length);
  protected readonly rows = computed(() => [...this.classes()].sort((a, b) => a.order - b.order));

  private mapped(classId: string, subjectId: string) {
    return (
      this.mapping()
        .get(classId)
        ?.subjects.some((s) => s.id === subjectId) ?? false
    );
  }

  protected on(classId: string, subjectId: string) {
    const d = this.draft()[`${classId}|${subjectId}`];
    return d ?? this.mapped(classId, subjectId);
  }

  protected toggle(classId: string, subjectId: string, e: Event) {
    this.set(classId, [subjectId], (e.target as HTMLInputElement).checked);
  }

  /** How many subjects the class has ticked (with unsaved changes). */
  protected count(classId: string) {
    return this.subjects().filter((s) => this.on(classId, s.id)).length;
  }

  /** Ticks every subject for the class, or clears them all (client 2026-10-26); saved as usual. */
  protected toggleAll(classId: string, e: Event) {
    this.set(
      classId,
      this.subjects().map((s) => s.id),
      (e.target as HTMLInputElement).checked,
    );
  }

  private set(classId: string, subjectIds: readonly string[], v: boolean) {
    const next = { ...this.draft() };
    for (const subjectId of subjectIds) {
      const k = `${classId}|${subjectId}`;
      if (v === this.mapped(classId, subjectId)) delete next[k];
      else next[k] = v;
    }
    this.draft.set(next);
  }

  protected async save() {
    if (this.busy() || this.readOnly() || !this.changes()) return;
    const draft = this.draft();
    const changed = new Set(Object.keys(draft).map((k) => k.split('|')[0] ?? ''));
    this.busy.set(true);
    const left: Record<string, boolean> = {};
    const refused: string[] = [];
    let saved = 0;
    for (const classId of changed) {
      const m = this.mapping().get(classId);
      if (!m) continue;
      const ids = this.subjects()
        .filter((s) => this.on(classId, s.id))
        .map((s) => s.id);
      try {
        await this.api.setClassSubjects(classId, m.version, ids);
        saved++;
      } catch (x) {
        for (const [k, v] of Object.entries(draft)) if (k.startsWith(`${classId}|`)) left[k] = v;
        refused.push(
          x instanceof ApiProblem && x.status === 412
            ? `${m.class.name}: ${x.detail}`
            : x instanceof ApiProblem && x.code === 'ACA.SUBJECT_TIMETABLED'
              ? x.detail
              : `${m.class.name}: ${problemText(x)}`,
        );
      }
    }
    this.busy.set(false);
    this.draft.set(left);
    if (saved) {
      this.overlays.toast('Subject mapping saved', {
        sub: plural(Object.keys(draft).length - Object.keys(left).length, 'change'),
      });
    }
    // Saved classes have new versions, and a refused one may have changed elsewhere: reload.
    this.saved.emit();
    if (refused.length) this.blocked.set(refused);
  }
}
