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
import type { ClassAnnouncement, Homework, HomeworkList, Submissions } from './work.api';

const tick = () => new Promise((r) => setTimeout(r, 0));
/** The visible words, with a space between elements (as a screen reader reads them). */
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
const section = { id: 's-1', label: 'Grade 6 A' };
const hw = (over: Partial<Homework> = {}): Homework => ({
  id: 'hw-1',
  kind: 'HOMEWORK',
  title: 'Fractions — exercise 4.2',
  instructions: 'Do questions 1 to 10 in your notebook.',
  section,
  subject: { id: 'sub-1', name: 'Mathematics', colour: '' },
  dueAt: '2026-10-08T12:30:00.000Z',
  dueDate: '2026-10-08',
  closed: false,
  wholeClass: true,
  file: null,
  link: null,
  counts: { students: 3, reviewed: 0, toReview: 1, notSubmitted: 2 },
  createdAt: '2026-10-05T04:00:00.000Z',
  version: 1,
  ...over,
});
const list = (items: readonly Homework[]): HomeworkList => ({
  year: { id: 'y-1', label: '2026-27' },
  counts: { all: items.length, review: 1, homework: items.length, classwork: 0 },
  grades: ['A+', 'A', 'B+', 'B', 'C', 'Redo'],
  items,
  choices: [
    { section, subject: { id: 'sub-1', name: 'Mathematics' }, classTeacher: true, students: 3 },
  ],
});
const subs = (): Submissions => ({
  homework: hw(),
  grades: ['A+', 'A', 'B+', 'B', 'C', 'Redo'],
  rows: [
    {
      student: { id: 'st-1', name: 'Asha Rao', admissionNo: 'ADM/1' },
      record: 'DONE',
      submission: {
        id: 'x-1',
        status: 'SUBMITTED',
        late: true,
        submittedAt: '2026-10-05T10:00:00.000Z',
        file: null,
        link: 'https://example.org/asha',
        note: 'Done',
        grade: null,
        feedback: null,
        reviewedAt: null,
        version: 3,
      },
    },
    {
      student: { id: 'st-2', name: 'Bala Rao', admissionNo: 'ADM/2' },
      record: 'NEW',
      submission: null,
    },
  ],
});
const ann = (over: Partial<ClassAnnouncement> = {}): ClassAnnouncement => ({
  id: 'a-1',
  code: 'ANN-2026-0007',
  title: 'Science project due Friday',
  text: 'Bring the model to class.',
  ackRequired: true,
  classSection: 'Grade 6 A',
  sendAt: '2026-10-05T05:00:00.000Z',
  dispatch: { status: 'COMPLETED', recipients: 6, success: 6, failed: 0 },
  acknowledgements: { acknowledged: 2, of: 6 },
  withdrawn: null,
  createdAt: '2026-10-05T05:00:00.000Z',
  ...over,
});

