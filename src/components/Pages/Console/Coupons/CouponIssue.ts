import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { amountPaise, inrText } from '../../../Shared/Amount';
import { Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { formatDate, istBusinessDate } from '../../../Utils/format';
import { newIdempotencyKey } from '../../../Utils/ids';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { plural } from '../Allowances/allowance-format';
import type { ClassView, MemberRow } from '../Members/members.api';
import {
  addDays,
  byMonth,
  dayOfMonth,
  daysOf,
  dowMon,
  isIsoDate,
  isSunday,
  monthEnd,
  monthTitle,
  windowLabel,
} from './coupon-format';
import { CouponsApi, type CouponIssueResult, type CouponType } from './coupons.api';
import { StudentPicker, gradeOf } from './StudentPicker';

type DateField = 'from' | 'to';
const CAL_MAX = 93;

/**
 * The "Issue coupons" tab (prototype cpnIssue; SRS 11.2, FR-CPN-01, BR-43, CR-15; CPN-008):
 * students, coupon types and dates with excluded days, and a live preview. The server issues one
 * coupon per student, type and day, skips the ones that exist, refuses a student over a type's
 * holding maximum, and refuses the whole request when anyone would get more than the institution's
 * cap of new coupons.
 */
@Component({
  selector: 'rp-coupon-issue',
  imports: [Empty, Icon, StudentPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <div class="cm-issue">
      <div class="stack g16">
        <div class="fs">
          <h4><rp-icon name="users" [size]="16" /> 1 · Students</h4>
          <div class="fs-b">
            <rp-student-picker
              key="ci"
              [classes]="classes()"
              [selected]="sel()"
              (selectedChange)="sel.set($event)"
            />
          </div>
        </div>
        <div class="fs">
          <h4><rp-icon name="ticket" [size]="16" /> 2 · Coupon types</h4>
          <div class="fs-b">
            @if (!types().length) {
              <div class="t-sm t-muted">Loading the coupon types…</div>
            }
            <div class="cm-types" role="group" aria-label="Coupon types">
              @for (t of types(); track t.id) {
                <label class="cm-type" [class.on]="typeOn(t.id)" [class.off]="t.status !== 'ACTIVE'"
                  ><input
                    type="checkbox"
                    [value]="t.id"
                    [checked]="typeOn(t.id)"
                    [disabled]="t.status !== 'ACTIVE'"
                    (change)="toggleType(t.id)"
                  /><span class="grow"
                    ><b>{{ t.name }}</b
                    ><small>{{ win(t) }} · hold up to {{ t.holdMax }}</small>
                    @if (t.issueFrom || t.issueTo) {
                      <small>Issuable {{ issuable(t) }}</small>
                    }
                    @if (t.status !== 'ACTIVE') {
                      <small class="t-bad">Deactivated — can't be issued</small>
                    }
                  </span>
                  @if (valued(t)) {
                    <span class="chip tone-accent">{{ inr(t.value) }}</span>
                  }
                </label>
              }
            </div>
          </div>
        </div>
        <div class="fs">
          <h4><rp-icon name="calendar" [size]="16" /> 3 · Dates</h4>
          <div class="fs-b stack g12">
            <div class="c-form">
              <div class="fld" [class.invalid]="err('from')">
                <label class="fld-l" for="ci-from">From<span class="req">*</span></label>
                <div class="fld-in">
                  <input
                    id="ci-from"
                    type="date"
                    aria-describedby="ci-from-e"
                    [value]="from()"
                    (input)="setDate('from', $event)"
                  />
                </div>
                <div class="fld-e" id="ci-from-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('from') }}</span>
                </div>
                <div class="fld-h">Must be a future date.</div>
              </div>
              <div class="fld" [class.invalid]="err('to')">
                <label class="fld-l" for="ci-to">To<span class="req">*</span></label>
                <div class="fld-in">
                  <input
                    id="ci-to"
                    type="date"
                    aria-describedby="ci-to-e"
                    [value]="to()"
                    (input)="setDate('to', $event)"
                  />
                </div>
                <div class="fld-e" id="ci-to-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('to') }}</span>
                </div>
              </div>
            </div>
            <div class="row g8 wrap">
              <span class="t-sm t-muted grow"
                >Excluded dates: <b class="t-num">{{ excl().length }}</b> — click a day to exclude
                or include it.</span
              >
              <button type="button" class="btn btn-sec btn-xs" (click)="excludeSundays()">
                <span>Exclude Sundays</span>
              </button>
              <span
                class="cp-why"
                title="The academic calendar's holidays aren't available yet — click the days instead."
                ><button type="button" class="btn btn-sec btn-xs" disabled>
                  <span>Exclude holidays</span>
                </button></span
              >
              @if (excl().length) {
                <button type="button" class="btn btn-ghost btn-xs" (click)="excl.set([])">
                  <span>Clear</span>
                </button>
              }
            </div>
            <div class="cm-cals">
              @for (m of months(); track m.key) {
                <div class="cm-cal">
                  <div class="cm-cal-h">{{ title(m.days[0]!) }}</div>
                  <div class="cm-cal-g">
                    @for (d of dows; track $index) {
                      <span class="dow">{{ d }}</span>
                    }
                    @for (x of lead(m.days[0]!); track $index) {
                      <span></span>
                    }
                    @for (d of m.days; track d) {
                      <button
                        type="button"
                        class="cm-day"
                        [class.ex]="isEx(d)"
                        [class.sun]="sunday(d)"
                        [attr.aria-pressed]="isEx(d)"
                        [attr.aria-label]="date(d) + (isEx(d) ? ', excluded' : '')"
                        [title]="isEx(d) ? 'Excluded — click to include' : 'Click to exclude'"
                        (click)="toggleDay(d)"
                      >
                        {{ dom(d) }}
                      </button>
                    }
                  </div>
                </div>
              } @empty {
                <div class="t-sm t-muted">Choose a valid date range to pick excluded dates.</div>
              }
            </div>
            @if (long()) {
              <div class="t-xs t-muted">
                The calendars show the first {{ calMax }} days of the range.
              </div>
            }
          </div>
        </div>
      </div>

      <aside class="cm-side">
        <div class="card pad stack g12">
          <div class="row between">
            <b class="t-h4">Live preview</b
            ><span class="chip tone-neutral" [title]="capTitle">{{ capChip() }}</span>
          </div>
          <div class="grid c2">
            <div class="cm-tile">
              <span>Students</span><b class="t-num">{{ num(sel().length) }}</b>
            </div>
            <div class="cm-tile">
              <span>Days</span><b class="t-num">{{ num(days().length) }}</b>
            </div>
            <div
              class="cm-tile"
              [class.tone-bad]="held().length || capped().length"
              [class.tone-brand]="!held().length && !capped().length"
            >
              <span>New coupons</span
              ><b class="t-num" title="At most: coupons that already exist are skipped">{{
                num(total())
              }}</b>
            </div>
            <div class="cm-tile">
              <span>Types</span><b class="t-num">{{ num(chosen().length) }}</b>
            </div>
          </div>
          @if (capped().length) {
            <div class="note tone-bad" role="alert">
              <rp-icon name="alertc" [size]="17" />
              <div class="grow">
                <b>Over the limit of {{ cap() }} new coupons per student.</b> The whole request was
                refused: {{ cappedNames() }}. Shorten the range or remove a type.
              </div>
            </div>
          }
          @if (held().length) {
            <div class="note tone-bad">
              <rp-icon name="alertc" [size]="17" />
              <div class="grow">
                <b>Holding maximum exceeded.</b> {{ heldText() }} Students over it are refused.
              </div>
            </div>
          }
          @if (!sel().length || !chosen().length) {
            <rp-empty
              icon="ticket"
              title="Nothing to preview yet"
              text="Choose students and at least one coupon type."
            />
          } @else {
            <div class="cm-prev">
              @for (s of sel().slice(0, 40); track s.id) {
                <div class="cm-prev-r" [class.bad]="isCapped(s.id)">
                  <span class="grow t-clip"
                    >{{ s.name }} <small class="t-faint">{{ grade(s) }}</small></span
                  ><b class="t-num">{{ perStudent() }}</b>
                </div>
              }
              @if (sel().length > 40) {
                <div class="t-xs t-muted">and {{ sel().length - 40 }} more students</div>
              }
            </div>
          }
          @if (error()) {
            <div class="note tone-bad" role="alert">
              <rp-icon name="alertc" [size]="17" />
              <div class="grow">{{ error() }}</div>
            </div>
          }
          <p class="t-xs t-muted">
            Existing coupons for the same student, type and date are skipped, never duplicated.
            Holding maxima are per student, per type (OI-CPN-11).
          </p>
          @if (why()) {
            <button type="button" class="btn btn-pri btn-block" disabled [title]="why()">
              <rp-icon name="check" [size]="17" /><span>{{ cta() }}</span>
            </button>
            <span class="cm-why"><rp-icon name="lock" [size]="12" />{{ why() }}</span>
          } @else {
            <button
              type="button"
              class="btn btn-pri btn-block"
              id="ci-go"
              [class.is-busy]="busy()"
              [disabled]="busy()"
              (click)="submit()"
            >
              <rp-icon name="check" [size]="17" /><span>{{ cta() }}</span>
            </button>
          }
        </div>
      </aside>
    </div>
  `,
})
export class CouponIssue {
  private readonly api = inject(CouponsApi);
  private readonly overlays = inject(Overlays);

  readonly classes = input<readonly ClassView[]>([]);
  readonly types = input<readonly CouponType[]>([]);
  /** Why issuing isn't allowed (read-only, no sub-task, feature off); '' when it is. */
  readonly why = input('');
  readonly issued = output<{ result: CouponIssueResult; types: string[] }>();

  protected readonly dows = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  protected readonly calMax = CAL_MAX;
  protected readonly capTitle =
    "More new coupons than the institution's cap for any one student refuses the whole request.";
  protected readonly sel = signal<readonly MemberRow[]>([]);
  protected readonly typeIds = signal<readonly string[]>([]);
  protected readonly from = signal(addDays(istBusinessDate(new Date()), 1));
  protected readonly to = signal(monthEnd(addDays(istBusinessDate(new Date()), 1)));
  protected readonly excl = signal<readonly string[]>([]);
  protected readonly errors = signal<Partial<Record<DateField, string>>>({});
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  /** The cap (from the server's refusal) and the students over it. */
  protected readonly cap = signal<number | null>(null);
  protected readonly capped = signal<readonly string[]>([]);
  private key = newIdempotencyKey();

  protected readonly chosen = computed(() =>
    this.types().filter((t) => this.typeIds().includes(t.id)),
  );
  protected readonly allDays = computed(() => daysOf(this.from(), this.to(), 400));
  protected readonly days = computed(() => this.allDays().filter((d) => !this.excl().includes(d)));
  protected readonly months = computed(() => byMonth(this.allDays().slice(0, CAL_MAX)));
  protected readonly long = computed(() => this.allDays().length > CAL_MAX);
  protected readonly perStudent = computed(() => this.days().length * this.chosen().length);
  protected readonly total = computed(() => this.perStudent() * this.sel().length);
  /** Types whose holding maximum the range exceeds even for a student holding none. */
  protected readonly held = computed(() =>
    this.chosen().filter((t) => this.days().length > t.holdMax),
  );
  protected readonly heldText = computed(() =>
    this.held()
      .slice(0, 4)
      .map((t) => `${t.name}: ${this.days().length} days, but a student may hold ${t.holdMax}.`)
      .join(' '),
  );
  protected readonly cappedNames = computed(() => {
    const names = this.sel()
      .filter((s) => this.capped().includes(s.id))
      .map((s) => s.name);
    return names.slice(0, 6).join(', ') + (names.length > 6 ? ` and ${names.length - 6} more` : '');
  });
  protected readonly capChip = computed(() =>
    this.cap() ? `Cap ${this.cap()} per student` : 'Capped per student',
  );
  protected readonly cta = computed(() =>
    this.total()
      ? `Issue ${this.num(this.total())} coupon${this.total() === 1 ? '' : 's'}`
      : 'Issue coupons',
  );

  // --- form --------------------------------------------------------------------------------------
  protected typeOn(id: string) {
    return this.typeIds().includes(id);
  }
  protected toggleType(id: string) {
    this.typeIds.update((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
    this.changed();
  }
  protected setDate(k: DateField, e: Event) {
    const v = (e.target as HTMLInputElement).value;
    if (k === 'from') this.from.set(v);
    else this.to.set(v);
    // Excluded days outside the new range are dropped (cm.ci.date).
    this.excl.update((l) => l.filter((d) => d >= this.from() && d <= this.to()));
    this.errors.update((x) => ({ ...x, [k]: undefined }));
    this.changed();
  }
  protected toggleDay(d: string) {
    this.excl.update((l) => (l.includes(d) ? l.filter((x) => x !== d) : [...l, d]));
    this.changed();
  }
  protected excludeSundays() {
    const add = this.allDays().filter((d) => isSunday(d) && !this.excl().includes(d));
    this.excl.update((l) => [...l, ...add]);
    this.changed();
  }
  private changed() {
    this.error.set('');
    this.capped.set([]);
    this.key = newIdempotencyKey();
  }

  private validate(): string[] {
    const today = istBusinessDate(new Date());
    const e: Partial<Record<DateField, string>> = {};
    const msgs: string[] = [];
    if (!this.sel().length) msgs.push('Choose at least one student.');
    if (!this.chosen().length) msgs.push('Choose at least one coupon type.');
    const from = this.from();
    const to = this.to();
    if (!isIsoDate(from)) e.from = 'Choose the start date';
    else if (from <= today) e.from = translate('CPN.DATES_NOT_FUTURE');
    if (!isIsoDate(to)) e.to = 'Choose the end date';
    else if (to <= today) e.to = translate('CPN.DATES_NOT_FUTURE');
    else if (isIsoDate(from) && to < from) e.to = translate('FEE.EVENT_DATES_INVALID');
    if (!e.from && !e.to && !this.days().length) e.to = translate('CPN.NO_DAYS');
    this.errors.set(e);
    if (e.from) msgs.push(e.from);
    if (e.to) msgs.push(e.to);
    return msgs;
  }

  protected async submit() {
    if (this.why() || this.busy()) return;
    this.error.set('');
    const errs = this.validate();
    if (errs.length) {
      this.overlays.toast(errs[0]!, {
        tone: 'bad',
        ...(errs.length > 1
          ? { sub: `${errs.length - 1} more issue${errs.length > 2 ? 's' : ''} to fix` }
          : {}),
      });
      return;
    }
    const types = this.chosen().map((t) => t.name);
    const ex = this.excl().length;
    const ok = await this.overlays.confirm({
      title: `Issue up to ${this.num(this.total())} coupons?`,
      text: `${plural(this.sel().length, 'student')} · ${types.join(', ')} · ${formatDate(this.from())} to ${formatDate(this.to())}${ex ? ` · ${plural(ex, 'date')} excluded` : ''}. Existing coupons are skipped.`,
      ok: 'Issue coupons',
      icon: 'ticket',
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      const result = await this.api.issue(
        {
          typeIds: this.chosen().map((t) => t.id),
          from: this.from(),
          to: this.to(),
          excludedDates: [...this.excl()].sort(),
          studentIds: this.sel().map((s) => s.id),
        },
        this.key,
      );
      this.issued.emit({ result, types });
      this.sel.set([]);
      this.typeIds.set([]);
      this.excl.set([]);
      this.key = newIdempotencyKey();
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy.set(false);
    }
  }

  private fail(e: unknown) {
    if (!(e instanceof ApiProblem)) {
      this.error.set(translate('GEN.UNAVAILABLE'));
      return;
    }
    if (e.code === 'CPN.ISSUE_LIMIT') {
      const max = Number(e.params['max']);
      if (max) this.cap.set(max);
      this.capped.set(
        e.errors
          .filter((x) => x.field.startsWith('studentIds.'))
          .map((x) => x.field.slice('studentIds.'.length)),
      );
      if (!this.capped().length) this.error.set(e.detail);
      return;
    }
    const fe: Partial<Record<DateField, string>> = {};
    for (const x of e.errors) {
      if (x.field === 'from' || x.field === 'to') fe[x.field] = x.message;
    }
    if (Object.keys(fe).length) this.errors.set(fe);
    else this.error.set(e.errors[0]?.message ?? e.detail);
  }

  // --- formatting ----------------------------------------------------------------------------------
  protected err(k: DateField) {
    return this.errors()[k] ?? '';
  }
  protected isEx(d: string) {
    return this.excl().includes(d);
  }
  protected isCapped(id: string) {
    return this.capped().includes(id);
  }
  protected lead(d: string) {
    return Array.from({ length: dowMon(d) });
  }
  protected sunday(d: string) {
    return isSunday(d);
  }
  protected dom(d: string) {
    return dayOfMonth(d);
  }
  protected title(d: string) {
    return monthTitle(d);
  }
  protected win(t: CouponType) {
    return windowLabel(t);
  }
  protected issuable(t: CouponType) {
    return `${t.issueFrom ? formatDate(t.issueFrom) : 'any day'} – ${t.issueTo ? formatDate(t.issueTo) : 'any day'}`;
  }
  protected valued(t: CouponType) {
    return amountPaise(t.value) > 0;
  }
  protected inr(m: { amount: string }) {
    return inrText(m);
  }
  protected grade(s: MemberRow) {
    return gradeOf(s);
  }
  protected date(d: string) {
    return formatDate(d);
  }
  protected num(n: number) {
    return n.toLocaleString('en-IN');
  }
}
