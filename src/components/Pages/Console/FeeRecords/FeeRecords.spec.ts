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
import { istBusinessDate } from '../../../Utils/format';
import type { FeeRecord, FeeRecordDetail, FeeUploadReport } from './fee-records.api';
import { addDays, classOf, splitText, waitingWhy } from './record-format';

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

/** Answers every open GET whose path has a route (the page's parallel loads). */
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
  subTasks: [
    'home.view',
    'task.home',
    'task.fees',
    'fees.view',
    'fees.edit',
    'fees.collect',
    'members.view',
  ],
  preferredLang: 'en',
  ...over,
});

const record = (over: Partial<FeeRecord> = {}): FeeRecord => ({
  id: '01a1043f-eb49-7273-af15-bbae99076912',
  student: {
    id: 'm-5',
    name: 'Kavya Pai',
    admissionNo: 'TVPS/2017/0596',
    classSection: 'Grade 7 B',
  },
  year: { id: 'y-1', label: '2026-27' },
  source: 'STRUCTURE',
  structure: { name: 'Middle school 2026-27', version: 1 },
  instalment: { seq: 1, label: 'Term 1' },
  dueDate: '2026-07-15',
  amount: money('9000.00'),
  lateFine: money('250.00'),
  fine: money('250.00'),
  paid: money('0.00'),
  outstanding: money('9250.00'),
  status: 'OVERDUE',
  financed: false,
  remarks: null,
  pendingAttempt: {
    id: 'a-1',
    tries: 1,
    lastFailureCode: 'PAY.INSUFFICIENT_BALANCE',
    lastTriedAt: '2026-10-04T00:11:00.000Z',
  },
  paidAt: null,
  createdAt: '2026-06-01T05:00:00.000Z',
  version: 2,
  ...over,
});
const paidOne = () =>
  record({
    id: '01a1043f-eb49-7273-af15-000000000001',
    student: {
      id: 'm-4',
      name: 'Meera Shenoy',
      admissionNo: 'TVPS/2017/0603',
      classSection: 'Grade 7 A',
    },
    status: 'PAID',
    fine: money('0.00'),
    paid: money('9000.00'),
    outstanding: money('0.00'),
    pendingAttempt: null,
    paidAt: '2026-07-10T05:30:00.000Z',
  });
const dueOne = () =>
  record({
    id: '01a1043f-eb49-7273-af15-000000000002',
    student: {
      id: 'm-9',
      name: 'Siddharth Acharya',
      admissionNo: 'TVPS/2017/0617',
      classSection: 'Grade 8 B',
    },
    source: 'MANUAL',
    structure: null,
    instalment: { seq: 4, label: 'Science fair kit' },
    dueDate: addDays(today, 16),
    amount: money('1200.00'),
    lateFine: money('0.00'),
    fine: money('0.00'),
    outstanding: money('1200.00'),
    status: 'DUE',
    pendingAttempt: null,
    version: 1,
  });
const financedOne = () =>
  record({
    id: '01a1043f-eb49-7273-af15-000000000003',
    student: {
      id: 'm-6',
      name: 'Pranav Acharya',
      admissionNo: 'TVPS/2017/0610',
      classSection: 'Grade 8 A',
    },
    instalment: { seq: 2, label: 'Term 2' },
    dueDate: '2026-10-15',
    amount: money('6750.00'),
    fine: money('0.00'),
    outstanding: money('6750.00'),
    status: 'DUE',
    financed: true,
    pendingAttempt: null,
  });
const detail = (r: FeeRecord, over: Partial<FeeRecordDetail> = {}): FeeRecordDetail => ({
  ...r,
  heads: [{ name: 'Tuition', amount: r.amount }],
  collections: [],
  attempts: [],
  ...over,
});

