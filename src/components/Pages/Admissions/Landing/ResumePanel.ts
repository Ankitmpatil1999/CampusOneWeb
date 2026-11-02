import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { PATTERNS } from '../../../Utils/patterns';
import { translate } from '../../../Utils/translate';
import { cleanTyped, onlyDigits } from '../../../Utils/typing';
import { AdmissionsApi, type ResumeMatch, type ResumeSent } from '../admissions.api';
import { STATUS, asProblem, dshort, keepToken, problemText, yearLabel } from '../admissions.store';
import { CountryCode } from '../Form/CardUploads';
import { joinMobile } from '../Form/form.state';
import { PaField } from '../Shared/AdmissionsUi';

type Stage = 'find' | 'otp' | 'pick' | 'none';

/** Seconds before the code can be asked for again (limits register otp.resendAfterSeconds). */
const RESEND_AFTER = 60;
const STEPS = 8;

/**
 * "Resume an application" (prototype resumePanel; ADM-002/003): the primary contact's mobile
 * (client 2026-10-12), a one-time code to it, then the family's
 * applications — masked until the code is verified (RNG-GOV-007) — and one to continue.
 */
@Component({
  selector: 'rp-pa-resume',
  imports: [CountryCode, Icon, PaField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<section class="card pa-resume" id="pa-resume" #panel>
    <div class="pa-resume-h">
      <span class="pa-sic"><rp-icon name="history" [size]="20" /></span>
      <div class="grow">
        <h2>Resume an application</h2>
        <p>
          <rp-icon name="lock" [size]="12" /> For your privacy we show only a masked summary until
          you enter the one-time code sent to the mobile number on the application.
        </p>
      </div>
      <button type="button" class="x-btn" aria-label="Close" (click)="closed.emit()">
        <rp-icon name="x" [size]="18" />
      </button>
    </div>
    @switch (stage()) {
      @case ('find') {
        <div class="pa-res-f">
          <rp-pa-fld
            fid="pa-rq"
            label="Primary contact's mobile number"
            [req]="true"
            hint="The mobile number of the primary contact given on the application. The one-time code is sent to it."
            [error]="errors()['pa-rq']"
          >
            <rp-pa-cc
              fid="pa-rq-cc"
              [value]="cc()"
              what="the primary contact's mobile"
              (picked)="cc.set($event); clear('pa-rq')"
            />
            <input
              #q
              id="pa-rq"
              name="pa-rq"
              type="text"
              inputmode="numeric"
              [attr.maxlength]="cc() === '+91' ? 10 : 12"
              autocomplete="tel-national"
              [placeholder]="
                cc() === '+91' ? '10-digit mobile number' : 'Number without the country code'
              "
              aria-describedby="pa-rq-e"
              [value]="rq()"
              (input)="rq.set(digits($event)); clear('pa-rq')"
              (keydown.enter)="$event.preventDefault(); find()"
            />
          </rp-pa-fld>
          <div class="row g8 wrap pa-res-a">
            <button
              type="button"
              class="btn btn-pri"
              id="pa-rfind"
              [class.is-busy]="busy()"
              (click)="find()"
            >
              <rp-icon name="search" [size]="17" /><span>Find my application</span>
            </button>
            <button type="button" class="btn btn-ghost" (click)="closed.emit()">
              <span>Cancel</span>
            </button>
          </div>
        </div>
      }
      @case ('otp') {
        <div class="pa-otp">
          <p>
            We've sent a one-time code to <b>{{ sent()?.sentTo }}</b
            >. Enter it to open the application.
          </p>
          <rp-pa-fld fid="pa-otp" label="One-time code" cls="pa-otp-f" [error]="errors()['pa-otp']">
            <input
              #otp
              id="pa-otp"
              name="pa-otp"
              type="text"
              inputmode="numeric"
              maxlength="8"
              autocomplete="one-time-code"
              placeholder="Code"
              aria-describedby="pa-otp-e"
              [value]="code()"
              (input)="code.set(value($event)); clear('pa-otp')"
              (keydown.enter)="$event.preventDefault(); verify()"
            />
          </rp-pa-fld>
          <div class="row g8 wrap pa-res-a">
            <button
              type="button"
              class="btn btn-pri"
              id="pa-rverify"
              [class.is-busy]="busy()"
              (click)="verify()"
            >
              <rp-icon name="shieldck" [size]="17" /><span>Verify and continue</span>
            </button>
            <button
              type="button"
              class="linkbtn pa-resend"
              [disabled]="left() > 0"
              (click)="resend()"
            >
              {{ left() ? 'Resend code in ' + clock(left()) : 'Resend code' }}
            </button>
            <button type="button" class="btn btn-ghost" (click)="closed.emit()">
              <span>Cancel</span>
            </button>
          </div>
          @if (sent()?.testCode; as t) {
            <div class="demo-hint">
              <rp-icon name="sparkles" [size]="14" /><span>Test mode — your code</span>
              <b>{{ t }}</b>
            </div>
          }
        </div>
      }
      @case ('pick') {
        <p class="pa-muted">
          We found {{ matches().length }} applications. Choose the one you'd like to open.
        </p>
        <div class="pa-matches">
          @for (m of matches(); track m.id) {
            <button type="button" class="pa-match" (click)="open(m)">
              <span class="pa-match-ic"
                ><rp-icon [name]="m.status === 'DRAFT' ? 'edit' : 'filetext'" [size]="18"
              /></span>
              <span class="grow"
                ><b>{{ m.name }} · {{ m.classApplied || 'Class not chosen' }}</b
                ><small>{{ info(m) }}</small></span
              >
              <span [class]="'chip dot tone-' + tone(m)">{{ label(m) }}</span>
              <span class="pa-go"><rp-icon name="right" [size]="18" /></span>
            </button>
          }
        </div>
        <button type="button" class="btn btn-ghost btn-sm" (click)="again()">
          <rp-icon name="arrowl" [size]="15" /><span>Search again</span>
        </button>
      }
      @case ('none') {
        <div class="pa-res-none">
          <rp-icon name="search" [size]="22" />
          <div>
            <b>We couldn't find an application for {{ rq() }}</b>
            <p>
              Check the number — it must be the primary contact's mobile number given on the
              application. You can also start a new application.
            </p>
            <div class="row g8 wrap">
              <button type="button" class="btn btn-sec" (click)="again()">
                <span>Try again</span>
              </button>
              <button type="button" class="btn btn-pri" (click)="startNew.emit()">
                <span>Start a new application</span>
              </button>
            </div>
          </div>
        </div>
      }
    }
  </section>`,
})
export class ResumePanel {
  private readonly api = inject(AdmissionsApi);
  private readonly router = inject(Router);
  private readonly overlays = inject(Overlays);
  readonly link = input.required<string>();
  readonly closed = output<void>();
  readonly startNew = output<void>();

  protected readonly stage = signal<Stage>('find');
  protected readonly rq = signal('');
  /** The mobile's country code (client 2026-10-13). */
  protected readonly cc = signal('+91');
  protected readonly code = signal('');
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly busy = signal(false);
  protected readonly sent = signal<(ResumeSent & { body: { mobile: string } }) | null>(null);
  protected readonly matches = signal<readonly ResumeMatch[]>([]);
  protected readonly left = signal(0);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly q = viewChild<ElementRef<HTMLInputElement>>('q');
  private readonly otp = viewChild<ElementRef<HTMLInputElement>>('otp');
  private sentAt = 0;

  constructor() {
    const timer = setInterval(() => {
      if (this.stage() !== 'otp') return;
      this.left.set(Math.max(0, RESEND_AFTER - Math.round((Date.now() - this.sentAt) / 1000)));
    }, 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    afterNextRender(() => this.reveal());
  }

  /** Brings the panel into view and puts the cursor in its field (prototype scrollResume). */
  reveal() {
    const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.panel()?.nativeElement.scrollIntoView?.({
      block: 'start',
      behavior: reduce ? 'auto' : 'smooth',
    });
    setTimeout(() => (this.q() ?? this.otp())?.nativeElement.focus({ preventScroll: true }), 250);
  }

  protected value(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  /** Digits only, in the box too (client 2026-10-14). */
  protected digits(e: Event) {
    return cleanTyped(e.target as HTMLInputElement, onlyDigits);
  }
  protected clear(k: string) {
    if (this.errors()[k]) this.errors.update((e) => ({ ...e, [k]: '' }));
  }
  protected clock(s: number) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  protected label(m: ResumeMatch) {
    return STATUS[m.status]?.label ?? m.status;
  }
  protected tone(m: ResumeMatch) {
    return STATUS[m.status]?.tone ?? 'neutral';
  }
  protected info(m: ResumeMatch) {
    const parts = [yearLabel(m.year)];
    if (m.status === 'DRAFT') {
      if (m.updatedAt) parts.push(`Saved ${dshort(m.updatedAt)}`);
      parts.push(`Stopped at step ${Math.min(STEPS, m.step + 1)} of ${STEPS}`);
    } else parts.push(m.applicationNo);
    return parts.join(' · ');
  }

  protected async find() {
    if (this.busy()) return;
    const n = this.rq().replace(/\s/g, '');
    // The primary contact's mobile only (client 2026-10-12).
    if (!n) return this.errors.set({ 'pa-rq': translate('ADM.RESUME_NEEDS') });
    const india = this.cc() === '+91';
    if (india ? !PATTERNS.mobile.test(n) : !/^\d{6,12}$/.test(n)) {
      return this.errors.set({
        'pa-rq': translate(india ? 'ADM.MOBILE_INVALID' : 'ADM.MOBILE_INTL_INVALID'),
      });
    }
    const body = { mobile: joinMobile(this.cc(), n) };
    this.busy.set(true);
    try {
      await this.ask(body);
      this.code.set('');
      this.stage.set('otp');
      setTimeout(() => this.reveal(), 0);
    } catch (e) {
      const p = asProblem(e);
      const f = p.errors[0];
      this.errors.set({ 'pa-rq': f ? f.message : problemText(p) });
    } finally {
      this.busy.set(false);
    }
  }

  private async ask(body: { mobile: string }) {
    const s = await this.api.resumeAsk(this.link(), body);
    this.sent.set({ ...s, body });
    this.sentAt = Date.now();
    this.left.set(RESEND_AFTER);
    this.overlays.toast('Code sent', {
      tone: 'info',
      sub: `To ${s.sentTo ?? 'the mobile number on the application'}`,
    });
  }

  protected async resend() {
    const s = this.sent();
    if (!s || this.left() > 0) return;
    try {
      await this.ask(s.body);
    } catch (e) {
      this.overlays.toast(problemText(e), { tone: 'bad' });
    }
  }

  protected async verify() {
    const s = this.sent();
    if (!s || this.busy()) return;
    const otp = this.code().trim();
    if (!otp) return this.errors.set({ 'pa-otp': translate('VALIDATION.REQUIRED') });
    if (!/^\d{4,8}$/.test(otp)) return this.errors.set({ 'pa-otp': translate('VALIDATION.OTP') });
    this.busy.set(true);
    try {
      const v = await this.api.resumeVerify(this.link(), {
        challengeId: s.challengeId,
        requestToken: s.requestToken,
        otp,
      });
      keepToken(
        v.applications.map((a) => a.id),
        v.resumeToken,
        v.expiresAt,
      );
      this.matches.set(v.applications);
      if (!v.applications.length) this.stage.set('none');
      else if (v.applications.length === 1) await this.open(v.applications[0]!);
      else this.stage.set('pick');
    } catch (e) {
      const p = asProblem(e);
      if (p.code !== 'AUTH.OTP_INVALID' && p.code.startsWith('AUTH.OTP_')) {
        // expired, used, or too many wrong codes: the search starts again
        this.stage.set('find');
        this.overlays.toast(problemText(p), {
          tone: 'bad',
          sub: 'For your security, start the search again',
        });
      } else {
        this.errors.set({ 'pa-otp': p.errors[0]?.message ?? problemText(p) });
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected async open(m: ResumeMatch) {
    const base = ['/admissions', this.link()];
    if (m.status === 'DRAFT') {
      this.overlays.toast('Welcome back', { sub: 'Your draft is open where you left it' });
      await this.router.navigate([...base, 'apply'], { queryParams: { app: m.id } });
      return;
    }
    const mobile = this.sent()?.body['mobile'];
    // With its id: the status page offers the PDF copy to the family that just proved it.
    await this.router.navigate([...base, 'status'], {
      queryParams: { no: m.applicationNo, app: m.id },
      state: mobile ? { mobile } : {},
    });
  }

  protected again() {
    this.stage.set('find');
    this.errors.set({});
    setTimeout(() => this.reveal(), 0);
  }
}
