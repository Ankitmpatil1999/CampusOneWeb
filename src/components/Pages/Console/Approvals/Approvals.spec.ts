import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import { webLinkOf } from '../../../Header/notifications.api';

const tick = () => new Promise((r) => setTimeout(r, 0));

async function request(match: (url: string) => boolean, method = 'GET') {
  const ctl = TestBed.inject(HttpTestingController);
  for (let i = 0; i < 60; i++) {
    const found = ctl.match((r) => match(r.urlWithParams) && r.method === method);
    if (found[0]) return found[0];
    await tick();
  }
  throw new Error(`no ${method} request`);
}

const session = {
  name: 'PRAKASH SHETTY',
  email: 'prakash.shetty@tvps.example.in',
  institution: {
    id: 'i-1',
    name: 'Tunga Valley Public School',
    shortName: 'TVPS',
    city: 'Shivamogga',
  },
  roles: [{ code: 'INSTITUTION_ADMIN', name: 'Institution Administrator', readOnly: false }],
  subTasks: ['home.view', 'approvals.view', 'approvals.decide', 'task.home', 'task.approvals'],
  preferredLang: 'en',
};

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

const row = (over: object) => ({
  id: 'a-3',
  no: 'APR-0003',
  module: 'MEMBER_SUSPENSION',
  area: 'Members',
  action: 'Suspend member',
  cr: 'CR-08',
  summary: 'Diya Kulkarni (Grade 8 A) — access withheld pending a parent meeting',
  status: 'PENDING',
  maker: { id: 'u-2', name: 'Rekha Kamath', you: false, type: 'staff' },
  raisedAt: hoursAgo(2),
  checker: null,
  decidedAt: null,
  remarks: null,
  appliedDirectly: false,
  canDecide: true,
  lastError: null,
  version: 1,
  ...over,
});

const list = {
  counts: { tabs: { PENDING: 2, APPROVED: 3, REJECTED: 1 }, canDecide: 1, mine: 1, decided30: 4 },
  canDecide: true,
  modules: [
    { code: 'MEMBER_SUSPENSION', label: 'Suspend member' },
    { code: 'PII_CORRECTION', label: 'Correct personal information' },
  ],
  makers: [
    { id: 'u-1', name: 'Prakash Shetty', you: true },
    { id: 'u-2', name: 'Rekha Kamath', you: false },
  ],
  items: [
    row({}),
    row({
      id: 'a-2',
      no: 'APR-0002',
      module: 'PII_CORRECTION',
      action: 'Correct personal information',
      cr: 'CR-06',
      summary: 'Date of birth for Aarav Hegde: 12 Apr 2014 → 21 Apr 2014 (birth.pdf attached)',
      maker: { id: 'u-1', name: 'Prakash Shetty', you: true, type: 'staff' },
      raisedAt: hoursAgo(30),
      canDecide: false,
    }),
  ],
  nextCursor: null,
};

const detail = {
  ...row({}),
  reason: 'Access withheld pending a parent meeting',
  changes: [
    { label: 'Member status', from: 'Active', to: 'Suspended' },
    { label: 'Reason', from: '—', to: 'Access withheld pending a parent meeting' },
  ],
  evidence: null,
  subject: { type: 'member', id: 'm-9' },
};

