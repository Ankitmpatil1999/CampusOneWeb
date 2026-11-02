import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import { istBusinessDate } from '../../../Utils/format';

const tick = () => new Promise((r) => setTimeout(r, 0));

async function request(url: string, method = 'GET') {
  const ctl = TestBed.inject(HttpTestingController);
  for (let i = 0; i < 60; i++) {
    const found = ctl.match((r) => r.urlWithParams === url && r.method === method);
    if (found[0]) return found[0];
    await tick();
  }
  throw new Error(`no ${method} ${url}`);
}

const session = (readOnly = false) => ({
  name: 'PRAKASH SHETTY',
  email: 'prakash.shetty@tvps.example.in',
  institution: {
    id: 'i-1',
    name: 'Tunga Valley Public School',
    shortName: 'TVPS',
    city: 'Shivamogga',
  },
  roles: [
    readOnly
      ? { code: 'MANAGEMENT', name: 'Management', readOnly: true }
      : { code: 'INSTITUTION_ADMIN', name: 'Institution Administrator', readOnly: false },
  ],
  subTasks: readOnly
    ? ['home.view', 'config.view', 'task.home', 'task.config']
    : ['home.view', 'config.view', 'config.edit', 'task.home', 'task.config'],
  preferredLang: 'en',
});

const money = (amount: string) => ({ amount, currency: 'INR' });
const plan = (id: string, name: string, price: string, modules: string[]) => ({
  id,
  code: id,
  name,
  description: null,
  cycle: 'ANNUAL',
  price: money(price),
  trialDays: 30,
  modules,
  allowances: { members: 3000, sms: 30000, whatsapp: 0, storageGb: 25 },
  version: 1,
  platformFee: { flat: money('1.00'), upTo: money('100.00'), percent: '0.50' },
  etag: 1,
});
const today = istBusinessDate();
const invoice = {
  id: 'v-1',
  invoiceNo: 'INV-2026-00012',
  institution: { id: 'i-1', name: 'Tunga Valley Public School' },
  trigger: 'PLAN_ACTIVATION',
  period: '01 Apr 2026 – 31 Mar 2027',
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
};
const summary = {
  institution: { name: 'Tunga Valley Public School', status: 'ACTIVE' },
  subscription: {
    status: 'ACTIVE',
    since: '2026-04-01T04:30:00.000Z',
    periodStart: '2026-04-01',
    periodEnd: '2027-03-31',
    renewsOn: '2027-04-01',
    trialEndsOn: null,
  },
  plan: plan('p-plus', 'Campus Plus', '180000.00', ['Academics', 'Fees']),
  modules: [
    { module: 'Academics', included: true },
    { module: 'Point of sale', included: false },
  ],
  scheduledChange: null,
  usage: { members: 1240, sms: null, whatsapp: null, storageBytes: 0 },
  billing: {
    renewalBillDaysBefore: 15,
    dueDays: 15,
    graceDays: 14,
    gstPercent: '18.00',
    smsOverage: money('0.25'),
    whatsappOverage: money('0.80'),
  },
  plans: [
    plan('p-plus', 'Campus Plus', '180000.00', ['Academics']),
    plan('p-pro', 'Campus Pro', '320000.00', ['Academics', 'Point of sale']),
  ],
  invoices: [invoice],
  requests: [],
};

describe('console Plan & billing (SAS-026, SAS-037…039)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: CAMPUSONE_WEB_CONFIG, useValue: WEB_CONFIG },
        provideRouter(appRoutes),
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
      ],
    });
  });

  async function open(readOnly = false) {
    const harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/subscription');
    (await request('/api/v1/console/session')).flush(session(readOnly));
    await nav;
    (await request('/api/v1/console/subscription')).flush(summary);
    for (let i = 0; i < 5; i++) await tick();
    harness.detectChanges();
    return harness;
  }

  const click = (root: ParentNode, label: string) =>
    [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)?.click();

  it('shows the plan, modules and the due invoice; requests another plan', async () => {
    const harness = await open();
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.querySelector('.cp-plan-h h2')?.textContent).toContain('Campus Plus');
    expect(el.querySelector('.cp-mod.off')?.textContent).toContain('Point of sale');
    expect(el.textContent).toContain('Invoice INV-2026-00012 is due');
    expect(el.textContent).toContain('₹1.00 per merchant transaction up to ₹100, otherwise 0.5%');

    click(el, 'Request a plan change');
    harness.detectChanges();
    const modal = document.querySelector('.modal') as HTMLElement;
    const choices = [...modal.querySelectorAll('.choice')] as HTMLElement[];
    expect(choices[0]?.textContent).toContain('Campus Plus · current');
    choices[1]!.click();
    harness.detectChanges();
    click(modal, 'Send request');
    const post = await request('/api/v1/console/subscription/plan-change-requests', 'POST');
    expect(post.request.body).toEqual({ planId: 'p-pro', timing: 'RENEWAL', note: null });
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    post.flush({ id: 'r-1', status: 'PENDING' });
    (await request('/api/v1/console/subscription')).flush(summary);
  });

  it('reports a bank transfer with the reference and date', async () => {
    const harness = await open();
    const el = harness.routeNativeElement as HTMLElement;
    click(el, 'Pay now');
    harness.detectChanges();
    const modal = document.querySelector('.modal') as HTMLElement;
    click(modal, 'Report the transfer');
    harness.detectChanges();
    expect(modal.querySelector('.fld.invalid .fld-e')?.textContent).toContain('required');
    const utr = modal.querySelector('#cp-pay-utr') as HTMLInputElement;
    utr.value = 'sbin826087731';
    utr.dispatchEvent(new Event('input'));
    harness.detectChanges();
    click(modal, 'Report the transfer');
    const post = await request('/api/v1/console/invoices/v-1/transfer-reports', 'POST');
    expect(post.request.body).toEqual({ utr: 'SBIN826087731', paidOn: today });
    post.flush({
      ...invoice,
      transfer: { utr: 'SBIN826087731', paidOn: today, reportedAt: today },
    });
    (await request('/api/v1/console/subscription')).flush(summary);
  });

  it('is read-only for Management', async () => {
    const harness = await open(true);
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.textContent).toContain('Management has read-only access');
    const ask = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Request a plan change'),
    ) as HTMLButtonElement;
    expect(ask.disabled).toBe(true);
    expect([...el.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Pay')).toBe(
      false,
    );
  });
});
