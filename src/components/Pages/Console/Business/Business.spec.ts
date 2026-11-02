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
import type { MerchantHome } from './business.api';

const tick = () => new Promise((r) => setTimeout(r, 0));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** The visible words, with a space between elements. */
function text(el: Node | null | undefined): string {
  const parts: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) parts.push(n.textContent ?? '');
    else n.childNodes.forEach(walk);
    if (n.nodeType === Node.ELEMENT_NODE) parts.push(' ');
  };
  if (el) walk(el);
  return parts.join('').replace(/\s+/g, ' ').trim();
}
const toasts = () => text(document.querySelector('.toasts'));

async function request(match: (url: string) => boolean, method = 'GET', tries = 80) {
  const ctl = TestBed.inject(HttpTestingController);
  for (let i = 0; i < tries; i++) {
    const found = ctl.match((r) => match(r.urlWithParams) && r.method === method);
    if (found[0]) return found[0];
    await tick();
  }
  throw new Error(`no ${method} request`);
}
function serve(routes: Readonly<Record<string, unknown>>) {
  const ctl = TestBed.inject(HttpTestingController);
  const hit = (r: { method: string; url: string }) => r.method === 'GET' && r.url in routes;
  for (const r of ctl.match(hit) as TestRequest[]) r.flush(routes[r.request.url] as object);
}

const merchantSession = (vendor = false) => ({
  name: vendor ? 'LAB SUPPLIES CO' : 'CAMPUS CANTEEN',
  email: 'canteen@tvps.example.in',
  institution: {
    id: 'i-1',
    name: 'Tunga Valley Public School',
    shortName: 'TVPS',
    city: 'Shivamogga',
  },
  roles: [
    vendor
      ? { code: 'VENDOR_MERCHANT', name: 'Vendor merchant', readOnly: false }
      : { code: 'MERCHANT', name: 'Merchant', readOnly: false },
  ],
  subTasks: [
    'task.business',
    'business.view',
    'business.collect',
    ...(vendor ? ['business.assets'] : []),
  ],
  preferredLang: 'en',
});

const inr = (amount: string) => ({ amount, currency: 'INR' as const });
const home = (over: Partial<MerchantHome['merchant']> = {}): MerchantHome => ({
  merchant: {
    id: 'mer-1',
    displayName: 'Campus Canteen',
    uniqueId: 'TVPS-M-0004',
    subType: 'REGULAR',
    status: 'ACTIVE',
    statusReason: null,
    department: 'Food',
    operator: 'Ramesh',
    mobile: null,
    email: 'canteen@tvps.example.in',
    accepts: { wallet: true, allowance: true, coupon: false },
    channels: { dynamicQr: true, nfc: false },
    isFeeAccount: false,
    today: { amount: inr('1250.00'), count: 18 },
    onboardedAt: '2026-06-01T05:00:00.000Z',
    version: 3,
    ...over,
  },
  today: { gross: inr('1250.00'), count: 18 },
  pendingSettlement: null,
  wallet: { walletNo: '555500012', status: 'ACTIVE', balance: inr('8420.50') },
  qr: [{ id: 'q-1', kind: 'PAYMENT', status: 'ACTIVE' }],
  openRequests: 1,
});