const report = (billed: string, collected: string, outstanding: string, overdue: number) => ({
  rows: [
    {
      classSection: 'Grade 7 A',
      students: 2,
      records: 6,
      billed: money(billed),
      collected: money(collected),
      outstanding: money(outstanding),
      overdue,
    },
  ],
  totals: {
    students: 2,
    records: 6,
    billed: money(billed),
    collected: money(collected),
    outstanding: money(outstanding),
    overdue,
  },
});
const entry = {
  items: [{ year: { id: 'y-1', label: '2026-27', status: 'OPEN', current: true }, fees: null }],
};
const classes = {
  year: null,
  items: [
    {
      id: 'c-7',
      name: 'Grade 7',
      order: 9,
      sections: [
        { id: 's-7a', name: 'A', capacity: null, students: 2 },
        { id: 's-7b', name: 'B', capacity: null, students: 1 },
      ],
    },
    {
      id: 'c-8',
      name: 'Grade 8',
      order: 10,
      sections: [{ id: 's-8a', name: 'A', capacity: null, students: 2 }],
    },
  ],
};
const attempts = {
  items: [
    {
      id: 'a-1',
      status: 'PENDING',
      tries: 1,
      lastFailureCode: 'PAY.INSUFFICIENT_BALANCE',
      lastTriedAt: '2026-10-04T00:11:00.000Z',
      createdAt: '2026-10-04T00:11:00.000Z',
      record: { id: record().id, label: 'Term 1' },
      student: { name: 'Kavya Pai' },
      outstanding: money('9250.00'),
    },
  ],
};
const financing = {
  partner: { name: 'Example Finance (example)', mode: 'test' },
  items: [
    {
      id: 'g-1',
      partnerRef: 'RPFN1',
      partnerName: 'Example Finance (example)',
      status: 'SUCCESS',
      requestedBy: 'STAFF',
      failureReason: null,
      student: { id: 'm-6', name: 'Pranav Acharya', admissionNo: 'TVPS/2017/0610' },
      records: [
        {
          id: 'r-2',
          label: 'Term 2',
          dueDate: '2026-10-15',
          amount: money('6750.00'),
          outstanding: money('6750.00'),
          status: 'DUE',
          financed: true,
        },
      ],
      total: money('6750.00'),
      createdAt: '2026-08-20T06:00:00.000Z',
      decidedAt: '2026-08-22T07:00:00.000Z',
      version: 2,
    },
  ],
};

describe('fee record helpers', () => {
  it('groups by class, splits instalments and words a waiting collection', () => {
    expect(classOf('Grade 11 Science', ['Grade 1', 'Grade 11'])).toBe('Grade 11');
    expect(classOf('Grade 7 B', [])).toBe('Grade 7');
    expect(splitText(['₹16,000.00', '₹16,000.00', '₹16,000.00'])).toBe('3 × ₹16,000.00');
    expect(splitText(['₹18,533.00', '₹18,533.00', '₹18,534.00'])).toBe(
      '2 × ₹18,533.00 + ₹18,534.00',
    );
    expect(waitingWhy('PAY.INSUFFICIENT_BALANCE')).toBe('Balance short');
    expect(waitingWhy(null)).toBe('Waiting for balance');
  });
});

