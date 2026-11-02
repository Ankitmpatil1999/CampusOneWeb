import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import { istBusinessDate } from '../../../Utils/format';
import { translate } from '../../../Utils/translate';
import {
  addDays,
  hm24,
  longDay,
  paiseOf,
  payoutDue,
  permsOf,
  samePerson,
  statusLabel,
} from './settlement-format';
import type { Settlement } from './settlements.api';

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

const MAKER = ['settle.view', 'settle.stage1'];
const CHECKER = ['settle.view', 'settle.final', 'settle.reject', 'settle.payout'];
const operator = (name: string, role: string, subTasks: string[]) => ({
  name,
  email: 'op@campusone.example',
  role: {
    code: role,
    name: role === 'SETTLEMENT_MAKER' ? 'Settlement Maker' : 'Settlement Checker',
  },
  subTasks: ['home.view', 'task.home', 'task.settle', ...subTasks],
  preferredLang: 'en',
});
const money = (amount: string) => ({ amount, currency: 'INR' as const });
const TODAY = istBusinessDate();

const stl = (over: Partial<Settlement> = {}): Settlement => ({
  id: 's-1',
  settlementNo: 'STL-20261004-RPETUNSHI000011026-1',
  institution: { id: 'i-1', name: 'Tunga Valley Public School', identifier: 'RPETUNSHI000011026' },
  date: TODAY,
  windowTo: null,
  status: 'PENDING',
  lines: 13,
  merchants: 2,
  gross: money('86159.75'),
  fee: money('433.75'),
  adjustments: money('0.00'),
  net: money('85726.00'),
  recollected: 0,
  stage1: null,
  final: null,
  rejection: null,
  payout: null,
  createdAt: null,
  version: 1,
  ...over,
});
const STAGE1 = { by: 'Priya Sharma', at: '2026-10-04T05:12:00.000Z', remarks: 'Counts match' };
const FINAL = { by: 'Rahul Verma', at: '2026-10-04T05:20:00.000Z', remarks: 'Approved for payout' };
const second = stl({
  id: 's-2',
  settlementNo: 'STL-20261004-RPEBHABHR000060926-1',
  institution: { id: 'i-2', name: 'Bhadra Valley PU College', identifier: 'RPEBHABHR000060926' },
  status: 'APPROVAL_STAGE_1',
  lines: 0,
  merchants: 0,
  gross: money('0.00'),
  fee: money('0.00'),
  net: money('0.00'),
  stage1: STAGE1,
  version: 2,
});
const detail = (s: Settlement, over: object = {}) => ({
  ...s,
  payableNow: s.status === 'APPROVED' && !s.payout ? s.net : money('0.00'),
  merchantsList: [
    {
      id: 'm-1',
      uniqueId: 'MER1',
      name: 'Campus Canteen',
      lines: 4,
      gross: money('209.75'),
      fee: money('4.00'),
      adjustments: money('0.00'),
      net: money('205.75'),
      suspended: false,
      carried: false,
      paid: !!s.payout,
    },
  ],
  linesList: [],
  statements: [{ fileNo: 1, kind: 'transactions', name: 'settlement_transactions.csv' }],
  ...over,
});

