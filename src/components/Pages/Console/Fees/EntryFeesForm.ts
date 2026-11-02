import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  type OnInit,
  output,
  signal,
} from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatInr } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { amountText, cleanTyped } from '../../../Utils/typing';
import { money, paiseOf, paiseToInput, rupeesToPaise } from './fee-format';
import { FeesApi, type EntryFeesRow } from './fees.api';

type Field = 'app' | 'adm';

/**
 * The entry fees of an academic year (prototype cm.ef.edit; FEE-009): the application fee and
 * whether it must be paid to submit the public form, and the admission fee. One schedule per year;
 * fees already paid don't change.
 */
@Component({
  selector: 'rp-entry-fees-form',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="'Entry fees · ' + row().year.label"
      sub="One schedule per academic year."
      icon="rupee"
      cls="cm-m"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16">
        <div class="fld" [class.invalid]="err('app')">
          <label class="fld-l" for="ef-app">Application fee<span class="req">*</span></label>
          <div class="fld-in">
            <span class="pre">₹</span>
            <input
              id="ef-app"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              aria-describedby="ef-app-e"
              [value]="app()"
              (input)="app.set(amountOf($event)); clear('app')"
            />
          </div>
          <div class="fld-e" id="ef-app-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('app') }}</span>
          </div>
        </div>
        <div class="li" style="min-height: 52px">
          <span class="li-ic sm"><rp-icon name="lock" [size]="16" /></span>
          <span class="li-main"
            ><span class="li-t wrap">Application fee: now or later</span
            ><span class="li-s wrap"
              >The family pays online with the form, or chooses Pay later and pays in cash at the
              accounts desk.</span
            ></span
          >
        </div>
        <div class="fld" [class.invalid]="err('adm')">
          <label class="fld-l" for="ef-adm">Admission fee<span class="req">*</span></label>
          <div class="fld-in">
            <span class="pre">₹</span>
            <input
              id="ef-adm"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              aria-describedby="ef-adm-e"
              [value]="adm()"
              (input)="adm.set(amountOf($event)); clear('adm')"
            />
          </div>
          <div class="fld-e" id="ef-adm-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('adm') }}</span>
          </div>
          <div class="fld-h">
            Paid with the submitted form or later, online or as cash; Accounts confirms it before
            the admission number is assigned.
          </div>
        </div>
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
          id="ef-save"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="save()"
        >
          <span>Save entry fees</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class EntryFeesForm implements OnInit {
  private readonly api = inject(FeesApi);
  private readonly overlays = inject(Overlays);

  readonly row = input.required<EntryFeesRow>();
  readonly closed = output<void>();
  readonly saved = output<EntryFeesRow>();

  protected readonly app = signal('500');
  protected readonly adm = signal('10000');
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  ngOnInit() {
    const f = this.row().fees;
    if (!f) return;
    this.app.set(paiseToInput(paiseOf(f.applicationFee)));
    this.adm.set(paiseToInput(paiseOf(f.admissionFee)));
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
  /** An amount: numbers only, in the box too (client 2026-10-14). */
  protected amountOf(e: Event) {
    return cleanTyped(e.target as HTMLInputElement, amountText);
  }

  protected async save() {
    this.error.set('');
    const e: Partial<Record<Field, string>> = {};
    const app = rupeesToPaise(this.app());
    const adm = rupeesToPaise(this.adm());
    if (!this.app().trim()) e.app = 'Enter the application fee';
    else if (app === null) e.app = 'Enter an amount with up to 2 decimals';
    if (!this.adm().trim()) e.adm = 'Enter the admission fee';
    else if (adm === null) e.adm = 'Enter an amount with up to 2 decimals';
    this.errors.set(e);
    if (app === null || adm === null) return;
    const y = this.row().year.label;
    const ok = await this.overlays.confirm({
      title: `Save entry fees for ${y}?`,
      text: `Application ${formatInr(app)} · admission ${formatInr(adm)}. Fees already paid are not changed.`,
      ok: 'Save',
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      this.saved.emit(
        await this.api.setEntryFees(this.row().year.id, this.row().fees?.version ?? null, {
          applicationFee: money(app),
          // Paid now or later (client 2026-10-12): not a setting any more; the field stays in the API.
          applicationMandatory: false,
          admissionFee: money(adm),
        }),
      );
    } catch (x) {
      if (x instanceof ApiProblem && x.status === 412) {
        this.error.set('Someone else changed these fees. Close this and open it again.');
      } else if (x instanceof ApiProblem && x.errors.length) {
        const map: Record<string, Field> = { applicationFee: 'app', admissionFee: 'adm' };
        const f: Partial<Record<Field, string>> = {};
        for (const r of x.errors) if (map[r.field]) f[map[r.field]!] = r.message;
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
