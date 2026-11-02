import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { newIdempotencyKey } from '../../../Utils/ids';
import { PATTERNS } from '../../../Utils/patterns';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { plural } from '../Fees/fee-format';
import { TextField } from '../Applications/AppFields';
import { AdmissionLinksApi, type AdmissionLink } from './admission-links.api';

/**
 * E-mail the admission link (prototype cp.aq.mail / cp.aq.send; INS-029): up to 20 addresses,
 * separated by commas. The e-mail carries the link to the public form with a short note from the
 * institution.
 */
@Component({
  selector: 'rp-admission-link-email',
  imports: [Icon, Modal, TextField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      title="E-mail the admission link"
      [sub]="(yearLabel() ? yearLabel() + ' · ' : '') + 'the link to the public form is sent'"
      icon="mail"
      cls="cm-m"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="qe-form">
        <rp-tf
          fid="qe-to"
          label="To"
          type="email"
          [req]="true"
          placeholder="name@example.com"
          hint="Separate several addresses with commas (up to 20)."
          [error]="toErr()"
          [value]="to()"
          (valueChange)="to.set($event); toErr.set('')"
        />
        <div class="fld">
          <span class="fld-l">Message</span>
          <div class="card flat pad t-sm t-ink2" style="line-height: 1.55" id="qe-msg">
            Admissions are open at {{ institution() }}. The e-mail carries the link to apply online:
            <span class="t-mono t-xs" style="overflow-wrap: anywhere">{{ link().url }}</span>
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
          id="qe-send"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="send()"
        >
          <rp-icon name="send" [size]="17" /><span>Send</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class AdmissionLinkEmail {
  private readonly api = inject(AdmissionLinksApi);
  private readonly overlays = inject(Overlays);

  readonly link = input.required<AdmissionLink>();
  readonly institution = input('the institution');
  readonly yearLabel = input('');
  readonly closed = output<void>();
  readonly sent = output<number>();

  protected readonly to = signal('');
  protected readonly toErr = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  private readonly key = newIdempotencyKey();

  protected async send() {
    this.error.set('');
    const list = this.to()
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
    if (!list.length) {
      this.toErr.set('Enter at least one e-mail address');
      return;
    }
    const bad = list.find((x) => !PATTERNS.email.test(x));
    if (bad) {
      this.toErr.set(`“${bad}” isn't a valid e-mail address`);
      return;
    }
    if (list.length > 20) {
      this.toErr.set('Send to 20 addresses at most');
      return;
    }
    this.busy.set(true);
    try {
      const out = await this.api.email(this.link().id, [...new Set(list)], this.key);
      if (out.sent) {
        this.overlays.toast('Link e-mailed', { sub: plural(out.sent, 'recipient') });
      } else {
        this.overlays.toast('No e-mail was sent', {
          tone: 'warn',
          sub: 'Sending e-mail isn’t set up on this server yet.',
        });
      }
      this.sent.emit(out.sent);
    } catch (x) {
      if (x instanceof ApiProblem && x.errors.length) this.toErr.set(x.errors[0]!.message);
      else this.error.set(x instanceof ApiProblem ? x.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      this.busy.set(false);
    }
  }
}
