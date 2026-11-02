import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import { translate } from '../../../Utils/translate';
import type { AccessRecord, XiComparison } from './crossinst.api';

const tick = () => new Promise((r) => setTimeout(r, 0));
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const toasts = () => text(document.querySelector('.toasts'));
function words(el: Element | null | undefined) {
  if (!el) return '';
  const out: string[] = [];
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) out.push(w.currentNode.textContent ?? '');
  return out.join(' ').replace(/\s+/g, ' ').trim();
}
async function request(match: (url: string) => boolean, method = 'GET') {
  const ctl = TestBed.inject(HttpTestingController);
  for (let i = 0; i < 80; i++) {
    const found = ctl.match((r) => match(r.urlWithParams) && r.method === method);
    if (found[0]) return found[0];
    await tick();
  }
  throw new Error(`no ${method} request`);
}
const set = (sel: string, v: string) => {
  const i = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement;
  i.value = v;
  i.dispatchEvent(new Event('input'));
};

const ops = (
  subTasks: string[],
  role = { code: 'PLATFORM_ADMIN', name: 'Platform Administrator' },
) => ({
  name: 'ARJUN MEHTA',
  email: 'arjun@campusone.example',
  role,
  subTasks: ['home.view', 'task.home', ...subTasks],
  preferredLang: 'en',
});
const ADMIN = ['task.crossinst', 'task.access', 'xi.aggregate', 'xi.drill', 'access.view'];
const insts = [
  {
    id: 'i-1',
    name: 'Tunga Valley Public School',
    identifier: 'X1',
    status: 'ACTIVE',
    subscriptionStatus: 'ACTIVE',
  },
  {
    id: 'i-2',
    name: 'Sahyadri Vidya Mandir',
    identifier: 'X2',
    status: 'ACTIVE',
    subscriptionStatus: 'ACTIVE',
  },
  {
    id: 'i-3',
    name: 'Coastal Pearl School',
    identifier: 'X3',
    status: 'SUSPENDED',
    subscriptionStatus: null,
  },
];
const comparison: XiComparison = {
  accessId: 'acc-1',
  accessNo: 'ACC-26-0007',
  period: { from: '2026-09-27', to: '2026-10-03' },
  columns: [
    {
      key: 'membersActive',
      label: 'Active members',
      unit: 'count',
      definition: 'Members whose status is Active',
      figure: 'members',
    },
    {
      key: 'walletFunding',
      label: 'Wallet funding',
      unit: 'paise',
      definition: 'Credited to wallets',
      figure: 'wallets',
    },
    {
      key: 'attendancePercent',
      label: 'Student attendance',
      unit: 'percent',
      definition: 'Present ÷ records',
      figure: 'attendance',
    },
  ],
  rows: [
    {
      institutionId: 'i-1',
      name: 'Tunga Valley Public School',
      shortName: 'TVPS',
      identifier: 'X1',
      status: 'ACTIVE',
      values: { membersActive: 1381, walletFunding: 12660872, attendancePercent: 94.9 },
    },
    {
      institutionId: 'i-2',
      name: 'Sahyadri Vidya Mandir',
      shortName: 'SVM',
      identifier: 'X2',
      status: 'ACTIVE',
      values: { membersActive: 1860, walletFunding: 10701873, attendancePercent: null },
    },
  ],
  totals: { membersActive: 3241, walletFunding: 23362745, attendancePercent: null },
  averages: { membersActive: 1620.5, walletFunding: 11681372.5, attendancePercent: 94.9 },
  unavailable: [],
};

