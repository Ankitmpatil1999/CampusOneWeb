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
import { translate } from '../../../Utils/translate';
import type { AdmissionFee, AdmissionFees } from './admission-fees.api';

const tick = () => new Promise((r) => setTimeout(r, 0));
const money = (amount: string) => ({ amount, currency: 'INR' as const });
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const toasts = () => text(document.querySelector('.toasts'));
const today = istBusinessDate(new Date());

async function request(match: (url: string) => boolean, method = 'GET') {
  const ctl = TestBed.inject(HttpTestingController);
  for (let i = 0; i < 60; i++) {
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

const session = (over: object = {}) => ({
  name: 'DEEPA NAYAK',
  email: 'accounts@tvps.example.in',
  institution: {
    id: 'i-1',
    name: 'Tunga Valley Public School',
    shortName: 'TVPS',
    city: 'Shivamogga',
  },
  roles: [{ code: 'ACCOUNTANT', name: 'Accountant', readOnly: false }],
  // Accounts confirms the fees received (client 2026-10-09).
  subTasks: [
    'task.admfees',
    'admfees.view',
    'admfees.collect',
    'admfees.verify',
    'fees.view',
    'task.admissions',
    'admissions.view',
  ],
  preferredLang: 'en',
  ...over,
});

const fee = (over: Partial<AdmissionFee> = {}): AdmissionFee => ({
  applicationId: 'a-1',
  applicationNo: 'TVPS/2026/000001',
  applicationStatus: 'APPROVED',
  student: 'Kiran Bhat',
  admissionNo: 'TVPS/2026/0201',
  class: 'Grade 6 B',
  year: '2026-27',
  feeType: 'ADMISSION',
  paymentId: null,
  amount: money('10000.00'),
  status: 'PENDING',
  mode: null,
  receiptNo: null,
  paidAt: null,
  paidBy: null,
  ...over,
});
const appPaid = () =>
  fee({
    feeType: 'APPLICATION',
    paymentId: 'p-1',
    amount: money('500.00'),
    status: 'PAID',
    mode: 'CASH',
    receiptNo: 'TVPS/R/2026/000005',
    paidAt: '2026-10-02T03:41:47.562Z',
    paidBy: 'Mohan Bhat',
  });
const appDue = () =>
  fee({
    applicationId: 'a-2',
    applicationNo: 'TVPS/2026/000002',
    applicationStatus: 'DRAFT',
    student: 'Kavya Nayak',
    admissionNo: null,
    class: 'Grade 2',
    feeType: 'APPLICATION',
    paymentId: 'p-2',
    amount: money('500.00'),
  });
const fees = (items: AdmissionFee[]): AdmissionFees => ({
  items,
  totals: { collected: money('500.00'), pending: money('10500.00'), paidCount: 1, pendingCount: 2 },
});
const entry = {
  items: [
    {
      year: { id: 'y-27', label: '2027-28', status: 'OPEN', current: false },
      fees: {
        applicationFee: money('500.00'),
        applicationMandatory: true,
        admissionFee: money('10000.00'),
        updatedAt: null,
        version: 1,
      },
    },
    {
      year: { id: 'y-26', label: '2026-27', status: 'OPEN', current: true },
      fees: {
        applicationFee: money('500.00'),
        applicationMandatory: true,
        admissionFee: money('10000.00'),
        updatedAt: null,
        version: 1,
      },
    },
  ],
};

describe('console admission fees (ADM-021…024)', () => {
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

  const counts = async (yearId: string) =>
    (await request((u) => u === `/api/v1/console/applications?yearId=${yearId}`)).flush({
      items: [],
      nextCursor: null,
      counts: { DRAFT: 1, APPROVED: 1, REJECTED: 1 },
      kpis: null,
    });

  async function open(items: AdmissionFee[] = [fee(), appPaid(), appDue()], s: object = session()) {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/admfees');
    (await request((u) => u === '/api/v1/console/session')).flush(s);
    await nav;
    serve({ '/api/v1/console/entry-fees': entry });
    // The next intake is chosen while the current year runs.
    (await request((u) => u === '/api/v1/console/admission-fees?yearId=y-27')).flush(fees([]));
    await counts('y-27');
    await settle();
    const el = harness.routeNativeElement as HTMLElement;
    ([...el.querySelectorAll('.seg button')] as HTMLButtonElement[])
      .find((b) => text(b) === '2026-27')!
      .click();
    (await request((u) => u === '/api/v1/console/admission-fees?yearId=y-26')).flush(fees(items));
    await counts('y-26');
    await settle();
    return el;
  }

  const confirm = async () => {
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    await settle(2);
  };
  const pill = async (el: HTMLElement, label: string) => {
    ([...el.querySelectorAll('.pill')] as HTMLButtonElement[])
      .find((b) => text(b).startsWith(label))!
      .click();
    await settle();
  };
  const rows = (el: HTMLElement) => [...el.querySelectorAll('#af-fees tbody tr')];
  const button = (root: Element, label: string) =>
    ([...root.querySelectorAll('button')] as HTMLButtonElement[]).find((b) => text(b) === label);
  /** The Collect fees dialog (client 2026-10-22) and its ways. */
  const chooser = () =>
    [...document.querySelectorAll('.modal')].find((m) =>
      m.querySelector('#cf-body'),
    ) as HTMLElement;
  const ways = (m: Element) => [...m.querySelectorAll('.choice')] as HTMLElement[];
  /** Collect fees on a fee cell, then a way and its button. */
  async function collect(cell: Element, way: 'PAY_NOW' | 'LINK' | 'CASH') {
    button(cell, 'Collect fees')!.click();
    await settle();
    const m = chooser();
    (m.querySelector(`#cw-${way}`) as HTMLElement).click();
    await settle();
    (m.querySelector('#cf-go') as HTMLButtonElement).click();
    await settle();
  }

  it('lets Accounts confirm a paid fee once (ADM-031, client 2026-10-09)', async () => {
    const el = await open();
    // Only the application whose fee is paid waits for a confirmation.
    await pill(el, 'To confirm');
    expect(rows(el)).toHaveLength(1);
    expect(text(rows(el)[0]!.querySelector('.af-app'))).toContain('Paid · to confirm');
    (rows(el)[0]!.querySelector('.af-app .af-confirm') as HTMLButtonElement).click();
    await confirm();
    const post = await request(
      (u) => u === '/api/v1/console/admission-payments/p-1/confirmation',
      'POST',
    );
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    post.flush({ paymentId: 'p-1', confirmedAt: '2026-10-09T05:00:00.000Z', application: {} });
    (await request((u) => u === '/api/v1/console/admission-fees?yearId=y-26')).flush(
      fees([fee(), { ...appPaid(), confirmedAt: '2026-10-09T05:00:00.000Z' }, appDue()]),
    );
    await counts('y-26');
    await settle();
    expect(toasts()).toContain('Receipt confirmed');
    expect(el.querySelectorAll('#af-fees .af-confirm')).toHaveLength(0);
  });

  it('keeps the confirmation to Accounts', async () => {
    const el = await open(
      undefined,
      session({
        subTasks: [
          'task.admfees',
          'admfees.view',
          'admfees.collect',
          'fees.view',
          'admissions.view',
        ],
      }),
    );
    const btn = el.querySelector('#af-fees .af-confirm') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.parentElement?.getAttribute('title')).toBe(
      'Only Accounts confirms that a fee was received.',
    );
  });

  it('shows the year’s figures and each application with both its fees on one row (client 2026-10-12)', async () => {
    const el = await open();
    expect(text(el.querySelector('#af-head'))).toContain(
      'Application ₹500.00 · admission ₹10,000.00 — paid online with the form, or later at the desk',
    );
    const kpis = [...el.querySelectorAll('.kpi')].map((k) => text(k));
    expect(kpis[0]).toContain('₹500');
    expect(kpis[0]).toContain('1 of 3 applications paid');
    expect(kpis[1]).toContain('0 of 1 student');
    expect(kpis[2]).toContain('₹10,000');
    expect(kpis[3]).toContain('1');
    // One list instead of the admission and application fee tabs.
    expect([...el.querySelectorAll('.tab')].map((t) => text(t))).toEqual([
      'Fees by application 2',
      'Receipts 1',
    ]);
    expect(text(el.querySelector('.fsum'))).toBe(
      '2 applications · ₹10,500 due · 1 receipt to confirm',
    );
    const [kiran, kavya] = rows(el);
    expect(rows(el)).toHaveLength(2);
    expect(text(kiran!.querySelector('td'))).toContain('Grade 6 B · TVPS/2026/0201');
    expect(text(kiran!.querySelector('.af-app'))).toContain('₹500.00Paid · to confirm');
    expect(text(kiran!.querySelector('.af-app'))).toContain(
      'Cash · TVPS/R/2026/000005 · 02 Oct 2026',
    );
    expect(button(kiran!.querySelector('.af-app')!, 'Confirm receipt')).toBeTruthy();
    expect(button(kiran!.querySelector('.af-app')!, 'Receipt')).toBeTruthy();
    expect(text(kiran!.querySelector('.af-adm'))).toContain('₹10,000.00Pending');
    // One button asks how (client 2026-10-22).
    expect(button(kiran!.querySelector('.af-adm')!, 'Collect fees')).toBeTruthy();
    expect(button(kiran!.querySelector('.af-adm')!, 'Collect online')).toBeFalsy();
    expect(button(kiran!.querySelector('.af-adm')!, 'Record cash')).toBeFalsy();
    expect(text(kiran!.querySelector('.af-state'))).toBe(
      'Fees due₹10,000 to collect · 1 receipt to confirm',
    );
    // A declared draft: its application fee submits it; the admission fee comes after.
    expect(text(kavya!.querySelector('.af-app'))).toContain('Declared — submitted once paid');
    expect(button(kavya!.querySelector('.af-app')!, 'Collect fees')).toBeTruthy();
    expect(text(kavya!.querySelector('.af-adm'))).toBe('Due once submitted');

    await pill(el, 'Fees due');
    expect(rows(el)).toHaveLength(2);
    await pill(el, 'Confirmed');
    expect(text(el.querySelector('#af-fees tbody'))).toContain('No applications match');
    el.querySelector<HTMLInputElement>('#af-q')!.value = 'kavya';
    el.querySelector<HTMLInputElement>('#af-q')!.dispatchEvent(new Event('input'));
    await pill(el, 'All');
    expect(rows(el)).toHaveLength(1);
    expect(text(rows(el)[0])).toContain('Kavya Nayak');

    (el.querySelector('#af-tab-rcpt') as HTMLButtonElement).click();
    await settle();
    const r = el.querySelectorAll('#af-rcpt tbody tr');
    expect(r).toHaveLength(1);
    expect(text(r[0])).toContain('TVPS/R/2026/000005');
    expect(text(r[0])).toContain('Paid · to confirm');
    // The payment gateway's transaction ID of an online payment, else a dash (client 2026-10-16).
    const heads = [...el.querySelectorAll('#af-rcpt thead th')].map((h) => text(h));
    const col = heads.indexOf('Transaction ID');
    expect(col).toBeGreaterThan(-1);
    // A cash receipt has none.
    expect(text(r[0]!.querySelectorAll('td')[col])).toBe('—');
  });

  it('keeps the admission fee’s payment link closed while the application fee is due (client 2026-10-12)', async () => {
    const later = {
      applicationId: 'a-5',
      applicationNo: 'TVPS/2026/000005',
      applicationStatus: 'SUBMITTED' as const,
      student: 'Nisha Pai',
      admissionNo: null,
    };
    const el = await open([
      fee({ ...later, feeType: 'APPLICATION', paymentId: 'p-5', amount: money('500.00') }),
      fee({ ...later }),
    ]);
    const due =
      'The application fee is due first — the admission fee can’t be paid online on its own';
    const adm = rows(el)[0]!.querySelector('.af-adm')!;
    button(adm, 'Collect fees')!.click();
    await settle();
    let m = chooser();
    expect(text(m.querySelector('h3'))).toBe('Collect fees · Nisha Pai');
    // The same three ways as Collect fee on the fee collection page, in the same order.
    expect(ways(m).map((w) => text(w.querySelector('.t-h4')))).toEqual([
      'Pay now',
      'Send link',
      'Record cash',
    ]);
    const [payNow, link, cash] = ways(m);
    expect(payNow!.classList.contains('off')).toBe(true);
    expect(text(payNow!.querySelector('.cw-sub'))).toBe(due);
    expect(link!.classList.contains('off')).toBe(true);
    expect(text(link!.querySelector('.cw-sub'))).toBe(due);
    // Cash at the desk stays open.
    expect(cash!.classList.contains('off')).toBe(false);
    (m.querySelector('#cf-go') as HTMLButtonElement).click();
    payNow!.click();
    await settle();
    expect((m.querySelector('#cf-go') as HTMLButtonElement).disabled).toBe(true);
    ([...m.querySelectorAll('.sh-f button')] as HTMLButtonElement[])
      .find((b) => text(b) === 'Cancel')!
      .click();
    await settle();

    // The application fee: paid now or in cash; a payment link is for the admission fee.
    button(rows(el)[0]!.querySelector('.af-app')!, 'Collect fees')!.click();
    await settle();
    m = chooser();
    const [appPay, appLink, appCash] = ways(m);
    expect(appPay!.classList.contains('off')).toBe(false);
    expect(appLink!.classList.contains('off')).toBe(true);
    expect(text(appLink!.querySelector('.cw-sub'))).toBe(
      'The family pays the application fee with the form — a payment link is for the admission fee',
    );
    expect(appCash!.classList.contains('off')).toBe(false);
  });

  it('shows an application with both fees confirmed, and a rejected one without collection', async () => {
    const at = '2026-10-05T05:00:00.000Z';
    const done = (over: Partial<AdmissionFee>) =>
      fee({ status: 'PAID', mode: 'ONLINE', paidAt: at, confirmedAt: at, ...over });
    const el = await open([
      done({ feeType: 'APPLICATION', paymentId: 'p-1', amount: money('500.00'), receiptNo: 'R-1' }),
      done({ paymentId: 'p-2', receiptNo: 'R-2', transactionId: 'pay_NZ8yq3LkT2' }),
      fee({
        applicationId: 'a-3',
        applicationNo: 'TVPS/2026/000003',
        applicationStatus: 'REJECTED',
        student: 'Ravi Kumar',
        admissionNo: null,
        feeType: 'APPLICATION',
        paymentId: 'p-3',
        amount: money('500.00'),
      }),
    ]);
    const [kiran, ravi] = rows(el);
    expect(text(kiran!.querySelector('.af-state'))).toBe(
      'ConfirmedBoth fees confirmed · admission no. assigned',
    );
    expect(text(kiran!.querySelector('.af-adm'))).toContain(
      'Online · R-2 · 05 Oct 2026 · confirmed 05 Oct 2026',
    );
    expect(kiran!.querySelector('.af-confirm, .af-collect')).toBeNull();
    expect(text(ravi!.querySelector('.af-state'))).toBe('RejectedFees are not collected');
    expect(text(ravi!.querySelector('.af-app'))).toContain('Application rejected — not collected');
    expect(ravi!.querySelector('button')).toBeNull();
    expect(text(el.querySelector('.fsum'))).toBe('2 applications');
    await pill(el, 'Confirmed');
    expect(rows(el)).toHaveLength(1);
    await pill(el, 'Fees due');
    expect(text(el.querySelector('#af-fees tbody'))).toContain('No applications match');

    // The receipts list and the receipt show the gateway's transaction ID (client 2026-10-16).
    await pill(el, 'All');
    (el.querySelector('#af-tab-rcpt') as HTMLButtonElement).click();
    await settle();
    const online = [...el.querySelectorAll('#af-rcpt tbody tr')].find((x) =>
      text(x).includes('R-2'),
    ) as HTMLElement;
    expect(text(online)).toContain('pay_NZ8yq3LkT2');
    online.click();
    await settle();
    expect(text(document.querySelector('#rc-txn'))).toBe('pay_NZ8yq3LkT2');
  });

  it('points Accounts to receipts waiting in another year, such as a mid-term admission', async () => {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/admfees');
    (await request((u) => u === '/api/v1/console/session')).flush(session());
    await nav;
    serve({ '/api/v1/console/entry-fees': entry });
    // The page opens on the next intake (2027-28); the paid fee is in 2026-27, the year under way.
    (await request((u) => u === '/api/v1/console/admission-fees?yearId=y-27')).flush(fees([]));
    (await request((u) => u === '/api/v1/console/admission-fees?status=PAID')).flush(
      fees([appPaid()]),
    );
    await counts('y-27');
    await settle();
    const el = harness.routeNativeElement as HTMLElement;
    expect(text(el.querySelector('#af-elsewhere'))).toContain(
      '1 receipt waiting for Accounts in 2026-27.',
    );
    expect(text(el.querySelector('#af-elsewhere'))).toContain('Mid-term admissions');
    expect([...el.querySelectorAll('.seg button')].map((b) => text(b))).toEqual([
      '2026-27 1',
      '2027-28',
    ]);
    button(el.querySelector('#af-elsewhere')!, 'Show 2026-27')!.click();
    (await request((u) => u === '/api/v1/console/admission-fees?yearId=y-26')).flush(
      fees([fee(), appPaid(), appDue()]),
    );
    (await request((u) => u === '/api/v1/console/admission-fees?status=PAID')).flush(
      fees([appPaid()]),
    );
    await counts('y-26');
    await settle();
    expect(el.querySelector('#af-elsewhere')).toBeNull();
    expect(rows(el)).toHaveLength(2);
  });

  it('records cash for the admission fee and opens the receipt (ADM-022, ADM-024)', async () => {
    const el = await open();
    await collect(rows(el)[0]!.querySelector('.af-adm')!, 'CASH');
    const m = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    expect(text(m.querySelector('.sh-t'))).toContain(
      'Kiran Bhat · TVPS/2026/000001 · admission number TVPS/2026/0201',
    );
    // The dialog Collect fee on the fee collection page shares (client 2026-10-22).
    expect([...m.querySelectorAll('.cm-tile')].map((t) => text(t))).toEqual([
      'Admission fee₹10,000.00',
      'ModeCash',
    ]);
    expect(text(m.querySelector('#cc-save'))).toBe('Record ₹10,000.00');
    (m.querySelector('#cc-save') as HTMLButtonElement).click();
    await settle();
    expect(text(m)).toContain('Enter who paid');
    const by = m.querySelector('#cc-by') as HTMLInputElement;
    by.value = 'Mohan Bhat';
    by.dispatchEvent(new Event('input'));
    (m.querySelector('#cc-save') as HTMLButtonElement).click();
    await confirm();
    const post = await request(
      (u) => u === '/api/v1/console/applications/a-1/admission-fee/cash',
      'POST',
    );
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({
      feeType: 'ADMISSION',
      receivedAt: today,
      receiptNo: null,
      paidBy: 'Mohan Bhat',
    });
    post.flush(
      {
        receipt: {
          paymentId: 'p-9',
          receiptNo: 'TVPS/R/2026/000016',
          amount: money('10000.00'),
          feeType: 'ADMISSION',
        },
        application: {},
      },
      { status: 201, statusText: 'Created' },
    );
    await settle();
    expect(toasts()).toContain('Cash collection recorded');
    const paid = fee({
      paymentId: 'p-9',
      status: 'PAID',
      mode: 'CASH',
      receiptNo: 'TVPS/R/2026/000016',
      paidAt: `${today}T06:30:00.000Z`,
      paidBy: 'Mohan Bhat',
    });
    (await request((u) => u === '/api/v1/console/admission-fees?yearId=y-26')).flush(
      fees([paid, appPaid()]),
    );
    await counts('y-26');
    await settle();
    const drawer = document.querySelector('.drawer') as HTMLElement;
    expect(text(drawer.querySelector('#rc-body'))).toContain(
      'Admission fee receiptTVPS/R/2026/000016',
    );
    expect(text(drawer.querySelector('#rc-body'))).toContain('Received fromMohan Bhat');
    (drawer.querySelector('#rc-pdf') as HTMLButtonElement).click();
    const pdf = await request((u) => u === '/api/v1/console/admission-receipts/p-9');
    expect(pdf.request.responseType).toBe('blob');
  });

  it('shows a receipt number already used on its field (ADM.RECEIPT_TAKEN)', async () => {
    const el = await open();
    await collect(rows(el)[0]!.querySelector('.af-adm')!, 'CASH');
    const m = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    const rcpt = m.querySelector('#cc-rcpt') as HTMLInputElement;
    rcpt.value = 'RCPT/0016';
    rcpt.dispatchEvent(new Event('input'));
    const by = m.querySelector('#cc-by') as HTMLInputElement;
    by.value = 'Mohan Bhat';
    by.dispatchEvent(new Event('input'));
    (m.querySelector('#cc-save') as HTMLButtonElement).click();
    await confirm();
    const post = await request(
      (u) => u === '/api/v1/console/applications/a-1/admission-fee/cash',
      'POST',
    );
    expect(post.request.body).toEqual({
      feeType: 'ADMISSION',
      receivedAt: today,
      receiptNo: 'RCPT/0016',
      paidBy: 'Mohan Bhat',
    });
    post.flush(
      {
        type: 'urn:campusone:problem:adm.receipt_taken',
        title: 'Duplicate data found',
        status: 409,
        code: 'ADM.RECEIPT_TAKEN',
        detail: 'Duplicate data found',
      },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();
    expect(rcpt.closest('.fld')!.classList.contains('invalid')).toBe(true);
    expect(text(m.querySelector('#cc-rcpt-e'))).toBe(translate('ADM.RECEIPT_TAKEN'));
    expect(document.querySelector('.drawer')).toBeNull();
  });

  it('sends a payment link to the student and parents at once (ADM-023, client 2026-10-22)', async () => {
    const el = await open();
    await collect(rows(el)[0]!.querySelector('.af-adm')!, 'LINK');
    // No second question: the choice sends it.
    expect(document.querySelector('.modal[role="alertdialog"]')).toBeNull();
    const post = await request(
      (u) => u === '/api/v1/console/applications/a-1/admission-fee/online',
      'POST',
    );
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    post.flush(
      {
        paymentLink: 'http://localhost:4200/admissions/pay/a-1?token=t',
        amount: money('10000.00'),
        expiresAt: '2026-10-11T03:00:00.000Z',
        sendTo: { mobile: '9845001122', email: null },
        sent: { sms: ['••••••1122', '••••••3344'], email: ['m•••@example.in'], inApp: 1 },
      },
      { status: 201, statusText: 'Created' },
    );
    await settle();
    const m = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    expect(text(m.querySelector('h3'))).toBe('Payment link sent');
    expect(text(m.querySelector('.sh-t p'))).toBe('Kiran Bhat · TVPS/2026/000001');
    expect(text(m.querySelector('.cm-tile'))).toBe('Admission fee₹10,000.00');
    expect(text(m.querySelector('#pl-url'))).toBe(
      'http://localhost:4200/admissions/pay/a-1?token=t',
    );
    expect(text(m)).toContain('11 Oct 2026');
    expect(text(m.querySelector('#pl-sent'))).toBe(
      'SMS••••••1122, ••••••3344E-mailm•••@example.inIn the app1 person',
    );
    expect(m.querySelector('#pl-nowhere')).toBeNull();
  });

  it('says when the link could not be sent anywhere', async () => {
    const el = await open();
    await collect(rows(el)[0]!.querySelector('.af-adm')!, 'LINK');
    (
      await request((u) => u === '/api/v1/console/applications/a-1/admission-fee/online', 'POST')
    ).flush(
      {
        paymentLink: 'http://localhost:4200/admissions/pay/a-1?token=t',
        amount: money('10000.00'),
        expiresAt: '2026-10-11T03:00:00.000Z',
        sendTo: { mobile: null, email: null },
        sent: { sms: [], email: [], inApp: 0 },
      },
      { status: 201, statusText: 'Created' },
    );
    await settle();
    const m = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    expect(text(m.querySelector('#pl-nowhere'))).toContain("The link wasn't sent");
  });

  it('takes the fee through the gateway at the desk, without a link (ADM-037/038)', async () => {
    const el = await open();
    const order = {
      paymentId: 'p-7',
      feeType: 'ADMISSION',
      includes: ['ADMISSION'],
      amount: money('10000.00'),
      gatewayOrder: {
        orderId: 'order_T1',
        amount: money('10000.00'),
        mode: 'test',
        test: { paymentId: 'pay_T1', signature: 'sig-1' },
      },
    };
    const orders = '/api/v1/console/applications/a-1/admission-fee/orders';
    // The test checkout declined: nothing is paid.
    await collect(rows(el)[0]!.querySelector('.af-adm')!, 'PAY_NOW');
    let post = await request((u) => u === orders, 'POST');
    expect(post.request.body).toEqual({ feeType: 'ADMISSION' });
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    post.flush(order, { status: 201, statusText: 'Created' });
    await settle(2);
    let ask = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    expect(text(ask)).toContain('Complete the test payment?');
    ([...ask.querySelectorAll('.sh-f button')] as HTMLButtonElement[])[0]!.click();
    await settle(2);
    expect(toasts()).toContain('Payment not completed');
    expect(
      TestBed.inject(HttpTestingController).match((r) => r.url.endsWith('/verify')),
    ).toHaveLength(0);

    await collect(rows(el)[0]!.querySelector('.af-adm')!, 'PAY_NOW');
    post = await request((u) => u === orders, 'POST');
    post.flush(order, { status: 201, statusText: 'Created' });
    await settle(2);
    ask = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    ([...ask.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    await settle(2);
    const verify = await request((u) => u === `${orders}/p-7/verify`, 'POST');
    expect(verify.request.body).toEqual({ gatewayPaymentId: 'pay_T1', signature: 'sig-1' });
    verify.flush({
      status: 'PAID',
      receiptNo: 'TVPS/R/2026/000017',
      transactionId: 'pay_T1',
      receipts: [{ feeType: 'ADMISSION', receiptNo: 'TVPS/R/2026/000017' }],
      applicationStatus: 'APPROVED',
    });
    await settle();
    expect(toasts()).toContain('Paid online');
    expect(toasts()).toContain('receipt TVPS/R/2026/000017');
    const paid = fee({
      paymentId: 'p-7',
      status: 'PAID',
      mode: 'ONLINE',
      receiptNo: 'TVPS/R/2026/000017',
      transactionId: 'pay_T1',
      paidAt: `${today}T06:30:00.000Z`,
    });
    (await request((u) => u === '/api/v1/console/admission-fees?yearId=y-26')).flush(
      fees([paid, appPaid()]),
    );
    await counts('y-26');
    await settle();
    // The receipt opens, as for cash.
    const drawer = document.querySelector('.drawer') as HTMLElement;
    expect(text(drawer.querySelector('#rc-body'))).toContain(
      'Admission fee receiptTVPS/R/2026/000017',
    );
  });

  it('opens Collect fees for both fees when the counsellor’s form hands over (client 2026-10-23)', async () => {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl(
      '/console/admfees?collect=a-2&fee=APPLICATION&with=ADMISSION',
    );
    (await request((u) => u === '/api/v1/console/session')).flush(session());
    await nav;
    // The application's own year is shown.
    (await request((u) => u === '/api/v1/console/applications/a-2')).flush({
      id: 'a-2',
      year: { id: 'y-26', label: '2026-27' },
    });
    (await request((u) => u === '/api/v1/console/entry-fees')).flush(entry);
    const admDue = fee({
      applicationId: 'a-2',
      applicationNo: 'TVPS/2026/000002',
      applicationStatus: 'DRAFT',
      student: 'Kavya Nayak',
      admissionNo: null,
      class: 'Grade 2',
    });
    (await request((u) => u === '/api/v1/console/admission-fees?yearId=y-26')).flush(
      fees([appDue(), admDue]),
    );
    await counts('y-26');
    await settle();
    const m = chooser();
    expect(text(m)).toContain('Application fee₹500.00');
    expect(text(m.querySelector('#cf-also'))).toBe('Admission fee₹10,000.00');
    expect(text(m.querySelector('#cf-both'))).toContain('Both fees, ₹10,500.00');
    expect(TestBed.inject(Router).url).toBe('/console/admfees');
    // Pay now: one payment for both, as the public form takes them.
    (m.querySelector('#cw-PAY_NOW') as HTMLElement).click();
    await settle();
    expect(text(m.querySelector('#cf-go'))).toBe('Pay ₹10,500.00 now');
    (m.querySelector('#cf-go') as HTMLButtonElement).click();
    const post = await request(
      (u) => u === '/api/v1/console/applications/a-2/admission-fee/orders',
      'POST',
    );
    expect(post.request.body).toEqual({ feeType: 'APPLICATION', withAdmission: true });
  });
});
