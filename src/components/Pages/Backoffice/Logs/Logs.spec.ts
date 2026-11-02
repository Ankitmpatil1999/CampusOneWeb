import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import { translate } from '../../../Utils/translate';

const tick = () => new Promise((r) => setTimeout(r, 0));
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
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

const analyst = (subTasks = ['logs.query', 'task.logs']) => ({
  name: 'IMRAN SHEIKH',
  email: 'imran@campusone.example',
  role: { code: 'LOG_ANALYST', name: 'Log Analyst' },
  subTasks: ['home.view', 'task.home', ...subTasks],
  preferredLang: 'en',
});
const row = (id: string, status: number, latencyMs: number, extra: object = {}) => ({
  id,
  at: '2026-10-04T07:10:58.000Z',
  correlationId: '01a10803-cef9-70ab-b2d0-01f53de7c943',
  method: 'GET',
  route: '/api/v1/console/reports/:reportId',
  path: '/console/reports/daily-attendance',
  status,
  latencyMs,
  surface: 'console',
  user: { id: '01a0ffcb-34a4-7783-81ce-fd8cff6bc108', name: 'PRAKASH SHETTY' },
  institution: 'Tunga Valley Public School',
  problemCode: null,
  ...extra,
});

describe('back-office log analyser (IDN-075, IDN-076)', () => {
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
  async function open(sess = analyst()) {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/backoffice/logs');
    (await request((u) => u === '/api/v1/ops/session')).flush(sess);
    await nav;
    await settle();
    return harness.routeNativeElement as HTMLElement;
  }

  it('queries the last 24 hours, figures the result and opens a request', async () => {
    const el = await open();
    expect(text(el.querySelector('.c-ph h1'))).toBe('Log analyser');
    (await request((u) => u === '/api/v1/ops/institutions')).flush(
      { code: 'AUTH.FORBIDDEN', detail: 'x' },
      { status: 403, statusText: 'Forbidden' },
    );
    const q = await request((u) => u.startsWith('/api/v1/ops/logs?'));
    expect(q.request.params.get('from')).toBeTruthy();
    expect(q.request.params.get('to')).toBeTruthy();
    q.flush({
      from: '2026-10-03T07:00:00Z',
      to: '2026-10-04T07:00:00Z',
      items: [
        row('3', 200, 16),
        row('2', 404, 9, { problemCode: 'RPT.REPORT_NOT_FOUND' }),
        row('1', 500, 120, { user: null, institution: null }),
      ],
      nextCursor: null,
    });
    await settle();
    const kpis = words(el.querySelector('#lg-kpis'));
    expect(kpis).toContain('Requests 3');
    expect(kpis).toContain('Server errors 1');
    expect(kpis).toContain('Client errors 1');
    expect(kpis).toContain('p95 latency 120 ms');
    const rows = [...el.querySelectorAll('#lg-table tbody tr')] as HTMLElement[];
    expect(words(rows[0])).toContain('12:40:58 04 Oct 2026 Prakash Shetty Console');
    expect(words(rows[1])).toContain('RPT.REPORT_NOT_FOUND');
    expect(words(rows[2])).toContain('Not signed in Platform');

    rows[1]!.click();
    (await request((u) => u === '/api/v1/ops/logs/2')).flush({
      ...row('2', 404, 9, { problemCode: 'RPT.REPORT_NOT_FOUND' }),
      clientAddress: '10.20.4.0/24',
      userAgent: 'Chrome 128',
      queryKeys: ['yearId'],
      activity: [],
    });
    const rel = await request((u) => u.startsWith('/api/v1/ops/logs?correlationId='));
    rel.flush({ from: '', to: '', items: [row('2', 404, 9)], nextCursor: null });
    await settle();
    const d = document.querySelector('#lg-detail') as HTMLElement;
    expect(words(d)).toContain('10.20.4.0/24');
    expect(words(d)).toContain('yearId');
    expect(words(d)).toContain(translate('RPT.REPORT_NOT_FOUND'));
    expect(words(d)).toContain('No activity was recorded');
    expect(words(d)).toContain('None — this request stands alone.');
  });

  it('checks the user id and the range before querying', async () => {
    const el = await open();
    (await request((u) => u === '/api/v1/ops/institutions')).flush({ items: [] });
    (await request((u) => u.startsWith('/api/v1/ops/logs?'))).flush({
      from: '',
      to: '',
      items: [],
      nextCursor: null,
    });
    await settle();
    expect(text(el.querySelector('.empty h4'))).toBe('No entries match');
    const user = el.querySelector('#lg-user') as HTMLInputElement;
    user.value = 'Prakash';
    user.dispatchEvent(new Event('input'));
    const win = el.querySelector('#lg-win') as HTMLSelectElement;
    win.value = 'custom';
    win.dispatchEvent(new Event('change'));
    await settle(1);
    const from = el.querySelector('#lg-from') as HTMLInputElement;
    from.value = '2026-08-01';
    from.dispatchEvent(new Event('change'));
    (el.querySelector('#lg-run') as HTMLButtonElement).click();
    await settle(1);
    expect(text(el.querySelector('#lg-user-e'))).toBe('Enter a user id as the results show it.');
    expect(text(el.querySelector('#lg-from-e'))).toBe(translate('LOG.RANGE', { days: 31 }));
  });

  it('keeps the analyser to roles that hold it', async () => {
    const el = await open(analyst([]));
    expect(text(el.querySelector('.empty h4'))).toBe("This page isn't part of your role");
  });
});
