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
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { dayInYear, problemText } from '../Structure/academic-format';
import type { AcademicYear } from '../Structure/academic-year';
import type { ClassView } from '../Structure/structure.api';
import { Swatches } from '../Structure/Swatches';
import {
  CalendarApi,
  type AudienceKind,
  type CalendarEntry,
  type EntryInput,
  type Recurrence,
  type ReminderCode,
} from './calendar.api';
import {
  REMINDER_LABELS,
  RECURRENCE,
  audienceText,
  deletedOn,
  entryDates,
  entryTimes,
  recurrenceLabel,
} from './calendar-format';
import { MemberSelect, type MemberOption } from './MemberSelect';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const AUDIENCE: readonly { v: AudienceKind; l: string }[] = [
  { v: 'ALL', l: 'Whole institution' },
  { v: 'CLASS', l: 'Classes' },
  { v: 'SECTION', l: 'Sections' },
  { v: 'MEMBER', l: 'Individual' },
];
const REMINDERS: readonly ReminderCode[] = ['DAY_BEFORE', 'HOUR_BEFORE', 'MORNING_OF'];

/**
 * A calendar entry (prototype openCal / calForm / cc.cal.save / cc.cal.del; ACA-005…007): type,
 * title (3–80), description, all day or timed, dates inside the year, holiday type, location, who it
 * is for (the whole institution, classes, sections or one member), repeats until a date in the
 * year, colour and reminders. Read-only when the year is closed, the role can't change it or the
 * entry is deleted (restored from the list).
 */
