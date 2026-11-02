import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../Config';
import { appRoutes } from '../../../App.routes';
import { apiInterceptor } from '../../Utils/api';
import type { FeePayPage, FeeReceipt } from './fee-pay.api';

const tick = () => new Promise((r) => setTimeout(r, 0));
const money = (amount: string) => ({ amount, currency: 'INR' as const });
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

async function request(match: (url: string) => boolean, method = 'GET') {
  const ctl = TestBed.inject(HttpTestingController);
  for (let i = 0; i < 60; i++) {
    const found = ctl.match((r) => match(r.urlWithParams) && r.method === method);
    if (found[0]) return found[0];
    await tick();
  }
  throw new Error(`no ${method} request`);
}

const page = (over: Partial<FeePayPage> = {}): FeePayPage => ({
  school: { id: 'i-1', name: 'Tunga Valley Public School' },
  student: { name: 'Asha Rao', admissionNo: 'TVPS/2024/0442', classSection: 'Grade 6 A' },
  year: { label: '2026-27' },
  instalment: { label: 'Term 2', dueDate: '2026-11-15' },
  amount: money('9250.00'),
  status: 'OPEN',
  receiptNo: null,
  transactionId: null,
  receipt: null,
  ...over,
});
const receipt = (over: Partial<FeeReceipt> = {}): FeeReceipt => ({
  collectionId: 'c-43',
  receiptNo: 'TVPS/FR/2026/000043',
  paidAt: '2026-10-22T05:30:00.000Z',
  mode: 'ONLINE',
  paidBy: null,
  transactionId: 'pay_TEST1',
  school: { name: 'Tunga Valley Public School' },
  student: { name: 'Asha Rao', admissionNo: 'TVPS/2024/0442', classSection: 'Grade 6 A' },
  year: '2026-27',
  instalment: { label: 'Term 2', dueDate: '2026-11-15' },
  amount: money('9000.00'),
  fine: money('250.00'),
  total: money('9250.00'),
  ...over,
});
const paid = () =>
  page({
    status: 'PAID',
    receiptNo: 'TVPS/FR/2026/000043',
    transactionId: 'pay_TEST1',
    receipt: receipt(),
  });
const BASE = '/api/v1/public/fee-payments/q-1';

