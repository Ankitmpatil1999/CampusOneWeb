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
import {
  headParts,
  inrK,
  paiseToInput,
  rupeesToPaise,
  shareBp,
  structureTotals,
} from './fee-format';
import type { FeeStructure, StructureVersion } from './fees.api';

const tick = () => new Promise((r) => setTimeout(r, 0));
const money = (amount: string) => ({ amount, currency: 'INR' as const });
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const toasts = () => text(document.querySelector('.toasts'));

async function request(match: (url: string) => boolean, method = 'GET') {
  const ctl = TestBed.inject(HttpTestingController);
  for (let i = 0; i < 60; i++) {
    const found = ctl.match((r) => match(r.urlWithParams) && r.method === method);
    if (found[0]) return found[0];
    await tick();
  }
  throw new Error(`no ${method} request`);
}

/** Answers every open GET whose path has a route (the page's parallel lookups). */
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
  subTasks: ['home.view', 'task.home', 'task.fees', 'fees.view', 'fees.edit', 'fees.collect'],
  preferredLang: 'en',
  ...over,
});

const version = (over: Partial<StructureVersion> = {}): StructureVersion => ({
  id: 'v-1',
  no: 1,
  state: 'ACTIVE',
  classes: [
    { id: 'c-6', name: 'Grade 6' },
    { id: 'c-7', name: 'Grade 7' },
  ],
  heads: [
    { headId: 'h-t', name: 'Tuition', optional: false, amount: money('18000.00') },
    { headId: 'h-a', name: 'Annual', optional: false, amount: money('4500.00') },
    { headId: 'h-tr', name: 'Transport', optional: true, amount: money('6000.00') },
  ],
  instalments: [
    { seq: 1, label: 'Term 1', dueDate: '2026-07-15', share: '40', amount: money('9000.00') },
    { seq: 2, label: 'Term 2', dueDate: '2026-10-15', share: '30', amount: money('6750.00') },
    { seq: 3, label: 'Term 3', dueDate: '2027-01-15', share: '30', amount: money('6750.00') },
  ],
  total: money('22500.00'),
  optional: money('6000.00'),
  lateFine: money('250.00'),
  returnedRemarks: null,
  approval: { id: 'apr-1', no: 'APR-0002' },
  createdAt: '2026-06-01T05:00:00.000Z',
  submittedAt: '2026-06-01T05:00:00.000Z',
  activatedAt: '2026-06-01T05:00:00.000Z',
  version: 3,
  ...over,
});

const structure = (over: Partial<FeeStructure> = {}): FeeStructure => ({
  id: 's-1',
  name: 'Middle school 2026-27',
  year: { id: 'y-1', label: '2026-27' },
  status: 'ACTIVE',
  current: version(),
  active: null,
  versions: [
    { no: 1, state: 'ACTIVE', total: money('22500.00'), activatedAt: '2026-06-01T05:00:00.000Z' },
  ],
  assigned: { students: 9, records: 27 },
  ...over,
});

const primary = () =>
  structure({
    id: 's-2',
    name: 'Primary 2026-27',
    status: 'DRAFT',
    current: version({
      id: 'v-2',
      state: 'DRAFT',
      classes: [{ id: 'c-1', name: 'Grade 1' }],
      heads: [{ headId: 'h-t', name: 'Tuition', optional: false, amount: money('14000.00') }],
      optional: money('0.00'),
      total: money('14000.00'),
      returnedRemarks: 'The Activity fee is ₹1,500 as agreed at the PTA meeting.',
      approval: null,
      submittedAt: null,
      activatedAt: null,
      version: 2,
    }),
    versions: [{ no: 1, state: 'DRAFT', total: money('14000.00'), activatedAt: null }],
    assigned: { students: 0, records: 0 },
  });

const pending = () =>
  structure({
    id: 's-3',
    name: 'Secondary 2026-27',
    status: 'PENDING',
    current: version({
      id: 'v-3',
      state: 'PENDING',
      classes: [{ id: 'c-9', name: 'Grade 9' }],
      approval: { id: 'apr-9', no: 'APR-0009' },
      activatedAt: null,
    }),
    assigned: { students: 0, records: 0 },
  });

