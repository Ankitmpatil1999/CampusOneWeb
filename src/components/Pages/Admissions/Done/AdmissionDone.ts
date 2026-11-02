import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { formatDateTime, formatInr, titleCase } from '../../../Utils/format';
import { translate } from '../../../Utils/translate';
import { AdmissionsApi, type Application } from '../admissions.api';
import {
  AdmissionsContext,
  date,
  maskMobile,
  paise,
  problemText,
  tokenFor,
  yearLabel,
} from '../admissions.store';
import { PaSkeleton, PaTimeline, ResultMark, type TimelineItem } from '../Shared/AdmissionsUi';
import { copyText } from '../../../Utils/clipboard';

/**
 * p.done — the confirmation after submission (FR-ADM-06/07, BR-51, CR-14): the application number,
 * what was submitted and what happens next. Read with the family's resume token (ADM-025).
 */
@Component({
  selector: 'rp-admission-done',
  imports: [Icon, PaSkeleton, PaTimeline, ResultMark],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @if (problem(); as p) {
      <div class="pa-narrow">
        <div class="card">
          <div class="empty error-state">
            <div class="empty-ic"><rp-icon name="filetext" [size]="26" /></div>
            <h4>Couldn't load this</h4>
            <p>{{ p }}</p>
            <button type="button" class="btn btn-sec" (click)="track()">
              <rp-icon name="search" [size]="17" /><span>Track an application</span>
            </button>
          </div>
        </div>
      </div>
    } @else if (app(); as a) {
      <div class="pa-done">
        <div class="card pa-done-c">
          <rp-pa-res kind="ok" />
          <h1>Application submitted</h1>
          <p>
            Thank you. Keep this number — with the mobile {{ mobile() }}, it tracks the application.
          </p>
          <div class="pa-appno">
            <span>Application number</span><b class="t-mono">{{ a.applicationNo }}</b>
            <button type="button" class="linkbtn" (click)="copy(a.applicationNo)">
              <rp-icon name="copy" [size]="14" /> Copy
            </button>
          </div>
          <dl class="kv">
            <dt>Student</dt>
            <dd>{{ student() }}</dd>
            <dt>Class sought</dt>
            <dd>{{ a.class?.name ?? '—' }}</dd>
            <dt>Academic year</dt>
            <dd>{{ yl(a.year.label) }}</dd>
            <dt>Admission type</dt>
            <dd>
              @if (a.midTerm) {
                <span class="chip tone-accent dot">Mid-term</span>
                @if (a.joiningDate) {
                  joining {{ d(a.joiningDate) }}
                }
              } @else {
                <span class="chip tone-ok dot">Regular</span>
              }
            </dd>
            <dt>Application fee</dt>
            <dd>
              @if (appFee(); as f) {
                @if (f.status === 'PAID') {
                  {{ inr(f.amount) }} paid
                  @if (f.receiptNo) {
                    · <span class="t-mono">{{ f.receiptNo }}</span>
                  }
                  <!-- The payment gateway's transaction ID (client 2026-10-16). -->
                  @if (f.transactionId) {
                    <div class="t-xs t-muted" id="pa-app-txn">
                      Transaction ID <span class="t-mono">{{ f.transactionId }}</span>
                    </div>
                  }
                } @else {
                  {{ inr(f.amount) }} — to pay in cash at the school’s accounts desk
                }
              } @else {
                Not required
              }
            </dd>
            @if (admFee(); as f) {
              <dt>Admission fee</dt>
              <dd>
                @if (f.status === 'PAID') {
                  {{ inr(f.amount) }} paid
                } @else {
                  {{ inr(f.amount) }} — to pay in cash at the school’s accounts desk
                }
                @if (f.receiptNo) {
                  · <span class="t-mono">{{ f.receiptNo }}</span>
                }
                @if (f.transactionId) {
                  <div class="t-xs t-muted" id="pa-adm-txn">
                    Transaction ID <span class="t-mono">{{ f.transactionId }}</span>
                  </div>
                }
              </dd>
            } @else if (a.admissionFeeDue; as due) {
              <dt>Admission fee</dt>
              <dd id="pa-adm-due">
                @if (appFeeDue()) {
                  {{ inr(due) }} — to pay in cash at the school’s accounts desk, with the
                  application fee
                } @else {
                  {{ inr(due) }} — pay online now, or later in cash at the school’s accounts desk
                }
              </dd>
            }
            <dt>Submitted</dt>
            <dd>{{ a.submittedAt ? dt(a.submittedAt) : '—' }}</dd>
          </dl>
        </div>
        <div class="card pa-box">
          <h3><rp-icon name="route" [size]="17" /> What happens next</h3>
          <rp-pa-tl [items]="next()" />
          <div class="pa-done-a">
            @if (canPayAdmission()) {
              <button
                type="button"
                class="btn btn-pri btn-lg"
                id="pa-pay-adm"
                (click)="payAdmission()"
              >
                <rp-icon name="lock" [size]="17" /><span
                  >Pay the admission fee now · {{ inr(a.admissionFeeDue!) }}</span
                >
              </button>
            }
            <button
              type="button"
              class="btn btn-sec btn-lg"
              id="pa-form-pdf"
              [class.is-busy]="downloading()"
              [disabled]="downloading()"
              (click)="downloadForm()"
            >
              <rp-icon name="download" [size]="17" /><span>Download the application (PDF)</span>
            </button>
            <button type="button" class="btn btn-pri btn-lg" (click)="track()">
              <rp-icon name="search" [size]="17" /><span>Track this application</span>
            </button>
            <button type="button" class="btn btn-ghost btn-lg" (click)="admissions()">
              <span>Back to admissions</span>
            </button>
          </div>
        </div>
      </div>
    } @else {
      <rp-pa-skel />
    }
  `,
})
export class AdmissionDone {
  private readonly api = inject(AdmissionsApi);
  private readonly ctx = inject(AdmissionsContext);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly overlays = inject(Overlays);

  private readonly link = this.route.snapshot.paramMap.get('linkToken') ?? '';
  private readonly appId = this.route.snapshot.queryParamMap.get('app') ?? '';
  protected readonly app = signal<Application | null>(null);
  protected readonly problem = signal<string | null>(null);
  protected readonly downloading = signal(false);

  protected readonly student = computed(() => {
    const s = this.app()?.student;
    return s
      ? [s.firstName, s.lastName]
          .filter(Boolean)
          .map((x) => titleCase(x ?? ''))
          .join(' ')
      : '';
  });
  protected readonly mobile = computed(() => maskMobile(this.app()?.primaryContact.mobile ?? null));
  protected readonly appFee = computed(
    () => this.app()?.fees.find((f) => f.feeType === 'APPLICATION') ?? null,
  );
  protected readonly admFee = computed(
    () => this.app()?.fees.find((f) => f.feeType === 'ADMISSION') ?? null,
  );
  /** The application fee was left for later and is still to pay at the desk. */
  protected readonly appFeeDue = computed(() => {
    const f = this.appFee();
    return !!f && f.status !== 'PAID';
  });
  /**
   * The admission fee may be paid with the submitted form (optional; client 2026-10-09) — but not
   * on its own while the application fee is still due (client 2026-10-12).
   */
  protected readonly canPayAdmission = computed(() => {
    const a = this.app();
    return (
      !!a &&
      (a.status === 'SUBMITTED' || a.status === 'APPROVED') &&
      !!a.admissionFeeDue &&
      this.admFee()?.status !== 'PAID' &&
      !this.appFeeDue()
    );
  });
  protected readonly next = computed<TimelineItem[]>(() => {
    const a = this.app();
    if (!a) return [];
    const adm =
      a.fees.find((f) => f.feeType === 'ADMISSION')?.amount ??
      this.ctx.landing()?.years.find((y) => y.id === a.year.id)?.fees?.admissionFee;
    const tc = a.tc;
    return [
      {
        title: 'Application submitted',
        sub: a.submittedAt ? formatDateTime(a.submittedAt) : '',
        state: 'done',
      },
      {
        title: 'Counsellor review',
        sub: 'Usually within 5 working days. We may call you to clarify details.',
        state: 'now',
      },
      {
        title: 'Interaction and document check',
        sub: a.midTerm
          ? tc?.mode === 'UNDERTAKING' && tc.dueDate
            ? `Bring the transfer certificate by ${date(tc.dueDate)}`
            : 'Bring the original transfer certificate'
          : 'Bring the original birth certificate and address proof',
      },
      {
        title: `Admission fee${adm ? ' · ' + formatInr(paise(adm)) : ''}`,
        sub: 'Now with the form, or later — online or at the accounts desk',
        ...(this.admFee()?.status === 'PAID' ? { state: 'done' as const } : {}),
      },
      {
        title: 'Decision',
        sub: 'Once the accounts office confirms both fees, the school assigns the admission number and section — by SMS and e-mail',
      },
    ];
  });

  constructor() {
    void this.init();
  }

  private async init() {
    void this.ctx.load(this.link);
    const token = tokenFor(this.appId);
    if (!this.appId || !token) {
      this.problem.set(translate('ADM.NOT_FOUND'));
      return;
    }
    try {
      const a = await this.api.read(this.appId, token);
      if (a.status === 'DRAFT') {
        // declared but the fee is still due: back to the checkout
        await this.router.navigate(['/admissions', this.link, a.declaration ? 'pay' : 'apply'], {
          queryParams: { app: a.id },
          replaceUrl: true,
        });
        return;
      }
      this.app.set(a);
    } catch (e) {
      this.problem.set(problemText(e));
    }
  }

  protected yl(l: string) {
    return yearLabel(l);
  }
  protected d(v: string) {
    return date(v);
  }
  protected dt(v: string) {
    return formatDateTime(v);
  }
  protected inr(m: Application['fees'][number]['amount']) {
    return formatInr(paise(m));
  }

  protected async copy(no: string) {
    try {
      await copyText(no);
      this.overlays.toast('Copied', { sub: no });
    } catch {
      this.overlays.toast('Copy the number by hand', { tone: 'info', sub: no });
    }
  }

  /** ADM-032: a PDF copy of the application as submitted (client 2026-10-13). */
  protected async downloadForm() {
    const a = this.app();
    const token = tokenFor(this.appId);
    if (!a || !token || this.downloading()) return;
    this.downloading.set(true);
    try {
      await this.api.formPdf(a.id, token, a.applicationNo);
    } catch (e) {
      this.overlays.toast("Couldn't download the application", {
        sub: problemText(e),
        tone: 'bad',
      });
    } finally {
      this.downloading.set(false);
    }
  }

  /** The family's checkout for the admission fee, on the same admission link. */
  protected payAdmission() {
    void this.router.navigate(['/admissions', this.link, 'pay'], {
      queryParams: { app: this.appId, fee: 'ADMISSION' },
    });
  }

  protected track() {
    const a = this.app();
    void this.router.navigate(['/admissions', this.link, 'status'], {
      ...(a ? { queryParams: { no: a.applicationNo } } : {}),
      state: a?.primaryContact.mobile ? { mobile: a.primaryContact.mobile } : {},
    });
  }

  protected admissions() {
    void this.router.navigate(['/admissions', this.link]);
  }
}
