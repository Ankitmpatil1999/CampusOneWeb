import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import { translate } from '../../../Utils/translate';
import type { Announcement, AnnouncementList } from './announcements.api';

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

const session = (subTasks = ['comms.view', 'comms.send'], ro = false) => ({
  name: 'PRAKASH SHETTY',
  email: 'prakash.shetty@tvps.example.in',
  institution: {
    id: 'i-1',
    name: 'Tunga Valley Public School',
    shortName: 'TVPS',
    city: 'Shivamogga',
  },
  roles: [
    ro
      ? { code: 'MANAGEMENT', name: 'Management', readOnly: true }
      : { code: 'INSTITUTION_ADMIN', name: 'Institution Administrator', readOnly: false },
  ],
  subTasks: ['home.view', 'task.home', 'task.comms', ...subTasks],
  preferredLang: 'en',
});
const year = {
  id: 'y-1',
  label: '2026-27',
  startsOn: '2026-04-01',
  endsOn: '2027-03-31',
  status: 'OPEN',
  current: true,
  version: 1,
};
const ACA = { code: 'ACA', label: 'Academics', colour: '#5E4BB0' };
const a1: Announcement = {
  id: 'an-1',
  code: 'ANN-2026-0008',
  title: 'Half-yearly examination timetable',
  text: 'The half-yearly examinations begin on Monday 12 October.',
  category: ACA,
  important: true,
  ackRequired: true,
  channels: ['IN_APP', 'EMAIL'],
  targets: { groups: ['STUDENTS', 'PARENTS'] },
  source: 'CONSOLE',
  classSection: null,
  author: 'SUNITA RAO',
  sendAt: new Date().toISOString(),
  scheduled: false,
  dispatch: {
    status: 'COMPLETED',
    recipients: 4,
    success: 3,
    skipped: 1,
    failed: 0,
    at: new Date().toISOString(),
    reason: null,
  },
  acknowledgements: { acknowledged: 1, of: 3 },
  withdrawn: null,
  createdAt: new Date().toISOString(),
  version: 2,
};
const a2: Announcement = {
  ...a1,
  id: 'an-2',
  code: 'ANN-2026-0009',
  title: 'Annual Day auditions',
  important: false,
  ackRequired: false,
  category: { code: 'EVT', label: 'Events', colour: '#B4582B' },
  channels: ['IN_APP'],
  scheduled: true,
  dispatch: { ...a1.dispatch, status: 'QUEUED', success: 0, skipped: 0, recipients: 0, at: null },
  acknowledgements: null,
};
const list: AnnouncementList = {
  categories: [ACA, { code: 'EVT', label: 'Events', colour: '#B4582B' }],
  channels: ['IN_APP', 'SMS', 'EMAIL'],
  items: [a1, a2],
  nextCursor: null,
};

