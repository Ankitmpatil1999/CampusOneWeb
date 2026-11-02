import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../Config';
import { appRoutes } from '../../../App.routes';
import { apiInterceptor } from '../../Utils/api';
import { istBusinessDate } from '../../Utils/format';

const sleep = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const money = (amount: string) => ({ amount, currency: 'INR' });
const today = istBusinessDate();
const P = '/api/v1/portal';

const plan = (id: string, name: string, price: string, members: number, modules: string[]) => ({
  id,
  code: id,
  name,
  description: null,
  cycle: 'ANNUAL',
  price: money(price),
  trialDays: 30,
  modules,
  allowances: { members, sms: 15000, whatsapp: 5000, storageGb: 100 },
  version: 1,
  platformFee: { flat: money('1.00'), upTo: money('100.00'), percent: '0.50' },
  etag: 1,
});
const PLUS = plan('p-plus', 'Campus Plus', '180000.00', 2500, ['Academics', 'Fees', 'Coupons']);
const PRO = plan('p-pro', 'Campus Pro', '320000.00', 6000, ['Academics', 'Fees', 'Coupons']);

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

const invoice = (over: object = {}) => ({
  id: 'v-1',
  invoiceNo: 'INV-2026-00042',
  institution: { id: 'i-1', name: 'Sharavathi Vidyalaya' },
  trigger: 'PLAN_ACTIVATION',
  period: '03 Oct 2026 – 02 Oct 2027',
  amount: money('180000.00'),
  taxPercent: '18.00',
  tax: money('32400.00'),
  total: money('212400.00'),
  issuedOn: today,
  dueOn: today,
  graceUntilOn: today,
  status: 'DUE',
  paidAt: null,
  transfer: null,
  payment: null,
  lines: [
    { description: 'Campus Plus · first annual cycle', quantity: 1, amount: money('180000.00') },
  ],
  version: 1,
  ...over,
});

const summary = (over: object = {}) => ({
  institution: { name: 'Sharavathi Vidyalaya', status: 'PENDING_ACTIVATION' },
  subscription: null,
  plan: PLUS,
  modules: [],
  scheduledChange: null,
  usage: { members: 1, sms: null, whatsapp: null, storageBytes: 0 },
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
  plans: [PLUS, PRO],
  invoices: [],
  requests: [],
  ...over,
});

const account = (status: string, billing: object = {}, onboarding: object = {}) => ({
  institution: {
    id: 'i-1',
    identifier: 'KA-SHV-0042',
    name: 'Sharavathi Vidyalaya',
    city: 'Shivamogga',
    status,
    signupSource: 'PORTAL',
    startPreference: 'TRIAL',
    since: '2026-10-01T05:00:00.000Z',
  },
  billing: summary({ institution: { name: 'Sharavathi Vidyalaya', status }, ...billing }),
  onboarding: { done: 4, total: 9, canGoLive: false, missing: [], ...onboarding },
  notices: [
    {
      action: 'REGISTERED',
      from: null,
      to: 'PENDING_ACTIVATION',
      reason: 'Self-serve sign-up on the customer portal',
      at: '2026-10-01T05:00:00.000Z',
      by: 'Savitha Rao',
    },
  ],
});

const STEPS = [
  ['details', 'Institution details and administrator', true],
  ['plan', 'Plan selected', true],
  ['bank', 'Bank corporate code and pool account', true],
  ['toggles', 'Feature toggles set', true],
  ['usertypes', 'User types and departments', true],
  ['year', 'Academic year declared', true],
  ['feeacct', 'Fee account designated', true],
  ['branding', 'Logo and branding', false],
  ['firstusers', 'First users onboarded', false],
] as const;
const feature = (key: string, label: string, module: string, group: string, lock = false) => ({
  key,
  label,
  sub: `${label} for the institution`,
  consoleLabel: label,
  consoleSub: label,
  icon: 'bulb',
  module,
  group,
  cr: null,
  enabled: key === 'attendance',
  lock: lock ? { kind: 'PLAN', text: 'Not in Campus Plus' } : null,
});
const onboarding = (done: string[], over: object = {}) => ({
  status: 'PENDING_ACTIVATION',
  startPreference: 'TRIAL',
  steps: STEPS.map(([key, label, required]) => ({
    key,
    label,
    required,
    byCampusOne: key === 'bank' || key === 'details',
    done: done.includes(key),
    doneAt: done.includes(key) ? '2026-10-01T05:00:00.000Z' : null,
    summary: key === 'bank' && done.includes(key) ? 'Corporate code SHV1' : '',
  })),
  done: done.length,
  total: 9,
  canGoLive: false,
  missing: STEPS.filter(([k, , r]) => r && !done.includes(k)).map(([, l]) => l),
  plan: { id: 'p-plus', name: 'Campus Plus', code: 'p-plus' },
  features: [
    feature('tuition', 'Tuition-fee collection', 'Fees', 'Money'),
    feature('feeConsent', 'Fee consent required', 'Fees', 'Money'),
    feature('transport', 'Transport', 'Transport', 'Campus', true),
    feature('attendance', 'Attendance', 'Attendance', 'Campus'),
  ],
  version: 3,
  ...over,
});

