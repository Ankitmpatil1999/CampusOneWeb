import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import { translate } from '../../../Utils/translate';
import type { QuizTopic, StagingQuestion } from './quiz.api';

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

const admin = {
  name: 'ARJUN MEHTA',
  email: 'arjun@campusone.example',
  role: { code: 'PLATFORM_ADMIN', name: 'Platform Administrator' },
  subTasks: ['home.view', 'task.home', 'task.platform', 'quiz.edit', 'xi.aggregate'],
  preferredLang: 'en',
};
const topic = (id: string, name: string, staging: number, published: number): QuizTopic => ({
  id,
  name,
  description: `${name} basics`,
  icon: 'wallet',
  status: 'ACTIVE',
  staging,
  published,
  attempts: 3,
  updatedAt: null,
  version: 1,
});
const topics = [topic('t-1', 'Money basics', 2, 1), topic('t-2', 'Spotting fraud', 1, 2)];
const q = (id: string, t: QuizTopic, text: string, published: boolean): StagingQuestion => ({
  id,
  topic: { id: t.id, name: t.name },
  text,
  options: [
    'A plan for spending and saving',
    'A bank account',
    'A type of loan',
    'A shopping list',
  ],
  correct: 0,
  explanation: 'A budget plans spending and saving ahead of time.',
  published,
  version: 1,
});
const staging = [
  q('q-1', topics[0]!, 'What is a budget?', true),
  q('q-2', topics[0]!, 'Which is a need rather than a want?', false),
  q('q-3', topics[1]!, 'A caller offers a scholarship for a fee. This is…', true),
];

