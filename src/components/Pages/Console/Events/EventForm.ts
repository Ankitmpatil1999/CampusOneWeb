import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { inrText } from '../../../Shared/Amount';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate, formatInr, istBusinessDate } from '../../../Utils/format';
import { newIdempotencyKey } from '../../../Utils/ids';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { amountText, cleanTyped } from '../../../Utils/typing';
import { moneyInput } from '../Allowances/allowance-format';
import type { ClassView } from '../Members/members.api';
import { EventsApi, type EventInput, type EventPatch, type PaidEvent } from './events.api';

type Field = 'title' | 'desc' | 'start' | 'end';
const MAX_HEADS = 20;
const paiseOf = (v: string) => Math.round(Number(v) * 100);
const same = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

/**
 * Register or edit a paid event (prototype cm.ev.new; SRS 13.7–13.8, OI-FEE-13…15; FEE-029, FEE-030):
 * title, description, the payment period (the closing date counts to 23:59 IST), the audience
 * (classes; none: the whole institution) and the payment heads, whose sum members pay once from the
 * wallet. The institution's fee account receives the money. Once someone has paid, the heads and
 * the opening date can't change.
 */
@Component({
  selector: 'rp-event-form',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="event() ? 'Edit event' : 'Register event'"
      [sub]="
        event()
          ? event()!.title
          : 'Members pay the exact total from their wallet while the event is open.'
      "
      icon="calendar"
      [wide]="true"
      cls="cm-m"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="c-form">
        @if (locked()) {
          <div class="full">
            <div class="note tone-info">
              <rp-icon name="lock" [size]="17" />
              <div class="grow">{{ lockedText }}</div>
            </div>
          </div>
        }
        <div class="full">
          <div class="fld" [class.invalid]="err('title')">
            <label class="fld-l" for="en-title"
              >Title<span class="req">*</span
              ><span class="count">{{ f().title.length }}/80</span></label
            >
            <div class="fld-in">
              <input
                id="en-title"
                maxlength="80"
                autocomplete="off"
                placeholder="e.g. Science museum visit — Grade 8"
                aria-describedby="en-title-e"
                [value]="f().title"
                (input)="set('title', $event)"
              />
            </div>
            <div class="fld-e" id="en-title-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('title') }}</span>
            </div>
          </div>
        </div>
        <div class="full">
          <div class="fld" [class.invalid]="err('desc')">
            <label class="fld-l" for="en-desc">Description</label>
            <div class="fld-in">
              <textarea
                id="en-desc"
                rows="2"
                maxlength="500"
                placeholder="What members are paying for"
                aria-describedby="en-desc-e"
                [value]="f().desc"
                (input)="set('desc', $event)"
              ></textarea>
            </div>
            <div class="fld-e" id="en-desc-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('desc') }}</span>
            </div>
          </div>
        </div>
        <div class="fld" [class.invalid]="err('start')">
          <label class="fld-l" for="en-start">Opens for payment<span class="req">*</span></label>
          <div class="fld-in">
            <input
              id="en-start"
              type="date"
              aria-describedby="en-start-e"
              [attr.min]="startMin()"
              [disabled]="locked()"
              [value]="f().start"
              (input)="set('start', $event)"
              (change)="set('start', $event)"
            />
          </div>
          <div class="fld-e" id="en-start-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('start') }}</span>
          </div>
        </div>
        <div class="fld" [class.invalid]="err('end')">
          <label class="fld-l" for="en-end">Closes<span class="req">*</span></label>
          <div class="fld-in">
            <input
              id="en-end"
              type="date"
              aria-describedby="en-end-e"
              [attr.min]="endMin()"
              [value]="f().end"
              (input)="set('end', $event)"
              (change)="set('end', $event)"
            />
          </div>
          <div class="fld-e" id="en-end-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('end') }}</span>
          </div>
          <div class="fld-h">
            Members can pay until 23:59 on this day — not before the opening date or today.
          </div>
        </div>
        <div class="fld locked">
          <label class="fld-l" for="en-mer">Receiving merchant</label>
          <div class="fld-in">
            <input id="en-mer" readonly [value]="payee() || 'The institution’s fee account'" /><span
              class="suf plain"
              ><rp-icon name="lock" [size]="15"
            /></span>
          </div>
          <div class="fld-h">Event payments go to the institution's fee account (MER 12.7).</div>
        </div>
        <div class="fld">
          <span class="fld-l">Audience<span class="opt">(optional)</span></span>
          <div class="t-sm" style="padding-top: 10px">{{ audienceText() }}</div>
        </div>
        @if (classes().length) {
          <div class="full">
            <div class="cm-clsgrid" role="group" aria-label="Audience classes">
              @for (c of classes(); track c.id) {
                <label class="cm-clschip" [class.on]="f().audience.includes(c.id)"
                  ><input
                    type="checkbox"
                    [checked]="f().audience.includes(c.id)"
                    (change)="toggleClass(c.id)"
                  />{{ c.name }}</label
                >
              }
            </div>
            <div class="fld-h">None ticked: the whole institution can pay.</div>
          </div>
        }
        <div class="full fs" id="en-heads">
          <h4>
            <rp-icon name="list" [size]="16" /> Payment heads<span class="grow"></span>
            <button
              type="button"
              class="btn btn-ghost btn-xs"
              id="en-add"
              [disabled]="locked() || heads().length >= maxHeads"
              (click)="addHead()"
            >
              <rp-icon name="plus" [size]="15" /><span>Add head</span>
            </button>
          </h4>
          <div class="fs-b">
            <table class="cm-ed">
              <thead>
                <tr>
                  <th>Head</th>
                  <th class="r">Amount</th>
                  <th aria-label="Remove"></th>
                </tr>
              </thead>
              <tbody>
                @for (h of heads(); track $index; let i = $index) {
                  <tr>
                    <td>
                      <input
                        maxlength="60"
                        placeholder="e.g. Bus fare"
                        aria-label="Head name"
                        [class.cm-bad]="headBad() && !h.name.trim()"
                        [disabled]="locked()"
                        [value]="h.name"
                        (input)="setHead(i, 'name', $event)"
                      />
                    </td>
                    <td class="r">
                      <div class="cm-amt-in" [class.cm-bad]="headBad() && !headAmount(h.amount)">
                        <span>₹</span
                        ><input
                          inputmode="decimal"
                          placeholder="0.00"
                          aria-label="Amount"
                          [disabled]="locked()"
                          [value]="h.amount"
                          (input)="setHead(i, 'amount', $event)"
                        />
                      </div>
                    </td>
                    <td class="cm-rx">
                      <button
                        type="button"
                        class="iconbtn"
                        aria-label="Remove head"
                        [disabled]="locked() || heads().length <= 1"
                        (click)="removeHead(i)"
                      >
                        <rp-icon name="trash" [size]="16" />
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
              <tfoot>
                <tr>
                  <td>Total — paid in full, once</td>
                  <td class="r t-num" id="en-tot">{{ totalText() }}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
            @if (headBad()) {
              <div class="fld-e" style="display: flex; margin-top: 6px" role="alert">
                <rp-icon name="alertc" [size]="14" /><span
                  >Give every head a name and an amount above ₹0 (up to 2 decimals).</span
                >
              </div>
            }
          </div>
        </div>
        @if (error()) {
          <div class="full">
            <div class="note tone-bad" role="alert">
              <rp-icon name="alertc" [size]="17" />
              <div class="grow">{{ error() }}</div>
            </div>
          </div>
        }
      </div>
      <div modal-foot class="row g8" style="justify-content: flex-end; width: 100%">
        <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="en-save"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="save()"
        >
          <rp-icon name="check" [size]="17" /><span>{{
            event() ? 'Save event' : 'Register event'
          }}</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class EventForm {
  private readonly api = inject(EventsApi);
  private readonly overlays = inject(Overlays);

  /** null: register a new event. */
  readonly event = input<PaidEvent | null>(null);
  readonly classes = input<readonly ClassView[]>([]);
  /** The fee account's name, when the merchants can be read. */
  readonly feeAccount = input<string | null>(null);
  readonly closed = output<void>();
  readonly saved = output<PaidEvent>();

  protected readonly maxHeads = MAX_HEADS;
  protected readonly lockedText = translate('FEE.EVENT_HAS_PAYMENTS');
  protected readonly f = signal({
    title: '',
    desc: '',
    start: istBusinessDate(new Date()),
    end: '',
    audience: [] as string[],
  });
  protected readonly heads = signal<{ name: string; amount: string }[]>([{ name: '', amount: '' }]);
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly headBad = signal(false);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  private readonly key = newIdempotencyKey();

  /** Members have paid: heads and the opening date stay (FEE.EVENT_HAS_PAYMENTS). */
  protected readonly locked = computed(() => (this.event()?.payments.count ?? 0) > 0);
  protected readonly payee = computed(() => this.event()?.merchant ?? this.feeAccount());
  /** Neither date may be in the past (client 2026-10-15); an event under way keeps its start. */
  private readonly today = istBusinessDate(new Date());
  protected readonly startMin = computed(() => {
    const kept = this.event()?.startDate;
    return kept && kept < this.today ? null : this.today;
  });
  /** The event closes on or after it opens, and not before today. */
  protected readonly endMin = computed(() => {
    const start = this.f().start;
    return start > this.today ? start : this.today;
  });
  protected readonly total = computed(() =>
    this.heads().reduce((a, h) => {
      const m = moneyInput(h.amount);
      return a + (m ? paiseOf(m) : 0);
    }, 0),
  );
  protected readonly totalText = computed(() => formatInr(this.total()));
  protected readonly audienceText = computed(() => {
    const ids = this.f().audience;
    if (!ids.length) return 'Whole institution';
    const names = this.classes()
      .filter((c) => ids.includes(c.id))
      .map((c) => c.name);
    return names.join(', ') || `${ids.length} classes`;
  });

  constructor() {
    queueMicrotask(() => {
      const e = this.event();
      if (!e) return;
      this.f.set({
        title: e.title,
        desc: e.description ?? '',
        start: e.startDate,
        end: e.endDate,
        audience: e.audience?.map((a) => a.id) ?? [],
      });
      this.heads.set(e.heads.map((h) => ({ name: h.name, amount: h.amount.amount })));
    });
  }

  protected set(k: 'title' | 'desc' | 'start' | 'end', e: Event) {
    const v = (e.target as HTMLInputElement).value;
    this.f.update((x) => ({ ...x, [k]: v }));
    if (this.errors()[k]) this.errors.update((x) => ({ ...x, [k]: undefined }));
  }
  protected toggleClass(id: string) {
    this.f.update((x) => ({
      ...x,
      audience: x.audience.includes(id) ? x.audience.filter((c) => c !== id) : [...x.audience, id],
    }));
  }
  protected setHead(i: number, k: 'name' | 'amount', e: Event) {
    // The amount takes numbers only (client 2026-10-14).
    const el = e.target as HTMLInputElement;
    const v = k === 'amount' ? cleanTyped(el, amountText) : el.value;
    this.heads.update((l) => l.map((h, j) => (j === i ? { ...h, [k]: v } : h)));
  }
  protected addHead() {
    if (this.heads().length < MAX_HEADS) this.heads.update((l) => [...l, { name: '', amount: '' }]);
  }
  protected removeHead(i: number) {
    if (this.heads().length > 1) this.heads.update((l) => l.filter((_, j) => j !== i));
  }
  protected headAmount(v: string) {
    const m = moneyInput(v);
    return m !== null && paiseOf(m) > 0;
  }
  protected err(k: Field) {
    return this.errors()[k] ?? '';
  }

  private validate(): EventInput | null {
    const v = this.f();
    const e: Partial<Record<Field, string>> = {};
    const title = v.title.trim();
    if (!title) e.title = 'Enter the event title';
    else if (title.length < 5 || title.length > 80) e.title = 'Use 5–80 characters';
    const ev = this.event();
    // A past date is refused only when it changes (an event under way keeps its start).
    const startChanged = !ev || v.start !== ev.startDate;
    const endChanged = !ev || v.end !== ev.endDate;
    if (!v.start) e.start = 'Choose the opening date';
    else if (startChanged && v.start < this.today) e.start = translate('FEE.EVENT_OPENS_PAST');
    if (!v.end) e.end = 'Choose the closing date';
    else if (endChanged && v.end < this.today) e.end = translate('FEE.EVENT_CLOSES_PAST');
    else if (v.start && v.end < v.start) e.end = translate('FEE.EVENT_DATES_INVALID');
    const bad = this.heads().some((h) => !h.name.trim() || !this.headAmount(h.amount));
    this.headBad.set(bad);
    this.errors.set(e);
    if (bad || Object.values(e).some(Boolean)) return null;
    return {
      title,
      description: v.desc.trim() || null,
      startDate: v.start,
      endDate: v.end,
      heads: this.heads().map((h) => ({
        name: h.name.trim(),
        amount: { amount: moneyInput(h.amount)!, currency: 'INR' as const },
      })),
      audienceClassIds: v.audience.length ? v.audience : null,
    };
  }

  /** The fields that changed (FEE-030 refuses heads and a start date once someone has paid). */
  private patchOf(ev: PaidEvent, b: EventInput): EventPatch {
    const heads = (h: EventInput['heads']) => h.map((x) => `${x.name}|${x.amount.amount}`);
    return {
      ...(b.title !== ev.title ? { title: b.title } : {}),
      ...((b.description ?? null) !== (ev.description ?? null)
        ? { description: b.description ?? null }
        : {}),
      ...(b.startDate !== ev.startDate ? { startDate: b.startDate } : {}),
      ...(b.endDate !== ev.endDate ? { endDate: b.endDate } : {}),
      ...(!same(heads(b.heads), heads(ev.heads)) ? { heads: b.heads } : {}),
      ...(!same(b.audienceClassIds ?? [], ev.audience?.map((a) => a.id) ?? [])
        ? { audienceClassIds: b.audienceClassIds ?? null }
        : {}),
    };
  }

  protected async save() {
    if (this.busy()) return;
    this.error.set('');
    const body = this.validate();
    if (!body) return;
    const ev = this.event();
    const patch = ev ? this.patchOf(ev, body) : null;
    if (patch && !Object.keys(patch).length) {
      this.closed.emit();
      return;
    }
    const total = formatInr(this.total());
    const ok = await this.overlays.confirm({
      title: ev ? `Save changes to “${body.title}”?` : `Register “${body.title}”?`,
      text: `${total} per member, paid to ${this.payee() || 'the fee account'} between ${formatDate(body.startDate)} and ${formatDate(body.endDate)}.`,
      ok: ev ? 'Save event' : 'Register event',
      icon: 'calendar',
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      const out = ev ? await this.api.update(ev, patch!) : await this.api.create(body, this.key);
      this.saved.emit(out);
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
    if (e.status === 412) {
      this.error.set('Someone else changed this event. Close it and open it again.');
      return;
    }
    const map: Record<string, Field> = {
      title: 'title',
      description: 'desc',
      startDate: 'start',
      endDate: 'end',
    };
    const fe: Partial<Record<Field, string>> = {};
    let heads = false;
    for (const x of e.errors) {
      const k = map[x.field];
      if (k) fe[k] = x.message;
      else if (x.field.startsWith('heads')) heads = true;
    }
    this.errors.set(fe);
    this.headBad.set(heads);
    if (!Object.keys(fe).length && !heads) this.error.set(e.detail);
  }

  protected inr(m: { amount: string }) {
    return inrText(m);
  }
}