describe('back-office cross-institution report and access record (RPT-009…012)', () => {
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
  async function open(path: string, sess: ReturnType<typeof ops>) {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl(path);
    (await request((u) => u === '/api/v1/ops/session')).flush(sess);
    await nav;
    await settle();
    return harness.routeNativeElement as HTMLElement;
  }

  it('checks the definition, runs the comparison and drills into one institution', async () => {
    const el = await open('/backoffice/crossinst', ops(ADMIN));
    (await request((u) => u === '/api/v1/ops/institutions')).flush({ items: insts });
    await settle();
    expect(words(el.querySelector('#xi-insts'))).toContain('Coastal Pearl School Suspended');
    (el.querySelector('#xi-run') as HTMLButtonElement).click();
    await settle(1);
    expect(text(el.querySelector('#xi-form'))).toContain(translate('RPT.XI_SELECTION'));
    expect(text(el.querySelector('#xi-reason-e'))).toBe(translate('RPT.XI_REASON'));

    const boxes = [...el.querySelectorAll('#xi-insts input')] as HTMLInputElement[];
    boxes[0]!.dispatchEvent(new Event('change'));
    boxes[1]!.dispatchEvent(new Event('change'));
    set('#xi-reason', 'Quarterly board pack — members and wallets');
    await settle(1);
    expect(text(el.querySelector('.ob-selbar'))).toContain('2 institutions selected');
    (el.querySelector('#xi-run') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/ops/cross-institution-reports', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({
      selection: { institutionIds: ['i-1', 'i-2'] },
      period: { from: expect.any(String), to: expect.any(String) },
      figures: ['members', 'attendance', 'wallets', 'settlement'],
      reason: 'Quarterly board pack — members and wallets',
    });
    post.flush(comparison);
    await settle();
    expect(toasts()).toContain('Report recorded as ACC-26-0007');
    const result = el.querySelector('#xi-result') as HTMLElement;
    expect(text(result.querySelector('.card-h'))).toContain('2 institutions · Last 7 days');
    expect(text(result.querySelector('.card-h'))).toContain('Recorded · ACC-26-0007');
    expect(text(result)).toContain('“Named: 2 institutions”');
    const rows = [...result.querySelectorAll('#xi-table tbody tr')].map((r) => words(r));
    expect(rows[0]).toContain('1,381 ₹1,26,608.72 94.9%');
    expect(rows[1]).toContain('n/a');
    expect(words(result.querySelector('tfoot'))).toContain('Total 3,241 ₹2,33,627.45 —');

    (result.querySelector('tbody .row-acts button') as HTMLButtonElement).click();
    await settle(1);
    expect(text(document.querySelector('.modal'))).toContain(
      'Drill into Tunga Valley Public School?',
    );
    (document.querySelector('#xi-drill-go') as HTMLButtonElement).click();
    const drill = await request(
      (u) => u === '/api/v1/ops/cross-institution-reports/acc-1/drill-throughs',
      'POST',
    );
    expect(drill.request.body).toEqual({
      institutionId: 'i-1',
      reason: 'Quarterly board pack — members and wallets',
    });
    drill.flush({
      accessId: 'acc-2',
      accessNo: 'ACC-26-0008',
      institution: { institutionId: 'i-1', name: 'Tunga Valley Public School' },
      period: comparison.period,
      figures: {
        values: comparison.rows[0]!.values,
        breakdowns: {
          membersByType: [
            { label: 'Parent', value: 659 },
            { label: 'Student', value: 651 },
          ],
          feesByStatus: [{ label: 'PARTIALLY_PAID', value: 120000 }],
        },
      },
    });
    await settle();
    const d = document.querySelector('#xi-drill') as HTMLElement;
    expect(text(d)).toContain('Recorded as ACC-26-0008');
    expect(text(d)).toContain('drill-through from ACC-26-0007');
    expect(words(d)).toContain('Active members by type');
    expect(words(d)).toContain('Parent 659');
    expect(words(d)).toContain('Partially paid ₹1,200.00');
  });

  it('shows the refusal to a role without the entitlement', async () => {
    const el = await open(
      '/backoffice/crossinst',
      ops(['task.support'], { code: 'SUPPORT_OFFICER', name: 'Support Officer' }),
    );
    expect(text(el.querySelector('.empty h4'))).toBe(
      "Cross-institution reporting isn't available to your role",
    );
    expect(text(el.querySelector('.empty p'))).toContain(translate('RPT.XI_NOT_ENTITLED'));
    expect(text(el.querySelector('.empty p'))).toContain('Support Officer');
    expect(el.querySelector('#xi-form')).toBeNull();
  });

  it('lists the access record with figures, a record and the export', async () => {
    const rec = (n: string, extra: Partial<AccessRecord>): AccessRecord => ({
      accessId: `a-${n}`,
      accessNo: `ACC-26-000${n}`,
      kind: 'Comparison',
      parentAccessNo: null,
      actor: { id: 'u-1', name: 'ARJUN MEHTA', role: 'PLATFORM_ADMIN' },
      selection: 'Named: 2 institutions',
      institutions: ['Tunga Valley Public School', 'Sahyadri Vidya Mandir'],
      figures: ['members', 'wallets'],
      period: { from: '2026-09-27', to: '2026-10-03' },
      outcome: 'Returned',
      reason: 'Quarterly board pack',
      note: null,
      at: new Date().toISOString(),
      ...extra,
    });
    const items = [
      rec('3', {
        kind: 'Drill-through',
        parentAccessNo: 'ACC-26-0002',
        institutions: ['Tunga Valley Public School'],
      }),
      rec('2', {}),
      rec('1', {
        actor: { id: 'u-2', name: "JOSEPH D'SOUZA", role: 'SUPPORT_OFFICER' },
        outcome: 'Refused',
        institutions: [],
        figures: [],
        period: { from: null, to: null },
        note: 'RPT.XI_NOT_ENTITLED',
        selection: 'Stated selection',
      }),
    ];
    const saved: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this.download);
    });
    try {
      const el = await open('/backoffice/access', ops(ADMIN));
      // The list and the 30-day figures.
      const ctl = TestBed.inject(HttpTestingController);
      let reads: ReturnType<typeof ctl.match> = [];
      for (let i = 0; i < 80 && reads.length < 2; i++) {
        reads = [...reads, ...ctl.match((r) => r.url === '/api/v1/ops/access-records')];
        await tick();
      }
      expect(reads).toHaveLength(2);
      for (const r of reads) r.flush({ items, nextCursor: null });
      await settle();
      const kpis = words(el.querySelector('#acc-kpis'));
      expect(kpis).toContain('Accesses · 30 days 3');
      expect(kpis).toContain('Refused · 30 days 1');
      expect(kpis).toContain('Drill-throughs · 30 days 1');
      expect(kpis).toContain('Institutions read · 30 days 2');
      expect(kpis).toContain('2 distinct actors');
      const rows = [...el.querySelectorAll('#acc-table tbody tr')] as HTMLElement[];
      expect(words(rows[0])).toContain('Arjun Mehta Platform admin');
      expect(words(rows[2])).toContain('Refused');
      rows[2]!.click();
      await settle();
      const d = document.querySelector('#acc-detail') as HTMLElement;
      expect(words(d)).toContain('None — nothing was returned');
      expect(words(d)).toContain(translate('RPT.XI_NOT_ENTITLED'));

      (el.querySelector('#acc-export') as HTMLButtonElement).click();
      const post = await request((u) => u === '/api/v1/ops/access-records/exports', 'POST');
      expect(post.request.body).toEqual({
        filters: { from: expect.any(String), to: expect.any(String) },
      });
      post.flush({ exportId: 'e-2', status: 'REQUESTED' });
      const poll = await request((u) => u === '/api/v1/exports/e-2');
      expect(poll.request.headers.get('X-CampusOne-Surface')).toBe('ops');
      poll.flush({
        exportId: 'e-2',
        report: 'access-records',
        status: 'READY',
        rows: 3,
        truncated: false,
        requestedAt: '2026-10-04T10:00:00Z',
        readyAt: '2026-10-04T10:00:01Z',
        expiresAt: '2026-10-11T10:00:01Z',
        file: {
          name: 'access-records.csv',
          sizeBytes: 500,
          url: '/api/v1/files/f/content?sig=1',
          expiresAt: '2026-10-04T10:05:00Z',
        },
      });
      await settle(6);
      expect(saved).toEqual(['access-records.csv']);
    } finally {
      click.mockRestore();
    }
  });
});