describe('console announcements (COM-001…006)', () => {
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
    const nav = harness.navigateByUrl('/console/announcements');
    (await request((u) => u === '/api/v1/console/session')).flush(sess);
    await nav;
    await settle();
    (await request((u) => u === '/api/v1/console/academic-years')).flush({ items: [year] });
    await settle();
    const l = await request((u) => u.startsWith('/api/v1/console/announcements'));
    expect(l.request.urlWithParams).toContain('yearId=y-1');
    l.flush(list);
    await settle();
    return harness.routeNativeElement as HTMLElement;
  }

  it('lists the year with delivery figures and filters by dispatch', async () => {
    const el = await open();
    const kpis = words(el.querySelector('#an-kpis'));
    expect(kpis).toContain('Delivered 3');
    expect(kpis).toContain('1 skipped');
    expect(kpis).toContain('Awaiting acknowledgement 2');
    const rows = [...el.querySelectorAll('#an-table tbody tr')].map((r) => text(r));
    expect(rows[0]).toContain('Students, Parents · by Sunita Rao');
    expect(rows[0]).toContain(translate('status.announcement.completed'));
    expect(rows[0]).toContain('3 sent · 1 skipped');
    expect(rows[0]).toContain('33%');
    expect(rows[1]).toContain(translate('status.announcement.queued'));
    expect(rows[1]).toContain('Sends');
    expect(rows[1]).toContain('Not needed');
    const pills = [...el.querySelectorAll('.pills .pill')] as HTMLButtonElement[];
    pills.find((p) => text(p) === translate('status.announcement.failed'))!.click();
    await settle(1);
    expect(text(el.querySelector('.empty h4'))).toBe('No announcements match');
  });

  it('opens an announcement with its channels and acknowledgements, and withdraws it', async () => {
    const el = await open();
    (el.querySelector('#an-table tbody tr') as HTMLElement).click();
    (await request((u) => u === '/api/v1/console/announcements/an-1')).flush({
      ...a1,
      perChannel: [
        { channel: 'IN_APP', success: 2, skipped: 0, failed: 0 },
        { channel: 'EMAIL', success: 1, skipped: 1, failed: 0 },
      ],
    });
    (
      await request((u) => u.startsWith('/api/v1/console/announcements/an-1/acknowledgements'))
    ).flush({
      items: [
        {
          member: {
            id: 'm-1',
            name: 'Kavya Pai',
            admissionNo: 'A1',
            class: 'Grade 7',
            section: 'B',
            type: 'Student',
          },
          acknowledgedAt: new Date().toISOString(),
          channel: 'IN_APP',
        },
        {
          member: {
            id: 'm-2',
            name: 'Ananya Rao',
            admissionNo: 'A2',
            class: 'Grade 7',
            section: 'B',
            type: 'Student',
          },
          acknowledgedAt: null,
          channel: null,
        },
        {
          member: {
            id: 'm-3',
            name: 'Prakash Pai',
            admissionNo: null,
            class: null,
            section: null,
            type: 'Parent',
          },
          acknowledgedAt: null,
          channel: null,
        },
      ],
      nextCursor: null,
    });
    await settle();
    const drawer = document.querySelector('.drawer') as HTMLElement;
    expect(text(drawer)).toContain('High importance');
    expect(words(drawer.querySelector('#an-dispatch'))).toContain('E-mail 1 · 0 · 1');
    expect([...drawer.querySelectorAll('#an-acks tbody tr')].map((r) => words(r))).toEqual([
      'Grade 7 2 1 50%',
      'Parents 1 0 0%',
    ]);
    expect(text(drawer.querySelector('#an-remind'))).toBe('Remind 2');

    (drawer.querySelector('#an-withdraw') as HTMLButtonElement).click();
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    const area = dlg.querySelector('#cf-reason') as HTMLTextAreaElement;
    area.value = 'Sent to the wrong group';
    area.dispatchEvent(new Event('input'));
    await settle(1);
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    const patch = await request((u) => u === '/api/v1/console/announcements/an-1', 'PATCH');
    expect(patch.request.headers.get('If-Match')).toBe('"v2"');
    expect(patch.request.body).toEqual({ withdrawn: true, reason: 'Sent to the wrong group' });
    patch.flush({
      ...a1,
      withdrawn: { at: new Date().toISOString(), reason: 'Sent to the wrong group' },
      version: 3,
    });
    await settle();
    expect(toasts()).toContain('Announcement withdrawn');
    expect(text(document.querySelector('.drawer .note'))).toContain('Sent to the wrong group');
    expect(document.querySelector('#an-withdraw')).toBeNull();
  });

  it('checks a new announcement in the register words, then sends it after a confirmation', async () => {
    const el = await open();
    (el.querySelector('#an-new') as HTMLButtonElement).click();
    await settle();
    expect(words(document.querySelector('#an-channels'))).toContain(
      'WhatsApp Off for this institution',
    );
    expect((document.querySelector('#an-ch-WHATSAPP') as HTMLInputElement).disabled).toBe(true);
    (document.querySelector('#an-send') as HTMLButtonElement).click();
    await settle(1);
    expect(text(document.querySelector('#an-t-e'))).toBe(
      translate('COM.TITLE', { min: 3, max: 120 }),
    );
    expect(text(document.querySelector('#an-x-e'))).toBe(
      translate('COM.BODY', { min: 10, max: 5000 }),
    );
    expect(text(document.querySelector('#an-c-e'))).toBe(translate('COM.CATEGORY'));
    expect(text(document.querySelector('#an-groups + p'))).toBe(translate('COM.TARGETS'));

    set('#an-t', 'Staff meeting on Monday');
    set('#an-x', 'All staff meet in the library at 3:15 PM.');
    (document.querySelector('#an-c-b') as HTMLButtonElement).click();
    await settle(1);
    ([...document.querySelectorAll('.dd-opt')] as HTMLButtonElement[])[0]!.click();
    (document.querySelector('#an-g-TEACHERS') as HTMLInputElement).dispatchEvent(
      new Event('change'),
    );
    (document.querySelector('#an-g-STAFF') as HTMLInputElement).dispatchEvent(new Event('change'));
    (document.querySelector('#an-ack') as HTMLButtonElement).click();
    await settle(1);
    (document.querySelector('#an-send') as HTMLButtonElement).click();
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    expect(text(dlg)).toContain('Send this announcement?');
    expect(text(dlg)).toContain('To Teachers, Staff by In-app.');
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    const post = await request((u) => u === '/api/v1/console/announcements', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({
      title: 'Staff meeting on Monday',
      text: 'All staff meet in the library at 3:15 PM.',
      category: 'ACA',
      important: false,
      ackRequired: true,
      targets: { groups: ['TEACHERS', 'STAFF'] },
      channels: ['IN_APP'],
    });
    post.flush({ ...a1, id: 'an-3', code: 'ANN-2026-0010', title: 'Staff meeting on Monday' });
    await settle();
    expect(toasts()).toContain('Announcement queued for sending');
    expect(document.querySelector('#an-form')).toBeNull();
    expect(text(el.querySelector('#an-table tbody tr'))).toContain('Staff meeting on Monday');
  });

  it('keeps management read-only', async () => {
    const el = await open(session(['comms.view'], true));
    expect(text(el.querySelector('.note'))).toContain('Read-only.');
    expect((el.querySelector('#an-new') as HTMLButtonElement).disabled).toBe(true);
  });

  it('speaks the message of a new announcement (speech to text, client 2026-10-14)', async () => {
    /** The browser's speech recognition, played by the test. */
    class FakeSpeech {
      static last: FakeSpeech | null = null;
      started = false;
      onresult: ((e: unknown) => void) | null = null;
      onerror = null;
      onend: (() => void) | null = null;
      constructor() {
        FakeSpeech.last = this;
      }
      start() {
        this.started = true;
      }
      stop() {
        this.onend?.();
      }
      abort() {
        this.onend?.();
      }
    }
    vi.stubGlobal('webkitSpeechRecognition', FakeSpeech);
    try {
      const el = await open();
      (el.querySelector('#an-new') as HTMLButtonElement).click();
      await settle();
      const speak = document.querySelector('#an-x-speak') as HTMLButtonElement;
      expect(speak.disabled).toBe(false);
      speak.click();
      await settle(1);
      const rec = FakeSpeech.last!;
      expect(rec.started).toBe(true);
      const say = (transcript: string) =>
        rec.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript } }] });
      say('all staff meet in the library');
      await settle(1);
      set('#an-x', `${(document.querySelector('#an-x') as HTMLTextAreaElement).value}.`);
      say('tea is served at four');
      await settle(1);
      expect((document.querySelector('#an-x') as HTMLTextAreaElement).value).toBe(
        'All staff meet in the library. Tea is served at four',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
