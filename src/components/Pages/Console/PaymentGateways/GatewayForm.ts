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
import { copyText } from '../../../Utils/clipboard';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { GatewaysApi, type GatewayInput, type PaymentGatewayView } from './gateways.api';

type Field = 'label' | 'keyId' | 'keySecret' | 'webhookSecret' | 'merchantId';
const FIELDS: readonly Field[] = ['label', 'keyId', 'keySecret', 'webhookSecret', 'merchantId'];

/**
 * Add a payment gateway account or change one (INS-039, INS-040; client 2026-10-09). The keys are
 * sent once and stored encrypted; they are never shown again — when changing, an empty secret
 * keeps the one saved. The webhook address to enter in the gateway dashboard is shown with a copy
 * button.
 */
@Component({
  selector: 'rp-gateway-form',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="gateway() ? 'Change ' + gateway()!.label : 'Add a payment gateway'"
      [sub]="
        gateway()
          ? 'Leave a secret empty to keep the one saved.'
          : 'The keys are stored encrypted and never shown again.'
      "
      [icon]="gateway() ? 'edit' : 'card'"
      [drawer]="true"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="pg-form">
        <div class="c-form">
          <div class="fld">
            <label class="fld-l" for="pg-provider">Gateway</label>
            <div class="fld-in">
              <input id="pg-provider" type="text" [value]="providerName()" disabled />
            </div>
          </div>
          <div class="fld" [class.invalid]="err('label')">
            <label class="fld-l" for="pg-label">Name<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="pg-label"
                type="text"
                maxlength="80"
                autocomplete="off"
                placeholder="e.g. School fees account"
                aria-describedby="pg-label-e"
                [value]="label()"
                (input)="label.set(val($event)); clear('label')"
              />
            </div>
            <div class="fld-e" id="pg-label-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('label') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('keyId')">
            <label class="fld-l" for="pg-key"
              >Key ID
              @if (!gateway()) {
                <span class="req">*</span>
              }
            </label>
            <div class="fld-in">
              <input
                id="pg-key"
                type="text"
                maxlength="64"
                autocomplete="off"
                spellcheck="false"
                translate="no"
                [placeholder]="
                  gateway()
                    ? gateway()!.keyIdHint + ' — leave empty to keep'
                    : 'rzp_test_… or rzp_live_…'
                "
                aria-describedby="pg-key-e"
                [value]="keyId()"
                (input)="keyId.set(val($event)); clear('keyId')"
              />
            </div>
            <div class="fld-e" id="pg-key-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('keyId') }}</span>
            </div>
            <div class="fld-h">Razorpay dashboard → Account &amp; Settings → API keys</div>
          </div>
          <div class="fld" [class.invalid]="err('keySecret')">
            <label class="fld-l" for="pg-secret"
              >Key secret
              @if (!gateway()) {
                <span class="req">*</span>
              }
            </label>
            <div class="fld-in">
              <input
                id="pg-secret"
                type="password"
                maxlength="128"
                autocomplete="new-password"
                [placeholder]="gateway() ? 'Saved — leave empty to keep' : ''"
                aria-describedby="pg-secret-e"
                [value]="keySecret()"
                (input)="keySecret.set(val($event)); clear('keySecret')"
              />
            </div>
            <div class="fld-e" id="pg-secret-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('keySecret') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('webhookSecret')">
            <label class="fld-l" for="pg-hook">Webhook secret</label>
            <div class="fld-in">
              <input
                id="pg-hook"
                type="password"
                maxlength="128"
                autocomplete="new-password"
                [placeholder]="
                  gateway()?.hasWebhookSecret ? 'Saved — leave empty to keep' : 'Optional'
                "
                aria-describedby="pg-hook-e"
                [value]="webhookSecret()"
                (input)="webhookSecret.set(val($event)); clear('webhookSecret')"
              />
            </div>
            <div class="fld-e" id="pg-hook-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('webhookSecret') }}</span>
            </div>
            <div class="fld-h">
              The same text as the secret of the webhook you add in the gateway dashboard
            </div>
          </div>
          <div class="fld" [class.invalid]="err('merchantId')">
            <label class="fld-l" for="pg-mid">Merchant ID</label>
            <div class="fld-in">
              <input
                id="pg-mid"
                type="text"
                maxlength="64"
                autocomplete="off"
                translate="no"
                [placeholder]="
                  gateway()?.hasMerchantId ? 'Saved — leave empty to keep' : 'Optional'
                "
                [value]="merchantId()"
                (input)="merchantId.set(val($event)); clear('merchantId')"
              />
            </div>
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('merchantId') }}</span>
            </div>
          </div>
        </div>
        @if (!gateway()) {
          <label class="chk"
            ><input
              type="checkbox"
              id="pg-default"
              [checked]="makeDefault()"
              (change)="makeDefault.set(checked($event))"
            /><span>Use it for new online payments (the default)</span></label
          >
        }
        @if (gateway(); as g) {
          <div class="note tone-info">
            <rp-icon name="link" [size]="17" />
            <div class="grow">
              <b>Webhook address</b> — add it in the gateway dashboard (Settings → Webhooks, events
              payment.captured and order.paid) with the webhook secret above:
              <div
                class="t-mono t-xs"
                style="margin-top: 4px; word-break: break-all"
                translate="no"
              >
                {{ g.webhookUrl }}
              </div>
            </div>
            <button type="button" class="btn btn-sec btn-sm" (click)="copyHook(g.webhookUrl)">
              <rp-icon name="copy" [size]="15" /><span>Copy</span>
            </button>
          </div>
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
          id="pg-save"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="save()"
        >
          <rp-icon name="check" [size]="17" /><span>{{
            gateway() ? 'Save changes' : 'Add gateway'
          }}</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class GatewayForm implements OnInit {
  private readonly api = inject(GatewaysApi);
  private readonly overlays = inject(Overlays);

  /** The gateway to change; none adds one. */
  readonly gateway = input<PaymentGatewayView | null>(null);
  readonly providerName = input('Razorpay');
  readonly closed = output<void>();
  readonly saved = output<PaymentGatewayView>();

  protected readonly label = signal('');
  protected readonly keyId = signal('');
  protected readonly keySecret = signal('');
  protected readonly webhookSecret = signal('');
  protected readonly merchantId = signal('');
  protected readonly makeDefault = signal(false);
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  ngOnInit() {
    const g = this.gateway();
    if (g) this.label.set(g.label);
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

  protected async copyHook(url: string) {
    try {
      await copyText(url);
      this.overlays.toast('Webhook address copied');
    } catch {
      this.overlays.toast("Couldn't copy", {
        sub: 'Select the address and copy it.',
        tone: 'warn',
      });
    }
  }

  protected async save() {
    if (this.busy()) return;
    const g = this.gateway();
    const required = translate('VALIDATION.REQUIRED');
    const e: Partial<Record<Field, string>> = {};
    if (!this.label().trim()) e.label = required;
    if (!g && !this.keyId().trim()) e.keyId = required;
    if (!g && !this.keySecret().trim()) e.keySecret = required;
    this.errors.set(e);
    this.error.set('');
    if (Object.keys(e).length) return;
    const body: GatewayInput = { label: this.label().trim() };
    if (this.keyId().trim()) body.keyId = this.keyId().trim();
    if (this.keySecret().trim()) body.keySecret = this.keySecret().trim();
    if (this.webhookSecret().trim()) body.webhookSecret = this.webhookSecret().trim();
    if (this.merchantId().trim()) body.merchantId = this.merchantId().trim();
    if (!g) {
      body.provider = 'RAZORPAY';
      if (this.makeDefault()) body.isDefault = true;
    }
    this.busy.set(true);
    try {
      const out = g ? await this.api.change(g, body) : await this.api.add(body);
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
