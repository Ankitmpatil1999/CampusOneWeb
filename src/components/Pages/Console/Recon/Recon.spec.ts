import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import { periodRange, plusDays, todayIst } from '../Settlements/settlement-format';
import { channelLabel, toCsv, walletKind, walletNo } from './recon-format';

const tick = () => new Promise((r) => setTimeout(r, 0));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits for `n` requests matching `match` (every one is returned, so none is lost). */
async function requests(match: (url: string) => boolean, n = 1, method = 'GET') {
  const ctl = TestBed.inject(HttpTestingController);
  const got: TestRequest[] = [];
  for (let i = 0; i < 80 && got.length < n; i++) {
    got.push(...ctl.match((r) => match(r.urlWithParams) && r.method === method));
    if (got.length < n) await tick();
  }
  if (got.length < n) throw new Error(`expected ${n} ${method} request(s), got ${got.length}`);
  return got;
}
const request = async (match: (url: string) => boolean, method = 'GET') =>
  (await requests(match, 1, method))[0]!;

const money = (amount: string) => ({ amount, currency: 'INR' });
const signed = (amount: string, negative = false) => ({ amount, currency: 'INR', negative });
const today = todayIst();
const week = periodRange('7');
const month30 = periodRange('30');

const session = (over: object = {}) => ({
  name: 'PRAKASH SHETTY',
  email: 'prakash.shetty@tvps.example.in',
  institution: {
    id: 'i-1',
    name: 'Tunga Valley Public School',
    shortName: 'TVPS',
    city: 'Shivamogga',
  },
  roles: [{ code: 'INSTITUTION_ADMIN', name: 'Institution Administrator', readOnly: false }],
  subTasks: [
    'home.view',
    'task.home',
    'task.recon',
    'recon.view',
    'task.merchants',
    'merchants.view',
  ],
  preferredLang: 'en',
  ...over,
});

const txn = (over: object = {}) => ({
  id: 't-1',
  at: '2026-10-04T04:10:00.000Z',
  description: 'Payment',
  payer: 'Aarav Hegde',
  payee: 'Campus Canteen',
  reference: 'RPEPAAAA1111',
  amount: money('45.00'),
  status: 'SUCCESS',
  statusLabel: 'Success',
  channel: 'STATIC_QR',
  remarks: 'QR payment',
  ...over,
});
const txns = {
  from: week.from,
  to: week.to,
  tiles: {
    total: 4,
    success: { count: 2, share: 50 },
    failure: { count: 1, share: 25 },
    pending: { count: 1, share: 25 },
  },
  items: [
    txn(),
    txn({ id: 't-2', reference: 'RPEPBBBB2222', amount: money('120.50'), payer: 'Mahesh Hegde' }),
    txn({
      id: 't-3',
      reference: 'RPEPCCCC3333',
      amount: money('5000.00'),
      status: 'FAILURE',
      statusLabel: 'Failure',
    }),
    txn({
      id: 't-4',
      reference: 'RPETDDDD4444',
      description: 'Transfer',
      payee: 'Meera Hegde',
      channel: 'TRANSFER',
      amount: money('200.00'),
      status: 'PENDING',
      statusLabel: 'Pending',
    }),
  ],
  nextCursor: null,
};

const ledger = (differences: object[] = []) => ({
  checkedAt: '2026-10-04T06:00:00.000Z',
  checked: 37,
  differences,
});

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim();
const toasts = () => document.querySelector('.toasts')?.textContent?.replace(/\s+/g, ' ') ?? '';
const tab = (root: ParentNode, label: string) =>
  [...root.querySelectorAll('.tabs .tab')].find((b) => text(b)?.startsWith(label)) as HTMLElement;

