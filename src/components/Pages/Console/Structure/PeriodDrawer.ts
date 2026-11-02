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
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { plural } from '../Fees/fee-format';
import { minutesOf, problemText, t12 } from './academic-format';
import { StructureApi, type PeriodInput, type PeriodList, type PeriodView } from './structure.api';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Add, edit or remove a period of the bell schedule (prototype cc.per.edit / save / del; ACA-020):
 * a name, whether it is a break, and its start and end. Periods never overlap and end after they
 * start; a period on a timetable can't be removed. The whole schedule is saved at once (If-Match).
 */
@Component({
  selector: 'rp-period-drawer',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="period()?.name ?? 'Add a period'"
      [sub]="period() ? t12(period()!.startsAt) + ' – ' + t12(period()!.endsAt) : 'Bell schedule'"
      icon="clock"
      [drawer]="true"
      [slim]="true"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16">
        @if (readOnly()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow">{{ readOnly() }}</div>
          </div>
        }
        @if (err('form')) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ err('form') }}</div>
          </div>
        }
        <div class="c-form">
          <div class="fld" [class.invalid]="err('name')">
            <label class="fld-l" for="pd-n">Name<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="pd-n"
                maxlength="30"
                autocomplete="off"
                placeholder="e.g. Period 9"
                aria-describedby="pd-n-e"
                [readOnly]="!!readOnly()"
                [value]="name()"
                (input)="name.set(val($event)); clear('name')"
              />
            </div>
            <div class="fld-e" id="pd-n-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('name') }}</span>
            </div>
          </div>
          <div>
            <label class="chk" style="margin-top: 28px"
              ><input
                type="checkbox"
                id="pd-b"
                [checked]="isBreak()"
                [disabled]="!!readOnly()"
                (change)="isBreak.set(checked($event)); clear('form')"
              /><span>This is a break</span></label
            >
          </div>
          <div class="fld" [class.invalid]="err('start')">
            <label class="fld-l" for="pd-s">Starts<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="pd-s"
                type="time"
                aria-describedby="pd-s-e"
                [readOnly]="!!readOnly()"
                [value]="start()"
                (input)="start.set(val($event)); clear('start'); clear('end')"
              />
            </div>
            <div class="fld-e" id="pd-s-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('start') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('end')">
            <label class="fld-l" for="pd-e">Ends<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="pd-e"
                type="time"
                aria-describedby="pd-e-e"
                [readOnly]="!!readOnly()"
                [value]="end()"
                (input)="end.set(val($event)); clear('end')"
              />
            </div>
            <div class="fld-e" id="pd-e-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('end') }}</span>
            </div>
          </div>
        </div>
        @if (used()) {
          <div class="note tone-info">
            <rp-icon name="info" [size]="17" />
            <div class="grow">
              Used in {{ plural(used(), 'timetable slot') }}. Changing the time moves those lessons.
            </div>
          </div>
        }
      </div>
      <div modal-foot class="cc-foot">
        @if (readOnly()) {
          <button type="button" class="btn btn-sec" (click)="closed.emit()">
            <span>Close</span>
          </button>
        } @else {
          @if (period()) {
            <button
              type="button"
              class="btn btn-danger-o"
              id="pd-del"
              [disabled]="busy()"
              (click)="remove()"
            >
              <rp-icon name="trash" [size]="17" /><span>Remove</span>
            </button>
          }
          <span class="grow"></span>
          <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="closed.emit()">
            <span>Cancel</span>
          </button>
          <button
            type="button"
            class="btn btn-pri"
            id="pd-save"
            [class.is-busy]="busy()"
            [disabled]="busy()"
            (click)="save()"
          >
            <rp-icon name="check" [size]="17" /><span>{{
              period() ? 'Save period' : 'Add period'
            }}</span>
          </button>
        }
      </div>
    </rp-modal>
  `,
})
export class PeriodDrawer implements OnInit {
  private readonly api = inject(StructureApi);
  private readonly overlays = inject(Overlays);

  readonly period = input<PeriodView | null>(null);
  readonly schedule = input.required<PeriodList>();
  readonly readOnly = input('');
  readonly closed = output<void>();
  readonly saved = output<PeriodList>();
  /** The schedule changed elsewhere (412): reload it. */
  readonly stale = output<void>();

  protected readonly t12 = t12;
  protected readonly plural = plural;
  protected readonly name = signal('');
  protected readonly isBreak = signal(false);
  protected readonly start = signal('15:00');
  protected readonly end = signal('15:40');
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly busy = signal(false);
  protected readonly used = computed(() => this.period()?.timetableSlots ?? 0);

  ngOnInit() {
    const p = this.period();
    if (p) {
      this.name.set(p.name);
      this.isBreak.set(p.isBreak);
      this.start.set(p.startsAt);
      this.end.set(p.endsAt);
    } else {
      // The next slot after the last period, 40 minutes long (the prototype offers 15:00–15:40).
      const last = [...this.schedule().items].sort((a, b) => b.endsAt.localeCompare(a.endsAt))[0];
      if (last && minutesOf(last.endsAt) + 40 < 24 * 60) {
        const m = minutesOf(last.endsAt);
        const hhmm = (x: number) =>
          `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
        this.start.set(last.endsAt);
        this.end.set(hhmm(m + 40));
      }
    }
  }

  protected err(k: string) {
    return this.errors()[k] ?? '';
  }
  protected clear(k: string) {
    const e = this.errors();
    if (!e[k] && !e['form']) return;
    const next = { ...e };
    delete next[k];
    delete next['form'];
    this.errors.set(next);
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected checked(e: Event) {
    return (e.target as HTMLInputElement).checked;
  }

  private validate(): Record<string, string> {
    const e: Record<string, string> = {};
    const id = this.period()?.id;
    const name = this.name().trim();
    const others = this.schedule().items.filter((p) => p.id !== id);
    if (!name) e['name'] = translate('VALIDATION.REQUIRED');
    else if (others.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      e['name'] = translate('ACA.PERIOD_NAME');
    }
    const s = this.start();
    const en = this.end();
    if (!TIME.test(s)) e['start'] = translate('VALIDATION.REQUIRED');
    if (!TIME.test(en)) e['end'] = translate('VALIDATION.REQUIRED');
    else if (TIME.test(s) && en <= s) e['end'] = translate('ACA.PERIOD_TIMES');
    else if (TIME.test(s)) {
      const c = others.find((p) => s < p.endsAt && p.startsAt < en);
      if (c) {
        e['end'] = translate('ACA.PERIOD_OVERLAP', {
          name: c.name,
          from: t12(c.startsAt),
          to: t12(c.endsAt),
        });
      }
    }
    return e;
  }

  private inputs(without?: string): PeriodInput[] {
    return this.schedule()
      .items.filter((p) => p.id !== without)
      .map((p) => ({
        id: p.id,
        name: p.name,
        startsAt: p.startsAt,
        endsAt: p.endsAt,
        isBreak: p.isBreak,
      }));
  }

  protected async save() {
    if (this.busy() || this.readOnly()) return;
    const e = this.validate();
    this.errors.set(e);
    if (Object.keys(e).length) return;
    const p = this.period();
    const mine: PeriodInput = {
      ...(p ? { id: p.id } : {}),
      name: this.name().trim(),
      startsAt: this.start(),
      endsAt: this.end(),
      isBreak: this.isBreak(),
    };
    const list = [...this.inputs(p?.id), mine].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    await this.put(list, list.indexOf(mine), () =>
      this.overlays.toast(p ? 'Period updated' : 'Period added', {
        sub: `${mine.name} · ${t12(mine.startsAt)}–${t12(mine.endsAt)}`,
      }),
    );
  }

  protected async remove() {
    const p = this.period();
    if (!p || this.busy() || this.readOnly()) return;
    if (p.timetableSlots) {
      this.overlays.toast(translate('ACA.PERIOD_IN_USE', { name: p.name }), {
        tone: 'bad',
        sub: `It's used in ${plural(p.timetableSlots, 'timetable slot')}. Clear them in the timetable first.`,
      });
      return;
    }
    const ok = await this.overlays.confirm({
      title: `Remove ${p.name}?`,
      text: `${t12(p.startsAt)}–${t12(p.endsAt)} will no longer be part of the school day.`,
      ok: 'Remove period',
      tone: 'bad',
    });
    if (!ok) return;
    await this.put(this.inputs(p.id), -1, () =>
      this.overlays.toast('Period removed', { sub: p.name }),
    );
  }

  private async put(list: PeriodInput[], mine: number, done: () => void) {
    this.busy.set(true);
    try {
      const out = await this.api.setPeriods(this.schedule().version, list);
      done();
      this.saved.emit(out);
    } catch (x) {
      this.errors.set(this.problemErrors(x, mine));
      if (x instanceof ApiProblem && (x.status === 412 || x.status === 428)) this.stale.emit();
    } finally {
      this.busy.set(false);
    }
  }

  /** A field error of this period goes under its field; any other answer above the form. */
  private problemErrors(x: unknown, mine: number): Record<string, string> {
    if (!(x instanceof ApiProblem) || !x.errors.length) return { form: problemText(x) };
    const out: Record<string, string> = {};
    for (const f of x.errors) {
      const m = /^periods\.(\d+)\.(\w+)$/.exec(f.field);
      if (m && Number(m[1]) === mine) {
        const k = m[2] === 'name' ? 'name' : m[2] === 'startsAt' ? 'start' : 'end';
        out[k] ??= f.message;
      } else out['form'] ??= f.message;
    }
    return out;
  }
}