@Component({
  selector: 'rp-calendar-entry',
  imports: [Dropdown, Icon, MemberSelect, Modal, Swatches],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="entry()?.title ?? 'New calendar entry'"
      [sub]="sub()"
      icon="calendar"
      [drawer]="true"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      @if (viewOnly(); as why) {
        <div class="stack g16" id="cal-view">
          @if (why === 'deleted') {
            <div class="note tone-warn">
              <rp-icon name="alert" [size]="17" />
              <div class="grow">
                Deleted {{ deletedOn(entry()!) }}. Restore it from the list to edit it again.
              </div>
            </div>
          } @else {
            <div class="note tone-info">
              <rp-icon name="lock" [size]="17" />
              <div class="grow">{{ why }}</div>
            </div>
          }
          @if (entry(); as e) {
            <dl class="kv">
              <dt>Type</dt>
              <dd>{{ e.type }}{{ e.holidayType ? ' · ' + e.holidayType : '' }}</dd>
              <dt>Dates</dt>
              <dd>{{ dates(e) }}</dd>
              <dt>Time</dt>
              <dd>{{ times(e) }}</dd>
              <dt>Audience</dt>
              <dd>{{ audienceText(e) }}</dd>
              <dt>Location</dt>
              <dd>{{ e.location || '—' }}</dd>
              <dt>Repeats</dt>
              <dd>
                {{ recurrenceLabel(e.recurrence)
                }}{{ e.repeatUntil ? ' until ' + date(e.repeatUntil) : '' }}
              </dd>
              <dt>Reminders</dt>
              <dd>{{ reminderText(e) }}</dd>
              <dt>Description</dt>
              <dd>{{ e.description || '—' }}</dd>
            </dl>
          }
        </div>
      } @else {
        <div class="stack g16" id="cal-form">
          @if (err('form')) {
            <div class="note tone-bad" role="alert">
              <rp-icon name="alertc" [size]="17" />
              <div class="grow">{{ err('form') }}</div>
            </div>
          }
          <div class="c-form">
            <div class="fld" [class.invalid]="err('type')">
              <label class="fld-l" for="cal-type-b">Type<span class="req">*</span></label>
              <rp-dd
                inputId="cal-type"
                placeholder="Choose a type"
                [options]="typeOptions()"
                [value]="type()"
                (changed)="type.set($event); clear('type')"
              />
              <div class="fld-e" id="cal-type-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('type') }}</span>
              </div>
            </div>
            <div class="fld" [class.invalid]="err('title')">
              <label class="fld-l" for="cal-title"
                >Title<span class="req">*</span
                ><span class="count">{{ title().length }}/80</span></label
              >
              <div class="fld-in">
                <input
                  id="cal-title"
                  maxlength="80"
                  autocomplete="off"
                  aria-describedby="cal-title-e"
                  [value]="title()"
                  (input)="title.set(val($event)); clear('title')"
                />
              </div>
              <div class="fld-e" id="cal-title-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('title') }}</span>
              </div>
            </div>
            <div class="full">
              <div class="fld">
                <label class="fld-l" for="cal-desc"
                  >Description<span class="opt">(optional)</span></label
                >
                <div class="fld-in">
                  <textarea
                    id="cal-desc"
                    rows="2"
                    maxlength="500"
                    [value]="desc()"
                    (input)="desc.set(val($event))"
                  ></textarea>
                </div>
              </div>
            </div>
            <div class="full">
              <label class="chk"
                ><input
                  type="checkbox"
                  id="cal-all"
                  [checked]="allDay()"
                  (change)="allDay.set(checked($event)); clear('st'); clear('et')"
                /><span>All day</span></label
              >
            </div>
            <div class="fld" [class.invalid]="err('sd')">
              <label class="fld-l" for="cal-sd">Start date<span class="req">*</span></label>
              <div class="fld-in">
                <input
                  id="cal-sd"
                  type="date"
                  aria-describedby="cal-sd-e"
                  [attr.min]="year().startsOn"
                  [attr.max]="year().endsOn"
                  [value]="sd()"
                  (change)="setStart(val($event))"
                />
              </div>
              <div class="fld-e" id="cal-sd-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('sd') }}</span>
              </div>
            </div>
            <div class="fld" [class.invalid]="err('ed')">
              <label class="fld-l" for="cal-ed">End date<span class="req">*</span></label>
              <div class="fld-in">
                <input
                  id="cal-ed"
                  type="date"
                  aria-describedby="cal-ed-e"
                  [attr.min]="year().startsOn"
                  [attr.max]="year().endsOn"
                  [value]="ed()"
                  (change)="ed.set(val($event)); clear('ed')"
                />
              </div>
              <div class="fld-e" id="cal-ed-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('ed') }}</span>
              </div>
            </div>
            @if (!allDay()) {
              <div class="fld" [class.invalid]="err('st')">
                <label class="fld-l" for="cal-st">Start time<span class="req">*</span></label>
                <div class="fld-in">
                  <input
                    id="cal-st"
                    type="time"
                    aria-describedby="cal-st-e"
                    [value]="st()"
                    (change)="st.set(val($event)); clear('st')"
                  />
                </div>
                <div class="fld-e" id="cal-st-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('st') }}</span>
                </div>
              </div>
              <div class="fld" [class.invalid]="err('et')">
                <label class="fld-l" for="cal-et">End time<span class="req">*</span></label>
                <div class="fld-in">
                  <input
                    id="cal-et"
                    type="time"
                    aria-describedby="cal-et-e"
                    [value]="et()"
                    (change)="et.set(val($event)); clear('et')"
                  />
                </div>
                <div class="fld-e" id="cal-et-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('et') }}</span>
                </div>
              </div>
            }
            @if (type() === 'Holiday') {
              <div class="fld">
                <label class="fld-l" for="cal-ht-b">Holiday type</label>
                <rp-dd
                  inputId="cal-ht"
                  placeholder="Holiday type"
                  [options]="holidayOptions()"
                  [value]="holType()"
                  (changed)="holType.set($event)"
                />
              </div>
            }
            <div class="fld">
              <label class="fld-l" for="cal-loc">Location<span class="opt">(optional)</span></label>
              <div class="fld-in">
                <input
                  id="cal-loc"
                  maxlength="100"
                  autocomplete="off"
                  placeholder="e.g. Auditorium"
                  [value]="loc()"
                  (input)="loc.set(val($event))"
                />
              </div>
            </div>
          </div>
          <div class="fs" [class.invalid]="err('aud')">
            <h4><rp-icon name="users" [size]="16" />Who it's for</h4>
            <div class="fs-b">
              <div class="stack g12">
                <div class="cc-radios" role="radiogroup" aria-label="Who it's for">
                  @for (a of audienceKinds; track a.v) {
                    <label class="chk"
                      ><input
                        type="radio"
                        name="cal-tg"
                        [value]="a.v"
                        [checked]="kind() === a.v"
                        (change)="kind.set(a.v); clear('aud')"
                      /><span>{{ a.l }}</span></label
                    >
                  }
                </div>
                @if (kind() === 'CLASS') {
                  <div class="cc-checks" id="cal-classes">
                    @for (c of classes(); track c.id) {
                      <label class="chk"
                        ><input
                          type="checkbox"
                          [checked]="picked().has(c.id)"
                          (change)="togglePick(c.id)"
                        /><span>{{ c.name }}</span></label
                      >
                    }
                  </div>
                }
                @if (kind() === 'SECTION') {
                  <div class="cc-checks" id="cal-sections">
                    @for (s of sections(); track s.id) {
                      <label class="chk"
                        ><input
                          type="checkbox"
                          [checked]="picked().has(s.id)"
                          (change)="togglePick(s.id)"
                        /><span>{{ s.label }}</span></label
                      >
                    }
                  </div>
                }
                @if (kind() === 'MEMBER') {
                  <div class="fld">
                    <label class="fld-l" for="cal-ind-b">Member</label>
                    <rp-member-select
                      inputId="cal-ind"
                      [value]="member()"
                      (valueChange)="member.set($event); clear('aud')"
                    />
                  </div>
                }
                @if (err('aud')) {
                  <div class="fld invalid">
                    <div class="fld-e" role="alert">
                      <rp-icon name="alertc" [size]="14" /><span>{{ err('aud') }}</span>
                    </div>
                  </div>
                }
              </div>
            </div>
          </div>
          <div class="c-form">
            <div class="fld">
              <label class="fld-l" for="cal-rec-b">Repeats</label>
              <rp-dd
                inputId="cal-rec"
                placeholder="Repeats"
                [options]="recurrenceOptions"
                [value]="recur()"
                (changed)="recur.set($any($event)); clear('until')"
              />
            </div>
            @if (recur() !== 'NONE') {
              <div class="fld" [class.invalid]="err('until')">
                <label class="fld-l" for="cal-until">Repeat until<span class="req">*</span></label>
                <div class="fld-in">
                  <input
                    id="cal-until"
                    type="date"
                    aria-describedby="cal-until-e"
                    [attr.min]="sd() || year().startsOn"
                    [attr.max]="year().endsOn"
                    [value]="until()"
                    (change)="until.set(val($event)); clear('until')"
                  />
                </div>
                <div class="fld-e" id="cal-until-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('until') }}</span>
                </div>
              </div>
            }
            <div class="full">
              <span class="fld-l">Colour</span>
              <rp-swatches name="cal-col" [value]="colour()" (changed)="colour.set($event)" />
            </div>
            <div class="full">
              <span class="fld-l">Reminders <span class="opt">(optional)</span></span>
              <div class="cc-checks">
                @for (r of reminderCodes; track r) {
                  <label class="chk"
                    ><input
                      type="checkbox"
                      [checked]="reminders().has(r)"
                      (change)="toggleReminder(r)"
                    /><span>{{ reminderLabel(r) }}</span></label
                  >
                }
              </div>
            </div>
          </div>
          <p class="t-xs t-muted">
            Entries belong to the {{ year().label }} calendar and must fall within
            {{ date(year().startsOn) }} – {{ date(year().endsOn) }}.
          </p>
        </div>
      }
      <div modal-foot class="cc-foot">
        @if (viewOnly()) {
          <button type="button" class="btn btn-sec" (click)="closed.emit()">
            <span>Close</span>
          </button>
        } @else {
          @if (entry()) {
            <button
              type="button"
              class="btn btn-danger-o"
              id="cal-del"
              [disabled]="busy()"
              (click)="remove()"
            >
              <rp-icon name="trash" [size]="17" /><span>Delete entry</span>
            </button>
          }
          <span class="grow"></span>
          <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="closed.emit()">
            <span>Cancel</span>
          </button>
          <button
            type="button"
            class="btn btn-pri"
            id="cal-save"
            [class.is-busy]="busy()"
            [disabled]="busy()"
            (click)="save()"
          >
            <rp-icon name="check" [size]="17" /><span>{{
              entry() ? 'Save changes' : 'Add entry'
            }}</span>
          </button>
        }
      </div>
    </rp-modal>
  `,
})
export class CalendarEntryDrawer implements OnInit {
  private readonly api = inject(CalendarApi);
  private readonly overlays = inject(Overlays);

  readonly entry = input<CalendarEntry | null>(null);
  /** A new entry's date (the month grid's "+" on a day). */
  readonly dateIso = input('');
  readonly year = input.required<AcademicYear>();
  readonly types = input<readonly string[]>([]);
  readonly holidayTypes = input<readonly string[]>([]);
  readonly reminderNames = input<Readonly<Partial<Record<ReminderCode, string>>>>({});
  readonly classes = input<readonly ClassView[]>([]);
  /** Why the year or the role can't change the calendar ('' when it can). */
  readonly readOnly = input('');
  readonly closed = output<void>();
  readonly saved = output<CalendarEntry>();
  readonly deleted = output<CalendarEntry>();
  readonly stale = output<void>();

  protected readonly audienceKinds = AUDIENCE;
  protected readonly reminderCodes = REMINDERS;
  protected readonly recurrenceOptions: DropdownOption[] = RECURRENCE.map((r) => ({
    v: r.v,
    l: r.l,
  }));
  protected readonly audienceText = audienceText;
  protected readonly recurrenceLabel = recurrenceLabel;
  protected readonly deletedOn = deletedOn;

  protected readonly type = signal('Event');
  protected readonly title = signal('');
  protected readonly desc = signal('');
  protected readonly allDay = signal(true);
  protected readonly sd = signal('');
  protected readonly ed = signal('');
  protected readonly st = signal('09:00');
  protected readonly et = signal('10:00');
  protected readonly holType = signal('Public holiday');
  protected readonly loc = signal('');
  protected readonly kind = signal<AudienceKind>('ALL');
  protected readonly picked = signal<ReadonlySet<string>>(new Set());
  protected readonly member = signal<MemberOption | null>(null);
  protected readonly recur = signal<Recurrence>('NONE');
  protected readonly until = signal('');
  protected readonly colour = signal('#0C6F7D');
  protected readonly reminders = signal<ReadonlySet<ReminderCode>>(new Set());
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly busy = signal(false);

  /** Why the drawer only shows the entry: the role or year, or 'deleted'. */
  protected readonly viewOnly = computed(() => {
    const e = this.entry();
    if (this.readOnly() && e) return this.readOnly();
    return e?.deleted ? 'deleted' : '';
  });
  protected readonly sub = computed(() => {
    const e = this.entry();
    return e ? `${e.type} · ${entryDates(e)}${e.deleted ? ' · deleted' : ''}` : this.year().label;
  });
  protected readonly typeOptions = computed<DropdownOption[]>(() =>
    (this.types().length
      ? this.types()
      : ['Holiday', 'Exam', 'Event', 'PTM', 'Sports', 'Meeting']
    ).map((t) => ({ v: t, l: t })),
  );
  protected readonly holidayOptions = computed<DropdownOption[]>(() =>
    (this.holidayTypes().length
      ? this.holidayTypes()
      : ['Public holiday', 'Institution holiday', 'Vacation']
    ).map((t) => ({ v: t, l: t })),
  );
  protected readonly sections = computed(() =>
    [...this.classes()]
      .sort((a, b) => a.order - b.order)
      .flatMap((c) => c.sections.map((s) => ({ id: s.id, label: `${c.name} ${s.name}` }))),
  );

  ngOnInit() {
    const e = this.entry();
    const y = this.year();
    if (!e) {
      const d = this.dateIso() || dayInYear(y);
      this.sd.set(d);
      this.ed.set(d);
      this.until.set(y.endsOn);
      return;
    }
    this.type.set(e.type);
    this.title.set(e.title);
    this.desc.set(e.description ?? '');
    this.allDay.set(e.allDay);
    this.sd.set(e.startDate);
    this.ed.set(e.endDate);
    if (e.startTime) this.st.set(e.startTime);
    if (e.endTime) this.et.set(e.endTime);
    if (e.holidayType) this.holType.set(e.holidayType);
    this.loc.set(e.location ?? '');
    this.kind.set(e.audience.kind);
    if (e.audience.kind === 'MEMBER' && e.audience.targets[0]) {
      const t = e.audience.targets[0];
      this.member.set({ id: t.id, name: t.name, sub: '' });
    } else this.picked.set(new Set(e.audience.targets.map((t) => t.id)));
    this.recur.set(e.recurrence);
    this.until.set(e.repeatUntil ?? y.endsOn);
    this.colour.set(e.colour);
    this.reminders.set(new Set(e.reminders));
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
  protected date(d: string) {
    return formatDate(d);
  }
  protected dates(e: CalendarEntry) {
    return entryDates(e);
  }
  protected times(e: CalendarEntry) {
    return entryTimes(e);
  }
  protected reminderLabel(r: ReminderCode) {
    return this.reminderNames()[r] ?? REMINDER_LABELS[r];
  }
  protected reminderText(e: CalendarEntry) {
    return e.reminders.map((r) => this.reminderLabel(r)).join(', ') || 'None';
  }

  protected setStart(v: string) {
    // The end follows the start when it would fall before it (a one-day entry stays one day).
    if (!this.ed() || this.ed() < v || this.ed() === this.sd()) this.ed.set(v);
    this.sd.set(v);
    this.clear('sd');
    this.clear('ed');
  }

  protected togglePick(id: string) {
    const s = new Set(this.picked());
    if (s.has(id)) s.delete(id);
    else s.add(id);
    this.picked.set(s);
    this.clear('aud');
  }

  protected toggleReminder(r: ReminderCode) {
    const s = new Set(this.reminders());
    if (s.has(r)) s.delete(r);
    else s.add(r);
    this.reminders.set(s);
  }

  /** The prototype's checks (cc.cal.save), with the register's wording. */
  private validate(): Record<string, string> {
    const e: Record<string, string> = {};
    const y = this.year();
    const out = () =>
      translate('ACA.DATE_OUTSIDE_YEAR', {
        label: y.label,
        from: formatDate(y.startsOn),
        to: formatDate(y.endsOn),
      });
    const inY = (d: string) => d >= y.startsOn && d <= y.endsOn;
    if (!this.type()) e['type'] = translate('ACA.CAL_TYPE');
    const title = this.title().trim();
    if (title.length < 3) e['title'] = translate('ACA.CAL_TITLE');
    if (!this.sd()) e['sd'] = translate('VALIDATION.REQUIRED');
    else if (!inY(this.sd())) e['sd'] = out();
    if (!this.ed()) e['ed'] = translate('VALIDATION.REQUIRED');
    else if (!inY(this.ed())) e['ed'] = out();
    else if (this.sd() && this.ed() < this.sd()) e['ed'] = translate('ACA.CAL_DATES');
    if (!this.allDay()) {
      if (!TIME.test(this.st())) e['st'] = translate('VALIDATION.REQUIRED');
      if (!TIME.test(this.et())) e['et'] = translate('VALIDATION.REQUIRED');
      else if (this.sd() === this.ed() && this.et() <= this.st()) {
        e['et'] = translate('ACA.CAL_TIMES');
      }
    }
    if (this.recur() !== 'NONE') {
      const u = this.until();
      if (!u) e['until'] = translate('VALIDATION.REQUIRED');
      else if (!inY(u) || (this.sd() && u < this.sd())) e['until'] = translate('ACA.CAL_REPEAT');
    }
    const k = this.kind();
    if ((k === 'CLASS' || k === 'SECTION') && !this.picked().size) {
      e['aud'] = translate('ACA.CAL_AUDIENCE');
    }
    if (k === 'MEMBER' && !this.member()) e['aud'] = translate('ACA.CAL_AUDIENCE');
    return e;
  }

  private body(): EntryInput {
    const k = this.kind();
    const ids =
      k === 'ALL'
        ? undefined
        : k === 'MEMBER'
          ? [this.member()!.id]
          : k === 'CLASS'
            ? this.classes()
                .map((c) => c.id)
                .filter((id) => this.picked().has(id))
            : this.sections()
                .map((s) => s.id)
                .filter((id) => this.picked().has(id));
    return {
      yearId: this.year().id,
      type: this.type(),
      holidayType: this.type() === 'Holiday' ? this.holType() : null,
      title: this.title().trim(),
      description: this.desc().trim() || null,
      allDay: this.allDay(),
      startDate: this.sd(),
      endDate: this.ed(),
      startTime: this.allDay() ? null : this.st(),
      endTime: this.allDay() ? null : this.et(),
      location: this.loc().trim() || null,
      audience: ids ? { kind: k, ids } : { kind: k },
      recurrence: this.recur(),
      repeatUntil: this.recur() === 'NONE' ? null : this.until(),
      colour: this.colour(),
      reminders: REMINDERS.filter((r) => this.reminders().has(r)),
    };
  }

  protected async save() {
    if (this.busy() || this.viewOnly()) return;
    if (this.readOnly()) {
      this.errors.set({ form: this.readOnly() });
      return;
    }
    const e = this.validate();
    this.errors.set(e);
    if (Object.keys(e).length) return;
    const entry = this.entry();
    const body = this.body();
    this.busy.set(true);
    try {
      const out = entry
        ? await this.api.change(entry.id, entry.version, body)
        : await this.api.create(body);
      this.overlays.toast(entry ? 'Entry updated' : 'Entry added', {
        sub: `${out.title} · ${entryDates(out)}`,
      });
      this.saved.emit(out);
    } catch (x) {
      this.errors.set(this.problemErrors(x));
      if (x instanceof ApiProblem && (x.status === 412 || x.status === 428)) this.stale.emit();
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove() {
    const e = this.entry();
    if (!e || this.busy()) return;
    const ok = await this.overlays.confirm({
      title: `Delete "${e.title}"?`,
      text: "The entry disappears from the calendar and from members' apps. It's kept as deleted and can be restored from the list.",
      ok: 'Delete entry',
      tone: 'bad',
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      const out = await this.api.remove(e.id);
      this.overlays.toast('Entry deleted', {
        sub: "Turn on 'Show deleted' in the list to restore it",
      });
      this.deleted.emit(out);
    } catch (x) {
      this.errors.set({ form: problemText(x) });
    } finally {
      this.busy.set(false);
    }
  }

  private problemErrors(x: unknown): Record<string, string> {
    if (!(x instanceof ApiProblem) || !x.errors.length) return { form: problemText(x) };
    const map: Record<string, string> = {
      type: 'type',
      title: 'title',
      startDate: 'sd',
      endDate: 'ed',
      startTime: 'st',
      endTime: 'et',
      repeatUntil: 'until',
      audience: 'aud',
    };
    const out: Record<string, string> = {};
    for (const f of x.errors) out[map[f.field] ?? 'form'] ??= f.message;
    return out;
  }
}
