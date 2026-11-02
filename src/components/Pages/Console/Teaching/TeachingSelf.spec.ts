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
import { addDays, today } from '../Structure/academic-format';
import type {
  AttendanceMonth,
  Conversations,
  MyBus,
  MyCalendar,
  MyLeave,
  MyLeaves,
  Notice,
  Notifications,
  Thread,
} from './me.api';

const tick = () => new Promise((r) => setTimeout(r, 0));
/** The visible words, with a space between elements. */
function text(el: Node | null | undefined): string {
  const parts: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) parts.push(n.textContent ?? '');
    else n.childNodes.forEach(walk);
    if (n.nodeType === Node.ELEMENT_NODE) parts.push(' ');
  };
  if (el) walk(el);
  return parts.join('').replace(/\s+/g, ' ').trim();
}
const toasts = () => text(document.querySelector('.toasts'));

async function request(match: (url: string) => boolean, method = 'GET') {
  const ctl = TestBed.inject(HttpTestingController);
  for (let i = 0; i < 80; i++) {
    const found = ctl.match((r) => match(r.urlWithParams) && r.method === method);
    if (found[0]) return found[0];
    await tick();
  }
  throw new Error(`no ${method} request`);
}
function serve(routes: Readonly<Record<string, unknown>>) {
  const ctl = TestBed.inject(HttpTestingController);
  const hit = (r: { method: string; url: string }) => r.method === 'GET' && r.url in routes;
  for (const r of ctl.match(hit) as TestRequest[]) r.flush(routes[r.request.url] as object);
}

const session = {
  name: 'MEENA RAO',
  email: 'meena@tvps.example.in',
  institution: {
    id: 'i-1',
    name: 'Tunga Valley Public School',
    shortName: 'TVPS',
    city: 'Shivamogga',
  },
  roles: [{ code: 'TEACHER', name: 'Teacher', readOnly: false }],
  subTasks: ['task.teaching', 'teaching.view', 'teaching.homework', 'teaching.announce'],
  preferredLang: 'en',
};

const leave = (over: Partial<MyLeave> = {}): MyLeave => ({
  id: 'l-1',
  reference: 'TL-000004',
  type: 'CASUAL',
  typeLabel: 'Casual leave',
  from: '2026-10-20',
  to: '2026-10-21',
  days: 2,
  reason: 'Family function in Mysuru',
  appliedAt: '2026-10-10T05:00:00.000Z',
  needsCoordinator: true,
  coordinator: null,
  final: null,
  state: 'PENDING',
  version: 1,
  ...over,
});
const leaves = (items: MyLeave[]): MyLeaves => ({
  year: { id: 'y-1', label: '2026-27' },
  reviewedBy: 'COORDINATOR_THEN_PRINCIPAL',
  balances: [
    { type: 'CASUAL', label: 'Casual leave', total: 12, used: 3, pending: 2, left: 9 },
    { type: 'MEDICAL', label: 'Medical leave', total: 10, used: 0, pending: 0, left: 10 },
    { type: 'EARNED', label: 'Earned leave', total: 0, used: 0, pending: 0, left: 0 },
  ],
  items,
});
const notice = (over: Partial<Notice> = {}): Notice => ({
  id: 'n-1',
  code: 'ANN-2026-0012',
  title: 'Staff meeting on Friday',
  text: 'All teachers meet in the hall at 3:30.',
  category: { code: 'GEN', label: 'General', colour: null },
  important: true,
  ackRequired: true,
  acknowledged: false,
  acknowledgedAt: null,
  author: 'Lakshmi Rao',
  source: 'SCHOOL',
  classSection: null,
  sentAt: '2026-10-11T04:00:00.000Z',
  ...over,
});
const bell = (): Notifications => ({
  unread: 1,
  items: [
    {
      id: 'b-1',
      category: 'ACCOUNT',
      title: 'Leave approved',
      body: 'Casual leave · 20 Oct',
      link: null,
      read: false,
      at: '2026-10-11T06:00:00.000Z',
    },
  ],
  nextCursor: null,
});

