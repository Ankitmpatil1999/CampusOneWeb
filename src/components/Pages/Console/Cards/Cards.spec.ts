import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import type { MemberRow } from '../Members/members.api';
import { detailOf, faceLine, holdersOf, issueReasonText, maskToken } from './card-format';
import type { Card } from './cards.api';

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
    'task.cards',
    'cards.view',
    'cards.edit',
    'members.view',
    'readers.view',
  ],
  preferredLang: 'en',
  ...over,
});

const card = (over: Partial<Card> = {}): Card => ({
  id: 'c-1',
  member: { id: 's-1', name: 'Aarav Hegde' },
  token: 'NFC••••0357',
  status: 'ACTIVE',
  issueReason: 'NEW_REGISTRATION',
  reissueCount: 0,
  statusReason: null,
  blockedAt: null,
  issuedAt: '2026-06-03T05:00:00.000Z',
  lastTapAt: null,
  ...over,
});

const member = (id: string, name: string, over: Partial<MemberRow> = {}): MemberRow => ({
  id,
  memberNo: `TVPS-${id}`,
  name,
  kind: 'STUDENTS',
  userType: { id: 'ut-s', name: 'Student', category: 'STUDENT' },
  department: { id: 'd-1', name: 'Primary' },
  admissionNo: `TVPS/2019/${id}`,
  employeeNo: null,
  grade: { class: 'Grade 7', section: 'B' },
  mobile: null,
  linked: true,
  status: 'ACTIVE',
  wallet: null,
  pending: { suspension: false, delink: false },
  customFields: {},
  ...over,
});

const cards = () => ({
  items: [
    card(),
    card({
      id: 'c-2',
      member: { id: 's-2', name: 'Diya Joshi' },
      token: 'NFC••••0412',
      status: 'INACTIVE',
      statusReason: 'Reported lost',
      blockedAt: '2026-09-20T05:00:00.000Z',
    }),
    card({
      id: 'c-3',
      member: { id: 't-1', name: 'RAVI KULKARNI' },
      token: 'NFC••••0777',
      issueReason: 'LOST',
      reissueCount: 1,
      issuedAt: '2026-07-01T05:00:00.000Z',
    }),
    card({
      id: 'c-0',
      member: { id: 't-1', name: 'RAVI KULKARNI' },
      token: 'NFC••••0100',
      status: 'INACTIVE',
      statusReason: 'Re-issue: lost',
      blockedAt: '2026-06-30T05:00:00.000Z',
      issuedAt: '2026-01-01T05:00:00.000Z',
    }),
  ],
  nextCursor: null,
});

const students = [
  member('s-1', 'Aarav Hegde'),
  member('s-2', 'Diya Joshi', { grade: { class: 'Grade 5', section: 'A' } }),
  member('s-3', 'Kiran Rao', { grade: { class: 'Nursery', section: 'A' } }),
  member('s-4', 'Old Student', { status: 'INACTIVE' }),
];
const staff = [
  member('t-1', 'RAVI KULKARNI', {
    kind: 'STAFF',
    userType: { id: 'ut-t', name: 'Teacher', category: 'TEACHER' },
    department: { id: 'd-2', name: 'Middle school' },
    admissionNo: null,
    employeeNo: 'EMP0009',
    grade: null,
  }),
];

const page = (items: MemberRow[]) => ({
  year: null,
  columns: [],
  filters: [],
  counts: { tabs: {}, statuses: {} },
  items,
  nextCursor: null,
});

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const button = (root: ParentNode, label: string) =>
  [...root.querySelectorAll('button')].find((b) => text(b) === label) as HTMLButtonElement;
const pill = (root: ParentNode, start: string) =>
  [...root.querySelectorAll<HTMLButtonElement>('.pill')].find((b) => text(b).startsWith(start))!;
const toasts = () => text(document.querySelector('.toasts'));

