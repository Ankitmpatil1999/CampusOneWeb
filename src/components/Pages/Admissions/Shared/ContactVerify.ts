import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { translate } from '../../../Utils/translate';
import { cleanTyped, onlyDigits } from '../../../Utils/typing';
import type { ContactCodeSent } from '../admissions.api';
import { asProblem, problemText } from '../admissions.store';

/** Seconds before the code can be asked for again, unless the server says (otp.resendAfterSeconds). */
const RESEND_AFTER = 60;

/**
 * The primary contact's mobile, verified with a one-time code (client 2026-10-27: "the form can't be
 * submitted until the number is verified"): "Verify" sends a code to the saved mobile, the code
 * entered confirms it, and the number then shows "Verified". The same control on the family's form,
 * on the counsellor's (the parent reads the code out) and on an application in the console. The page
 * says how the code is sent and confirmed (it saves the form first when the number changed).
 */
@Component({
  selector: 'rp-contact-verify',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="fld pa-otp-f" [id]="fid()" [class.invalid]="!!shownError()">
    <span class="fld-l">{{ label() }}</span>
    @if (verified()) {
      <div class="row g8 wrap" style="min-height: 32px">
        <span>{{ mobile() || '—' }}</span>
        <span class="chip dot tone-ok" [id]="fid() + '-ok'">Verified</span>
      </div>
    } @else if (sent(); as s) {
      <span class="t-sm t-muted"
        >Code sent to <b>{{ s.sentTo }}</b
        >.{{ counsellor() ? ' Ask the family for it.' : '' }}</span
      >
      <div class="row g8 wrap">
        <div class="fld-in" style="width: 150px">
          <input
            [id]="fid() + '-code'"
            type="text"
            inputmode="numeric"
            maxlength="8"
            autocomplete="one-time-code"
            placeholder="Code"
            aria-label="One-time code"
            [attr.aria-describedby]="fid() + '-e'"
            [value]="code()"
            (input)="code.set(digits($event)); err.set('')"
            (keydown.enter)="$event.preventDefault(); $event.stopPropagation(); confirm()"
          />
        </div>
        <button
          type="button"
          class="btn btn-pri"
          [id]="fid() + '-confirm'"
          [class.is-busy]="busy() === 'confirm'"
          (click)="confirm()"
        >
          <rp-icon name="shieldck" [size]="16" /><span>Confirm</span>
        </button>
        <button
          type="button"
          class="linkbtn pa-resend"
          [disabled]="left() > 0 || !!busy()"
          (click)="send()"
        >
          {{ left() ? 'Resend code in ' + clock(left()) : 'Resend code' }}
        </button>
      </div>
      @if (s.testCode; as t) {
        <div class="demo-hint">
          <rp-icon name="sparkles" [size]="14" /><span>Test mode — the code</span> <b>{{ t }}</b>
        </div>
      }
    } @else {
      <div class="row g8 wrap" style="min-height: 32px">
        <span>{{ mobile() || '—' }}</span>
        <span class="chip dot tone-warn" [id]="fid() + '-no'">Not verified</span>
        <button
          type="button"
          class="btn btn-sec btn-sm"
          [id]="fid() + '-send'"
          [class.is-busy]="busy() === 'send'"
          [disabled]="!!busy()"
          (click)="send()"
        >
          <rp-icon name="send" [size]="15" /><span>Verify</span>
        </button>
      </div>
    }
    <div class="fld-e" [id]="fid() + '-e'" role="alert">
      <rp-icon name="alertc" [size]="14" /><span>{{ shownError() }}</span>
    </div>
  </div>`,
})
export class ContactVerify {
  private readonly overlays = inject(Overlays);
  readonly fid = input('pa-cv');
  readonly label = input('Primary contact’s mobile');
  /** The number as shown ("+91 98765 12340"). */
  readonly mobile = input('');
  readonly verified = input(false);
  /** Sends a code to the saved mobile; null when the page has already said why it couldn't. */
  readonly sendCode = input.required<() => Promise<ContactCodeSent | null>>();
  /** Confirms the code (throws the server's refusal). */
  readonly confirmCode = input.required<(challengeId: string, otp: string) => Promise<unknown>>();
  /** Office staff fill the form: the family reads the code out. */
  readonly counsellor = input(false);
  /** A refusal the page has for it (a submission refused as not verified). */
  readonly error = input<string | null | undefined>('');

  protected readonly sent = signal<ContactCodeSent | null>(null);
  protected readonly code = signal('');
  protected readonly err = signal('');
  protected readonly busy = signal<'send' | 'confirm' | null>(null);
  protected readonly left = signal(0);
  protected readonly shownError = computed(() => this.err() || this.error() || '');
  private sentAt = 0;

  constructor() {
    // Another number (or another person as the primary contact): a code sent before is for the old one.
    effect(() => {
      this.mobile();
      untracked(() => {
        this.sent.set(null);
        this.code.set('');
        this.err.set('');
      });
    });
    const timer = setInterval(() => {
      const s = this.sent();
      if (!s) return;
      const wait = s.resendAfterSeconds ?? RESEND_AFTER;
      this.left.set(Math.max(0, wait - Math.round((Date.now() - this.sentAt) / 1000)));
    }, 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected digits(e: Event) {
    return cleanTyped(e.target as HTMLInputElement, onlyDigits);
  }
  protected clock(s: number) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  protected async send() {
    if (this.busy()) return;
    this.busy.set('send');
    this.err.set('');
    try {
      const s = await this.sendCode()();
      if (!s) return;
      this.sent.set(s);
      this.sentAt = Date.now();
      this.left.set(s.resendAfterSeconds ?? RESEND_AFTER);
      this.code.set('');
      this.overlays.toast('Code sent', { tone: 'info', sub: `To ${s.sentTo}` });
    } catch (e) {
      this.err.set(problemText(e));
    } finally {
      this.busy.set(null);
    }
  }

  protected async confirm() {
    const s = this.sent();
    if (!s || this.busy()) return;
    const otp = this.code().trim();
    if (!otp) return this.err.set(translate('VALIDATION.REQUIRED'));
    if (!/^\d{4,8}$/.test(otp)) return this.err.set(translate('VALIDATION.OTP'));
    this.busy.set('confirm');
    try {
      await this.confirmCode()(s.challengeId, otp);
      this.sent.set(null);
      this.code.set('');
      this.overlays.toast('Mobile number verified', { sub: this.mobile() || undefined });
    } catch (e) {
      const p = asProblem(e);
      // Expired, used, or too many wrong codes: a new code is needed.
      if (p.code !== 'AUTH.OTP_INVALID' && p.code.startsWith('AUTH.OTP_')) this.sent.set(null);
      this.err.set(p.errors[0]?.message ?? problemText(p));
    } finally {
      this.busy.set(null);
    }
  }
}
