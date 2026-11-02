import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { copyText } from '../../../Utils/clipboard';

/** A new staff account and its temporary password (IDN-053 / IDN-051; client 2026-10-07). */
export interface ShownStaffPassword {
  readonly name: string;
  readonly email: string;
  readonly employeeNo: string;
  readonly temporaryPassword: string;
}

/**
 * New staff members' temporary passwords, shown once: e-mail isn't integrated yet, so the
 * administrator passes them on. Like the back office's administrator panel — copy buttons and a
 * confirmation before "Done", no other way to close it. The passwords live only in this panel's
 * input; the API keeps only their hashes and never answers with them again. Each is changed at the
 * first sign-in.
 */
@Component({
  selector: 'rp-staff-passwords-panel',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="
        items().length === 1
          ? 'Staff onboarded — copy the temporary password now'
          : 'Staff onboarded — copy the temporary passwords now'
      "
      sub="This is the only time they are shown. CampusOne keeps only a one-way hash of each password."
      icon="key"
      [dismiss]="false"
      (closed)="done()"
    >
      <div class="stack g12">
        <div class="stack g8" id="ob-staff-pw">
          @for (x of items(); track x.email) {
            <div class="row g8" style="align-items: center">
              <div class="grow">
                <b>{{ x.name }}</b>
                <small class="t-xs t-muted" style="display: block"
                  ><span translate="no">{{ x.email }}</span> ·
                  <span translate="no">{{ x.employeeNo }}</span></small
                >
                <div class="ob-secret" translate="no">{{ x.temporaryPassword }}</div>
              </div>
              <button
                type="button"
                class="btn btn-sec btn-sm"
                [attr.aria-label]="'Copy the password of ' + x.name"
                (click)="copy(x.temporaryPassword)"
              >
                <rp-icon name="copy" [size]="15" /><span>Copy</span>
              </button>
            </div>
          }
        </div>
        @if (items().length > 1) {
          <div>
            <button
              type="button"
              class="btn btn-sec btn-sm"
              id="ob-staff-pw-all"
              (click)="copyAll()"
            >
              <rp-icon name="copy" [size]="15" /><span>Copy all</span>
            </button>
          </div>
        }
        <div class="note tone-info">
          <rp-icon name="info" [size]="17" />
          <div class="grow">
            Give each person their e-mail and password in person or by phone. They sign in to the
            console with a code sent to their mobile, and choose their own password at the first
            sign-in.
          </div>
        </div>
        <label class="chk"
          ><input
            type="checkbox"
            id="ob-staff-pw-ok"
            [checked]="noted()"
            (change)="tick($event)"
          /><span>I've noted the passwords</span></label
        >
        <div class="fld" [class.invalid]="error()">
          <div class="fld-e" id="ob-staff-pw-ok-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ error() }}</span>
          </div>
        </div>
      </div>
      <ng-container modal-foot>
        <button type="button" class="btn btn-pri" id="ob-staff-pw-done" (click)="done()">
          <span>Done</span>
        </button>
      </ng-container>
    </rp-modal>
  `,
})
export class StaffPasswordsPanel {
  private readonly overlays = inject(Overlays);
  readonly items = input.required<readonly ShownStaffPassword[]>();
  /** The administrator confirmed; the page drops the passwords. */
  readonly closed = output<void>();

  protected readonly noted = signal(false);
  protected readonly error = signal('');

  protected tick(e: Event) {
    this.noted.set((e.target as HTMLInputElement).checked);
    this.error.set('');
  }

  protected done() {
    if (!this.noted()) {
      this.error.set("Confirm you've noted the passwords — they can't be shown again");
      return;
    }
    this.closed.emit();
  }

  protected copy(password: string) {
    return this.copyText(password, 'Password copied');
  }

  protected copyAll() {
    const lines = this.items().map(
      (x) => `${x.name}\t${x.email}\t${x.employeeNo}\t${x.temporaryPassword}`,
    );
    return this.copyText(lines.join('\n'), 'Passwords copied');
  }

  private async copyText(text: string, done: string) {
    try {
      await copyText(text);
      this.overlays.toast(done, { sub: 'Give each person their own password' });
    } catch {
      this.overlays.toast("Couldn't copy", {
        sub: 'Select the password and copy it by hand.',
        tone: 'warn',
      });
    }
  }
}
