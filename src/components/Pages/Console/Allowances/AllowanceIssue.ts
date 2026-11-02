import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { inrText } from '../../../Shared/Amount';
import { Avatar } from '../../../Shared/Avatar';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate, istBusinessDate } from '../../../Utils/format';
import { newIdempotencyKey } from '../../../Utils/ids';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { amountText as amountTyping, cleanTyped } from '../../../Utils/typing';
import { MembersApi, type ClassView, type MemberRow } from '../Members/members.api';
import {
  financialYearEnd,
  firstOfNextMonth,
  holds,
  moneyInput,
  overlaps,
  plural,
} from './allowance-format';
import { AllowancesApi, type AllowanceGrant, type Money } from './allowances.api';

type Field = 'name' | 'amount' | 'start' | 'expiry' | 'count' | 'lamt';
const STEPS = ['Students', 'Amount and dates', 'Preview'] as const;
const SHOWN = 150;

const paiseOf = (v: string) => Math.round(Number(v) * 100);
const inr = (amount: string) => inrText({ amount });

/**
 * The "Issue allowance" wizard (prototype cm.alw.new; SRS 10.2, FR-ALW-01, BR-40; ALW-003):
 * students (class, section and search; a student who already holds an allowance is flagged and
 * must be removed — BR-40), then the name, amount, dates and optional daily limits (the form
 * proposes the limits register's defaults), then a preview and a confirmation. The server checks
 * everything again and answers per student.
 */