describe('teacher homework and class announcements on the web (ACA-048…051, COM-022…029)', () => {
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

  it('sets homework: the server’s rules first, then the class is told', async () => {
    const el = await open('/console/teaching-homework');
    const get = await request((u) => u === '/api/v1/teacher/homework?filter=all');
    expect(get.request.headers.get('X-CampusOne-Surface')).toBe('console');
    get.flush(list([hw()]));
    await settle();
    expect(text(el.querySelector('#hw-tab-review'))).toBe('To review 1');
    expect(text(el.querySelector('#hw-0'))).toContain('1 to review · 2 not submitted');
    (el.querySelector('#hw-new') as HTMLButtonElement).click();
    await settle();
    (document.querySelector('#hw-send') as HTMLButtonElement).click();
    await settle(1);
    const form = text(document.querySelector('#hw-form'));
    expect(form).toContain('Choose the class and subject.');
    expect(form).toContain('Give the homework a title of 3 to 80 characters.');
    expect(form).toContain('Write the instructions in 10 to 600 characters.');
    (document.querySelector('#hw-class-b') as HTMLButtonElement).click();
    await settle(2);
    (document.querySelector('.dd-menu .dd-opt') as HTMLButtonElement).click();
    type('#hw-t', 'Fractions — exercise 4.3');
    type('#hw-x', 'Do questions 11 to 20 in your notebook.');
    type('#hw-link', 'https://example.org/sheet');
    await settle(1);
    (document.querySelector('#hw-send') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/teacher/homework', 'POST');
    expect(post.request.headers.has('Idempotency-Key')).toBe(true);
    expect(post.request.body).toEqual({
      classSectionId: 's-1',
      subjectId: 'sub-1',
      type: 'HOMEWORK',
      title: 'Fractions — exercise 4.3',
      instructions: 'Do questions 11 to 20 in your notebook.',
      dueDate: addDays(today(), 1),
      fileId: null,
      link: 'https://example.org/sheet',
    });
    post.flush(hw({ id: 'hw-2', title: 'Fractions — exercise 4.3' }), {
      status: 201,
      statusText: 'Created',
    });
    (await request((u) => u === '/api/v1/teacher/homework?filter=all')).flush(
      list([hw({ id: 'hw-2', title: 'Fractions — exercise 4.3' }), hw()]),
    );
    await settle();
    expect(toasts()).toContain('Homework set');
    expect(document.querySelector('#hw-form')).toBeNull();
    expect(text(el.querySelector('#hw-0'))).toContain('Fractions — exercise 4.3');
  });

  // 2026-10-15: "provide an option to assign a homework or classwork to an individual student".
  it('sets homework for chosen students of the class', async () => {
    const el = await open('/console/teaching-homework');
    (await request((u) => u === '/api/v1/teacher/homework?filter=all')).flush(list([hw()]));
    await settle();
    (el.querySelector('#hw-new') as HTMLButtonElement).click();
    await settle();
    (document.querySelector('#hw-class-b') as HTMLButtonElement).click();
    await settle(2);
    (document.querySelector('.dd-menu .dd-opt') as HTMLButtonElement).click();
    await settle(1);
    ([...document.querySelectorAll('#hw-who button')] as HTMLButtonElement[])[1]!.click();
    const roster = await request((u) => u === '/api/v1/teacher/classes/s-1/students');
    expect(roster.request.headers.get('X-CampusOne-Surface')).toBe('console');
    const kid = (id: string, name: string, admissionNo: string) => ({
      id,
      name,
      admissionNo,
      gender: 'F',
      attendanceToday: null,
    });
    roster.flush({
      section: { id: 's-1', label: 'Grade 6 A', classTeacher: true },
      items: [kid('st-1', 'Asha Rao', 'ADM/1'), kid('st-2', 'Bala Rao', 'ADM/2')],
    });
    await settle();
    type('#hw-t', 'Catch-up — exercise 4.2');
    type('#hw-x', 'Finish the questions you missed last week.');
    await settle(1);
    // At least one student.
    (document.querySelector('#hw-send') as HTMLButtonElement).click();
    await settle(1);
    expect(text(document.querySelector('#hw-form'))).toContain('Choose at least one student.');
    // Search, then tick.
    type('#hw-st-q', 'bala');
    await settle(1);
    expect(text(document.querySelector('#hw-students .card'))).toBe('Bala Rao ADM/2');
    (document.querySelector('#hw-st-0') as HTMLInputElement).click();
    await settle(1);
    expect(text(document.querySelector('#hw-st-n'))).toBe('1 chosen');
    (document.querySelector('#hw-send') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/teacher/homework', 'POST');
    expect(post.request.body).toMatchObject({ classSectionId: 's-1', studentIds: ['st-2'] });
    post.flush(hw({ id: 'hw-3', wholeClass: false }), { status: 201, statusText: 'Created' });
    (await request((u) => u === '/api/v1/teacher/homework?filter=all')).flush(
      list([hw({ id: 'hw-3', wholeClass: false, counts: { ...hw().counts, students: 1 } })]),
    );
    await settle();
    expect(text(el.querySelector('#hw-0'))).toContain('for chosen students (1)');
  });

  // 2026-10-14: "Unable to set homework" — the section had no students enrolled this year and the
  // form said "Please fill in all mandatory fields".
  it('says when a class has no students enrolled this year, before and after sending', async () => {
    const el = await open('/console/teaching-homework');
    const empty = list([]);
    (await request((u) => u === '/api/v1/teacher/homework?filter=all')).flush({
      ...empty,
      choices: [
        { ...empty.choices[0]!, students: 0 },
        { ...empty.choices[0]!, subject: { id: 'sub-2', name: 'Science' }, students: 3 },
      ],
    });
    await settle();
    (el.querySelector('#hw-new') as HTMLButtonElement).click();
    await settle();
    (document.querySelector('#hw-class-b') as HTMLButtonElement).click();
    await settle(2);
    const opts = [...document.querySelectorAll('.dd-menu .dd-opt')] as HTMLButtonElement[];
    expect(text(opts[0])).toContain('No students enrolled this year');
    opts[0]!.click();
    type('#hw-t', 'Fractions — exercise 4.3');
    type('#hw-x', 'Do questions 11 to 20 in your notebook.');
    await settle(1);
    (document.querySelector('#hw-send') as HTMLButtonElement).click();
    await settle(1);
    expect(text(document.querySelector('#hw-form'))).toContain(
      'No students are enrolled in Grade 6 A this year.',
    );
    const ctl = TestBed.inject(HttpTestingController);
    expect(ctl.match((r) => r.method === 'POST')).toHaveLength(0);
    // The server's own word, under the class, when it refuses for the same reason.
    (document.querySelector('#hw-class-b') as HTMLButtonElement).click();
    await settle(2);
    ([...document.querySelectorAll('.dd-menu .dd-opt')] as HTMLButtonElement[])[1]!.click();
    await settle(1);
    (document.querySelector('#hw-send') as HTMLButtonElement).click();
    (await request((u) => u === '/api/v1/teacher/homework', 'POST')).flush(
      {
        code: 'VALIDATION.FAILED',
        detail: 'Please fill in all mandatory fields.',
        errors: [
          { field: 'studentIds', code: 'ACA.HW_STUDENTS', params: { section: 'GRADE 7 B' } },
        ],
      },
      { status: 422, statusText: 'Unprocessable' },
    );
    await settle();
    const form = text(document.querySelector('#hw-form'));
    expect(form).toContain('GRADE 7 B');
    expect(form).not.toContain('Please fill in all mandatory fields.');
  });

  /** The browser's speech recognition, played by the test. */
  class FakeSpeech {
    static last: FakeSpeech | null = null;
    lang = '';
    continuous = false;
    interimResults = false;
    started = false;
    stopped = false;
    onresult: ((e: unknown) => void) | null = null;
    onerror: ((e: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;
    constructor() {
      FakeSpeech.last = this;
    }
    start() {
      this.started = true;
    }
    stop() {
      this.stopped = true;
      this.onend?.();
    }
    abort() {
      this.onend?.();
    }
    say(transcript: string, isFinal: boolean) {
      this.onresult?.({ resultIndex: 0, results: [{ isFinal, 0: { transcript } }] });
    }
  }
  const newForm = async (el: HTMLElement) => {
    (await request((u) => u === '/api/v1/teacher/homework?filter=all')).flush(list([hw()]));
    await settle();
    (el.querySelector('#hw-new') as HTMLButtonElement).click();
    await settle();
  };

  it('speaks the instructions of homework and classwork (speech to text, client 2026-10-12)', async () => {
    vi.stubGlobal('webkitSpeechRecognition', FakeSpeech);
    try {
      await newForm(await open('/console/teaching-homework'));
      // Classwork uses the same Instructions field.
      ([...document.querySelectorAll('#hw-type button')] as HTMLButtonElement[])[1]!.click();
      await settle(1);
      const speak = document.querySelector('#hw-x-speak') as HTMLButtonElement;
      expect(speak.disabled).toBe(false);
      expect(text(speak)).toBe('Speak');
      speak.click();
      await settle(1);
      const rec = FakeSpeech.last!;
      expect(rec).toMatchObject({
        started: true,
        lang: 'en-IN',
        continuous: true,
        interimResults: true,
      });
      expect(text(speak)).toBe('Stop');
      expect(text(document.querySelector('.dictate-s'))).toBe('Listening… speak now');
      // What is being said shows as it is recognised; a finished phrase joins the field.
      rec.say('read chapter five', false);
      await settle(1);
      expect(text(document.querySelector('.dictate-s'))).toBe('read chapter five');
      rec.say('read chapter five and answer the questions', true);
      await settle(1);
      const box = document.querySelector('#hw-x') as HTMLTextAreaElement;
      expect(box.value).toBe('Read chapter five and answer the questions');
      type('#hw-x', `${box.value}.`);
      rec.say('bring your notebook tomorrow', true);
      await settle(1);
      expect(box.value).toBe(
        'Read chapter five and answer the questions. Bring your notebook tomorrow',
      );
      speak.click();
      await settle(1);
      expect(rec.stopped).toBe(true);
      expect(text(speak)).toBe('Speak');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps speech to text off where the browser has none, and says why', async () => {
    // The test browser, like Firefox, has no speech recognition.
    await newForm(await open('/console/teaching-homework'));
    const speak = document.querySelector('#hw-x-speak') as HTMLButtonElement;
    expect(speak.disabled).toBe(true);
    expect(speak.parentElement?.getAttribute('title')).toBe(
      'Speech to text isn’t available in this browser. Use Chrome, Edge or Safari.',
    );
  });

  it('reviews a submission with a grade and feedback (If-Match), and reminds the rest', async () => {
    const el = await open('/console/teaching-homework');
    (await request((u) => u === '/api/v1/teacher/homework?filter=all')).flush(list([hw()]));
    await settle();
    (el.querySelector('#hw-open-0') as HTMLButtonElement).click();
    (await request((u) => u === '/api/v1/teacher/homework/hw-1/submissions')).flush(subs());
    await settle();
    const grid = text(document.querySelector('#hs-grid tbody'));
    expect(grid).toContain('Asha Rao ADM/1');
    expect(grid).toContain('Late');
    expect(grid).toContain('Bala Rao ADM/2 Not submitted');
    const save = document.querySelector('#hs-save-0') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    ([...document.querySelectorAll('#hs-g-0 button')][1] as HTMLButtonElement).click();
    type('#hs-f-0', 'Neat work');
    await settle(1);
    save.click();
    const patch = await request((u) => u === '/api/v1/teacher/submissions/x-1', 'PATCH');
    expect(patch.request.headers.get('If-Match')).toBe('"v3"');
    expect(patch.request.body).toEqual({ grade: 'A', feedback: 'Neat work' });
    patch.flush(subs().rows[0]!);
    (await request((u) => u === '/api/v1/teacher/homework/hw-1/submissions')).flush(subs());
    (await request((u) => u === '/api/v1/teacher/homework?filter=all')).flush(list([hw()]));
    await settle();
    expect(toasts()).toContain('Review saved');
    (document.querySelector('#hs-remind') as HTMLButtonElement).click();
    (await request((u) => u === '/api/v1/teacher/homework/hw-1/reminders', 'POST')).flush({
      students: 2,
      notifications: 3,
    });
    await settle();
    expect(toasts()).toContain('2 students and their families');
  });

  it('sends a class announcement and shows who hasn’t acknowledged', async () => {
    const el = await open('/console/teaching-announce');
    (await request((u) => u === '/api/v1/teacher/class-announcements')).flush({ items: [ann()] });
    (await request((u) => u === '/api/v1/teacher/classes')).flush({
      year: { id: 'y-1', label: '2026-27' },
      items: [{ ...section, students: 3, classTeacher: true, subjects: [] }],
    });
    await settle();
    expect(text(el.querySelector('#an-0'))).toContain('2 of 6 acknowledged');
    (el.querySelector('#an-new') as HTMLButtonElement).click();
    (await request((u) => u === '/api/v1/me/announcement-options')).flush({
      categories: [],
      channels: ['IN_APP'],
      groups: ['STUDENTS', 'PARENTS'],
      limits: { titleMin: 3, titleMax: 120, textMin: 10, textMax: 5000 },
    });
    await settle();
    type('#an-t', 'PTM');
    type('#an-x', 'Short');
    (document.querySelector('#an-send') as HTMLButtonElement).click();
    await settle(1);
    expect(text(document.querySelector('#an-form'))).toContain(
      'Write a message of 10 to 5000 characters.',
    );
    type('#an-x', 'Parent–teacher meeting on Saturday at 10 AM.');
    (document.querySelector('#an-ack') as HTMLButtonElement).click();
    await settle(1);
    (document.querySelector('#an-send') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/teacher/class-announcements', 'POST');
    expect(post.request.body).toEqual({
      classSectionId: 's-1',
      title: 'PTM',
      text: 'Parent–teacher meeting on Saturday at 10 AM.',
      ackRequired: true,
    });
    post.flush({
      announcementId: 'a-2',
      recipientsEstimated: 6,
      sendAt: '2026-10-05T06:00:00.000Z',
    });
    (await request((u) => u === '/api/v1/teacher/class-announcements')).flush({
      items: [
        ann({
          id: 'a-2',
          title: 'PTM',
          dispatch: { status: 'QUEUED', recipients: 0, success: 0, failed: 0 },
        }),
        ann(),
      ],
    });
    await settle();
    expect(toasts()).toContain('Announcement queued');
    expect(text(el.querySelector('#an-0'))).toContain('PTM Queued');
    (el.querySelector('#an-who-1') as HTMLButtonElement).click();
    (
      await request(
        (u) => u === '/api/v1/teacher/class-announcements/a-1/acknowledgements?acked=false',
      )
    ).flush({
      items: [
        {
          member: {
            id: 'm-1',
            name: 'Ravi Rao',
            admissionNo: null,
            class: 'Grade 6',
            section: 'A',
            type: 'Parent',
          },
          acknowledgedAt: null,
          channel: null,
        },
      ],
      nextCursor: null,
    });
    await settle();
    expect(text(document.querySelector('#an-acks'))).toContain('Ravi Rao Parent');
    (document.querySelector('#an-remind') as HTMLButtonElement).click();
    (await request((u) => u === '/api/v1/teacher/class-announcements/a-1/reminders', 'POST')).flush(
      {
        reminded: 4,
      },
    );
    await settle();
    expect(toasts()).toContain('4 people reminded in the app');
  });

  it('speaks a class announcement’s message (speech to text, client 2026-10-14)', async () => {
    vi.stubGlobal('webkitSpeechRecognition', FakeSpeech);
    try {
      const el = await open('/console/teaching-announce');
      (await request((u) => u === '/api/v1/teacher/class-announcements')).flush({ items: [] });
      (await request((u) => u === '/api/v1/teacher/classes')).flush({
        year: { id: 'y-1', label: '2026-27' },
        items: [{ ...section, students: 3, classTeacher: true, subjects: [] }],
      });
      await settle();
      (el.querySelector('#an-new') as HTMLButtonElement).click();
      (await request((u) => u === '/api/v1/me/announcement-options')).flush({
        categories: [],
        channels: ['IN_APP'],
        groups: ['STUDENTS', 'PARENTS'],
        limits: { titleMin: 3, titleMax: 120, textMin: 10, textMax: 60 },
      });
      await settle();
      const speak = document.querySelector('#an-x-speak') as HTMLButtonElement;
      expect(text(speak)).toBe('Speak');
      speak.click();
      await settle(1);
      const rec = FakeSpeech.last!;
      rec.say('the science fair is on friday', true);
      await settle(1);
      const box = document.querySelector('#an-x') as HTMLTextAreaElement;
      expect(box.value).toBe('The science fair is on friday');
      // Within the message's length; the button says why the rest was left out.
      rec.say('please bring your models to the hall by nine', true);
      await settle(1);
      expect(box.value).toHaveLength(60);
      expect(text(document.querySelector('.dictate-s'))).not.toBe('');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
