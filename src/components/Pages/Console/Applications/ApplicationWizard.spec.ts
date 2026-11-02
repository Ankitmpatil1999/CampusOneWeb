import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import { istBusinessDate } from '../../../Utils/format';
import { STEPS } from '../../Admissions/Form/form.state';

/**
 * The counsellor's application (client 2026-10-15): the public form's steps, fields, checks and
 * behaviour in the console, through the console's API.
 */
const sleep = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const money = (amount: string) => ({ amount, currency: 'INR' });
const day = (offset: number) => istBusinessDate(new Date(Date.now() + offset * 86_400_000));
const API = '/api/v1/console/applications';

const REG = {
  id: 'y-reg',
  label: '2027-28',
  startsOn: day(201),
  endsOn: day(560),
  kind: 'REGULAR',
};
const Y = Number(REG.startsOn.slice(0, 4));
const FORM = {
  institution: { name: 'Tunga Valley Public School', shortName: 'TVPS', city: 'Shivamogga' },
  preselectedYearId: null,
  years: [
    {
      ...REG,
      fees: { applicationFee: money('500.00'), admissionFee: money('10000.00') },
    },
  ],
  classes: [
    { id: 'c-ukg', name: 'UKG', ageBand: { min: 5, max: 9 } },
    { id: 'c-g1', name: 'Grade 1', ageBand: { min: 6, max: 10 } },
  ],
  customFields: [],
  transportStops: [{ id: 'st-1', name: 'Gopala Circle', landmark: null }],
  rules: {
    ageMeasuredOn: 'June 1',
    documents: { maxBytes: 2 * 1024 * 1024, types: ['PDF', 'JPG', 'PNG'] },
    references: { max: 3, midTermMin: 1 },
  },
};
const SESSION = {
  name: 'FARAH KHAN',
  email: 'counsellor@tvps.example.in',
  institution: { id: 'i-1', name: 'Tunga Valley Public School', shortName: 'TVPS', city: null },
  roles: [{ code: 'COUNSELLOR', name: 'Counsellor', readOnly: false }],
  subTasks: [
    'home.view',
    'task.home',
    'task.admissions',
    'admissions.view',
    'admissions.edit',
    'task.admfees',
    'admfees.view',
    'admfees.collect',
  ],
  preferredLang: 'en',
};
const docs = (types: readonly string[]) =>
  types.map((type) => ({
    type,
    name: `${type.toLowerCase()}.pdf`,
    sizeBytes: 2048,
    mimeType: 'application/pdf',
    addedAt: null,
    url: `/api/v1/files/f-${type}?sig=x`,
  }));
