import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../Config';
import { appRoutes } from '../../../App.routes';
import { apiInterceptor } from '../../Utils/api';
import { istBusinessDate } from '../../Utils/format';
import { AdmissionsContext, keepToken } from './admissions.store';

const sleep = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const money = (amount: string) => ({ amount, currency: 'INR' });
const day = (offset: number) => istBusinessDate(new Date(Date.now() + offset * 86_400_000));
const LINK = 'L'.repeat(43);
const API = '/api/v1/public/admissions';

// A year under way (mid-term) and the next one (regular), around today.
const MID = {
  id: 'y-mid',
  label: '2026-27',
  startsOn: day(-100),
  endsOn: day(200),
  kind: 'MID_TERM',
};
const REG = {
  id: 'y-reg',
  label: '2027-28',
  startsOn: day(201),
  endsOn: day(560),
  kind: 'REGULAR',
};
const fees = {
  applicationFee: money('500.00'),
  applicationMandatory: true,
  admissionFee: money('10000.00'),
};
const Y = Number(REG.startsOn.slice(0, 4));
const LANDING = {
  institution: { name: 'Sharavathi Vidyalaya', shortName: 'SV', city: 'Shivamogga' },
  preselectedYearId: null,
  years: [
    { ...REG, fees },
    { ...MID, fees },
  ],
  classes: [
    { id: 'c-nur', name: 'Nursery', ageBand: { min: 3, max: 7 } },
    { id: 'c-ukg', name: 'UKG', ageBand: { min: 5, max: 9 } },
    { id: 'c-g1', name: 'Grade 1', ageBand: { min: 6, max: 10 } },
  ],
  customFields: [],
  transportStops: [
    { id: 'st-1', name: 'Gopala Circle', landmark: 'Near the bus shelter' },
    { id: 'st-2', name: 'Vinoba Nagar', landmark: null },
  ],
  rules: {
    ageMeasuredOn: 'June 1',
    documents: { maxBytes: 2 * 1024 * 1024, types: ['PDF', 'JPG', 'PNG'] },
    references: { max: 3, midTermMin: 1 },
  },
};

/** An application as ADM-025 answers (a complete Grade 1 draft unless overridden). */
const view = (o: Record<string, unknown> = {}) => ({
  id: 'app-1',
  applicationNo: 'SV/2027/000007',
  source: 'PUBLIC',
  status: 'DRAFT',
  step: 7,
  year: { id: REG.id, label: REG.label },
  class: { id: 'c-g1', name: 'Grade 1' },
  section: null,
  midTerm: false,
  joiningDate: REG.startsOn,
  midTermReason: null,
  student: {
    firstName: 'AARAV',
    middleName: null,
    lastName: 'HEGDE',
    gender: 'MALE',
    dob: `${Y - 7}-03-10`,
    // Kept encrypted, shown masked (client 2026-10-12).
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
      // Required (client 2026-10-13).
      line2: 'Vinoba Nagar',
      city: 'Shivamogga',
      state: 'Karnataka',
      pin: '577201',
    },
    sameAsResidential: true,
    correspondence: null,
  },
  previous: {
    school: 'Little Flower',
    lastClass: 'UKG',
    result: 'Passed',
    board: 'STATE',
    otherBoard: null,
  },
  parents: {
    // Required: the father's and the mother's name and mobile, and the children question (client
    // 2026-10-12, 2026-10-13); the primary contact's e-mail.
    father: {
      name: 'Prakash Hegde',
      mobile: '9876512340',
      email: 'prakash@example.in',
      occupation: null,
    },
    mother: { name: 'Shobha Hegde', mobile: '9876512341', email: null, occupation: null },
    guardian: null,
    primary: 'FATHER',
    children: 'MORE',
    hostel: false,
    localGuardian: null,
  },
  primaryContact: {
    name: 'Prakash Hegde',
    relation: 'FATHER',
    mobile: '9876512340',
    email: 'prakash@example.in',
    aadhaar: 'XXXX XXXX 9012',
    pan: '••••••234F',
  },
  // Each person's, masked (client 2026-10-13).
  identityNumbers: {
    father: { aadhaar: 'XXXX XXXX 9012', pan: '••••••234F' },
    mother: { aadhaar: 'XXXX XXXX 5566', pan: '••••••678K' },
    guardian: { aadhaar: null, pan: null },
    localGuardian: { aadhaar: null, pan: null },
  },
  customFields: {},
  tc: null,
  references: [],
  documents: [
    { type: 'PHOTO', name: 'photo.png', sizeBytes: 1200, mimeType: 'image/png', addedAt: null },
    {
      type: 'BIRTH',
      name: 'birth.pdf',
      sizeBytes: 2048,
      mimeType: 'application/pdf',
      addedAt: null,
    },
    {
      type: 'ADDRESS',
      name: 'bill.pdf',
      sizeBytes: 2048,
      mimeType: 'application/pdf',
      addedAt: null,
    },
    {
      type: 'REPORT',
      name: 'report.pdf',
      sizeBytes: 2048,
      mimeType: 'application/pdf',
      addedAt: null,
    },
    // A regular admission above LKG brings the transfer certificate (client 2026-10-15).
    { type: 'TC', name: 'tc.pdf', sizeBytes: 2048, mimeType: 'application/pdf', addedAt: null },
    // Both sides of the father's and the mother's Aadhaar and PAN cards (client 2026-10-13).
    ...['FATHER', 'MOTHER']
      .flatMap((who) =>
        ['AADHAAR_FRONT', 'AADHAAR_BACK', 'PAN_FRONT', 'PAN_BACK'].map((side) => `${who}_${side}`),
      )
      .map((type) => ({
        type,
        name: `${type.toLowerCase()}.jpg`,
        sizeBytes: 900,
        mimeType: 'image/jpeg',
        addedAt: null,
      })),
  ],
  fees: [],
  declaration: null,
  // The primary contact's mobile, verified with a code (client 2026-10-27).
  contactVerified: true,
  submittedAt: null,
  decidedAt: null,
  rejection: null,
  admissionNo: null,
  memberId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  version: 4,
  ...o,
});
const order = (feeType = 'APPLICATION', amount = '500.00') => ({
  paymentId: 'pmt-1',
  feeType,
  amount: money(amount),
  gatewayOrder: {
    orderId: 'order_test_1',
    amount: money(amount),
    mode: 'test',
    test: { paymentId: 'pay_test_1', signature: 'sig-ok' },
  },
});
const problem = (code: string, params: object = {}, errors?: object[]) => ({
  type: 'about:blank',
  code,
  detail: 'x',
  params,
  ...(errors ? { errors } : {}),
});

