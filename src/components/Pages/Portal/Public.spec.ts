import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../Config';
import { appRoutes } from '../../../App.routes';
import { apiInterceptor } from '../../Utils/api';

const sleep = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const money = (amount: string) => ({ amount, currency: 'INR' });
const ALL = [
  'Academics',
  'Attendance',
  'Transport',
  'Communication',
  'Fees',
  'Wallet and payments',
  'Coupons',
  'Allowances',
  'Events',
  'Point of sale',
];
const plan = (id: string, name: string, cycle: string, price: string, members: number) => ({
  id,
  code: id,
  name,
  description: `${name} for a campus`,
  cycle,
  price: money(price),
  trialDays: 30,
  modules: id === 'p-ess' ? ['Academics', 'Attendance', 'Fees'] : ALL,
  allowances: { members, sms: 3000, whatsapp: 0, storageGb: 20 },
  platformFee: { flat: money('1.00'), upTo: money('100.00'), percent: '0.50' },
});
const PLANS = {
  items: [
    plan('p-ess', 'Campus Essentials', 'MONTHLY', '6500.00', 800),
    plan('p-plus', 'Campus Plus', 'ANNUAL', '180000.00', 2500),
    plan('p-pro', 'Campus Pro', 'ANNUAL', '320000.00', 6000),
  ],
  graceDays: 14,
  dueDays: 15,
};
const session = (status: string) => ({
  name: 'Savitha Rao',
  email: 'savitha.rao@example.com',
  mobile: '••••••1276',
  institution: {
    id: 'i-1',
    name: 'Sharavathi Vidyalaya',
    shortName: 'SV',
    city: 'Shivamogga',
    identifier: 'KA-SHV-0042',
    status,
  },
  preferredLang: 'en',
});
const problem = (code: string, params: object = {}) => ({
  type: 'about:blank',
  code,
  detail: 'x',
  params,
});

