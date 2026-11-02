import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
  type OnInit,
} from '@angular/core';
import { Avatar } from '../../../Shared/Avatar';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate, formatInr } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { person } from '../Applications/app-format';
import { plural } from '../Fees/fee-format';
import { addDays, num, problemText, today } from '../Structure/academic-format';
import type { YearRef } from '../Structure/academic-year';
import { feeFor, monthlyFee } from '../Routes/TransportFeePanel';
import {
  TransportApi,
  type AllocationRow,
  type FeeRule,
  type Route,
} from '../Transport/transport.api';
import { km } from '../Transport/transport-format';

/**
 * A student's transport choice on the admission form (client 2026-10-12), as a chip: opted (with the
 * stop preferred) or not. Null when there is no choice on record — they stay eligible.
 */
export function transportChoice(r: AllocationRow): { l: string; tone: string } | null {
  const t = r.transport;
  if (!t) return null;
  if (!t.opted) return { l: 'Not opted', tone: 'warn' };
  return { l: t.stop ? `Opted · ${t.stop}` : 'Opted', tone: 'ok' };
}

type Kind = 'STUDENT' | 'STAFF';
type Field = 'members' | 'route' | 'stop' | 'from' | 'to';

/**
 * Allocate passengers (prototype cc.al.edit / cc.al.save; TRN-021; FR-TRN-04, BR-61): students — or
 * teachers and staff — without an allocation, a route and a stop on it, and dates inside the year;
 * never two allocations over the same dates. Each passenger and family is told.
 */
