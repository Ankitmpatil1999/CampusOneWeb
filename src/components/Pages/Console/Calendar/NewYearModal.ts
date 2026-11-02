/**
 * Adds the next academic year (ACA-002): label, first and last day, suggested from the latest year
 * (1 April to 31 March after it). "You can add next year's when admissions open" (the prototype's
 * year note) — the roll-over and next year's admissions need it. Dates never overlap another year;
 * the server's refusal is shown in the register's words.
 */
import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  type OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Icon } from '../../../Shared/Icon';
import { Modal } from '../../../Shared/Overlays';
import { newIdempotencyKey } from '../../../Utils/ids';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import type { AcademicYear } from '../Structure/academic-year';

const DAY_MS = 86_400_000;
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * The year after the latest one: from the day after it ends, for a year (2026-27 ending 31 March 2027
 * → 2027-28, 1 April 2027 to 31 March 2028). With no year yet, April to March from this year.
 */
export function nextYearAfter(years: readonly AcademicYear[], today: string) {
  const latest = [...years].sort((a, b) => b.endsOn.localeCompare(a.endsOn))[0];
  const startsOn = latest
    ? ymd(Date.parse(`${latest.endsOn}T00:00:00Z`) + DAY_MS)
    : `${Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 4 ? 1 : 0)}-04-01`;
  const y = Number(startsOn.slice(0, 4));
  const endsOn = ymd(Date.parse(`${y + 1}${startsOn.slice(4)}T00:00:00Z`) - DAY_MS);
  return { label: `${y}-${String((y + 1) % 100).padStart(2, '0')}`, startsOn, endsOn };
}

@Component({
  selector: 'rp-new-year',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<rp-modal
    title="Add an academic year"
    sub="Listings and records of the new year are filed under it"
    (closed)="closed.emit()"
  >
    <div class="stack g16">
      <div class="fld" [class.invalid]="!!err().label">
        <label class="fld-l" for="ny-l">Academic year<span class="req">*</span></label>
        <div class="fld-in">
          <input
            id="ny-l"
            type="text"
            maxlength="7"
            autocomplete="off"
            placeholder="2027-28"
            aria-describedby="ny-l-e"
            [value]="label()"
            (input)="label.set($any($event.target).value); clear()"
          />
        </div>
        <div class="fld-e" id="ny-l-e" role="alert">
          <rp-icon name="alertc" [size]="14" /><span>{{ err().label }}</span>
        </div>
      </div>
      <div class="row g12 wrap">
        <div class="fld grow" [class.invalid]="!!err().startsOn">
          <label class="fld-l" for="ny-s">First day<span class="req">*</span></label>
          <div class="fld-in">
            <input
              id="ny-s"
              type="date"
              aria-describedby="ny-s-e"
              [value]="startsOn()"
              (input)="startsOn.set($any($event.target).value); clear()"
            />
          </div>
          <div class="fld-e" id="ny-s-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err().startsOn }}</span>
          </div>
        </div>
        <div class="fld grow" [class.invalid]="!!err().endsOn">
          <label class="fld-l" for="ny-e">Last day<span class="req">*</span></label>
          <div class="fld-in">
            <input
              id="ny-e"
              type="date"
              aria-describedby="ny-e-e"
              [value]="endsOn()"
              (input)="endsOn.set($any($event.target).value); clear()"
            />
          </div>
          <div class="fld-e" id="ny-e-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err().endsOn }}</span>
          </div>
        </div>
      </div>
      @if (err().form) {
        <div class="note tone-bad" role="alert" id="ny-err">
          <rp-icon name="alert" [size]="17" />
          <div class="grow">{{ err().form }}</div>
        </div>
      }
      <div class="note tone-info">
        <rp-icon name="info" [size]="17" />
        <div class="grow">
          The current year stays current until you make the new one current. Dates can't overlap
          another year.
        </div>
      </div>
    </div>
    <ng-container modal-foot>
      <button type="button" class="btn btn-sec" (click)="closed.emit()">
        <span>Cancel</span>
      </button>
      <button
        type="button"
        class="btn btn-pri"
        id="ny-go"
        [disabled]="saving() || !ready()"
        (click)="save()"
      >
        <rp-icon name="plus" [size]="16" /><span>Add year</span>
      </button>
    </ng-container>
  </rp-modal>`,
})
export class NewYearModal implements OnInit {
  private readonly http = inject(HttpClient);
  readonly suggestion = input.required<{ label: string; startsOn: string; endsOn: string }>();
  readonly closed = output<void>();
  readonly created = output<string>();

  protected readonly label = signal('');
  protected readonly startsOn = signal('');
  protected readonly endsOn = signal('');
  protected readonly saving = signal(false);
  protected readonly err = signal<{
    label?: string;
    startsOn?: string;
    endsOn?: string;
    form?: string;
  }>({});
  protected readonly ready = computed(
    () => !!this.label().trim() && !!this.startsOn() && !!this.endsOn(),
  );

  ngOnInit() {
    const s = this.suggestion();
    this.label.set(s.label);
    this.startsOn.set(s.startsOn);
    this.endsOn.set(s.endsOn);
  }

  protected clear() {
    this.err.set({});
  }

  protected async save() {
    const label = this.label().trim();
    if (!/^\d{4}-\d{2}$/.test(label)) {
      this.err.set({ label: translate('VALIDATION.FORMAT') });
      return;
    }
    if (this.endsOn() <= this.startsOn()) {
      this.err.set({ endsOn: translate('VALIDATION.RANGE') });
      return;
    }
    this.saving.set(true);
    try {
      await firstValueFrom(
        this.http.post(
          '/api/v1/console/academic-years',
          {
            label,
            startsOn: this.startsOn(),
            endsOn: this.endsOn(),
          },
          { headers: { 'Idempotency-Key': newIdempotencyKey() } },
        ),
      );
      this.created.emit(label);
    } catch (e) {
      if (e instanceof ApiProblem && e.errors.length) {
        const out: Record<string, string> = {};
        for (const x of e.errors)
          out[
            x.field === 'label' || x.field === 'startsOn' || x.field === 'endsOn' ? x.field : 'form'
          ] = x.message;
        this.err.set(out);
      } else {
        this.err.set({ form: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE') });
      }
    } finally {
      this.saving.set(false);
    }
  }
}
