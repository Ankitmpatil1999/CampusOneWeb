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
  subTasks: [
    'home.view',
    'inst.register',
    'inst.lifecycle',
    'features.edit',
    'task.home',
    'task.tenants',
  ],
  preferredLang: 'en',
};

const plan = {
  id: 'p-1',
  code: 'PL-PLUS',
  name: 'Campus Plus',
  description: null,
  cycle: 'ANNUAL',
  price: { amount: '180000.00', currency: 'INR' },
  trialDays: 30,
  modules: ['Fees', 'Transport'],
  allowances: { members: 2500, sms: 15000, whatsapp: 5000, storageGb: 100 },
};

const row = (over: object) => ({
  id: 'i-1',
  identifier: 'RPETUNSHI000011026',
  name: 'Tunga Valley Public School',
  shortName: 'TVPS',
  city: 'Shivamogga',
  status: 'ACTIVE',
  statusSince: null,
  plan: { id: 'p-1', code: 'PL-PLUS', name: 'Campus Plus', cycle: 'ANNUAL' },
  subscriptionStatus: null,
  trialEndsOn: null,
  members: 3,
  checklist: { done: 9, total: 9 },
  registeredAt: '2021-06-01T05:50:00.000Z',
  ...over,
});

const detail = {
  id: 'i-2',
  identifier: 'RPEHAMSTA000080926',
  name: 'Hampi Heritage School',
  shortName: 'HHS',
  city: 'Hosapete',
  address: 'Station Road, Hosapete',
  pinCode: null,
  board: 'State',
  status: 'PENDING_ACTIVATION',
  suspendedAt: null,
  cancelledAt: null,
  registeredAt: '2026-09-24T05:00:00.000Z',
  corporateCode: 'RPHH',
  poolAccountRef: 'POOLHHS0134',
  plan,
  subscription: { status: null, trialEndsOn: null, renewsOn: null, scheduledChange: null },
  planRequests: [],
  contacts: {
    primary: { name: 'Basavaraj Patil', email: 'secretary@hampi.example.in', mobile: '9880771020' },
    secondary: null,
  },
  administrator: { name: 'REKHA MENON', email: 'rekha.menon@example.com' },
  members: 1,
  checklist: [
    {
      key: 'details',
      label: 'Institution details and administrator',
      owner: 'Operator',
      required: true,
      ref: 'FR-INS-01',
      done: true,
      doneAt: null,
      note: null,
    },
    {
      key: 'branding',
      label: 'Logo and branding',
      owner: 'Institution',
      required: false,
      ref: 'FR-INS-03',
      done: false,
      doneAt: null,
      note: null,
    },
  ],
  missing: [],
  actions: [
    { action: 'ACTIVATE', label: 'Activate', blocked: false },
    { action: 'CANCEL', label: 'Cancel', blocked: false },
  ],
  history: [
    {
      action: 'REGISTERED',
      step: null,
      from: null,
      to: 'PENDING_ACTIVATION',
      reason: 'Signed agreement received',
      at: '2026-09-24T05:00:00.000Z',
      by: 'ARJUN MEHTA',
    },
  ],
  version: 4,
};

