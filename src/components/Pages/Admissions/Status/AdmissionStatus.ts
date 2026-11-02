import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Icon } from '../../../Shared/Icon';
import { formatInr } from '../../../Utils/format';
import { PATTERNS } from '../../../Utils/patterns';
import { translate } from '../../../Utils/translate';
import { cleanTyped, onlyDigits } from '../../../Utils/typing';
import { AdmissionsApi, type StatusView } from '../admissions.api';
import {
  AdmissionsContext,
  STATUS,
  asProblem,
  date,
  paise,
  problemText,
  tokenFor,
  yearLabel,
} from '../admissions.store';
import { CountryCode } from '../Form/CardUploads';
import { joinMobile, splitMobile } from '../Form/form.state';
import { PaField, PaTimeline, type TimelineItem } from '../Shared/AdmissionsUi';

/**
 * p.status — track an application by its number and the mobile on it (ADM-012; FR-ADM-07,
 * RNG-GOV-007): progress only, never the family's details.
 */
@Component({
  selector: 'rp-admission-status',
  imports: [CountryCode, Icon, PaField, PaTimeline],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <div class="pa-narrow">
      @if (found(); as a) {
        <div class="card pa-stat">
          <div class="pa-stat-h">
            <div class="grow">
              <div class="eyebrow">Application {{ a.applicationNo }}</div>
              <h2>{{ a.name }}</h2>
              <p>
                {{ a.classApplied ?? '—' }} · {{ yl(a.year) }}
                @if (a.midTerm) {
                  · <span class="chip tone-accent dot">Mid-term</span>
                }
              </p>
            </div>
            <span class="chip dot lg" [class]="'tone-' + tone(a)">{{ label(a) }}</span>
          </div>
          <rp-pa-tl [items]="timeline()" />
          @if (a.tc; as t) {
            <div class="note" [class]="t.mode === 'UNDERTAKING' ? 'tone-warn' : 'tone-ok'">
              <rp-icon name="filetext" [size]="17" />
              <div class="grow">
                @if (t.mode === 'UNDERTAKING') {
                  Transfer certificate: undertaking recorded — due by <b>{{ d(t.dueDate) }}</b
                  >.
                } @else {
                  Transfer certificate received.
                }
              </div>
            </div>
          }
          <p class="pa-fine">
            <rp-icon name="lock" [size]="12" /> For privacy this page shows only the application's
            progress. The full application is visible to the family after signing in to CampusOne, and
            to the school.
          </p>
          <div class="row g8 wrap">
            @if (a.status === 'DRAFT' && link) {
              <button type="button" class="btn btn-pri" (click)="resume()">
                <span>Continue the application</span><rp-icon name="arrowr" [size]="15" />
              </button>
            }
            @if (canDownload(a)) {
              <button
                type="button"
                class="btn btn-pri"
                id="pa-form-pdf"
                [class.is-busy]="downloading()"
                [disabled]="downloading()"
                (click)="downloadForm(a)"
              >
                <rp-icon name="download" [size]="17" /><span>Download the application (PDF)</span>
              </button>
            }
            <button type="button" class="btn btn-sec" (click)="again()">
              <span>Check another application</span>
            </button>
            @if (link) {
              <button type="button" class="btn btn-ghost" (click)="admissions()">
                <span>Back to admissions</span>
              </button>
            }
          </div>
        </div>
      } @else {
        <div class="card pa-track">
          <div class="pa-card-h">
            <span class="pa-sic"><rp-icon name="search" [size]="20" /></span>
            <div class="grow">
              <h2>Track an application</h2>
              <p>
                Enter the application number from your confirmation, and the mobile number on the
                application.
              </p>
            </div>
          </div>
          <div class="pa-g2">
            <rp-pa-fld fid="pa-tno" label="Application number" [error]="errors()['pa-tno']">
              <input
                id="pa-tno"
                type="text"
                maxlength="20"
                autocomplete="off"
                autocapitalize="characters"
                spellcheck="false"
                aria-describedby="pa-tno-e"
                [placeholder]="example()"
                [value]="no()"
                (input)="no.set(v($event)); clear('pa-tno')"
                (keydown.enter)="$event.preventDefault(); check()"
              />
            </rp-pa-fld>
            <rp-pa-fld fid="pa-tmob" label="Mobile number" [error]="errors()['pa-tmob']">
              <rp-pa-cc
                fid="pa-tmob-cc"
                [value]="cc()"
                what="the mobile number"
                (picked)="cc.set($event); clear('pa-tmob')"
              /><input
                id="pa-tmob"
                type="text"
                inputmode="numeric"
                [attr.maxlength]="cc() === '+91' ? 10 : 12"
                autocomplete="off"
                [placeholder]="cc() === '+91' ? '10 digits' : 'Number without the country code'"
                aria-describedby="pa-tmob-e"
                [value]="mobile()"
                (input)="mobile.set(digits($event)); clear('pa-tmob')"
                (keydown.enter)="$event.preventDefault(); check()"
              />
            </rp-pa-fld>
          </div>
          <div class="row g8 wrap mt16">
            <button
              type="button"
              class="btn btn-pri"
              id="pa-tgo"
              [class.is-busy]="busy()"
              (click)="check()"
            >
              <rp-icon name="search" [size]="17" /><span>Check status</span>
            </button>
            @if (link) {
              <button type="button" class="btn btn-ghost" (click)="resume()">
                <span>Resume a draft instead</span>
              </button>
            }
          </div>
          @if (notFound(); as nf) {
            <div class="mt16">
              <div class="note tone-bad">
                <rp-icon name="alertc" [size]="17" />
                <div class="grow">{{ nf }}</div>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class AdmissionStatus {
  private readonly api = inject(AdmissionsApi);
  private readonly ctx = inject(AdmissionsContext);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly link = this.route.snapshot.paramMap.get('linkToken');
  protected readonly no = signal(this.route.snapshot.queryParamMap.get('no') ?? '');
  protected readonly mobile = signal('');
  /** The mobile's country code (client 2026-10-13). */
  protected readonly cc = signal('+91');
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly notFound = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly found = signal<StatusView | null>(null);
  /** The application opened from "Resume" (the family verified with a code): its PDF copy. */
  private readonly appId = this.route.snapshot.queryParamMap.get('app') ?? '';
  protected readonly downloading = signal(false);

  /** ADM-032: a submitted application the family proved with a code (client 2026-10-13). */
  protected canDownload(a: StatusView) {
    // Only for the application it was opened with, not another one checked here afterwards.
    return (
      a.status !== 'DRAFT' &&
      !!tokenFor(this.appId) &&
      a.applicationNo.toUpperCase() === this.no().trim().toUpperCase()
    );
  }

  protected async downloadForm(a: StatusView) {
    const token = tokenFor(this.appId);
    if (!token || this.downloading()) return;
    this.downloading.set(true);
    try {
      await this.api.formPdf(this.appId, token, a.applicationNo);
    } catch (e) {
      this.notFound.set(problemText(e));
    } finally {
      this.downloading.set(false);
    }
  }

  /** "TVPS/2027/000123": the school's prefix and the year a new application would be numbered. */
  protected readonly example = computed(() => {
    const l = this.ctx.landing();
    const p = (l?.institution.shortName ?? '')
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()
      .slice(0, 5);
    const y = l?.years.find((x) => x.kind === 'REGULAR') ?? l?.years[0];
    return `${p.length >= 2 ? p : 'ABC'}/${y ? y.startsOn.slice(0, 4) : new Date().getFullYear()}/000123`;
  });

  protected readonly timeline = computed<TimelineItem[]>(() => {
    const a = this.found();
    if (!a) return [];
    const appFee = a.fees.application;
    const admFee = a.fees.admission;
    const paid = appFee?.status === 'PAID';
    const dec = a.status === 'APPROVED' || a.status === 'REJECTED';
    const items: (TimelineItem | null)[] = [
      { title: 'Application started', sub: a.createdAt ? date(a.createdAt) : '', state: 'done' },
      a.status === 'DRAFT'
        ? {
            title: 'Not submitted yet',
            sub: 'Finish the form and pay the application fee to submit.',
            state: 'now',
          }
        : {
            title: 'Submitted',
            sub: `${a.submittedAt ? date(a.submittedAt) : ''}${paid && appFee ? ` · application fee ${formatInr(paise(appFee.amount))} paid${appFee.transactionId ? ` (transaction ID ${appFee.transactionId})` : ''}` : ''}`,
            state: 'done',
          },
      {
        title: 'Counsellor review',
        sub:
          a.status === 'SUBMITTED'
            ? 'In progress — usually within 5 working days'
            : dec
              ? 'Completed'
              : 'Starts after submission',
        state: a.status === 'SUBMITTED' ? 'now' : dec ? 'done' : '',
      },
      a.status === 'REJECTED'
        ? {
            title: 'Not approved',
            sub: `${a.decidedAt ? date(a.decidedAt) + ' · ' : ''}${a.rejectionReason || 'The school has shared the reason by e-mail.'}`,
            state: 'bad',
          }
        : {
            title: a.status === 'APPROVED' ? 'Approved' : 'Decision',
            sub:
              a.status === 'APPROVED'
                ? `${a.decidedAt ? date(a.decidedAt) : ''}${a.admissionNo ? ` · admission number ${a.admissionNo}` : ''}`
                : 'By SMS and e-mail',
            state: a.status === 'APPROVED' ? 'done' : '',
          },
      a.status === 'REJECTED'
        ? null
        : {
            title: `Admission fee${admFee ? ' · ' + formatInr(paise(admFee.amount)) : ''}`,
            sub:
              a.status === 'APPROVED'
                ? admFee?.status === 'PAID'
                  ? `Paid — the seat is confirmed${admFee.transactionId ? ` · transaction ID ${admFee.transactionId}` : ''}`
                  : 'Due now — online or at the accounts desk'
                : 'After approval',
            state: a.status === 'APPROVED' ? (admFee?.status === 'PAID' ? 'done' : 'now') : '',
          },
    ];
    return items.filter((x): x is TimelineItem => !!x);
  });

  constructor() {
    if (this.link) void this.ctx.load(this.link);
    else this.ctx.clear();
    // From the confirmation or "Resume an application": the mobile comes in the navigation state
    // (never in the address), and the status is checked straight away.
    const state = this.router.currentNavigation()?.extras.state as { mobile?: string } | undefined;
    const m = state?.mobile ?? (history.state as { mobile?: string } | null)?.mobile;
    if (m && /^(\d{10}|\+\d{7,15})$/.test(m)) {
      const x = splitMobile(m);
      this.cc.set(x.cc);
      this.mobile.set(x.n);
      if (this.no()) void this.check();
    }
  }

  protected v(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  /** Digits only, in the box too, so a letter never shows (client 2026-10-14). */
  protected digits(e: Event) {
    return cleanTyped(e.target as HTMLInputElement, onlyDigits);
  }
  protected yl(l: string) {
    return yearLabel(l);
  }
  protected d(v: string | null) {
    return date(v);
  }
  protected label(a: StatusView) {
    return STATUS[a.status]?.label ?? a.status;
  }
  protected tone(a: StatusView) {
    return STATUS[a.status]?.tone ?? 'neutral';
  }
  protected clear(k: string) {
    this.notFound.set(null);
    if (this.errors()[k]) this.errors.update((e) => ({ ...e, [k]: '' }));
  }

  protected async check() {
    if (this.busy()) return;
    const no = this.no().trim().toUpperCase();
    const m = this.mobile().trim();
    const e: Record<string, string> = {};
    if (!no) e['pa-tno'] = translate('VALIDATION.REQUIRED');
    else if (!/^[A-Z0-9]{2,5}\/\d{4}\/\d{6}$/.test(no))
      e['pa-tno'] = translate('VALIDATION.FORMAT');
    const india = this.cc() === '+91';
    if (!m) e['pa-tmob'] = translate('VALIDATION.REQUIRED');
    else if (india ? !PATTERNS.mobile.test(m) : !/^\d{6,12}$/.test(m)) {
      e['pa-tmob'] = translate(india ? 'ADM.MOBILE_INVALID' : 'ADM.MOBILE_INTL_INVALID');
    }
    this.errors.set(e);
    this.notFound.set(null);
    if (Object.keys(e).length) return;
    this.no.set(no);
    this.busy.set(true);
    try {
      this.found.set(
        await this.api.status({ applicationNo: no, mobile: joinMobile(this.cc(), m) }),
      );
    } catch (err) {
      const p = asProblem(err);
      if (p.errors.length) {
        this.errors.set(
          Object.fromEntries(
            p.errors.map((x) => [x.field === 'mobile' ? 'pa-tmob' : 'pa-tno', x.message]),
          ),
        );
      } else this.notFound.set(problemText(p));
    } finally {
      this.busy.set(false);
    }
  }

  protected again() {
    this.found.set(null);
    this.no.set('');
    this.mobile.set('');
    this.cc.set('+91');
    this.errors.set({});
    this.notFound.set(null);
  }

  protected resume() {
    void this.router.navigate(['/admissions', this.link], { queryParams: { resume: '1' } });
  }

  protected admissions() {
    void this.router.navigate(['/admissions', this.link]);
  }
}