describe('back-office quiz bank (FIN-009…017)', () => {
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
  async function open() {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/backoffice/quiz');
    (await request((u) => u === '/api/v1/ops/session')).flush(admin);
    await nav;
    await settle();
    (await request((u) => u === '/api/v1/ops/quiz/topics')).flush({ items: topics });
    (await request((u) => u === '/api/v1/ops/quiz/staging-questions')).flush({
      items: staging,
      nextCursor: null,
    });
    await settle();
    return harness.routeNativeElement as HTMLElement;
  }

  it('counts what publishing changes and publishes the changed topics', async () => {
    const el = await open();
    // Money basics: one new question; Spotting fraud: one published question left staging.
    expect(text(el.querySelector('#qz-publish'))).toBe('Publish 2 changes');
    expect(words(el.querySelector('#qz-topics tbody tr'))).toContain('2 · 1 unpublished');
    expect(text(el)).toContain('1 new or changed and 1 to withdraw in staging');
    (el.querySelector('#qz-publish') as HTMLButtonElement).click();
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    expect(text(dlg)).toContain('Publish 2 changes to members?');
    expect(text(dlg)).toContain('Money basics — 1 new or changed; Spotting fraud — 1 withdrawn.');
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    const post = await request((u) => u === '/api/v1/ops/quiz/publications', 'POST');
    expect(post.request.body).toEqual({ topicIds: ['t-1', 't-2'] });
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    post.flush({ published: 1, updated: 0, withdrawn: 1 });
    await settle();
    expect(toasts()).toContain('1 new · 0 changed · 1 withdrawn');
    await request((u) => u === '/api/v1/ops/quiz/staging-questions');
  });

  it('shows staging as question cards and adds a question after its checks', async () => {
    const el = await open();
    (el.querySelector('#qz-tab-staging') as HTMLButtonElement).click();
    await settle(1);
    expect(el.querySelectorAll('#qz-staging .ob-q')).toHaveLength(3);
    expect(words(el.querySelector('#qz-staging .ob-opt.ok'))).toBe(
      'A A plan for spending and saving',
    );
    expect(text(el)).toContain('of Spotting fraud no longer in staging will be withdrawn');

    (el.querySelector('#qz-add-q') as HTMLButtonElement).click();
    await settle();
    (document.querySelector('#qz-q-save') as HTMLButtonElement).click();
    await settle(1);
    expect(text(document.querySelector('#qz-q-q-e'))).toBe(translate('FIN.QUESTION_MALFORMED'));
    set('#qz-q-q', 'Who should know your wallet PIN?');
    set('#qz-q-o0', 'Your best friend');
    set('#qz-q-o1', 'Only you');
    set('#qz-q-o2', 'The canteen staff');
    set('#qz-q-o3', 'Only you');
    (document.querySelector('#qz-q-save') as HTMLButtonElement).click();
    await settle(1);
    expect(text(document.querySelector('#qz-q'))).toContain('The four options must be different.');
    set('#qz-q-o3', 'Anyone who asks politely');
    (document.querySelector('#qz-q-a1') as HTMLInputElement).dispatchEvent(new Event('change'));
    (document.querySelector('#qz-q-save') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/ops/quiz/staging-questions', 'POST');
    expect(post.request.body).toEqual({
      topicId: 't-1',
      text: 'Who should know your wallet PIN?',
      options: ['Your best friend', 'Only you', 'The canteen staff', 'Anyone who asks politely'],
      correct: 1,
      explanation: null,
    });
    post.flush({ ...staging[1], id: 'q-9', version: 1 });
    await settle();
    expect(toasts()).toContain('Question added to staging');
  });

  it('stages a sheet and reports the rejected blocks', async () => {
    const el = await open();
    (el.querySelector('#qz-upload') as HTMLButtonElement).click();
    await settle();
    (document.querySelector('#qz-up-go') as HTMLButtonElement).click();
    await settle(1);
    expect(text(document.querySelector('#qz-up-f-e'))).toBe(translate('FIN.UPLOAD_FORMAT'));
    const input = document.querySelector('#qz-up-f') as HTMLInputElement;
    const file = new File(['What is a budget?\nA plan (Correct)\nB\nC\nD\n'], 'bank.csv', {
      type: 'text/csv',
    });
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    await settle(1);
    (document.querySelector('#qz-up-go') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/ops/quiz/staging-uploads', 'POST');
    const body = post.request.body as FormData;
    expect(body.get('topicId')).toBe('t-1');
    expect((body.get('file') as File).name).toBe('bank.csv');
    post.flush({
      accepted: 1,
      skipped: 0,
      rejected: [{ row: 7, reason: 'A question needs four answers.' }],
    });
    await settle();
    expect(toasts()).toContain('1 question staged');
    expect(words(el.querySelector('#qz-uploads'))).toContain('bank.csv');
    expect(words(el.querySelector('#qz-uploads'))).toContain('7 A question needs four answers.');
  });

  it('shows the platform leaderboard only with a recorded reason', async () => {
    const el = await open();
    (el.querySelector('#qz-tab-lead') as HTMLButtonElement).click();
    await settle(1);
    (el.querySelector('#qz-lb-go') as HTMLButtonElement).click();
    await settle(1);
    expect(text(el.querySelector('#qz-lb-why-e'))).toBe(translate('RPT.XI_REASON'));
    set('#qz-lb-why', 'Question bank review for the quarter');
    (el.querySelector('#qz-lb-go') as HTMLButtonElement).click();
    const get = await request((u) => u.startsWith('/api/v1/ops/quiz/leaderboard'));
    expect(get.request.params.get('period')).toBe('all');
    expect(get.request.params.get('reason')).toBe('Question bank review for the quarter');
    get.flush({
      period: 'all',
      ranked: 2,
      institutions: 1,
      items: [
        { rank: 1, name: 'Rohan', institution: 'TVPS', average: 100, attempts: 1 },
        { rank: 2, name: 'Ananya', institution: 'TVPS', average: 66.7, attempts: 3 },
      ],
    });
    await settle();
    const rows = [...el.querySelectorAll('#qz-board tbody tr')].map((r) => words(r));
    expect(rows).toEqual(['1 Rohan TVPS 1 100.0%', '2 Ananya TVPS 3 66.7%']);
    expect(text(el.querySelector('.pager'))).toContain('2 students ranked across 1 institution');
  });
});
