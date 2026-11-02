import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';

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

const admin = {
  name: 'ARJUN MEHTA',
  email: 'arjun@campusone.example',
  role: { code: 'PLATFORM_ADMIN', name: 'Platform Administrator' },
  subTasks: ['home.view', 'plans.edit', 'task.home', 'task.tenants'],
  preferredLang: 'en',
};

const MODULES = ['Academics', 'Attendance', 'Transport', 'Fees'];
const plan = {
  id: 'p-1',
  code: 'PL-ESS',
  name: 'Campus Essentials',
  description: 'Smaller schools',
  version: 1,
  cycle: 'MONTHLY',
  price: { amount: '6500.00', currency: 'INR' },
  trialDays: 30,
  modules: ['Academics', 'Attendance', 'Fees'],
  allowances: { members: 800, sms: 3000, whatsapp: 0, storageGb: 20 },
  platformFee: {
    flat: { amount: '1.00', currency: 'INR' },
    upTo: { amount: '100.00', currency: 'INR' },
    percent: '0.50',
  },
  institutions: 2,
  etag: 5,
};

describe('plans & billing (SAS-027…029)', () => {
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

  it('shows the plan cards and saves a change with If-Match after confirming', async () => {
    const harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/backoffice/plans');
    (await request('/api/v1/ops/session')).flush(admin);
    await nav;
    (await request('/api/v1/ops/plans')).flush({ modules: MODULES, items: [plan] });
    (await request('/api/v1/ops/institutions')).flush({ items: [] });
    (await request('/api/v1/ops/invoices')).flush({ items: [] });
    (await request('/api/v1/ops/settings')).flush({
      items: [{ key: 'sas.invoice.gstBp', value: 1800 }],
    });
    for (let i = 0; i < 5; i++) await tick();
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    const card = el.querySelector('.ob-plan') as HTMLElement;
    expect(card.querySelector('h3')?.textContent).toBe('Campus Essentials');
    expect(card.querySelector('.ob-price')?.textContent).toContain('₹6,500');
    expect(card.querySelector('.ob-off')?.textContent).toContain('Transport');
    expect(card.textContent).toContain('₹1.00 per transaction up to ₹100; 0.5% above');

    (card.querySelector('.btn-sec') as HTMLButtonElement).click();
    await tick();
    harness.detectChanges();
    const modal = document.querySelector('.modal') as HTMLElement;
    const price = modal.querySelector('#ob-pl-p') as HTMLInputElement;
    price.value = '7000';
    price.dispatchEvent(new Event('input'));
    (modal.querySelector('#ob-pl-m1') as HTMLInputElement).click(); // Attendance off
    harness.detectChanges();
    [...modal.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Save plan')
      ?.click();
    await tick();
    harness.detectChanges();
    const confirm = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    expect(confirm.textContent).toContain('2 institutions are on this plan.');
    expect(confirm.textContent).toContain(
      'Removing Attendance switches those features off at renewal.',
    );
    [...confirm.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Save plan')
      ?.click();
    const patch = await request('/api/v1/ops/plans/p-1', 'PATCH');
    expect(patch.request.headers.get('If-Match')).toBe('"v5"');
    expect(patch.request.body).toMatchObject({
      name: 'Campus Essentials',
      cycle: 'MONTHLY',
      price: { amount: '7000.00', currency: 'INR' },
      trialDays: 30,
      modules: ['Academics', 'Fees'],
      platformFee: { percent: '0.50' },
    });
  });

  it('lists invoices with their status and records a bank transfer equal to the total (SAS-030, SAS-032)', async () => {
    const harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/backoffice/plans');
    (await request('/api/v1/ops/session')).flush({
      ...admin,
      subTasks: [...admin.subTasks, 'billing.invoice', 'billing.paid'],
    });
    await nav;
    (await request('/api/v1/ops/plans')).flush({ modules: MODULES, items: [plan] });
    (await request('/api/v1/ops/institutions')).flush({ items: [] });
    const today = new Date().toISOString().slice(0, 10);
    (await request('/api/v1/ops/invoices')).flush({
      items: [
        {
          id: 'v-1',
          invoiceNo: 'INV-2026-00012',
          institution: { id: 'i-1', name: 'Tunga Valley Public School' },
          trigger: 'RENEWAL',
          period: '01 Oct 2026 – 31 Oct 2026',
          amount: { amount: '6500.00', currency: 'INR' },
          taxPercent: '18.00',
          tax: { amount: '1170.00', currency: 'INR' },
          total: { amount: '7670.00', currency: 'INR' },
          issuedOn: '2026-09-01',
          dueOn: '2026-09-16',
          graceUntilOn: '2026-09-30',
          status: 'GRACE',
          paidAt: null,
          payment: null,
          lines: [
            {
              description: 'Campus Essentials · monthly · renewal',
              quantity: 1,
              amount: { amount: '6500.00', currency: 'INR' },
            },
          ],
          version: 1,
        },
      ],
    });
    (await request('/api/v1/ops/settings')).flush({ items: [] });
    for (let i = 0; i < 5; i++) await tick();
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    (
      [...el.querySelectorAll('.tab')].find((t) =>
        t.textContent?.includes('Invoices'),
      ) as HTMLElement
    ).click();
    harness.detectChanges();
    const row = el.querySelector('tbody tr') as HTMLElement;
    expect(row.textContent).toContain('INV-2026-00012');
    expect(row.textContent).toContain('₹7,670.00');
    expect(row.textContent).toContain('grace until 30 Sep 2026');
    (row.querySelector('.btn-soft') as HTMLButtonElement).click();
    await tick();
    harness.detectChanges();
    const modal = document.querySelector('.modal') as HTMLElement;
    const set = (sel: string, v: string) => {
      const i = modal.querySelector(sel) as HTMLInputElement;
      i.value = v;
      i.dispatchEvent(new Event('input'));
    };
    set('#ob-ip-ref', 'utr260930118822');
    set('#ob-ip-d', today);
    set('#ob-ip-a', '7000');
    const save = () =>
      [...modal.querySelectorAll('button')]
        .find((b) => b.textContent?.trim() === 'Mark as paid')
        ?.click();
    save();
    harness.detectChanges();
    expect(modal.textContent).toContain('The amount must equal the invoice total of ₹7,670.00.');
    set('#ob-ip-a', '7670');
    save();
    await tick();
    harness.detectChanges();
    const confirm = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    [...confirm.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Mark as paid')
      ?.click();
    const post = await request('/api/v1/ops/invoices/v-1/payments', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({
      utr: 'UTR260930118822',
      amount: { amount: '7670.00', currency: 'INR' },
      paidOn: today,
    });
  });
});
