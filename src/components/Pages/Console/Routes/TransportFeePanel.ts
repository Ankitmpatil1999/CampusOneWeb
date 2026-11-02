import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  type OnInit,
} from '@angular/core';
import { Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { formatInr } from '../../../Utils/format';
import { parseAmount } from '../../../Utils/money';
import { ApiProblem } from '../../../Utils/problem';
import { problemText } from '../Structure/academic-format';
import {
  TransportApi,
  type FeeMode,
  type FeeRange,
  type FeeRule,
  type Route,
} from '../Transport/transport.api';
import { km } from '../Transport/transport-format';

type Field = 'rate' | 'day' | 'ranges';

/** Yearly fee for a stop: distance × 2 (both ways) × the yearly rate per km, in whole rupees. */
export const yearlyFee = (distanceKm: number, ratePaise: number) =>
  Math.round((distanceKm * 2 * ratePaise) / 100) * 100;
/** A month's part of it: whole rupees (the last month of the year takes the remainder). */
export const monthlyFee = (yearlyPaise: number, months: number) =>
  months > 0 ? Math.floor(yearlyPaise / months / 100) * 100 : 0;
/** The yearly amount of the first range a distance falls in (null beyond the last: not charged). */
export const rangeFee = (distanceKm: number, ranges: readonly FeeRange[]) =>
  [...ranges].sort((a, b) => a.uptoKm - b.uptoKm).find((r) => distanceKm <= r.uptoKm)
    ?.yearlyPaise ?? null;
/** A stop's yearly fee under the rule (as the API raises it); null: beyond the last range. */
export const feeFor = (
  rule: Pick<FeeRule, 'mode' | 'ratePaisePerKm'> & { readonly ranges: readonly FeeRange[] },
  distanceKm: number,
): number | null => {
  if (distanceKm <= 0) return 0;
  return rule.mode === 'RANGE'
    ? rangeFee(distanceKm, rule.ranges)
    : yearlyFee(distanceKm, rule.ratePaisePerKm);
};

/** A range being edited: the texts typed. */
interface RangeRow {
  readonly key: number;
  readonly upto: string;
  readonly amount: string;
}

const MODES: readonly { v: FeeMode; l: string }[] = [
  { v: 'PER_KM', l: 'Per km' },
  { v: 'RANGE', l: 'By distance range' },
];
const MAX_RANGES = 20;

/**
 * The transport fee by distance (client 2026-10-21/22; TRN-040…042): the Institution Administrator
 * switches it on and chooses how it is worked out — the yearly rate per km of the round trip, or an
 * amount a year for each distance range (e.g. up to 5 km ₹10,000, up to 10 km ₹15,000) — and the
 * day the monthly dues fall on. Every stop's yearly and monthly fee is worked out below. Dues are
 * raised when a member is allocated a stop — or here, for the allocations made before the fee was
 * switched on.
 */
@Component({
  selector: 'rp-transport-fee',
  imports: [Empty, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading() && !rule()) {
      <div class="sk" style="height: 320px; border-radius: 16px" aria-busy="true"></div>
    } @else if (loadError() && !rule()) {
      <div class="card pad">
        <rp-empty icon="alertc" title="Couldn't load the transport fee" [text]="loadError()">
          <button type="button" class="btn btn-sec btn-sm" (click)="load()">
            <span>Try again</span>
          </button>
        </rp-empty>
      </div>
    } @else if (rule(); as r) {
      <div class="c-grid k2" id="tf">
        <div class="card pad stack g16">
          <div class="stack g4">
            <b class="t-h4">Transport fee by distance</b>
            <span class="t-sm t-muted">{{ intro() }}</span>
          </div>
          @if (why()) {
            <div class="note tone-info">
              <rp-icon name="lock" [size]="17" />
              <div class="grow">{{ why() }}</div>
            </div>
          }
          <label class="chk"
            ><input
              type="checkbox"
              id="tf-on"
              [checked]="on()"
              [disabled]="!!why()"
              (change)="on.set(checked($event))"
            /><span>Charge transport by distance</span></label
          >
          <div class="seg" id="tf-mode" role="radiogroup" aria-label="Worked out">
            <span
              class="seg-ind"
              style="width: calc((100% - 8px) / 2)"
              [style.left]="
                'calc(3px + ' + (mode() === 'PER_KM' ? 0 : 1) + ' * ((100% - 8px) / 2 + 2px))'
              "
            ></span>
            @for (m of modes; track m.v) {
              <button
                type="button"
                role="radio"
                [class.on]="mode() === m.v"
                [attr.aria-checked]="mode() === m.v"
                [disabled]="!!why()"
                (click)="setMode(m.v)"
              >
                {{ m.l }}
              </button>
            }
          </div>
          <div class="c-form">
            @if (mode() === 'PER_KM') {
              <div class="fld" [class.invalid]="err('rate')">
                <label class="fld-l" for="tf-rate"
                  >Rate per km, per year<span class="req">*</span></label
                >
                <div class="fld-in">
                  <span class="pre">₹</span
                  ><input
                    id="tf-rate"
                    type="text"
                    inputmode="decimal"
                    autocomplete="off"
                    aria-describedby="tf-rate-e tf-rate-h"
                    [readOnly]="!!why()"
                    [value]="rate()"
                    (input)="rate.set(val($event)); clear('rate')"
                  />
                </div>
                <div class="fld-e" id="tf-rate-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('rate') }}</span>
                </div>
                <div class="fld-h" id="tf-rate-h">For each km of the round trip</div>
              </div>
            }
            <div class="fld" [class.invalid]="err('day')">
              <label class="fld-l" for="tf-day"
                >Due day of the month<span class="req">*</span></label
              >
              <div class="fld-in">
                <input
                  id="tf-day"
                  type="number"
                  min="1"
                  max="28"
                  aria-describedby="tf-day-e"
                  [readOnly]="!!why()"
                  [value]="day()"
                  (input)="day.set(val($event)); clear('day')"
                />
              </div>
              <div class="fld-e" id="tf-day-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('day') }}</span>
              </div>
            </div>
          </div>
          @if (mode() === 'RANGE') {
            <div class="stack g8" id="tf-ranges">
              <span class="fld-l">Distance ranges<span class="req">*</span></span>
              <div class="tbl-wrap">
                <table class="tbl">
                  <thead>
                    <tr>
                      <th>From</th>
                      <th>Up to (km)</th>
                      <th>Amount a year</th>
                      <th class="r"><span class="sr-only">Remove</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (x of rows(); track x.key; let i = $index) {
                      <tr>
                        <td class="t-num t-muted">{{ fromOf(i) }}</td>
                        <td>
                          <div class="fld-in" style="max-width: 120px">
                            <input
                              type="text"
                              inputmode="decimal"
                              autocomplete="off"
                              [attr.id]="'tf-upto-' + i"
                              [attr.aria-label]="'Range ' + (i + 1) + ': up to km'"
                              [readOnly]="!!why()"
                              [value]="x.upto"
                              (input)="edit(i, 'upto', val($event))"
                            /><span class="suf">km</span>
                          </div>
                        </td>
                        <td>
                          <div class="fld-in" style="max-width: 170px">
                            <span class="pre">₹</span
                            ><input
                              type="text"
                              inputmode="decimal"
                              autocomplete="off"
                              [attr.id]="'tf-amount-' + i"
                              [attr.aria-label]="'Range ' + (i + 1) + ': amount a year'"
                              [readOnly]="!!why()"
                              [value]="x.amount"
                              (input)="edit(i, 'amount', val($event))"
                            />
                          </div>
                        </td>
                        <td class="r">
                          @if (!why()) {
                            <button
                              type="button"
                              class="btn btn-ghost btn-sm btn-icon"
                              [attr.aria-label]="'Remove range ' + (i + 1)"
                              (click)="remove(i)"
                            >
                              <rp-icon name="trash" [size]="16" />
                            </button>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              @if (err('ranges')) {
                <div class="t-xs t-bad" role="alert" id="tf-ranges-e">{{ err('ranges') }}</div>
              }
              @if (!why() && rows().length < maxRanges) {
                <div>
                  <button type="button" class="btn btn-sec btn-sm" id="tf-add" (click)="add()">
                    <rp-icon name="plus" [size]="16" /><span>Add range</span>
                  </button>
                </div>
              }
              <span class="t-xs t-muted"
                >Each range runs from the one before it, one way from the school. A stop farther
                than the last range isn't charged.</span
              >
            </div>
          }
          <div class="note tone-info" id="tf-example">
            <rp-icon name="info" [size]="17" />
            <div class="grow">{{ example() }}</div>
          </div>
          <p class="t-xs t-muted">
            Changing the fee doesn't change dues already raised. A move to a farther stop raises the
            months left; a nearer stop changes nothing for the year.
          </p>
          @if (error()) {
            <div class="note tone-bad" role="alert">
              <rp-icon name="alertc" [size]="17" />
              <div class="grow">{{ error() }}</div>
            </div>
          }
          @if (!why()) {
            <div class="row g8">
              <button
                type="button"
                class="btn btn-pri"
                id="tf-save"
                [class.is-busy]="busy()"
                [disabled]="busy()"
                (click)="save()"
              >
                <rp-icon name="check" [size]="17" /><span>Save</span>
              </button>
              <span class="cp-why" [attr.title]="applyWhy() || null"
                ><button
                  type="button"
                  class="btn btn-sec"
                  id="tf-apply"
                  [disabled]="!!applyWhy() || busy()"
                  (click)="apply()"
                >
                  <rp-icon name="refresh" [size]="17" /><span
                    >Raise dues for current allocations</span
                  >
                </button></span
              >
            </div>
          }
        </div>
        <div class="card pad stack g12">
          <div class="stack g4">
            <b class="t-h4">Fee by stop</b>
            <span class="t-sm t-muted">{{ yearNote(r) }}</span>
          </div>
          @if (stopRows().length) {
            <div class="tbl-wrap">
              <table class="tbl" id="tf-stops">
                <thead>
                  <tr>
                    <th>Route</th>
                    <th>Stop</th>
                    <th class="r">From school</th>
                    <th class="r">A year</th>
                    <th class="r">A month</th>
                  </tr>
                </thead>
                <tbody>
                  @for (s of stopRows(); track s.key) {
                    <tr>
                      <td>
                        <b class="t-sb">{{ s.route }}</b>
                      </td>
                      <td>{{ s.stop }}</td>
                      <td class="r t-num">{{ s.km }}</td>
                      <td class="r t-num">{{ s.year }}</td>
                      <td class="r t-num">{{ s.month }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <rp-empty
              icon="route"
              title="No stops to charge yet"
              text="Add routes with their stops and distances first."
            />
          }
        </div>
      </div>
    }
  `,
})
export class TransportFeePanel implements OnInit {
  private readonly api = inject(TransportApi);
  private readonly overlays = inject(Overlays);

  readonly routes = input<readonly Route[]>([]);
  /** Why this user can't set the fee ('' when they can: the Institution Administrator). */
  readonly why = input('');

  protected readonly modes = MODES;
  protected readonly maxRanges = MAX_RANGES;
  protected readonly rule = signal<FeeRule | null>(null);
  protected readonly on = signal(false);
  protected readonly mode = signal<FeeMode>('PER_KM');
  protected readonly rate = signal('');
  protected readonly day = signal('5');
  protected readonly rows = signal<readonly RangeRow[]>([]);
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly error = signal('');
  protected readonly loadError = signal('');
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  private seq = 0;

  /** The rate typed, in paise (null while it doesn't read as an amount). */
  private readonly ratePaise = computed(() => paise(this.rate()));
  /** The ranges typed that read as ranges (in order, as the API would take them). */
  private readonly ranges = computed<FeeRange[]>(() =>
    this.rows()
      .map((x) => ({ uptoKm: Number(x.upto.trim()), yearlyPaise: paise(x.amount) ?? NaN }))
      .filter((x) => x.uptoKm > 0 && x.yearlyPaise > 0),
  );
  private readonly months = computed(() => this.rule()?.year?.months ?? 12);
  /** The rule as typed, for the examples and the table. */
  private readonly typed = computed(() => ({
    mode: this.mode(),
    ratePaisePerKm: this.ratePaise() ?? this.rule()?.ratePaisePerKm ?? 0,
    ranges: this.ranges(),
  }));
  protected readonly intro = computed(() =>
    this.mode() === 'RANGE'
      ? "The fee is the amount a year for the range the stop's distance from the school falls in, raised as one due a month when a student or a staff member is given a stop."
      : "The fee is the stop's distance from the school × 2 (both ways) × the rate per km for the year, raised as one due a month when a student or a staff member is given a stop.",
  );
  protected readonly example = computed(() => {
    const m = this.months();
    if (this.mode() === 'RANGE') {
      const first = this.ranges()[0];
      if (!first) return 'Add a range to see what a stop in it would pay.';
      return `A stop up to ${km(first.uptoKm)} from the school: ${formatInr(first.yearlyPaise)} a year — ${formatInr(monthlyFee(first.yearlyPaise, m))} a month over ${m} months.`;
    }
    const p = this.ratePaise();
    if (!p) return 'Enter the rate to see what a stop 5 km from the school would pay.';
    const y = yearlyFee(5, p);
    return `A stop 5 km from the school: 5 km × 2 × ${formatInr(p)} = ${formatInr(y)} a year — ${formatInr(monthlyFee(y, m))} a month over ${m} months.`;
  });
  protected readonly stopRows = computed(() => {
    const rule = this.typed();
    const shown = rule.mode === 'RANGE' ? rule.ranges.length > 0 : rule.ratePaisePerKm > 0;
    return this.routes()
      .filter((r) => r.active)
      .flatMap((r) =>
        r.stops
          .filter((s) => s.seq > 0)
          .map((s) => {
            const y = feeFor(rule, s.fromSchoolKm ?? 0);
            return {
              key: `${r.id}:${s.stop.id}`,
              route: r.code,
              stop: s.stop.name,
              km: km(s.fromSchoolKm ?? 0),
              year: !shown ? '—' : y === null ? 'Not charged' : formatInr(y),
              month: !shown || y === null ? '—' : formatInr(monthlyFee(y, this.months())),
            };
          }),
      );
  });
  protected readonly applyWhy = computed(() => {
    const r = this.rule();
    const set = r && (r.mode === 'RANGE' ? r.ranges.length > 0 : r.ratePaisePerKm > 0);
    if (!r?.active || !set) return 'Switch the fee on, set it and save first.';
    return '';
  });

  ngOnInit() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.set(await this.api.feeRule());
      this.loadError.set('');
    } catch (e) {
      this.loadError.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }

  private set(r: FeeRule) {
    this.rule.set(r);
    this.on.set(r.active);
    this.mode.set(r.mode ?? 'PER_KM');
    this.rate.set(r.ratePaisePerKm ? r.ratePerKm.amount : '');
    this.day.set(String(r.dueDay));
    const rows = (r.ranges ?? []).map((x) => ({
      key: ++this.seq,
      upto: String(x.uptoKm),
      amount: x.yearly.amount,
    }));
    this.rows.set(rows.length ? rows : [this.blank()]);
  }

  private blank(): RangeRow {
    return { key: ++this.seq, upto: '', amount: '' };
  }

  protected setMode(m: FeeMode) {
    if (this.why()) return;
    this.mode.set(m);
    this.errors.set({});
  }
  protected fromOf(i: number) {
    if (!i) return km(0);
    const prev = Number(this.rows()[i - 1]?.upto.trim());
    return prev > 0 ? km(prev) : '—';
  }
  protected edit(i: number, f: 'upto' | 'amount', v: string) {
    this.rows.update((rows) => rows.map((x, j) => (j === i ? { ...x, [f]: v } : x)));
    this.clear('ranges');
  }
  protected add() {
    if (this.rows().length >= MAX_RANGES) return;
    this.rows.update((rows) => [...rows, this.blank()]);
    this.clear('ranges');
  }
  protected remove(i: number) {
    this.rows.update((rows) => {
      const left = rows.filter((_, j) => j !== i);
      return left.length ? left : [this.blank()];
    });
    this.clear('ranges');
  }

  protected yearNote(r: FeeRule) {
    return r.year
      ? `${r.year.label}: ${r.year.months} monthly dues. Distances are along each route from the school (its first stop).`
      : 'No current academic year.';
  }
  protected err(f: Field) {
    return this.errors()[f] ?? '';
  }
  protected clear(f: Field) {
    if (this.errors()[f]) this.errors.update((e) => ({ ...e, [f]: '' }));
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected checked(e: Event) {
    return (e.target as HTMLInputElement).checked;
  }

  /** The ranges as typed, checked as the API checks them ('' when fine). */
  private rangesProblem(): string {
    const filled = this.rows().filter((x) => x.upto.trim() || x.amount.trim());
    if (!filled.length) return this.on() ? 'Add at least one range' : '';
    let prev = 0;
    for (const x of filled) {
      const upto = Number(x.upto.trim());
      const amount = paise(x.amount);
      if (
        !x.upto.trim() ||
        !Number.isFinite(upto) ||
        upto <= prev ||
        upto > 500 ||
        !/^\d+(\.\d{1,2})?$/.test(x.upto.trim())
      ) {
        return 'Give each range an upper km larger than the one before (up to 500 km, 2 decimals)';
      }
      if (amount === null || amount <= 0 || amount > 100_000_000) {
        return 'Enter each range’s amount a year, from ₹1 to ₹10,00,000';
      }
      prev = upto;
    }
    return '';
  }

  protected async save() {
    const r = this.rule();
    if (!r || this.why()) return;
    const e: Partial<Record<Field, string>> = {};
    const p = this.ratePaise();
    if (this.mode() === 'PER_KM') {
      if (p === null || p < 0 || p > 10_000_000) e.rate = 'Enter the rate, from ₹0 to ₹1,00,000';
      else if (this.on() && p === 0) e.rate = 'Enter the rate to charge by distance';
    } else {
      const problem = this.rangesProblem();
      if (problem) e.ranges = problem;
    }
    const d = Number(this.day());
    if (!Number.isInteger(d) || d < 1 || d > 28) e.day = 'Choose a day from 1 to 28';
    this.errors.set(e);
    if (Object.values(e).some(Boolean)) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const out = await this.api.setFeeRule(r.version, {
        active: this.on(),
        mode: this.mode(),
        // The other mode's values are kept as they are.
        ...(this.mode() === 'PER_KM' ? { ratePaisePerKm: p ?? 0 } : { ranges: this.ranges() }),
        dueDay: d,
      });
      this.set(out);
      this.overlays.toast('Transport fee saved', {
        sub: !out.active
          ? 'Not charged by distance'
          : out.mode === 'RANGE'
            ? `${out.ranges.length} distance ${out.ranges.length === 1 ? 'range' : 'ranges'}, due on day ${out.dueDay}`
            : `${formatInr(out.ratePaisePerKm)} a km a year, due on day ${out.dueDay}`,
      });
    } catch (x) {
      if (x instanceof ApiProblem && x.status === 412) {
        this.error.set('Someone else changed the transport fee. Reload the page and try again.');
      } else if (x instanceof ApiProblem && x.errors.length) {
        const f = x.errors[0]!;
        this.errors.set(
          f.field === 'dueDay'
            ? { day: f.message }
            : f.field.startsWith('ranges')
              ? { ranges: f.message }
              : { rate: f.message },
        );
      } else this.error.set(problemText(x));
    } finally {
      this.busy.set(false);
    }
  }

  /** TRN-042: dues for the allocations made before the fee was switched on (re-runnable). */
  protected async apply() {
    if (this.applyWhy() || this.why()) return;
    const ok = await this.overlays.confirm({
      title: 'Raise transport dues now?',
      text: 'Every student and staff member with a bus this year gets their monthly transport dues, worked out from their stop. Months already charged are left alone.',
      ok: 'Raise dues',
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      const out = await this.api.applyFeeRule();
      this.overlays.toast(out.records ? 'Transport dues raised' : 'Nothing to raise', {
        sub: out.records
          ? `${out.records} dues for ${out.members} people · ₹${out.amount.amount} in all`
          : 'Everyone allocated already has their transport dues.',
      });
    } catch (x) {
      this.overlays.toast('Dues not raised', { sub: problemText(x), tone: 'bad' });
    } finally {
      this.busy.set(false);
    }
  }
}

/** An amount typed, in paise (null while it doesn't read as one). */
function paise(text: string): number | null {
  try {
    return text.trim() ? Number(parseAmount(text.trim())) : null;
  } catch {
    return null;
  }
}