/** A counsellor's application as ADM-014 answers (a complete Grade 1 draft unless overridden). */
const view = (o: Record<string, unknown> = {}) => ({
  id: 'app-1',
  applicationNo: 'TVPS/2027/000009',
  source: 'COUNSELLOR',
  status: 'DRAFT',
  step: 7,
  year: { id: REG.id, label: REG.label },
  class: { id: 'c-g1', name: 'Grade 1' },
  section: null,
  midTerm: false,
  joiningDate: REG.startsOn,
  midTermReason: null,
  student: {
    firstName: 'MEERA',
    middleName: null,
    lastName: 'JOSHI',
    gender: 'FEMALE',
    dob: `${Y - 7}-03-10`,
    aadhaar: 'XXXX XXXX 2346',
    pan: null,
    category: 'GENERAL',
    medium: 'English',
    bloodGroup: 'B+',
    allergies: null,
    health: null,
  },
  age: null,
  addresses: {
    residential: {
      line1: 'No. 14, 2nd Cross',
      line2: 'Vinoba Nagar',
      city: 'Shivamogga',
      state: 'Karnataka',
      pin: '577201',
    },
    sameAsResidential: true,
    correspondence: null,
  },
  previous: {
    school: 'Little Stars',
    lastClass: 'UKG',
    result: 'Passed',
    board: 'STATE',
    otherBoard: null,
  },
  parents: {
    father: {
      name: 'Sunil Joshi',
      mobile: '9876509911',
      email: 'sunil@example.in',
      occupation: null,
    },
    mother: { name: 'Kavita Joshi', mobile: '9876509933', email: null, occupation: null },
    guardian: null,
    primary: 'FATHER',
    children: 'SINGLE',
    hostel: false,
    localGuardian: null,
  },
  primaryContact: {
    name: 'Sunil Joshi',
    relation: 'FATHER',
    mobile: '9876509911',
    email: 'sunil@example.in',
    aadhaar: 'XXXX XXXX 9012',
    pan: '••••••455M',
  },
  identityNumbers: {
    father: { aadhaar: 'XXXX XXXX 9012', pan: '••••••455M' },
    mother: { aadhaar: 'XXXX XXXX 5566', pan: '••••••678K' },
    guardian: { aadhaar: null, pan: null },
    localGuardian: { aadhaar: null, pan: null },
  },
  customFields: {},
  tc: null,
  references: [],
  documents: docs([
    'PHOTO',
    'BIRTH',
    'ADDRESS',
    'REPORT',
    'TC',
    ...['FATHER', 'MOTHER'].flatMap((who) =>
      ['AADHAAR_FRONT', 'AADHAAR_BACK', 'PAN_FRONT', 'PAN_BACK'].map((side) => `${who}_${side}`),
    ),
  ]),
  fees: [],
  declaration: null,
  // The primary contact's mobile, verified with a code (client 2026-10-27).
  contactVerified: true,
  submittedAt: null,
  decidedAt: null,
  rejection: null,
  admissionNo: null,
  memberId: null,
  history: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  version: 4,
  ...o,
});