describe('customer portal — the signed-in account (SAS-007…025)', () => {
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
    gets = {};
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
      harness.detectChanges();
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
    const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(sel);
    if (!el) throw new Error(`no ${sel}`);
    el.value = v;
    el.dispatchEvent(new Event('input'));
    harness.detectChanges();
  };
  const modal = () => document.querySelector('.modal, .drawer') as HTMLElement;
  const heading = () => root().querySelector('.sp-ph h1')?.textContent?.trim();

  async function open(url: string, status = 'PENDING_ACTIVATION') {
    gets[`${P}/session`] = session(status);
    void harness.navigateByUrl(url);
  }

  it('completes the features step and moves on to the academic year (SAS-008/009)', async () => {
    gets[`${P}/account`] = account('PENDING_ACTIVATION');
    gets[`${P}/onboarding`] = onboarding(['details', 'plan', 'usertypes']);
    await open('/portal/onboard');
    await until(() => !!root().querySelector('.sp-obh h2'), 'the checklist');
    expect(root().querySelector('.sp-obh h2')?.textContent).toBe('Set up Sharavathi Vidyalaya');
    expect(root().querySelector('.sp-ck.wait b')?.textContent).toBe('Bank collection account');
    const next = root().querySelector('.sp-ck.next') as HTMLElement;
    expect(next.querySelector('b')?.textContent).toBe('Features');
    expect(button('Go live', root().querySelector('.sp-obh') as HTMLElement)?.disabled).toBe(true);
    click('Start', next);

    await until(
      () => heading() === 'Features' && !!root().querySelector('button.toggle'),
      'the features step',
    );
    const toggle = (label: string) =>
      root().querySelector<HTMLButtonElement>(`button.toggle[aria-label="${label}"]`)!;
    expect(toggle('Transport').disabled).toBe(true);
    expect(toggle('Fee consent required').disabled).toBe(true);
    toggle('Tuition-fee collection').click();
    harness.detectChanges();
    toggle('Fee consent required').click();
    harness.detectChanges();
    click('Save features');
    const put = await request(`${P}/onboarding/steps/toggles`, 'PUT');
    expect(put.request.body).toEqual({
      features: { tuition: true, feeConsent: true, attendance: true },
    });
    put.flush(onboarding(['details', 'plan', 'usertypes', 'toggles']));
    await until(() => heading() === 'Academic year', 'the year step');
    expect(TestBed.inject(Router).url).toBe('/portal/step/year');
    expect(document.querySelector('.toast b')?.textContent).toBe('Step complete');

    type('#sp-yr-s', '2026-06-01');
    type('#sp-yr-e', '2026-08-31');
    click('Save academic year');
    expect(root().querySelector('#sp-yr-e-e')?.textContent).toContain('Enter a value between');
    type('#sp-yr-e', '2027-03-31');
    expect(root().querySelector<HTMLInputElement>('#sp-yr-l')?.value).toBe('2026–27');
    click('Save academic year');
    const year = await request(`${P}/onboarding/steps/year`, 'PUT');
    expect(year.request.body).toEqual({
      label: '2026-27',
      startsOn: '2026-06-01',
      endsOn: '2027-03-31',
    });
    year.flush(onboarding(['details', 'plan', 'usertypes', 'toggles', 'year']));
    await until(() => heading() === 'Fee account', 'the fee account step');
  });

  it('goes live with a free trial once the required steps are done (SAS-010)', async () => {
    const all = ['details', 'plan', 'bank', 'toggles', 'usertypes', 'year', 'feeacct'];
    gets[`${P}/account`] = account('PENDING_ACTIVATION', {}, { done: 7, canGoLive: true });
    gets[`${P}/onboarding`] = onboarding(all, { canGoLive: true, missing: [] });
    await open('/portal/activate');
    await until(() => !!root().querySelector('.sp-golive'), 'the go-live options');
    expect(heading()).toBe('Go live');
    expect(root().querySelector('.sp-opt.rec h3')?.textContent).toBe('Start a 30-day free trial');
    expect(button('Pay ₹2,12,400.00')).toBeTruthy();
    click('Start my free trial');
    click('Start trial', modal());
    await until(() => !!document.querySelector('.proc h4'), 'the going-live steps');
    expect(document.querySelector('.proc h4')?.textContent).toBe('Going live');
    const live = await request(`${P}/go-live`, 'POST');
    expect(live.request.body).toEqual({ mode: 'TRIAL' });
    expect(live.request.headers.get('Idempotency-Key')).toBeTruthy();
    gets[`${P}/session`] = session('ACTIVE');
    gets[`${P}/account`] = account(
      'ACTIVE',
      {
        subscription: {
          status: 'TRIAL',
          since: '2026-10-03T05:00:00.000Z',
          periodStart: today,
          periodEnd: null,
          renewsOn: null,
          trialEndsOn: '2026-11-02',
        },
      },
      { done: 7, canGoLive: false },
    );
    live.flush({ status: 'ACTIVE', invoice: null });
    await until(() => !!root().querySelector('.sp-live h1'), 'the live page');
    expect(root().querySelector('.sp-live h1')?.textContent).toBe('Sharavathi Vidyalaya is live');
    expect(root().querySelector('.sp-live p')?.textContent).toContain('02 Nov 2026');
    expect(TestBed.inject(Router).url).toBe('/portal/activate?just=trial');
    expect(root().querySelector('.sp-inst .chip')?.textContent).toBe('Trial');
  });

  it('reports a bank transfer for an invoice; online payment waits for the gateway (SAS-017)', async () => {
    gets[`${P}/account`] = account('ACTIVE', {
      subscription: {
        status: 'ACTIVE',
        since: '2026-10-03T05:00:00.000Z',
        periodStart: today,
        periodEnd: '2027-10-02',
        renewsOn: '2027-10-03',
        trialEndsOn: null,
      },
      invoices: [invoice()],
    });
    gets[`${P}/invoices`] = { items: [invoice()] };
    await open('/portal/billing', 'ACTIVE');
    await until(() => !!root().querySelector('.tbl tbody tr .t-mono'), 'the invoices');
    expect(root().querySelector('.tbl .t-mono')?.textContent).toBe('INV-2026-00042');
    const billing = [...root().querySelectorAll('.sp-anav button.it')].find((b) =>
      b.textContent?.includes('Billing'),
    );
    expect(billing?.querySelector('.n')?.textContent?.trim()).toBe('1');
    click('Pay', root().querySelector('.tbl') as HTMLElement);
    expect(modal().querySelector('h3')?.textContent).toBe('Pay ₹2,12,400.00');

    // Online: the choices are shown; the server says the gateway isn't there yet.
    (modal().querySelector('.sp-pm .choice') as HTMLElement).click();
    harness.detectChanges();
    expect(modal().textContent).toContain("Online payment isn't available yet");
    click('Pay ₹2,12,400.00', modal());
    const online = await request(`${P}/invoices/v-1/payments`, 'POST');
    expect(online.request.body).toEqual({ method: 'GATEWAY' });
    online.flush(
      { type: 'about:blank', code: 'SAS.GATEWAY_UNAVAILABLE', detail: 'x' },
      { status: 409, statusText: 'Conflict' },
    );
    await until(() => !!document.querySelector('.toast'));
    expect(document.querySelector('.toast .grow span')?.textContent).toContain(
      'Pay by bank transfer and report the reference',
    );

    // Bank transfer: the reference and the date.
    [...modal().querySelectorAll<HTMLElement>('.sp-pm .choice')]
      .find((c) => c.textContent?.includes('Bank transfer'))!
      .click();
    harness.detectChanges();
    expect(modal().textContent).toContain('50200081234567');
    click("I've made the transfer", modal());
    expect(modal().querySelector('#sp-pm-utr-e')?.textContent).toContain('This field is required.');
    type('#sp-pm-utr', 'sbin826087731');
    click("I've made the transfer", modal());
    const post = await request(`${P}/invoices/v-1/payments`, 'POST');
    expect(post.request.body).toEqual({
      method: 'BANK_TRANSFER',
      utr: 'SBIN826087731',
      paidOn: today,
    });
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    const reported = invoice({
      transfer: { utr: 'SBIN826087731', paidOn: today, reportedAt: `${today}T06:00:00.000Z` },
    });
    gets[`${P}/invoices`] = { items: [reported] };
    post.flush(reported);
    await until(() => !document.querySelector('.modal'), 'the sheet to close');
    await until(() =>
      (root().querySelector('.tbl')?.textContent ?? '').includes('Transfer reported'),
    );
  });

  it('asks CampusOne to change the address and saves the contacts (SAS-021, SAS-047)', async () => {
    const details = {
      id: 'i-1',
      identifier: 'KA-SHV-0042',
      name: 'Sharavathi Vidyalaya',
      address: 'Sagar Road, Vinoba Nagar',
      city: 'Shivamogga',
      pinCode: '577204',
      board: 'CBSE',
      status: 'ACTIVE',
      registeredAt: '2026-10-01T05:00:00.000Z',
      signupSource: 'PORTAL',
      contacts: {
        primary: { name: 'Savitha Rao', email: 'savitha.rao@example.com', mobile: '9900341276' },
        secondary: null,
      },
      administrator: { name: 'Savitha Rao', email: 'savitha.rao@example.com' },
      bank: { corporateCode: null, poolAccount: null, feeAccount: null },
      changeRequests: [],
      version: 4,
    };
    gets[`${P}/account`] = account('ACTIVE');
    gets[`${P}/institution-details`] = details;
    await open('/portal/details', 'ACTIVE');
    await until(() => !!root().querySelector('#sp-dc-pn'), 'the details');
    expect(root().querySelector('.fs .kv')?.textContent).toContain('KA-SHV-0042');

    click('Request a change');
    click('Send request', modal());
    expect(modal().querySelector('#sp-dr-v-e')?.textContent).toContain('This field is required.');
    type('#sp-dr-v', 'Ring Road, Gopala, Shivamogga');
    type('#sp-dr-r', 'We moved to the new campus building');
    click('Send request', modal());
    const change = await request(`${P}/institution-details/change-requests`, 'POST');
    expect(change.request.body).toEqual({
      field: 'ADDRESS',
      value: 'Ring Road, Gopala, Shivamogga',
      reason: 'We moved to the new campus building',
    });
    expect(change.request.headers.get('Idempotency-Key')).toBeTruthy();
    gets[`${P}/institution-details`] = {
      ...details,
      changeRequests: [
        {
          id: 'a-7',
          no: 'APR-0007',
          summary: 'Address of Sharavathi Vidyalaya: Sagar Road → Ring Road',
          status: 'PENDING',
          remarks: null,
          at: '2026-10-03T06:00:00.000Z',
          decidedAt: null,
        },
      ],
    };
    change.flush({ approvalId: 'a-7', no: 'APR-0007' }, { status: 202, statusText: 'Accepted' });
    await until(() => (root().textContent ?? '').includes('APR-0007'), 'the change request');
    expect(root().textContent).toContain('Sent to CampusOne');

    type('#sp-dc-sn', 'Prakash Bhat');
    click('Save contacts');
    expect(root().querySelector('#sp-dc-se-e')?.textContent).toContain('This field is required.');
    type('#sp-dc-se', 'Office@Sharavathi.example.in');
    type('#sp-dc-sp', '9481102233');
    click('Save contacts');
    const put = await request(`${P}/institution-details/contacts`, 'PUT');
    expect(put.request.headers.get('If-Match')).toBe('"v4"');
    expect(put.request.body).toEqual({
      primaryContact: {
        name: 'Savitha Rao',
        email: 'savitha.rao@example.com',
        mobile: '9900341276',
      },
      secondaryContact: {
        name: 'Prakash Bhat',
        email: 'office@sharavathi.example.in',
        mobile: '9481102233',
      },
    });
  });

  it('exports chosen data and asks to cancel, then withdraws (SAS-022, SAS-024, SAS-025)', async () => {
    gets[`${P}/account`] = account('ACTIVE');
    gets[`${P}/data-exports`] = { items: [] };
    gets[`${P}/cancellation`] = {
      status: 'ACTIVE',
      renewsOn: '2027-10-03',
      unpaid: [],
      walletsToRefund: { count: 0, amount: { amount: '0.00', currency: 'INR' } },
      request: null,
    };
    await open('/portal/data', 'ACTIVE');
    await until(() => !!button('Request cancellation'), 'the data page');
    const excel = button('Excel workbook')!;
    expect(excel.disabled).toBe(true);

    const academic = root().querySelector<HTMLInputElement>('#sp-ex-academic')!;
    academic.checked = false;
    academic.dispatchEvent(new Event('change'));
    harness.detectChanges();
    click('Request export');
    const ex = await request(`${P}/data-exports`, 'POST');
    expect(ex.request.body).toEqual({
      classes: ['members', 'financial', 'attendance', 'communication'],
    });
    expect(ex.request.headers.get('Idempotency-Key')).toBeTruthy();
    const ready = {
      id: 'x-1',
      status: 'READY',
      counts: { members: 640, financial: 12, attendance: 0, communication: 0 },
      requestedAt: '2026-10-03T06:00:00.000Z',
      readyAt: '2026-10-03T06:00:02.000Z',
      expiresAt: '2026-10-10T06:00:02.000Z',
      file: { name: 'campusone-export.zip', sizeBytes: 20480, url: '/api/v1/files/f-1?sig=abc' },
      error: null,
    };
    gets[`${P}/data-exports`] = { items: [ready] };
    ex.flush(ready, { status: 201, statusText: 'Created' });
    await until(() => !!button('Download'), 'the export');
    expect(root().textContent).toContain('Members and profiles, Financial, Attendance');

    click('Request cancellation');
    click('Request cancellation', modal());
    expect(modal().querySelectorAll('.fld.invalid').length).toBe(2);
    (modal().querySelector('#sp-cx-r-b') as HTMLButtonElement).click();
    harness.detectChanges();
    [...document.querySelectorAll<HTMLButtonElement>('.dd-opt')]
      .find((o) => o.textContent?.trim() === 'Too expensive')!
      .click();
    harness.detectChanges();
    const ok = modal().querySelector<HTMLInputElement>('#sp-cx-ok')!;
    ok.checked = true;
    ok.dispatchEvent(new Event('change'));
    harness.detectChanges();
    click('Request cancellation', modal());
    const cx = await request(`${P}/cancellation-requests`, 'POST');
    expect(cx.request.body).toEqual({ when: 'END_OF_CYCLE', reason: 'Too expensive' });
    gets[`${P}/cancellation`] = {
      status: 'ACTIVE',
      renewsOn: '2027-10-03',
      unpaid: [],
      walletsToRefund: { count: 0, amount: { amount: '0.00', currency: 'INR' } },
      request: {
        id: 'c-1',
        status: 'PENDING',
        effectiveOn: '2027-10-03',
        reason: 'Too expensive',
        requestedAt: '2026-10-03T06:10:00.000Z',
        resolvedAt: null,
        resolution: null,
        version: 1,
      },
    };
    cx.flush(
      { id: 'c-1', effectiveOn: '2027-10-03', status: 'PENDING' },
      { status: 202, statusText: 'Accepted' },
    );
    await until(() => !!button('Withdraw request'), 'the pending request');
    expect(root().textContent).toContain('Cancellation requested');

    click('Withdraw request');
    click('Withdraw request', modal());
    const del = await request(`${P}/cancellation-requests/c-1`, 'DELETE');
    gets[`${P}/cancellation`] = {
      status: 'ACTIVE',
      renewsOn: '2027-10-03',
      unpaid: [],
      walletsToRefund: { count: 0, amount: { amount: '0.00', currency: 'INR' } },
      request: null,
    };
    del.flush(null, { status: 204, statusText: 'No Content' });
    await until(() => !button('Withdraw request'), 'the withdrawal');
  });
});
