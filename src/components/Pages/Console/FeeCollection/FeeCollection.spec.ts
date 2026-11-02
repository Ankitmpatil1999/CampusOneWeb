import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import { istBusinessDate } from '../../../Utils/format';
import { SessionKeeper } from '../../../Utils/session-keeper';
import { translate } from '../../../Utils/translate';
import type {
  CollectInstalment,
  CollectStudent,
  CollectionStudent,
  EntryFee,
  FeeCollectionStudent,
  FeeCollectionView,
  FeeReceipt,
  InstalmentCollection,
  ReceiptRow,
  ReceiptsView,
  Sums,
} from './fee-collection.api';

const tick = () => new Promise((r) => setTimeout(r, 0));
const money = (amount: string) => ({ amount, currency: 'INR' as const });
const sums = (amount: string, collected: string, pending: string): Sums => ({
  amount: money(amount),
  collected: money(collected),
  pending: money(pending),
});
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const today = istBusinessDate(new Date());
/** The texts of an element's parts (an amount and its line are separate elements), spaced. */
const parts = (el: Element | null | undefined, sel: string) =>
  [...(el?.querySelectorAll(sel) ?? [])].map((x) => text(x)).join(' ');

async function request(match: (url: string) => boolean, method = 'GET') {
  const ctl = TestBed.inject(HttpTestingController);
  for (let i = 0; i < 60; i++) {
    const found = ctl.match((r) => match(r.urlWithParams) && r.method === method);
    if (found[0]) return found[0];
    await tick();
  }
  throw new Error(`no ${method} request`);
}
const pending = (part: string) =>
  TestBed.inject(HttpTestingController).match((r) => r.urlWithParams.includes(part));
/**
 * Enter on an element. The session keeper takes any key for use and renews the session — with no
 * session cookie here that signs the test out — so it is stopped first.
 */
const enter = (el: Element) => {
  TestBed.inject(SessionKeeper).stop();
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
};

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
  subTasks: ['home.view', 'task.home', 'task.fees', 'fees.view'],
  preferredLang: 'en',
  ...over,
});

const years = {
  items: [
    { year: { id: 'y-1', label: '2026-27', status: 'OPEN', current: true }, fees: null },
    { year: { id: 'y-0', label: '2025-26', status: 'CLOSED', current: false }, fees: null },
  ],
};
const classes = {
  items: [
    {
      id: 'c-6',
      name: 'Grade 6',
      order: 6,
      sections: [
        { id: 'sec-a', name: 'A', capacity: null, students: 1 },
        { id: 'sec-b', name: 'B', capacity: null, students: 1 },
      ],
      students: 2,
      version: 1,
    },
  ],
};

/**
 * A structure as FEE-003 lists it: approved (its current version), approved with an edit waiting
 * (`active` beside a newer pending version), or a draft never approved.
 */
const structure = (id: string, name: string, state: 'ACTIVE' | 'EDITED' | 'DRAFT') => ({
  id,
  name,
  year: { id: 'y-1', label: '2026-27' },
  status: state === 'EDITED' ? 'PENDING' : state,
  current: { id: `${id}-v${state === 'EDITED' ? 2 : 1}`, no: state === 'EDITED' ? 2 : 1 },
  active: state === 'EDITED' ? { id: `${id}-v1`, no: 1 } : null,
  assigned: { students: 0, records: 0 },
});
const structures = {
  items: [
    structure('s-0', 'Draft for Grade 9', 'DRAFT'),
    structure('s-1', 'Middle school 2026-27', 'ACTIVE'),
    structure('s-2', 'Primary 2026-27', 'EDITED'),
  ],
  kpis: null,
};

const entry = (over: Partial<EntryFee>): EntryFee => ({
  ...sums('500.00', '500.00', '0.00'),
  status: 'PAID',
  mode: 'ONLINE',
  receiptNo: 'R/1',
  ...over,
});
const asha: CollectionStudent = {
  id: 'm-1',
  name: 'Asha Rao',
  admissionNo: 'TVPS/1',
  classSection: 'Grade 6 A',
  heads: [
    { headId: 'h-t', ...sums('18000.00', '12000.00', '6000.00') },
    { headId: 'h-a', ...sums('3000.00', '2000.00', '1000.00') },
    null,
  ],
  applicationFee: entry({}),
  admissionFee: entry({
    ...sums('10000.00', '0.00', '10000.00'),
    status: 'PENDING',
    mode: null,
    receiptNo: null,
  }),
  total: sums('31500.00', '14500.00', '17000.00'),
  due: money('7000.00'),
  collectable: true,
};
const kiran: CollectionStudent = {
  id: 'm-2',
  name: 'Kiran Rao',
  admissionNo: 'TVPS/9',
  classSection: 'Grade 6 B',
  heads: [
    { headId: 'h-t', ...sums('18000.00', '0.00', '18000.00') },
    { headId: 'h-a', ...sums('3000.00', '0.00', '3000.00') },
    { headId: 'h-tr', ...sums('3600.00', '0.00', '3600.00') },
  ],
  applicationFee: null,
  admissionFee: null,
  total: sums('24600.00', '0.00', '24600.00'),
  due: money('24600.00'),
  collectable: true,
};
const view = (over: Partial<FeeCollectionView> = {}): FeeCollectionView => ({
  year: { id: 'y-1', label: '2026-27' },
  structure: null,
  heads: [
    { id: 'h-t', name: 'Tuition' },
    { id: 'h-a', name: 'Annual' },
    { id: 'h-tr', name: 'Transport' },
  ],
  cards: {
    heads: [
      { headId: 'h-t', collected: money('12000.00') },
      { headId: 'h-a', collected: money('2000.00') },
      { headId: 'h-tr', collected: money('0.00') },
    ],
    applicationFee: sums('500.00', '500.00', '0.00'),
    admissionFee: sums('10000.00', '0.00', '10000.00'),
    total: sums('56100.00', '14500.00', '41600.00'),
  },
  students: [asha, kiran],
  page: 1,
  pageSize: 15,
  total: 2,
  ...over,
});

const ashaDetail: FeeCollectionStudent = {
  student: { id: 'm-1', name: 'Asha Rao', admissionNo: 'TVPS/1', classSection: 'Grade 6 A' },
  heads: [
    {
      id: 'h-t',
      name: 'Tuition',
      ...sums('18000.00', '12000.00', '6000.00'),
      instalments: [
        {
          seq: 2,
          label: 'Term 2',
          dueDate: '2026-11-15',
          status: 'PAID',
          ...sums('9000.00', '9000.00', '0.00'),
        },
        {
          seq: 3,
          label: 'Term 3',
          dueDate: '2027-01-15',
          status: 'PARTIALLY_PAID',
          ...sums('9000.00', '3000.00', '6000.00'),
        },
      ],
    },
  ],
};

const FC = '/api/v1/console/fee-collection';

