import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type OnInit,
  output,
  signal,
} from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { Modal } from '../../../Shared/Overlays';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import {
  CorporateCodesApi,
  type CorporateCodeInput,
  type CorporateCodeList,
  type CorporateCodeView,
} from './corporate-codes.api';

type Field = 'bankName' | 'corporateCode' | 'ifsc' | 'poolAccountRef' | 'classIds';
const FIELDS: readonly Field[] = [
  'bankName',
  'corporateCode',
  'ifsc',
  'poolAccountRef',
  'classIds',
];

/**
 * Add a corporate code or change one (INS-044/045, INS-047/048; client 2026-10-13/14): the bank, the
 * code the bank allotted, its IFSC and pool account, and the classes whose VANs use it. A class
 * already on another code is greyed out: a class uses one code (client 2026-10-14).
 */
@Component({
  selector: 'rp-corporate-code-form',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="code() ? 'Change ' + code()!.corporateCode : 'Add a corporate code'"
      sub="The code the bank allotted for the account the school collects into, and the classes that use it."
      [icon]="code() ? 'edit' : 'bank'"
      [drawer]="true"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="cc-form">
        <div class="c-form">
          <div class="fld" [class.invalid]="err('bankName')">
            <label class="fld-l" for="cc-bank">Bank name<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="cc-bank"
                type="text"
                maxlength="100"
                autocomplete="off"
                placeholder="e.g. Axis Bank"
                [value]="bankName()"
                (input)="bankName.set(val($event)); clear('bankName')"
              />
            </div>
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('bankName') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('corporateCode')">
            <label class="fld-l" for="cc-code">Corporate code<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="cc-code"
                type="text"
                autocomplete="off"
                spellcheck="false"
                translate="no"
                placeholder="As the bank gave it, e.g. ABCD"
                [attr.maxlength]="maxLength()"
                [value]="corporateCode()"
                (input)="corporateCode.set(val($event).toUpperCase()); clear('corporateCode')"
              />
            </div>
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('corporateCode') }}</span>
            </div>
            <div class="fld-h">
              Up to {{ maxLength() }} capital letters or digits. A VAN is this code followed by the
              wallet number.
            </div>
          </div>
          <div class="fld" [class.invalid]="err('ifsc')">
            <label class="fld-l" for="cc-ifsc">IFSC</label>
            <div class="fld-in">
              <input
                id="cc-ifsc"
                type="text"
                maxlength="11"
                autocomplete="off"
                spellcheck="false"
                translate="no"
                placeholder="e.g. UTIB0CCH274"
                [value]="ifsc()"
                (input)="ifsc.set(val($event).toUpperCase()); clear('ifsc')"
              />
            </div>
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('ifsc') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('poolAccountRef')">
            <label class="fld-l" for="cc-pool">Pool account</label>
            <div class="fld-in">
              <input
                id="cc-pool"
                type="text"
                maxlength="40"
                autocomplete="off"
                translate="no"
                placeholder="The school's account the bank pools into"
                [value]="pool()"
                (input)="pool.set(val($event)); clear('poolAccountRef')"
              />
            </div>
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('poolAccountRef') }}</span>
            </div>
          </div>
        </div>

        <fieldset class="stack g8" style="border: 0; padding: 0; margin: 0" id="cc-classes">
          <legend class="fld-l" style="margin-bottom: 6px">Classes that use this code</legend>
          @if (!classes().length) {
            <p class="t-muted t-sm" style="margin: 0">This school has no classes yet.</p>
          } @else {
            <div class="row g8 wrap">
              @for (c of classes(); track c.id) {
                <label
                  class="chk"
                  style="min-width: 150px"
                  [style.opacity]="elsewhere(c.codeId) ? 0.55 : null"
                  [attr.title]="
                    elsewhere(c.codeId)
                      ? 'On ' + elsewhere(c.codeId) + ': take it off that code first'
                      : null
                  "
                  ><input
                    type="checkbox"
                    [checked]="picked().has(c.id)"
                    [disabled]="!!elsewhere(c.codeId)"
                    (change)="toggle(c.id, $event)"
                  /><span
                    >{{ c.name }}
                    @if (elsewhere(c.codeId); as other) {
                      <span class="t-muted t-xs" translate="no"> (on {{ other }})</span>
                    }
                  </span></label
                >
              }
            </div>
            <div class="fld-h">
              A class uses one code: one marked "on …" must be taken off that code first. Classes
              not chosen for any code use the school's default code, as do staff and merchants.
            </div>
          }
          @if (err('classIds')) {
            <div class="t-xs" style="color: var(--bad)" role="alert">{{ err('classIds') }}</div>
          }
        </fieldset>

        @if (!code()) {
          <label class="chk"
            ><input
              type="checkbox"
              id="cc-default"
              [checked]="makeDefault()"
              (change)="makeDefault.set(checked($event))"
            /><span>Make it the school's default code</span></label
          >
        }
        @if (error()) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ error() }}</div>
          </div>
        }
      </div>
      <div modal-foot class="row g8">
        <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="cc-save"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="save()"
        >
          <rp-icon name="check" [size]="17" /><span>{{
            code() ? 'Save changes' : 'Add code'
          }}</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class CorporateCodeForm implements OnInit {
  private readonly api = inject(CorporateCodesApi);

  /** The calls' base: the console's school or a back-office school. */
  readonly base = input.required<string>();
  readonly list = input.required<CorporateCodeList>();
  /** The code to change; none adds one. */
  readonly code = input<CorporateCodeView | null>(null);
  readonly closed = output<void>();
  readonly saved = output<CorporateCodeView>();

  protected readonly bankName = signal('');
  protected readonly corporateCode = signal('');
  protected readonly ifsc = signal('');
  protected readonly pool = signal('');
  protected readonly picked = signal<ReadonlySet<string>>(new Set());
  protected readonly makeDefault = signal(false);
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected readonly maxLength = computed(() => this.list().maxLength);
  protected readonly classes = computed(() => this.list().classes);

  ngOnInit() {
    const c = this.code();
    if (!c) return;
    this.bankName.set(c.bankName ?? '');
    this.corporateCode.set(c.corporateCode);
    this.ifsc.set(c.ifsc ?? '');
    this.pool.set(c.poolAccountRef ?? '');
    this.picked.set(new Set(c.classes.map((x) => x.id)));
  }

  /** The other code a class is on now (null: the default, or this one). */
  protected elsewhere(codeId: string | null) {
    if (!codeId || codeId === this.code()?.id) return null;
    return this.list().items.find((x) => x.id === codeId)?.corporateCode ?? null;
  }

  protected toggle(id: string, e: Event) {
    const on = (e.target as HTMLInputElement).checked;
    this.picked.update((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
    this.clear('classIds');
  }

  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected checked(e: Event) {
    return (e.target as HTMLInputElement).checked;
  }
  protected err(f: Field) {
    return this.errors()[f] ?? '';
  }
  protected clear(f: Field) {
    if (this.errors()[f]) this.errors.update((e) => ({ ...e, [f]: '' }));
  }

  protected async save() {
    if (this.busy()) return;
    const required = translate('VALIDATION.REQUIRED');
    const e: Partial<Record<Field, string>> = {};
    if (!this.bankName().trim()) e.bankName = required;
    if (!this.corporateCode().trim()) e.corporateCode = required;
    this.errors.set(e);
    this.error.set('');
    if (Object.keys(e).length) return;
    const c = this.code();
    const body: CorporateCodeInput = {
      bankName: this.bankName().trim(),
      corporateCode: this.corporateCode().trim(),
      ifsc: this.ifsc().trim() || null,
      poolAccountRef: this.pool().trim() || null,
      classIds: [...this.picked()],
    };
    if (!c && this.makeDefault()) body.isDefault = true;
    this.busy.set(true);
    try {
      const out = c
        ? await this.api.change(this.base(), c, body)
        : await this.api.add(this.base(), body);
      this.saved.emit(out);
    } catch (err) {
      if (err instanceof ApiProblem && err.errors.length) {
        const next: Partial<Record<Field, string>> = {};
        for (const x of err.errors) {
          if ((FIELDS as readonly string[]).includes(x.field)) next[x.field as Field] = x.message;
        }
        this.errors.set(next);
        if (!Object.keys(next).length) this.error.set(err.detail);
      } else {
        this.error.set(err instanceof ApiProblem ? err.detail : translate('GEN.UNAVAILABLE'));
      }
    } finally {
      this.busy.set(false);
    }
  }
}
