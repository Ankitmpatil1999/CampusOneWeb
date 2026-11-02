import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import { DEFAULT_LAYOUTS, csvHeader, difference, missingColumns, signed } from './recon-format';
import type { Chargeback, Mismatch, Refund, Statement } from './recon.api';

const tick = () => new Promise((r) => setTimeout(r, 0));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function request(url: string, method = 'GET'): Promise<TestRequest> {
  const ctl = TestBed.inject(HttpTestingController);
  for (let i = 0; i < 80; i++) {
    const found = ctl.match((r) => r.urlWithParams === url && r.method === method);
    if (found[0]) return found[0];
    await tick();
  }
  throw new Error(`no ${method} ${url}`);
}

const officer = {
  name: 'ANANYA IYER',
  email: 'ananya@campusone.example',
  role: { code: 'RECON_OFFICER', name: 'Reconciliation Officer' },
  subTasks: [
    'home.view',
    'task.home',
    'task.recon',
    'recon.upload',
    'recon.resolve',
    'recon.chargeback',
  ],
  preferredLang: 'en',
};
const money = (amount: string) => ({ amount, currency: 'INR' as const });
const signedMoney = (amount: string, negative = false) => ({ ...money(amount), negative });

const upload = (over: Partial<Statement> = {}): Statement => ({
  id: 'u-1',
  kind: 'PAYOUTS',
  fileName: 'payout_statement_2026-10-04.csv',
  rows: 2,
  matched: 0,
  mismatchedRows: 2,
  mismatches: 2,
  openMismatches: 2,
  periodFrom: '2026-10-04',
  periodTo: '2026-10-04',
  uploadedBy: 'Ananya Iyer',
  uploadedAt: '2026-10-04T05:14:00.000Z',
  ...over,
});
const mismatch = (over: Partial<Mismatch> = {}): Mismatch => ({
  id: 'mm-1',
  kind: 'AMOUNT',
  status: 'OPEN',
  statement: {
    id: 'u-1',
    kind: 'PAYOUTS',
    fileName: 'payout_statement_2026-10-04.csv',
    rowNo: 1,
    key: 'SBINR52026100412345',
    date: '2026-10-04',
    status: 'SUCCESS',
    amount: money('85711.00'),
  },
  platform: {
    type: 'settlement',
    reference: 'STL-20261004-RPETUNSHI000011026-1',
    amount: money('85726.00'),
  },
  institution: { id: 'i-1', name: 'Tunga Valley Public School' },
  resolution: null,
  remarks: null,
  refundId: null,
  chargebackId: null,
  resolved: null,
  createdAt: '2026-10-04T05:14:00.000Z',
  version: 1,
  ...over,
});
const missing = mismatch({
  id: 'mm-2',
  kind: 'MISSING_ON_PLATFORM',
  statement: {
    ...mismatch().statement,
    rowNo: 2,
    key: 'HDFCR52026100498765',
    amount: money('1240.00'),
  },
  platform: null,
  institution: null,
});
const refund = (over: Partial<Refund> = {}): Refund => ({
  id: 'rf-1',
  institution: { id: 'i-1', name: 'Tunga Valley Public School' },
  originalReference: 'RPEP0LU9KTMS3I87C59HFNEDVRQ62770121',
  from: { walletNo: '555500083', name: 'Campus Canteen' },
  to: { walletNo: '555500004', name: 'Aarav Hegde' },
  amount: money('15.75'),
  status: 'REQUESTED',
  source: 'MANUAL',
  reason: 'Charged twice',
  requested: { by: 'Ananya Iyer', at: '2026-10-04T05:17:00.000Z' },
  decided: null,
  refundReference: null,
  version: 1,
  ...over,
});
const chargeback = (over: Partial<Chargeback> = {}): Chargeback => ({
  id: 'cb-1',
  institution: { id: 'i-1', name: 'Tunga Valley Public School' },
  originalReference: 'RPEPDICAR7A29B9J02U3E81Y4L662770119',
  wallet: { walletNo: '555500083', name: 'Campus Canteen' },
  amount: money('94.50'),
  reasonCode: '4834',
  status: 'RAISED',
  outcome: null,
  remarks: null,
  raised: { by: 'Ananya Iyer', at: '2026-10-04T05:17:00.000Z' },
  decided: null,
  completed: null,
  reversalReference: null,
  version: 1,
  ...over,
});
const pool = {
  asOf: '2026-10-04',
  bankFeed: false,
  items: [
    {
      institution: { id: 'i-1', name: 'Tunga Valley Public School' },
      received: signedMoney('100000.00'),
      paidOut: signedMoney('85726.00'),
      chargebacks: signedMoney('0.00'),
      poolExpected: signedMoney('14274.00'),
      wallets: signedMoney('13840.25'),
      walletsPerLedger: signedMoney('13840.25'),
      otherAccounts: [{ kind: 'PLATFORM_FEE', balance: signedMoney('433.75') }],
      heldFor: signedMoney('14274.00'),
      difference: signedMoney('0.00'),
      bankReported: null,
    },
  ],
};