describe('console NFC cards (ATT-004…007)', () => {
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
    const nav = harness.navigateByUrl('/console/cards');
    (await request((u) => u === '/api/v1/console/session')).flush(s);
    await nav;
    (await request((u) => u === '/api/v1/console/cards')).flush(cards());
    (await request((u) => u.startsWith('/api/v1/console/members?kind=STUDENTS'))).flush(
      page(students),
    );
    (await request((u) => u.startsWith('/api/v1/console/members?kind=STAFF'))).flush(page(staff));
    (await request((u) => u === '/api/v1/console/readers?purpose=CARD_ISSUE&status=ACTIVE')).flush({
      items: [{ id: 'r-1', name: 'Card desk' }],
    });
    await settle(5);
    return harness.routeNativeElement as HTMLElement;
  }

  async function confirmWith(reason: string) {
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    const t = dlg.querySelector('textarea') as HTMLTextAreaElement;
    t.value = reason;
    t.dispatchEvent(new Event('input'));
    await settle(1);
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
  }

  it('groups the cards by member and formats them', () => {
    const h = holdersOf(cards().items);
    expect(h).toHaveLength(3);
    const ravi = h.find((x) => x.memberId === 't-1')!;
    expect(ravi.name).toBe('Ravi Kulkarni');
    expect(ravi.current.id).toBe('c-3');
    expect(ravi.previous.map((c) => c.id)).toEqual(['c-0']);
    expect(maskToken('NFC••••0357')).toBe('••••0357');
    expect(issueReasonText('NEW_REGISTRATION')).toBe('New card');
    expect(issueReasonText('LOST')).toBe('Re-issue · Lost');
    expect(detailOf(students[0])).toBe('Grade 7 B');
    expect(detailOf(staff[0])).toBe('Teacher · Middle school');
    expect(faceLine(students[0])).toBe('7 B');
  });

  it('lists the card register with its figures and the members without a card', async () => {
    const el = await open();
    const kpis = [...el.querySelectorAll('.kpi')];
    expect(kpis.map((k) => text(k.querySelector('.k-v')))).toEqual(['2', '1', '1', '2']);
    const rows = el.querySelectorAll('#cards-table tbody tr');
    expect(rows).toHaveLength(3);
    expect(text(rows[0])).toContain('Aarav Hegde');
    expect(text(rows[0])).toContain('Grade 7 B');
    expect(text(rows[0])).toContain('••••0357');
    expect(text(rows[2])).toContain('Ravi Kulkarni');
    expect(text(rows[2])).toContain('Teacher · Middle school');

    pill(el, 'Inactive').click();
    await settle();
    expect(el.querySelectorAll('#cards-table tbody tr')).toHaveLength(1);
    expect(text(el.querySelector('#cards-table tbody'))).toContain('Diya Joshi');

    pill(el, 'Without a card').click();
    await settle();
    const none = el.querySelectorAll('#cards-table tbody tr');
    // Diya's card is inactive, Kiran has none; the inactive member isn't listed.
    expect([...none].map((r) => text(r.querySelector('.cell-t')))).toEqual([
      'Diya Joshi',
      'Kiran Rao',
    ]);
    expect(text(none[1])).toContain('No card');

    pill(el, 'Without a card').click();
    pill(el, 'All cards').click();
    pill(el, 'Staff').click();
    await settle();
    expect(el.querySelectorAll('#cards-table tbody tr')).toHaveLength(1);
  });

  it('blocks and reactivates a card with a reason (ATT-006)', async () => {
    const el = await open();
    const row = el.querySelectorAll('#cards-table tbody tr')[0] as HTMLElement;
    button(row, 'Block').click();
    await confirmWith('Reported lost at the bus stop');
    const block = await request((u) => u === '/api/v1/console/cards/c-1/status', 'POST');
    expect(block.request.body).toEqual({
      action: 'BLOCK',
      reason: 'Reported lost at the bus stop',
    });
    block.flush(card({ status: 'INACTIVE', statusReason: 'Reported lost at the bus stop' }));
    await settle();
    expect(toasts()).toContain('Card blocked');
    const after = cards();
    after.items[0] = card({ status: 'INACTIVE', statusReason: 'Reported lost at the bus stop' });
    (await request((u) => u === '/api/v1/console/cards')).flush(after);
    await settle();

    // The drawer of the inactive card reactivates it.
    (el.querySelectorAll('#cards-table tbody tr')[0] as HTMLElement).click();
    await settle();
    const drawer = document.querySelector('.drawer') as HTMLElement;
    expect(text(drawer)).toContain('Reported lost at the bus stop');
    expect(text(drawer.querySelector('.cp-nfc'))).toContain('TVPS · 7 B');
    button(drawer, 'Reactivate').click();
    await confirmWith('Found and handed back');
    const react = await request((u) => u === '/api/v1/console/cards/c-1/status', 'POST');
    expect(react.request.body).toEqual({ action: 'REACTIVATE', reason: 'Found and handed back' });
    react.flush(card());
    await settle();
    expect(toasts()).toContain('Card reactivated');
  });

  it('re-issues a card: reason, then the write window on the card-issue reader (ATT-007)', async () => {
    const el = await open();
    (el.querySelectorAll('#cards-table tbody tr')[2] as HTMLElement).click();
    await settle();
    const drawer = document.querySelector('.drawer') as HTMLElement;
    expect(text(drawer)).toContain('Previous cards kept on record: ••••0100');
    expect(text(drawer)).toContain('Re-issue · Lost');
    button(drawer, 'Re-issue').click();
    await settle();
    const modal = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    expect(text(modal)).toContain('Current card ••••0777 · re-issued 1 time');
    (modal.querySelector('#cr-go') as HTMLButtonElement).click();
    await settle();
    expect(text(modal)).toContain('Choose why the card is being re-issued');
    (modal.querySelector('#cr-why-b') as HTMLButtonElement).click();
    await settle();
    ([...document.querySelectorAll('.dd-opt')] as HTMLButtonElement[])
      .find((o) => text(o) === 'Damaged')!
      .click();
    await settle();
    (modal.querySelector('#cr-go') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/console/cards/c-3/reissue', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({ reasonCode: 'DAMAGED' });
    post.flush({
      pairingForWrite: {
        code: 'WXYZ-2345',
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      },
    });
    await settle();
    expect(text(modal.querySelector('#cr-done'))).toContain('WXYZ-2345');
    expect(text(modal)).toContain('On the card-issue reader (Card desk), find Ravi Kulkarni');
    expect(toasts()).toContain('New card authorised');
  });

  it('issues a card: find the member, write it on the reader, verify (ATT-004, ATT-005)', async () => {
    const el = await open();
    (el.querySelector('#cards-issue') as HTMLButtonElement).click();
    await settle();
    const drawer = document.querySelector('.drawer') as HTMLElement;
    const q = drawer.querySelector('#ci-q') as HTMLInputElement;
    q.value = 'ra';
    q.dispatchEvent(new Event('input'));
    await settle();
    const res = [...drawer.querySelectorAll('#ci-res .li')];
    expect(res.map((r) => text(r.querySelector('.li-t')))).toEqual([
      'Aarav Hegde',
      'Kiran Rao',
      'Ravi Kulkarni',
    ]);
    expect(text(res[1])).toContain('No card');
    expect((drawer.querySelector('#ci-go') as HTMLButtonElement).disabled).toBe(true);

    (res[2] as HTMLButtonElement).click();
    await settle();
    expect(text(drawer.querySelector('#ci-sel'))).toContain('Already has an active card');

    q.value = 'kiran';
    q.dispatchEvent(new Event('input'));
    await settle();
    (drawer.querySelector('#ci-res .li') as HTMLButtonElement).click();
    await settle();
    expect(text(drawer.querySelector('#ci-steps'))).toContain(
      'On the card-issue reader (Card desk), find Kiran Rao',
    );
    (drawer.querySelector('#ci-go') as HTMLButtonElement).click();
    const first = await request((u) => u.startsWith('/api/v1/console/cards?q=Kiran'));
    first.flush({ items: [], nextCursor: null });
    await settle();
    expect(text(drawer)).toContain('No card has been written for Kiran Rao yet');
    (drawer.querySelector('#ci-go') as HTMLButtonElement).click();
    (await request((u) => u.startsWith('/api/v1/console/cards?q=Kiran'))).flush({
      items: [card({ id: 'c-9', member: { id: 's-3', name: 'Kiran Rao' }, token: 'NFC••••0900' })],
      nextCursor: null,
    });
    await settle();
    expect(toasts()).toContain('Card issued');
    expect(toasts()).toContain('••••0900 verified');
  });
});