@Component({
  selector: 'rp-allowance-issue',
  imports: [Avatar, Dropdown, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      title="Issue allowance"
      sub="Select students, set the amount and dates, then review."
      icon="gift"
      [wide]="true"
      cls="cm-m"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="cm-wz">
        @for (s of steps; track s; let i = $index) {
          <span [class.done]="i < step()" [class.on]="i === step()"
            ><i>
              @if (i < step()) {
                <rp-icon name="check" [size]="12" [stroke]="3" />
              } @else {
                {{ i + 1 }}
              }
            </i>
            {{ s }}</span
          >
        }
      </div>

      @switch (step()) {
        @case (0) {
          <div class="cm-pk">
            <div class="cm-pk-f">
              <rp-dd
                inputId="pk-al-cls"
                placeholder="All classes"
                [options]="classOptions()"
                [value]="cls()"
                (changed)="setClass($event)"
              />
              <rp-dd
                inputId="pk-al-sec"
                placeholder="All sections"
                [options]="sectionOptions()"
                [value]="sec()"
                (changed)="setSection($event)"
              />
              <label class="search"
                ><rp-icon name="search" [size]="16" /><input
                  type="search"
                  id="pk-al-q"
                  placeholder="Search name or admission no."
                  aria-label="Search students"
                  autocomplete="off"
                  [value]="q()"
                  (input)="setQ($event)"
              /></label>
            </div>
            <div class="cm-pk-bar">
              <label class="chk"
                ><input
                  type="checkbox"
                  id="pk-al-all"
                  [checked]="allOn()"
                  [disabled]="!shown().length"
                  (change)="toggleAll()"
                /><span>Select all {{ num(shown().length) }} shown</span></label
              >
              <span class="grow"></span>
              <b class="t-num">{{ num(selected().length) }} selected</b>
              @if (selected().length) {
                <button type="button" class="linkbtn" (click)="sel.set([])">Clear</button>
              }
            </div>
            <div class="cm-pk-list" role="group" aria-label="Students">
              @if (loading() && !students().length) {
                <div class="cm-pk-none">Loading students…</div>
              }
              @for (s of shown(); track s.id) {
                <label class="cm-pk-row" [class.on]="isOn(s.id)"
                  ><input
                    type="checkbox"
                    [value]="s.id"
                    [checked]="isOn(s.id)"
                    (change)="toggle(s)"
                  /><rp-av [name]="s.name" size="xs" /><span class="grow cm-pk-t"
                    ><b>{{ s.name }}</b
                    ><small>{{ s.admissionNo ?? '—' }} · {{ gradeOf(s) }}</small></span
                  >
                  @if (holder(s.id)) {
                    <span class="chip tone-warn">Holds an allowance</span>
                  }
                </label>
              } @empty {
                @if (!loading()) {
                  <div class="cm-pk-none">
                    No active students match. Change the class or search.
                  </div>
                }
              }
            </div>
            @if (more()) {
              <div class="t-xs t-muted" style="padding: 6px 2px 0">
                Showing the first {{ shown().length }} — narrow by class, section or search.
              </div>
            }
          </div>
          @if (pickError()) {
            <div class="note tone-bad mt12" role="alert">
              <rp-icon name="alertc" [size]="17" />
              <div class="grow" [innerHTML]="pickError()"></div>
              @if (holders().length) {
                <button type="button" class="btn btn-sec btn-sm note-a" (click)="dropHolders()">
                  <span>Remove them</span>
                </button>
              }
            </div>
          }
        }
        @case (1) {
          <div class="c-form">
            <div class="full">
              <div class="fld" [class.invalid]="err('name')">
                <label class="fld-l" for="af-name">Allowance name<span class="req">*</span></label>
                <div class="fld-in">
                  <input
                    id="af-name"
                    type="text"
                    maxlength="40"
                    autocomplete="off"
                    placeholder="e.g. Term 2 pocket money"
                    aria-describedby="af-name-e"
                    [value]="f().name"
                    (input)="set('name', $event)"
                  />
                </div>
                <div class="fld-h">Letters, numbers and spaces only.</div>
                <div class="fld-e" id="af-name-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('name') }}</span>
                </div>
              </div>
            </div>
            <div class="fld" [class.invalid]="err('amount')">
              <label class="fld-l" for="af-amount"
                >Amount per student<span class="req">*</span></label
              >
              <div class="fld-in">
                <span class="pre">₹</span
                ><input
                  id="af-amount"
                  inputmode="decimal"
                  autocomplete="off"
                  placeholder="0.00"
                  aria-describedby="af-amount-e"
                  [value]="f().amount"
                  (input)="set('amount', $event)"
                />
              </div>
              <div class="fld-h">Up to 2 decimal places.</div>
              <div class="fld-e" id="af-amount-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('amount') }}</span>
              </div>
            </div>
            <div></div>
            <div class="fld" [class.invalid]="err('start')">
              <label class="fld-l" for="af-start">Start date<span class="req">*</span></label>
              <div class="fld-in">
                <input
                  id="af-start"
                  type="date"
                  aria-describedby="af-start-e"
                  [value]="f().start"
                  (input)="set('start', $event)"
                />
              </div>
              <div class="fld-h">
                Must be in the future and the 1st of a month — the 00:05 job credits it that day.
              </div>
              <div class="fld-e" id="af-start-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('start') }}</span>
              </div>
            </div>
            <div class="fld" [class.invalid]="err('expiry')">
              <label class="fld-l" for="af-expiry">Expiry date<span class="req">*</span></label>
              <div class="fld-in">
                <input
                  id="af-expiry"
                  type="date"
                  aria-describedby="af-expiry-e"
                  [value]="f().expiry"
                  (input)="set('expiry', $event)"
                />
              </div>
              <div class="fld-h">
                Default: 31 Mar, the end of the financial year. Unspent balance lapses.
              </div>
              <div class="fld-e" id="af-expiry-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('expiry') }}</span>
              </div>
            </div>
            <div class="full">
              <div class="li" style="min-height: 52px">
                <span class="li-ic sm"><rp-icon name="gauge" [size]="16" /></span>
                <span class="li-main"
                  ><span class="li-t wrap" id="af-lim-l">Set daily limits</span
                  ><span class="li-s wrap"
                    >Maximum payments and amount a student can spend from the allowance in one
                    day.</span
                  ></span
                >
                <button
                  type="button"
                  class="toggle"
                  role="switch"
                  id="af-lim"
                  aria-label="Set daily limits"
                  [attr.aria-checked]="f().lim"
                  (click)="toggleLimits()"
                ></button>
              </div>
            </div>
            <div class="fld" [class.cm-dim]="!f().lim" [class.invalid]="err('count')">
              <label class="fld-l" for="af-count">Payments per day</label>
              <div class="fld-in">
                <input
                  id="af-count"
                  inputmode="numeric"
                  maxlength="2"
                  autocomplete="off"
                  aria-describedby="af-count-e"
                  [disabled]="!f().lim"
                  [value]="f().count"
                  (input)="set('count', $event)"
                />
              </div>
              <div class="fld-e" id="af-count-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('count') }}</span>
              </div>
            </div>
            <div class="fld" [class.cm-dim]="!f().lim" [class.invalid]="err('lamt')">
              <label class="fld-l" for="af-lamt">Amount per day</label>
              <div class="fld-in">
                <span class="pre">₹</span
                ><input
                  id="af-lamt"
                  inputmode="decimal"
                  autocomplete="off"
                  aria-describedby="af-lamt-e"
                  [disabled]="!f().lim"
                  [value]="f().lamt"
                  (input)="set('lamt', $event)"
                />
              </div>
              <div class="fld-e" id="af-lamt-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('lamt') }}</span>
              </div>
            </div>
            <div class="full">
              <div class="note tone-info">
                <rp-icon name="info" [size]="17" />
                <div class="grow">
                  {{ plural(selected().length, 'student') }} selected. The allowance is credited
                  <b>once</b>, on the start date — a recurring monthly credit is still an open
                  decision (OQ-08). It's spendable only at regular merchants that accept allowances
                  (BR-42) and can't be withdrawn or transferred.
                </div>
              </div>
            </div>
          </div>
        }
        @default {
          <div class="stack g16">
            <dl class="kv">
              <dt>Allowance</dt>
              <dd>{{ f().name }}</dd>
              <dt>Students</dt>
              <dd>{{ num(selected().length) }}</dd>
              <dt>Amount per student</dt>
              <dd>{{ inr(amountText()) }}</dd>
              <dt>Total to be credited</dt>
              <dd>
                <b>{{ total() }}</b>
              </dd>
              <dt>Credited</dt>
              <dd>{{ date(f().start) }} at 00:05 by the daily job</dd>
              <dt>Lapses</dt>
              <dd>{{ date(f().expiry) }} at 00:05</dd>
              <dt>Daily limits</dt>
              <dd>{{ limitsLabel() }}</dd>
            </dl>
            <div class="tbl-wrap cm-scroll">
              <table class="tbl dense">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Admission no.</th>
                    <th>Class</th>
                    <th class="r">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  @for (s of selected(); track s.id) {
                    <tr>
                      <td>
                        <b>{{ s.name }}</b>
                      </td>
                      <td>
                        <span class="t-mono">{{ s.admissionNo ?? '—' }}</span>
                      </td>
                      <td>{{ gradeOf(s) }}</td>
                      <td class="r">{{ inr(amountText()) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="note tone-brand">
              <rp-icon name="info" [size]="17" />
              <div class="grow">
                Each allowance is created as <b>Scheduled</b>. Nothing is credited until the start
                date.
              </div>
            </div>
            @if (submitError()) {
              <div class="note tone-bad" role="alert">
                <rp-icon name="alertc" [size]="17" />
                <div class="grow">{{ submitError() }}</div>
              </div>
            }
          </div>
        }
      }

      <div modal-foot class="row g8" style="justify-content: flex-end; width: 100%">
        <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="back()">
          <span>{{ step() ? 'Back' : 'Cancel' }}</span>
        </button>
        <button type="button" class="btn btn-pri" id="af-next" [disabled]="busy()" (click)="next()">
          @if (step() === 2) {
            <rp-icon name="check" [size]="17" /><span
              >Schedule for {{ plural(selected().length, 'student') }}</span
            >
          } @else {
            <span>Continue</span><rp-icon name="arrowr" [size]="17" />
          }
        </button>
      </div>
    </rp-modal>
  `,
})
export class AllowanceIssue {
  private readonly api = inject(AllowancesApi);
  private readonly members = inject(MembersApi);
  private readonly overlays = inject(Overlays);

  readonly classes = input<readonly ClassView[]>([]);
  /** Every grant of the institution (BR-40: who already holds an allowance). */
  readonly grants = input<readonly AllowanceGrant[]>([]);
  readonly defaults = input<{ dailyCount: number; dailyAmount: Money } | null>(null);
  readonly closed = output<void>();
  readonly issued = output<{ created: number; startDate: string }>();

  protected readonly steps = STEPS;
  protected readonly step = signal(0);
  protected readonly cls = signal('');
  protected readonly sec = signal('');
  protected readonly q = signal('');
  protected readonly students = signal<readonly MemberRow[]>([]);
  protected readonly more = signal(false);
  protected readonly loading = signal(false);
  protected readonly sel = signal<readonly MemberRow[]>([]);
  protected readonly pickError = signal('');
  protected readonly submitError = signal('');
  protected readonly busy = signal(false);
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly f = signal({
    name: '',
    amount: '',
    start: firstOfNextMonth(),
    expiry: financialYearEnd(firstOfNextMonth()),
    lim: false,
    count: '',
    lamt: '',
  });
  private readonly key = newIdempotencyKey();
  private seq = 0;
  private qTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly classOptions = computed<DropdownOption[]>(() => [
    { v: '', l: 'All classes' },
    ...this.classes().map((c) => ({ v: c.id, l: c.name })),
  ]);
  protected readonly sectionOptions = computed<DropdownOption[]>(() => {
    const c = this.classes().find((x) => x.id === this.cls());
    return [
      { v: '', l: 'All sections' },
      ...(c?.sections ?? []).map((s) => ({ v: s.id, l: `Section ${s.name}` })),
    ];
  });
  protected readonly shown = computed(() => this.students().slice(0, SHOWN));
  protected readonly selected = computed(() => this.sel());
  protected readonly allOn = computed(
    () => this.shown().length > 0 && this.shown().every((s) => this.isOn(s.id)),
  );
  /** Selected students who already hold an allowance (any live grant; BR-40). */
  protected readonly holders = computed(() => this.sel().filter((s) => this.holder(s.id)));
  protected readonly amountText = computed(() => moneyInput(this.f().amount) ?? '0.00');
  protected readonly total = computed(() => {
    const paise = paiseOf(this.amountText()) * this.sel().length;
    return inr((paise / 100).toFixed(2));
  });
  protected readonly limitsLabel = computed(() => {
    const v = this.f();
    if (!v.lim) return 'No daily limit';
    const amt = moneyInput(v.lamt);
    return `${v.count} payment${v.count === '1' ? '' : 's'} · ${amt ? inr(amt) : '—'} a day`;
  });

  constructor() {
    const d = this.defaults;
    queueMicrotask(() => {
      const def = d();
      if (def) {
        this.f.update((v) => ({
          ...v,
          count: String(def.dailyCount),
          lamt: def.dailyAmount.amount.replace(/\.00$/, ''),
        }));
      }
    });
    void this.loadStudents();
    inject(DestroyRef).onDestroy(() => clearTimeout(this.qTimer));
  }

  // --- step 1: students --------------------------------------------------------------------------
  private async loadStudents() {
    const n = ++this.seq;
    this.loading.set(true);
    try {
      const r = await this.members.list({
        kind: 'STUDENTS',
        status: 'ACTIVE',
        classId: this.cls() || undefined,
        sectionId: this.sec() || undefined,
        q: this.q().trim() || undefined,
        limit: 200,
      });
      if (n !== this.seq) return;
      this.students.set(r.items);
      this.more.set(r.items.length > SHOWN || r.nextCursor !== null);
    } catch (e) {
      if (n === this.seq) {
        this.pickError.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
      }
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
  }
  protected setClass(v: string) {
    this.cls.set(v);
    this.sec.set('');
    void this.loadStudents();
  }
  protected setSection(v: string) {
    this.sec.set(v);
    void this.loadStudents();
  }
  protected setQ(e: Event) {
    this.q.set((e.target as HTMLInputElement).value);
    clearTimeout(this.qTimer);
    this.qTimer = setTimeout(() => void this.loadStudents(), 250);
  }
  protected isOn(id: string) {
    return this.sel().some((s) => s.id === id);
  }
  protected toggle(s: MemberRow) {
    this.pickError.set('');
    this.sel.update((list) => (this.isOn(s.id) ? list.filter((x) => x.id !== s.id) : [...list, s]));
  }
  protected toggleAll() {
    this.pickError.set('');
    const shown = this.shown();
    if (this.allOn()) {
      const ids = new Set(shown.map((s) => s.id));
      this.sel.update((list) => list.filter((s) => !ids.has(s.id)));
    } else {
      this.sel.update((list) => [
        ...list,
        ...shown.filter((s) => !list.some((x) => x.id === s.id)),
      ]);
    }
  }
  protected holder(id: string) {
    return this.grants().some((g) => g.student.id === id && holds(g));
  }
  protected dropHolders() {
    const n = this.holders().length;
    const ids = new Set(this.holders().map((s) => s.id));
    this.sel.update((list) => list.filter((s) => !ids.has(s.id)));
    this.pickError.set('');
    this.overlays.toast(`${plural(n, 'student')} removed`, { tone: 'info' });
  }

  // --- step 2: amount and dates ------------------------------------------------------------------
  protected set(k: Field, e: Event) {
    // The amounts take numbers only (client 2026-10-14).
    const el = e.target as HTMLInputElement;
    const v = k === 'amount' || k === 'lamt' ? cleanTyped(el, amountTyping) : el.value;
    this.f.update((x) => {
      const next = { ...x, [k]: v };
      // A new start date proposes the end of its financial year as the expiry (prototype).
      if (k === 'start' && /^\d{4}-\d{2}-\d{2}$/.test(v)) next.expiry = financialYearEnd(v);
      return next;
    });
    if (this.errors()[k]) this.errors.update((x) => ({ ...x, [k]: undefined }));
  }
  protected toggleLimits() {
    this.f.update((x) => ({ ...x, lim: !x.lim }));
    this.errors.update((x) => ({ ...x, count: undefined, lamt: undefined }));
  }
  protected err(k: Field) {
    return this.errors()[k] ?? '';
  }
  private validate(): boolean {
    const v = this.f();
    const e: Partial<Record<Field, string>> = {};
    if (!v.name.trim()) e.name = 'Enter a name for the allowance';
    else if (!/^[A-Za-z0-9 ]+$/.test(v.name.trim()))
      e.name = 'Use letters, numbers and spaces only';
    const amount = moneyInput(v.amount);
    if (!v.amount.trim()) e.amount = 'Enter the amount';
    else if (!amount || paiseOf(amount) <= 0) e.amount = translate('VALIDATION.AMOUNT');
    else if (paiseOf(amount) > 9_999_999_999) e.amount = 'The maximum allowance is ₹9,99,99,999.99';
    const today = istBusinessDate(new Date());
    if (!v.start) e.start = 'Choose the start date';
    else if (v.start <= today) e.start = translate('ALW.START_NOT_FUTURE');
    else if (!v.start.endsWith('-01')) e.start = translate('ALW.START_NOT_FIRST');
    if (!v.expiry) e.expiry = 'Choose the expiry date';
    else if (v.start && v.expiry <= v.start) e.expiry = translate('ALW.EXPIRY_BEFORE_START');
    if (v.lim) {
      const n = Number(v.count);
      if (!v.count.trim()) e.count = 'Enter the payments allowed per day';
      else if (!/^\d+$/.test(v.count) || n < 1 || n > 20) e.count = 'Enter 1 to 20 payments a day';
      const lamt = moneyInput(v.lamt);
      if (!v.lamt.trim()) e.lamt = 'Enter the amount allowed per day';
      else if (!lamt || paiseOf(lamt) <= 0) e.lamt = translate('VALIDATION.AMOUNT');
      else if (amount && paiseOf(lamt) > paiseOf(amount)) {
        e.lamt = "The daily amount can't be more than the allowance";
      }
    }
    this.errors.set(e);
    return Object.values(e).every((x) => !x);
  }

  // --- navigation and submit ---------------------------------------------------------------------
  protected back() {
    if (!this.step()) {
      this.closed.emit();
      return;
    }
    this.submitError.set('');
    this.step.update((s) => s - 1);
  }
  protected async next() {
    if (this.step() === 0) {
      if (!this.sel().length) {
        this.pickError.set('Select at least one student.');
        return;
      }
      const hs = this.holders();
      if (hs.length) {
        const names = hs.slice(0, 8).map((s) => escapeHtml(s.name));
        this.pickError.set(
          `<b>${plural(hs.length, 'selected student')} already ${hs.length === 1 ? 'holds' : 'hold'} an allowance.</b> A student can hold only one allowance (BR-40): ${names.join(', ')}${hs.length > 8 ? ` and ${hs.length - 8} more` : ''}.`,
        );
        return;
      }
      this.step.set(1);
      return;
    }
    if (this.step() === 1) {
      if (this.validate()) this.step.set(2);
      return;
    }
    await this.submit();
  }

  private async submit() {
    const v = this.f();
    const n = this.sel().length;
    const ok = await this.overlays.confirm({
      title: `Schedule ${plural(n, 'allowance')}?`,
      text: `${inr(this.amountText())} each, credited on ${formatDate(v.start)}. Total ${this.total()}.`,
      ok: 'Schedule allowances',
      icon: 'gift',
    });
    if (!ok) return;
    this.busy.set(true);
    this.submitError.set('');
    try {
      const r = await this.api.issue(
        {
          studentIds: this.sel().map((s) => s.id),
          name: v.name.trim(),
          amount: { amount: this.amountText(), currency: 'INR' },
          startDate: v.start,
          expiryDate: v.expiry,
          dailyLimits: v.lim
            ? {
                count: Number(v.count),
                amount: { amount: moneyInput(v.lamt) ?? '0.00', currency: 'INR' },
              }
            : null,
        },
        this.key,
      );
      const skipped = r.duplicates.length + r.refused.length;
      if (skipped) {
        this.overlays.toast(`${plural(skipped, 'student')} not issued`, {
          tone: 'warn',
          sub: [
            r.duplicates.length
              ? `${plural(r.duplicates.length, 'student')} already ${r.duplicates.length === 1 ? 'holds' : 'hold'} an allowance`
              : '',
            r.refused.length ? `${plural(r.refused.length, 'student')} can't receive one` : '',
          ]
            .filter(Boolean)
            .join(' · '),
        });
      }
      this.issued.emit({ created: r.created.length, startDate: v.start });
    } catch (e) {
      if (e instanceof ApiProblem && e.errors.length) {
        // Field errors from the server: back to the form, next to the fields.
        const map: Record<string, Field> = {
          startDate: 'start',
          expiryDate: 'expiry',
          amount: 'amount',
        };
        const fe: Partial<Record<Field, string>> = {};
        for (const x of e.errors) {
          const k = map[x.field];
          if (k) fe[k] = x.message ?? translate(x.code);
        }
        this.errors.set(fe);
        this.step.set(1);
      } else {
        this.submitError.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
      }
    } finally {
      this.busy.set(false);
    }
  }

  // --- formatting ----------------------------------------------------------------------------------
  protected gradeOf(s: MemberRow) {
    return s.grade
      ? `${s.grade.class}${s.grade.section ? ' ' + s.grade.section : ''}`
      : 'Not enrolled';
  }
  protected inr(amount: string) {
    return inr(amount);
  }
  protected date(v: string) {
    return v ? formatDate(v) : '—';
  }
  protected num(n: number) {
    return n.toLocaleString('en-IN');
  }
  protected plural(n: number, noun: string) {
    return plural(n, noun);
  }
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// The overlap check stays the server's (the period isn't known at step 1); kept for the drawer.
void overlaps;
