import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { translate } from '../../../Utils/translate';
import { AdmissionsApi } from '../admissions.api';
import { AdmissionsContext, keepToken, problemText } from '../admissions.store';
import { familyToken, publicFiles } from './form.ctx';
import { AdmissionWizard, WIZARD_IMPORTS, WIZARD_TEMPLATE, type WizardBackend } from './wizard';

/** The family's side of the form: the public API with their resume token. */
function familyBackend(api: AdmissionsApi, link: string): WizardBackend {
  return {
    ...publicFiles(api),
    create: async (cls, step) => {
      const out = await api.create(link, { class: cls, step });
      keepToken([out.application.id], out.resumeToken, out.expiresAt);
      return out.application;
    },
    read: (id) => api.read(id, familyToken(id)),
    save: (id, section, data, step) => api.save(id, familyToken(id), { section, data, step }),
    addReference: (id, body) => api.addReference(id, familyToken(id), body),
    removeReference: (id, refId) => api.removeReference(id, familyToken(id), refId),
    // "Pay later" for the application fee: submitted at once, the fee collected at the desk.
    submit: (id) => api.submit(id, familyToken(id)),
    // The primary contact's mobile, verified with a code (client 2026-10-27).
    contactOtp: (id) => api.contactOtp(id, familyToken(id)),
    verifyContact: async (id, challengeId, otp) =>
      (await api.verifyContactOtp(id, familyToken(id), { challengeId, otp })).application,
  };
}

/**
 * p.form — the family's application (ADM-004…009; FR-ADM-04/05, CR-14, CR-12, CR-07) behind the
 * school's admission link: the form (AdmissionWizard) with the family's resume token; the review
 * step submits with the declaration and opens the application-fee checkout when the year makes the
 * fee mandatory.
 */
@Component({
  selector: 'rp-admission-form',
  imports: WIZARD_IMPORTS,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents', '(keydown.enter)': 'enter($event)' },
  template: WIZARD_TEMPLATE,
})
export class AdmissionForm extends AdmissionWizard {
  private readonly ctx = inject(AdmissionsContext);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly crumb = 'Admissions';
  protected readonly backLabel = 'Back to admissions';
  protected readonly helpTitle = 'Need help?';
  private readonly link = this.route.snapshot.paramMap.get('linkToken') ?? '';

  constructor() {
    super(
      familyBackend(
        inject(AdmissionsApi),
        inject(ActivatedRoute).snapshot.paramMap.get('linkToken') ?? '',
      ),
      false,
    );
    const q = this.route.snapshot.queryParamMap;
    void this.init(q.get('app'), q.get('year'));
  }

  protected override outerProblem() {
    const e = this.ctx.error();
    return e ? problemText(e) : null;
  }

  protected helpText() {
    return `Contact the admissions office of ${this.f.landing()?.institution?.name ?? 'the school'}.`;
  }

  private async init(appId: string | null, yearId: string | null) {
    const l = await this.ctx.load(this.link);
    if (!l) {
      this.loading.set(false);
      return;
    }
    const a = await this.start(l, appId, yearId);
    if (a && a.status !== 'DRAFT') {
      await this.router.navigate(
        ['/admissions', this.link, a.status === 'SUBMITTED' ? 'done' : 'status'],
        {
          queryParams: a.status === 'SUBMITTED' ? { app: a.id } : { no: a.applicationNo },
          replaceUrl: true,
        },
      );
    }
  }

  protected remember(appId: string) {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { app: appId },
      replaceUrl: true,
    });
  }

  protected async leave() {
    await this.router.navigate(['/admissions', this.link]);
  }

  protected lost() {
    this.overlays.toast(translate('ADM.NOT_FOUND'), {
      tone: 'bad',
      sub: 'Use “Resume an application” to open it again',
    });
    void this.router.navigate(['/admissions', this.link], {
      queryParams: { resume: '1' },
      replaceUrl: true,
    });
  }

  protected notDraft(appId: string | null) {
    void this.router.navigate(['/admissions', this.link, 'done'], { queryParams: { app: appId } });
  }

  protected async submitted(
    appId: string,
    out: { readonly status: 'DRAFT' | 'SUBMITTED' },
    withAdmission: boolean,
  ) {
    if (out.status === 'SUBMITTED' && !withAdmission) {
      await this.router.navigate(['/admissions', this.link, 'done'], {
        queryParams: { app: appId },
        replaceUrl: true,
      });
    } else if (out.status === 'SUBMITTED') {
      // No application fee this year: straight to the admission fee the family chose.
      await this.router.navigate(['/admissions', this.link, 'pay'], {
        queryParams: { app: appId, fee: 'ADMISSION' },
      });
    } else {
      // The application fee, and the admission fee with it in one payment when chosen.
      await this.router.navigate(['/admissions', this.link, 'pay'], {
        queryParams: { app: appId, ...(withAdmission ? { with: 'ADMISSION' } : {}) },
      });
    }
  }
}
