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
import { Router } from '@angular/router';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { person } from '../Applications/app-format';
import { DAY_NAMES, problemText, t12 } from '../Structure/academic-format';
import { TimetableApi, type SlotInput, type Timetable, type TtPeriod } from './timetable.api';

/**
 * One period of a section's week (prototype cc.tt.cell / save / clear; ACA-025): a subject the class
 * studies and a teacher assigned to it there. A teacher can't be in two classes in one period of the
 * year (ACA.TEACHER_CLASH): nothing is saved and the clash is shown under the teacher.
 */
@Component({
  selector: 'rp-timetable-slot',
  imports: [Dropdown, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="tt().section.label + ' · ' + dayName()"
      [sub]="period().name + ' · ' + t12(period().startsAt) + ' – ' + t12(period().endsAt)"
      icon="grid"
      [narrow]="false"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="tt-body">
        @if (now(); as x) {
          <div class="note tone-info">
            <rp-icon name="info" [size]="17" />
            <div class="grow">
              Now: <b>{{ x.subject.name }}</b> with {{ person(x.teacher.name) }}
            </div>
          </div>
        }
        <div class="fld" [class.invalid]="err('s')">
          <label class="fld-l" for="tt-s-b">Subject<span class="req">*</span></label>
          <rp-dd
            inputId="tt-s"
            placeholder="Choose a subject"
            [options]="subjectOptions()"
            [value]="subjectId()"
            (changed)="pickSubject($event)"
          />
          <div class="fld-e" id="tt-s-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('s') }}</span>
          </div>
          @if (!subjectOptions().length) {
            <div class="fld-h">No subjects are mapped to this class yet.</div>
          }
        </div>
        @if (subjectId() && !teacherOptions().length) {
          <div class="stack g8">
            <div class="fld">
              <label class="fld-l" for="tt-t-b">Teacher<span class="req">*</span></label>
              <rp-dd
                inputId="tt-t"
                placeholder="No teacher assigned"
                [options]="[]"
                [disabled]="true"
              />
            </div>
            <div class="note tone-warn">
              <rp-icon name="alert" [size]="17" />
              <div class="grow">
                No teacher is assigned to {{ subjectName() }} for {{ tt().section.label }}.
              </div>
              <button type="button" class="btn btn-sec btn-sm" (click)="assign()">
                <span>Assign a teacher</span>
              </button>
            </div>
          </div>
        } @else {
          <div class="fld" [class.invalid]="err('t')">
            <label class="fld-l" for="tt-t-b">Teacher<span class="req">*</span></label>
            <rp-dd
              inputId="tt-t"
              [placeholder]="subjectId() ? 'Choose a teacher' : 'Choose a subject first'"
              [options]="teacherOptions()"
              [value]="teacherId()"
              [disabled]="!subjectId()"
              (changed)="teacherId.set($event); clear('t')"
            />
            <div class="fld-e" id="tt-t-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('t') }}</span>
            </div>
            @if (subjectId()) {
              <div class="fld-h">
                Teachers assigned to {{ subjectName() }} in {{ tt().section.label }}
              </div>
            }
          </div>
        }
        @if (clash()) {
          <div class="note tone-bad" role="alert" id="tt-clash">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow"><b>Clash — not saved.</b> {{ clash() }}</div>
          </div>
        }
        @if (error()) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ error() }}</div>
          </div>
        }
      </div>
      <div modal-foot class="cc-foot">
        @if (now()) {
          <button
            type="button"
            class="btn btn-danger-o"
            id="tt-clear"
            [disabled]="busy()"
            (click)="clearPeriod()"
          >
            <span>Clear period</span>
          </button>
        }
        <span class="grow"></span>
        <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="tt-save"
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
export class TimetableSlotModal implements OnInit {
  private readonly api = inject(TimetableApi);
  private readonly overlays = inject(Overlays);
  private readonly router = inject(Router);

  readonly tt = input.required<Timetable>();
  readonly day = input.required<number>();
  readonly period = input.required<TtPeriod>();
  readonly closed = output<void>();
  readonly saved = output<Timetable>();
  /** The week changed elsewhere (412): reload it. */
  readonly stale = output<void>();

