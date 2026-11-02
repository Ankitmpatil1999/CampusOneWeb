import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { problemText } from '../Structure/academic-format';
import { AttendanceApi, type AttendanceType } from './attendance.api';

/** Add an attendance type (prototype cc.at.edit / cc.at.save; ATT-014): name and cooling-off. */
@Component({
  selector: 'rp-attendance-type-drawer',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      title="Add an attendance type"
      sub="A place where visits are recorded (FR-ATT-07)"
      icon="layers"
      [drawer]="true"
      [slim]="true"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="at-form">
        <div class="c-form">
          <div class="full">
            <div class="fld" [class.invalid]="nameError()">
              <label class="fld-l" for="at-n">Name<span class="req">*</span></label>
              <div class="fld-in">
                <input
                  id="at-n"
                  type="text"
                  maxlength="40"
                  placeholder="e.g. Sick room"
                  autocomplete="off"
                  aria-describedby="at-n-e"
                  [value]="name()"
                  (input)="name.set(val($event)); nameError.set('')"
                />
              </div>
              <div class="fld-e" id="at-n-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ nameError() }}</span>
              </div>
            </div>
          </div>
          <div class="fld" [class.invalid]="coolError()">
            <label class="fld-l" for="at-c">Cooling-off (minutes)</label>
            <div class="fld-in">
              <input
                id="at-c"
                type="number"
                min="1"
                max="60"
                inputmode="numeric"
                aria-describedby="at-c-e at-c-h"
                [value]="minutes()"
                (input)="minutes.set(val($event)); coolError.set('')"
              />
            </div>
            <div class="fld-e" id="at-c-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ coolError() }}</span>
            </div>
            <div class="fld-h" id="at-c-h">
              The least gap before the same person is counted again
            </div>
          </div>
        </div>
        @if (error()) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ error() }}</div>
          </div>
        }
      </div>
      <div modal-foot class="cc-foot">
        <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="at-save"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="save()"
        >
          <rp-icon name="check" [size]="17" /><span>Add type</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class TypeDrawer {
  private readonly api = inject(AttendanceApi);
  private readonly overlays = inject(Overlays);

  readonly others = input<readonly AttendanceType[]>([]);
  readonly closed = output<void>();
  readonly added = output<AttendanceType>();

  protected readonly name = signal('');
  protected readonly minutes = signal('10');
  protected readonly nameError = signal('');
  protected readonly coolError = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  private readonly taken = computed(
    () => new Set(this.others().map((t) => t.name.trim().toLowerCase())),
  );

  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }

  protected async save() {
    const name = this.name().trim();
    const m = Number(this.minutes());
    let ok = true;
    if (!name) {
      this.nameError.set('Enter a name');
      ok = false;
    } else if (name.length < 2 || name.length > 40) {
      this.nameError.set(translate('ATT.TYPE_NAME'));
      ok = false;
    } else if (this.taken().has(name.toLowerCase())) {
      this.nameError.set(translate('ATT.TYPE_TAKEN', { name }));
      ok = false;
    }
    if (!this.minutes().trim() || !Number.isInteger(m) || m < 1 || m > 60) {
      this.coolError.set('Enter whole minutes from 1 to 60');
      ok = false;
    }
    if (!ok) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const t = await this.api.createType({ name, cooldownSeconds: m * 60 });
      this.overlays.toast('Attendance type added', { sub: t.name });
      this.added.emit(t);
    } catch (e) {
      if (e instanceof ApiProblem && e.errors.some((f) => f.field === 'name')) {
        this.nameError.set(e.errors.find((f) => f.field === 'name')!.message);
      } else if (e instanceof ApiProblem && e.code === 'ATT.TYPE_TAKEN') {
        this.nameError.set(e.detail);
      } else {
        this.error.set(problemText(e));
      }
    } finally {
      this.busy.set(false);
    }
  }
}