describe('public admission pages (ADM-001…012, ADM-025)', () => {
  let harness: RouterTestingHarness;
  let gets: Record<string, unknown>;

  beforeEach(async () => {
    sessionStorage.clear();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        { provide: CAMPUSONE_WEB_CONFIG, useValue: WEB_CONFIG },
        provideRouter(appRoutes),
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    TestBed.inject(AdmissionsContext).clear();
    gets = { [`${API}/${LINK}`]: LANDING };
    harness = await RouterTestingHarness.create();
  });

  const root = () => harness.fixture.nativeElement as HTMLElement;
  const text = (sel: string) =>
    root().querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

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
    const open = ctl.match(() => true).map((q) => `${q.request.method} ${q.request.urlWithParams}`);
    throw new Error(
      `timed out waiting for ${what}; pending: ${open.join(', ')}; page: ${(root().textContent ?? '').slice(0, 300)}`,
    );
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

  const button = (label: string) =>
    [...root().querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.replace(/\s+/g, ' ').trim() === label,
    );
  const click = (label: string) => {
    const b = button(label);
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
  const url = () => TestBed.inject(Router).url;

  it('shows the landing of a link: open years, entry fees and age bands', async () => {
    void harness.navigateByUrl(`/admissions/${LINK}`);
    await until(() => !!root().querySelector('.pa-hero'));
    expect(text('.pa-hero h1')).toBe('A place for your child at Sharavathi Vidyalaya');
    expect(text('.pub-top b')).toBe('Sharavathi Vidyalaya');
    expect(text('.pub-top .crest')).toBe('SV');
    expect(text('.pa-kicker')).toBe('Admissions open for 2027–28');
    const years = [...root().querySelectorAll('.pa-year')];
    expect(years).toHaveLength(2);
    expect(years[0]!.textContent).toContain('Regular admissions');
    expect(years[1]!.textContent).toContain('Mid-term admissions');
    expect(years[0]!.querySelector('.pa-fees')?.textContent).toContain('₹500.00');
    expect(years[0]!.querySelector('.pa-fees')?.textContent).toContain('₹10,000.00');
    const g1 = [...root().querySelectorAll('.pa-ages > div')].find(
      (x) => x.querySelector('b')?.textContent === 'Grade 1',
    );
    expect(g1?.querySelector('span')?.textContent).toBe('6–10 yrs');
    expect(text('.pa-glance')).toContain('Nursery to Grade 1');
  });

  it('heads the pages with the school’s logo, else its initials (client 2026-10-15)', async () => {
    const logoUrl = '/api/v1/public/institutions/i-1/logo?v=0123456789ab';
    gets[`${API}/${LINK}`] = { ...LANDING, institution: { ...LANDING.institution, logoUrl } };
    void harness.navigateByUrl(`/admissions/${LINK}`);
    await until(() => !!root().querySelector('.pa-hero'));
    const img = root().querySelector<HTMLImageElement>('#pa-logo')!;
    expect(img.getAttribute('src')).toBe(logoUrl);
    expect(img.alt).toBe('Sharavathi Vidyalaya logo');
    // A logo that doesn't load gives way to the initials.
    img.dispatchEvent(new Event('error'));
    harness.detectChanges();
    expect(root().querySelector('#pa-logo')).toBeNull();
    expect(text('.pub-top .crest')).toBe('SV');
  });

  it('refuses a replaced or unknown link with the register text', async () => {
    delete gets[`${API}/${LINK}`];
    void harness.navigateByUrl(`/admissions/${LINK}`);
    const r = await request(`${API}/${LINK}`, 'GET');
    r.flush(problem('ADM.LINK_INVALID'), { status: 404, statusText: 'Not Found' });
    await until(() => !!root().querySelector('.empty.error-state'));
    expect(text('.empty p')).toBe(
      'This admission link isn’t valid any more. Ask the school for its current link or QR code.',
    );
  });

  it('resumes: mobile, one-time code, then the draft opens where it stopped', async () => {
    void harness.navigateByUrl(`/admissions/${LINK}`);
    await until(() => !!root().querySelector('.pa-hero'));
    click('Resume an application');
    expect(root().querySelector('#pa-resume')).toBeTruthy();
    // Only the primary contact's mobile finds an application (client 2026-10-12).
    expect(text('#pa-resume')).toContain("Primary contact's mobile number");
    click('Find my application');
    expect(text('#pa-rq-e')).toBe(
      "Enter the primary contact's mobile number from the application.",
    );
    type('#pa-rq', '482193');
    click('Find my application');
    expect(text('#pa-rq-e')).toBe(
      'Mobile number must contain 10 digits and start with 6, 7, 8 or 9',
    );
    type('#pa-rq', '9876512340');
    click('Find my application');
    const ask = await request(`${API}/${LINK}/resume`, 'POST');
    expect(ask.request.body).toEqual({ mobile: '9876512340' });
    ask.flush({
      challengeId: 'ch-1',
      requestToken: 'rq-1',
      sentTo: '+91 ••••• •••40',
      testCode: '4821',
    });
    await until(() => !!root().querySelector('#pa-otp'));
    expect(text('.pa-otp > p')).toContain('+91 ••••• •••40');
    expect(text('.demo-hint b')).toBe('4821');
    type('#pa-otp', '4821');
    click('Verify and continue');
    const verify = await request(`${API}/${LINK}/resume/verify`, 'POST');
    expect(verify.request.body).toEqual({ challengeId: 'ch-1', requestToken: 'rq-1', otp: '4821' });
    verify.flush({
      applications: [
        {
          id: 'app-1',
          applicationNo: 'SV/2027/000007',
          status: 'DRAFT',
          name: 'A•••• H••••',
          classApplied: 'Grade 1',
          year: '2027-28',
          midTerm: false,
          step: 3,
          updatedAt: new Date().toISOString(),
        },
      ],
      resumeToken: 'rt-1',
      expiresAt: new Date(Date.now() + 1_800_000).toISOString(),
    });
    const read = await request(`${API}/applications/app-1`, 'GET');
    expect(read.request.headers.get('X-Admission-Token')).toBe('rt-1');
    read.flush(view({ step: 3 }));
    await until(() => !!root().querySelector('.pa-card h2'));
    expect(url()).toBe(`/admissions/${LINK}/apply?app=app-1`);
    expect(text('.pa-card h2')).toBe('Previous schooling');
    expect(text('.pa-fchips')).toContain('Draft SV/2027/000007');
    // The last result is Pass or Fail (client 2026-10-13); a typed "Passed" reads as Pass.
    expect(root().querySelector('input#pa-pres')).toBeNull();
    expect(text('#pa-pres-b')).toContain('Pass');
    root().querySelector<HTMLButtonElement>('#pa-pres-b')!.click();
    harness.detectChanges();
    const results = [...root().querySelectorAll<HTMLButtonElement>('.dd-opt')];
    expect(results.map((o) => o.textContent?.trim())).toEqual(['Pass', 'Fail']);
    results[1]!.click();
    harness.detectChanges();
    expect(text('#pa-pres-b')).toContain('Fail');
    // the token lives in this tab only
    expect(sessionStorage.getItem('rp.admissions.tokens')).toContain('rt-1');
    expect(JSON.stringify({ ...localStorage })).not.toContain('rt-1');
  });

  it('starts a draft: class & year checked, saved with an idempotency key, then the student', async () => {
    void harness.navigateByUrl(`/admissions/${LINK}/apply?year=${REG.id}`);
    await until(() => text('.pa-card h2') === 'Class & year');
    expect(text('.pa-mid, .note')).toContain('Regular admission');
    click('Continue');
    expect(text('#pa-class-e')).toBe('Please select a valid admission standard');
    pick('pa-class', 'Grade 1');
    expect(text('.pa-g2 .fld-h')).toContain('Grade 1 accepts children aged 6–10 on 1 June');
    click('Continue');
    const create = await request(`${API}/${LINK}/applications`, 'POST');
    expect(create.request.headers.has('Idempotency-Key')).toBe(true);
    expect(create.request.body).toEqual({
      class: { yearId: REG.id, classId: 'c-g1', joiningDate: REG.startsOn, midTermReason: null },
      step: 1,
    });
    create.flush({
      application: view({
        step: 1,
        student: {
          ...view().student,
          firstName: null,
          lastName: null,
          gender: null,
          dob: null,
          aadhaar: null,
        },
        documents: [],
      }),
      resumeToken: 'rt-2',
      expiresAt: new Date(Date.now() + 1_800_000).toISOString(),
    });
    await until(() => text('.pa-card h2') === 'Student');
    expect(sessionStorage.getItem('rp.admissions.tokens')).toContain('rt-2');

    // the student: required fields and the age band (BR-50); no identity number (client 2026-10-12)
    expect(root().querySelector('#pa-id')).toBeNull();
    // the student's Aadhaar number and PAN are both optional, checked when given (client 2026-10-12)
    const star = (sel: string) =>
      !!root().querySelector(sel)?.closest('.fld')?.querySelector('.req');
    const optional = (sel: string) =>
      !!root().querySelector(sel)?.closest('.fld')?.querySelector('.opt');
    expect(star('#pa-aadhaar')).toBe(false);
    expect(optional('#pa-aadhaar')).toBe(true);
    expect(star('#pa-pan')).toBe(false);
    click('Continue');
    expect(text('#pa-first-e')).toBe('This field is required.');
    expect(text('#pa-photo-e')).toBe('This field is required.');
    expect(text('#pa-aadhaar-e')).toBe('');
    expect(text('#pa-pan-e')).toBe('');
    type('#pa-first', 'Aarav');
    type('#pa-last', 'Hegde');
    pick('pa-gender', 'Male');
    type('#pa-dob', `${Y - 3}-01-10`);
    // an Aadhaar starting with 1, and a PAN that is one letter short
    type('#pa-aadhaar', '1341 2341 2346');
    type('#pa-pan', 'abcd1234f');
    pick('pa-cat', 'General');
    pick('pa-med', 'English');
    pick('pa-blood', 'B+');
    click('Continue');
    expect(text('#pa-dob-e')).toBe(`Age must be at least 6 years for Grade 1 as of 01 Jun ${Y}.`);
    expect(text('#pa-aadhaar-e')).toBe('Enter a valid 12-digit Aadhaar number.');
    expect(text('#pa-pan-e')).toBe('Please enter a valid 10-character PAN number.');
    // The Verhoeff check digit is not enforced for now (client 2026-10-12).
    type('#pa-aadhaar', '234123412345');
    type('#pa-pan', 'abcde1234f');
    expect(root().querySelector<HTMLInputElement>('#pa-pan')!.value).toBe('ABCDE1234F');
    // Digits only: a letter typed never shows in the box (client 2026-10-13).
    type('#pa-aadhaar', '2341a2341b2345');
    expect(root().querySelector<HTMLInputElement>('#pa-aadhaar')!.value).toBe('234123412345');

    // a photo over 2 MB is refused before it is sent (CR-07)
    const input = root().querySelector<HTMLInputElement>('#pa-photo')!;
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [big], configurable: true });
    input.dispatchEvent(new Event('change'));
    harness.detectChanges();
    expect(text('#pa-photo-e')).toBe('The file must be under 2 MB.');
    const ok = new File([new Uint8Array(1200)], 'aarav.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [ok], configurable: true });
    input.dispatchEvent(new Event('change'));
    const up = await request(`${API}/applications/app-1/documents`, 'POST');
    expect(up.request.headers.get('X-Admission-Token')).toBe('rt-2');
    const form = up.request.body as FormData;
    expect(form.get('documentType')).toBe('PHOTO');
    up.flush(view({ step: 1 }));
    await until(() => text('.upl.done').includes('aarav.png'));

    type('#pa-dob', `${Y - 7}-03-10`);
    click('Continue');
    const save = await request(`${API}/applications/app-1`, 'PATCH');
    expect(save.request.body).toMatchObject({
      section: 'student',
      step: 2,
      data: {
        firstName: 'Aarav',
        lastName: 'Hegde',
        gender: 'MALE',
        aadhaar: '234123412345',
        pan: 'ABCDE1234F',
        bloodGroup: 'B+',
      },
    });
    expect((save.request.body as { data: object }).data).not.toHaveProperty('idNumber');
    // the server's field errors land on the form's fields
    save.flush(problem('GEN.VALIDATION', {}, [{ field: 'firstName', code: 'VALIDATION.FORMAT' }]), {
      status: 422,
      statusText: 'Unprocessable',
    });
    await until(() => !!text('#pa-first-e'));
    expect(text('#pa-first-e')).toBe('This value is not in the expected format.');
    expect(text('.pa-card h2')).toBe('Student');
  });

  /** Opens the complete draft at its review step. */
  async function review(o: Record<string, unknown> = {}) {
    keepToken(['app-1'], 'rt-1', new Date(Date.now() + 1_800_000).toISOString());
    gets[`${API}/applications/app-1`] = view(o);
    void harness.navigateByUrl(`/admissions/${LINK}/apply?app=app-1`);
    await until(() => text('.pa-card h2') === 'Review & declaration');
  }

  it('submits with the declaration and pays the application fee in the test checkout', async () => {
    await review();
    expect(text('#pa-body')).toContain('Aarav Hegde');
    expect(text('#pa-body')).not.toContain('Identity number');
    // the Aadhaar numbers and PAN only masked (client 2026-10-12)
    expect(text('#pa-body')).toContain('XXXX XXXX 2346');
    // each parent's (client 2026-10-13)
    expect(text('#pa-body')).toContain('Father’s Aadhaar · PAN XXXX XXXX 9012 · ••••••234F');
    expect(text('#pa-body')).toContain('Mother’s Aadhaar · PAN XXXX XXXX 5566 · ••••••678K');
    click('Pay ₹500.00 and submit');
    expect(text('#pa-declare-e')).toBe('Declaration must be accepted');
    // the consent to register the family's CampusOne account (client 2026-10-12)
    expect(root().querySelector('#pa-consent')!.closest('label')!.textContent).toContain(
      'will be used to register our account in CampusOne',
    );
    expect(text('#pa-consent-e')).toBe(
      'Agree that the information collected will be used to register your account in CampusOne.',
    );
    const box = root().querySelector<HTMLInputElement>('#pa-declare')!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    harness.detectChanges();
    click('Pay ₹500.00 and submit');
    expect(text('#pa-declare-e')).toBe('');
    expect(text('#pa-consent-e')).not.toBe('');
    const consent = root().querySelector<HTMLInputElement>('#pa-consent')!;
    consent.checked = true;
    consent.dispatchEvent(new Event('change'));
    harness.detectChanges();
    click('Pay ₹500.00 and submit');
    const sub = await request(`${API}/applications/app-1/submission`, 'POST');
    expect(sub.request.body).toEqual({ declarationAccepted: true, registrationConsent: true });
    expect(sub.request.headers.has('Idempotency-Key')).toBe(true);
    gets[`${API}/applications/app-1`] = view({
      declaration: { at: new Date().toISOString(), by: 'x' },
    });
    sub.flush({
      status: 'DRAFT',
      applicationNo: 'SV/2027/000007',
      feeDue: { amount: '500.00', currency: 'INR', mandatory: true },
    });
    const start = await request(`${API}/applications/app-1/fee-payments`, 'POST');
    expect(start.request.headers.get('X-Admission-Token')).toBe('rt-1');
    start.flush(order());
    await until(() => !!root().querySelector('.pa-gw-amt'));
    expect(url()).toBe(`/admissions/${LINK}/pay?app=app-1`);
    expect(text('.pa-gw-amt b')).toBe('₹500.00');
    expect(text('.pa-gw-b')).toContain('Test checkout.');
    expect(text('.pa-psum')).toContain('order_test_1');
    click('Pay ₹500.00');
    expect(text('#pa-upi-e')).toBe('This field is required.');
    type('#pa-upi', 'aarav@okbank');
    click('Pay ₹500.00');
    const verify = await request(`${API}/applications/app-1/fee-payments/pmt-1/verify`, 'POST');
    expect(verify.request.body).toEqual({ gatewayPaymentId: 'pay_test_1', signature: 'sig-ok' });
    gets[`${API}/applications/app-1`] = view({
      status: 'SUBMITTED',
      submittedAt: new Date().toISOString(),
      declaration: { at: new Date().toISOString(), by: 'x' },
      fees: [
        {
          id: 'f-1',
          feeType: 'APPLICATION',
          amount: money('500.00'),
          status: 'PAID',
          mode: 'ONLINE',
          receiptNo: 'SV/R/2026/000003',
          transactionId: 'pay_test_1',
          paidAt: new Date().toISOString(),
          paidBy: null,
          failureReason: null,
        },
      ],
      admissionFeeDue: money('10000.00'),
    });
    verify.flush({
      status: 'PAID',
      receiptNo: 'SV/R/2026/000003',
      transactionId: 'pay_test_1',
      applicationStatus: 'SUBMITTED',
    });
    await until(() => text('.pa-done-c h1') === 'Application submitted', 'the confirmation');
    expect(url()).toBe(`/admissions/${LINK}/done?app=app-1`);
    expect(text('.pa-appno b')).toBe('SV/2027/000007');
    expect(text('.pa-done-c .kv')).toContain('₹500.00 paid · SV/R/2026/000003');
    // The payment gateway's transaction ID (client 2026-10-16).
    expect(text('#pa-app-txn')).toBe('Transaction ID pay_test_1');
    expect(text('.pa-box .tl')).toContain('Counsellor review');

    // A PDF copy of the submitted application, read with the family's token (client 2026-10-13).
    const u = URL as unknown as {
      createObjectURL?: (b: Blob) => string;
      revokeObjectURL?: (s: string) => void;
    };
    const before = { create: u.createObjectURL, revoke: u.revokeObjectURL };
    u.createObjectURL = () => 'blob:form';
    u.revokeObjectURL = () => undefined;
    const save = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    try {
      click('Download the application (PDF)');
      const pdf = await request(`${API}/applications/app-1/form.pdf`, 'GET');
      expect(pdf.request.headers.has('X-Admission-Token')).toBe(true);
      expect(pdf.request.responseType).toBe('blob');
      pdf.flush(new Blob(['%PDF-1.4'], { type: 'application/pdf' }));
      await until(() => save.mock.calls.length === 1, 'the file saved');
      expect((save.mock.contexts[0] as HTMLAnchorElement).download).toBe(
        'Application-SV-2027-000007.pdf',
      );
    } finally {
      save.mockRestore();
      u.createObjectURL = before.create;
      u.revokeObjectURL = before.revoke;
    }

    // The admission fee may be paid with the submitted form, or later (client 2026-10-09).
    expect(text('.pa-done-c .kv')).toContain('₹10,000.00 — pay online now, or later in cash');
    click('Pay the admission fee now · ₹10,000.00');
    const adm = await request(`${API}/applications/app-1/fee-payments`, 'POST');
    expect(adm.request.body).toEqual({ feeType: 'ADMISSION' });
    adm.flush(order('ADMISSION', '10000.00'));
    await until(() => !!root().querySelector('.pa-gw-amt'));
    expect(url()).toBe(`/admissions/${LINK}/pay?app=app-1&fee=ADMISSION`);
    expect(text('.pa-gw-amt b')).toBe('₹10,000.00');
  });

  const tick = (sel: string) => {
    const box = root().querySelector<HTMLInputElement>(sel)!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    harness.detectChanges();
  };
  /** "Pay now" or "Pay later" for one fee on the review step. */
  const choose = (row: string, label: string) => {
    [...root().querySelectorAll<HTMLButtonElement>(`${row} .seg button`)]
      .find((b) => b.textContent?.trim() === label)!
      .click();
    harness.detectChanges();
  };

  it('pays the admission fee chosen on the form together with the application fee', async () => {
    await review();
    // "Pay now" for the admission fee: the year's configured amount (client 2026-10-09).
    expect(text('#pa-fee-adm')).toContain('Admission fee · ₹10,000.00');
    choose('#pa-fee-adm', 'Pay now');
    tick('#pa-declare');
    tick('#pa-consent');
    click('Pay ₹10,500.00 and submit');
    const sub = await request(`${API}/applications/app-1/submission`, 'POST');
    const declared = { declaration: { at: new Date().toISOString(), by: 'x' } };
    gets[`${API}/applications/app-1`] = view({
      ...declared,
      admissionFeeDue: money('10000.00'),
    });
    sub.flush({
      status: 'DRAFT',
      applicationNo: 'SV/2027/000007',
      feeDue: { amount: '500.00', currency: 'INR', mandatory: true },
    });
    // One payment for both fees: the total, and what it is made of.
    const start = await request(`${API}/applications/app-1/fee-payments`, 'POST');
    expect(start.request.body).toEqual({ withAdmission: true });
    start.flush({ ...order('APPLICATION', '10500.00'), includes: ['APPLICATION', 'ADMISSION'] });
    await until(() => !!root().querySelector('.pa-gw-amt'));
    expect(url()).toBe(`/admissions/${LINK}/pay?app=app-1&with=ADMISSION`);
    expect(text('.pa-gw-amt b')).toBe('₹10,500.00');
    expect(text('.pa-gw-amt small')).toContain('Application fee + admission fee');
    expect(text('#pa-fee-parts')).toBe('Application fee ₹500.00Admission fee ₹10,000.00');
    expect(text('.pa-psum-t b')).toBe('₹10,500.00');
    type('#pa-upi', 'aarav@okbank');
    click('Pay ₹10,500.00');
    const verify = await request(`${API}/applications/app-1/fee-payments/pmt-1/verify`, 'POST');
    gets[`${API}/applications/app-1`] = view({
      ...declared,
      status: 'SUBMITTED',
      submittedAt: new Date().toISOString(),
    });
    verify.flush({
      status: 'PAID',
      receiptNo: 'SV/R/2026/000003',
      receipts: [
        { feeType: 'APPLICATION', receiptNo: 'SV/R/2026/000003' },
        { feeType: 'ADMISSION', receiptNo: 'SV/R/2026/000004' },
      ],
      applicationStatus: 'SUBMITTED',
    });
    await until(() => text('.pa-done-c h1') === 'Application submitted', 'the confirmation');
  });

  it('pays the application fee online to submit; only the admission fee may wait (client 2026-10-13)', async () => {
    await review();
    // No "Pay later" for the application fee any more.
    expect(root().querySelector('#pa-fee-app .seg')).toBeNull();
    expect(text('#pa-fee-app')).toContain('Paid online when you submit');
    // The admission fee is still a choice.
    expect(root().querySelector('#pa-fee-adm .seg')).not.toBeNull();
    expect(text('#pa-fee-note')).toContain(
      'Paid online (UPI, card or net banking) when you submit',
    );
    expect(button('Pay ₹500.00 and submit')).toBeTruthy();
    tick('#pa-declare');
    tick('#pa-consent');
    click('Pay ₹500.00 and submit');
    const sub = await request(`${API}/applications/app-1/submission`, 'POST');
    // Never "pay later": the form waits for the payment.
    expect(sub.request.body).toEqual({ declarationAccepted: true, registrationConsent: true });
  });

  /** A draft opened at one step (0-based) of the form. */
  async function openAt(step: number, title: string, o: Record<string, unknown> = {}) {
    keepToken(['app-1'], 'rt-1', new Date(Date.now() + 1_800_000).toISOString());
    gets[`${API}/applications/app-1`] = view({ step, ...o });
    void harness.navigateByUrl(`/admissions/${LINK}/apply?app=app-1`);
    await until(() => text('.pa-card h2') === title, title);
  }

  const sent = (testCode?: string) => ({
    challengeId: 'ch-1',
    sentTo: '+91 ••••• •••40',
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    ...(testCode ? { testCode } : {}),
  });

  it('verifies the primary contact’s mobile with a one-time code before submitting (client 2026-10-27)', async () => {
    // A draft from before the change: not verified yet.
    await review({ contactVerified: false });
    const next = () => root().querySelector<HTMLButtonElement>('#pa-next')!;
    expect(next().disabled).toBe(true);
    expect(text('#pa-rev-cv .note')).toBe(
      'Verify the primary contact’s mobile to submit the application.',
    );
    expect(text('#pa-cv')).toContain('+91 98765 12340');
    expect(text('#pa-cv-no')).toBe('Not verified');

    click('Verify');
    const send = await request(`${API}/applications/app-1/contact-otp`, 'POST');
    expect(send.request.headers.get('X-Admission-Token')).toBe('rt-1');
    expect(send.request.body).toEqual({});
    send.flush(sent('4821'));
    await until(() => !!root().querySelector('#pa-cv-code'), 'the code box');
    expect(text('#pa-cv')).toContain('Code sent to +91 ••••• •••40.');
    expect(text('#pa-cv')).not.toContain('Ask the family');
    // The test environment shows the code, as the other code screens do.
    expect(text('#pa-cv .demo-hint b')).toBe('4821');
    const resend = root().querySelector<HTMLButtonElement>('#pa-cv .pa-resend')!;
    expect(resend.textContent).toMatch(/Resend code in \d:\d\d/);
    expect(resend.disabled).toBe(true);

    // Enter in the code box confirms the code; it doesn't submit the form.
    type('#pa-cv-code', '4821');
    root()
      .querySelector('#pa-cv-code')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const verify = await request(`${API}/applications/app-1/contact-otp/verify`, 'POST');
    expect(verify.request.headers.get('X-Admission-Token')).toBe('rt-1');
    expect(verify.request.body).toEqual({ challengeId: 'ch-1', otp: '4821' });
    expect(text('#pa-declare-e')).toBe('');
    verify.flush({ application: view({ contactVerified: true }) });
    await until(() => !!root().querySelector('#pa-cv-ok'), 'verified');
    expect(text('#pa-cv-ok')).toBe('Verified');
    expect(root().querySelector('#pa-rev-cv .note')).toBeNull();
    expect(next().disabled).toBe(false);
    tick('#pa-declare');
    tick('#pa-consent');
    click('Pay ₹500.00 and submit');
    await request(`${API}/applications/app-1/submission`, 'POST');
  });

  it('shows the API’s message for a wrong code (client 2026-10-27)', async () => {
    await review({ contactVerified: false });
    click('Verify');
    (await request(`${API}/applications/app-1/contact-otp`, 'POST')).flush(sent());
    await until(() => !!root().querySelector('#pa-cv-code'), 'the code box');
    click('Confirm');
    expect(text('#pa-cv-e')).toBe('This field is required.');
    type('#pa-cv-code', '1111');
    click('Confirm');
    (await request(`${API}/applications/app-1/contact-otp/verify`, 'POST')).flush(
      problem('AUTH.OTP_INVALID'),
      { status: 400, statusText: 'Bad Request' },
    );
    await until(() => !!text('#pa-cv-e'));
    expect(text('#pa-cv-e')).toBe('Invalid OTP !!!');
    expect(root().querySelector('#pa-cv-code')).not.toBeNull();
    expect(root().querySelector<HTMLButtonElement>('#pa-next')!.disabled).toBe(true);
  });

  it('asks to verify again when the primary contact’s mobile changes, saving it first (client 2026-10-27)', async () => {
    await openAt(4, 'Parents & guardians');
    // Next to the primary contact.
    expect(text('#pa-cv-ok')).toBe('Verified');
    type('#pa-f-mob', '9876512399');
    expect(root().querySelector('#pa-cv-ok')).toBeNull();
    expect(text('#pa-cv-no')).toBe('Not verified');
    expect(text('#pa-cv')).toContain('+91 98765 12399');
    // The code goes to the saved number: the step is saved before it is sent.
    click('Verify');
    const save = await request(`${API}/applications/app-1`, 'PATCH');
    const body = save.request.body as { section: string; data: { father: { mobile: string } } };
    expect(body.section).toBe('parents');
    expect(body.data.father.mobile).toBe('9876512399');
    const v = view();
    save.flush(
      view({
        step: 4,
        contactVerified: false,
        parents: { ...v.parents, father: { ...v.parents.father, mobile: '9876512399' } },
        primaryContact: { ...v.primaryContact, mobile: '9876512399' },
      }),
    );
    (await request(`${API}/applications/app-1/contact-otp`, 'POST')).flush(sent());
    await until(() => !!root().querySelector('#pa-cv-code'), 'the code box');
    expect(text('.pa-card h2')).toBe('Parents & guardians');
  });

  it('asks a regular admission above LKG for the transfer certificate (client 2026-10-15)', async () => {
    await openAt(3, 'Previous schooling', {
      documents: view().documents.filter((d) => d.type !== 'TC'),
    });
    expect(text('#pa-tc-regular legend')).toBe('Transfer certificate');
    // No undertaking: that is for a mid-term admission only.
    expect(root().querySelector('#pa-tc-regular .pa-choices')).toBeNull();
    click('Continue');
    expect(text('#pa-tcfile-e')).toBe('This field is required.');
  });

  it('requires the father, the mother, the children question and the primary contact’s e-mail (client 2026-10-12, 2026-10-13)', async () => {
    // A draft from before: a father without an e-mail, no mother, no answer about the children.
    await openAt(4, 'Parents & guardians', {
      parents: {
        father: { name: 'Prakash Hegde', mobile: '9876512340', email: null, occupation: null },
        mother: null,
        guardian: null,
        primary: 'FATHER',
        hostel: false,
        localGuardian: null,
      },
    });
    const star = (sel: string) =>
      !!root().querySelector(sel)?.closest('.fld')?.querySelector('.req');
    expect(star('#pa-f-name')).toBe(true);
    expect(star('#pa-f-mob')).toBe(true);
    expect(star('#pa-m-name')).toBe(true);
    expect(star('#pa-m-mob')).toBe(true);
    expect(star('#pa-children')).toBe(true);
    // The primary contact's e-mail only.
    expect(star('#pa-f-email')).toBe(true);
    expect(star('#pa-m-email')).toBe(false);
    click('Continue');
    expect(text('#pa-m-name-e')).toBe('This field is required.');
    expect(text('#pa-m-mob-e')).toBe('This field is required.');
    expect(text('#pa-children-e')).toBe('This field is required.');
    expect(text('#pa-f-email-e')).toBe('This field is required.');
  });

  it('saves a mobile with its country code; an Indian one stays 10 digits (client 2026-10-13)', async () => {
    await openAt(4, 'Parents & guardians');
    const cc = root().querySelector<HTMLSelectElement>('#pa-m-cc')!;
    expect(cc.value).toBe('+91');
    cc.value = '+971';
    cc.dispatchEvent(new Event('change'));
    harness.detectChanges();
    type('#pa-m-mob', '50123');
    click('Continue');
    expect(text('#pa-m-mob-e')).toBe(
      'Enter the mobile number without the country code: 6 to 12 digits.',
    );
    type('#pa-m-mob', '501234567');
    click('Continue');
    const save = await request(`${API}/applications/app-1`, 'PATCH');
    const data = (save.request.body as { data: Record<string, { mobile: string }> }).data;
    expect(data['mother']!.mobile).toBe('+971501234567');
    expect(data['father']!.mobile).toBe('9876512340');
  });

  it('takes the parents’ annual income, and keeps each person’s mobile, Aadhaar and PAN their own (client 2026-10-14)', async () => {
    await openAt(4, 'Parents & guardians');
    // Digits only, read back in rupees; the guardian has none.
    type('#pa-f-inc', '8,50,000 Rs');
    const inc = root().querySelector<HTMLInputElement>('#pa-f-inc')!;
    expect(inc.value).toBe('850000');
    expect(inc.closest('.fld')!.querySelector('.fld-h')!.textContent!.trim()).toBe(
      '₹8,50,000 a year',
    );
    expect(root().querySelector('#pa-m-inc')).not.toBeNull();
    expect(root().querySelector('#pa-g-inc')).toBeNull();
    // The mother's mobile, Aadhaar and PAN can't be the father's.
    type('#pa-m-mob', '9876512340');
    type('#pa-f-aadhaar', '2345 6789 0123');
    type('#pa-m-aadhaar', '234567890123');
    type('#pa-f-pan', 'ABCPH1234F');
    type('#pa-m-pan', 'abcph1234f');
    click('Continue');
    expect(text('#pa-m-mob-e')).toBe(
      'This is the father’s mobile number. The father, the mother and the guardian each need their own.',
    );
    expect(text('#pa-m-aadhaar-e')).toBe(
      'This is the father’s Aadhaar number. The father, the mother and the guardian each have their own.',
    );
    expect(text('#pa-m-pan-e')).toBe(
      'This is the father’s PAN. The father, the mother and the guardian each have their own.',
    );
    type('#pa-m-mob', '9876512341');
    type('#pa-m-aadhaar', '345678901234');
    type('#pa-m-pan', 'ABCPH5678K');
    type('#pa-m-inc', '600000');
    click('Continue');
    const save = await request(`${API}/applications/app-1`, 'PATCH');
    const data = (save.request.body as { data: Record<string, object | null> }).data;
    expect(data['father']).toMatchObject({ annualIncome: 850000, aadhaar: '234567890123' });
    expect(data['mother']).toMatchObject({ annualIncome: 600000, pan: 'ABCPH5678K' });
    expect(data['guardian']).toBeNull();
  });

  it('asks both sides of the father’s and the mother’s cards, with the formats each upload takes (client 2026-10-13)', async () => {
    await openAt(4, 'Parents & guardians', {
      documents: view().documents.filter((d) => !/^(FATHER|MOTHER)_/.test(d.type)),
    });
    expect(text('#pa-fc legend')).toBe('Father’s Aadhaar and PAN cards');
    expect(text('#pa-mc legend')).toBe('Mother’s Aadhaar and PAN cards');
    expect(text('#pa-fc-af-formats')).toBe('Accepted: PDF, JPG or PNG · up to 2 MB');
    // No guardian is the contact, and no hostel: nobody else's are asked.
    expect(root().querySelector('#pa-gc')).toBeNull();
    expect(root().querySelector('#pa-lc')).toBeNull();
    click('Continue');
    for (const who of ['fc', 'mc']) {
      for (const id of ['af', 'ab', 'pf', 'pb']) {
        expect(text(`#pa-${who}-${id}-e`)).toBe('This field is required.');
      }
    }
  });

  it('removes an attachment, which is asked for again (client 2026-10-13)', async () => {
    await openAt(6, 'Documents');
    expect(text('#pa-dbirth-formats')).toBe('Accepted: PDF, JPG or PNG · up to 2 MB');
    (root().querySelector('#pa-dbirth-remove') as HTMLButtonElement).click();
    const del = await request(`${API}/applications/app-1/documents/BIRTH`, 'DELETE');
    del.flush(view({ step: 6, documents: view().documents.filter((d) => d.type !== 'BIRTH') }));
    await until(
      () => text('[data-upload=pa-dbirth] .upl').includes('No file chosen yet'),
      'the removal',
    );
    expect(root().querySelector('#pa-dbirth-remove')).toBeNull();
    click('Continue');
    expect(text('#pa-dbirth-e')).toBe('This field is required.');
  });

  it('lists every attachment on the review, each to open (client 2026-10-13)', async () => {
    await review();
    const attachments = [...root().querySelectorAll('.pa-rev')].find(
      (s) => s.querySelector('h3')?.textContent?.trim() === 'Attachments',
    )!;
    const t = attachments.textContent!.replace(/\s+/g, ' ');
    expect(t).toContain('Passport-size photo');
    expect(t).toContain('Father’s Aadhaar card (front)');
    expect(t).toContain('Father’s PAN card (back)');
    expect(t).toContain('Mother’s Aadhaar card (front)');
    expect(t).toContain('Birth certificate');
    // The photo, both parents' four cards, the birth certificate, address proof, report card and
    // the transfer certificate (a regular admission above LKG, client 2026-10-15).
    expect(attachments.querySelectorAll('button[data-doc]').length).toBe(13);
    // A PDF opens in a new tab, from the file fetched through its link (the server sends it as a
    // download, client 2026-10-14).
    const tab = { location: { href: '' }, close: () => undefined };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    const blobs = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:doc-1');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
    try {
      (attachments.querySelector('button[data-doc=BIRTH]') as HTMLButtonElement).click();
      const link = await request(`${API}/applications/app-1/documents/BIRTH`, 'GET');
      expect(link.request.headers.get('X-Admission-Token')).toBe('rt-1');
      expect(open).toHaveBeenCalledWith('', '_blank');
      link.flush({
        url: '/api/v1/files/f-1/content?exp=1&sig=x',
        name: 'birth.pdf',
        mimeType: 'application/pdf',
      });
      const file = await request('/api/v1/files/f-1/content?exp=1&sig=x', 'GET');
      expect(file.request.responseType).toBe('blob');
      file.flush(new Blob(['%PDF-1.4'], { type: 'application/pdf' }));
      await sleep(0);
      expect(tab.location.href).toBe('blob:doc-1');
      expect(root().querySelector('#pa-doc-view')).toBeNull();

      // A picture opens in a pop-up on the page, not in a new tab.
      open.mockClear();
      blobs.mockReturnValue('blob:photo-1');
      (attachments.querySelector('button[data-doc=PHOTO]') as HTMLButtonElement).click();
      harness.detectChanges();
      expect(open).not.toHaveBeenCalled();
      expect(document.querySelector('#pa-doc-view .sk')).not.toBeNull();
      (await request(`${API}/applications/app-1/documents/PHOTO`, 'GET')).flush({
        url: '/api/v1/files/f-2/content?exp=1&sig=y',
        name: 'photo.png',
        mimeType: 'image/png',
      });
      (await request('/api/v1/files/f-2/content?exp=1&sig=y', 'GET')).flush(
        new Blob(['png'], { type: 'image/png' }),
      );
      await sleep(0);
      harness.detectChanges();
      const img = document.querySelector('#pa-doc-view img') as HTMLImageElement;
      expect(img.getAttribute('src')).toBe('blob:photo-1');
      expect(img.alt).toBe('photo.png');
      (document.querySelector('#pa-doc-close') as HTMLButtonElement).click();
      harness.detectChanges();
      expect(document.querySelector('#pa-doc-view')).toBeNull();
      expect(revoke).toHaveBeenCalledWith('blob:photo-1');
    } finally {
      open.mockRestore();
      blobs.mockRestore();
      revoke.mockRestore();
    }
  });

  it('asks the father’s and the mother’s Aadhaar and PAN, all required (client 2026-10-12, 2026-10-13)', async () => {
    const none = { aadhaar: null, pan: null };
    await openAt(4, 'Parents & guardians', {
      identityNumbers: { father: none, mother: none, guardian: none, localGuardian: none },
    });
    const fld = (sel: string) => root().querySelector(sel)!.closest('.fld')!;
    // Inside each parent's own box.
    expect(root().querySelector('#pa-f-aadhaar')!.closest('fieldset')!.textContent).toContain(
      'Father',
    );
    for (const id of ['#pa-f-aadhaar', '#pa-f-pan', '#pa-m-aadhaar', '#pa-m-pan']) {
      expect(fld(id).querySelector('.req')).toBeTruthy();
    }
    // A guardian's only when they are the primary contact.
    expect(root().querySelector('#pa-g-aadhaar')).toBeNull();
    click('Continue');
    expect(text('#pa-f-aadhaar-e')).toBe('This field is required.');
    expect(text('#pa-m-pan-e')).toBe('This field is required.');
    type('#pa-f-aadhaar', '23412341234');
    type('#pa-f-pan', 'ABCP1122K');
    click('Continue');
    expect(text('#pa-f-aadhaar-e')).toBe('Enter a valid 12-digit Aadhaar number.');
    expect(text('#pa-f-pan-e')).toBe('Please enter a valid 10-character PAN number.');
    type('#pa-f-aadhaar', '2341 2341 2346');
    type('#pa-f-pan', 'abcpb1122k');
    type('#pa-m-aadhaar', '345634563457');
    type('#pa-m-pan', 'shobh1234k');
    click('Continue');
    const save = await request(`${API}/applications/app-1`, 'PATCH');
    expect(save.request.body).toMatchObject({
      section: 'parents',
      data: {
        primary: 'FATHER',
        father: { name: 'Prakash Hegde', aadhaar: '234123412346', pan: 'ABCPB1122K' },
        mother: { name: 'Shobha Hegde', aadhaar: '345634563457', pan: 'SHOBH1234K' },
      },
    });
    const data = (save.request.body as { data: object }).data;
    expect(data).not.toHaveProperty('primaryAadhaar');
  });

  it('asks a hostel student’s local guardian for their Aadhaar, PAN and cards (client 2026-10-13)', async () => {
    await openAt(4, 'Parents & guardians');
    const yes = root().querySelector<HTMLInputElement>('#pa-hostel-yes')!;
    yes.checked = true;
    yes.dispatchEvent(new Event('change'));
    harness.detectChanges();
    expect(text('#pa-lc legend')).toBe('Local guardian’s Aadhaar and PAN cards');
    type('#pa-lg-name', 'Suma Rao');
    type('#pa-lg-rel', 'Aunt');
    type('#pa-lg-mob', '9876501902');
    type('#pa-lg-addr', 'Vinoba Nagar, Shivamogga');
    click('Continue');
    expect(text('#pa-lg-aadhaar-e')).toBe('This field is required.');
    expect(text('#pa-lg-pan-e')).toBe('This field is required.');
    for (const id of ['af', 'ab', 'pf', 'pb']) {
      expect(text(`#pa-lc-${id}-e`)).toBe('This field is required.');
    }
    // The father's and the mother's are kept: nothing to type again.
    expect(text('#pa-f-aadhaar-e')).toBe('');
  });

  it('opts for school transport with a pick-up point from the school’s stops (client 2026-10-12)', async () => {
    await openAt(4, 'Parents & guardians');
    // Applications from before have no transport choice: "No" (Yes / No radios, 2026-10-13).
    expect(root().querySelector<HTMLInputElement>('#pa-transport-no')!.checked).toBe(true);
    const box = root().querySelector<HTMLInputElement>('#pa-transport-yes')!;
    expect(box.checked).toBe(false);
    expect(root().querySelector('#pa-transport-stop')).toBeNull();
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    harness.detectChanges();
    expect(text('label[for=pa-transport-stop-b]')).toContain('Preferred pick-up point');
    // Searchable by the stop or its landmark (client 2026-10-14).
    const stopBtn = root().querySelector<HTMLButtonElement>('#pa-transport-stop-b')!;
    stopBtn.click();
    harness.detectChanges();
    const search = root().querySelector<HTMLInputElement>('.dd-search input')!;
    const find = (q: string) => {
      search.value = q;
      search.dispatchEvent(new Event('input'));
      harness.detectChanges();
      return [...root().querySelectorAll('.dd-opt')].map((o) => o.textContent?.trim());
    };
    expect(find('vinoba')).toEqual(['Vinoba Nagar']);
    expect(find('bus shelter')).toEqual([expect.stringContaining('Gopala Circle')]);
    expect(text('.dd-menu')).not.toContain('Nothing matches');
    expect(find('nowhere')).toEqual([]);
    expect(text('.dd-menu')).toContain('Nothing matches');
    stopBtn.click();
    harness.detectChanges();
    pick('pa-transport-stop', 'Vinoba Nagar');
    click('Continue');
    const save = await request(`${API}/applications/app-1`, 'PATCH');
    expect(save.request.body).toMatchObject({
      section: 'parents',
      data: { transport: true, transportStopId: 'st-2' },
    });
  });

  it('lets the family choose school transport or the hostel, not both (client 2026-10-13)', async () => {
    await openAt(4, 'Parents & guardians');
    const box = (id: string) => root().querySelector<HTMLInputElement>(id)!;
    const set = (id: string) => {
      box(id).checked = true;
      box(id).dispatchEvent(new Event('change'));
      harness.detectChanges();
    };
    expect(box('#pa-transport-yes').type).toBe('radio');
    expect(box('#pa-transport-yes').disabled).toBe(false);
    expect(box('#pa-hostel-yes').disabled).toBe(false);
    set('#pa-transport-yes');
    expect(box('#pa-hostel-yes').disabled).toBe(true);
    expect(box('#pa-hostel-no').checked).toBe(true);
    expect(text('#pa-hostel-off')).toContain(
      'Choose No for school transport to choose the hostel.',
    );
    set('#pa-transport-no');
    expect(box('#pa-hostel-yes').disabled).toBe(false);
    set('#pa-hostel-yes');
    expect(box('#pa-transport-yes').disabled).toBe(true);
    expect(text('#pa-transport-off')).toContain(
      'Choose No for the hostel to choose school transport.',
    );
  });

  it('asks a draft saved with both ticked to keep one (client 2026-10-13)', async () => {
    await openAt(4, 'Parents & guardians', {
      parents: {
        ...view().parents,
        transport: true,
        hostel: true,
        localGuardian: {
          name: 'Suma Rao',
          relation: 'Aunt',
          mobile: '9876501902',
          address: 'Vinoba Nagar',
        },
      },
    });
    // Neither is locked, so either can be set to No.
    expect(root().querySelector<HTMLInputElement>('#pa-transport-yes')!.disabled).toBe(false);
    expect(root().querySelector<HTMLInputElement>('#pa-hostel-yes')!.disabled).toBe(false);
    click('Continue');
    expect(text('#pa-hostel-e')).toBe('Choose school transport or the hostel, not both.');
  });

  it('shows the transport choice on the review, the stop left to the school', async () => {
    await review({
      parents: { ...view().parents, transport: true, transportStop: null },
    });
    expect(text('#pa-body')).toContain('Yes — pick-up point to be decided by the school');
  });

  it('keeps each person’s saved Aadhaar and PAN masked, whoever is the primary contact (client 2026-10-12, 2026-10-13)', async () => {
    await openAt(4, 'Parents & guardians');
    const hint = (sel: string) =>
      root().querySelector(sel)!.closest('.fld')!.querySelector('.fld-h')?.textContent ?? '';
    expect(hint('#pa-f-aadhaar')).toContain('Saved: XXXX XXXX 9012');
    expect(hint('#pa-f-pan')).toContain('Saved: ••••••234F');
    expect(hint('#pa-m-pan')).toContain('Saved: ••••••678K');
    // Another contact changes nobody's numbers.
    pick('pa-primary', 'Mother');
    expect(hint('#pa-f-aadhaar')).toContain('Saved: XXXX XXXX 9012');
    // A guardian who is the contact is asked for theirs, with their cards.
    pick('pa-primary', 'Guardian');
    expect(root().querySelector('#pa-g-aadhaar')).not.toBeNull();
    expect(text('#pa-gc legend')).toBe('Guardian’s Aadhaar and PAN cards');
    pick('pa-primary', 'Mother');
    expect(root().querySelector('#pa-g-aadhaar')).toBeNull();
    type('#pa-m-email', 'shobha@example.in');
    click('Continue');
    // Nothing typed: what is saved stays (the numbers are never sent back).
    const save = await request(`${API}/applications/app-1`, 'PATCH');
    const data = (save.request.body as { data: Record<string, object> }).data;
    expect(data['father']).not.toHaveProperty('aadhaar');
    expect(data['mother']).not.toHaveProperty('pan');
    expect(data).toMatchObject({ primary: 'MOTHER' });
  });

  it('takes a photo for an upload with the computer’s camera (client 2026-10-12)', async () => {
    await openAt(6, 'Documents');
    root().querySelector<HTMLButtonElement>('#pa-dbirth-cam')!.click();
    harness.detectChanges();
    await until(() => !!root().querySelector('#pa-cam-problem'), 'the camera');
    expect(text('.modal')).toContain('Take a photo — Birth certificate');
    // This test browser has no camera: it says so, and nothing can be captured.
    expect(text('#pa-cam-problem')).toContain("This browser can't use a camera here");
    expect(root().querySelector<HTMLButtonElement>('#pa-cam-snap')!.disabled).toBe(true);
  });

  it('takes a photo for an upload with a phone’s own camera (client 2026-10-12)', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)' }));
    const opened = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    try {
      await openAt(6, 'Documents');
      root().querySelector<HTMLButtonElement>('#pa-dbirth-cam')!.click();
      harness.detectChanges();
      const input = opened.mock.contexts[0] as HTMLInputElement;
      expect(input.getAttribute('capture')).toBe('environment');
      expect(input.getAttribute('accept')).toBe('image/*');
      expect(root().querySelector('.modal')).toBeNull();
    } finally {
      opened.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('live gateway: opens Razorpay Checkout and sends its signed answer to the server (client 2026-10-09)', async () => {
    // Razorpay Checkout is the gateway's own window: simulated by its global constructor.
    const opened: Record<string, unknown>[] = [];
    (window as unknown as { Razorpay?: unknown }).Razorpay = class {
      constructor(private readonly o: Record<string, unknown>) {
        opened.push(o);
      }
      on() {}
      open() {
        (this.o['handler'] as (a: object) => void)({
          razorpay_payment_id: 'pay_LIVE1',
          razorpay_order_id: 'order_LIVE1',
          razorpay_signature: 'sig-live',
        });
      }
    };
    keepToken(['app-1'], 'rt-1', new Date(Date.now() + 1_800_000).toISOString());
    gets[`${API}/applications/app-1`] = view({
      declaration: { at: new Date().toISOString(), by: 'x' },
    });
    void harness.navigateByUrl(`/admissions/${LINK}/pay?app=app-1`);
    (await request(`${API}/applications/app-1/fee-payments`, 'POST')).flush({
      paymentId: 'pmt-1',
      feeType: 'APPLICATION',
      amount: money('500.00'),
      gatewayOrder: {
        orderId: 'order_LIVE1',
        amount: money('500.00'),
        mode: 'live',
        checkout: { keyId: 'rzp_test_KEY', name: 'Sharavathi Vidyalaya' },
      },
    });
    await until(() => !!root().querySelector('#pa-live'));
    // No test forms or test outcome switch with a live gateway.
    expect(root().querySelector('.pa-demo')).toBeNull();
    expect(text('.pa-gw-b')).not.toContain('Test checkout.');
    click('Pay ₹500.00');
    const verify = await request(`${API}/applications/app-1/fee-payments/pmt-1/verify`, 'POST');
    expect(opened[0]).toMatchObject({
      key: 'rzp_test_KEY',
      order_id: 'order_LIVE1',
      name: 'Sharavathi Vidyalaya',
    });
    expect(verify.request.body).toEqual({ gatewayPaymentId: 'pay_LIVE1', signature: 'sig-live' });
    verify.flush({ status: 'PAID', receiptNo: 'SV/R/2026/000009', applicationStatus: 'SUBMITTED' });
    await until(() => url().startsWith(`/admissions/${LINK}/done`), 'the confirmation');
    delete (window as unknown as { Razorpay?: unknown }).Razorpay;
  });

  it('test checkout: "Failed" is refused by the server, "Try again" makes a new order', async () => {
    keepToken(['app-1'], 'rt-1', new Date(Date.now() + 1_800_000).toISOString());
    gets[`${API}/applications/app-1`] = view({
      declaration: { at: new Date().toISOString(), by: 'x' },
    });
    void harness.navigateByUrl(`/admissions/${LINK}/pay?app=app-1`);
    (await request(`${API}/applications/app-1/fee-payments`, 'POST')).flush(order());
    await until(() => !!root().querySelector('.pa-demo'));
    root().querySelectorAll<HTMLButtonElement>('.pa-demo .seg button')[1]!.click();
    harness.detectChanges();
    type('#pa-upi', 'aarav@okbank');
    click('Pay ₹500.00');
    const verify = await request(`${API}/applications/app-1/fee-payments/pmt-1/verify`, 'POST');
    expect((verify.request.body as { signature: string }).signature).not.toBe('sig-ok');
    verify.flush(problem('ADM.PAYMENT_NOT_VERIFIED'), {
      status: 402,
      statusText: 'Payment Required',
    });
    await until(() => text('.pa-gwres h2') === 'Payment failed', 'the failure');
    expect(text('.pa-gwres-b > p')).toContain(
      'Payment verification failed. Please contact the admission office.',
    );
    expect(text('.pa-attempts')).toContain('Failed');
    click('Try again');
    (await request(`${API}/applications/app-1/fee-payments`, 'POST')).flush(order());
    await until(() => !!root().querySelector('.pa-demo'));
    // "Pending" sends nothing and shows the pending state
    root().querySelectorAll<HTMLButtonElement>('.pa-demo .seg button')[2]!.click();
    harness.detectChanges();
    type('#pa-upi', 'aarav@okbank');
    click('Pay ₹500.00');
    await until(() => text('.pa-gwres h2') === 'Payment pending', 'the pending state');
    expect(TestBed.inject(HttpTestingController).match(() => true)).toHaveLength(0);
  });

  it('pays the admission fee from the school’s payment link (summary only)', async () => {
    void harness.navigateByUrl('/admissions/pay/app-9?token=pt-1');
    const read = await request(`${API}/applications/app-9`, 'GET');
    expect(read.request.headers.get('X-Admission-Token')).toBe('pt-1');
    read.flush({
      id: 'app-9',
      applicationNo: 'SV/2027/000002',
      status: 'APPROVED',
      year: { id: REG.id, label: REG.label },
      class: { id: 'c-g1', name: 'Grade 1' },
      student: { name: 'I••••• R••' },
      fees: [],
      version: 9,
    });
    (await request(`${API}/applications/app-9/fee-payments`, 'POST')).flush(
      order('ADMISSION', '10000.00'),
    );
    await until(() => !!root().querySelector('.pa-gw-amt'));
    expect(text('.pub-top b')).toBe('Admissions');
    expect(text('.pa-gw-amt small')).toContain('Admission fee');
    expect(text('.pa-psum')).toContain('I••••• R••');
    expect(sessionStorage.getItem('rp.admissions.tokens')).toBeNull();
    type('#pa-upi', 'family@okbank');
    click('Pay ₹10,000.00');
    const verify = await request(`${API}/applications/app-9/fee-payments/pmt-1/verify`, 'POST');
    verify.flush({ status: 'PAID', receiptNo: 'SV/R/2026/000010', applicationStatus: 'APPROVED' });
    await until(() => text('.pa-done-c h1') === 'Admission fee paid');
    expect(text('.pa-done-c .kv')).toContain('₹10,000.00 paid · SV/R/2026/000010');
  });

  it('tracks an application by its number and mobile: progress only', async () => {
    void harness.navigateByUrl(`/admissions/${LINK}/status`);
    await until(
      () => !!root().querySelector('.pa-track') && text('.pub-top b') === 'Sharavathi Vidyalaya',
    );
    expect(root().querySelector<HTMLInputElement>('#pa-tno')?.placeholder).toBe(`SV/${Y}/000123`);
    click('Check status');
    expect(text('#pa-tno-e')).toBe('This field is required.');
    type('#pa-tno', 'sv/2027/000007');
    type('#pa-tmob', '9876512340');
    click('Check status');
    const miss = await request(`${API}/status`, 'POST');
    expect(miss.request.body).toEqual({ applicationNo: 'SV/2027/000007', mobile: '9876512340' });
    miss.flush(problem('ADM.STATUS_NOT_FOUND'), { status: 404, statusText: 'Not Found' });
    await until(() => !!root().querySelector('.note.tone-bad'));
    expect(text('.note.tone-bad')).toBe(
      'No application matches these details. Check the application number on your confirmation SMS or e-mail.',
    );
    click('Check status');
    (await request(`${API}/status`, 'POST')).flush({
      applicationNo: 'SV/2027/000007',
      status: 'SUBMITTED',
      name: 'A•••• H••••',
      classApplied: 'Grade 1',
      year: '2027-28',
      midTerm: false,
      joiningDate: null,
      createdAt: new Date().toISOString(),
      submittedAt: new Date().toISOString(),
      decidedAt: null,
      admissionNo: null,
      rejectionReason: null,
      tc: null,
      fees: {
        application: { status: 'PAID', amount: money('500.00') },
        admission: { status: 'NOT_DUE', amount: money('10000.00') },
      },
    });
    await until(() => !!root().querySelector('.pa-stat'));
    expect(text('.pa-stat h2')).toBe('A•••• H••••');
    expect(text('.pa-stat-h .chip')).toBe('Submitted');
    expect(text('.pa-stat .tl')).toContain('application fee ₹500.00 paid');
    expect(text('.pa-stat .tl')).toContain('Admission fee · ₹10,000.00');
  });
});