describe('console fee collection details (FEE-044/045)', () => {
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

  async function open(s: object = session()) {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/feecollection');
    (await request((u) => u === '/api/v1/console/session')).flush(s);
    await nav;
    await settle(2);
    return harness.routeNativeElement as HTMLElement;
  }

  async function loaded(first: FeeCollectionView = view()) {
    const el = await open();
    (await request((u) => u === '/api/v1/console/classes')).flush(classes);
    (await request((u) => u === '/api/v1/console/entry-fees')).flush(years);
    (await request((u) => u === '/api/v1/console/fee-structures?yearId=y-1')).flush(structures);
    (await request((u) => u === `${FC}?yearId=y-1&page=1&pageSize=15`)).flush(first);
    await settle();
    return el;
  }

  /** Picks an option of a dropdown by its label. */
  async function pick(id: string, label: string) {
    const el = harness.routeNativeElement as HTMLElement;
    (el.querySelector(`#${id}-b`) as HTMLButtonElement).click();
    await settle(1);
    const opt = [...document.querySelectorAll('.dd-opt')].find((b) =>
      text(b).startsWith(label),
    ) as HTMLButtonElement;
    expect(opt, `${label} in ${id}`).toBeTruthy();
    opt.click();
    await settle(1);
  }

  const heads = (el: HTMLElement) =>
    [...el.querySelectorAll('#fc-table thead th')].map((th) => text(th));

  it('opens on the current year with every head of the year, the entry fees and the cards', async () => {
    const el = await loaded();
    expect(text(el.querySelector('#fc-year-b'))).toBe('Academic year 2026-27');
    // No structure picked at first.
    expect(text(el.querySelector('#fc-structure-b'))).toBe('All fee structures');
    expect(heads(el)).toEqual([
      'Student',
      'Tuition',
      'Annual',
      'Transport',
      'Application fee',
      'Admission fee',
      'Total fee collected',
    ]);
    const cards = [...el.querySelectorAll('#fc-cards .kpi')].map((k) => parts(k, '.k-l, .k-v'));
    expect(cards).toEqual([
      'Total collected · 2026-27 ₹14,500.00 of ₹56,100.00',
      'Tuition ₹12,000.00',
      'Annual ₹2,000.00',
      'Transport ₹0.00',
      'Application fee ₹500.00',
      'Admission fee ₹0.00',
    ]);
    const row = [...el.querySelectorAll('#fc-table tbody tr')[0]!.querySelectorAll('td')].map(
      (td) => parts(td, '.amt, .cell-t, .cell-s, .t-faint'),
    );
    expect(row.slice(1)).toEqual([
      '₹12,000.00 of ₹18,000.00',
      '₹2,000.00 of ₹3,000.00',
      '—',
      '₹500.00 Paid · Online',
      '₹0.00 Pending ₹10,000.00',
      '₹14,500.00 of ₹31,500.00',
    ]);
    // No total row; the pager says how many.
    expect(el.querySelector('#fc-table tfoot')).toBeNull();
    expect(text(el.querySelector('.pager'))).toContain('Showing 1–2 of 2');
  });

  it('shows only a picked structure’s heads, and narrows by class and section', async () => {
    const el = await loaded();
    (el.querySelector('#fc-structure-b') as HTMLButtonElement).click();
    await settle(1);
    expect([...document.querySelectorAll('.dd-opt')].map((b) => parts(b, 'span').trim())).toEqual([
      'All fee structures',
      'Middle school 2026-27 Version 1',
      'Primary 2026-27 Version 1',
    ]);
    (document.querySelector('.dd-opt:nth-child(3)') as HTMLButtonElement).click();
    await settle(1);
    (await request((u) => u === `${FC}?yearId=y-1&structureId=s-2&page=1&pageSize=15`)).flush(
      view({
        structure: { id: 's-2', name: 'Primary 2026-27', version: 1 },
        heads: [{ id: 'h-t', name: 'Tuition' }],
        cards: { ...view().cards, heads: [{ headId: 'h-t', collected: money('12000.00') }] },
        students: [{ ...asha, heads: [asha.heads[0]!] }],
        total: 1,
      }),
    );
    await settle();
    expect(heads(el)).toEqual([
      'Student',
      'Tuition',
      'Application fee',
      'Admission fee',
      'Total fee collected',
    ]);
    expect(el.querySelectorAll('#fc-cards .kpi')).toHaveLength(4);

    // A class, then one of its sections.
    expect(el.querySelector('#fc-sec-b')).toBeNull();
    await pick('fc-cls', 'Grade 6');
    (
      await request((u) => u === `${FC}?yearId=y-1&structureId=s-2&classId=c-6&page=1&pageSize=15`)
    ).flush(view({ total: 0, students: [] }));
    await settle();
    expect(text(el.querySelector('#fc-table tbody'))).toContain('No student matches');
    await pick('fc-sec', 'Section B');
    (
      await request(
        (u) =>
          u === `${FC}?yearId=y-1&structureId=s-2&classId=c-6&sectionId=sec-b&page=1&pageSize=15`,
      )
    ).flush(view({ students: [kiran], total: 1 }));
    await settle();
    expect(text(el.querySelector('#fc-table tbody'))).toContain('Kiran Rao');
  });

  it('pages through the students, and starts again on another year', async () => {
    const el = await loaded(view({ total: 40 }));
    expect(text(el.querySelector('.pager'))).toContain('Showing 1–15 of 40');
    const next = [...el.querySelectorAll('.pager .pg button')].find((b) => text(b) === '2');
    (next as HTMLButtonElement).click();
    await settle(1);
    (await request((u) => u === `${FC}?yearId=y-1&page=2&pageSize=15`)).flush(
      view({ total: 40, page: 2 }),
    );
    await settle();
    expect(text(el.querySelector('.pager'))).toContain('Showing 16–30 of 40');

    await pick('fc-year', 'Academic year 2025-26');
    (await request((u) => u === '/api/v1/console/fee-structures?yearId=y-0')).flush({
      items: [],
      kpis: null,
    });
    (await request((u) => u === `${FC}?yearId=y-0&page=1&pageSize=15`)).flush(
      view({ year: { id: 'y-0', label: '2025-26' } }),
    );
    await settle();
    expect(text(el.querySelector('#fc-cards'))).toContain('Total collected · 2025-26');
    expect(pending(FC)).toHaveLength(0);
  });

  it('opens a head: its instalments for the student with what was collected', async () => {
    const el = await loaded();
    (el.querySelector('#fc-table tbody tr .fc-head') as HTMLButtonElement).click();
    await settle(1);
    (await request((u) => u === `${FC}/students/m-1?yearId=y-1`)).flush(ashaDetail);
    await settle();
    const dlg = document.querySelector('.modal[role="dialog"]') as HTMLElement;
    expect(text(dlg.querySelector('h3'))).toBe('Tuition · Asha Rao');
    expect(parts(dlg.querySelector('#fc-sum'), 'dt, dd')).toBe(
      'Total fee ₹18,000.00 Collected ₹12,000.00 Pending ₹6,000.00',
    );
    expect([...dlg.querySelectorAll('#fc-inst tbody tr')].map((tr) => parts(tr, 'td'))).toEqual([
      'Term 2 15 Nov 2026 ₹9,000.00 ₹9,000.00 ₹0.00 Paid',
      'Term 3 15 Jan 2027 ₹9,000.00 ₹3,000.00 ₹6,000.00 Partially paid',
    ]);
    (dlg.querySelector('.sh-f .btn') as HTMLButtonElement).click();
    await settle(1);
    expect(document.querySelector('.modal[role="dialog"]')).toBeNull();
  });

  // --- Collect Fee (client 2026-10-19) ---------------------------------------------------------------
  const collector = () =>
    session({ subTasks: ['home.view', 'task.home', 'task.fees', 'fees.view', 'fees.collect'] });
  /** A collection on an instalment, as FEE-046 lists it. */
  const collection = (
    collectionId: string,
    receiptNo: string,
    mode: InstalmentCollection['mode'],
    total: string,
    paidAt = '2026-06-10T04:30:00.000Z',
  ): InstalmentCollection => ({ collectionId, receiptNo, paidAt, mode, total: money(total) });
  const collectData = (
    term2: Partial<CollectInstalment> = {},
    term1: Partial<CollectInstalment> = {},
  ): CollectStudent => ({
    year: { id: 'y-1', label: '2026-27' },
    student: { id: 'm-1', name: 'Asha Rao', admissionNo: 'TVPS/1', classSection: 'Grade 6 A' },
    van: { number: 'CODE555500329', active: true },
    sendTo: { mobile: '••••••4321', email: 'r•••@example.in' },
    instalments: [
      {
        recordId: 'r-1',
        label: 'Term 1',
        dueDate: '2026-06-15',
        amount: money('9000.00'),
        fine: money('0.00'),
        paid: money('9000.00'),
        outstanding: money('0.00'),
        status: 'PAID',
        financed: false,
        collectable: false,
        collections: [collection('c-1', 'TVPS/FR/2026/000001', 'CASH', '9000.00')],
        ...term1,
      },
      {
        recordId: 'r-2',
        label: 'Term 2',
        dueDate: '2026-11-15',
        amount: money('9000.00'),
        fine: money('250.00'),
        paid: money('0.00'),
        outstanding: money('9250.00'),
        status: 'OVERDUE',
        financed: false,
        collectable: true,
        collections: [],
        ...term2,
      },
    ],
  });
  async function openCollect(data: CollectStudent = collectData()) {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/feecollection');
    (await request((u) => u === '/api/v1/console/session')).flush(collector());
    await nav;
    await settle(2);
    (await request((u) => u === '/api/v1/console/classes')).flush(classes);
    (await request((u) => u === '/api/v1/console/entry-fees')).flush(years);
    (await request((u) => u === '/api/v1/console/fee-structures?yearId=y-1')).flush(structures);
    (await request((u) => u === `${FC}?yearId=y-1&page=1&pageSize=15`)).flush(view());
    await settle();
    const el = harness.routeNativeElement as HTMLElement;
    (el.querySelector('#fc-table tbody tr .fc-collect') as HTMLButtonElement).click();
    await settle(1);
    (await request((u) => u === `${FC}/students/m-1/collect?yearId=y-1`)).flush(data);
    await settle();
    return document.querySelector('.modal[role="dialog"]') as HTMLElement;
  }

  /** The receipt FEE-047 and FEE-053 answer with. */
  const receiptOf = (over: Partial<FeeReceipt> = {}): FeeReceipt => ({
    collectionId: 'c-42',
    receiptNo: 'TVPS/FR/2026/000042',
    paidAt: '2026-10-22T05:30:00.000Z',
    mode: 'CASH',
    paidBy: 'Ramesh Rao',
    transactionId: null,
    school: { name: 'Tunga Valley Public School' },
    student: { name: 'Asha Rao', admissionNo: 'TVPS/1', classSection: 'Grade 6 A' },
    year: '2026-27',
    instalment: { label: 'Term 2', dueDate: '2026-11-15' },
    amount: money('9000.00'),
    fine: money('250.00'),
    total: money('9250.00'),
    ...over,
  });
  const paidTerm2 = () =>
    collectData({
      paid: money('9250.00'),
      outstanding: money('0.00'),
      status: 'PAID',
      collectable: false,
    });
  /** The dialog on top (the cash dialog, the link sheet), not Collect fee under it. */
  const top = () => [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
  const confirm = async () => {
    await settle(2);
    const ask = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    ([...ask.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    await settle(2);
  };
  const type = (root: Element, sel: string, v: string) => {
    const i = root.querySelector(sel) as HTMLInputElement;
    i.value = v;
    i.dispatchEvent(new Event('input'));
  };

  it('opens wide, with the VAN spaced from its number and the open instalment picked', async () => {
    const dlg = await openCollect();
    expect(text(dlg.querySelector('h3'))).toBe('Collect fee · Asha Rao');
    // Wide enough for the instalments without scrolling sideways (client 2026-10-22).
    expect(dlg.classList.contains('wide')).toBe(true);
    expect(dlg.querySelector('#fcl-inst')!.classList.contains('cc-nowrap')).toBe(true);
    expect(text(dlg.querySelector('#fcl-van .t-mono'))).toBe('CODE555500329');
    expect(text(dlg.querySelector('#fcl-van .grow'))).toBe('VAN CODE555500329');
    const radios = [...dlg.querySelectorAll('#fcl-inst input[type="radio"]')] as HTMLInputElement[];
    // A paid instalment can't be picked; the open one is.
    expect(radios.map((r) => [r.disabled, r.checked])).toEqual([
      [true, false],
      [false, true],
    ]);
    expect(text(dlg.querySelector('#fcl-pay'))).toContain('Collect Term 2 · ₹9,250.00');
    // The ways the admission fees page offers too (client 2026-10-22); none until one is chosen.
    expect([...dlg.querySelectorAll('#fcl-pay .choice .t-h4')].map((h) => text(h))).toEqual([
      'Pay now',
      'Send link',
      'Record cash',
    ]);
    expect(text(dlg.querySelector('#fcl-how'))).toBe('Choose how to collect.');
  });

  it('records cash in the admission fees page’s dialog and opens the receipt (FEE-047, FEE-054)', async () => {
    const dlg = await openCollect();
    (dlg.querySelector('#cw-CASH') as HTMLElement).click();
    await settle(1);
    // The same dialog as the admission fees page: the tiles, the counterfoil's number, the day, who.
    const m = top();
    expect(m).not.toBe(dlg);
    expect(text(m.querySelector('h3'))).toBe('Record cash collection');
    expect(text(m.querySelector('.sh-t p'))).toBe('Asha Rao · admission number TVPS/1 · Grade 6 A');
    expect([...m.querySelectorAll('.cm-tile')].map((t) => text(t))).toEqual([
      'Term 2₹9,250.00',
      'ModeCash',
    ]);
    expect(text(m.querySelector('label[for="cc-rcpt"]'))).toBe('Receipt number(optional)');
    expect(text(m.querySelector('#cc-rcpt-e + .fld-h'))).toContain('From the counterfoil book.');
    expect((m.querySelector('#cc-date') as HTMLInputElement).value).toBe(today);
    expect(text(m.querySelector('#cc-save'))).toBe('Record ₹9,250.00');
    (m.querySelector('#cc-save') as HTMLButtonElement).click();
    await settle();
    expect(text(m)).toContain('Enter who paid');
    type(m, '#cc-rcpt', 'RCPT/0042');
    type(m, '#cc-by', 'Ramesh Rao');
    (m.querySelector('#cc-save') as HTMLButtonElement).click();
    await confirm();
    const cash = await request((u) => u === '/api/v1/console/fee-records/r-2/cash', 'POST');
    expect(cash.request.body).toEqual({
      receivedAt: today,
      receiptNo: 'RCPT/0042',
      paidBy: 'Ramesh Rao',
    });
    expect(cash.request.headers.get('Idempotency-Key')).toBeTruthy();
    cash.flush(
      {
        receiptNo: 'RCPT/0042',
        amount: money('9250.00'),
        mode: 'CASH',
        recordId: 'r-2',
        status: 'PAID',
        collectionId: 'c-42',
        receipt: receiptOf({ receiptNo: 'RCPT/0042' }),
      },
      { status: 201, statusText: 'Created' },
    );
    await settle(2);
    expect(text(document.querySelector('.toasts'))).toContain('Cash collection recorded');
    // The page's figures again, and the instalments.
    (await request((u) => u === `${FC}?yearId=y-1&page=1&pageSize=15`)).flush(view());
    (await request((u) => u === `${FC}/students/m-1/collect?yearId=y-1`)).flush(paidTerm2());
    await settle();
    expect(document.querySelector('#cc-form')).toBeNull();
    // The receipt, with what matters on it.
    const drawer = document.querySelector('.drawer') as HTMLElement;
    expect(text(drawer.querySelector('h3'))).toBe('Receipt');
    const body = text(drawer.querySelector('#ir-body'));
    for (const part of [
      'Tunga Valley Public School',
      'Fee receiptRCPT/0042',
      'ModeCash',
      'Received fromRamesh Rao',
      'StudentAsha Rao',
      'Admission no.TVPS/1',
      'ClassGrade 6 A',
      'Academic year2026-27',
      'InstalmentTerm 2',
      'Due date15 Nov 2026',
      'Fee₹9,000.00',
      'Late fine₹250.00',
      'Total received₹9,250.00',
    ]) {
      expect(body).toContain(part);
    }
    expect(drawer.querySelector('#ir-txn')).toBeNull();
    (drawer.querySelector('#ir-pdf') as HTMLButtonElement).click();
    const pdf = await request((u) => u === '/api/v1/console/fee-collections/c-42/receipt');
    expect(pdf.request.responseType).toBe('blob');
    // Closed, it opens again from the instalment's note.
    (drawer.querySelector('.sh-f .btn-sec') as HTMLButtonElement).click();
    await settle(1);
    expect(document.querySelector('.drawer')).toBeNull();
    expect(text(dlg.querySelector('#fcl-cash-done'))).toContain(
      '₹9,250.00 received in cash. Receipt RCPT/0042',
    );
    (dlg.querySelector('#fcl-cash-receipt') as HTMLButtonElement).click();
    await settle(1);
    expect(text(document.querySelector('.drawer #ir-no'))).toBe('RCPT/0042');
  });

  it('shows a receipt number already used on its field (FEE.RECEIPT_TAKEN)', async () => {
    const dlg = await openCollect();
    (dlg.querySelector('#cw-CASH') as HTMLElement).click();
    await settle(1);
    const m = top();
    type(m, '#cc-rcpt', 'RCPT/0007');
    type(m, '#cc-by', 'Ramesh Rao');
    (m.querySelector('#cc-save') as HTMLButtonElement).click();
    await confirm();
    (await request((u) => u === '/api/v1/console/fee-records/r-2/cash', 'POST')).flush(
      {
        type: 'urn:campusone:problem:fee.receipt_taken',
        title: 'Receipt number already used',
        status: 409,
        code: 'FEE.RECEIPT_TAKEN',
        detail: 'Receipt number already used',
      },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();
    expect(m.querySelector('#cc-rcpt')!.closest('.fld')!.classList.contains('invalid')).toBe(true);
    expect(text(m.querySelector('#cc-rcpt-e'))).toBe(translate('FEE.RECEIPT_TAKEN'));
    // Nothing was recorded: the dialog stays, and no receipt opens.
    expect(document.querySelector('.drawer')).toBeNull();

    // A field the server refuses is shown on that field.
    (m.querySelector('#cc-save') as HTMLButtonElement).click();
    await confirm();
    (await request((u) => u === '/api/v1/console/fee-records/r-2/cash', 'POST')).flush(
      {
        type: 'urn:campusone:problem:validation',
        title: 'Check the highlighted fields',
        status: 422,
        code: 'VALIDATION.FAILED',
        errors: [{ field: 'paidBy', code: 'VALIDATION.FORMAT' }],
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await settle();
    expect(text(m.querySelector('#cc-by-e'))).toBe(translate('VALIDATION.FORMAT'));
  });

  it('sends a payment link and shows the admission fees page’s sheet, then checks the payment', async () => {
    const dlg = await openCollect();
    // No QR code any more (client 2026-10-22).
    expect(dlg.querySelector('#fcl-m-QR, #cw-QR')).toBeNull();
    (dlg.querySelector('#cw-LINK') as HTMLElement).click();
    await settle(1);
    expect(text(dlg.querySelector('#fcl-send-to'))).toBe(
      'Sends a link that works for 1 day to the student and parents by SMS, e-mail and in the app (••••••4321 and r•••@example.in and the parents on record).',
    );
    (dlg.querySelector('#fcl-link-send') as HTMLButtonElement).click();
    await settle(1);
    const link = await request(
      (u) => u === '/api/v1/console/fee-records/r-2/payment-requests',
      'POST',
    );
    expect(link.request.body).toEqual({ channel: 'LINK' });
    link.flush({
      id: 'q-2',
      channel: 'LINK',
      link: 'https://school.example/fees/pay/q-2?token=t',
      amount: money('9250.00'),
      expiresAt: '2026-10-26T06:00:00.000Z',
      sentTo: {
        mobiles: ['••••••4321', '••••••8765'],
        emails: ['r•••@example.in'],
        inApp: 2,
      },
    });
    await settle();
    // The same sheet as the admission fees page.
    const m = top();
    expect(m).not.toBe(dlg);
    expect(text(m.querySelector('h3'))).toBe('Payment link sent');
    expect(text(m.querySelector('.sh-t p'))).toBe('Asha Rao · admission number TVPS/1 · Grade 6 A');
    const tiles = [...m.querySelectorAll('.cm-tile')].map((t) => text(t));
    expect(tiles[0]).toBe('Term 2₹9,250.00');
    expect(tiles[1]).toContain('Link works until26 Oct 2026');
    expect(text(m.querySelector('#pl-url'))).toBe('https://school.example/fees/pay/q-2?token=t');
    expect(text(m.querySelector('#pl-sent'))).toBe(
      'SMS••••••4321, ••••••8765E-mailr•••@example.inIn the app2 people',
    );
    expect(m.querySelector('#pl-nowhere')).toBeNull();
    expect(text(m.querySelector('#pl-copy'))).toBe('Copy link');
    (m.querySelector('.sh-f .btn-sec') as HTMLButtonElement).click();
    await settle(1);
    expect(document.querySelector('#pl-body')).toBeNull();
    // Collect fee still says where it went, shows the link again and checks the payment.
    expect(text(dlg.querySelector('#fcl-link-done'))).toContain(
      'Payment link sent by SMS to ••••••4321, ••••••8765 · by e-mail to r•••@example.in · in the app to 2 people',
    );
    (dlg.querySelector('#fcl-link-show') as HTMLButtonElement).click();
    await settle(1);
    expect(text(document.querySelector('#pl-url'))).toBe(
      'https://school.example/fees/pay/q-2?token=t',
    );
    (top().querySelector('.sh-f .btn-sec') as HTMLButtonElement).click();
    await settle(1);
    (dlg.querySelector('#fcl-check') as HTMLButtonElement).click();
    await settle(1);
    (await request((u) => u === `${FC}/students/m-1/collect?yearId=y-1`)).flush(collectData());
    await settle();
    expect(text(document.querySelector('.toasts'))).toContain('Not paid yet');
  });

  it('says on the sheet when the link went nowhere', async () => {
    const dlg = await openCollect();
    (dlg.querySelector('#cw-LINK') as HTMLElement).click();
    await settle(1);
    (dlg.querySelector('#fcl-link-send') as HTMLButtonElement).click();
    await settle(1);
    (await request((u) => u === '/api/v1/console/fee-records/r-2/payment-requests', 'POST')).flush({
      id: 'q-3',
      channel: 'LINK',
      link: 'https://school.example/fees/pay/q-3?token=t',
      amount: money('9250.00'),
      expiresAt: '2026-10-26T06:00:00.000Z',
      sentTo: { mobiles: [], emails: [], inApp: 0 },
    });
    await settle();
    expect(text(top().querySelector('#pl-nowhere'))).toContain(
      "The link wasn't sent: the school's SMS and e-mail are off, or the family has no contact on the student's profile.",
    );
  });

  it('takes an instalment through the gateway at the desk, then opens the receipt (FEE-052/053)', async () => {
    const dlg = await openCollect();
    (dlg.querySelector('#cw-PAY_NOW') as HTMLElement).click();
    await settle(1);
    (dlg.querySelector('#fcl-pay-now') as HTMLButtonElement).click();
    await settle(1);
    const order = await request((u) => u === '/api/v1/console/fee-records/r-2/orders', 'POST');
    expect(order.request.headers.get('Idempotency-Key')).toBeTruthy();
    order.flush({
      requestId: 'q-9',
      amount: money('9250.00'),
      gatewayOrder: {
        orderId: 'order_T9',
        amount: money('9250.00'),
        mode: 'test',
        test: { paymentId: 'pay_T9', signature: 'sig-9' },
      },
    });
    await settle(2);
    const ask = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    expect(text(ask)).toContain('₹9,250.00 is marked paid as a test');
    ([...ask.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    await settle(2);
    const verify = await request(
      (u) => u === '/api/v1/console/fee-records/r-2/orders/q-9/verify',
      'POST',
    );
    expect(verify.request.body).toEqual({ gatewayPaymentId: 'pay_T9', signature: 'sig-9' });
    verify.flush({
      receiptNo: 'TVPS/FR/2026/000043',
      transactionId: 'pay_T9',
      amount: money('9250.00'),
      mode: 'ONLINE',
      recordId: 'r-2',
      status: 'PAID',
      collectionId: 'c-43',
      receipt: receiptOf({
        collectionId: 'c-43',
        receiptNo: 'TVPS/FR/2026/000043',
        mode: 'ONLINE',
        paidBy: null,
        transactionId: 'pay_T9',
      }),
    });
    await settle(2);
    (await request((u) => u === `${FC}?yearId=y-1&page=1&pageSize=15`)).flush(view());
    (await request((u) => u === `${FC}/students/m-1/collect?yearId=y-1`)).flush(paidTerm2());
    await settle();
    expect(text(dlg.querySelector('#fcl-pay-done'))).toContain(
      '₹9,250.00 paid online. Receipt TVPS/FR/2026/000043 · transaction pay_T9',
    );
    const drawer = document.querySelector('.drawer') as HTMLElement;
    expect(text(drawer.querySelector('#ir-no'))).toBe('TVPS/FR/2026/000043');
    expect(text(drawer.querySelector('#ir-txn'))).toBe('pay_T9');
    expect(text(drawer.querySelector('#ir-body'))).toContain('ModeOnline');
    expect(text(drawer.querySelector('#ir-body'))).not.toContain('Received from');
    (drawer.querySelector('#ir-pdf') as HTMLButtonElement).click();
    const pdf = await request((u) => u === '/api/v1/console/fee-collections/c-43/receipt');
    expect(pdf.request.responseType).toBe('blob');
  });

  // --- An instalment's receipts (FEE-046, FEE-056, FEE-054) -----------------------------------------
  const RC = '/api/v1/console/fee-collections';
  const instRows = (dlg: HTMLElement) =>
    [...dlg.querySelectorAll('#fcl-inst tbody tr')] as HTMLElement[];

  it('opens a paid instalment’s receipt from its row, with the PDF (FEE-056, FEE-054)', async () => {
    const dlg = await openCollect();
    const [term1, term2] = instRows(dlg);
    // Paid, but not a dead row: it isn't greyed out and has its Receipt action; its radio stays off.
    expect(term1!.classList.contains('t-faint')).toBe(false);
    expect(term1!.hasAttribute('data-act')).toBe(true);
    expect(text(term1!.querySelector('.fcl-rcpt'))).toBe('Receipt');
    expect(term1!.querySelector('.fcl-rcpt')!.getAttribute('aria-label')).toBe('Receipt of Term 1');
    expect((term1!.querySelector('input[type="radio"]') as HTMLInputElement).disabled).toBe(true);
    // Nothing collected on the open instalment: no Receipt action.
    expect(term2!.querySelector('.fcl-rcpt')).toBeNull();
    expect(term2!.hasAttribute('data-act')).toBe(false);

    term1!
      .querySelector('td:nth-child(2)')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle(1);
    // The drawer opens at once, loading; nothing to download yet.
    const drawer = document.querySelector('.drawer') as HTMLElement;
    expect(text(drawer.querySelector('h3'))).toBe('Receipt');
    expect(text(drawer)).toContain('Loading…');
    expect((drawer.querySelector('#ir-pdf') as HTMLButtonElement).disabled).toBe(true);
    (await request((u) => u === `${RC}/c-1`)).flush(
      receiptOf({
        collectionId: 'c-1',
        receiptNo: 'TVPS/FR/2026/000001',
        paidAt: '2026-06-10T04:30:00.000Z',
        instalment: { label: 'Term 1', dueDate: '2026-06-15' },
        amount: money('9000.00'),
        fine: money('0.00'),
        total: money('9000.00'),
      }),
    );
    await settle();
    expect(text(drawer.querySelector('#ir-no'))).toBe('TVPS/FR/2026/000001');
    const body = text(drawer.querySelector('#ir-body'));
    for (const part of [
      'Paid on10 Jun 2026 · 10:00 AM',
      'ModeCash',
      'Received fromRamesh Rao',
      'InstalmentTerm 1',
      'Due date15 Jun 2026',
      'Total received₹9,000.00',
    ]) {
      expect(body).toContain(part);
    }
    (drawer.querySelector('#ir-pdf') as HTMLButtonElement).click();
    const pdf = await request((u) => u === `${RC}/c-1/receipt`);
    expect(pdf.request.responseType).toBe('blob');
    // Closed, Collect fee is as it was: the open instalment still picked.
    (drawer.querySelector('.sh-f .btn-sec') as HTMLButtonElement).click();
    await settle(1);
    expect(document.querySelector('.drawer')).toBeNull();
    expect(text(dlg.querySelector('#fcl-pay'))).toContain('Collect Term 2 · ₹9,250.00');
  });

  it('lists the receipts of an instalment paid in parts, each opening its own', async () => {
    const dlg = await openCollect(
      collectData(
        {},
        {
          collections: [
            collection('c-1', 'TVPS/FR/2026/000001', 'CASH', '4000.00'),
            collection(
              'c-2',
              'RPEP2WPRT21R14RGVBXKJ2LECL562770950',
              'WALLET',
              '5000.00',
              '2026-06-14T06:45:00.000Z',
            ),
          ],
        },
      ),
    );
    const action = instRows(dlg)[0]!.querySelector('.fcl-rcpt') as HTMLButtonElement;
    expect(text(action)).toBe('2 receipts');
    expect(action.getAttribute('aria-label')).toBe('Receipts of Term 1');
    expect(action.getAttribute('aria-expanded')).toBe('false');
    // The row opens the list as the action does, and no receipt is fetched yet.
    instRows(dlg)[0]!.click();
    await settle(1);
    expect(action.getAttribute('aria-expanded')).toBe('true');
    expect(pending(RC)).toHaveLength(0);
    const list = dlg.querySelector('#fcl-rcpts') as HTMLElement;
    expect(text(list)).toContain('Receipts · Term 1');
    const rows = [...list.querySelectorAll('tbody tr')] as HTMLElement[];
    expect(rows.map((tr) => parts(tr, 'td'))).toEqual([
      'TVPS/FR/2026/000001 10 Jun 2026 · 10:00 AM Cash ₹4,000.00',
      'RPEP2WPRT21R14RGVBXKJ2LECL562770950 14 Jun 2026 · 12:15 PM Wallet ₹5,000.00',
    ]);
    // From the keyboard: Enter on the wallet payment opens its receipt.
    expect(rows[1]!.getAttribute('tabindex')).toBe('0');
    enter(rows[1]!);
    await settle(1);
    (await request((u) => u === `${RC}/c-2`)).flush(
      receiptOf({
        collectionId: 'c-2',
        receiptNo: 'RPEP2WPRT21R14RGVBXKJ2LECL562770950',
        mode: 'WALLET',
        paidBy: null,
        instalment: { label: 'Term 1', dueDate: '2026-06-15' },
        amount: money('5000.00'),
        fine: money('0.00'),
        total: money('5000.00'),
      }),
    );
    await settle();
    const drawer = document.querySelector('.drawer') as HTMLElement;
    expect(text(drawer.querySelector('#ir-no'))).toBe('RPEP2WPRT21R14RGVBXKJ2LECL562770950');
    expect(text(drawer.querySelector('#ir-body'))).toContain('ModeWallet');
    expect(text(drawer.querySelector('#ir-body'))).toContain('Paid from the campus wallet.');
    (drawer.querySelector('#ir-pdf') as HTMLButtonElement).click();
    expect((await request((u) => u === `${RC}/c-2/receipt`)).request.responseType).toBe('blob');
    (drawer.querySelector('.sh-f .btn-sec') as HTMLButtonElement).click();
    await settle(1);
    // The other one, clicked.
    rows[0]!.click();
    await settle(1);
    (await request((u) => u === `${RC}/c-1`)).flush(receiptOf({ collectionId: 'c-1' }));
    await settle();
    expect(document.querySelector('.drawer #ir-body')).not.toBeNull();
    (document.querySelector('.drawer .sh-f .btn-sec') as HTMLButtonElement).click();
    await settle(1);
    // The list closes.
    (list.querySelector('.x-btn') as HTMLButtonElement).click();
    await settle(1);
    expect(dlg.querySelector('#fcl-rcpts')).toBeNull();
  });

  it('keeps a partly paid instalment pickable, its Receipt action opening what was paid', async () => {
    const dlg = await openCollect(
      collectData({
        paid: money('4000.00'),
        outstanding: money('5250.00'),
        status: 'PARTIALLY_PAID',
        collections: [collection('c-3', 'TVPS/FR/2026/000003', 'ONLINE', '4000.00')],
      }),
    );
    const term2 = instRows(dlg)[1]!;
    const radio = term2.querySelector('input[type="radio"]') as HTMLInputElement;
    expect([radio.disabled, radio.checked]).toEqual([false, true]);
    expect(text(dlg.querySelector('#fcl-pay'))).toContain('Collect Term 2 · ₹5,250.00');
    // The row itself is for collecting: a click on it opens no receipt.
    expect(term2.hasAttribute('data-act')).toBe(false);
    term2.click();
    await settle(1);
    expect(document.querySelector('.drawer')).toBeNull();
    expect(pending(RC)).toHaveLength(0);
    (term2.querySelector('.fcl-rcpt') as HTMLButtonElement).click();
    await settle(1);
    (await request((u) => u === `${RC}/c-3`)).flush(
      receiptOf({
        collectionId: 'c-3',
        receiptNo: 'TVPS/FR/2026/000003',
        mode: 'ONLINE',
        paidBy: null,
        transactionId: 'pay_P3',
        amount: money('4000.00'),
        fine: money('0.00'),
        total: money('4000.00'),
      }),
    );
    await settle();
    const drawer = document.querySelector('.drawer') as HTMLElement;
    expect(text(drawer.querySelector('#ir-no'))).toBe('TVPS/FR/2026/000003');
    expect(text(drawer.querySelector('#ir-txn'))).toBe('pay_P3');
    // Still picked for the rest.
    expect(radio.checked).toBe(true);
  });

  it('says so in the drawer when a receipt can’t be loaded, and tries again', async () => {
    const dlg = await openCollect();
    (instRows(dlg)[0]!.querySelector('.fcl-rcpt') as HTMLButtonElement).click();
    await settle(1);
    (await request((u) => u === `${RC}/c-1`)).flush(
      {
        type: 'about:blank',
        title: 'Not found',
        status: 404,
        code: 'GEN.NOT_FOUND',
        detail: 'Not found',
      },
      { status: 404, statusText: 'Not Found' },
    );
    await settle();
    const drawer = document.querySelector('.drawer') as HTMLElement;
    expect(text(drawer)).toContain("Couldn't load the receipt");
    expect((drawer.querySelector('#ir-pdf') as HTMLButtonElement).disabled).toBe(true);
    (drawer.querySelector('.empty .btn') as HTMLButtonElement).click();
    await settle(1);
    (await request((u) => u === `${RC}/c-1`)).flush(receiptOf({ collectionId: 'c-1' }));
    await settle();
    expect(drawer.querySelector('#ir-body')).not.toBeNull();
  });

  // --- The Receipts tab (FEE-057) ---------------------------------------------------------------------
  const row = (over: Partial<ReceiptRow> = {}): ReceiptRow => ({
    collectionId: 'c-42',
    receiptNo: 'TVPS/FR/2026/000042',
    paidAt: '2026-10-22T05:30:00.000Z',
    mode: 'CASH',
    paidBy: 'Ramesh Rao',
    transactionId: null,
    amount: money('9000.00'),
    fine: money('250.00'),
    total: money('9250.00'),
    student: { id: 'm-1', name: 'Asha Rao', admissionNo: 'TVPS/1', classSection: 'Grade 6 A' },
    instalment: { recordId: 'r-2', label: 'Term 2' },
    ...over,
  });
  const receiptsView = (over: Partial<ReceiptsView> = {}): ReceiptsView => ({
    year: { id: 'y-1', label: '2026-27' },
    items: [
      row(),
      row({
        collectionId: 'c-43',
        receiptNo: 'TVPS/FR/2026/000043',
        paidAt: '2026-10-21T09:15:00.000Z',
        mode: 'ONLINE',
        paidBy: null,
        transactionId: 'pay_T9',
        amount: money('4250.00'),
        fine: money('0.00'),
        total: money('4250.00'),
        student: { id: 'm-2', name: 'Kiran Rao', admissionNo: null, classSection: null },
        instalment: { recordId: 'r-7', label: 'Term 1' },
      }),
      row({
        collectionId: 'c-44',
        receiptNo: 'RPEP2WPRT21R14RGVBXKJ2LECL562770950',
        paidAt: '2026-10-20T03:00:00.000Z',
        mode: 'WALLET',
        paidBy: null,
        amount: money('5000.00'),
        fine: money('0.00'),
        total: money('5000.00'),
        instalment: { recordId: 'r-1', label: 'Term 1' },
      }),
    ],
    totals: {
      count: 3,
      collected: money('18500.00'),
      cash: { count: 1, amount: money('9250.00') },
      online: { count: 1, amount: money('4250.00') },
      wallet: { count: 1, amount: money('5000.00') },
    },
    page: 1,
    pageSize: 15,
    total: 3,
    ...over,
  });
  const kpis = (el: HTMLElement, id: string) =>
    [...el.querySelectorAll(`#${id} .kpi`)].map((k) => parts(k, '.k-l, .k-v, .k-d'));
  const tab = async (el: HTMLElement, t: 'fees' | 'rcpt') => {
    (el.querySelector(`#fc-tab-${t}`) as HTMLButtonElement).click();
    await settle(1);
  };

  it('lists the year’s receipts on their tab, with their own cards (FEE-057)', async () => {
    const el = await loaded();
    expect(
      [...el.querySelectorAll('.tabs .tab')].map((t) => [text(t), t.getAttribute('aria-selected')]),
    ).toEqual([
      ['Fees by student', 'true'],
      ['Receipts', 'false'],
    ]);
    await tab(el, 'rcpt');
    // Never the fees tab's cards, not even while the receipts load.
    expect(el.querySelector('#fc-cards')).toBeNull();
    expect(el.querySelector('#fc-rcards')).toBeNull();
    expect(el.querySelector('#fc-table')).toBeNull();
    expect(text(el.querySelector('.card .empty'))).toContain('Loading…');
    // No structure filter: receipts aren't kept by structure; the search finds receipt numbers too.
    expect(el.querySelector('#fc-structure-b')).toBeNull();
    expect(el.querySelector<HTMLInputElement>('#fc-q')!.placeholder).toBe(
      'Search student, admission or receipt no.',
    );
    (await request((u) => u === `${RC}?yearId=y-1&page=1&pageSize=15`)).flush(receiptsView());
    await settle();
    expect(el.querySelector('#fc-tab-rcpt')!.getAttribute('aria-selected')).toBe('true');
    expect(kpis(el, 'fc-rcards')).toEqual([
      'Collected · 2026-27 ₹18,500.00 3 receipts',
      'Cash ₹9,250.00 1 receipt',
      'Online ₹4,250.00 1 receipt',
      'Wallet ₹5,000.00 1 receipt',
    ]);
    // The admission fees page's receipts columns.
    expect([...el.querySelectorAll('#fc-rcpt thead th')].map((th) => text(th))).toEqual([
      'Receipt / reference',
      'For',
      'Student',
      'Mode',
      'Transaction ID',
      'Amount',
      'Paid',
    ]);
    expect(
      [...el.querySelectorAll('#fc-rcpt tbody tr')].map((tr) =>
        [...tr.querySelectorAll('td')].map(
          (td) => parts(td, '.t-mono, .cell-t, .cell-s, .tag, .amt') || text(td),
        ),
      ),
    ).toEqual([
      [
        'TVPS/FR/2026/000042',
        'Term 2',
        'Asha Rao TVPS/1 · Grade 6 A',
        'Cash',
        '—',
        '₹9,250.00 incl. fine ₹250.00',
        '22 Oct 2026 11:00 AM',
      ],
      [
        'TVPS/FR/2026/000043',
        'Term 1',
        'Kiran Rao — · Not enrolled',
        'Online',
        'pay_T9',
        '₹4,250.00',
        '21 Oct 2026 2:45 PM',
      ],
      [
        'RPEP2WPRT21R14RGVBXKJ2LECL562770950',
        'Term 1',
        'Asha Rao TVPS/1 · Grade 6 A',
        'Wallet',
        '—',
        '₹5,000.00',
        '20 Oct 2026 8:30 AM',
      ],
    ]);
    expect(text(el.querySelector('.pager'))).toContain('Showing 1–3 of 3');
    expect(pending(FC)).toHaveLength(0);
  });

  it('narrows and pages the receipts with the page’s filters', async () => {
    const el = await loaded();
    await tab(el, 'rcpt');
    (await request((u) => u === `${RC}?yearId=y-1&page=1&pageSize=15`)).flush(
      receiptsView({ total: 40 }),
    );
    await settle();
    await pick('fc-cls', 'Grade 6');
    (await request((u) => u === `${RC}?yearId=y-1&classId=c-6&page=1&pageSize=15`)).flush(
      receiptsView({ items: [], total: 0, totals: { ...receiptsView().totals, count: 0 } }),
    );
    await settle();
    expect(text(el.querySelector('#fc-rcpt tbody'))).toContain('No receipt matches');
    await pick('fc-sec', 'Section A');
    (
      await request((u) => u === `${RC}?yearId=y-1&classId=c-6&sectionId=sec-a&page=1&pageSize=15`)
    ).flush(receiptsView({ total: 40 }));
    await settle();
    // The search, once typing stops: a name, an admission number or a receipt number.
    const q = el.querySelector('#fc-q') as HTMLInputElement;
    q.value = 'asha';
    q.dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r, 350));
    (
      await request(
        (u) => u === `${RC}?yearId=y-1&classId=c-6&sectionId=sec-a&q=asha&page=1&pageSize=15`,
      )
    ).flush(receiptsView({ total: 40 }));
    await settle();
    expect(text(el.querySelector('.pager'))).toContain('Showing 1–15 of 40');
    const next = [...el.querySelectorAll('.pager .pg button')].find((b) => text(b) === '2');
    (next as HTMLButtonElement).click();
    await settle(1);
    (
      await request(
        (u) => u === `${RC}?yearId=y-1&classId=c-6&sectionId=sec-a&q=asha&page=2&pageSize=15`,
      )
    ).flush(receiptsView({ total: 40, page: 2 }));
    await settle();
    expect(text(el.querySelector('.pager'))).toContain('Showing 16–30 of 40');
    // Another year: from its first page.
    await pick('fc-year', 'Academic year 2025-26');
    (await request((u) => u === '/api/v1/console/fee-structures?yearId=y-0')).flush({
      items: [],
      kpis: null,
    });
    (
      await request(
        (u) => u === `${RC}?yearId=y-0&classId=c-6&sectionId=sec-a&q=asha&page=1&pageSize=15`,
      )
    ).flush(receiptsView({ year: { id: 'y-0', label: '2025-26' } }));
    await settle();
    expect(kpis(el, 'fc-rcards')[0]).toBe('Collected · 2025-26 ₹18,500.00 3 receipts');
    expect(pending(FC)).toHaveLength(0);
  });

  it('opens a receipt from its row, by click or Enter, with the PDF (FEE-056, FEE-054)', async () => {
    const el = await loaded();
    await tab(el, 'rcpt');
    (await request((u) => u === `${RC}?yearId=y-1&page=1&pageSize=15`)).flush(receiptsView());
    await settle();
    const rows = [...el.querySelectorAll('#fc-rcpt tbody tr')] as HTMLElement[];
    expect(rows.every((tr) => tr.getAttribute('tabindex') === '0')).toBe(true);
    rows[1]!.click();
    await settle(1);
    (await request((u) => u === `${RC}/c-43`)).flush(
      receiptOf({
        collectionId: 'c-43',
        receiptNo: 'TVPS/FR/2026/000043',
        mode: 'ONLINE',
        paidBy: null,
        transactionId: 'pay_T9',
      }),
    );
    await settle();
    let drawer = document.querySelector('.drawer') as HTMLElement;
    expect(text(drawer.querySelector('#ir-no'))).toBe('TVPS/FR/2026/000043');
    expect(text(drawer.querySelector('#ir-txn'))).toBe('pay_T9');
    (drawer.querySelector('#ir-pdf') as HTMLButtonElement).click();
    const pdf = await request((u) => u === `${RC}/c-43/receipt`);
    expect(pdf.request.responseType).toBe('blob');
    pdf.flush(new Blob(['%PDF']));
    await settle();
    expect(text(document.querySelector('.toasts'))).toContain('Receipt downloaded');
    (drawer.querySelector('.sh-f .btn-sec') as HTMLButtonElement).click();
    await settle(1);
    expect(document.querySelector('.drawer')).toBeNull();

    enter(rows[0]!);
    await settle(1);
    (await request((u) => u === `${RC}/c-42`)).flush(receiptOf());
    await settle();
    drawer = document.querySelector('.drawer') as HTMLElement;
    expect(text(drawer.querySelector('#ir-no'))).toBe('TVPS/FR/2026/000042');
    expect(text(drawer.querySelector('#ir-body'))).toContain('Received fromRamesh Rao');
  });

  it('switches the cards with the tab, never showing the other tab’s numbers', async () => {
    const el = await loaded();
    // A structure on the fees tab: kept for it, not sent for the receipts.
    await pick('fc-structure', 'Middle school 2026-27');
    (await request((u) => u === `${FC}?yearId=y-1&structureId=s-1&page=1&pageSize=15`)).flush(
      view(),
    );
    await settle();
    expect(kpis(el, 'fc-cards')[0]).toBe('Total collected · 2026-27 ₹14,500.00 of ₹56,100.00');

    await tab(el, 'rcpt');
    (await request((u) => u === `${RC}?yearId=y-1&page=1&pageSize=15`)).flush(receiptsView());
    await settle();
    expect(el.querySelector('#fc-cards')).toBeNull();
    expect(kpis(el, 'fc-rcards')).toHaveLength(4);

    // Back: the receipts' cards go at once, and the students' come back fresh.
    await tab(el, 'fees');
    expect(el.querySelector('#fc-rcards')).toBeNull();
    expect(el.querySelector('#fc-cards')).toBeNull();
    expect(text(el.querySelector('.card .empty'))).toContain('Loading…');
    expect(text(el.querySelector('#fc-structure-b'))).toBe('Middle school 2026-27');
    (await request((u) => u === `${FC}?yearId=y-1&structureId=s-1&page=1&pageSize=15`)).flush(
      view({ cards: { ...view().cards, total: sums('56100.00', '15000.00', '41100.00') } }),
    );
    await settle();
    expect(kpis(el, 'fc-cards')[0]).toBe('Total collected · 2026-27 ₹15,000.00 of ₹56,100.00');
    expect(el.querySelector('#fc-rcpt')).toBeNull();
    expect(el.querySelector('#fc-table')).not.toBeNull();
    expect(pending('fee-collection')).toHaveLength(0);
  });

  // --- Every row opens Collect fee (client 2026-10-22) ------------------------------------------------
  const paid: CollectionStudent = {
    ...kiran,
    id: 'm-3',
    name: 'Aarav Hegde',
    total: sums('16500.00', '16500.00', '0.00'),
    due: money('0.00'),
    collectable: false,
  };
  const none: CollectionStudent = {
    ...kiran,
    id: 'm-4',
    name: 'Diya Rao',
    heads: [null, null, null],
    total: sums('0.00', '0.00', '0.00'),
    due: money('0.00'),
    collectable: false,
  };
  /** The page as a fee collector sees it, with Asha (something due), Aarav (paid) and Diya (none). */
  async function threeStudents() {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/feecollection');
    (await request((u) => u === '/api/v1/console/session')).flush(collector());
    await nav;
    await settle(2);
    (await request((u) => u === '/api/v1/console/classes')).flush(classes);
    (await request((u) => u === '/api/v1/console/entry-fees')).flush(years);
    (await request((u) => u === '/api/v1/console/fee-structures?yearId=y-1')).flush(structures);
    (await request((u) => u === `${FC}?yearId=y-1&page=1&pageSize=15`)).flush(
      view({ students: [asha, paid, none], total: 3 }),
    );
    await settle();
    const el = harness.routeNativeElement as HTMLElement;
    return [...el.querySelectorAll('#fc-table tbody tr')] as HTMLElement[];
  }
  const dialogs = () => document.querySelectorAll('.modal[role="dialog"]');

  it('offers the Collect fee button only while something is due: else Paid, or No fees (client 2026-10-22)', async () => {
    const rows = await threeStudents();
    const last = (tr: Element) => [...tr.querySelectorAll('td')].at(-1)!;
    const [a, b, c] = rows.map(last);
    expect(text(a!.querySelector('.fc-collect'))).toBe('Collect fee');
    expect(b!.querySelector('.fc-collect')).toBeNull();
    expect(text(b!.querySelector('.fc-nodue'))).toBe('Paid');
    expect(c!.querySelector('.fc-collect')).toBeNull();
    expect(text(c!.querySelector('.fc-nodue'))).toBe('No fees');
    // Every row is clickable and reachable from the keyboard, as the admission pages' rows are.
    expect(rows.map((tr) => [tr.getAttribute('tabindex'), tr.hasAttribute('data-act')])).toEqual([
      ['0', true],
      ['0', true],
      ['0', true],
    ]);
  });

  it('opens Collect fee from a paid student’s row: the instalments, the receipts, nothing to collect', async () => {
    const rows = await threeStudents();
    rows[1]!.querySelector('td')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle(1);
    (await request((u) => u === `${FC}/students/m-3/collect?yearId=y-1`)).flush(
      collectData({
        paid: money('9250.00'),
        outstanding: money('0.00'),
        status: 'PAID',
        collectable: false,
        collections: [collection('c-9', 'TVPS/FR/2026/000009', 'ONLINE', '9250.00')],
      }),
    );
    await settle();
    const dlg = document.querySelector('.modal[role="dialog"]') as HTMLElement;
    expect(text(dlg.querySelector('h3'))).toBe('Collect fee · Aarav Hegde');
    // The instalments with their receipts; nothing to pick, and no way to collect.
    expect([...dlg.querySelectorAll('#fcl-inst thead th')].map((th) => text(th))).toEqual([
      'Instalment',
      'Due',
      'Amount',
      'Late fine',
      'Paid',
      'Outstanding',
      'Status',
      'Receipts',
    ]);
    expect(dlg.querySelector('#fcl-inst input[type="radio"]')).toBeNull();
    expect(
      [...dlg.querySelectorAll('#fcl-inst .fcl-rcpt')].map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Receipt of Term 1', 'Receipt of Term 2']);
    expect(dlg.querySelector('#fcl-pay, .choice')).toBeNull();
    expect(text(dlg.querySelector('#fcl-none'))).toBe(
      'Nothing to collect. Every instalment of 2026-27 is paid — a paid instalment opens its receipt.',
    );
    // A paid instalment's receipt opens from its row.
    instRows(dlg)[1]!.click();
    await settle(1);
    expect(await request((u) => u === `${RC}/c-9`)).toBeTruthy();
  });

  it('opens Collect fee with Enter on a row, for a student with no fees', async () => {
    const rows = await threeStudents();
    enter(rows[2]!);
    await settle(1);
    (await request((u) => u === `${FC}/students/m-4/collect?yearId=y-1`)).flush({
      ...collectData(),
      student: { id: 'm-4', name: 'Diya Rao', admissionNo: 'TVPS/9', classSection: 'Grade 6 B' },
      instalments: [],
    });
    await settle();
    const dlg = document.querySelector('.modal[role="dialog"]') as HTMLElement;
    expect(text(dlg.querySelector('#fcl-inst tbody'))).toContain('No instalments in 2026-27');
    expect(text(dlg.querySelector('#fcl-none'))).toBe(
      'Nothing to collect. Diya Rao has no fees in 2026-27.',
    );
  });

  it('opens Collect fee once from its button, and a head opens only its instalments', async () => {
    const rows = await threeStudents();
    (rows[0]!.querySelector('.fc-collect') as HTMLButtonElement).click();
    await settle(1);
    // The button's click doesn't reach the row: one dialog, one request.
    expect(pending('/collect')).toHaveLength(1);
    await settle();
    expect(dialogs()).toHaveLength(1);
    // A second click on the row while it is open opens nothing more.
    rows[1]!.click();
    await settle(1);
    expect(pending('/collect')).toHaveLength(0);
    expect(dialogs()).toHaveLength(1);
    (dialogs()[0]!.querySelector('.sh-f .btn-sec') as HTMLButtonElement).click();
    await settle(1);
    expect(dialogs()).toHaveLength(0);

    // A head's amount opens its instalments, not Collect fee.
    (rows[0]!.querySelector('.fc-head') as HTMLButtonElement).click();
    await settle(1);
    (await request((u) => u === `${FC}/students/m-1?yearId=y-1`)).flush(ashaDetail);
    await settle();
    expect(text(document.querySelector('.modal[role="dialog"] h3'))).toBe('Tuition · Asha Rao');
    expect(dialogs()).toHaveLength(1);
    expect(pending('/collect')).toHaveLength(0);
  });

  it('offers Collect fee only to a role that collects fees', async () => {
    const el = await loaded();
    expect(el.querySelector('.fc-collect')).toBeNull();
    // Nor do the rows open it.
    const row = el.querySelector('#fc-table tbody tr') as HTMLElement;
    expect(row.hasAttribute('data-act')).toBe(false);
    expect(row.hasAttribute('tabindex')).toBe(false);
    row.click();
    await settle(1);
    expect(document.querySelector('.modal')).toBeNull();
    expect(pending('/collect')).toHaveLength(0);
  });

  it('is closed to a role without fees', async () => {
    const el = await open(session({ subTasks: ['home.view', 'task.home', 'task.fees'] }));
    await settle();
    expect(text(el)).toContain("This page isn't part of your role");
    expect(pending('fee-')).toHaveLength(0);
  });
});
