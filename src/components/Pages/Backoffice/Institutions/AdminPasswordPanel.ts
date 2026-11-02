import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { copyText } from '../../../Utils/clipboard';

/** What the panel shows after INS-002 made the administrator's account (client 2026-10-07). */
export interface ShownAdminPassword {
  readonly institution: string;
  readonly identifier: string;
  readonly email: string;
  readonly password: string;
}

/**
 * The administrator's temporary password, shown once: e-mail isn't integrated yet, so the operator
 * passes it on. Modelled on the partner secret panel — a copy button and a confirmation before
 * "Done", no other way to close it. The password lives only in this panel's input; the API keeps
 * only its hash and never answers with it again. It is changed at the first sign-in.
 */
@Component({
  selector: 'rp-admin-password-panel',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      title="Institution registered — copy the administrator's password now"
      sub="This is the only time the password is shown. CampusOne keeps only a one-way hash of it."
      icon="key"
      [dismiss]="false"
      (closed)="done()"
    >
      <div class="stack g12">
        <dl class="kv">
          <dt>Institution</dt>
          <dd>
            {{ shown().institution }} ·
            <span class="t-mono" translate="no">{{ shown().identifier }}</span>
          </dd>
          <dt>Administrator</dt>
          <dd>
            <span class="t-mono" translate="no">{{ shown().email }}</span>
          </dd>
          <dt>Sign in at</dt>
          <dd>
            <span class="t-mono" translate="no">{{ signinUrl }}</span>
          </dd>
        </dl>
        <div>
          <div class="eyebrow" style="margin-bottom: 6px">Temporary password</div>
          <div class="ob-secret" id="ob-admin-pw" translate="no">{{ shown().password }}</div>
          <div class="mt8">
            <button type="button" class="btn btn-sec btn-sm" id="ob-admin-pw-copy" (click)="copy()">
              <rp-icon name="copy" [size]="15" /><span>Copy password</span>
            </button>
          </div>
        </div>
        <div class="note tone-info">
          <rp-icon name="info" [size]="17" />
          <div class="grow">
            Give the e-mail and this password to the administrator in person or by phone. They sign
            in on the customer site with a code sent to their mobile, and choose their own password
            at the first sign-in.
          </div>
        </div>
        <label class="chk"
          ><input
            type="checkbox"
            id="ob-admin-pw-ok"
            [checked]="noted()"
            (change)="tick($event)"
          /><span>I've noted the password</span></label
        >
        <div class="fld" [class.invalid]="error()">
          <div class="fld-e" id="ob-admin-pw-ok-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ error() }}</span>
          </div>
        </div>
      </div>
      <ng-container modal-foot>
        <button type="button" class="btn btn-pri" id="ob-admin-pw-done" (click)="done()">
          <span>Done</span>
        </button>
      </ng-container>
    </rp-modal>
  `,
})
export class AdminPasswordPanel {
  private readonly overlays = inject(Overlays);
  readonly shown = input.required<ShownAdminPassword>();
  /** The operator confirmed; the page drops the password. */
  readonly closed = output<void>();

  protected readonly signinUrl = `${globalThis.location?.origin ?? ''}/portal/signin`;
  protected readonly noted = signal(false);
  protected readonly error = signal('');

  protected tick(e: Event) {
    this.noted.set((e.target as HTMLInputElement).checked);
    this.error.set('');
  }

  protected done() {
    if (!this.noted()) {
      this.error.set("Confirm you've noted the password — it can't be shown again");
      return;
    }
    this.closed.emit();
  }

  protected async copy() {
    try {
      await copyText(this.shown().password);
      this.overlays.toast('Password copied', { sub: 'Give it to the administrator' });
    } catch {
      this.overlays.toast("Couldn't copy", {
        sub: 'Select the password and copy it by hand.',
        tone: 'warn',
      });
    }
  }
}