  protected readonly t12 = t12;
  protected readonly person = person;
  protected readonly subjectId = signal('');
  protected readonly teacherId = signal('');
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly clash = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected readonly dayName = computed(() => DAY_NAMES[this.day() - 1] ?? '');
  protected readonly now = computed(
    () =>
      this.tt().slots.find((s) => s.day === this.day() && s.periodId === this.period().id) ?? null,
  );
  protected readonly subjectOptions = computed<DropdownOption[]>(() =>
    this.tt().subjects.map((s) => ({ v: s.id, l: s.name })),
  );
  private readonly subject = computed(
    () => this.tt().subjects.find((s) => s.id === this.subjectId()) ?? null,
  );
  protected readonly subjectName = computed(() => this.subject()?.name ?? '');
  protected readonly teacherOptions = computed<DropdownOption[]>(() =>
    (this.subject()?.teachers ?? []).map((t) => ({ v: t.id, l: person(t.name) })),
  );

  ngOnInit() {
    const x = this.now();
    if (x) {
      this.subjectId.set(x.subject.id);
      this.teacherId.set(x.teacher.id);
    }
  }

  protected err(k: string) {
    return this.errors()[k] ?? '';
  }
  protected clear(k: string) {
    this.clash.set('');
    this.error.set('');
    if (!this.errors()[k]) return;
    const e = { ...this.errors() };
    delete e[k];
    this.errors.set(e);
  }

  protected pickSubject(id: string) {
    this.subjectId.set(id);
    const ts = this.subject()?.teachers ?? [];
    this.teacherId.set(
      ts.some((t) => t.id === this.teacherId()) ? this.teacherId() : (ts[0]?.id ?? ''),
    );
    this.clear('s');
    this.clear('t');
  }

  protected assign() {
    this.closed.emit();
    void this.router.navigate(['/console/teachers'], { queryParams: { tab: 'st' } });
  }

  private others(): SlotInput[] {
    return this.tt()
      .slots.filter((s) => !(s.day === this.day() && s.periodId === this.period().id))
      .map((s) => ({
        day: s.day,
        periodId: s.periodId,
        subjectId: s.subject.id,
        teacherId: s.teacher.id,
      }));
  }

  protected async save() {
    if (this.busy()) return;
    const e: Record<string, string> = {};
    if (!this.subjectId()) e['s'] = translate('VALIDATION.REQUIRED');
    if (this.subjectId() && !this.teacherId()) {
      e['t'] = translate('ACA.TEACHER_NOT_ASSIGNED', {
        subject: this.subjectName(),
        section: this.tt().section.label,
      });
    }
    this.errors.set(e);
    if (Object.keys(e).length) return;
    const x = this.now();
    if (x && x.subject.id === this.subjectId() && x.teacher.id === this.teacherId()) {
      this.closed.emit();
      return;
    }
    const slot: SlotInput = {
      day: this.day(),
      periodId: this.period().id,
      subjectId: this.subjectId(),
      teacherId: this.teacherId(),
    };
    const teacher = this.teacherOptions().find((o) => o.v === this.teacherId())?.l ?? '';
    await this.put([...this.others(), slot], () =>
      this.overlays.toast(x ? 'Period updated' : 'Lesson added', {
        sub: `${this.tt().section.label} · ${this.dayName()} ${this.period().name} · ${this.subjectName()} with ${teacher}`,
      }),
    );
  }

  protected async clearPeriod() {
    const x = this.now();
    if (!x || this.busy()) return;
    const ok = await this.overlays.confirm({
      title: 'Clear this period?',
      text: `${x.subject.name} with ${person(x.teacher.name)} is removed from ${this.tt().section.label} on ${this.dayName()}. Students and the teacher see a free period.`,
      ok: 'Clear period',
      tone: 'bad',
    });
    if (!ok) return;
    await this.put(this.others(), () =>
      this.overlays.toast('Period cleared', {
        sub: `${this.tt().section.label} · ${this.dayName()}`,
      }),
    );
  }

  private async put(slots: SlotInput[], done: () => void) {
    this.busy.set(true);
    this.clash.set('');
    this.error.set('');
    try {
      const out = await this.api.save(
        this.tt().section.id,
        this.tt().version,
        slots,
        this.tt().year.id,
      );
      done();
      this.saved.emit(out);
    } catch (x) {
      if (x instanceof ApiProblem && x.code === 'ACA.TEACHER_CLASH') {
        this.errors.set({ t: 'Already teaching another class in this period' });
        this.clash.set(x.detail);
      } else {
        this.error.set(problemText(x));
        if (x instanceof ApiProblem && (x.status === 412 || x.status === 428)) this.stale.emit();
      }
    } finally {
      this.busy.set(false);
    }
  }
}