describe('back-office institutions (INS-001…008)', () => {
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

  async function open(url: string) {
    const harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl(url);
    (await request('/api/v1/ops/session')).flush(admin);
    await nav;
    return harness;
  }

  it('lists tenants in registration order with status pills; activation asks for a reason', async () => {
    const harness = await open('/backoffice/institutions');
    (await request('/api/v1/ops/institutions')).flush({
      items: [
        row({
          id: 'i-2',
          name: 'Bhadra Valley PU College',
          identifier: 'RPEBHABHR000060926',
          subscriptionStatus: 'TRIAL',
          trialEndsOn: '2026-10-12',
          checklist: { done: 8, total: 9 },
        }),
        row({}),
      ],
    });
    (await request('/api/v1/ops/plans')).flush({ items: [plan] });
    for (let i = 0; i < 5; i++) await tick();
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.querySelector('.c-ph h1')?.textContent).toBe('Institutions');
    const names = [...el.querySelectorAll('tbody .cell-main .cell-t')].map((x) =>
      x.textContent?.trim(),
    );
    expect(names).toEqual(['Tunga Valley Public School', 'Bhadra Valley PU College']);
    const pills = [...el.querySelectorAll('.pill')].map((p) =>
      p.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(pills).toEqual([
      'All2',
      'Active1',
      'Trial1',
      'Pending activation0',
      'Suspended0',
      'Cancelled0',
    ]);
    expect(el.querySelector('tbody tr:nth-child(2)')?.textContent).toContain('ends 12 Oct 2026');

    (el.querySelector('tbody tr:nth-child(2)') as HTMLElement).click();
    (await request('/api/v1/ops/institutions/i-2')).flush(detail);
    await tick();
    harness.detectChanges();
    const drawer = document.querySelector('.drawer') as HTMLElement;
    expect(drawer.querySelector('h3')?.textContent).toContain('Hampi Heritage School');
    const text = drawer.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(text).toContain('Logo and branding (optional)');
    expect(drawer.textContent).toContain('₹1,80,000.00 / year');
    const activate = [...drawer.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Activate',
    ) as HTMLButtonElement;
    activate.click();
    await tick();
    harness.detectChanges();
    const dialog = document.querySelector('.modal') as HTMLElement;
    expect(dialog.querySelector('h3')?.textContent?.trim()).toBe('Activate Hampi Heritage School?');
    const reason = dialog.querySelector('textarea') as HTMLTextAreaElement;
    reason.value = 'Onboarding complete; first invoice paid';
    reason.dispatchEvent(new Event('input'));
    [...dialog.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Activate institution')
      ?.click();
    const post = await request('/api/v1/ops/institutions/i-2/lifecycle-events', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({
      action: 'ACTIVATE',
      reason: 'Onboarding complete; first invoice paid',
    });
  });

  it('registers for a new e-mail and shows the administrator password once (client 2026-10-07)', async () => {
    const harness = await open('/backoffice/institutions');
    (await request('/api/v1/ops/institutions')).flush({ items: [row({})] });
    (await request('/api/v1/ops/plans')).flush({ items: [plan] });
    for (let i = 0; i < 5; i++) await tick();
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    [...el.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Register institution')
      ?.click();
    await tick();
    harness.detectChanges();
    const type = (id: string, v: string) => {
      const input = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;
      input.value = v;
      input.dispatchEvent(new Event('input'));
    };
    type('ob-n-name', 'Kodachadri Vidya Mandira');
    type('ob-n-addr', 'Temple Road, Kollur');
    type('ob-n-city', 'Kollur');
    type('ob-n-pn', 'Suma Bhat');
    type('ob-n-pe', 'suma.bhat@example.in');
    type('ob-n-pp', '9845012311');
    type('ob-n-adm', 'office@kvm.example.in');
    type('ob-n-admn', 'Office Admin');
    type('ob-n-admm', '9845012312');
    harness.detectChanges();
    [...document.querySelectorAll('.modal button')]
      .find((b) => b.textContent?.trim() === 'Register institution')
      ?.dispatchEvent(new Event('click'));
    const post = await request('/api/v1/ops/institutions', 'POST');
    expect(post.request.body).toMatchObject({
      adminEmail: 'office@kvm.example.in',
      adminName: 'Office Admin',
      adminMobile: '9845012312',
    });
    post.flush(
      {
        id: 'i-9',
        identifier: 'RPEKODTEM000091026',
        version: 1,
        administrator: {
          email: 'office@kvm.example.in',
          pending: false,
          accountCreated: true,
          temporaryPassword: 'Xy7kP2mQ9a@1',
        },
      },
      { status: 201, statusText: 'Created' },
    );
    for (let i = 0; i < 5; i++) await tick();
    harness.detectChanges();
    expect(document.getElementById('ob-admin-pw')?.textContent).toBe('Xy7kP2mQ9a@1');
    // Not closed until the operator confirms the password is noted.
    (document.getElementById('ob-admin-pw-done') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(document.getElementById('ob-admin-pw-ok-e')?.textContent).toContain(
      "it can't be shown again",
    );
    (document.getElementById('ob-admin-pw-ok') as HTMLInputElement).click();
    (document.getElementById('ob-admin-pw-done') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(document.getElementById('ob-admin-pw')).toBeNull();
  });

  it('switches a feature with If-Match and an optional reason (INS-008)', async () => {
    const harness = await open('/backoffice/features?inst=i-1');
    (await request('/api/v1/ops/institutions')).flush({ items: [row({})] });
    const view = {
      institution: {
        id: 'i-1',
        name: 'Tunga Valley Public School',
        shortName: 'TVPS',
        status: 'ACTIVE',
      },
      plan: { id: 'p-1', name: 'Campus Plus', code: 'PL-PLUS' },
      features: [
        {
          key: 'transport',
          label: 'Transport',
          sub: 'Routes, trips and live tracking',
          consoleLabel: 'Transport',
          consoleSub: 'Routes',
          icon: 'bus',
          module: 'Transport',
          group: 'Campus',
          cr: null,
          enabled: false,
          lock: null,
        },
      ],
      channels: [],
      version: 7,
    };
    (await request('/api/v1/ops/institutions/i-1/features')).flush(view);
    (await request('/api/v1/ops/feature-change-log?institutionId=i-1')).flush({ items: [] });
    for (let i = 0; i < 5; i++) await tick();
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    const toggle = el.querySelector('.ob-frow .toggle') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    toggle.click();
    await tick();
    harness.detectChanges();
    const dialog = document.querySelector('.modal') as HTMLElement;
    expect(dialog.querySelector('h3')?.textContent?.trim()).toBe(
      'Turn on Transport for Tunga Valley Public School?',
    );
    [...dialog.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Turn on')
      ?.click();
    const patch = await request('/api/v1/ops/institutions/i-1/features', 'PATCH');
    expect(patch.request.headers.get('If-Match')).toBe('"v7"');
    expect(patch.request.body).toEqual({ changes: [{ key: 'transport', enabled: true }] });
  });
  it('changes a running plan: an upgrade now shows the prorated amount (SAS-034)', async () => {
    const harness = await open('/backoffice/institutions');
    (await request('/api/v1/ops/institutions')).flush({ items: [row({})] });
    const pro = {
      ...plan,
      id: 'p-2',
      code: 'PL-PRO',
      name: 'Campus Pro',
      price: { amount: '320000.00', currency: 'INR' },
    };
    (await request('/api/v1/ops/plans')).flush({ items: [plan, pro] });
    for (let i = 0; i < 5; i++) await tick();
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    (el.querySelector('tbody tr') as HTMLElement).click();
    // Renewal 100 days from today (IST), so the expected amount is exact.
    const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
    const renews = new Date(Date.parse(today) + 100 * 86_400_000).toISOString().slice(0, 10);
    (await request('/api/v1/ops/institutions/i-1')).flush({
      ...detail,
      id: 'i-1',
      name: 'Tunga Valley Public School',
      status: 'ACTIVE',
      subscription: {
        status: 'ACTIVE',
        trialEndsOn: null,
        renewsOn: renews,
        scheduledChange: null,
      },
      planRequests: [
        {
          id: 'r-1',
          plan: { id: 'p-2', name: 'Campus Pro' },
          timing: 'NOW',
          note: 'Hostel block opens in June',
          status: 'PENDING',
          requestedAt: '2026-10-01T05:00:00.000Z',
          requestedBy: 'PRAKASH SHETTY',
          resolvedAt: null,
          resolution: null,
        },
      ],
      actions: [],
    });
    await tick();
    harness.detectChanges();
    const drawer = document.querySelector('.drawer') as HTMLElement;
    expect(drawer.textContent).toContain('Plan change requested: Campus Pro');
    [...drawer.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Apply')?.click();
    await tick();
    harness.detectChanges();
    const dialog = document.querySelector('.modal') as HTMLElement;
    // (₹3,20,000 − ₹1,80,000) × 100 / 365 = ₹38,356.16
    expect(dialog.querySelector('.note')?.textContent).toContain(
      'Billed now: ₹38,356.16 + GST for the 100 days',
    );
    [...dialog.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Change plan')
      ?.click();
    await tick();
    harness.detectChanges();
    (await request('/api/v1/ops/institutions/i-1/features')).flush({
      features: [],
      channels: [],
      version: 7,
    });
    for (let i = 0; i < 3; i++) await tick();
    harness.detectChanges();
    const confirm = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    [...confirm.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Change plan')
      ?.click();
    const post = await request('/api/v1/ops/institutions/i-1/plan-changes', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({
      planId: 'p-2',
      timing: 'NOW',
      reason: 'Requested by the institution',
    });
  });
});