describe('a merchant’s counter on the web (client 2026-10-13)', () => {
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

  async function settle(n = 4) {
    for (let i = 0; i < n; i++) await tick();
    harness.detectChanges();
  }
  async function open(path: string, vendor = false) {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl(path);
    (await request((u) => u === '/api/v1/console/session')).flush(merchantSession(vendor));
    await nav;
    await settle();
    serve({ '/api/v1/languages': { items: [] } });
    return harness.routeNativeElement as HTMLElement;
  }

  it('lands a merchant on the counter’s home with only the Merchant menu (PAY-007)', async () => {
    await open('/console');
    const side = document.querySelector('.c-nav');
    expect([...(side?.querySelectorAll('.nv-par') ?? [])].map((g) => text(g))).toEqual([
      'Merchant',
    ]);
    // A regular merchant has no approved assets.
    expect([...(side?.querySelectorAll('.nv-item') ?? [])].map((a) => text(a))).toEqual([
      'Home',
      'Collect payment',
      'Collections',
      'Settlements',
      'Wallet',
      'QR codes',
      'Notices',
    ]);
    const router = TestBed.inject(Router);
    for (let i = 0; i < 40 && router.url !== '/console/business'; i++) await tick();
    expect(router.url).toBe('/console/business');
    const get = await request((u) => u === '/api/v1/merchant/home');
    expect(get.request.headers.get('X-CampusOne-Surface')).toBe('console');
    get.flush(home());
    await settle();
    const el = harness.routeNativeElement as HTMLElement;
    // The merchant's dashboard (client 2026-10-27): the greeting, then the task cards.
    expect(text(el.querySelector('.c-ph h1'))).toMatch(/^Good (morning|afternoon|evening)$/);
    expect(text(el.querySelector('.c-ph p'))).toBe(
      'Campus Canteen · Merchant ID TVPS-M-0004 · Merchant',
    );
    expect([...el.querySelectorAll('.tl-card .tl-t')].map((c) => text(c))).toEqual(['Merchant']);
    const kpis = text(el.querySelector('#bh-kpis'));
    expect(kpis).toContain('Collected today ₹1,250.00 18 payments');
    expect(kpis).toContain('Wallet balance ₹8,420.50 Wallet 555500012');
    expect(text(el.querySelector('#bh-ways'))).toContain('Dynamic QR for an amount On');
    expect(text(el.querySelector('#bh-ways'))).toContain('Campus card (NFC) Off');
    expect(el.querySelector('#bh-collect')).not.toBeNull();
  });

  it('collects ₹45 with a dynamic QR code and sees it paid (PAY-009, PAY-010)', async () => {
    const el = await open('/console/business-collect');
    (await request((u) => u === '/api/v1/merchant/home')).flush(home());
    await settle();
    // Only the ways the school has switched on.
    expect(el.querySelector('#bc-way-dynamic_qr')).not.toBeNull();
    expect(el.querySelector('#bc-way-nfc')).toBeNull();
    (el.querySelector('#bc-create') as HTMLButtonElement).click();
    await settle(1);
    expect(text(el.querySelector('#bc-form'))).toContain('Enter the amount to collect');

    const amount = el.querySelector('#bc-amount') as HTMLInputElement;
    // Numbers only, in the box too (client 2026-10-14).
    amount.value = '₹4a5';
    amount.dispatchEvent(new Event('input'));
    expect(amount.value).toBe('45');
    (el.querySelector('#bc-create') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/merchant/payment-requests', 'POST');
    expect(post.request.headers.has('Idempotency-Key')).toBe(true);
    expect(post.request.body).toEqual({
      kind: 'DYNAMIC_QR',
      amount: inr('45.00'),
      instrument: 'WALLET',
    });
    post.flush(
      {
        requestId: 'r-1',
        kind: 'DYNAMIC_QR',
        amount: inr('45.00'),
        qrPayload: 'campusone://pay?r=r-1',
        svg: '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
        nonce: null,
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
        ttlSeconds: 120,
      },
      { status: 201, statusText: 'Created' },
    );
    await settle();
    expect(el.querySelector('#bc-qr svg')?.getAttribute('width')).toBe('240');
    expect(text(el.querySelector('#bc-request'))).toContain('Scan with the CampusOne app to pay');
    expect(text(el.querySelector('#bc-status'))).toBe('Waiting for payment');

    // The status is checked every two seconds.
    let poll: TestRequest | undefined;
    for (let i = 0; i < 40 && !poll; i++) {
      await wait(100);
      poll = TestBed.inject(HttpTestingController).match(
        (r) => r.url === '/api/v1/merchant/payment-requests/r-1',
      )[0];
    }
    expect(poll).toBeDefined();
    poll!.flush({
      requestId: 'r-1',
      kind: 'DYNAMIC_QR',
      amount: inr('45.00'),
      status: 'SUCCESS',
      failureCode: null,
      expiresAt: new Date(Date.now() + 100_000).toISOString(),
      payer: 'Kavya Pai',
      receipt: { reference: 'RPEP0000000000000000000000000000045' },
    });
    await settle();
    expect(text(el.querySelector('#bc-done'))).toBe('₹45.00 received');
    expect(text(el.querySelector('#bc-request'))).toContain('from Kavya Pai');
    expect(toasts()).toContain('₹45.00 received');
    (el.querySelector('#bc-again') as HTMLButtonElement).click();
    await settle(1);
    expect(el.querySelector('#bc-qr')).toBeNull();
  }, 20_000);

  it('cancels a waiting request (PAY-011)', async () => {
    const el = await open('/console/business-collect');
    (await request((u) => u === '/api/v1/merchant/home')).flush(home());
    await settle();
    const amount = el.querySelector('#bc-amount') as HTMLInputElement;
    amount.value = '12.50';
    amount.dispatchEvent(new Event('input'));
    (el.querySelector('#bc-create') as HTMLButtonElement).click();
    (await request((u) => u === '/api/v1/merchant/payment-requests', 'POST')).flush({
      requestId: 'r-2',
      kind: 'DYNAMIC_QR',
      amount: inr('12.50'),
      qrPayload: 'x',
      svg: '<svg viewBox="0 0 10 10"></svg>',
      nonce: null,
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
      ttlSeconds: 120,
    });
    await settle();
    (el.querySelector('#bc-cancel') as HTMLButtonElement).click();
    const cancel = await request(
      (u) => u === '/api/v1/merchant/payment-requests/r-2/cancellation',
      'POST',
    );
    cancel.flush({
      requestId: 'r-2',
      kind: 'DYNAMIC_QR',
      amount: inr('12.50'),
      status: 'CANCELLED',
      failureCode: null,
      expiresAt: new Date().toISOString(),
      payer: null,
      receipt: null,
    });
    await settle();
    expect(text(el.querySelector('#bc-ended'))).toBe('Request cancelled');
  });

  it('says so when the school hasn’t switched on collecting an amount', async () => {
    const el = await open('/console/business-collect');
    (await request((u) => u === '/api/v1/merchant/home')).flush(
      home({ channels: { dynamicQr: false, nfc: false } }),
    );
    await settle();
    expect(text(el.querySelector('.empty h4'))).toBe("Collecting an amount isn't switched on");
    expect(el.querySelector('#bc-create')).toBeNull();
  });

  it('filters collections by status with their total (PAY-014)', async () => {
    const el = await open('/console/business-collections');
    const first = await request((u) => u.startsWith('/api/v1/merchant/collections?'));
    expect(first.request.params.get('limit')).toBe('50');
    first.flush({
      items: [
        {
          id: 'c-1',
          reference: 'RPEP0000000000000000000000000000001',
          channel: 'DYNAMIC_QR',
          amount: inr('45.00'),
          status: 'SUCCESS',
          failureCode: null,
          payer: 'Kavya Pai',
          at: '2026-10-13T05:00:00.000Z',
        },
      ],
      nextCursor: null,
      totals: { amount: inr('45.00'), count: 1 },
    });
    await settle();
    expect(text(el.querySelector('#bl-totals'))).toContain('Total ₹45.00');
    expect(text(el.querySelector('#bl-table tbody tr'))).toContain('Kavya Pai');
    expect(text(el.querySelector('#bl-table tbody tr'))).toContain('Dynamic QR');
    (el.querySelector('#bl-st-failure') as HTMLButtonElement).click();
    const failed = await request(
      (u) => u.startsWith('/api/v1/merchant/collections?') && u.includes('status=FAILURE'),
    );
    failed.flush({ items: [], nextCursor: null, totals: { amount: inr('0.00'), count: 0 } });
    await settle();
    expect(text(el.querySelector('#bl-table'))).toContain('No payments in these dates');
  });

  it('opens a settlement with its transactions (STL-012, STL-013)', async () => {
    const el = await open('/console/business-settlements');
    const s = {
      id: 'st-1',
      settlementNo: 'STL-2026-00041',
      date: '2026-10-12',
      status: 'PAID',
      statusLabel: 'Paid out',
      lines: 2,
      gross: inr('100.00'),
      fee: inr('1.00'),
      adjustments: inr('0.00'),
      net: inr('99.00'),
      paidOut: { utr: 'UTR123456', at: '2026-10-13T06:00:00.000Z' },
      carriedForward: false,
    };
    (await request((u) => u === '/api/v1/merchant/settlements')).flush({ items: [s] });
    await settle();
    expect(text(el.querySelector('#bs-kpis'))).toContain('Paid to your bank ₹99.00');
    (el.querySelector('#bs-table tbody tr') as HTMLElement).click();
    (await request((u) => u === '/api/v1/merchant/settlements/st-1')).flush({
      ...s,
      transactions: [
        {
          reference: 'RPEP0000000000000000000000000000001',
          type: 'PAYMENT',
          adjustment: false,
          amount: inr('100.00'),
          fee: inr('1.00'),
          net: inr('99.00'),
          remarks: null,
          at: '2026-10-12T05:00:00.000Z',
          carried: false,
        },
      ],
    });
    await settle();
    const drawer = document.querySelector('.drawer') as HTMLElement;
    expect(text(drawer)).toContain('UTR UTR123456');
    // Amounts are drawn in parts (₹, rupees, paise).
    expect(drawer.querySelector('#bs-lines tbody tr')?.textContent?.replace(/\s+/g, '')).toContain(
      '₹100.00₹1.00₹99.00',
    );
  });

  it('shows a vendor merchant its approved assets (PAY-015)', async () => {
    const el = await open('/console/business-assets', true);
    expect(
      [...(document.querySelectorAll('.c-nav .nv-item, .c-nav .nv-solo') ?? [])].map((a) =>
        text(a),
      ),
    ).toContain('Assets');
    (await request((u) => u === '/api/v1/merchant/assets')).flush({
      items: [
        {
          id: 'as-1',
          name: 'Microscope set',
          type: 'PHYSICAL',
          description: 'Ten student microscopes',
          group: { id: 'g-1', name: 'Science lab' },
        },
      ],
    });
    await settle();
    expect(text(el.querySelector('#ba-table tbody tr'))).toBe(
      'Microscope set Ten student microscopes Physical Science lab',
    );
  });
});
