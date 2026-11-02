import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SessionContext } from '../../../../Context/SessionContext';
import { newIdempotencyKey } from '../../../Utils/ids';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import {
  AdmissionsApi,
  type Application as FormApplication,
} from '../../Admissions/admissions.api';
import { problemText } from '../../Admissions/admissions.store';
import {
  AdmissionWizard,
  WIZARD_IMPORTS,
  WIZARD_TEMPLATE,
  type WizardBackend,
} from '../../Admissions/Form/wizard';
import { ApplicationsApi, type Application, type ApplicationInput } from './applications.api';
import { MembersApi } from '../Members/members.api';

/**
 * The counsellor's side of the form: the console's API with the staff session (ADM-015, ADM-016
 * with If-Match, ADM-028/036 for the attachments, ADM-026/027, ADM-030). The console's view of an
 * application is the public one with a few more fields, so the form reads it as it is.
 */
function counsellorBackend(
  api: ApplicationsApi,
  files: AdmissionsApi,
  members: MembersApi,
): WizardBackend {
  const versions = new Map<string, number>();
  const keep = (a: Application) => {
    versions.set(a.id, a.version);
    return a as unknown as FormApplication;
  };
  return {
    create: async (cls, step) =>
      keep(await api.create({ class: cls, step } as ApplicationInput, newIdempotencyKey())),
    read: async (id) => keep(await api.detail(id)),
    save: async (id, section, data, step) =>
      keep(await api.update({ id, version: versions.get(id) ?? 0 }, section, data, step)),
    addReference: async (id, body) => keep(await api.addReference(id, body, newIdempotencyKey())),
    removeReference: async (id, refId) => keep(await api.removeReference(id, refId)),
    submit: async (id) => {
      const out = await api.submit(id, newIdempotencyKey());
      keep(out.application);
      return out;
    },
    // The parent reads out the code sent to the primary contact's mobile (client 2026-10-27).
    contactOtp: (id) => api.contactOtp(id),
    verifyContact: async (id, challengeId, otp) =>
      keep((await api.verifyContactOtp(id, { challengeId, otp })).application),
    upload: async (id, type, file, progress) =>
      keep(await api.addDocument(id, type, file, newIdempotencyKey(), progress)),
    remove: async (id, type) => keep(await api.removeDocument(id, type)),
    // The console's view carries a fresh signed link for each attachment.
    link: async (id, type) => {
      const d = keep(await api.detail(id)).documents.find((x) => x.type === type) as
        { url?: string | null; name: string; mimeType: string } | undefined;
      if (!d?.url) throw new ApiProblem(404, 'GEN.NOT_FOUND', translate('GEN.NOT_FOUND'), null);
      return { url: d.url, name: d.name, mimeType: d.mimeType };
    },
    file: (url) => files.documentFile(url),
    familyLookup: (mobile) => members.familyLookup(mobile),
  };
}

/**
 * c.app.new — the counsellor's application for a family (client 2026-10-15: the in-app form has
 * the public form's steps, fields, layout, checks and behaviour): the same eight steps, the years,
 * classes, the institution's fields, the stops and the rules from ADM-035. A draft is finished any
 * time from Applications; the review step submits with the family's declaration recorded by the
 * counsellor. The fees as on the public form (client 2026-10-23): a counsellor whose role collects
 * fees has the application fee taken with the form and the admission fee now or later, and
 * submitting goes on to Admission fees with Collect fees open (Pay now — both fees in one payment —
 * or cash); otherwise the accounts desk collects them later.
 */
@Component({
  selector: 'rp-application-wizard',
  imports: WIZARD_IMPORTS,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The page itself is the console's page box (.c-page).
  host: { class: 'c-page', id: 'ap-wizard', '(keydown.enter)': 'enter($event)' },
  template: WIZARD_TEMPLATE,
})
export class ApplicationWizard extends AdmissionWizard {
  private readonly api = inject(ApplicationsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly session = inject(SessionContext).console;

  protected readonly crumb = 'Applications';
  protected readonly backLabel = 'Back to applications';
  protected readonly helpTitle = 'Filling it in for a family';
  private why: string | null = null;

  constructor() {
    super(
      counsellorBackend(inject(ApplicationsApi), inject(AdmissionsApi), inject(MembersApi)),
      true,
    );
    effect(() => {
      const s = this.session();
      this.f.collects.set(
        !!s && s.subTasks.includes('admfees.collect') && !s.roles.some((r) => r.readOnly),
      );
    });
    const q = this.route.snapshot.queryParamMap;
    void this.init(q.get('app'), q.get('year'));
  }

  protected override outerProblem() {
    return this.why;
  }

  protected helpText() {
    return 'Use the details and papers the family gives you; the form checks them as the public form does. The fees are collected at the accounts desk.';
  }

  private async init(appId: string | null, yearId: string | null) {
    const s = this.session();
    if (s && !s.subTasks.includes('admissions.edit')) {
      this.why = "Your role doesn't include this task.";
      this.loadProblem.set(this.why);
      this.loading.set(false);
      return;
    }
    let landing;
    try {
      landing = await this.api.form();
    } catch (e) {
      this.loadProblem.set(problemText(e));
      this.loading.set(false);
      return;
    }
    const a = await this.start(landing, appId, yearId);
    if (a && a.status !== 'DRAFT') {
      this.overlays.toast(`${a.applicationNo} is no longer a draft`, {
        tone: 'info',
        sub: 'It opens on Applications.',
      });
      await this.toList(a.id);
    }
  }

  private toList(open: string | null) {
    return this.router.navigate(['/console/applications'], {
      queryParams: open ? { open } : {},
      replaceUrl: true,
    });
  }

  protected remember(appId: string) {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { app: appId },
      replaceUrl: true,
    });
  }

  protected async leave() {
    await this.toList(this.f.d().appId);
  }

  protected lost() {
    this.overlays.toast(translate('ADM.NOT_FOUND'), { tone: 'bad' });
    void this.toList(null);
  }

  protected notDraft(appId: string | null) {
    void this.toList(appId);
  }

  protected async submitted(
    appId: string,
    out: { readonly status: 'DRAFT' | 'SUBMITTED' },
    withAdmission: boolean,
  ) {
    const no = this.f.d().appNo ?? undefined;
    // The fees are collected now, as the family pays on the public form (client 2026-10-23).
    const fee = out.status === 'DRAFT' ? 'APPLICATION' : withAdmission ? 'ADMISSION' : null;
    if (this.f.collects() && fee) {
      this.overlays.toast(
        out.status === 'SUBMITTED'
          ? 'Application submitted'
          : 'Declared — collect the fees to submit',
        { sub: no, tone: out.status === 'SUBMITTED' ? 'ok' : 'info' },
      );
      await this.router.navigate(['/console/admfees'], {
        queryParams: {
          collect: appId,
          fee,
          ...(fee === 'APPLICATION' && withAdmission ? { with: 'ADMISSION' } : {}),
        },
      });
      return;
    }
    this.overlays.toast(
      out.status === 'SUBMITTED'
        ? 'Application submitted'
        : 'Declared — waiting for the application fee',
      { sub: no, tone: out.status === 'SUBMITTED' ? 'ok' : 'info' },
    );
    await this.toList(appId);
  }

  protected override toTop() {
    document.querySelector('#ap-wizard')?.scrollIntoView?.({ block: 'start' });
  }
}