const heads = {
  items: [
    { id: 'h-t', name: 'Tuition', status: 'ACTIVE', structures: 2 },
    { id: 'h-a', name: 'Annual', status: 'ACTIVE', structures: 1 },
    { id: 'h-tr', name: 'Transport', status: 'ACTIVE', structures: 1 },
  ],
};
const entry = {
  items: [
    {
      year: { id: 'y-1', label: '2026-27', status: 'OPEN', current: true },
      fees: {
        applicationFee: money('500.00'),
        applicationMandatory: true,
        admissionFee: money('10000.00'),
        updatedAt: null,
        version: 4,
      },
    },
  ],
};
const classes = {
  year: null,
  items: ['Nursery', 'Grade 1', 'Grade 6', 'Grade 7', 'Grade 9', 'Grade 11'].map((name, i) => ({
    id: {
      Nursery: 'c-n',
      'Grade 1': 'c-1',
      'Grade 6': 'c-6',
      'Grade 7': 'c-7',
      'Grade 9': 'c-9',
      'Grade 11': 'c-11',
    }[name],
    name,
    order: i,
    sections: [],
  })),
};
const list = () => ({
  items: [structure(), primary(), pending()],
  kpis: { structures: 3, approved: 1, pending: 1, classesCovered: 3, classes: 6 },
  maxInstalments: 6,
});

describe('fee structure pricing (the API formula)', () => {
  it('splits each head into whole rupees by share, the remainder on the last', () => {
    expect(headParts(1_800_000, [4000, 3000, 3000])).toEqual([720_000, 540_000, 540_000]);
    expect(headParts(1_000_000, [3333, 3333, 3334])).toEqual([333_300, 333_300, 333_400]);
    expect(headParts(100_050, [5000, 5000])).toEqual([50_000, 50_050]);
    const t = structureTotals(
      [
        { amount: 1_800_000, optional: false },
        { amount: 450_000, optional: false },
        { amount: 600_000, optional: true },
      ],
      [4000, 3000, 3000],
    );
    expect(t).toEqual({
      total: 2_250_000,
      optional: 600_000,
      instalments: [900_000, 675_000, 675_000],
      withOptional: [1_140_000, 855_000, 855_000],
    });
  });

  it('reads amounts and shares exactly, and prints compact rupees', () => {
    expect(rupeesToPaise('1,500.5')).toBe(150_050);
    expect(rupeesToPaise('12.345')).toBeNull();
    expect(paiseToInput(150_000)).toBe('1500');
    expect(shareBp('33.33')).toBe(3333);
    expect(shareBp('0')).toBeNull();
    expect(inrK(11_472_000_00)).toBe('₹1.15 Cr');
    expect(inrK(6_515_000_00)).toBe('₹65.15 L');
    expect(inrK(7_930_000)).toBe('₹79.3k');
  });
});