describe('the school fee payment page (FEE-049…051, FEE-055)', () => {
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

  async function open(url = '/fees/pay/q-1?token=tok-1') {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    await settle(2);
    return harness.routeNativeElement as HTMLElement;
  }

  it('lays the instalment out as the admission fee’s checkout, with the admission number', async () => {
    const el = await open();
    const get = await request((u) => u === BASE);
    expect(get.request.headers.get('X-Fee-Pay-Token')).toBe('tok-1');
    get.flush(page());
    await settle();
    expect(text(el.querySelector('.pub-top b'))).toBe('Tunga Valley Public School');
    // The checkout, beside the order summary (client 2026-10-22).
    expect(text(el.querySelector('#fp-card .pa-gw-h'))).toBe('CampusOne PaySecure checkout');
    expect(text(el.querySelector('#fp-amt'))).toBe(
      'Paying Tunga Valley Public School₹9,250.00Term 2 · 2026-27',
    );
    expect(text(el.querySelector('#fp-card .note'))).toContain(
      'Choose Pay ₹9,250.00 to open the secure payment window',
    );
    expect(text(el.querySelector('#fp-pay'))).toBe('Pay ₹9,250.00');
    expect(text(el.querySelector('#fp-card .pa-fine'))).toContain('Secured by the payment gateway');
    const sum = el.querySelector('#fp-sum')!;
    expect(text(sum.querySelector('.eyebrow'))).toBe('Order summary');
    expect(text(sum.querySelector('h3'))).toBe('Tunga Valley Public School');
    expect(text(el.querySelector('#fp-what'))).toBe(
      'StudentAsha RaoAdmission numberTVPS/2024/0442ClassGrade 6 AAcademic year2026-27' +
        'InstalmentTerm 2Due date15 Nov 2026',
    );
    expect(text(el.querySelector('#fp-adm'))).toBe('TVPS/2024/0442');
    expect(text(sum.querySelector('.pa-psum-t'))).toBe('Total₹9,250.00');
    // No order yet: none on the header or in the summary.
    expect(el.querySelector('#fp-order')).toBeNull();
    expect(text(el.querySelector('#fp-what'))).not.toContain('Order');
  });

  it('takes the payment (test checkout), then shows the receipt to download (FEE-055)', async () => {
    const el = await open();
    (await request((u) => u === BASE)).flush(page());
    await settle();
    (el.querySelector('#fp-pay') as HTMLButtonElement).click();
    await settle(1);
    const order = await request((u) => u === `${BASE}/orders`, 'POST');
    expect(order.request.headers.get('Idempotency-Key')).toBeTruthy();
    order.flush({
      amount: money('9250.00'),
      gatewayOrder: {
        orderId: 'order_TEST1',
        amount: money('9250.00'),
        mode: 'test',
        test: { paymentId: 'pay_TEST1', signature: 'sig-1' },
      },
    });
    await settle();
    expect(text(el.querySelector('#fp-test'))).toContain('Test checkout');
    expect(text(el.querySelector('#fp-card .pa-gw-h small'))).toBe('Secure checkout · test mode');
    expect(text(el.querySelector('#fp-order'))).toBe('order_TEST1');
    expect(text(el.querySelector('#fp-what'))).toContain('Orderorder_TEST1');
    (el.querySelector('#fp-test-pay') as HTMLButtonElement).click();
    await settle(1);
    const verify = await request((u) => u === `${BASE}/verify`, 'POST');
    expect(verify.request.body).toEqual({ gatewayPaymentId: 'pay_TEST1', signature: 'sig-1' });
    verify.flush(paid());
    await settle();
    expect(el.querySelector('#fp-pay')).toBeNull();
    const card = el.querySelector('#fp-paid')!;
    expect(text(card.querySelector('h1'))).toBe('Fee paid');
    expect(text(el.querySelector('#fp-rcpt-no'))).toBe('TVPS/FR/2026/000043');
    expect(text(el.querySelector('#fp-txn'))).toBe('pay_TEST1');
    const kv = text(el.querySelector('#fp-receipt'));
    for (const part of [
      'ModeOnline',
      'StudentAsha Rao',
      'Admission numberTVPS/2024/0442',
      'ClassGrade 6 A',
      'Academic year2026-27',
      'InstalmentTerm 2',
      'Due date15 Nov 2026',
      'Fee₹9,000.00',
      'Late fine₹250.00',
      'Total paid₹9,250.00',
    ]) {
      expect(kv).toContain(part);
    }

    // The PDF is saved as a file with the link's token — the page stays.
    const u = URL as unknown as {
      createObjectURL?: (b: Blob) => string;
      revokeObjectURL?: (s: string) => void;
    };
    const before = { create: u.createObjectURL, revoke: u.revokeObjectURL };
    u.createObjectURL = () => 'blob:receipt';
    u.revokeObjectURL = () => undefined;
    const save = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    try {
      (el.querySelector('#fp-receipt-pdf') as HTMLButtonElement).click();
      const pdf = await request((x) => x === `${BASE}/receipt`);
      expect(pdf.request.headers.get('X-Fee-Pay-Token')).toBe('tok-1');
      expect(pdf.request.responseType).toBe('blob');
      pdf.flush(new Blob(['%PDF-1.4'], { type: 'application/pdf' }));
      for (let i = 0; i < 20 && !save.mock.calls.length; i++) await tick();
      expect(save).toHaveBeenCalledTimes(1);
      const a = save.mock.contexts[0] as HTMLAnchorElement;
      expect(a.download).toBe('TVPS-FR-2026-000043.pdf');
      expect(a.href).toBe('blob:receipt');
    } finally {
      save.mockRestore();
      u.createObjectURL = before.create;
      u.revokeObjectURL = before.revoke;
    }
    await settle();
    expect(el.querySelector('#fp-dl-error')).toBeNull();
  });

  it('shows the receipt when a paid link is opened again', async () => {
    const el = await open();
    (await request((u) => u === BASE)).flush(
      page({
        status: 'PAID',
        receiptNo: 'TVPS/FR/2026/000044',
        transactionId: null,
        receipt: receipt({
          receiptNo: 'TVPS/FR/2026/000044',
          mode: 'CASH',
          paidBy: 'RAMESH RAO',
          transactionId: null,
        }),
      }),
    );
    await settle();
    expect(text(el.querySelector('#fp-rcpt-no'))).toBe('TVPS/FR/2026/000044');
    expect(text(el.querySelector('#fp-receipt'))).toContain('Received fromRamesh Rao');
    expect(el.querySelector('#fp-txn')).toBeNull();
    (el.querySelector('#fp-receipt-pdf') as HTMLButtonElement).click();
    // A file is asked for, so a refusal arrives as one too.
    (await request((x) => x === `${BASE}/receipt`)).flush(
      new Blob([JSON.stringify({ status: 404, code: 'FEE.PAY_LINK_INVALID' })], {
        type: 'application/problem+json',
      }),
      { status: 404, statusText: 'Not Found' },
    );
    await settle();
    expect(text(el.querySelector('#fp-dl-error'))).toContain("Couldn't download the receipt.");
  });

  it('says when the fee was paid another way', async () => {
    const el = await open();
    (await request((u) => u === BASE)).flush(page({ status: 'CLOSED' }));
    await settle();
    expect(text(el.querySelector('#fp-closed'))).toContain('already paid');
    expect(text(el.querySelector('#fp-closed'))).toContain('Asha Rao (TVPS/2024/0442)');
    expect(el.querySelector('#fp-pay')).toBeNull();
  });

  it('says when the link is not valid', async () => {
    const el = await open('/fees/pay/q-1?token=old');
    (await request((u) => u === BASE)).flush(
      {
        type: 'urn:campusone:problem:fee.pay_link_invalid',
        title: 'This payment link is not valid or has expired.',
        status: 404,
        code: 'FEE.PAY_LINK_INVALID',
        detail:
          'This payment link is not valid or has expired. Ask the school office for a new one.',
      },
      { status: 404, statusText: 'Not Found' },
    );
    await settle();
    expect(text(el.querySelector('#fp-error'))).toContain('not valid or has expired');
    expect(el.querySelector('#fp-card')).toBeNull();
  });
});
