import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import { I18n } from '../../../Utils/i18n';
import { MESSAGES_EN } from '../../../Utils/messages.en';
import { WEB_STRINGS_EN } from '../../../Utils/strings.en';
import { translate, useBundle } from '../../../Utils/translate';

const tick = () => new Promise((r) => setTimeout(r, 0));
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

async function request(match: (url: string) => boolean, method = 'GET') {
  const ctl = TestBed.inject(HttpTestingController);
  for (let i = 0; i < 60; i++) {
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

const teacher = {
  name: 'MEENA RAO',
  email: 'meena@tvps.example.in',
  institution: {
    id: 'i-1',
    name: 'Tunga Valley Public School',
    shortName: 'TVPS',
    city: 'Shivamogga',
  },
  roles: [{ code: 'TEACHER', name: 'Teacher', readOnly: false }],
  subTasks: ['task.teaching', 'teaching.view', 'teaching.marks'],
  preferredLang: 'en',
};

describe('teachers on the web and the language menu (Phase 10)', () => {
  beforeEach(() => {
    localStorage.removeItem('rp.lang');
    TestBed.configureTestingModule({
      providers: [
        { provide: CAMPUSONE_WEB_CONFIG, useValue: WEB_CONFIG },
        provideRouter(appRoutes),
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
      ],
    });
  });
  afterEach(() => {
    localStorage.removeItem('rp.lang');
    useBundle({ ...MESSAGES_EN, ...WEB_STRINGS_EN });
    document.documentElement.lang = 'en';
  });

  it('loads the chosen language at start-up and translates through it', async () => {
    localStorage.setItem('rp.lang', 'kn');
    const i18n = TestBed.inject(I18n);
    const started = i18n.init();
    (await request((u) => u === '/api/v1/i18n/kn')).flush({
      lang: 'kn',
      machineDraft: true,
      messages: { 'ui.web.nav.marks': 'ಅಂಕಗಳು', 'ui.web.x.1': 'ಬದಲಾವಣೆಗಳನ್ನು ಉಳಿಸಿ' },
    });
    // The pages written in English: their text list, then the page follows the language.
    (await request((u) => u === '/i18n/ui-text.en.json')).flush({ 'ui.web.x.1': 'Save changes' });
    await started;
    expect(i18n.lang()).toBe('kn');
    expect(document.documentElement.lang).toBe('kn');
    expect(translate('ui.web.nav.marks')).toBe('ಅಂಕಗಳು');
    // A text the language lacks falls back to English, never to the key.
    expect(translate('ui.web.nav.homework')).toBe('Homework');
    const button = document.createElement('button');
    button.textContent = 'Save changes';
    document.body.appendChild(button);
    await new Promise((r) => setTimeout(r, 0));
    expect(button.textContent).toBe('ಬದಲಾವಣೆಗಳನ್ನು ಉಳಿಸಿ');
    button.remove();
  });

  it('saves a choice for the signed-in account, then reloads in it', async () => {
    const i18n = TestBed.inject(I18n);
    const reload = vi.spyOn(i18n, 'reload').mockImplementation(() => undefined);
    const changed = i18n.change('hi', 'console');
    const put = await request((u) => u === '/api/v1/me/language', 'PUT');
    expect(put.request.body).toEqual({ lang: 'hi' });
    expect(put.request.headers.get('X-CampusOne-Surface')).toBe('console');
    put.flush({ preferredLang: 'hi' });
    await changed;
    expect(localStorage.getItem('rp.lang')).toBe('hi');
    expect(reload).toHaveBeenCalledTimes(1);
    // After sign-in the account's language applies only when this browser has none.
    i18n.adopt('kn');
    expect(reload).toHaveBeenCalledTimes(1);
    localStorage.removeItem('rp.lang');
    i18n.adopt('kn');
    expect(localStorage.getItem('rp.lang')).toBe('kn');
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('lands a teacher on the Teaching pages with only the Teaching menu', async () => {
    const harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console');
    (await request((u) => u === '/api/v1/console/session')).flush(teacher);
    await nav;
    for (let i = 0; i < 6; i++) await tick();
    serve({ '/api/v1/languages': { items: [] } });
    harness.detectChanges();
    const side = document.querySelector('.c-nav');
    expect(text(side?.querySelector('.nv-par'))).toBe('Teaching');
    expect([...(side?.querySelectorAll('.nv-item') ?? [])].map((a) => text(a))).toEqual([
      'Today',
      'Marks',
      'Attendance',
      'Homework',
      'Student leave',
      'Timetable',
      'Class announcements',
      // The teacher's own (client 2026-10-12).
      'Messages',
      'Notices',
      'My leave',
      'My attendance',
      'Calendar',
    ]);
    const router = TestBed.inject(Router);
    for (let i = 0; i < 40 && router.url !== '/console/teaching'; i++) await tick();
    expect(router.url).toBe('/console/teaching');
    (await request((u) => u === '/api/v1/teacher/today')).flush({
      year: { id: 'y-1', label: '2026-27' },
      date: '2026-10-05',
      teacher: { name: 'Meena Rao' },
      assigned: true,
      classTeacherOf: [],
      subjectSections: [],
      periods: [],
      homeworkToReview: 0,
    });
    for (let i = 0; i < 4; i++) await tick();
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent ?? '').toContain('Today’s periods');
    // The top bar carries the language menu.
    expect(document.querySelector('#lang-menu')).not.toBeNull();
  });
});
