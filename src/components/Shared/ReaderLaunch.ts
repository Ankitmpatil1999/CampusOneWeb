import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { ensureCardReader } from '../Utils/card-reader';
import { Icon } from './Icon';

/**
 * "Open card reader" (client 2026-10-08): starts CampusOne Card Reader on this computer from the page
 * and waits for it; the page switches to the reader by itself once it runs (card-reader's check).
 */
@Component({
  selector: 'rp-reader-launch',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <button
      type="button"
      [class]="'btn ' + (primary() ? 'btn-pri' : 'btn-sec') + (block() ? ' btn-block' : '')"
      [class.is-busy]="state() === 'starting'"
      [disabled]="state() === 'starting'"
      (click)="open()"
    >
      <rp-icon name="nfc" [size]="17" /><span>{{
        state() === 'starting' ? 'Starting the card reader…' : 'Open card reader'
      }}</span>
    </button>
    @if (state() === 'failed') {
      <p class="t-xs" style="color: var(--bad); margin: 6px 0 0" role="alert">
        CampusOne Card Reader didn't start. Install it on this computer, or allow the browser to open
        it, then try again.
      </p>
    }
  `,
})
export class ReaderLaunch {
  readonly primary = input(false);
  readonly block = input(false);
  protected readonly state = signal<'idle' | 'starting' | 'failed'>('idle');

  protected async open() {
    this.state.set('starting');
    this.state.set((await ensureCardReader()) ? 'idle' : 'failed');
  }
}