@Component({
  selector: 'rp-allocate-drawer',
  imports: [Avatar, Dropdown, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      title="Allocate passengers"
      [sub]="(year()?.label ?? '') + ' · one active allocation per passenger'"
      icon="users"
      [drawer]="true"
      [slim]="true"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="al-form">
        @if (error()) {
          <div class="note tone-bad" role="alert" id="al-err">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow"><b>Not saved.</b> {{ error() }}</div>
          </div>
        }
        @if (!preset()) {
          <div>
            <span class="fld-l" id="al-k-l">Passenger type</span>
            <div class="cc-radios" role="radiogroup" aria-labelledby="al-k-l">
              @for (k of kinds; track k.v) {
                <label class="chk"
                  ><input
                    type="radio"
                    name="al-k"
                    [value]="k.v"
                    [checked]="kind() === k.v"
                    (change)="setKind(k.v)"
                  /><span>{{ k.l }}</span></label
                >
              }
            </div>
          </div>
        }
        <div class="fld" [class.invalid]="err('members')">
          <span class="fld-l" id="al-m-l"
            >{{ kind() === 'STUDENT' ? 'Students' : 'Teachers and staff'
            }}<span class="req">*</span></span
          >
          @if (preset(); as p) {
            <dl class="kv">
              <dt>Passenger</dt>
              <dd>{{ name(p) }}</dd>
              <dt>{{ p.member.class ? 'Class' : 'Type' }}</dt>
              <dd>{{ detail(p) }}</dd>
              @if (choice(p); as c) {
                <dt>Transport</dt>
                <dd>{{ c.l }}</dd>
              }
            </dl>
          } @else {
            <div class="cm-pk">
              <div class="c-filters" style="margin: 0 0 8px">
                <label class="search"
                  ><rp-icon name="search" [size]="16" /><input
                    type="search"
                    id="al-q"
                    placeholder="Search name or admission no."
                    aria-label="Search passengers"
                    autocomplete="off"
                    [value]="q()"
                    (input)="search($event)"
                /></label>
              </div>
              <div class="cm-pk-bar">
                <label class="chk"
                  ><input
                    type="checkbox"
                    id="al-all"
                    [checked]="allOn()"
                    [disabled]="!eligible().length"
                    (change)="toggleAll()"
                  /><span>Select all {{ num(eligible().length) }} shown</span></label
                >
                <span class="grow"></span>
                <b class="t-num">{{ num(selected().length) }} selected</b>
                @if (selected().length) {
                  <button type="button" class="linkbtn" (click)="selected.set([])">Clear</button>
                }
              </div>
              <div class="cm-pk-list" role="group" aria-labelledby="al-m-l">
                @if (loading() && !candidates().length) {
                  <div class="cm-pk-none">Loading…</div>
                }
                @for (r of candidates(); track r.member.id) {
                  <label
                    class="cm-pk-row"
                    [class.on]="isOn(r.member.id)"
                    [class.off]="declined(r)"
                    [attr.title]="declined(r) ? notOpted : null"
                    ><input
                      type="checkbox"
                      [value]="r.member.id"
                      [checked]="isOn(r.member.id)"
                      [disabled]="declined(r)"
                      (change)="toggle(r.member.id)"
                    /><rp-av [name]="name(r)" size="xs" /><span class="grow cm-pk-t"
                      ><b>{{ name(r) }}</b
                      ><small>{{ detail(r) }}</small></span
                    >
                    @if (choice(r); as c) {
                      <span [class]="'chip tone-' + c.tone">{{ c.l }}</span>
                    }
                  </label>
                } @empty {
                  @if (!loading()) {
                    <div class="cm-pk-none">
                      Everyone here already has an allocation, or no one matches.
                    </div>
                  }
                }
              </div>
            </div>
          }
          <div class="fld-e" id="al-m-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('members') }}</span>
          </div>
        </div>
        <div class="fld" [class.invalid]="err('route')">
          <label class="fld-l" for="al-r-b">Route<span class="req">*</span></label>
          <rp-dd
            inputId="al-r"
            placeholder="Choose a route"
            [options]="routeOptions()"
            [value]="route()"
            (changed)="route.set($event); stop.set(''); clear('route')"
          />
          <div class="fld-e" id="al-r-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('route') }}</span>
          </div>
        </div>
        <div class="fld" [class.invalid]="err('stop')">
          <label class="fld-l" for="al-s-b">Pickup and drop stop<span class="req">*</span></label>
          <rp-dd
            inputId="al-s"
            [placeholder]="route() ? 'Choose a stop' : 'Choose a route first'"
            [options]="stopOptions()"
            [value]="stop()"
            [disabled]="!route()"
            (changed)="stop.set($event); clear('stop')"
          />
          <div class="fld-e" id="al-s-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('stop') }}</span>
          </div>
        </div>
        @if (feeNote()) {
          <div class="note tone-info" id="al-fee">
            <rp-icon name="info" [size]="17" />
            <div class="grow">{{ feeNote() }}</div>
          </div>
        }
        <div class="c-form">
          <div class="fld" [class.invalid]="err('from')">
            <label class="fld-l" for="al-f">From<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="al-f"
                type="date"
                aria-describedby="al-f-e"
                [min]="year()?.startsOn ?? ''"
                [max]="year()?.endsOn ?? ''"
                [value]="from()"
                (change)="from.set(val($event)); clear('from')"
              />
            </div>
            <div class="fld-e" id="al-f-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('from') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('to')">
            <label class="fld-l" for="al-t">To<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="al-t"
                type="date"
                aria-describedby="al-t-e"
                [min]="from()"
                [max]="year()?.endsOn ?? ''"
                [value]="to()"
                (change)="to.set(val($event)); clear('to')"
              />
            </div>
            <div class="fld-e" id="al-t-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('to') }}</span>
            </div>
          </div>
        </div>
        <p class="t-xs t-muted">Each passenger and their family is told of the allocation.</p>
      </div>
      <div modal-foot class="cc-foot">
        <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="al-save"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="save()"
        >
          <rp-icon name="check" [size]="17" /><span>{{
            count() > 1 ? 'Allocate ' + count() : 'Allocate'
          }}</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class AllocateDrawer implements OnInit {
  private readonly api = inject(TransportApi);
  private readonly overlays = inject(Overlays);

  /** A passenger chosen from the list (Allocate on an unassigned row). */
  readonly preset = input<AllocationRow | null>(null);
  readonly startKind = input<Kind>('STUDENT');
  readonly routes = input<readonly Route[]>([]);
  readonly year = input<YearRef | null>(null);
  readonly closed = output<void>();
  readonly saved = output<number>();

  protected readonly num = num;
  protected readonly kinds: readonly { v: Kind; l: string }[] = [
    { v: 'STUDENT', l: 'Student' },
    { v: 'STAFF', l: 'Teacher or staff' },
  ];
  protected readonly kind = signal<Kind>('STUDENT');
  protected readonly q = signal('');
  protected readonly candidates = signal<readonly AllocationRow[]>([]);
  protected readonly selected = signal<readonly string[]>([]);
  protected readonly route = signal('');
  protected readonly stop = signal('');
  protected readonly from = signal(addDays(today(), 1));
  protected readonly to = signal('');
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly error = signal('');
  private timer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;

  protected readonly routeOptions = computed<DropdownOption[]>(() =>
    this.routes()
      .filter((r) => r.active)
      .map((r) => ({ v: r.id, l: `${r.code} · ${r.name}`, sub: plural(r.stops.length, 'stop') })),
  );
  protected readonly stopOptions = computed<DropdownOption[]>(() => {
    const r = this.routes().find((x) => x.id === this.route());
    return (r?.stops ?? []).map((s) => ({
      v: s.stop.id,
      l: s.stop.name,
      sub: s.seq ? `Stop ${s.seq} · ${km(s.fromSchoolKm ?? 0)} from the school` : 'School end',
    }));
  });
  /** The transport fee by distance, when the school charges it (client 2026-10-21). */
  protected readonly feeRule = signal<FeeRule | null>(null);
  protected readonly feeNote = computed(() => {
    const rule = this.feeRule();
    if (!rule?.active) return '';
    const ranges = rule.mode === 'RANGE';
    if (ranges ? !rule.ranges.length : !rule.ratePaisePerKm) return '';
    const r = this.routes().find((x) => x.id === this.route());
    const s = r?.stops.find((x) => x.stop.id === this.stop());
    if (!s) return '';
    const d = s.fromSchoolKm ?? 0;
    if (!d) return 'No transport fee for a stop at the school end of the route.';
    const y = feeFor(rule, d);
    if (y === null) {
      return `No transport fee: ${km(d)} from the school is beyond the last distance range.`;
    }
    const months = rule.year?.months ?? 12;
    const how = ranges
      ? `${km(d)} from the school is in the range up to ${km(rule.ranges.find((x) => d <= x.uptoKm)!.uptoKm)}:`
      : `${km(d)} × 2 × ${formatInr(rule.ratePaisePerKm)} =`;
    return `Transport fee: ${how} ${formatInr(y)} a year, ${formatInr(monthlyFee(y, months))} a month from the month the bus starts. Each one's monthly dues are raised when you allocate.`;
  });
  /** Who can be chosen: not a student who declined transport on the admission form. */
  protected readonly eligible = computed(() => this.candidates().filter((c) => !this.declined(c)));
  protected readonly allOn = computed(
    () =>
      !!this.eligible().length &&
      this.eligible().every((c) => this.selected().includes(c.member.id)),
  );
  protected readonly notOpted = "Didn't opt for school transport on the admission form";
  protected readonly count = computed(() => (this.preset() ? 1 : this.selected().length));

  constructor() {
    inject(DestroyRef).onDestroy(() => this.timer && clearTimeout(this.timer));
  }

  ngOnInit() {
    // The fee preview only: no rule (or no access) shows none.
    this.api.feeRule().then(
      (r) => this.feeRule.set(r),
      () => this.feeRule.set(null),
    );
    const y = this.year();
    if (y?.endsOn) this.to.set(y.endsOn);
    if (y?.startsOn && this.from() < y.startsOn) this.from.set(y.startsOn);
    const p = this.preset();
    if (p) {
      this.kind.set(p.member.class ? 'STUDENT' : this.startKind());
      return;
    }
    this.kind.set(this.startKind());
    void this.load();
  }

  async load() {
    const n = ++this.seq;
    this.loading.set(true);
    try {
      const r = await this.api.allocations({ kind: this.kind(), assigned: false, q: this.q() });
      if (n === this.seq) this.candidates.set(r.items);
    } catch (e) {
      if (n === this.seq) this.error.set(problemText(e));
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
  }

  protected setKind(k: Kind) {
    this.kind.set(k);
    this.selected.set([]);
    void this.load();
  }
  protected search(e: Event) {
    this.q.set((e.target as HTMLInputElement).value);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.load(), 300);
  }
  protected isOn(id: string) {
    return this.selected().includes(id);
  }
  protected toggle(id: string) {
    this.selected.update((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    this.clear('members');
  }
  protected toggleAll() {
    const ids = this.eligible().map((c) => c.member.id);
    this.selected.set(this.allOn() ? [] : ids.slice(0, 200));
    this.clear('members');
  }
  protected name(r: AllocationRow) {
    return person(r.member.name);
  }
  protected declined(r: AllocationRow) {
    return r.transport?.opted === false;
  }
  /** The choice on the admission form, when there is one (client 2026-10-12). */
  protected choice(r: AllocationRow) {
    return transportChoice(r);
  }
  /** CR-09: admission number and grade-section (students), else the user type. */
  protected detail(r: AllocationRow) {
    const m = r.member;
    if (!m.class) return m.type;
    return [m.admissionNo, `${m.class}${m.section ? ' ' + m.section : ''}`]
      .filter(Boolean)
      .join(' · ');
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

  /** cc.al.save's checks, then TRN-021. */
  protected async save() {
    const e: Partial<Record<Field, string>> = {};
    const ids = this.preset() ? [this.preset()!.member.id] : this.selected();
    if (!ids.length)
      e.members =
        this.kind() === 'STUDENT' ? 'Choose a student' : 'Choose a teacher or staff member';
    else if (ids.length > 200) e.members = translate('TRN.MEMBERS');
    if (!this.route()) e.route = 'Choose a route';
    if (!this.stop()) e.stop = 'Choose a stop on this route';
    const y = this.year();
    const inYear = (d: string) => !y?.startsOn || !y.endsOn || (d >= y.startsOn && d <= y.endsOn);
    if (!this.from()) e.from = 'Choose the start date';
    else if (!inYear(this.from())) e.from = `Choose a date within ${y?.label ?? 'the year'}`;
    if (!this.to()) e.to = 'Choose the end date';
    else if (!inYear(this.to())) e.to = `Choose a date within ${y?.label ?? 'the year'}`;
    else if (this.to() < this.from()) e.to = "The end date can't be before the start date";
    this.errors.set(e);
    if (Object.values(e).some(Boolean)) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const out = await this.api.allocate({
        memberIds: ids,
        routeId: this.route(),
        stopId: this.stop(),
        from: this.from(),
        to: this.to(),
      });
      const r = this.routes().find((x) => x.id === this.route());
      const s = r?.stops.find((x) => x.stop.id === this.stop());
      const dues = out.fees?.records ? ` · ${out.fees.records} transport dues raised` : '';
      this.overlays.toast(out.allocated === 1 ? 'Passenger allocated' : 'Passengers allocated', {
        sub: `${plural(out.allocated, 'passenger')} · ${r?.code ?? ''} · ${s?.stop.name ?? ''} · from ${formatDate(this.from())} · families told${dues}`,
      });
      this.saved.emit(out.allocated);
    } catch (x) {
      if (x instanceof ApiProblem && x.errors.length) {
        const f = x.errors[0]!;
        const map: Readonly<Record<string, Field>> = {
          memberIds: 'members',
          routeId: 'route',
          stopId: 'stop',
          from: 'from',
          to: 'to',
        };
        const k = map[f.field];
        if (k) this.errors.update((o) => ({ ...o, [k]: f.message }));
        else this.error.set(f.message);
      } else {
        this.error.set(problemText(x));
      }
    } finally {
      this.busy.set(false);
    }
  }
}
