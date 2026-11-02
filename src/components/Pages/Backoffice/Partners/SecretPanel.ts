import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDateTime } from '../../../Utils/format';
import { copyText } from '../../../Utils/clipboard';

/** What the panel shows: the client and the secret the API answered with (INT-002 / INT-004). */
export interface ShownSecret {
  readonly clientId: string;
  readonly secret: string;
  /** A rotation (INT-004) rather than a new client (INT-002). */
  readonly rotated: boolean;
  /** After a rotation: until when the previous secret still works (null: it stopped now). */
  readonly previousValidUntil: string | null;
}

/**
 * The prototype's one-time secret panel (showSecret): the client id, the secret with a copy button,
 * and a confirmation that it has been stored before "Done". It can't be dismissed any other way.
 * The secret lives only in this panel's input: the page drops it when the panel closes, and it is
 * never stored, logged or shown again.
 */
@Component({
  selector: 'rp-secret-panel',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="shown().rotated ? 'New client secret' : 'Client created — copy the secret now'"
      sub="This is the only time the secret is shown. CampusOne keeps it encrypted and never shows it again."
      icon="key"
      [dismiss]="false"
      (closed)="done()"
    >
      <div class="stack g12">
        <dl class="kv">
          <dt>Client id</dt>
          <dd>
            <span class="t-mono">{{ shown().clientId }}</span>
          </dd>
        </dl>
        <div>
          <div class="eyebrow" style="margin-bottom: 6px">Client secret</div>
          <div class="ob-secret" id="ob-secret">{{ shown().secret }}</div>
          <div class="mt8">
            <button type="button" class="btn btn-sec btn-sm" id="ob-secret-copy" (click)="copy()">
              <rp-icon name="copy" [size]="15" /><span>Copy secret</span>
            </button>
          </div>
        </div>
        @if (shown().rotated) {
          <div class="note tone-warn">
            <rp-icon name="alert" [size]="17" />
            <div class="grow">
              @if (shown().previousValidUntil; as until) {
                The old secret keeps working until <b>{{ dt(until) }}</b> so the partner can switch
                without failed calls; after that only the new one works.
              } @else {
                The old secret stopped working immediately.
              }
              Give the new secret to the partner through the agreed secure channel.
            </div>
          </div>
        }
        <label class="chk"
          ><input
            type="checkbox"
            id="ob-sec-ok"
            [checked]="stored()"
            (change)="tick($event)"
          /><span>I've stored the secret somewhere safe</span></label
        >
        <div class="fld" [class.invalid]="error()">
          <div class="fld-e" id="ob-sec-ok-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ error() }}</span>
          </div>
        </div>
      </div>
      <ng-container modal-foot>
        <button type="button" class="btn btn-pri" id="ob-sec-done" (click)="done()">
          <span>Done</span>
        </button>
      </ng-container>
    </rp-modal>
  `,
})
export class SecretPanel {
  private readonly overlays = inject(Overlays);
  readonly shown = input.required<ShownSecret>();
  /** The operator confirmed; the page drops the secret. */
  readonly closed = output<void>();

  protected readonly stored = signal(false);
  protected readonly error = signal('');

  protected tick(e: Event) {
    this.stored.set((e.target as HTMLInputElement).checked);
    this.error.set('');
  }

  protected done() {
    if (!this.stored()) {
      this.error.set("Confirm you've stored the secret — it can't be shown again");
      return;
    }
    this.closed.emit();
  }

  protected async copy() {
    try {
      await copyText(this.shown().secret);
      this.overlays.toast('Secret copied', { sub: 'Paste it into the partner’s secure channel' });
    } catch {
      this.overlays.toast("Couldn't copy", {
        sub: 'Select the secret and copy it by hand.',
        tone: 'warn',
      });
    }
  }

  protected dt(v: string) {
    return formatDateTime(v);
  }
}
