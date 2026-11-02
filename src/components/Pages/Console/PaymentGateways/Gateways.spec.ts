import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import type { PaymentGatewayView } from './gateways.api';

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

const session = (subTasks: string[]) => ({
  name: 'LATHA RAO',
  email: 'accounts@tvps.example.in',
  institution: { id: 'i-1', name: 'Tunga Valley Public School', shortName: 'TVPS', city: 'X' },
  roles: [{ code: 'ACCOUNTANT', name: 'Accountant', readOnly: false }],
  subTasks: ['home.view', 'task.home', 'task.gateways', ...subTasks],
  preferredLang: 'en',
});

const gateway = (over: Partial<PaymentGatewayView> = {}): PaymentGatewayView => ({
  id: 'g-1',
  provider: 'RAZORPAY',
  providerName: 'Razorpay',
  label: 'School fees account',
  keyIdHint: 'rzp_test_••••eK0',
  environment: 'TEST',
  status: 'ACTIVE',
  isDefault: true,
  hasWebhookSecret: true,
  hasMerchantId: false,
  webhookUrl: 'http://localhost:4200/api/v1/partners/gateway/webhooks/g-1',
  lastCheck: { at: '2026-10-09T05:00:00.000Z', ok: true, note: 'Razorpay accepted the keys' },
  version: 1,
  updatedAt: '2026-10-09T05:00:00.000Z',
  ...over,
});

describe('console payment gateways (INS-038…041; client 2026-10-09)', () => {
  let harness: RouterTestingHarness;

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

  async function settle(n = 5) {
    for (let i = 0; i < n; i++) await tick();
    harness.detectChanges();
  }
  const root = () => harness.routeNativeElement as HTMLElement;
  const text = (sel: string) => root().querySelector(sel)?.textContent?.replace(/\s+/g, ' ') ?? '';
  const button = (label: string) =>
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.trim() === label,
    );
  const type = (id: string, v: string) => {
    const el = document.getElementById(id) as HTMLInputElement;
    el.value = v;
    el.dispatchEvent(new Event('input'));
  };

  async function open(subTasks: string[], items: PaymentGatewayView[], platformInUse = false) {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/gateways');
    (await request('/api/v1/console/session')).flush(session(subTasks));
    await nav;
    (await request('/api/v1/console/payment-gateways')).flush({
      providers: [{ code: 'RAZORPAY', name: 'Razorpay' }],
      items,
      platform: { provider: 'Razorpay', inUse: platformInUse },
    });
    await settle();
  }

  it('lists the gateways with the masked key, default and last check', async () => {
    await open(
      ['gateways.view', 'gateways.edit'],
      [
        gateway(),
        gateway({
          id: 'g-2',
          label: 'Transport fees',
          keyIdHint: 'rzp_live_••••222',
          environment: 'LIVE',
          isDefault: false,
          lastCheck: { at: '2026-10-09T05:00:00.000Z', ok: false, note: 'Refused the key' },
        }),
      ],
    );
    expect(text('#pg-table')).toContain('rzp_test_••••eK0');
    expect(text('#pg-table')).toContain('Default');
    expect(text('#pg-table')).toContain('Not accepted');
    expect(text('#pg-table')).toContain('Refused the key');
    expect(button('Make default')).toBeTruthy();
  });

  it('adds a gateway: the keys go to the server once and are not shown again', async () => {
    await open(['gateways.view', 'gateways.edit'], [], true);
    expect(text('.c-page')).toContain('No payment gateway yet');
    // Razorpay by default: CampusOne's account until the school adds its own.
    expect(text('#pg-platform')).toContain("CampusOne's Razorpay account");
    button('Add a gateway')!.click();
    await settle();
    button('Add gateway')!.click();
    await settle();
    expect(document.getElementById('pg-label')!.closest('.fld')!.classList).toContain('invalid');
    type('pg-label', 'School fees account');
    type('pg-key', 'rzp_test_TXtPkPTrdeekK0');
    type('pg-secret', 'a-secret-value');
    type('pg-hook', 'hook-secret');
    await settle();
    button('Add gateway')!.click();
    const post = await request('/api/v1/console/payment-gateways', 'POST');
    expect(post.request.headers.has('Idempotency-Key')).toBe(true);
    expect(post.request.body).toEqual({
      provider: 'RAZORPAY',
      label: 'School fees account',
      keyId: 'rzp_test_TXtPkPTrdeekK0',
      keySecret: 'a-secret-value',
      webhookSecret: 'hook-secret',
    });
    post.flush(gateway(), { status: 201, statusText: 'Created' });
    (await request('/api/v1/console/payment-gateways')).flush({
      providers: [{ code: 'RAZORPAY', name: 'Razorpay' }],
      items: [gateway()],
    });
    await settle();
    expect(document.body.textContent).not.toContain('a-secret-value');
    expect(document.body.textContent).not.toContain('rzp_test_TXtPkPTrdeekK0');
  });

  it('changes a gateway without resending its secret, and is read-only without the task', async () => {
    await open(['gateways.view', 'gateways.edit'], [gateway()]);
    button('Change')!.click();
    await settle();
    expect(document.body.textContent).toContain(gateway().webhookUrl);
    type('pg-label', 'Main fees account');
    await settle();
    button('Save changes')!.click();
    const patch = await request('/api/v1/console/payment-gateways/g-1', 'PATCH');
    expect(patch.request.headers.get('If-Match')).toBe('"v1"');
    expect(patch.request.body).toEqual({ label: 'Main fees account' });
    patch.flush(gateway({ label: 'Main fees account', version: 2 }));

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: CAMPUSONE_WEB_CONFIG, useValue: WEB_CONFIG },
        provideRouter(appRoutes),
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    await open(['gateways.view'], [gateway()]);
    expect(button('Change')).toBeUndefined();
    expect(button('Add a gateway')!.disabled).toBe(true);
  });
});
