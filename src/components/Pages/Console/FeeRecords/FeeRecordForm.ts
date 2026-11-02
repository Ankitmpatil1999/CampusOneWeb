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
import { formatDate, formatInr, istBusinessDate } from '../../../Utils/format';
import { newIdempotencyKey } from '../../../Utils/ids';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { amountText, cleanTyped } from '../../../Utils/typing';
import { money, rupeesToPaise } from '../Fees/fee-format';
import type { FeeHead } from '../Fees/fees.api';
import { StudentSelect, type StudentOption } from './StudentSelect';
import { FeeRecordsApi, type FeeRecordDetail } from './fee-records.api';
import { fieldMessage } from './record-format';

type Field = 'stu' | 'term' | 'amt' | 'due' | 'head' | 'rem';

/**
 * Create a fee record for one student (prototype cm.fr.new; FEE-012): the student, the instalment
 * or term, the fee amount and the due date (today or later, inside the year), and the head it is
 * billed under (Tuition unless another is chosen). One record per student, year and instalment.
 */
@Component({
  selector: 'rp-fee-record-form',
  imports: [Icon, Modal, StudentSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      title="Create fee record"
      [sub]="year().label + ' · billed to one student; collect it from the record once created.'"
      icon="receipt"
      [wide]="true"
      cls="cm-m"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="c-form">
        <div class="full">
          <div class="fld" [class.invalid]="err('stu')">
            <label class="fld-l" for="fn-stu-b">Student<span class="req">*</span></label>
            <rp-student-select inputId="fn-stu" source="fees" [(value)]="student" />
            <div class="fld-e" id="fn-stu-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('stu') }}</span>
            </div>
            <div class="fld-h">One record per student, year and instalment.</div>
          </div>
        </div>
        <div class="fld" [class.invalid]="err('term')">
          <label class="fld-l" for="fn-term">Instalment / term<span class="req">*</span></label>
          <div class="fld-in">
            <input
              id="fn-term"
              maxlength="30"
              autocomplete="off"
              aria-describedby="fn-term-e"
              [value]="term()"
              (input)="term.set(val($event)); clear('term')"
            />
          </div>
          <div class="fld-e" id="fn-term-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('term') }}</span>
          </div>
        </div>
        <div class="fld" [class.invalid]="err('amt')">
          <label class="fld-l" for="fn-amt">Fee amount<span class="req">*</span></label>
          <div class="fld-in">
            <span class="pre">₹</span>
            <input
              id="fn-amt"
              inputmode="decimal"
              autocomplete="off"
              aria-describedby="fn-amt-e"
              [value]="amt()"
              (input)="amt.set(amountOf($event)); clear('amt')"
            />
          </div>
          <div class="fld-e" id="fn-amt-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('amt') }}</span>
          </div>
        </div>
        <div class="fld" [class.invalid]="err('due')">
          <label class="fld-l" for="fn-due">Due date<span class="req">*</span></label>
          <div class="fld-in">
            <input
              id="fn-due"
              type="date"
              aria-describedby="fn-due-e"
              [attr.min]="today"
              [value]="due()"
              (input)="due.set(val($event)); clear('due')"
              (change)="due.set(val($event)); clear('due')"
            />
          </div>
          <div class="fld-e" id="fn-due-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('due') }}</span>
          </div>
          <div class="fld-h">Not earlier than today.</div>
        </div>
        <div class="fld" [class.invalid]="err('head')">
          <label class="fld-l" for="fn-head">Fee head</label>
          <div class="fld-in">
            <select id="fn-head" [value]="headId()" (change)="headPicked.set(val($event))">
              @for (h of headOptions(); track h.id) {
                <option [value]="h.id" [selected]="h.id === headId()">{{ h.name }}</option>
              }
            </select>
          </div>
          <div class="fld-e" id="fn-head-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('head') }}</span>
          </div>
        </div>
        <div class="full">
          <div class="fld" [class.invalid]="err('rem')">
            <label class="fld-l" for="fn-rem">Remarks<span class="opt">(optional)</span></label>
            <div class="fld-in">
              <textarea
                id="fn-rem"
                rows="2"
                maxlength="300"
                placeholder="e.g. Materials for the science fair"
                [value]="rem()"
                (input)="rem.set(val($event)); clear('rem')"
              ></textarea>
            </div>
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('rem') }}</span>
            </div>
          </div>
        </div>
      </div>
      @if (error()) {
        <div class="note tone-bad" role="alert" style="margin-top: 14px">
          <rp-icon name="alertc" [size]="17" />
          <div class="grow">{{ error() }}</div>
        </div>
      }
      <div modal-foot class="row g8">
        <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="fn-save"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="save()"
        >
          <rp-icon name="check" [size]="17" /><span>Create record</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class FeeRecordForm {
  private readonly api = inject(FeeRecordsApi);
  private readonly overlays = inject(Overlays);

  /** The academic year the record is billed in (the year in context). */
  readonly year = input.required<{ id: string; label: string }>();
  readonly heads = input<readonly FeeHead[]>([]);
  readonly closed = output<void>();
  readonly created = output<FeeRecordDetail>();

  protected readonly today = istBusinessDate(new Date());
  protected readonly student = signal<StudentOption | null>(null);
  protected readonly term = signal('Instalment 2');
  protected readonly amt = signal('');
  protected readonly due = signal('');
  protected readonly rem = signal('');
  protected readonly headPicked = signal('');
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  private readonly key = newIdempotencyKey();

  protected readonly headOptions = computed(() =>
    this.heads().filter((h) => h.status === 'ACTIVE'),
  );
  /** The head chosen; Tuition (the API's default) until another is picked. */
  protected readonly headId = computed(
    () =>
      this.headPicked() ||
      this.headOptions().find((h) => h.name === 'Tuition')?.id ||
      this.headOptions()[0]?.id ||
      '',
  );

  protected err(f: Field) {
    return this.errors()[f] ?? '';
  }
  protected clear(f: Field) {
    if (this.errors()[f]) this.errors.update((e) => ({ ...e, [f]: '' }));
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  /** An amount: numbers only, in the box too (client 2026-10-14). */
  protected amountOf(e: Event) {
    return cleanTyped(e.target as HTMLInputElement, amountText);
  }

  protected async save() {
    this.error.set('');
    const e: Partial<Record<Field, string>> = {};
    const amount = rupeesToPaise(this.amt());
    if (!this.student()) e.stu = 'Choose the student';
    if (!this.term().trim()) e.term = 'Name the instalment or term';
    if (!this.amt().trim()) e.amt = 'Enter the fee amount';
    else if (!amount) e.amt = translate('VALIDATION.AMOUNT');
    if (!this.due()) e.due = 'Choose the due date';
    else if (this.due() < this.today) e.due = "The due date can't be earlier than today";
    this.errors.set(e);
    const st = this.student();
    if (Object.values(e).some(Boolean) || !st || !amount) return;
    const ok = await this.overlays.confirm({
      title: `Create ${this.term().trim()} for ${st.name}?`,
      text: `${formatInr(amount)} due ${formatDate(this.due())}.`,
      ok: 'Create record',
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      const r = await this.api.create(
        {
          studentId: st.id,
          yearId: this.year().id,
          label: this.term().trim(),
          dueDate: this.due(),
          amount: money(amount),
          ...(this.headId() ? { headId: this.headId() } : {}),
          remarks: this.rem().trim() || null,
        },
        this.key,
      );
      this.overlays.toast('Fee record created', {
        sub: `${r.student.name} · ${formatInr(amount)} due ${formatDate(r.dueDate)}`,
      });
      this.created.emit(r);
    } catch (x) {
      if (x instanceof ApiProblem && x.errors.length) {
        const map: Record<string, Field> = {
          studentId: 'stu',
          label: 'term',
          amount: 'amt',
          dueDate: 'due',
          headId: 'head',
          remarks: 'rem',
        };
        const f: Partial<Record<Field, string>> = {};
        for (const y of x.errors) if (map[y.field]) f[map[y.field]!] = fieldMessage(y);
        this.errors.set(f);
        if (!Object.keys(f).length) this.error.set(x.detail);
      } else {
        this.error.set(x instanceof ApiProblem ? x.detail : translate('GEN.UNAVAILABLE'));
      }
    } finally {
      this.busy.set(false);
    }
  }
}