describe('approvals (MKR-001…005, FR-MKC-01/03)', () => {
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

  async function open(url = '/console/approvals') {
    const harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl(url);
    (await request((u) => u === '/api/v1/console/session')).flush(session);
    await nav;
    (await request((u) => u.startsWith('/api/v1/console/notifications?'))).flush({
      unread: 0,
      items: [],
      nextCursor: null,
    });
    (await request((u) => u.startsWith('/api/v1/console/approvals?'))).flush(list);
    for (let i = 0; i < 5; i++) await tick();
    harness.detectChanges();
    return harness;
  }

  it('shows the key figures, the tabs and who can decide each request', async () => {
    const harness = await open();
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.querySelector('.c-ph h1')?.textContent).toBe('Approvals');
    const kpis = [...el.querySelectorAll('.kpi .k-v')].map((k) => k.textContent?.trim());
    expect(kpis).toEqual(['2', '1', '1', '4']);
    expect(el.querySelectorAll('.kpi')[1]?.textContent).toContain('Institution Administrator');
    const tabs = [...el.querySelectorAll('.tabs .tab')].map((t) =>
      t.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(tabs).toEqual(['Pending2', 'Approved3', 'Rejected1']);
    expect(el.querySelector('.c-filters .fsum')?.textContent).toBe('2 requests');

    const rows = [...el.querySelectorAll('tbody tr')] as HTMLElement[];
    expect(rows[0]?.textContent).toContain('APR-0003');
    expect(rows[0]?.textContent).toContain('2 hr ago');
    expect(rows[0]?.querySelector('.chip.tone-ok')?.textContent).toBe('You can decide');
    expect(rows[0]?.querySelector('.srs.cr')?.textContent).toBe('CR-08');
    expect(rows[1]?.querySelector('.chip.tone-ok')).toBeNull();
    expect(rows[1]?.querySelector('.cm-why')?.textContent).toContain('Your request');
    expect(rows[1]?.textContent).toContain('You');

    // The Approved tab asks the server for decided requests.
    [...el.querySelectorAll('.tabs .tab')]
      .find((t) => t.textContent?.includes('Approved'))
      ?.dispatchEvent(new Event('click'));
    harness.detectChanges();
    const approved = await request((u) => u.includes('status=APPROVED'));
    approved.flush({
      ...list,
      items: [
        row({
          status: 'APPROVED',
          checker: { name: 'Prakash Shetty' },
          decidedAt: hoursAgo(1),
          remarks: 'Confirmed with the class teacher',
          canDecide: false,
        }),
      ],
    });
    for (let i = 0; i < 3; i++) await tick();
    harness.detectChanges();
    const heads = [...el.querySelectorAll('thead th')].map((t) =>
      t.textContent?.replace(/[↑↓]/g, '').trim(),
    );
    expect(heads).toEqual([
      'Request',
      'Module',
      'Action',
      'Summary',
      'Maker',
      'Decided',
      'Remarks',
    ]);
    expect(el.querySelector('tbody tr')?.textContent).toContain('Confirmed with the class teacher');
  });

  it('opens a request and approves it with remarks (If-Match, Idempotency-Key)', async () => {
    const harness = await open();
    const el = harness.routeNativeElement as HTMLElement;
    (el.querySelector('tbody tr') as HTMLElement).click();
    (await request((u) => u === '/api/v1/console/approvals/a-3')).flush(detail);
    await tick();
    harness.detectChanges();
    const drawer = document.querySelector('.drawer') as HTMLElement;
    expect(drawer.querySelector('.sh-h h3')?.textContent).toBe('Request APR-0003');
    expect(drawer.querySelector('.sh-h p')?.textContent).toBe('Members · Suspend member');
    expect(drawer.querySelector('.cm-diff .cm-to')?.textContent).toBe('Suspended');

    // Remarks are mandatory.
    const approveBtn = () =>
      [...drawer.querySelectorAll('.sh-f button')].find(
        (b) => b.textContent?.trim() === 'Approve',
      ) as HTMLButtonElement;
    approveBtn().click();
    harness.detectChanges();
    expect(drawer.querySelector('.fld.invalid')).not.toBeNull();

    const remarks = drawer.querySelector('#ap-rem') as HTMLTextAreaElement;
    remarks.value = 'Confirmed with the class teacher';
    remarks.dispatchEvent(new Event('input'));
    harness.detectChanges();
    approveBtn().click();
    await tick();
    harness.detectChanges();
    const dialog = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    expect(dialog.querySelector('h3')?.textContent?.trim()).toBe('Approve APR-0003?');
    [...dialog.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Approve')
      ?.click();

    const post = await request((u) => u === '/api/v1/console/approvals/a-3/decision', 'POST');
    expect(post.request.headers.get('If-Match')).toBe('"v1"');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({
      decision: 'APPROVE',
      remarks: 'Confirmed with the class teacher',
    });
    post.flush({
      ...detail,
      status: 'APPROVED',
      checker: { name: 'Prakash Shetty' },
      decidedAt: new Date().toISOString(),
      remarks: 'Confirmed with the class teacher',
      canDecide: false,
      version: 2,
    });
    // The list and its counts reload.
    (await request((u) => u.startsWith('/api/v1/console/approvals?'))).flush(list);
    await tick();
    harness.detectChanges();
    expect(document.querySelector('.toasts')?.textContent).toContain('Approved — change applied');
    expect(drawer.textContent).toContain('Approved by Prakash Shetty');
  });

  it('keeps the request open with the reason when the change cannot be applied', async () => {
    const harness = await open('/console/approvals?open=a-3');
    (await request((u) => u === '/api/v1/console/approvals/a-3')).flush(detail);
    await tick();
    harness.detectChanges();
    const drawer = document.querySelector('.drawer') as HTMLElement;
    const remarks = drawer.querySelector('#ap-rem') as HTMLTextAreaElement;
    remarks.value = 'Approved after review';
    remarks.dispatchEvent(new Event('input'));
    harness.detectChanges();
    [...drawer.querySelectorAll('.sh-f button')]
      .find((b) => b.textContent?.trim() === 'Approve')
      ?.dispatchEvent(new Event('click'));
    await tick();
    harness.detectChanges();
    const dialog = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    [...dialog.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Approve')
      ?.click();
    const post = await request((u) => u === '/api/v1/console/approvals/a-3/decision', 'POST');
    expect(post.request.body).toEqual({ decision: 'APPROVE', remarks: 'Approved after review' });
    post.flush(
      {
        code: 'MKR.EFFECT_FAILED',
        params: { reason: 'Admission number already exists: TVPS/2019/0412' },
      },
      { status: 409, statusText: 'Conflict' },
    );
    (await request((u) => u === '/api/v1/console/approvals/a-3')).flush({
      ...detail,
      lastError: 'Admission number already exists: {n}',
    });
    await tick();
    harness.detectChanges();
    expect(document.querySelector('.toasts')?.textContent).toContain(
      "The change couldn't be applied: Admission number already exists: TVPS/2019/0412",
    );
    expect(document.querySelector('.drawer .note.tone-bad')).not.toBeNull();
  });

  it('shows the unread badge and marks every notification read', async () => {
    const harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/approvals');
    (await request((u) => u === '/api/v1/console/session')).flush(session);
    await nav;
    const notifications = {
      unread: 1,
      items: [
        {
          id: 'n-1',
          category: 'APPROVAL',
          titleKey: 'NTF.APPROVAL_RAISED',
          params: { no: 'APR-0003' },
          title: 'APR-0003 is waiting for your decision',
          body: 'Diya Kulkarni (Grade 8 A) — access withheld',
          link: '/console/approvals?open=a-3',
          read: false,
          at: hoursAgo(2),
        },
        {
          id: 'n-2',
          category: 'APPROVAL',
          titleKey: 'NTF.APPROVAL_APPROVED',
          params: { no: 'APR-0001' },
          title: 'APR-0001 approved',
          body: 'Suspend member: Confirmed',
          link: null,
          read: true,
          at: hoursAgo(30),
        },
      ],
      nextCursor: null,
    };
    const first = await request((u) => u.startsWith('/api/v1/console/notifications?'));
    expect(first.request.urlWithParams).toContain('limit=12');
    first.flush(notifications);
    (await request((u) => u.startsWith('/api/v1/console/approvals?'))).flush(list);
    for (let i = 0; i < 3; i++) await tick();
    harness.detectChanges();

    const bell = document.querySelector('.c-top button[title="Notifications"]') as HTMLElement;
    expect(bell.querySelector('.badge')?.textContent?.trim()).toBe('1');
    bell.click();
    (await request((u) => u.startsWith('/api/v1/console/notifications?'))).flush(notifications);
    await tick();
    harness.detectChanges();
    const drawer = [...document.querySelectorAll('.drawer')].find(
      (d) => d.querySelector('.sh-h h3')?.textContent === 'Notifications',
    ) as HTMLElement;
    const items = [...drawer.querySelectorAll('.list .li')];
    expect(items.length).toBe(2);
    expect(items[0]?.classList).toContain('unread');
    expect(items[0]?.querySelector('.li-t')?.textContent).toBe(
      'APR-0003 is waiting for your decision',
    );
    expect(items[0]?.querySelector('.li-s')?.textContent).toContain('· 2 hr ago');
    expect(items[1]?.classList).not.toContain('unread');

    [...drawer.querySelectorAll('.sh-f button')]
      .find((b) => b.textContent?.trim() === 'Mark all as read')
      ?.dispatchEvent(new Event('click'));
    const read = await request((u) => u === '/api/v1/console/notifications/read', 'POST');
    expect(read.request.body).toEqual({ all: true });
    read.flush(null, { status: 204, statusText: 'No Content' });
    await tick();
    harness.detectChanges();
    expect(bell.querySelector('.badge')).toBeNull();
    expect(document.querySelector('.toasts')?.textContent).toContain(
      'All notifications marked as read',
    );
  });

  it('opens a teacher’s app notice at its web page and marks it read (client 2026-10-21)', async () => {
    const harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/approvals');
    (await request((u) => u === '/api/v1/console/session')).flush({
      ...session,
      subTasks: [...session.subTasks, 'task.teaching', 'teaching.view'],
    });
    await nav;
    const notices = {
      unread: 1,
      items: [
        {
          id: 'n-9',
          surface: 'MEMBER',
          category: 'APPROVAL',
          titleKey: 'NTF.LEAVE_REQUESTED',
          params: { name: 'Asha Rao' },
          title: 'Leave request from Asha Rao',
          body: 'Fever',
          link: '/teacher/student-leaves',
          read: false,
          at: hoursAgo(1),
        },
      ],
      nextCursor: null,
    };
    (await request((u) => u.startsWith('/api/v1/console/notifications?'))).flush(notices);
    (await request((u) => u.startsWith('/api/v1/console/approvals?'))).flush(list);
    for (let i = 0; i < 3; i++) await tick();
    harness.detectChanges();
    const bell = document.querySelector('.c-top button[title="Notifications"]') as HTMLElement;
    expect(bell.querySelector('.badge')?.textContent?.trim()).toBe('1');
    bell.click();
    (await request((u) => u.startsWith('/api/v1/console/notifications?'))).flush(notices);
    await tick();
    harness.detectChanges();
    const drawer = [...document.querySelectorAll('.drawer')].find(
      (d) => d.querySelector('.sh-h h3')?.textContent === 'Notifications',
    ) as HTMLElement;
    const item = drawer.querySelector('.list button.li') as HTMLElement;
    expect(item.querySelector('.li-t')?.textContent).toBe('Leave request from Asha Rao');
    item.click();
    const read = await request((u) => u === '/api/v1/console/notifications/read', 'POST');
    expect(read.request.body).toEqual({ ids: ['n-9'] });
    read.flush(null, { status: 204, statusText: 'No Content' });
    const router = TestBed.inject(Router);
    for (let i = 0; i < 200 && router.url !== '/console/teaching-leave'; i++) await tick();
    expect(router.url).toBe('/console/teaching-leave');
  });

  it('shows the back-office bell with the operators’ notices (COM-035, client 2026-10-21)', async () => {
    const harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/backoffice/approvals');
    (await request((u) => u === '/api/v1/ops/session')).flush({
      name: 'ARJUN MEHTA',
      email: 'arjun@campusone.example',
      role: { code: 'PLATFORM_ADMIN', name: 'Platform Administrator' },
      subTasks: ['home.view', 'mkr.decide', 'task.home', 'task.platform'],
      preferredLang: 'en',
    });
    await nav;
    const first = await request((u) => u.startsWith('/api/v1/ops/notifications?'));
    expect(first.request.urlWithParams).toContain('limit=12');
    first.flush({
      unread: 2,
      items: [
        {
          id: 'n-1',
          surface: 'OPS',
          category: 'APPROVAL',
          titleKey: 'NTF.APPROVAL_RAISED',
          params: { no: 'APR-0001' },
          title: 'APR-0001 is waiting for your decision',
          body: 'Date of birth for Asha Rao',
          link: '/backoffice/approvals?open=a-1',
          read: false,
          at: hoursAgo(1),
        },
      ],
      nextCursor: null,
    });
    for (let i = 0; i < 3; i++) await tick();
    harness.detectChanges();
    const bell = document.querySelector('.c-top button[title="Notifications"]') as HTMLElement;
    expect(bell.querySelector('.badge')?.textContent?.trim()).toBe('2');
    expect(document.querySelector('.c-top .op-flag')?.textContent).toContain('Operator');
  });

  it('maps app links to web pages by the grants held', () => {
    const teacher = ['teaching.view'];
    expect(webLinkOf('/teacher/student-leaves', teacher)).toBe('/console/teaching-leave');
    expect(webLinkOf('/teacher/homework/hw-1', teacher)).toBe('/console/teaching-homework');
    expect(webLinkOf('/teacher/my-leave', teacher)).toBe('/console/teaching-my-leave');
    expect(webLinkOf('/messages/c-1', teacher)).toBe('/console/teaching-messages');
    expect(webLinkOf('/principal/approvals', ['principal.view'])).toBe('/console/principal-leave');
    expect(webLinkOf('/transactions/RPE1', ['business.view'])).toBe(
      '/console/business-collections',
    );
    // Anything else opens the person's notices; web addresses are kept; nothing for no grant.
    expect(webLinkOf('/fees', teacher)).toBe('/console/teaching-notices');
    expect(webLinkOf('/console/approvals?open=a-1', [])).toBe('/console/approvals?open=a-1');
    expect(webLinkOf('/teacher/student-leaves', [])).toBeNull();
    expect(webLinkOf(null, teacher)).toBeNull();
  });

  it('uses the back-office endpoints for operators', async () => {
    const harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/backoffice/approvals');
    (await request((u) => u === '/api/v1/ops/session')).flush({
      name: 'ARJUN MEHTA',
      email: 'arjun@campusone.example',
      role: { code: 'PLATFORM_ADMIN', name: 'Platform Administrator' },
      subTasks: ['home.view', 'mkr.decide', 'task.home', 'task.platform'],
      preferredLang: 'en',
    });
    await nav;
    const q = await request((u) => u.startsWith('/api/v1/ops/approvals?'));
    expect(q.request.urlWithParams).toContain('status=PENDING');
    q.flush({ ...list, items: [] });
    for (let i = 0; i < 3; i++) await tick();
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.querySelectorAll('.kpi')[1]?.textContent).toContain('Platform Administrator');
    expect(el.textContent).toContain('Nothing waiting for a decision');
    const menu = [...el.querySelectorAll('.c-nav .nv-item, .c-nav .nv-solo')].map((a) => a.textContent?.trim());
    expect(menu).toContain('Approvals');
  });
});
