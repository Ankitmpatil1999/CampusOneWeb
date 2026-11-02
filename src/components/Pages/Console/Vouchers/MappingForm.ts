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
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { EVENT_CATEGORY, LEDGER_NAME } from './voucher-format';
import {
  VouchersApi,
  type AccountingEvent,
  type Mappings,
  type MappingsInput,
} from './vouchers.api';

type Field = 'company' | 'debit' | 'credit';

/**
 * The accounting settings (prototype cm.map.edit and cm.co.new; FEE-036/037): with `event`, one
 * posting's debit and credit ledgers (or stop sending it); without, the company and whether
 * transfers are on. Every save sends the whole set with If-Match; vouchers already written keep
 * their ledgers.
 */
@Component({
  selector: 'rp-mapping-form',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <rp-modal
      [title]="title()"
      [sub]="sub()"
      [icon]="event() ? 'filetext' : 'building'"
      cls="cm-m"
      [narrow]="false"
      (closed)="closed.emit()"
    >
      <div class="c-form">
        @if (!event() || !current().company) {
          <div class="full">
            <div class="fld" [class.invalid]="err('company')" [class.shake]="shook('company')">
              <label class="fld-l" for="mp-co">Company name<span class="req">*</span></label>
              <div class="fld-in">
                <input
                  id="mp-co"
                  name="mp-co"
                  type="text"
                  autocomplete="off"
                  maxlength="100"
                  placeholder="As named in the accounting package"
                  aria-describedby="mp-co-e"
                  [value]="company()"
                  (input)="set('company', $event)"
                />
              </div>
              <div class="fld-e" id="mp-co-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('company') }}</span>
              </div>
            </div>
          </div>
        }
        @if (event()) {
          <div class="fld" [class.invalid]="err('debit')" [class.shake]="shook('debit')">
            <label class="fld-l" for="mp-dr">Debit account<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="mp-dr"
                name="mp-dr"
                type="text"
                autocomplete="off"
                maxlength="100"
                aria-describedby="mp-dr-e"
                [value]="debit()"
                (input)="set('debit', $event)"
              />
            </div>
            <div class="fld-e" id="mp-dr-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('debit') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('credit')" [class.shake]="shook('credit')">
            <label class="fld-l" for="mp-cr">Credit account<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="mp-cr"
                name="mp-cr"
                type="text"
                autocomplete="off"
                maxlength="100"
                aria-describedby="mp-cr-e"
                [value]="credit()"
                (input)="set('credit', $event)"
              />
            </div>
            <div class="fld-e" id="mp-cr-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('credit') }}</span>
            </div>
          </div>
          @if (current().company) {
            <p class="fld-h full">Vouchers go to {{ current().company }}.</p>
          }
        } @else {
          <div class="full">
            <div class="li" style="min-height: 52px">
              <span class="li-ic sm"><rp-icon name="sync" [size]="16" /></span>
              <span class="li-main">
                <span class="li-t wrap" id="mp-on-l">Send vouchers to the accounting package</span>
                <span class="li-s wrap"
                  >Postings from now on get a voucher each. Turning this off stops new vouchers;
                  those written are kept.</span
                >
              </span>
              <button
                type="button"
                class="toggle"
                role="switch"
                id="mp-on"
                aria-label="Send vouchers to the accounting package"
                [attr.aria-checked]="enabled()"
                (click)="enabled.set(!enabled()); error.set('')"
              ></button>
            </div>
          </div>
        }
      </div>
      @if (error()) {
        <div class="note tone-bad mt12" role="alert">
          <rp-icon name="alertc" [size]="17" />
          <div class="grow">{{ error() }}</div>
        </div>
      }
      <ng-container modal-foot>
        <button type="button" class="btn btn-sec" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        @if (event() && mapped()) {
          <button
            type="button"
            class="btn btn-ghost"
            id="mp-stop"
            [disabled]="busy()"
            (click)="stop()"
          >
            <span>Stop sending</span>
          </button>
        }
        <button
          type="button"
          class="btn btn-pri"
          id="mp-save"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="save()"
        >
          <span>{{ event() ? 'Save mapping' : 'Save' }}</span>
        </button>
      </ng-container>
    </rp-modal>
  `,
})
export class MappingForm implements OnInit {
  private readonly api = inject(VouchersApi);
  private readonly overlays = inject(Overlays);

  readonly current = input.required<Mappings>();
  /** One posting's ledgers; null for the company and transfers. */
  readonly event = input<AccountingEvent | null>(null);
  readonly closed = output<void>();
  readonly saved = output<Mappings>();
  /** The settings changed meanwhile (412): the page reloads them. */
  readonly stale = output<void>();

  protected readonly company = signal('');
  protected readonly debit = signal('');
  protected readonly credit = signal('');
  protected readonly enabled = signal(false);
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  private readonly shaking = signal(false);
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  private readonly row = computed(() =>
    this.current().events.find((e) => e.event === this.event()),
  );
  protected readonly mapped = computed(() => !!this.row()?.debitLedger);
  protected readonly title = computed(() =>
    this.event() ? `Mapping · ${this.row()?.label ?? ''}` : 'Accounting company',
  );
  protected readonly sub = computed(() => {
    const e = this.event();
    return e
      ? EVENT_CATEGORY[e]
      : 'The company in the accounting package, and whether vouchers are sent.';
  });

  ngOnInit() {
    const c = this.current();
    this.company.set(c.company ?? '');
    this.enabled.set(c.enabled);
    this.debit.set(this.row()?.debitLedger ?? '');
    this.credit.set(this.row()?.creditLedger ?? '');
  }

  protected err(f: Field) {
    return this.errors()[f] ?? '';
  }
  protected shook(f: Field) {
    return this.shaking() && !!this.errors()[f];
  }
  protected set(f: Field, e: Event) {
    ({ company: this.company, debit: this.debit, credit: this.credit })[f].set(
      (e.target as HTMLInputElement).value,
    );
    if (this.errors()[f]) this.errors.update((x) => ({ ...x, [f]: '' }));
    if (f !== 'company') this.errors.update((x) => ({ ...x, debit: '', credit: '' }));
    this.error.set('');
  }

  /** The mappings that stay, with this posting's ledgers replaced (or removed). */
  private body(remove = false): MappingsInput {
    const ev = this.event();
    const keep = this.current()
      .events.filter((e) => e.event !== ev && e.debitLedger && e.creditLedger)
      .map((e) => ({ event: e.event, debitLedger: e.debitLedger!, creditLedger: e.creditLedger! }));
    const mine =
      ev && !remove
        ? [{ event: ev, debitLedger: this.debit().trim(), creditLedger: this.credit().trim() }]
        : [];
    return {
      companyName: this.company().trim(),
      enabled: ev ? this.current().enabled : this.enabled(),
      mappings: [...keep, ...mine],
    };
  }

  protected async save() {
    if (this.busy()) return;
    const ev = this.event();
    const e: Partial<Record<Field, string>> = {};
    if (!LEDGER_NAME.test(this.company().trim())) e.company = translate('ACC.COMPANY');
    if (ev) {
      const d = this.debit().trim();
      const c = this.credit().trim();
      if (!LEDGER_NAME.test(d)) e.debit = translate('ACC.LEDGER');
      if (!LEDGER_NAME.test(c)) e.credit = translate('ACC.LEDGER');
      if (!e.debit && !e.credit && d.toLowerCase() === c.toLowerCase()) {
        e.credit = translate('ACC.LEDGER');
      }
    }
    this.errors.set(e);
    if (Object.values(e).some(Boolean)) {
      this.shaking.set(false);
      setTimeout(() => this.shaking.set(true));
      return;
    }
    const body = this.body();
    if (body.enabled && !body.mappings.length) {
      this.error.set(translate('ACC.MAPPING_NEEDED'));
      return;
    }
    const was = this.current().enabled;
    const ok = await this.overlays.confirm(
      ev
        ? {
            title: 'Save this mapping?',
            text: "New vouchers use it from now on. Vouchers already written aren't changed.",
            ok: 'Save mapping',
          }
        : {
            title: body.enabled && !was ? 'Turn transfers on?' : 'Save the accounting company?',
            text:
              body.enabled && !was
                ? 'A voucher is written for every mapped posting from now on and sent to the accounting package.'
                : !body.enabled && was
                  ? 'No new vouchers are written. Vouchers already written are kept.'
                  : 'New vouchers name this company. Vouchers already written aren’t changed.',
            ok: 'Save',
          },
    );
    if (!ok) return;
    await this.put(body, ev ? 'Mapping saved' : 'Accounting settings saved');
  }

  protected async stop() {
    const ev = this.event();
    if (!ev || this.busy()) return;
    const body = this.body(true);
    if (body.enabled && !body.mappings.length) {
      this.error.set(translate('ACC.MAPPING_NEEDED'));
      return;
    }
    const ok = await this.overlays.confirm({
      title: `Stop sending ${this.row()?.label.toLowerCase() ?? 'these postings'}?`,
      text: 'No voucher is written for these postings from now on. Vouchers already written are kept.',
      ok: 'Stop sending',
      tone: 'warn',
    });
    if (!ok) return;
    await this.put(body, 'Mapping removed');
  }

  private async put(body: MappingsInput, done: string) {
    this.busy.set(true);
    this.error.set('');
    try {
      const out = await this.api.saveMappings(this.current().version, body);
      const ev = this.event();
      this.overlays.toast(done, {
        sub: ev
          ? (out.events.find((x) => x.event === ev)?.label ?? '')
          : `${out.company ?? ''} · transfers ${out.enabled ? 'on' : 'off'}`,
      });
      this.saved.emit(out);
    } catch (x) {
      if (x instanceof ApiProblem && x.errors.length) {
        const f: Partial<Record<Field, string>> = {};
        for (const y of x.errors) {
          if (y.field === 'companyName') f.company = y.message;
          else if (y.field.startsWith('mappings') && this.event()) f.debit = y.message;
          else this.error.set(y.message);
        }
        this.errors.set(f);
      } else {
        this.error.set(x instanceof ApiProblem ? x.detail : translate('GEN.UNAVAILABLE'));
        if (x instanceof ApiProblem && (x.status === 412 || x.status === 428)) this.stale.emit();
      }
    } finally {
      this.busy.set(false);
    }
  }
}