describe('console fee records (FEE-010…018, FEE-024/025, FEE-039…041, GOV-006/007)', () => {
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

  const lists = () => ({
    '/api/v1/console/fee-collection-attempts': attempts,
    '/api/v1/console/job-runs': { items: [], nextCursor: null },
    '/api/v1/console/financing-applications': financing,
    '/api/v1/console/fee-records/uploads': { items: [] },
    '/api/v1/console/classes': classes,
    '/api/v1/console/fee-heads': {
      items: [
        { id: 'h-t', name: 'Tuition', status: 'ACTIVE', structures: 1 },
        { id: 'h-l', name: 'Laboratory', status: 'ACTIVE', structures: 0 },
      ],
    },
  });

  async function figures() {
    const y = 'yearId=y-1';
    (await request((u) => u === `/api/v1/console/fee-collections/report?${y}`)).flush(
      report('228200.00', '79350.00', '148850.00', 2),
    );
    (await request((u) => u.startsWith(`/api/v1/console/fee-collections/report?${y}&to=`))).flush(
      report('39000.00', '20500.00', '18500.00', 2),
    );
    (await request((u) => u.startsWith(`/api/v1/console/fee-collections/report?${y}&from=`))).flush(
      report('189200.00', '58850.00', '130350.00', 0),
    );
  }

  async function open(s: object = session()) {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/feerecords');
    (await request((u) => u === '/api/v1/console/session')).flush(s);
    await nav;
    serve(lists());
    (await request((u) => u === '/api/v1/console/entry-fees')).flush(entry);
    (await request((u) => u === '/api/v1/console/fee-records?yearId=y-1')).flush({
      items: [dueOne(), record(), paidOne(), financedOne()],
      nextCursor: null,
    });
    await figures();
    serve(lists());
    await settle(5);
    return harness.routeNativeElement as HTMLElement;
  }

  const confirm = async (reason?: string) => {
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    if (reason) {
      const t = dlg.querySelector('textarea') as HTMLTextAreaElement;
      t.value = reason;
      t.dispatchEvent(new Event('input'));
      await settle(1);
    }
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    await settle(2);
  };
  const type = (root: ParentNode, sel: string, v: string) => {
    const i = root.querySelector(sel) as HTMLInputElement;
    i.value = v;
    i.dispatchEvent(new Event('input'));
  };
  const reloads = async () => {
    (await request((u) => u === '/api/v1/console/fee-records?yearId=y-1')).flush({
      items: [dueOne(), record(), paidOne(), financedOne()],
      nextCursor: null,
    });
    await figures();
    serve(lists());
  };

  it('shows the year’s figures and the records, filtered on the server and on the page', async () => {
    const el = await open();
    expect(text(el.querySelector('h1'))).toBe('Fee records');
    const kpis = [...el.querySelectorAll('.kpi')].map((k) => text(k));
    expect(kpis[0]).toContain('₹2.28 L');
    expect(kpis[0]).toContain('6 records · 2026-27');
    expect(kpis[1]).toContain('₹79.3k');
    expect(kpis[1]).toContain('34.8% of billed');
    expect(kpis[2]).toContain('₹1.30 L');
    expect(kpis[2]).toContain('2 due · 1 waiting for balance');
    expect(kpis[3]).toContain('₹18.5k');
    expect(kpis[3]).toContain('2 records past due');
    const rows = el.querySelectorAll('#fr-table tbody tr');
    expect(rows).toHaveLength(4);
    expect(text(rows[1])).toContain('Kavya Pai');
    expect(text(rows[1])).toContain('TVPS/2017/0596 · Grade 7 B');
    expect(text(rows[1])).toContain('99076912');
    expect(text(rows[1])).toContain('Overdue');
    expect(text(rows[1])).toContain('Waiting for balance');
    expect(text(rows[3])).toContain('Financed');

    [...el.querySelectorAll<HTMLButtonElement>('.pill')]
      .find((b) => text(b) === 'Waiting for balance')!
      .click();
    await settle();
    expect(el.querySelectorAll('#fr-table tbody tr')).toHaveLength(1);
    // A server-side status filter.
    [...el.querySelectorAll<HTMLButtonElement>('.pill')].find((b) => text(b) === 'Paid')!.click();
    const paid = await request((u) => u === '/api/v1/console/fee-records?yearId=y-1&status=PAID');
    paid.flush({ items: [paidOne()], nextCursor: null });
    await settle();
    expect(el.querySelectorAll('#fr-table tbody tr')).toHaveLength(1);
    expect(text(el.querySelector('#fr-table'))).toContain('Meera Shenoy');
  });

  it('collects now: a short balance waits (202), a refusal is shown (FEE-016)', async () => {
    const el = await open();
    (el.querySelectorAll('#fr-table tbody tr')[0] as HTMLElement).click();
    await settle();
    const due = dueOne();
    (await request((u) => u === `/api/v1/console/fee-records/${due.id}`)).flush(detail(due));
    (await request((u) => u === '/api/v1/console/members/m-9')).flush({
      wallet: { status: 'ACTIVE', balance: money('600.00') },
    });
    await settle();
    const drawer = document.querySelector('.drawer') as HTMLElement;
    expect(text(drawer.querySelector('#fr-balance'))).toBe('₹600.00');
    expect(text(drawer)).toContain('Created individually');
    (drawer.querySelector('#fr-collect') as HTMLButtonElement).click();
    await settle(2);
    expect(text(document.querySelector('.modal[role="alertdialog"]'))).toContain(
      "We'll try to collect ₹1,200.00 from Siddharth Acharya's campus wallet",
    );
    await confirm();
    const post = await request(
      (u) => u === `/api/v1/console/fee-records/${due.id}/collections`,
      'POST',
    );
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    post.flush(
      {
        collected: false,
        pendingAttempt: { id: 'a-2', tries: 1, reasonCode: 'PAY.INSUFFICIENT_BALANCE' },
        record: detail({
          ...due,
          pendingAttempt: {
            id: 'a-2',
            tries: 1,
            lastFailureCode: 'PAY.INSUFFICIENT_BALANCE',
            lastTriedAt: null,
          },
        }),
      },
      { status: 202, statusText: 'Accepted' },
    );
    await settle();
    expect(text(drawer.querySelector('#fr-last'))).toContain('Pending — balance short.');
    expect(toasts()).toContain('Pending — balance short');
    await reloads();
    (await request((u) => u === '/api/v1/console/members/m-9')).flush({
      wallet: { status: 'ACTIVE', balance: money('600.00') },
    });

    (drawer.querySelector('#fr-collect') as HTMLButtonElement).click();
    await confirm();
    (await request((u) => u === `/api/v1/console/fee-records/${due.id}/collections`, 'POST')).flush(
      { type: 'about:blank', status: 409, code: 'FEE.CONSENT_REQUIRED', correlationId: 'c-1' },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();
    expect(text(drawer.querySelector('#fr-last'))).toContain(
      'Not collected. The family hasn’t agreed to wallet collection yet',
    );
  });

  it('asks for a change with only what changed (FEE-013)', async () => {
    const el = await open();
    (el.querySelectorAll('#fr-table tbody tr')[0] as HTMLElement).click();
    await settle();
    const due = dueOne();
    (await request((u) => u === `/api/v1/console/fee-records/${due.id}`)).flush(detail(due));
    serve({ '/api/v1/console/members/m-9': { wallet: null } });
    await settle();
    (document.querySelector('#fr-update') as HTMLButtonElement).click();
    await settle();
    const m = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    (m.querySelector('#fu-send') as HTMLButtonElement).click();
    await settle();
    expect(text(m)).toContain('Say why the record is changing');
    expect(text(m)).toContain('Nothing has changed — change the amount or the due date.');
    const later = addDays(today, 20);
    type(m, '#fu-due', later);
    type(m, '#fu-rem', 'The science fair moved');
    (m.querySelector('#fu-send') as HTMLButtonElement).click();
    await confirm();
    const post = await request(
      (u) => u === `/api/v1/console/fee-records/${due.id}/change-requests`,
      'POST',
    );
    expect(post.request.body).toEqual({ dueDate: later, reason: 'The science fair moved' });
    post.flush(
      { approvalId: 'apr-7', no: 'APR-0007', appliedDirectly: false, record: detail(due) },
      { status: 202, statusText: 'Accepted' },
    );
    await settle();
    expect(toasts()).toContain('Update sent for approval');
    expect(toasts()).toContain('APR-0007 · a checker will review it');
  });

  it('creates a manual record for a student (FEE-012)', async () => {
    const el = await open();
    (el.querySelector('#fr-new') as HTMLButtonElement).click();
    await settle();
    const m = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    (m.querySelector('#fn-save') as HTMLButtonElement).click();
    await settle();
    expect(text(m)).toContain('Choose the student');
    expect(text(m)).toContain('Enter the fee amount');
    (m.querySelector('#fn-stu-b') as HTMLButtonElement).click();
    await settle(2);
    // Fee staff pick from the fee students list, not the member directory (FEE-043).
    (await request((u) => u.startsWith('/api/v1/console/fee-records/students'))).flush({
      items: [
        {
          id: 'm-11',
          name: 'Harini Menon',
          admissionNo: 'TVPS/2017/0673',
          grade: { class: 'Grade 11', section: 'Commerce' },
        },
      ],
    });
    await settle();
    (document.querySelector('.dd-menu .dd-opt') as HTMLButtonElement).click();
    type(m, '#fn-term', 'Lab fee');
    type(m, '#fn-amt', '1500');
    type(m, '#fn-due', addDays(today, 10));
    const head = m.querySelector('#fn-head') as HTMLSelectElement;
    head.value = 'h-l';
    head.dispatchEvent(new Event('change'));
    await settle();
    (m.querySelector('#fn-save') as HTMLButtonElement).click();
    await confirm();
    const post = await request((u) => u === '/api/v1/console/fee-records', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({
      studentId: 'm-11',
      yearId: 'y-1',
      label: 'Lab fee',
      dueDate: addDays(today, 10),
      amount: money('1500.00'),
      headId: 'h-l',
      remarks: null,
    });
  });

  it('checks a fee sheet and creates the accepted rows (FEE-014, FEE-015)', async () => {
    const el = await open();
    (el.querySelector('#fr-upload') as HTMLButtonElement).click();
    await settle();
    const m = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    (m.querySelector('#fu-validate') as HTMLButtonElement).click();
    await settle();
    expect(text(m)).toContain('Choose the filled-in template (CSV) to upload.');
    const input = m.querySelector('#fu-file') as HTMLInputElement;
    const file = new File(['Student name\n'], 'fees.csv', { type: 'text/csv' });
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    await settle();
    (m.querySelector('#fu-validate') as HTMLButtonElement).click();
    const up = await request((u) => u === '/api/v1/console/fee-records/uploads', 'POST');
    expect(up.request.body instanceof FormData).toBe(true);
    const rep: FeeUploadReport = {
      id: 'u-1',
      fileName: 'fees.csv',
      year: '2026-27',
      status: 'VALIDATED',
      total: 2,
      accepted: 1,
      rejected: 1,
      recordsPlanned: 3,
      recordsCreated: null,
      uploadedBy: 'DEEPA NAYAK',
      uploadedAt: '2026-10-04T05:00:00.000Z',
      committedAt: null,
      rows: [
        {
          row: 2,
          name: 'Harini Menon',
          admissionNo: 'TVPS/2017/0673',
          classSection: 'Grade 11 Commerce',
          total: money('48000.00'),
          instalments: [money('16000.00'), money('16000.00'), money('16000.00')],
          dueDate: '2027-03-31',
          dueDefaulted: true,
          paid: false,
          accepted: true,
          errors: [],
        },
        {
          row: 3,
          name: 'Rohan Kamath',
          admissionNo: 'TVPS/2017/9999',
          classSection: 'Grade 12 Science',
          total: money('52000.00'),
          instalments: [],
          dueDate: null,
          dueDefaulted: false,
          paid: false,
          accepted: false,
          errors: [
            { column: 'Admission number', message: 'No student with this admission number' },
          ],
        },
      ],
    };
    up.flush(rep, { status: 201, statusText: 'Created' });
    await settle();
    expect(text(m.querySelector('#fu-rows'))).toContain('3 × ₹16,000.00');
    expect(text(m.querySelector('#fu-rows'))).toContain('Due 31 Mar 2027 (default)');
    expect(text(m.querySelector('#fu-rows'))).toContain('No student with this admission number');
    expect(text(m)).toContain('Deepa Nayak');
    (m.querySelector('#fu-commit') as HTMLButtonElement).click();
    await confirm();
    const commit = await request(
      (u) => u === '/api/v1/console/fee-records/uploads/u-1/commit',
      'POST',
    );
    expect(commit.request.body).toEqual({ mode: 'ACCEPTED' });
    commit.flush({ created: 3, skipped: 1 });
    await settle();
    expect(toasts()).toContain('3 fee records created');
    expect(el.querySelector('#fr-tab-upl')?.classList.contains('on')).toBe(true);
  });

  it('runs the auto-debit now with a reason', async () => {
    const el = await open();
    (el.querySelector('#fr-tab-job') as HTMLButtonElement).click();
    await settle();
    expect(text(el.querySelector('#ad-list'))).toContain('Kavya Pai');
    expect(text(el.querySelector('#ad-list'))).toContain('Balance short');
    (el.querySelector('#ad-run') as HTMLButtonElement).click();
    await confirm('Parents topped up this morning');
    const run = await request((u) => u === '/api/v1/console/jobs/tuition-autodebit/runs', 'POST');
    expect(run.request.body).toEqual({ reason: 'Parents topped up this morning' });
    expect(run.request.headers.get('Idempotency-Key')).toBeTruthy();
    run.flush(
      {
        runId: 'r-1',
        job: { id: 'tuition-autodebit', name: 'Tuition auto-debit (retry)' },
        periodKey: today,
        runStatus: 'SUCCESS',
        status: 'SUCCESS',
        processed: 1,
        failed: 0,
        note: 'collected 1, still waiting 0',
      },
      { status: 202, statusText: 'Accepted' },
    );
    await settle();
    expect(toasts()).toContain('Auto-debit finished');
    expect(toasts()).toContain('1 payment collected');

    // FINANCING-OFF (client 2026-10-22): the financing partner tab is commented out.
    // (el.querySelector('#fr-tab-fin') as HTMLButtonElement).click();
    // await settle();
    // expect(text(el.querySelector('#fin-table'))).toContain('Pranav Acharya');
    // expect(text(el.querySelector('#fin-table'))).toContain('Success');
    // expect(text(el.querySelector('#fin-table'))).toContain('₹6,750.00');
    // (el.querySelector('#fin-new') as HTMLButtonElement).click();
    // await settle();
    // (document.querySelector('#fi-stu-b') as HTMLButtonElement).click();
    // await settle(2);
    // // Fee staff pick from the fee students list, not the member directory (FEE-043).
    // (await request((u) => u.startsWith('/api/v1/console/fee-records/students'))).flush({
    //   items: [
    //     {
    //       id: 'm-6',
    //       name: 'Pranav Acharya',
    //       admissionNo: 'TVPS/2017/0610',
    //       grade: { class: 'Grade 8', section: 'A' },
    //     },
    //     {
    //       id: 'm-7',
    //       name: 'Nikhil Kini',
    //       admissionNo: 'TVPS/2017/0624',
    //       grade: { class: 'Grade 8', section: 'A' },
    //     },
    //   ],
    // });
    // await settle();
    // const opts = [...document.querySelectorAll('.dd-menu .dd-opt')];
    // expect(opts.map((o) => text(o.querySelector('span')))).toEqual([
    //   'Nikhil Kini · TVPS/2017/0624',
    // ]);
    // (opts[0] as HTMLButtonElement).click();
    // await settle();
    // (document.querySelector('#fi-save') as HTMLButtonElement).click();
    // await confirm();
    // const reg = await request((u) => u === '/api/v1/console/financing-applications', 'POST');
    // expect(reg.request.body).toEqual({ studentProfileId: 'm-7' });
    // reg.flush(
    //   {
    //     ...financing.items[0],
    //     id: 'g-2',
    //     status: 'PENDING',
    //     student: { id: 'm-7', name: 'Nikhil Kini', admissionNo: 'TVPS/2017/0624' },
    //     sent: true,
    //     test: true,
    //   },
    //   { status: 201, statusText: 'Created' },
    // );
    // await settle();
    // expect(toasts()).toContain('Registered with the partner');
  });

  it('is read-only for management', async () => {
    const el = await open(
      session({ roles: [{ code: 'MANAGEMENT', name: 'Management', readOnly: true }] }),
    );
    expect(text(el)).toContain('Read-only.');
    expect(el.querySelector('#fr-new')).toBeNull();
    expect(el.querySelector('#fr-upload')).toBeNull();
  });
});
