import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import { translate } from '../../../Utils/translate';
import type { CommReport } from './comm-report.api';

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

const session = (subTasks = ['commreport.view']) => ({
  name: 'PRAKASH SHETTY',
  email: 'prakash.shetty@tvps.example.in',
  institution: {
    id: 'i-1',
    name: 'Tunga Valley Public School',
    shortName: 'TVPS',
    city: 'Shivamogga',
  },
  roles: [{ code: 'INSTITUTION_ADMIN', name: 'Institution Administrator', readOnly: false }],
  subTasks: ['home.view', 'task.home', 'task.commreport', ...subTasks],
  preferredLang: 'en',
});
const report: CommReport = {
  period: { from: '2026-09-05', to: '2026-10-04' },
  completeFrom: '2026-10-04',
  retention: { purging: false, successDays: 30, failedDays: 90 },
  unrecorded: 0,
  totals: {
    attempts: 4,
    byKind: { ANNOUNCEMENT: 2, DIRECT_MESSAGE: 1, OTP: 1 },
    byChannel: { IN_APP: 3, SMS: 1 },
    byOutcome: { SUCCESS: 3, SKIPPED: 1 },
    recipients: 3,
    failedShare: 0,
  },
  items: [
    {
      id: '4',
      at: '2026-10-04T17:52:40.820Z',
      kind: 'DIRECT_MESSAGE',
      channel: 'IN_APP',
      raisedBy: { name: 'SURESH IYER', event: null },
      recipient: { name: 'Ravi Kulkarni', address: 'In-app' },
      subject: null,
      outcome: 'SUCCESS',
      reason: null,
    },
    {
      id: '3',
      at: '2026-10-04T17:40:00.000Z',
      kind: 'ANNOUNCEMENT',
      channel: 'IN_APP',
      raisedBy: { name: 'RAVI KULKARNI', event: null },
      recipient: { name: 'Tanvi Kulkarni', address: null },
      subject: 'Bring your geometry box tomorrow',
      outcome: 'SKIPPED',
      reason: 'No account',
    },
    {
      id: '2',
      at: '2026-10-04T10:00:00.000Z',
      kind: 'OTP',
      channel: 'SMS',
      raisedBy: { name: null, event: 'member.signin' },
      recipient: { name: 'Lakshmi Rao', address: '•••••• 9955' },
      subject: 'Sign-in code',
      outcome: 'SUCCESS',
      reason: null,
    },
  ],
  nextCursor: null,
};

describe('console communication report (COM-007, COM-008)', () => {
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
  async function open(sess = session()) {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/commreport');
    (await request((u) => u === '/api/v1/console/session')).flush(sess);
    await nav;
    await settle();
    if (sess.subTasks.includes('commreport.view')) {
      const r = await request((u) => u.startsWith('/api/v1/console/communication-log'));
      expect(r.request.urlWithParams).toContain('limit=50');
      r.flush(report);
      await settle();
    }
    return harness.routeNativeElement as HTMLElement;
  }

  it('lists every dispatch with its outcome, never a direct message text', async () => {
    const el = await open();
    const kpis = words(el.querySelector('#cr-kpis'));
    expect(kpis).toContain('Dispatches 4');
    expect(kpis).toContain('Delivered 75%');
    expect(kpis).toContain('Kept 90 days');
    expect(text(el)).toContain('Complete from 04 Oct 2026.');
    const rows = [...el.querySelectorAll('#cr-table tbody tr')].map((r) => words(r));
    expect(rows[0]).toContain('Direct message');
    expect(rows[0]).toContain('Private message');
    expect(rows[0]).toContain('Suresh Iyer');
    expect(rows[1]).toContain(translate('status.commLog.skipped'));
    expect(rows[1]).toContain('No account');
    expect(rows[2]).toContain('System (Member signin)');
    expect(words(el.querySelector('.pills'))).toContain('Announcements 2');

    const pills = [...el.querySelectorAll('.pills .pill')] as HTMLButtonElement[];
    pills.find((p) => text(p).startsWith('One-time passwords'))!.click();
    const again = await request((u) => u.startsWith('/api/v1/console/communication-log'));
    expect(again.request.urlWithParams).toContain('kind=OTP');
    again.flush({ ...report, items: [], totals: { ...report.totals, attempts: 0 } });
    await settle();
    expect(text(el.querySelector('.empty h4'))).toBe('Nothing matches these filters');
    expect(words(el.querySelector('.pills'))).toContain('Announcements 2');
  });

  it('exports exactly the filtered rows', async () => {
    const saved: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this.download);
    });
    try {
      const el = await open();
      (el.querySelector('#cr-export') as HTMLButtonElement).click();
      const post = await request((u) => u === '/api/v1/console/communication-log/exports', 'POST');
      expect(post.request.body).toEqual({
        filters: { from: expect.any(String), to: expect.any(String) },
      });
      post.flush({ exportId: 'e-9', status: 'REQUESTED' });
      (await request((u) => u === '/api/v1/exports/e-9')).flush({
        exportId: 'e-9',
        report: 'communication-log',
        status: 'READY',
        rows: 4,
        truncated: false,
        requestedAt: '2026-10-04T10:00:00Z',
        readyAt: '2026-10-04T10:00:01Z',
        expiresAt: '2026-10-11T10:00:01Z',
        file: {
          name: 'communication-log.csv',
          sizeBytes: 900,
          url: '/api/v1/files/f/content?sig=1',
          expiresAt: '2026-10-04T10:05:00Z',
        },
      });
      await settle(6);
      expect(saved).toEqual(['communication-log.csv']);
      expect(toasts()).toContain('4 rows');
    } finally {
      click.mockRestore();
    }
  });

  it('refuses a role without the report', async () => {
    const el = await open(session([]));
    expect(text(el.querySelector('.empty h4'))).toBe("You don't have access to this page");
    expect(el.querySelector('#cr-export')).toBeNull();
  });
});