describe('console transactions & MIS (REC-013…017)', () => {
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

  async function open(s: object = session(), check = ledger()) {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/recon');
    (await request((u) => u === '/api/v1/console/session')).flush(s);
    await nav;
    (await request((u) => u === '/api/v1/console/recon/ledger-check')).flush(check);
    (
      await request(
        (u) => u === `/api/v1/console/recon/transactions?from=${week.from}&to=${week.to}`,
      )
    ).flush(txns);
    await settle();
    return harness.routeNativeElement as HTMLElement;
  }

  it('formats wallets, channels and CSV values', () => {
    expect(walletNo('410201277')).toBe('4102 01277');
    expect(walletNo('5555000830626')).toBe('5555 0008 3062 6');
    expect(walletKind('CAMPUS')).toBe('Campus wallet');
    expect(channelLabel('STATIC_QR')).toBe('Static QR');
    expect(channelLabel('SOMETHING')).toBe('SOMETHING');
    expect(toCsv([['a', 'b,c', 'say "hi"']])).toBe('﻿a,"b,c","say ""hi"""');
  });

  it('lists the transactions with the tiles, filters on the server, exports and opens one', async () => {
    const saved: string[] = [];
    const url = URL as unknown as {
      createObjectURL?: (b: Blob) => string;
      revokeObjectURL?: (u: string) => void;
    };
    const before = { create: url.createObjectURL, revoke: url.revokeObjectURL };
    url.createObjectURL = () => 'blob:csv';
    url.revokeObjectURL = () => undefined;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this.download);
    });
    try {
      const el = await open();
      expect(text(el.querySelector('.c-ph h1'))).toBe('Transactions & MIS');
      expect([...el.querySelectorAll('.tabs .tab')].map((t) => text(t))).toEqual([
        'Transactions',
        'MIS',
        'Merchant statement',
        'Pool balance',
        'Ledger check',
      ]);
      expect(
        [...el.querySelectorAll('#rt-tiles .cm-tile')].map((t) => [
          text(t.querySelector('span')),
          text(t.querySelector('b')),
          t.className,
        ]),
      ).toEqual([
        ['Successful value', '₹165.50', 'cm-tile tone-ok'],
        ['Successful', '2', 'cm-tile'],
        ['Failed', '1', 'cm-tile tone-bad'],
        ['Pending', '1', 'cm-tile tone-warn'],
      ]);
      expect(text(el.querySelector('.fsum'))).toBe('4 transactions');
      const rows = [...el.querySelectorAll('#rt-table tbody tr')];
      expect(rows.length).toBe(4);
      expect([...rows[0]!.querySelectorAll('td')].slice(1).map((td) => text(td))).toEqual([
        'RPEPAAAA1111',
        'Aarav Hegde',
        'Campus Canteen',
        'Static QR',
        '₹45.00',
        'Success',
      ]);
      expect(text(rows[0]!.querySelector('td .cell-s'))).toBe('9:40 AM');
      expect(rows[2]!.querySelector('.chip.tone-bad')).toBeTruthy();
      expect(text(rows[3]!.querySelector('.tag'))).toBe('Transfer');

      // The status filter and the search go to the server.
      (el.querySelector('#rt-st-b') as HTMLButtonElement).click();
      harness.detectChanges();
      (
        [...document.querySelectorAll('.dd-opt')].find((o) => text(o) === 'Failure') as HTMLElement
      ).click();
      harness.detectChanges();
      (
        await request(
          (u) =>
            u ===
            `/api/v1/console/recon/transactions?from=${week.from}&to=${week.to}&status=FAILURE`,
        )
      ).flush({ ...txns, items: [txns.items[2]] });
      await settle();
      expect(text(el.querySelector('.fsum'))).toBe('1 transaction');
      expect(text(el.querySelector('#rt-tiles .cm-tile b'))).toBe('—');
      const q = el.querySelector('#rt-q') as HTMLInputElement;
      q.value = 'rpepcc';
      q.dispatchEvent(new Event('input'));
      await wait(300);
      (await request((u) => u.includes('status=FAILURE&q=rpepcc'))).flush({
        ...txns,
        items: [txns.items[2]],
      });
      await settle();

      // The export is the server's CSV of the same filters.
      (el.querySelector('#rt-export') as HTMLButtonElement).click();
      const csv = await request(
        (u) =>
          u ===
          `/api/v1/console/recon/transactions?from=${week.from}&to=${week.to}&status=FAILURE&q=rpepcc&format=csv`,
      );
      expect(csv.request.responseType).toBe('blob');
      csv.flush(new Blob(['Date'], { type: 'text/csv' }));
      await settle();
      expect(saved).toEqual([`transactions-${week.from}-to-${week.to}.csv`]);
      expect(toasts()).toContain('Export ready');

      // A row opens the transaction drawer.
      (el.querySelector('#rt-table tbody tr') as HTMLElement).click();
      await settle(1);
      const drawer = document.querySelector('.drawer') as HTMLElement;
      expect(text(drawer.querySelector('.sh-t h3'))).toBe('Transaction');
      expect(text(drawer.querySelector('.sh-t p'))).toBe('RPEPCCCC3333');
      expect(text(drawer.querySelector('.cm-hero .chip'))).toBe('Failure');
      const kv = [...drawer.querySelectorAll('.kv dt')].map((d) => [
        text(d),
        text(d.nextElementSibling),
      ]);
      expect(kv).toEqual([
        ['When', '04 Oct 2026, 9:40 AM'],
        ['Mode', 'Static QR'],
        ['Instrument', 'Wallet'],
        ['From', 'Aarav Hegde'],
        ['To', 'Campus Canteen'],
        ['Type', 'Payment'],
      ]);
      expect(text(drawer)).toContain('No ledger entries — nothing moved.');
    } finally {
      click.mockRestore();
      url.createObjectURL = before.create;
      url.revokeObjectURL = before.revoke;
    }
  });

  it('shows the payer ↔ merchant matching with its counts and filters the view', async () => {
    const el = await open();
    tab(el, 'MIS').click();
    harness.detectChanges();
    (
      await request((u) => u === `/api/v1/console/recon/mis?from=${month30.from}&to=${month30.to}`)
    ).flush({
      from: month30.from,
      to: month30.to,
      counts: { matched: 6, unmatched: 3, mismatched: 1 },
      items: [
        {
          reference: 'RPEPAAAA1111',
          at: '2026-10-04T04:10:00.000Z',
          match: 'MATCHED',
          payer: { name: 'Aarav Hegde', amount: money('45.00'), status: 'Success' },
          merchant: { name: 'Campus Canteen', amount: money('45.00'), status: 'Success' },
          settled: true,
        },
        {
          reference: 'RPEPCCCC3333',
          at: '2026-10-04T04:20:00.000Z',
          match: 'UNMATCHED',
          payer: { name: 'Aarav Hegde', amount: money('5000.00'), status: 'Failure' },
          merchant: null,
          settled: false,
        },
      ],
      nextCursor: null,
    });
    await settle();
    expect(tab(el, 'MIS').getAttribute('aria-selected')).toBe('true');
    expect(text(el.querySelector('.fsum'))).toBe('10 payments');
    expect([...el.querySelectorAll('.bar')].map((b) => b.getAttribute('aria-valuenow'))).toEqual([
      '60',
      '30',
      '10',
    ]);
    expect(text(el.querySelector('.ring-c'))).toBe('10');
    const rows = [...el.querySelectorAll('#rm-table tbody tr')];
    expect(text(rows[0]!.querySelector('.chip.tone-ok'))).toBe('Matched');
    expect(text(rows[0]!.querySelector('.chip.tone-brand'))).toBe('Settled');
    expect(text(rows[1]!.querySelectorAll('td')[4])).toBe('Not credited');
    expect(text(rows[1]!.querySelector('.chip.tone-warn'))).toBe('Unmatched');

    (el.querySelector('#rm-view-b') as HTMLButtonElement).click();
    harness.detectChanges();
    (
      [...document.querySelectorAll('.dd-opt')].find((o) =>
        text(o)?.startsWith('Mismatched'),
      ) as HTMLElement
    ).click();
    harness.detectChanges();
    (await request((u) => u.endsWith('&view=mismatched'))).flush({
      from: month30.from,
      to: month30.to,
      counts: { matched: 6, unmatched: 3, mismatched: 1 },
      items: [],
      nextCursor: null,
    });
    await settle();
    expect(text(el.querySelector('.fsum'))).toBe('1 payment');
    expect(text(el.querySelector('#rm-table .empty h4'))).toBe(
      'No payments to merchants in this period',
    );
  });

  it("shows a merchant's statement with the settlement of each line", async () => {
    const el = await open();
    tab(el, 'Merchant statement').click();
    harness.detectChanges();
    (await request((u) => u === '/api/v1/console/merchants?limit=200')).flush({
      items: [
        { id: 'mer-1', displayName: 'Campus Canteen' },
        { id: 'mer-2', displayName: 'Book Corner' },
      ],
      nextCursor: null,
      kpis: { total: 2, active: 2, collectionsToday: money('0.00'), paymentsToday: 0 },
    });
    (
      await request(
        (u) =>
          u ===
          `/api/v1/console/recon/merchant-statement?merchantId=mer-1&from=${week.from}&to=${week.to}`,
      )
    ).flush({
      merchant: { id: 'mer-1', name: 'Campus Canteen', uniqueId: 'MERCAMTUN000830626' },
      from: week.from,
      to: week.to,
      totals: {
        collections: money('450.01'),
        fees: money('2.75'),
        adjustments: money('20.00'),
        paidOut: money('0.00'),
      },
      items: [
        {
          reference: 'RPEPAAAA1111',
          at: '2026-10-04T04:10:00.000Z',
          type: 'PAYMENT',
          typeLabel: 'Payment',
          direction: 'CREDIT',
          amount: money('45.00'),
          balanceAfter: money('1295.00'),
          settlement: null,
          remarks: 'QR payment',
        },
        {
          reference: 'RPEPZZZZ9999',
          at: '2026-10-03T04:10:00.000Z',
          type: 'PAYMENT',
          typeLabel: 'Payment',
          direction: 'CREDIT',
          amount: money('100.00'),
          balanceAfter: money('1250.00'),
          settlement: {
            settlementNo: 'STL-1',
            status: 'PENDING',
            paidOut: false,
            fee: money('1.00'),
            net: money('99.00'),
          },
          remarks: 'QR payment',
        },
        {
          reference: 'RPERYYYY8888',
          at: '2026-10-02T04:10:00.000Z',
          type: 'REFUND',
          typeLabel: 'Refund',
          direction: 'DEBIT',
          amount: money('20.00'),
          balanceAfter: money('1150.00'),
          settlement: null,
          remarks: null,
        },
      ],
      nextCursor: null,
    });
    (await request((u) => u === '/api/v1/console/merchants/mer-1')).flush({
      bank: {
        holderName: 'RAVI KUMAR',
        bankName: null,
        accountNumber: 'XXXXXXXX1234',
        ifsc: 'SBIN0001234',
        chequeFileId: null,
      },
    });
    await settle();
    expect(
      [...el.querySelectorAll('#rs-tiles .cm-tile')].map((t) => [
        text(t.querySelector('span')),
        text(t.querySelector('b')),
      ]),
    ).toEqual([
      ['Gross (successful)', '₹450.01'],
      ['Platform fee', '₹2.75'],
      ['Net to merchant', '₹427.26'],
      ['Paid out', '₹0.00'],
    ]);
    expect(text(el.querySelector('#rs-meta'))).toBe(
      'Campus Canteen · MERCAMTUN000830626 · settles to ••••••1234 (SBIN0001234) · refunds and chargebacks ₹20.00 deducted',
    );
    const rows = [...el.querySelectorAll('#rs-table tbody tr')];
    expect(rows.length).toBe(3);
    expect(text(rows[0]!.querySelector('.chip'))).toBe('Not settled yet');
    expect(text(rows[1]!.querySelector('.chip.tone-warn'))).toBe('Pending');
    expect(text(rows[1]!.querySelector('td:nth-child(7) .cell-s'))).toBe('STL-1');
    expect(text(rows[2]!.querySelectorAll('td')[3])).toBe('−₹20.00');
    expect(text(el.querySelector('.fsum'))).toBe('3 lines');

    (rows[1] as HTMLElement).click();
    await settle(1);
    const drawer = document.querySelector('.drawer') as HTMLElement;
    expect(text(drawer.querySelector('.cm-hero .chip'))).toBe('Pending');
    expect(text(drawer)).toContain('Platform fee (settlement)');
    expect(text(drawer)).toContain('₹99.00');
  });

  it('explains the pool balance and the daily snapshots', async () => {
    const el = await open();
    tab(el, 'Pool balance').click();
    harness.detectChanges();
    const pool = (over: object = {}) => ({
      asOf: today,
      bankFeed: false,
      institution: { id: 'i-1', name: 'Tunga Valley Public School' },
      received: signed('10000.00'),
      paidOut: signed('1250.00'),
      chargebacks: signed('0.00'),
      poolExpected: signed('8750.00'),
      wallets: signed('8743.75'),
      walletsPerLedger: signed('8743.75'),
      otherAccounts: [{ kind: 'PLATFORM_FEE', balance: signed('6.25') }],
      heldFor: signed('8750.00'),
      difference: signed('0.00'),
      bankReported: null,
      ...over,
    });
    (await request((u) => u === '/api/v1/console/recon/pool-balance')).flush(pool());
    const days = await requests((u) => u.startsWith('/api/v1/console/recon/pool-balance?date='), 6);
    for (const r of days) {
      const d = r.request.params.get('date');
      r.flush(d === plusDays(today, -1) ? pool({ wallets: null }) : pool());
    }
    await settle();
    expect(
      [...el.querySelectorAll('#rp-kpis .kpi')].map((k) => [
        text(k.querySelector('.k-l')),
        text(k.querySelector('.k-v')),
      ]),
    ).toEqual([
      ['Sum of wallet balances', '₹8,743.75'],
      ['Pool account balance', '₹8,750.00'],
      ['Difference (pool − wallets)', '₹6.25'],
    ]);
    expect(el.querySelector('#rp-kpis .cm-diffk.ok')).toBeTruthy();
    expect(text(el.querySelector('#rp-kpis .cm-diffk .k-d'))).toBe('Fully explained');
    const items = [...el.querySelectorAll('#rp-items tbody tr')].map((r) =>
      text(r.querySelector('td')),
    );
    expect(items).toEqual(['Platform fees not yet paid out', 'Unexplained']);
    expect([...el.querySelectorAll('#rp-items tfoot td')].map((td) => text(td))).toEqual([
      'Difference',
      '₹6.25',
    ]);
    const snapshots = [...el.querySelectorAll('#rp-days tbody tr')];
    expect(snapshots.length).toBe(6);
    expect(text(snapshots[0]!.querySelectorAll('td')[1])).toBe('No roll-over');
    expect(text(snapshots[1]!.querySelectorAll('td')[3])).toBe('₹6.25');
  });

  it('flags an unexplained pool difference and lists the wallets that differ from the ledger', async () => {
    const differences = [
      {
        walletId: 'w-1',
        walletNo: '410201277',
        kind: 'CAMPUS',
        institution: { id: 'i-1', name: 'Tunga Valley Public School' },
        stored: money('1961.01'),
        ledger: money('2001.01'),
        ledgerNegative: false,
        difference: money('40.00'),
        differenceSign: -1,
        entries: 12,
      },
    ];
    const el = await open(session(), ledger(differences));
    expect(text(tab(el, 'Ledger check').querySelector('.n'))).toBe('1');
    tab(el, 'Pool balance').click();
    harness.detectChanges();
    (await request((u) => u === '/api/v1/console/recon/pool-balance')).flush({
      asOf: today,
      bankFeed: false,
      institution: { id: 'i-1', name: 'Tunga Valley Public School' },
      received: signed('10000.00'),
      paidOut: signed('0.00'),
      chargebacks: signed('0.00'),
      poolExpected: signed('10000.00'),
      wallets: signed('9960.00'),
      walletsPerLedger: signed('10000.00'),
      otherAccounts: [],
      heldFor: signed('9960.00'),
      difference: signed('40.00'),
      bankReported: null,
    });
    for (const r of await requests((u) => u.includes('pool-balance?date='), 6)) r.flush({});
    await settle();
    expect(el.querySelector('#rp-kpis .cm-diffk.bad')).toBeTruthy();
    expect(text(el.querySelector('#rp-kpis .cm-diffk .k-d'))).toBe('₹40.00 not explained');
    const unexplained = el.querySelector('#rp-items tr.cm-rej') as HTMLElement;
    expect(text(unexplained.querySelector('td b'))).toBe('Unexplained');
    (unexplained.querySelector('.linkbtn') as HTMLButtonElement).click();
    harness.detectChanges();

    expect(tab(el, 'Ledger check').getAttribute('aria-selected')).toBe('true');
    expect(text(el.querySelector('#rl-meta'))).toBe(
      '37 wallets checked · last run 04 Oct 2026, 11:30 AM',
    );
    const cells = [...el.querySelectorAll('#rl-table tbody tr td')].map((td) => text(td));
    expect(cells.slice(1, 4)).toEqual(['₹1,961.01', '₹2,001.01', '−₹40.00']);
    expect(text(el.querySelector('#rl-table tbody td .t-mono'))).toBe('4102 01277');
    expect(text(el.querySelector('#rl-table tbody td .cell-s'))).toBe('Campus wallet');
    expect((el.querySelector('#rl-table .btn-danger-o') as HTMLButtonElement).disabled).toBe(true);

    (el.querySelector('#rl-run') as HTMLButtonElement).click();
    (await request((u) => u === '/api/v1/console/recon/ledger-check')).flush(ledger());
    await settle();
    expect(toasts()).toContain('Every wallet matches its ledger');
    expect(text(el.querySelector('#rl-table .empty h4'))).toBe('Every wallet matches its ledger');
    expect(tab(el, 'Ledger check').querySelector('.n')).toBeNull();
  });

  it("tells a role without the task that the page isn't theirs", async () => {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/recon');
    (await request((u) => u === '/api/v1/console/session')).flush(
      session({ subTasks: ['home.view', 'task.home'] }),
    );
    await nav;
    await settle();
    const el = harness.routeNativeElement as HTMLElement;
    expect(text(el.querySelector('.empty h4'))).toBe("This page isn't part of your role");
    TestBed.inject(HttpTestingController).expectNone((r) => r.url.includes('/recon/'));
  });
});