describe('back office — reconciliation (REC-001…012, REC-018/019)', () => {
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

  async function flushLists(
    o: {
      uploads?: Statement[];
      mismatches?: Mismatch[];
      refunds?: Refund[];
      chargebacks?: Chargeback[];
    } = {},
  ) {
    (await request('/api/v1/ops/recon/statement-uploads')).flush({
      items: o.uploads ?? [upload()],
      nextCursor: null,
      layouts: DEFAULT_LAYOUTS,
    });
    (await request('/api/v1/ops/recon/mismatches')).flush({
      items: o.mismatches ?? [missing, mismatch()],
      nextCursor: null,
    });
    (await request('/api/v1/ops/recon/refunds')).flush({
      items: o.refunds ?? [refund()],
      nextCursor: null,
    });
    (await request('/api/v1/ops/recon/chargebacks')).flush({
      items: o.chargebacks ?? [chargeback()],
      nextCursor: null,
    });
  }

  async function openPage(url = '/backoffice/recon', lists = {}) {
    const harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl(url);
    (await request('/api/v1/ops/session')).flush(officer);
    await nav;
    await flushLists(lists);
    (await request('/api/v1/ops/recon/pool-balances')).flush(pool);
    for (let i = 0; i < 5; i++) await tick();
    harness.detectChanges();
    return { harness, el: harness.routeNativeElement as HTMLElement };
  }
  const settle = async (harness: RouterTestingHarness) => {
    for (let i = 0; i < 5; i++) await tick();
    harness.detectChanges();
  };
  const type = (el: Element | null, v: string) => {
    const i = el as HTMLInputElement | HTMLTextAreaElement;
    i.value = v;
    i.dispatchEvent(new Event('input'));
  };
  const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim();
  const lastModal = () => [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
  const pick = (input: Element | null, file: File) => {
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input?.dispatchEvent(new Event('change'));
  };

  it('reads a CSV header and names the missing columns; differences are signed', () => {
    expect(csvHeader('﻿"Date", UTR ,"Amount, INR",Status\r\n04-10-2026,X,1,OK')).toEqual([
      'Date',
      'UTR',
      'Amount, INR',
      'Status',
    ]);
    expect(missingColumns(['date', 'utr', 'amount'], DEFAULT_LAYOUTS.PAYOUTS.required)).toEqual([
      'Status',
    ]);
    expect(difference(mismatch())).toBe(-1500);
    expect(difference(missing)).toBeNull();
    expect(signed(signedMoney('12.50', true))).toBe('−₹12.50');
    expect(signed(signedMoney('0.00', true))).toBe('₹0.00');
  });

  it('shows the key figures, the tabs and the open mismatches', async () => {
    const { harness, el } = await openPage();
    expect(text(el.querySelector('.c-ph h1'))).toBe('Reconciliation');
    const kpis = [...el.querySelectorAll('.kpi')].map((k) => [
      text(k.querySelector('.k-l')),
      text(k.querySelector('.k-v')),
    ]);
    expect(kpis.slice(0, 3)).toEqual([
      ['Open mismatches', '2'],
      ['Refunds pending', '1'],
      ['Chargebacks raised', '1'],
    ]);
    expect([...el.querySelectorAll('.tabs .tab')].map((t) => text(t))).toEqual([
      'Mismatches 2',
      'Statement uploads 1',
      'Refunds 1',
      'Chargebacks 1',
      'Pool balances',
      'Daily snapshots',
      'MIS',
    ]);
    const rows = [...el.querySelectorAll('tbody tr')];
    expect(rows.length).toBe(2);
    expect(text(rows[0])).toContain('Missing on platform');
    expect(text(rows[0])).toContain('Not on platform');
    expect(text(rows[1])).toContain('Amount difference');
    expect(text(rows[1])).toContain('−₹15.00');
    expect(text(rows[1])).toContain('Settlement payout');
    // The kind filter narrows the list in the page.
    const select = el.querySelector('#ob-mk') as HTMLSelectElement;
    select.value = 'AMOUNT';
    select.dispatchEvent(new Event('change'));
    harness.detectChanges();
    expect(el.querySelectorAll('tbody tr').length).toBe(1);
  });

  it('resolves a mismatch with remarks and If-Match', async () => {
    const { harness, el } = await openPage();
    const row = [...el.querySelectorAll('tbody tr')][1] as HTMLElement;
    (row.querySelector('.row-acts .btn') as HTMLButtonElement).click();
    harness.detectChanges();
    const modal = lastModal();
    expect(text(modal.querySelector('h3'))).toBe('Resolve the mismatch');
    expect(text(modal.querySelector('.kv'))).toContain('₹85,711.00 · Success');
    expect(modal.querySelector('.choice.on')?.textContent).toContain('Explain it');
    (modal.querySelector('#ob-rs-go') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(text(modal.querySelector('#ob-rs-why-e'))).toBe('Enter remarks of 3 to 500 characters.');
    // A refund needs the movement's reference.
    ([...modal.querySelectorAll('.choice')][0] as HTMLElement).click();
    harness.detectChanges();
    expect((modal.querySelector('#ob-rs-amt') as HTMLInputElement).value).toBe('15.00');
    type(modal.querySelector('#ob-rs-why'), 'The bank kept a transfer charge');
    (modal.querySelector('#ob-rs-go') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(text(modal.querySelector('#ob-rs-ref-e'))).toBe(
      'Enter the reference of the transaction to refund or charge back.',
    );
    ([...modal.querySelectorAll('.choice')][2] as HTMLElement).click();
    harness.detectChanges();
    type(modal.querySelector('#ob-rs-why'), 'The bank kept a transfer charge');
    (modal.querySelector('#ob-rs-go') as HTMLButtonElement).click();
    const post = await request('/api/v1/ops/recon/mismatches/mm-1/resolution', 'POST');
    expect(post.request.body).toEqual({
      action: 'EXPLAINED',
      remarks: 'The bank kept a transfer charge',
    });
    expect(post.request.headers.get('If-Match')).toBe('"v1"');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    const done = mismatch({
      status: 'RESOLVED',
      resolution: 'EXPLAINED',
      remarks: 'The bank kept a transfer charge',
      resolved: { by: 'Ananya Iyer', at: '2026-10-04T05:20:00.000Z' },
      version: 2,
    });
    post.flush(done);
    await flushLists({ mismatches: [missing, done] });
    await settle(harness);
    expect(document.querySelector('#ob-rs-why')).toBeNull();
    expect(document.querySelector('.toast')?.textContent).toContain(
      'Mismatch resolved · Explained',
    );
    expect(el.querySelectorAll('tbody tr').length).toBe(1);
  });

  it('uploads a statement: rows in error are listed and nothing is stored; then it is matched', async () => {
    const { harness } = await openPage();
    (document.querySelector('#ob-rec-up') as HTMLButtonElement).click();
    harness.detectChanges();
    let modal = lastModal();
    expect(text(modal.querySelector('h3'))).toBe('Upload an external statement');
    ([...modal.querySelectorAll('.choice')][1] as HTMLElement).click();
    harness.detectChanges();
    expect([...modal.querySelectorAll('#ob-colhelp .tag')].map((t) => text(t))).toEqual([
      'Date',
      'UTR',
      'Amount',
      'Status',
    ]);
    expect(text(modal.querySelector('#ob-colhelp'))).toContain('Optional: Beneficiary');
    (modal.querySelector('#ob-rec-go') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(text(modal.querySelector('#ob-rfile-e'))).toBe('Choose a statement file');
    const file = new File(['Date,UTR,Amount,Status\n'], 'payouts.csv', { type: 'text/csv' });
    pick(modal.querySelector('#ob-rfile'), file);
    harness.detectChanges();
    (modal.querySelector('#ob-rec-go') as HTMLButtonElement).click();
    let post = await request('/api/v1/ops/recon/statement-uploads', 'POST');
    const body = post.request.body as FormData;
    expect(body.get('type')).toBe('PAYOUTS');
    expect((body.get('file') as File).name).toBe('payouts.csv');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    post.flush(
      {
        code: 'REC.FILE_REJECTED',
        errors: [
          { field: 'rows.2', code: 'REC.ROW_DATE', params: { n: 2, value: '31-09-2026' } },
          { field: 'rows.4', code: 'REC.ROW_AMOUNT', params: { n: 4 } },
        ],
      },
      { status: 422, statusText: 'Unprocessable' },
    );
    await wait(1000);
    await settle(harness);
    modal = lastModal();
    expect(text(modal.querySelector('h3'))).toBe('2 rows need correcting');
    expect(
      [...modal.querySelectorAll('tbody tr')].map((r) =>
        [...r.querySelectorAll('td')].map((c) => text(c)),
      ),
    ).toEqual([
      ['Row 2', 'Row 2 has an invalid date format: 31-09-2026'],
      ['Row 4', 'Row 4: enter the amount in rupees, like 1250.00.'],
    ]);
    expect(text(modal)).toContain('Nothing was uploaded: correct the rows listed');
    ([...modal.querySelectorAll('.sh-f .btn')].at(-1) as HTMLButtonElement).click();
    harness.detectChanges();
    modal = lastModal();
    ([...modal.querySelectorAll('.choice')][1] as HTMLElement).click();
    pick(modal.querySelector('#ob-rfile'), file);
    harness.detectChanges();
    (modal.querySelector('#ob-rec-go') as HTMLButtonElement).click();
    post = await request('/api/v1/ops/recon/statement-uploads', 'POST');
    post.flush({
      ...upload({ id: 'u-2', matched: 1, mismatchedRows: 1, mismatches: 1 }),
      code: 'REC.UPLOADED',
    });
    await wait(400);
    await settle(harness);
    modal = lastModal();
    expect(text(modal.querySelector('h3'))).toBe('1 of 2 rows matched');
    expect(text(modal)).toContain('File uploaded and data inserted successfully.');
    expect(text(modal)).toContain('1 mismatch flagged against platform records');
    await flushLists();
  });

  it('keeps a refund to another officer and records a chargeback dispute', async () => {
    const { harness, el } = await openPage('/backoffice/recon?tab=refunds');
    expect(text(el.querySelector('.tab.on'))).toBe('Refunds 1');
    const buttons = [...el.querySelectorAll('tbody .row-acts .btn')] as HTMLButtonElement[];
    expect(buttons.map((b) => b.disabled)).toEqual([true, true]);
    expect(buttons[0]?.title).toBe(
      'You requested this refund — another officer processes or rejects it.',
    );
    ([...el.querySelectorAll('.tabs .tab')][3] as HTMLButtonElement).click();
    harness.detectChanges();
    const row = el.querySelector('tbody tr') as HTMLElement;
    expect(text(row)).toContain('Duplicate processing');
    expect(text(row)).toContain('Reason code 4834');
    ([...row.querySelectorAll('.row-acts .btn')][1] as HTMLButtonElement).click();
    await settle(harness);
    const dialog = document.querySelector('.modal[role=alertdialog]') as HTMLElement;
    expect(text(dialog.querySelector('h3'))).toBe('Dispute the chargeback?');
    type(dialog.querySelector('#cf-reason'), 'Receipts sent to the gateway');
    (dialog.querySelector('.sh-f .btn-pri') as HTMLButtonElement).click();
    const post = await request('/api/v1/ops/recon/chargebacks/cb-1/decision', 'POST');
    expect(post.request.body).toEqual({
      decision: 'DISPUTE',
      remarks: 'Receipts sent to the gateway',
    });
    expect(post.request.headers.get('If-Match')).toBe('"v1"');
    post.flush(chargeback({ status: 'DISPUTED', version: 2 }));
    await flushLists({ chargebacks: [chargeback({ status: 'DISPUTED', version: 2 })] });
    await settle(harness);
    // Completion: a disputed case may be upheld (nothing moves).
    ([...el.querySelectorAll('tbody .row-acts .btn')][0] as HTMLButtonElement).click();
    harness.detectChanges();
    const modal = lastModal();
    expect([...modal.querySelectorAll('.choice .t-h4')].map((c) => text(c))).toEqual([
      'Reversed',
      'Upheld',
    ]);
    ([...modal.querySelectorAll('.choice')][1] as HTMLElement).click();
    type(modal.querySelector('#ob-cbd-note'), 'Dispute won');
    (modal.querySelector('#ob-cbd-go') as HTMLButtonElement).click();
    const done = await request('/api/v1/ops/recon/chargebacks/cb-1/completion', 'POST');
    expect(done.request.body).toEqual({ outcome: 'UPHELD', remarks: 'Dispute won' });
    expect(done.request.headers.get('If-Match')).toBe('"v2"');
  });

  it('compares each pool with what it holds', async () => {
    const { harness, el } = await openPage('/backoffice/recon?tab=pool');
    await settle(harness);
    expect(text(el.querySelector('.tab.on'))).toBe('Pool balances');
    const row = text(el.querySelector('tbody tr'));
    expect(row).toContain('Tunga Valley Public School');
    expect(row).toContain('₹13,840.25');
    expect(row).toContain('₹433.75');
    expect(row).toContain('₹14,274.00');
    expect(row).toContain('Balanced');
  });
});