describe('customer portal — sign-up and sign-in (SAS-001…006)', () => {
  let harness: RouterTestingHarness;
  /** Canned answers to the GET requests the pages make on their own. */
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
    gets = { '/api/v1/portal/plans': PLANS };
    harness = await RouterTestingHarness.create();
  });

  const root = () => harness.fixture.nativeElement as HTMLElement;

  /** Serves the GETs and refreshes the view until `ready` holds. */
  async function until(ready: () => boolean, what = 'the page') {
    const ctl = TestBed.inject(HttpTestingController);
    const end = Date.now() + 2500;
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

  async function request(url: string, method: string) {
    const ctl = TestBed.inject(HttpTestingController);
    const end = Date.now() + 2500;
    for (let i = 0; Date.now() < end; i++) {
      for (const r of ctl.match((q) => q.method === 'GET' && q.urlWithParams in gets)) {
        r.flush(gets[r.request.urlWithParams] as object);
      }
      const found = ctl.match((q) => q.urlWithParams === url && q.method === method);
      if (found[0]) return found[0];
      await sleep(i < 30 ? 0 : 10);
    }
    throw new Error(`no ${method} ${url}`);
  }

  const button = (label: string, scope: ParentNode = root()) =>
    [...scope.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.trim() === label,
    );
  const click = (label: string, scope?: ParentNode) => {
    const b = button(label, scope);
    if (!b) throw new Error(`no button "${label}"`);
    b.click();
    harness.detectChanges();
  };
  const type = (sel: string, v: string) => {
    const el = root().querySelector<HTMLInputElement | HTMLTextAreaElement>(sel);
    if (!el) throw new Error(`no ${sel}`);
    el.value = v;
    el.dispatchEvent(new Event('input'));
    harness.detectChanges();
  };
  const check = (sel: string) => {
    const el = root().querySelector<HTMLInputElement>(sel)!;
    el.checked = true;
    el.dispatchEvent(new Event('change'));
    harness.detectChanges();
  };
  const code = (digits: string) => {
    const boxes = [...root().querySelectorAll<HTMLInputElement>('.sp-otp input')];
    expect(boxes).toHaveLength(digits.length);
    digits.split('').forEach((d, i) => {
      boxes[i]!.value = d;
      boxes[i]!.dispatchEvent(new Event('input'));
    });
    harness.detectChanges();
  };
  const h1 = () => root().querySelector('.sp-fbody h1')?.textContent?.trim();

  it('signs up: the account by its code, the institution, the plan, review and create', async () => {
    void harness.navigateByUrl('/portal/signup');
    await until(() => h1() === 'Your CampusOne account');
    expect(root().querySelector('.sp-rail .r.on b')?.textContent).toBe('Your CampusOne account');

    // Step 1 — the administrator's CampusOne account, verified by a 4-digit code.
    click('Send code');
    expect(root().querySelector('#sp-su-m-e')?.textContent).toContain('This field is required.');
    type('#sp-su-m', '99003412');
    click('Send code');
    expect(root().querySelector('#sp-su-m-e')?.textContent).toContain(
      'Please enter a valid 10-digit mobile number.',
    );
    type('#sp-su-m', '9900341276');
    click('Send code');
    const otp = await request('/api/v1/portal/signup/otp', 'POST');
    expect(otp.request.body).toEqual({ mobile: '9900341276' });
    otp.flush({
      challengeId: 'c-1',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      resendAfterSeconds: 30,
      sentTo: '••••••1276',
      testCode: '4821',
    });
    await until(() => h1() === 'Enter the code');
    expect(root().querySelector('.demo-hint b')?.textContent).toBe('4821');
    code('4821');
    const verify = await request('/api/v1/portal/signup/otp/verify', 'POST');
    expect(verify.request.body).toEqual({ challengeId: 'c-1', otp: '4821', mobile: '9900341276' });
    verify.flush({
      signupToken: 'tok-1',
      expiresAt: new Date(Date.now() + 1_800_000).toISOString(),
      newAccount: false,
      account: { name: 'Savitha Rao', email: 'savitha.rao@example.com', mobile: '••••••1276' },
      invited: false,
    });
    await until(() => h1() === 'Account verified');
    expect(root().querySelector('.sp-acct b')?.textContent).toBe('Savitha Rao');
    click('Continue');

    // Step 2 — the institution and its contacts, checked as the prototype does.
    expect(h1()).toBe('Your institution');
    click('Continue');
    expect(root().querySelectorAll('.fld.invalid').length).toBeGreaterThanOrEqual(7);
    type('#sp-su-name', 'Sharavathi Vidyalaya');
    type('#sp-su-addr', 'Sagar Road, Vinoba Nagar');
    type('#sp-su-city', 'Shivamogga');
    type('#sp-su-pin', '577204');
    type('#sp-su-size', '5');
    check('#sp-su-me');
    expect(root().querySelector<HTMLInputElement>('#sp-su-pn')?.value).toBe('Savitha Rao');
    expect(root().querySelector<HTMLInputElement>('#sp-su-pp')?.value).toBe('9900341276');
    click('Continue');
    expect(root().querySelector('#sp-su-size-e')?.textContent).toContain(
      'Enter a value between 10 and 20,000.',
    );
    type('#sp-su-size', '720');
    click('Continue');

    // Step 3 — about 1,512 members: Campus Plus is suggested.
    expect(h1()).toBe('Choose a plan');
    const choices = [...root().querySelectorAll<HTMLElement>('.choice')];
    const plus = choices.find((c) => c.textContent?.includes('Campus Plus'))!;
    expect(plus.classList.contains('on')).toBe(true);
    expect(plus.textContent).toContain('Suggested');
    expect(
      choices.find((c) => c.textContent?.includes('Campus Essentials'))?.textContent,
    ).toContain('below your estimate');
    choices.find((c) => c.textContent?.includes('Pay when you go live'))!.click();
    harness.detectChanges();
    click('Continue');

    // Step 4 — review and the three agreements.
    expect(h1()).toBe('Review and agree');
    expect(root().querySelector('.fs .kv')?.textContent).toContain(
      'Sagar Road, Vinoba Nagar, Shivamogga 577204',
    );
    click('Create my institution');
    expect(root().querySelector('#sp-su-t-e')?.textContent).toContain(
      "Accept the subscription and data-processing terms, and confirm you're authorised",
    );
    check('#sp-su-t1');
    check('#sp-su-t2');
    check('#sp-su-t3');
    click('Create my institution');
    expect(document.querySelector('.proc h4')?.textContent).toBe('Creating your institution');
    const create = await request('/api/v1/portal/signup', 'POST');
    expect(create.request.body).toEqual({
      signupToken: 'tok-1',
      institution: {
        name: 'Sharavathi Vidyalaya',
        address: 'Sagar Road, Vinoba Nagar',
        city: 'Shivamogga',
        pinCode: '577204',
        board: 'CBSE',
        students: 720,
      },
      primaryContact: {
        name: 'Savitha Rao',
        email: 'savitha.rao@example.com',
        mobile: '9900341276',
      },
      planId: 'p-plus',
      start: 'PAY',
      accept: { subscription: true, dataProcessing: true, authorised: true },
    });
    create.flush(
      {
        institutionId: 'i-1',
        identifier: 'KA-SHV-0042',
        name: 'Savitha Rao',
        sessionId: 's-1',
        csrfToken: 'x',
      },
      { status: 201, statusText: 'Created' },
    );
    gets['/api/v1/portal/session'] = session('PENDING_ACTIVATION');
    await until(() => TestBed.inject(Router).url === '/portal/onboard?welcome=1', 'the checklist');
    const toasts = () => [...document.querySelectorAll('.toast b')].map((b) => b.textContent);
    await until(() => toasts().includes('Sharavathi Vidyalaya is registered'), 'the toast');
  });

  it('creates the CampusOne account for a new number and links a waiting institution', async () => {
    // Client 2026-10-06: no account from the app first — it is made here (SAS-051…053).
    void harness.navigateByUrl('/portal/signup');
    await until(() => h1() === 'Your CampusOne account');
    type('#sp-su-m', '9123456780');
    click('Send code');
    (await request('/api/v1/portal/signup/otp', 'POST')).flush({
      challengeId: 'c-2',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      resendAfterSeconds: 30,
      sentTo: '••••••6780',
      newAccount: true,
    });
    await until(() => h1() === 'Enter the code');
    code('1234');
    const verify = await request('/api/v1/portal/signup/otp/verify', 'POST');
    expect(verify.request.body).toEqual({ challengeId: 'c-2', otp: '1234', mobile: '9123456780' });
    verify.flush({
      signupToken: 'new-1',
      expiresAt: new Date(Date.now() + 1_800_000).toISOString(),
      newAccount: true,
      account: null,
      invited: false,
    });
    await until(() => h1() === 'Create your CampusOne account');
    click('Create my account');
    expect(root().querySelectorAll('.fld.invalid').length).toBe(3);
    type('#sp-su-fn', 'Ravi');
    type('#sp-su-ln', 'Bhat');
    type('#sp-su-em', 'Ravi.Bhat@Example.in');
    type('#sp-su-pw', 'School@2026');
    click('Create my account');
    const made = await request('/api/v1/portal/signup/account', 'POST');
    expect(made.request.body).toEqual({
      signupToken: 'new-1',
      firstName: 'Ravi',
      lastName: 'Bhat',
      email: 'ravi.bhat@example.in',
      password: 'School@2026',
    });
    made.flush(
      {
        signupToken: 'tok-2',
        expiresAt: new Date(Date.now() + 1_800_000).toISOString(),
        newAccount: false,
        account: { name: 'Ravi Bhat', email: 'ravi.bhat@example.in', mobile: '••••••6780' },
        invited: true,
      },
      { status: 201, statusText: 'Created' },
    );
    await until(() => h1() === 'Account verified');
    expect(root().querySelector('.note.tone-info')?.textContent).toContain(
      'CampusOne has registered an institution with ravi.bhat@example.in',
    );
    click('Send a code to my e-mail');
    const mail = await request('/api/v1/portal/signup/email-code', 'POST');
    expect(mail.request.body).toEqual({ signupToken: 'tok-2' });
    mail.flush({
      challengeId: 'm-1',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      resendAfterSeconds: 30,
      sentTo: 'ra••••@example.in',
    });
    await until(() => !!root().querySelector('.sp-otp input'));
    code('5678');
    const confirm = await request('/api/v1/portal/signup/email-code/verify', 'POST');
    expect(confirm.request.body).toEqual({ signupToken: 'tok-2', challengeId: 'm-1', otp: '5678' });
    confirm.flush({
      emailVerified: true,
      joined: { institution: 'Tunga Vidya Kendra', identifier: 'RPETHITUN000420001' },
    });
    await until(() => h1() === 'Institution linked');
    expect(root().querySelector('.note.tone-ok')?.textContent).toContain('Tunga Vidya Kendra');
    click('Sign in');
    await until(() => TestBed.inject(Router).url === '/portal/signin', 'the sign-in page');
  });

  it('signs in with the password and then the code, and opens the overview', async () => {
    void harness.navigateByUrl('/portal/signin');
    await until(() => h1() === 'Sign in to your account');
    type('#sp-si-e', 'Savitha.Rao@Example.com');
    type('#sp-si-p', 'School@2026');
    click('Continue');
    const signIn = await request('/api/v1/portal/auth/signin', 'POST');
    expect(signIn.request.body).toEqual({
      email: 'savitha.rao@example.com',
      password: 'School@2026',
    });
    signIn.flush({
      challengeId: 'c-9',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      resendAfterSeconds: 60,
      sentTo: '••••••1276',
      channel: 'SMS',
      emailFallback: null,
      testCode: '1234',
    });
    await until(() => h1() === "Verify it's you");
    expect(root().querySelector('.sp-fbody .sub')?.textContent).toContain('••••••1276');

    code('1239');
    const wrong = await request('/api/v1/portal/auth/otp/verify', 'POST');
    wrong.flush(problem('AUTH.OTP_INVALID', { triesLeft: 2 }), {
      status: 400,
      statusText: 'Bad Request',
    });
    await until(() => !!root().querySelector('.otp.bad'));
    expect(root().querySelector('.sp-fbody .fld.invalid .fld-e')?.textContent).toContain(
      'Invalid OTP !!! 2 tries left.',
    );

    gets['/api/v1/portal/session'] = session('ACTIVE');
    gets['/api/v1/portal/account'] = {
      institution: {
        id: 'i-1',
        identifier: 'KA-SHV-0042',
        name: 'Sharavathi Vidyalaya',
        city: 'Shivamogga',
        status: 'ACTIVE',
        signupSource: 'PORTAL',
        startPreference: 'TRIAL',
        since: '2026-09-01T05:00:00.000Z',
      },
      billing: {
        institution: { name: 'Sharavathi Vidyalaya', status: 'ACTIVE' },
        subscription: {
          status: 'ACTIVE',
          since: '2026-09-01T05:00:00.000Z',
          periodStart: '2026-09-01',
          periodEnd: '2027-08-31',
          renewsOn: '2027-09-01',
          trialEndsOn: null,
        },
        plan: PLANS.items[1],
        modules: [],
        scheduledChange: null,
        usage: { members: 640, sms: null, whatsapp: null, storageBytes: 0 },
        billing: {
          renewalBillDaysBefore: 15,
          dueDays: 15,
          graceDays: 14,
          gstPercent: '18.00',
          smsOverage: money('0.25'),
          whatsappOverage: money('0.80'),
        },
        payee: {
          name: 'CampusOne Technologies',
          bank: 'Example Bank',
          accountNo: '50200081234567',
          ifsc: 'RPSB0000001',
          example: true,
        },
        plans: PLANS.items,
        invoices: [],
        requests: [],
      },
      onboarding: { done: 9, total: 9, canGoLive: false, missing: [] },
      notices: [],
    };
    code('1234');
    const verify = await request('/api/v1/portal/auth/otp/verify', 'POST');
    expect(verify.request.body).toEqual({ challengeId: 'c-9', otp: '1234' });
    verify.flush({ sessionId: 's-2', name: 'Savitha Rao', csrfToken: 'y' });
    await until(() => !!root().querySelector('.sp-state h2'), 'the overview');
    expect(TestBed.inject(Router).url).toBe('/portal/account');
    expect(root().querySelector('.sp-inst b')?.textContent).toBe('Sharavathi Vidyalaya');
    expect(root().querySelector('.sp-state h2')?.textContent).toBe('Active · renews 01 Sep 2027');
    const menu = [...root().querySelectorAll('.sp-anav button.it')].map((b) =>
      b.textContent?.trim(),
    );
    expect(menu).toEqual([
      'Overview',
      'Plan & usage',
      'Billing',
      'Notices & history',
      'Institution details',
      'Data & cancellation',
    ]);
  });

  it('sends a signed-out visitor of an account page to the sign-in page', async () => {
    void harness.navigateByUrl('/portal/billing');
    const ctl = TestBed.inject(HttpTestingController);
    for (let i = 0; i < 100; i++) {
      const s = ctl.match('/api/v1/portal/session');
      if (s[0]) {
        s[0].flush(null, { status: 401, statusText: 'Unauthorized' });
        break;
      }
      await sleep();
    }
    await until(() => h1() === 'Sign in to your account');
    expect(TestBed.inject(Router).url).toBe('/portal/signin');
  });
});