describe('the counsellor’s application form (client 2026-10-15)', () => {
  let harness: RouterTestingHarness;
  let gets: Record<string, unknown>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: CAMPUSONE_WEB_CONFIG, useValue: WEB_CONFIG },
        provideRouter(appRoutes),
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    gets = { '/api/v1/console/session': SESSION, [`${API}/form`]: FORM };
    harness = await RouterTestingHarness.create();
  });

  const root = () => document.body;
  const text = (sel: string) =>
    root().querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  /** Answers the known reads (others wait) until the page is ready. */
  async function until(ready: () => boolean, what = 'the page') {
    const ctl = TestBed.inject(HttpTestingController);
    const end = Date.now() + 4000;
    for (let i = 0; Date.now() < end; i++) {
      for (const r of ctl.match((q) => q.method === 'GET' && q.urlWithParams in gets)) {
        r.flush(gets[r.request.urlWithParams] as object);
      }
      harness.detectChanges();
      if (ready()) return;
      await sleep(i < 30 ? 0 : 10);
    }
    throw new Error(`timed out waiting for ${what}`);
  }

  async function request(url: string, method: string): Promise<TestRequest> {
    const ctl = TestBed.inject(HttpTestingController);
    const end = Date.now() + 4000;
    for (let i = 0; Date.now() < end; i++) {
      for (const r of ctl.match((q) => q.method === 'GET' && q.urlWithParams in gets)) {
        r.flush(gets[r.request.urlWithParams] as object);
      }
      const found = ctl.match((q) => q.urlWithParams === url && q.method === method);
      if (found[0]) return found[0];
      harness.detectChanges();
      await sleep(i < 30 ? 0 : 10);
    }
    throw new Error(`no ${method} ${url}`);
  }

  const click = (label: string) => {
    const b = [...root().querySelectorAll<HTMLButtonElement>('#ap-wizard button')].find(
      (x) => x.textContent?.replace(/\s+/g, ' ').trim() === label,
    );
    if (!b) throw new Error(`no button "${label}"`);
    b.click();
    harness.detectChanges();
  };
  const type = (sel: string, v: string) => {
    const el = root().querySelector<HTMLInputElement>(sel);
    if (!el) throw new Error(`no ${sel}`);
    el.value = v;
    el.dispatchEvent(new Event('input'));
    harness.detectChanges();
  };
  const pick = (id: string, label: string) => {
    root().querySelector<HTMLButtonElement>(`#${id}-b`)!.click();
    harness.detectChanges();
    const o = [...root().querySelectorAll<HTMLButtonElement>('.dd-opt')].find(
      (b) => b.textContent?.trim() === label,
    );
    if (!o) throw new Error(`no option ${label}`);
    o.click();
    harness.detectChanges();
  };

  it('has the public form’s steps and checks, saved through the console with If-Match', async () => {
    void harness.navigateByUrl(`/console/applications/new?year=${REG.id}`);
    await until(() => text('#ap-wizard .pa-card h2') === 'Class & year');
    // The same eight steps as the public form.
    expect(
      [...root().querySelectorAll('#ap-wizard .pa-stepper .sv .grow')].map((s) =>
        s.textContent?.trim(),
      ),
    ).toEqual(STEPS.map((s) => s.t));
    expect(text('#ap-wizard .pa-crumb')).toBe('Applications');

    // Step 1: the same check, then the draft through the console (ADM-015).
    click('Continue');
    expect(text('#pa-class-e')).toBe('Please select a valid admission standard');
    pick('pa-class', 'Grade 1');
    click('Continue');
    const create = await request(API, 'POST');
    expect(create.request.headers.has('Idempotency-Key')).toBe(true);
    expect(create.request.body).toEqual({
      class: { yearId: REG.id, classId: 'c-g1', joiningDate: REG.startsOn, midTermReason: null },
      step: 1,
    });
    const blankStudent = {
      ...view().student,
      firstName: null,
      lastName: null,
      gender: null,
      dob: null,
      aadhaar: null,
    };
    create.flush(view({ step: 1, version: 1, student: blankStudent, documents: [] }), {
      status: 201,
      statusText: 'Created',
    });
    await until(() => text('#ap-wizard .pa-card h2') === 'Student');
    expect(TestBed.inject(Router).url).toBe(`/console/applications/new?app=app-1`);

    // Step 2: the public form's fields and rules — the photo, the Aadhaar.
    click('Continue');
    expect(text('#pa-first-e')).toBe('This field is required.');
    expect(text('#pa-photo-e')).toBe('This field is required.');
    type('#pa-first', 'Meera');
    type('#pa-last', 'Joshi');
    pick('pa-gender', 'Female');
    type('#pa-dob', `${Y - 7}-03-10`);
    type('#pa-aadhaar', '1341 2341 2346');
    pick('pa-cat', 'General');
    pick('pa-med', 'English');
    pick('pa-blood', 'B+');
    click('Continue');
    expect(text('#pa-aadhaar-e')).toBe('Enter a valid 12-digit Aadhaar number.');
    type('#pa-aadhaar', '2341 2341 2346');
    const input = root().querySelector<HTMLInputElement>('#pa-photo')!;
    const photo = new File([new Uint8Array(1200)], 'meera.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [photo], configurable: true });
    input.dispatchEvent(new Event('change'));
    const up = await request(`${API}/app-1/documents`, 'POST');
    expect((up.request.body as FormData).get('documentType')).toBe('PHOTO');
    up.flush(view({ step: 1, version: 2, student: blankStudent, documents: docs(['PHOTO']) }), {
      status: 201,
      statusText: 'Created',
    });
    await until(() => text('.upl.done').includes('meera.png'));
    click('Continue');
    const save = await request(`${API}/app-1`, 'PATCH');
    expect(save.request.headers.get('If-Match')).toBe('"v2"');
    expect(save.request.body).toMatchObject({
      section: 'student',
      step: 2,
      data: { firstName: 'Meera', lastName: 'Joshi', gender: 'FEMALE', aadhaar: '234123412346' },
    });
    save.flush(view({ step: 2, version: 3, documents: docs(['PHOTO']) }));
    await until(() => text('#ap-wizard .pa-card h2') === STEPS[2]!.t);
  });

  it('finishes a draft as the public form does: the fees collected on submitting (client 2026-10-23)', async () => {
    gets[`${API}/app-1`] = view();
    void harness.navigateByUrl('/console/applications/new?app=app-1');
    await until(() => text('#ap-wizard .pa-card h2') === 'Review & declaration');
    // The public form's fees: the application fee with the form, the admission fee now or later.
    expect(root().querySelector('#pa-fee-desk')).toBeNull();
    expect(text('#pa-fee-app')).toContain('Application fee · ₹500.00');
    expect(text('#pa-fee-app')).toContain('Collected when you submit');
    expect(text('#pa-fee-adm')).toContain('Admission fee · ₹10,000.00');
    expect(text('#pa-fee-note')).toContain('Pay now (UPI, card or net banking) or cash');
    expect(text('#pa-body')).toContain('The family has read and accepted the declaration');
    click('Pay now');
    expect(text('#pa-fee-note')).toContain('Both fees are collected together when you submit');
    click('Pay ₹10,500.00 and submit');
    expect(text('#pa-declare-e')).not.toBe('');
    (root().querySelector('#pa-declare') as HTMLInputElement).click();
    (root().querySelector('#pa-consent') as HTMLInputElement).click();
    harness.detectChanges();
    click('Pay ₹10,500.00 and submit');
    const sub = await request(`${API}/app-1/submission`, 'POST');
    expect(sub.request.body).toEqual({ declarationAccepted: true, registrationConsent: true });
    sub.flush({
      status: 'DRAFT',
      applicationNo: 'TVPS/2027/000009',
      feeDue: { amount: '500.00', currency: 'INR', mandatory: true },
      application: view({ version: 5 }),
    });
    // On to Admission fees with Collect fees open for both, as the family goes on to pay.
    await until(
      () =>
        TestBed.inject(Router).url ===
        '/console/admfees?collect=app-1&fee=APPLICATION&with=ADMISSION',
    );
    expect(text('.toasts')).toContain('Declared — collect the fees to submit');
  });

  it('verifies the primary contact’s mobile: the parent reads out the code (client 2026-10-27)', async () => {
    gets[`${API}/app-1`] = view({ contactVerified: false });
    void harness.navigateByUrl('/console/applications/new?app=app-1');
    await until(() => text('#ap-wizard .pa-card h2') === 'Review & declaration');
    expect(root().querySelector<HTMLButtonElement>('#pa-next')!.disabled).toBe(true);
    click('Verify');
    const send = await request(`${API}/app-1/contact-otp`, 'POST');
    expect(send.request.body).toEqual({});
    send.flush({
      challengeId: 'ch-1',
      sentTo: '+91 ••••• •••11',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    });
    await until(() => !!root().querySelector('#pa-cv-code'), 'the code box');
    expect(text('#pa-cv')).toContain('Code sent to +91 ••••• •••11. Ask the family for it.');
    type('#pa-cv-code', '5093');
    click('Confirm');
    const verify = await request(`${API}/app-1/contact-otp/verify`, 'POST');
    expect(verify.request.body).toEqual({ challengeId: 'ch-1', otp: '5093' });
    verify.flush({ application: view({ contactVerified: true, version: 5 }) });
    await until(() => !!root().querySelector('#pa-cv-ok'), 'verified');
    expect(root().querySelector<HTMLButtonElement>('#pa-next')!.disabled).toBe(false);
  });

  it('leaves the fees to the accounts desk when the counsellor does not collect them', async () => {
    gets['/api/v1/console/session'] = {
      ...SESSION,
      subTasks: SESSION.subTasks.filter((x) => !x.includes('admfees')),
    };
    gets[`${API}/app-1`] = view();
    void harness.navigateByUrl('/console/applications/new?app=app-1');
    await until(() => text('#ap-wizard .pa-card h2') === 'Review & declaration');
    expect(text('#pa-fee-desk')).toContain('accounts desk');
    expect(root().querySelector('#pa-fee-adm')).toBeNull();
    (root().querySelector('#pa-declare') as HTMLInputElement).click();
    (root().querySelector('#pa-consent') as HTMLInputElement).click();
    harness.detectChanges();
    click('Submit application');
    const sub = await request(`${API}/app-1/submission`, 'POST');
    sub.flush({
      status: 'SUBMITTED',
      applicationNo: 'TVPS/2027/000009',
      feeDue: null,
      application: view({ status: 'SUBMITTED', version: 5 }),
    });
    await until(() => TestBed.inject(Router).url === '/console/applications?open=app-1');
    expect(text('.toasts')).toContain('Application submitted');
  });
});