describe('back office — settlement approvals (STL-001…008)', () => {
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

  const range = `/api/v1/ops/settlements?from=${addDays(TODAY, -13)}&to=${TODAY}`;
  async function flushLists(list: Settlement[]) {
    (await request(range)).flush({ items: list, nextCursor: null });
    for (const s of ['PENDING', 'APPROVAL_STAGE_1', 'APPROVED'] as const) {
      (await request(`/api/v1/ops/settlements?status=${s}`)).flush({
        items: list.filter((x) => x.status === s),
        nextCursor: null,
      });
    }
  }

  async function openPage(
    who = operator('PRIYA SHARMA', 'SETTLEMENT_MAKER', MAKER),
    list: Settlement[] = [stl(), second],
  ) {
    const harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/backoffice/settlements');
    (await request('/api/v1/ops/session')).flush(who);
    await nav;
    await flushLists(list);
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

  it('labels, money and the two-stage rules follow the server', () => {
    expect(statusLabel('PENDING')).toBe('Pending');
    expect(statusLabel('APPROVAL_STAGE_1')).toBe('Stage-1 approved');
    expect(statusLabel('APPROVED')).toBe('Approved');
    expect(statusLabel('FAILED')).toBe(translate('status.settlement.failed'));
    expect(paiseOf(money('85726.00'))).toBe(8_572_600);
    expect(paiseOf(money('-12.50'))).toBe(-1250);
    expect(payoutDue(stl({ status: 'APPROVED' }))).toBe(true);
    expect(
      payoutDue(
        stl({ status: 'APPROVED', payout: { utr: 'X', amount: money('1'), at: null, by: 'R' } }),
      ),
    ).toBe(false);
    expect(samePerson('PRIYA  SHARMA', 'Priya Sharma')).toBe(true);
    expect(hm24('2026-10-04T18:00:00.000Z')).toBe('23:30');
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
    expect(longDay('2026-09-29')).toBe('Tuesday, 29 September 2026');

    const maker = { name: 'Priya Sharma', role: 'Settlement Maker', subTasks: MAKER };
    const checker = { name: 'Rahul Verma', role: 'Settlement Checker', subTasks: CHECKER };
    expect(permsOf(stl(), maker).stage1.ok).toBe(true);
    expect(permsOf(stl(), maker).reject.why).toContain(
      'doesn’t hold “Reject a settlement (checker)”',
    );
    expect(permsOf(second, checker).final.ok).toBe(true);
    // The stage-1 maker can neither give final approval nor reject.
    const both = { ...checker, name: 'Priya Sharma' };
    expect(permsOf(second, both).final.why).toBe(
      'You gave stage-1 approval, so a different person must give final approval.',
    );
    expect(permsOf(second, both).reject.ok).toBe(false);
    expect(
      permsOf(stl({ status: 'APPROVED', final: FINAL, stage1: STAGE1 }), checker).payout.ok,
    ).toBe(true);
    expect(permsOf(stl({ status: 'FAILED' }), checker).reject.why).toBe(
      `${statusLabel('FAILED')} settlements are final and can’t be rejected.`,
    );
  });

  it('shows the queue with the key figures, the maker’s part and the right action per row', async () => {
    const { harness, el } = await openPage();
    expect(text(el.querySelector('.c-ph h1'))).toBe('Settlement approvals');
    const kpis = [...el.querySelectorAll('.kpi')].map((k) => [
      text(k.querySelector('.k-l')),
      text(k.querySelector('.k-v')),
      text(k.querySelector('.k-d')),
    ]);
    expect(kpis).toEqual([
      ['Awaiting stage 1', '1', '₹85,726.00'],
      ['Awaiting final approval', '1', '₹0.00'],
      ['Payout reference to record', '0', '₹0.00'],
      [`${statusLabel('FAILED')} in range`, '0', 'Collected again by the next run'],
    ]);
    expect(text(el.querySelector('.note.tone-info'))).toContain('You give stage-1 approval');
    const pills = [...el.querySelectorAll('.pill')].map((p) => text(p));
    expect(pills).toEqual([
      'All2',
      'Pending1',
      'Stage-1 approved1',
      'Approved0',
      'Payout due0',
      `${statusLabel('FAILED')}0`,
    ]);
    const rows = [...el.querySelectorAll('tbody tr')];
    expect(rows.length).toBe(2);
    expect(text(rows[0]?.querySelector('.row-acts'))).toBe('Approve stage 1');
    expect(text(rows[1]?.querySelector('.row-acts'))).toBe('View');
    expect(text(rows[1])).toContain('Priya Sharma');
    // Without jobs.view and plans.edit, neither the run log nor the fee rule is asked for.
    const ctl = TestBed.inject(HttpTestingController);
    expect(ctl.match('/api/v1/ops/jobs/settlement-run/runs').length).toBe(0);
    expect(ctl.match('/api/v1/ops/platform-fee-rules').length).toBe(0);
    expect(el.textContent).toContain('Run log not available to your role');
    // The search and the pills narrow the list in the page.
    type(el.querySelector('#ob-stq'), 'bhadra');
    harness.detectChanges();
    expect(el.querySelectorAll('tbody tr').length).toBe(1);
    expect(text(el.querySelector('.fsum'))).toBe('1 settlement · ₹0.00');
    type(el.querySelector('#ob-stq'), '');
    ([...el.querySelectorAll('.pill')].at(-1) as HTMLButtonElement).click();
    harness.detectChanges();
    expect(text(el.querySelector('tbody'))).toContain('No settlements match');
  });

  it('gives stage-1 approval with remarks, If-Match and an idempotency key, then opens it', async () => {
    const { harness, el } = await openPage();
    (el.querySelector('tbody tr .row-acts .btn') as HTMLButtonElement).click();
    await settle(harness);
    const dialog = document.querySelector('.modal[role=alertdialog]') as HTMLElement;
    expect(text(dialog.querySelector('h3'))).toBe(
      'Approve stage 1 of STL-20261004-RPETUNSHI000011026-1?',
    );
    // No remarks: the dialog says so and nothing is sent.
    (dialog.querySelector('.sh-f .btn-pri') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(text(dialog.querySelector('#cf-reason-e'))).toBe('Enter a reason to continue');
    type(dialog.querySelector('#cf-reason'), 'Counts and gross match');
    (dialog.querySelector('.sh-f .btn-pri') as HTMLButtonElement).click();
    const post = await request('/api/v1/ops/settlements/s-1/stage1-approval', 'POST');
    expect(post.request.body).toEqual({ remarks: 'Counts and gross match' });
    expect(post.request.headers.get('If-Match')).toBe('"v1"');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    const after = stl({ status: 'APPROVAL_STAGE_1', stage1: STAGE1, version: 2 });
    post.flush(detail(after));
    await flushLists([after, second]);
    (await request('/api/v1/ops/settlements/s-1')).flush(detail(after));
    await settle(harness);
    const drawer = document.querySelector('.drawer') as HTMLElement;
    expect(text(drawer.querySelector('.sh-t h3'))).toBe(
      'Settlement STL-20261004-RPETUNSHI000011026-1',
    );
    expect(text(drawer.querySelector('.sh-t .chip'))).toBe('Stage-1 approved');
    expect(text(drawer.querySelector('.tl'))).toContain('Stage 1 approved by Priya Sharma');
    expect(text(drawer.querySelector('.tl'))).toContain('“Counts match”');
    expect(text(drawer.querySelector('.sh-f'))).toContain('No action available to your role.');
    expect(document.querySelector('.toast')?.textContent).toContain('stage 1 approved');
  });

  it('shows a refusal in the register’s words when the server refuses', async () => {
    const { harness } = await openPage(operator('RAHUL VERMA', 'SETTLEMENT_CHECKER', CHECKER));
    const rows = [...document.querySelectorAll('tbody tr')];
    (rows[1]?.querySelector('.row-acts .btn') as HTMLButtonElement).click();
    await settle(harness);
    const dialog = document.querySelector('.modal[role=alertdialog]') as HTMLElement;
    expect(text(dialog.querySelector('h3'))).toContain('Give final approval to');
    type(dialog.querySelector('#cf-reason'), 'Approved for payout');
    (dialog.querySelector('.sh-f .btn-pri') as HTMLButtonElement).click();
    const post = await request('/api/v1/ops/settlements/s-2/final-approval', 'POST');
    post.flush({ code: 'STL.SAME_APPROVER', detail: 'x' }, { status: 409, statusText: 'Conflict' });
    await wait(1000);
    await settle(harness);
    expect(document.querySelector('.toast')?.textContent).toContain(
      'Same user cannot perform both stage 1 and final approval.',
    );
  });

  it('records the payout: the UTR format and the payable amount are checked first', async () => {
    const approved = stl({ status: 'APPROVED', stage1: STAGE1, final: FINAL, version: 3 });
    const { harness, el } = await openPage(operator('RAHUL VERMA', 'SETTLEMENT_CHECKER', CHECKER), [
      approved,
    ]);
    expect(text(el.querySelector('tbody tr'))).toContain('payout reference due');
    (el.querySelector('tbody tr .row-acts .btn') as HTMLButtonElement).click();
    (await request('/api/v1/ops/settlements/s-1')).flush(detail(approved));
    await settle(harness);
    const modal = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    expect(text(modal.querySelector('h3'))).toBe('Record the bank payout reference');
    expect(text(modal.querySelector('#ob-po-amt-h'))).toBe(
      'Must equal the settlement amount, ₹85,726.00',
    );
    (modal.querySelector('#ob-po-save') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(text(modal.querySelector('#ob-po-utr-e'))).toBe('Enter the UTR');
    expect(text(modal.querySelector('#ob-po-amt-e'))).toBe('Enter the amount paid out');
    type(modal.querySelector('#ob-po-utr'), 'SBIN 42');
    type(modal.querySelector('#ob-po-amt'), '85000');
    (modal.querySelector('#ob-po-save') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(text(modal.querySelector('#ob-po-utr-e'))).toBe(
      'Enter the bank’s UTR: 16 to 22 capital letters and digits.',
    );
    expect(text(modal.querySelector('#ob-po-amt-e'))).toBe(
      'The payout amount must be the settlement’s net amount to be paid, ₹85,726.00.',
    );
    type(modal.querySelector('#ob-po-utr'), 'sbinr52026100412345');
    type(modal.querySelector('#ob-po-amt'), '85,726');
    (modal.querySelector('#ob-po-save') as HTMLButtonElement).click();
    let post = await request('/api/v1/ops/settlements/s-1/payout', 'POST');
    expect(post.request.body).toEqual({
      utr: 'SBINR52026100412345',
      amount: { amount: '85726.00', currency: 'INR' },
    });
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    post.flush({ code: 'STL.UTR_TAKEN', detail: 'x' }, { status: 409, statusText: 'Conflict' });
    await settle(harness);
    expect(text(modal.querySelector('#ob-po-utr-e'))).toBe(
      'This UTR is already recorded on another settlement.',
    );
    type(modal.querySelector('#ob-po-utr'), 'SBINR52026100412346');
    (modal.querySelector('#ob-po-save') as HTMLButtonElement).click();
    post = await request('/api/v1/ops/settlements/s-1/payout', 'POST');
    const paid = {
      ...approved,
      payout: {
        utr: 'SBINR52026100412346',
        amount: money('85726.00'),
        at: FINAL.at,
        by: 'Rahul Verma',
      },
      version: 4,
    };
    post.flush(detail(paid));
    await flushLists([paid]);
    (await request('/api/v1/ops/settlements/s-1')).flush(detail(paid));
    await settle(harness);
    expect(document.querySelector('#ob-po-utr')).toBeNull();
    const drawer = document.querySelector('.drawer') as HTMLElement;
    expect(text(drawer.querySelector('.tl'))).toContain('Payout recorded · SBINR52026100412346');
    expect(text(drawer.querySelector('.sh-f'))).toContain(
      'Settled and paid out — no further action.',
    );
    expect(text(drawer.querySelector('tbody'))).toContain('Paid out');
  });

  it('shows the run log and the fee rule to roles that may read them', async () => {
    const reader = {
      ...operator('ANANYA IYER', 'RECON_OFFICER', ['settle.view', 'jobs.view', 'plans.edit']),
      role: { code: 'RECON_OFFICER', name: 'Reconciliation Officer' },
    };
    const harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/backoffice/settlements');
    (await request('/api/v1/ops/session')).flush(reader);
    await nav;
    (await request('/api/v1/ops/jobs/settlement-run/runs')).flush({
      items: [
        {
          id: 'r-1',
          jobId: 'settlement-run',
          period: TODAY,
          trigger: 'SCHEDULE',
          status: 'SUCCESS',
          processed: 5,
          failed: 0,
          skipped: 1,
          startedAt: '2026-10-04T18:00:00.000Z',
          endedAt: '2026-10-04T18:01:00.000Z',
        },
      ],
    });
    (await request('/api/v1/ops/platform-fee-rules')).flush({
      default: {
        thresholdAmount: money('100.00'),
        flatFee: money('1.00'),
        boundary: 'INCLUSIVE',
        basisPoints: 50,
        percent: '0.50',
        chargeTuition: true,
        appliesTo: ['PAYMENT'],
      },
      plans: [{ id: 'p', name: 'Campus Plus', rule: {}, override: true }],
    });
    await flushLists([stl()]);
    await settle(harness);
    const el = harness.routeNativeElement as HTMLElement;
    expect(text(el.querySelector('.note.tone-info'))).toContain('You can read settlements');
    const run = text(
      [...el.querySelectorAll('.card')].find((c) => c.textContent?.includes('run log')),
    );
    expect(run).toContain('23:30–23:31');
    expect(run).toContain('₹85,726.00');
    expect(run).toContain('Completed');
    const fee = text(
      [...el.querySelectorAll('.card')].find((c) => c.textContent?.includes('fee rule')),
    );
    expect(fee).toContain('₹1.00 when the amount is ₹100.00 or less, otherwise 0.5%');
    expect(fee).toContain('₹60.00 canteen paymentfee ₹1.00 · net ₹59.00');
    expect(fee).toContain('₹250.00 book depotfee ₹1.25 · net ₹248.75');
    expect(fee).toContain('Campus Plus has a rule of its own');
  });
});