describe('console fee structures (FEE-001…009)', () => {
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
    const nav = harness.navigateByUrl('/console/fees');
    (await request((u) => u === '/api/v1/console/session')).flush(s);
    await nav;
    (await request((u) => u === '/api/v1/console/entry-fees')).flush(entry);
    serve({
      '/api/v1/console/fee-heads': heads,
      '/api/v1/console/classes': classes,
    });
    await settle(2);
    serve({ '/api/v1/console/academic-years': { items: [] } });
    (await request((u) => u === '/api/v1/console/fee-structures?yearId=y-1')).flush(list());
    await settle(5);
    return harness.routeNativeElement as HTMLElement;
  }

  const confirm = async () => {
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    await settle(2);
  };
  const type = (root: ParentNode, sel: string, v: string) => {
    const i = root.querySelector(sel) as HTMLInputElement;
    i.value = v;
    i.dispatchEvent(new Event('input'));
  };

  it('lists the structures with the year’s figures and filters them by status', async () => {
    const el = await open();
    expect(text(el.querySelector('h1'))).toBe('Fee structures');
    const kpis = [...el.querySelectorAll('.kpi')];
    expect(kpis.map((k) => text(k.querySelector('.k-v')))).toEqual(['3', '1', '3 of 6', '3']);
    expect(text(kpis[2]!.querySelector('.k-d'))).toBe('Not covered: Nursery, 1, 11');
    const rows = el.querySelectorAll('#fs-table tbody tr');
    expect(rows).toHaveLength(3);
    expect(text(rows[0])).toContain('Middle school 2026-27');
    expect(text(rows[0])).toContain('6, 7');
    expect(text(rows[0])).toContain('₹22,500.00');
    expect(text(rows[0])).toContain('+ ₹6,000.00 optional');
    expect(text(rows[0])).toContain('40% · 30% · 30%');
    expect(text(rows[0])).toContain('Approved');
    expect(text(rows[2])).toContain('Pending approval');
    [...el.querySelectorAll<HTMLButtonElement>('.pill')].find((b) => text(b) === 'Draft')!.click();
    await settle();
    expect(el.querySelectorAll('#fs-table tbody tr')).toHaveLength(1);
    expect(text(el.querySelector('#ef-card'))).toContain('With the form, or later at the desk');
    expect(text(el.querySelector('#fh-card'))).toContain('Tuition2');
  });

  it('shows the "Returned by" remarks and submits a draft for approval (FEE-006)', async () => {
    const el = await open();
    (el.querySelectorAll('#fs-table tbody tr')[1] as HTMLElement).click();
    await settle();
    const drawer = document.querySelector('.drawer') as HTMLElement;
    expect(text(drawer.querySelector('#fs-returned'))).toContain(
      'Returned by the checker: “The Activity fee is ₹1,500 as agreed at the PTA meeting.”',
    );
    expect(drawer.querySelector('.cp-why')?.getAttribute('title')).toBe(
      'Approve the structure before assigning it.',
    );
    (drawer.querySelector('#fs-send') as HTMLButtonElement).click();
    await confirm();
    const post = await request(
      (u) => u === '/api/v1/console/fee-structures/s-2/submissions',
      'POST',
    );
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    post.flush({
      approvalId: 'apr-5',
      no: 'APR-0005',
      appliedDirectly: false,
      structure: {
        ...primary(),
        status: 'PENDING',
        current: { ...primary().current, state: 'PENDING' },
      },
    });
    await settle();
    expect(toasts()).toContain('Sent for approval');
    expect(toasts()).toContain('APR-0005 · a checker will review Primary 2026-27');
    (await request((u) => u === '/api/v1/console/fee-structures?yearId=y-1')).flush(list());
  });

  it('checks the editor, recomputes the totals live and saves a draft (FEE-004)', async () => {
    const el = await open();
    (el.querySelector('#fs-new') as HTMLButtonElement).click();
    await settle();
    const m = document.querySelector('.modal.cm-xl') as HTMLElement;
    (m.querySelector('#fs-submit') as HTMLButtonElement).click();
    await settle();
    const errs = text(m.querySelector('#fs-err'));
    expect(errs).toContain('things to fix before this can be saved');
    expect(errs).toContain('Enter a name for the structure.');
    expect(errs).toContain('Choose at least one class.');
    expect(errs).toContain('Enter an amount above ₹0 for Tuition (up to 2 decimals).');
    expect(errs).toContain('Choose the due date for Instalment 1.');
    // Grade 6 belongs to the approved Middle school structure: it can't be chosen.
    const chips = [...m.querySelectorAll<HTMLLabelElement>('.cm-clschip')];
    const g6 = chips.find((c) => text(c).startsWith('Grade 6'))!;
    expect(g6.classList.contains('taken')).toBe(true);
    expect(g6.getAttribute('title')).toBe('Already in Middle school 2026-27');

    type(m, '#fs-name', 'Senior 2026-27');
    chips
      .find((c) => text(c) === 'Grade 11')!
      .querySelector('input')!
      .click();
    const amounts = [...m.querySelectorAll<HTMLInputElement>('#fs-heads .cm-amt-in input')];
    amounts[0]!.value = '20000';
    amounts[0]!.dispatchEvent(new Event('input'));
    amounts[1]!.value = '5000.50';
    amounts[1]!.dispatchEvent(new Event('input'));
    const dates = [...m.querySelectorAll<HTMLInputElement>('#fs-inst input[type="date"]')];
    dates[0]!.value = '2026-11-15';
    dates[0]!.dispatchEvent(new Event('input'));
    dates[1]!.value = '2027-01-15';
    dates[1]!.dispatchEvent(new Event('input'));
    await settle();
    expect(text(m.querySelector('#fs-htot'))).toBe('₹25,000.50');
    expect(text(m.querySelector('#fs-sum'))).toContain('₹12,500.00');
    expect(text(m.querySelector('#fs-sum'))).toContain('₹12,500.50');
    expect(text(m.querySelector('#fs-pct'))).toBe('100% of 100%');

    (m.querySelector('#fs-draft') as HTMLButtonElement).click();
    await confirm();
    const post = await request((u) => u === '/api/v1/console/fee-structures', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({
      yearId: 'y-1',
      name: 'Senior 2026-27',
      classIds: ['c-11'],
      heads: [
        { headId: 'h-t', amount: money('20000.00'), optional: false },
        { headId: 'h-a', amount: money('5000.50'), optional: false },
      ],
      instalments: [
        { label: 'Instalment 1', dueDate: '2026-11-15', share: '50' },
        { label: 'Instalment 2', dueDate: '2027-01-15', share: '50' },
      ],
      lateFine: money('0.00'),
      total: money('25000.50'),
    });
    post.flush(structure({ id: 's-9', name: 'Senior 2026-27', status: 'DRAFT' }));
    await settle();
    expect(toasts()).toContain('Draft saved');
    serve({ '/api/v1/console/fee-heads': heads });
    (await request((u) => u === '/api/v1/console/fee-structures?yearId=y-1')).flush(list());
  });

  it('edits an approved structure into a new version and sends it for approval (FEE-005)', async () => {
    const el = await open();
    (el.querySelectorAll('#fs-table tbody tr')[0] as HTMLElement).click();
    await settle();
    const drawer = document.querySelector('.drawer') as HTMLElement;
    expect(text(drawer.querySelector('#fs-edit'))).toBe('Edit (needs re-approval)');
    (drawer.querySelector('#fs-edit') as HTMLButtonElement).click();
    await settle();
    const m = document.querySelector('.modal.cm-xl') as HTMLElement;
    expect(text(m)).toContain('This structure is approved. Saving sends it for approval again');
    expect(m.querySelector('#fs-draft')).toBeNull();
    expect((m.querySelector('#fs-year') as HTMLSelectElement).disabled).toBe(true);
    expect((m.querySelector('#fs-name') as HTMLInputElement).value).toBe('Middle school 2026-27');
    const amounts = [...m.querySelectorAll<HTMLInputElement>('#fs-heads .cm-amt-in input')];
    expect(amounts.map((a) => a.value)).toEqual(['18000', '4500']);
    amounts[0]!.value = '19000';
    amounts[0]!.dispatchEvent(new Event('input'));
    await settle();
    expect(text(m.querySelector('#fs-htot'))).toBe('₹23,500.00');
    (m.querySelector('#fs-submit') as HTMLButtonElement).click();
    await confirm();
    const patch = await request((u) => u === '/api/v1/console/fee-structures/s-1', 'PATCH');
    expect(patch.request.headers.get('If-Match')).toBe('"v3"');
    expect(patch.request.body).toMatchObject({
      yearId: 'y-1',
      classIds: ['c-6', 'c-7'],
      heads: [
        { headId: 'h-t', amount: money('19000.00'), optional: false },
        { headId: 'h-a', amount: money('4500.00'), optional: false },
        { headId: 'h-tr', amount: money('6000.00'), optional: true },
      ],
      lateFine: money('250.00'),
      total: money('23500.00'),
    });
    const v2 = structure({
      status: 'DRAFT',
      current: version({ id: 'v-2', no: 2, state: 'DRAFT', version: 1 }),
      active: version(),
    });
    patch.flush(v2);
    const sub = await request(
      (u) => u === '/api/v1/console/fee-structures/s-1/submissions',
      'POST',
    );
    sub.flush({ approvalId: 'apr-8', no: 'APR-0008', appliedDirectly: false, structure: v2 });
    await settle();
    expect(toasts()).toContain('Sent for approval');
    const reopened = document.querySelector('.drawer') as HTMLElement;
    expect(text(reopened)).toContain('Version 1 stays in use until version 2 is approved.');
  });

  it('previews an assignment, then raises the records (FEE-007)', async () => {
    const el = await open();
    (el.querySelectorAll('#fs-table tbody tr')[0] as HTMLElement).click();
    await settle();
    (document.querySelector('#fs-assign') as HTMLButtonElement).click();
    const preview = await request(
      (u) => u === '/api/v1/console/fee-structures/s-1/assignments',
      'POST',
    );
    expect(preview.request.body).toEqual({ preview: true });
    const plan = {
      preview: true,
      version: 1,
      instalments: [
        { seq: 1, label: 'Term 1', dueDate: '2026-07-15', raised: false },
        { seq: 2, label: 'Term 2', dueDate: '2026-10-15', raised: true },
      ],
      perClass: [
        {
          class: { id: 'c-6', name: 'Grade 6' },
          students: 3,
          already: 1,
          toAssign: 2,
          records: 2,
          amount: money('13500.00'),
        },
      ],
      totals: { students: 2, records: 2, amount: money('13500.00') },
    };
    preview.flush(plan);
    await settle();
    const m = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    expect(text(m)).toContain('Term 1 (due 15 Jul 2026) is past its due date');
    expect(text(m.querySelector('#fa-table'))).toContain('1 skipped');
    (m.querySelector('#fa-create') as HTMLButtonElement).click();
    await confirm();
    const commit = await request(
      (u) => u === '/api/v1/console/fee-structures/s-1/assignments',
      'POST',
    );
    expect(commit.request.body).toEqual({ preview: false });
    commit.flush({ ...plan, preview: false, recordsCreated: 2, studentsAssigned: 2 });
    await settle();
    expect(toasts()).toContain('2 fee records created');
    (await request((u) => u === '/api/v1/console/fee-structures?yearId=y-1')).flush(list());
  });

  it('saves the entry fees with If-Match and adds a fee head (FEE-009, FEE-002)', async () => {
    const el = await open();
    (el.querySelector('#ef-card .cm-entry button') as HTMLButtonElement).click();
    await settle();
    const m = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    type(m, '#ef-app', '750');
    // The application fee is always mandatory (client 2026-10-09): there is no switch.
    expect(m.querySelector('#ef-mand')).toBeNull();
    (m.querySelector('#ef-save') as HTMLButtonElement).click();
    await confirm();
    const put = await request((u) => u === '/api/v1/console/entry-fees/y-1', 'PUT');
    expect(put.request.headers.get('If-Match')).toBe('"v4"');
    expect(put.request.body).toEqual({
      applicationFee: money('750.00'),
      applicationMandatory: false,
      admissionFee: money('10000.00'),
    });
    put.flush({
      ...entry.items[0],
      fees: {
        ...entry.items[0]!.fees,
        applicationFee: money('750.00'),
        applicationMandatory: false,
        version: 5,
      },
    });
    await settle();
    expect(toasts()).toContain('Entry fees saved');
    expect(text(el.querySelector('#ef-card'))).toContain('₹750.00');

    type(el, '#fh-new', 'tuition');
    (el.querySelector('#fh-add') as HTMLButtonElement).click();
    await settle();
    expect(text(el.querySelector('#fh-card'))).toContain('tuition already exists.');
    type(el, '#fh-new', 'Uniform');
    (el.querySelector('#fh-add') as HTMLButtonElement).click();
    const add = await request((u) => u === '/api/v1/console/fee-heads', 'POST');
    expect(add.request.body).toEqual({ name: 'Uniform' });
    add.flush({ id: 'h-u', name: 'Uniform', status: 'ACTIVE', structures: 0 });
    await settle();
    expect(text(el.querySelector('#fh-card'))).toContain('Uniform0');
  });

  it('is read-only for management', async () => {
    const el = await open(
      session({ roles: [{ code: 'MANAGEMENT', name: 'Management', readOnly: true }] }),
    );
    expect(text(el)).toContain('Read-only.');
    expect(el.querySelector('#fs-new')).toBeNull();
    expect(el.querySelector('#fh-new')).toBeNull();
  });
});