describe('the teacher’s own pages on the web (client 2026-10-12)', () => {
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
  async function open(path: string) {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl(path);
    (await request((u) => u === '/api/v1/console/session')).flush(session);
    await nav;
    await settle();
    serve({ '/api/v1/languages': { items: [] } });
    return harness.routeNativeElement as HTMLElement;
  }
  const type = (sel: string, v: string, ev = 'input') => {
    const input = document.querySelector(sel) as HTMLInputElement;
    input.value = v;
    input.dispatchEvent(new Event(ev));
  };
  const confirm = async () => {
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    await settle(2);
  };

  it('applies for my leave with my balances, and cancels a request no one has reviewed (ACA-057…059)', async () => {
    const el = await open('/console/teaching-my-leave');
    const get = await request((u) => u === '/api/v1/me/staff-leaves');
    // The app's own route, reached with the console session.
    expect(get.request.headers.get('X-CampusOne-Surface')).toBe('console');
    get.flush(leaves([leave()]));
    await settle();
    expect(text(el.querySelector('#ml-balances'))).toContain('Casual leave 9 days left');
    expect(text(el.querySelector('#ml-balances'))).toContain('3 used · 2 pending · 12 a year');
    expect(text(el.querySelector('#ml-0'))).toContain('With the coordinator');
    expect(text(el.querySelector('#ml-0'))).toContain('20 Oct 2026 to 21 Oct 2026');

    (el.querySelector('#ml-new') as HTMLButtonElement).click();
    await settle();
    expect(text(document.querySelector('#ml-form'))).toContain(
      'Your coordinator reviews the request first, then the principal decides.',
    );
    (document.querySelector('#ml-send') as HTMLButtonElement).click();
    await settle(1);
    const form = text(document.querySelector('#ml-form'));
    expect(form).toContain('Choose the leave type.');
    expect(form).toContain('Write the reason in 5 to 250 characters.');
    (document.querySelector('#ml-type-b') as HTMLButtonElement).click();
    await settle(2);
    ([...document.querySelectorAll('.dd-menu .dd-opt')] as HTMLButtonElement[])
      .find((b) => text(b) === 'Medical leave')!
      .click();
    const from = addDays(today(), 2);
    type('#ml-from', from, 'change');
    type('#ml-reason', 'Minor surgery and rest');
    await settle(1);
    (document.querySelector('#ml-send') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/me/staff-leaves', 'POST');
    expect(post.request.headers.has('Idempotency-Key')).toBe(true);
    expect(post.request.body).toEqual({
      type: 'MEDICAL',
      from,
      to: from,
      reason: 'Minor surgery and rest',
    });
    post.flush(leave({ id: 'l-2', type: 'MEDICAL', from, to: from, days: 1 }), {
      status: 201,
      statusText: 'Created',
    });
    (await request((u) => u === '/api/v1/me/staff-leaves')).flush(
      leaves([leave({ id: 'l-2', type: 'MEDICAL', from, to: from, days: 1 }), leave()]),
    );
    await settle();
    expect(toasts()).toContain('Leave request sent');

    (el.querySelector('#ml-cancel-1') as HTMLButtonElement).click();
    await confirm();
    const cancel = await request((u) => u === '/api/v1/me/staff-leaves/l-1/cancellation', 'POST');
    cancel.flush(leave({ state: 'CANCELLED' }));
    (await request((u) => u === '/api/v1/me/staff-leaves')).flush(
      leaves([
        leave({
          state: 'CANCELLED',
          final: { status: 'CANCELLED', by: null, at: null, remarks: null },
        }),
      ]),
    );
    await settle();
    expect(toasts()).toContain('Leave request cancelled');
    expect(text(el.querySelector('#ml-0'))).toContain('Cancelled');
    expect(el.querySelector('#ml-cancel-0')).toBeNull();
  });

  it('shows school notices to acknowledge and my notifications to mark read (COM-011…015)', async () => {
    const el = await open('/console/teaching-notices');
    (await request((u) => u === '/api/v1/me/announcements')).flush({
      unacknowledged: 1,
      items: [
        notice(),
        notice({ id: 'n-2', title: 'Diwali holidays', important: false, ackRequired: false }),
      ],
      nextCursor: null,
    });
    (await request((u) => u === '/api/v1/me/notifications?limit=30')).flush(bell());
    await settle();
    expect(text(el.querySelector('#nt-tab-notices'))).toBe('School notices 1');
    expect(text(el.querySelector('#nt-tab-bell'))).toBe('Notifications 1');
    expect(text(el.querySelector('#nt-0'))).toContain('Staff meeting on Friday Important General');
    expect(el.querySelector('#nt-ack-1')).toBeNull();
    (el.querySelector('#nt-ack-0') as HTMLButtonElement).click();
    const ack = await request((u) => u === '/api/v1/me/announcements/n-1/acknowledgement', 'POST');
    ack.flush(notice({ acknowledged: true, acknowledgedAt: '2026-10-12T05:00:00.000Z' }));
    await settle();
    expect(toasts()).toContain('Notice acknowledged');
    expect(text(el.querySelector('#nt-0'))).toContain('Acknowledged');
    expect(text(el.querySelector('#nt-tab-notices'))).toBe('School notices');

    (el.querySelector('#nt-tab-bell') as HTMLButtonElement).click();
    await settle(1);
    expect(text(el.querySelector('#nt-n-0'))).toContain('Leave approved Casual leave · 20 Oct');
    (el.querySelector('#nt-read-all') as HTMLButtonElement).click();
    const read = await request((u) => u === '/api/v1/me/notifications/read', 'POST');
    expect(read.request.body).toEqual({ all: true });
    read.flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    expect(text(el.querySelector('#nt-tab-bell'))).toBe('Notifications');
    expect(el.querySelector('#nt-read-all')).toBeNull();
  });

  const conversations = (): Conversations => ({
    counts: { active: 1, archived: 0, unreadConversations: 1 },
    items: [
      {
        conversationId: 'c-1',
        with: {
          profileId: 'p-9',
          name: 'Prakash Hegde',
          roleLabel: 'Parent',
          group: 'PARENT',
          classSection: null,
          // Whose parent this is (client 2026-10-23).
          children: [{ name: 'Kavya Hegde', classSection: 'Grade 6 A', relation: 'FATHER' }],
        },
        lastMessage: {
          text: 'Is the test on Monday?',
          mine: false,
          status: 'DELIVERED',
          at: '2026-10-11T09:00:00.000Z',
        },
        unread: 1,
        archived: false,
        canSend: true,
      },
    ],
    nextCursor: null,
  });
  const thread = (): Thread => ({
    conversation: {
      id: 'c-1',
      with: {
        profileId: 'p-9',
        name: 'Prakash Hegde',
        roleLabel: 'Parent',
        group: 'PARENT',
        classSection: null,
        children: [{ name: 'Kavya Hegde', classSection: 'Grade 6 A', relation: 'FATHER' }],
      },
      archived: false,
      canSend: true,
    },
    items: [
      {
        id: 'm-1',
        mine: false,
        text: 'Is the test on Monday?',
        status: 'READ',
        at: '2026-10-11T09:00:00.000Z',
        deliveredAt: '2026-10-11T09:00:00.000Z',
        readAt: '2026-10-12T04:00:00.000Z',
      },
    ],
    olderCursor: null,
  });

  it('reads and answers a conversation, and starts a new one with a contact (COM-016…021)', async () => {
    const el = await open('/console/teaching-messages');
    (await request((u) => u === '/api/v1/me/conversations?archived=false&limit=50')).flush(
      conversations(),
    );
    await settle();
    // A parent comes with their children (client 2026-10-23).
    expect(text(el.querySelector('#msg-c-0'))).toContain(
      'Prakash Hegde Father of Kavya Hegde (Grade 6 A) Is the test on Monday?',
    );
    (el.querySelector('#msg-c-0') as HTMLButtonElement).click();
    (await request((u) => u === '/api/v1/me/conversations/c-1/messages')).flush(thread());
    await settle();
    expect(text(el.querySelector('#msg-thread'))).toContain(
      'Prakash Hegde Parent · Father of Kavya Hegde (Grade 6 A)',
    );
    expect(text(el.querySelector('#msg-body'))).toContain('Is the test on Monday?');
    type('#msg-text', 'Yes, on Monday in the first period.');
    await settle(1);
    (el.querySelector('#msg-send') as HTMLButtonElement).click();
    const send = await request((u) => u === '/api/v1/me/conversations/c-1/messages', 'POST');
    expect(send.request.headers.has('Idempotency-Key')).toBe(true);
    expect(send.request.body).toEqual({ text: 'Yes, on Monday in the first period.' });
    send.flush(
      {
        conversationId: 'c-1',
        message: {
          id: 'm-2',
          mine: true,
          text: 'x',
          status: 'DELIVERED',
          at: null,
          deliveredAt: null,
          readAt: null,
        },
      },
      { status: 201, statusText: 'Created' },
    );
    (await request((u) => u === '/api/v1/me/conversations?archived=false&limit=50')).flush(
      conversations(),
    );
    (await request((u) => u === '/api/v1/me/conversations/c-1/messages')).flush(thread());
    await settle();
    expect((el.querySelector('#msg-text') as HTMLTextAreaElement).value).toBe('');

    // A new message: the people the school's rules allow.
    (el.querySelector('#msg-new') as HTMLButtonElement).click();
    await settle();
    (await request((u) => u.startsWith('/api/v1/me/contacts'))).flush({
      allowed: ['STUDENT', 'PARENT', 'TEACHER'],
      notAllowed: ['STAFF', 'PRINCIPAL'],
      perMinute: 30,
      maxChars: 4000,
      groups: [
        {
          group: 'PARENT',
          total: 1,
          items: [
            {
              profileId: 'p-7',
              name: 'Shobha Nayak',
              roleLabel: 'Parent',
              sub: null,
              children: [
                { name: 'Kavya Nayak', classSection: 'Grade 6 A', relation: 'MOTHER' },
                { name: 'Rohan Nayak', classSection: 'Grade 2 B', relation: 'MOTHER' },
              ],
              conversationId: null,
            },
          ],
        },
      ],
    });
    await settle();
    expect(text(document.querySelector('#msg-to'))).toContain(
      'Parents · 1 Shobha Nayak Parent · Mother of Kavya Nayak (Grade 6 A), Rohan Nayak (Grade 2 B)',
    );
    (document.querySelector('#msg-to .msg-contact') as HTMLButtonElement).click();
    await settle();
    expect(text(el.querySelector('#msg-thread'))).toContain(
      'Shobha Nayak Parent · Mother of Kavya Nayak (Grade 6 A), Rohan Nayak (Grade 2 B)',
    );
    expect(text(el.querySelector('#msg-thread'))).toContain(
      'Write your first message to Shobha Nayak.',
    );
    type('#msg-text', 'Kavya did very well in the test.');
    await settle(1);
    (el.querySelector('#msg-send') as HTMLButtonElement).click();
    const start = await request((u) => u === '/api/v1/me/conversations', 'POST');
    expect(start.request.body).toEqual({
      recipientProfileId: 'p-7',
      text: 'Kavya did very well in the test.',
    });
  });

  // 2026-10-14: "Chat messages don't update in real time; I have to refresh."
  it('shows new messages in the open conversation without a refresh', async () => {
    // The page's 5-second check, run by the test (a visibilitychange would also wake the session
    // keeper); any other interval runs as usual.
    const checks: (() => void)[] = [];
    const real = globalThis.setInterval;
    const spy = vi.spyOn(globalThis, 'setInterval').mockImplementation(((
      fn: () => void,
      ms?: number,
    ) => {
      if (ms !== 5_000) return real(fn, ms);
      checks.push(fn);
      return 0;
    }) as typeof setInterval);
    try {
      const el = await open('/console/teaching-messages');
      (await request((u) => u === '/api/v1/me/conversations?archived=false&limit=50')).flush(
        conversations(),
      );
      await settle();
      (el.querySelector('#msg-c-0') as HTMLButtonElement).click();
      (await request((u) => u === '/api/v1/me/conversations/c-1/messages')).flush({
        ...thread(),
        olderCursor: 'cur-1',
      });
      await settle();
      // A check, every few seconds, finds a new message.
      expect(checks).toHaveLength(1);
      checks[0]!();
      const reply = {
        id: 'm-3',
        mine: false,
        text: 'Thank you, we will prepare.',
        status: 'READ',
        at: '2026-10-12T05:00:00.000Z',
        deliveredAt: '2026-10-12T05:00:00.000Z',
        readAt: '2026-10-12T05:00:00.000Z',
      };
      (await request((u) => u === '/api/v1/me/conversations/c-1/messages')).flush({
        ...thread(),
        items: [...thread().items, reply],
        olderCursor: 'cur-2',
      });
      const fresh = conversations();
      (await request((u) => u === '/api/v1/me/conversations?archived=false&limit=50')).flush({
        ...fresh,
        items: [
          {
            ...fresh.items[0]!,
            lastMessage: { text: reply.text, mine: false, status: 'READ', at: reply.at },
            unread: 1,
          },
        ],
      });
      await settle();
      expect(text(el.querySelector('#msg-body'))).toContain(
        'Is the test on Monday? 11 Oct 2026 Thank you, we will prepare.',
      );
      // The open conversation's list row: the new message, and nothing unread.
      expect(text(el.querySelector('#msg-c-0'))).toBe(
        'Prakash Hegde Father of Kavya Hegde (Grade 6 A) Thank you, we will prepare. 12 Oct 2026',
      );
      // Older messages are still fetched from before the oldest shown.
      (el.querySelector('#msg-older') as HTMLButtonElement).click();
      expect(
        (await request((u) => u.startsWith('/api/v1/me/conversations/c-1/messages?'))).request
          .urlWithParams,
      ).toContain('before=cur-1');
    } finally {
      spy.mockRestore();
    }
  });

  it('shows my month of attendance with holidays and approved leave (ATT-023)', async () => {
    const el = await open('/console/teaching-my-attendance');
    const month = today().slice(0, 7);
    const get = await request((u) => u === `/api/v1/me/attendance?month=${month}`);
    const day = (n: number, over: object = {}) => ({
      date: `${month}-${String(n).padStart(2, '0')}`,
      status: null,
      checkInAt: null,
      checkOutAt: null,
      holiday: null,
      sunday: false,
      onApprovedLeave: false,
      future: false,
      ...over,
    });
    const data: AttendanceMonth = {
      month,
      summary: {
        schoolDays: 3,
        present: 1,
        late: 0,
        halfDay: 0,
        absent: 0,
        notMarked: 0,
        percentage: 66.7,
      },
      items: [
        day(1, { status: 'PRESENT', checkInAt: '2026-10-01T03:10:00.000Z' }),
        day(2, { holiday: 'Gandhi Jayanti' }),
        day(3, { onApprovedLeave: true }),
        // A Sunday shows a check-in made on it (client 2026-10-25); an empty one stays blank.
        day(4, { sunday: true, status: 'LATE', checkInAt: '2026-10-04T08:21:00.000Z' }),
        day(5, { sunday: true }),
      ] as AttendanceMonth['items'],
    };
    get.flush(data);
    await settle();
    expect(text(el.querySelector('#ma-kpis'))).toContain('Attendance 66.7%');
    expect(text(el.querySelector(`#ma-${month}-01`))).toBe('1 Present');
    expect(text(el.querySelector(`#ma-${month}-02`))).toBe('2 Gandhi Jayanti');
    expect(text(el.querySelector(`#ma-${month}-03`))).toBe('3 On leave');
    expect(text(el.querySelector(`#ma-${month}-04`))).toBe('4 Late');
    expect(text(el.querySelector(`#ma-${month}-05`))).toBe('5');
    // This month is the latest; the previous one loads.
    expect((el.querySelector('#ma-next') as HTMLButtonElement).disabled).toBe(true);
    (el.querySelector('#ma-prev') as HTMLButtonElement).click();
    const prev = await request((u) => u.startsWith('/api/v1/me/attendance?month='));
    expect(prev.request.params.get('month')).not.toBe(month);
  });

  it('shows the school calendar by month and my school bus (ACA-066, TRN-034)', async () => {
    const el = await open('/console/teaching-calendar');
    const month = today().slice(0, 7);
    const cal = await request((u) => u.startsWith('/api/v1/me/calendar'));
    expect(cal.request.params.get('from')).toBe(`${month}-01`);
    const d = `${month}-15`;
    const data: MyCalendar = {
      year: { id: 'y-1', label: '2026-27' },
      from: `${month}-01`,
      to: `${month}-28`,
      items: [
        {
          id: 'e-1',
          type: 'Event',
          holidayType: null,
          title: 'Sports day',
          description: 'On the main ground',
          allDay: true,
          startTime: null,
          endTime: null,
          location: 'Ground',
          colour: null,
          occurrences: [{ start: d, end: d }],
        },
      ],
    };
    cal.flush(data);
    const bus: MyBus = {
      allocation: {
        route: { code: 'R3', name: 'Vinobanagar – School' },
        stop: { id: 's-1', name: 'Ashok Nagar', landmark: 'Near the temple' },
        from: '2026-06-01',
        to: '2027-03-31',
      },
      trips: [],
    };
    (await request((u) => u === '/api/v1/me/transport')).flush(bus);
    await settle();
    expect(text(el.querySelector(`#cal-${d}`))).toContain('Sports day · Event All day · Ground');
    expect(text(el.querySelector('#cal-bus'))).toContain(
      'R3 Vinobanagar – School · stop: Ashok Nagar',
    );
    expect(text(el.querySelector('#cal-bus'))).toContain('No trips today.');
  });
});
