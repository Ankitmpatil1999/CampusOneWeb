import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Countdown } from '../../../Shared/Countdown';
import { Icon } from '../../../Shared/Icon';
import { Modal } from '../../../Shared/Overlays';
import { purposeOf, secondsLeft } from './reader-format';
import { Router } from '@angular/router';
import { cardReader } from '../../../Utils/card-reader';
import type { PairingCode, Terminal } from './readers.api';

/**
 * The pairing drawer (prototype pairingDrawer; INS-033, CR-10, OI-IDN-45): the one-time code in
 * large type with the time it has left, the steps on the device, and — once it has expired — a
 * button for a new code. The code is shown once; closing the drawer forgets it.
 */
@Component({
  selector: 'rp-reader-pairing',
  imports: [Countdown, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="'Pair ' + terminal().name"
      [sub]="sub()"
      icon="key"
      [drawer]="true"
      [slim]="true"
      (closed)="closed.emit()"
    >
      <div class="stack g16">
        <div class="cp-pair" id="rd-pair">
          @if (left() > 0) {
            <span class="eyebrow">Pairing code</span>
            <div class="cp-pcode t-mono" id="rd-code">{{ code().code }}</div>
            <div class="row g12">
              <rp-countdown [total]="total()" [left]="left()" [size]="48" [stroke]="3" />
              <span class="t-sm t-muted" style="text-align: left"
                >Valid for {{ minutes() }} minutes and for this reader only. It works once.</span
              >
            </div>
          } @else {
            <span class="confirm-ic warn"><rp-icon name="hourglass" [size]="22" /></span>
            <b>The pairing code has expired</b>
            <span class="t-sm t-muted">Issue a new one to pair the device.</span>
            <button
              type="button"
              class="btn btn-sec"
              id="rd-renew"
              [disabled]="busy()"
              (click)="renew.emit()"
            >
              <rp-icon name="refresh" [size]="17" /><span>Issue a new code</span>
            </button>
          }
        </div>
        <ol class="cp-ol">
          <li>On the {{ device() }}, open <b>Settings → Pair with CampusOne</b>.</li>
          <li>
            Enter the code. The platform issues a secret that the device stores, so its identity
            can't simply be copied to another machine (OI-IDN-45).
          </li>
          <li>The {{ device() }} restarts showing “{{ purpose() }}”.</li>
        </ol>
      </div>
      @if (reader() && left() > 0) {
        <div class="note tone-info" style="margin-top: 12px">
          <rp-icon name="nfc" [size]="17" />
          <div class="grow">
            This computer runs CampusOne Card Reader with a USB reader. Choose
            <b>Pair this computer</b> to use it as this reader.
          </div>
        </div>
      }
      <div modal-foot class="row g8">
        @if (reader() && left() > 0) {
          <button type="button" class="btn btn-pri" id="rd-pair-here" (click)="pairHere()">
            <rp-icon name="nfc" [size]="17" /><span>Pair this computer</span>
          </button>
        }
        <button type="button" class="btn btn-sec" (click)="closed.emit()">
          <span>Close</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class ReaderPairing {
  readonly terminal = input.required<Terminal>();
  readonly code = input.required<PairingCode>();
  /** When the code was received: its full validity is drawn as the countdown ring. */
  readonly issuedAt = input<number>(Date.now());
  readonly busy = input(false);
  readonly closed = output<void>();
  readonly renew = output<void>();
  /** CampusOne Card Reader is running on this computer (client 2026-10-08). */
  protected readonly reader = cardReader();
  private readonly router = inject(Router);

  protected pairHere() {
    void this.router.navigate(['/terminal'], { queryParams: { code: this.code().code } });
  }

  private readonly now = signal(Date.now());
  protected readonly purpose = computed(() => purposeOf(this.terminal().purpose).l);
  protected readonly device = computed(() =>
    this.terminal().purpose === 'POS' ? 'counter' : 'reader',
  );
  protected readonly sub = computed(() =>
    [this.purpose(), this.terminal().location].filter(Boolean).join(' · '),
  );
  protected readonly total = computed(() =>
    Math.max(1, secondsLeft(this.code().expiresAt, this.issuedAt())),
  );
  protected readonly minutes = computed(() => Math.max(1, Math.round(this.total() / 60)));
  protected readonly left = computed(() => secondsLeft(this.code().expiresAt, this.now()));

  constructor() {
    const t = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(t));
  }
}
