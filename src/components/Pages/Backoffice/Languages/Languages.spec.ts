import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import { translate } from '../../../Utils/translate';
import type { LanguageList } from './languages.api';

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
  subTasks: ['home.view', 'task.home', 'task.platform', 'lang.edit'],
  preferredLang: 'en',
};
const lang = (code: string, name: string, nativeName: string, missing: number, enabled = true) => ({
  code,
  name,
  nativeName,
  enabled,
  isDefault: code === 'en',
  version: 3,
  translations:
    code === 'en'
      ? { reviewed: 100, machine: 0, missing: 0 }
      : { reviewed: 10, machine: 90 - missing, missing },
});
const list: LanguageList = {
  keys: 100,
  items: [
    lang('en', 'English', 'English', 0),
    lang('kn', 'Kannada', 'ಕನ್ನಡ', 0),
    lang('hi', 'Hindi', 'हिन्दी', 6),
    lang('ta', 'Tamil', 'தமிழ்', 40, false),
  ],
};

describe('back-office languages (IDN-070…074)', () => {
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
    const nav = harness.navigateByUrl('/backoffice/languages');
    (await request((u) => u === '/api/v1/ops/session')).flush(admin);
    await nav;
    await settle();
    (await request((u) => u === '/api/v1/ops/languages')).flush(list);
    await settle();
    return harness.routeNativeElement as HTMLElement;
  }

  it('lists the languages with coverage, keeps the default on and switches one off', async () => {
    const el = await open();
    expect(words(el.querySelector('.tabs'))).toBe(
      'Languages 4 Translations 100 Missing translations 6',
    );
    const rows = [...el.querySelectorAll('#lg-langs tbody tr')] as HTMLElement[];
    expect(words(rows[0])).toContain('Default · fallback');
    expect((rows[0]!.querySelector('.toggle') as HTMLButtonElement).disabled).toBe(true);
    expect(words(rows[2])).toContain('94% · 94 of 100 keys · 84 machine');
    expect((rows[3]!.querySelector('.btn-xs') as HTMLButtonElement).disabled).toBe(true);

    (rows[2]!.querySelector('.toggle') as HTMLButtonElement).click();
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    expect(text(dlg)).toContain('Switch Hindi off?');
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    const patch = await request((u) => u === '/api/v1/ops/languages/hi', 'PATCH');
    expect(patch.request.body).toEqual({ enabled: false });
    expect(patch.request.headers.get('If-Match')).toBe('"v3"');
    patch.flush({ ...list.items[2], enabled: false });
    await settle();
    expect(toasts()).toContain('Hindi switched off');
    expect(words(el.querySelectorAll('#lg-langs tbody tr')[2])).toContain('Disabled');
  });

  it('edits a translation and keeps its placeholders', async () => {
    const el = await open();
    (el.querySelector('#lg-tab-tr') as HTMLButtonElement).click();
    const t = await request((u) => u.startsWith('/api/v1/ops/translations'));
    t.flush({
      languages: ['hi', 'kn', 'ta'],
      screens: ['ACA', 'PAY'],
      total: 1,
      items: [
        {
          key: 'ACA.ALREADY_ENROLLED',
          screen: 'ACA',
          en: 'This student is already enrolled in {year}.',
          placeholders: ['year'],
          texts: {
            kn: {
              text: 'ಈ ವಿದ್ಯಾರ್ಥಿ ಈಗಾಗಲೇ {year} ರಲ್ಲಿ ದಾಖಲಾಗಿದ್ದಾರೆ.',
              source: 'MACHINE',
              reviewedAt: null,
              version: 1,
            },
            hi: null,
            ta: null,
          },
        },
      ],
      nextCursor: null,
    });
    await settle();
    expect(words(el.querySelector('#lg-tr tbody'))).toContain('Machine');
    (el.querySelector('#lg-tr tbody tr') as HTMLElement).click();
    await settle();
    expect(text(document.querySelector('.modal .sh-t h3'))).toBe('Kannada · ACA.ALREADY_ENROLLED');
    set('#lg-tr-v', 'ಈ ವಿದ್ಯಾರ್ಥಿ ಈಗಾಗಲೇ ದಾಖಲಾಗಿದ್ದಾರೆ.');
    (document.querySelector('#lg-tr-save') as HTMLButtonElement).click();
    await settle(1);
    expect(text(document.querySelector('#lg-tr-v-e'))).toBe(
      translate('I18N.PLACEHOLDERS', { lang: 'Kannada', names: '{year}' }),
    );
    set('#lg-tr-v', 'ಈ ವಿದ್ಯಾರ್ಥಿ {year} ರಲ್ಲಿ ದಾಖಲಾಗಿದ್ದಾರೆ.');
    (document.querySelector('#lg-tr-save') as HTMLButtonElement).click();
    const put = await request((u) => u === '/api/v1/ops/translations/ACA.ALREADY_ENROLLED', 'PUT');
    expect(put.request.body).toEqual({
      texts: { kn: 'ಈ ವಿದ್ಯಾರ್ಥಿ {year} ರಲ್ಲಿ ದಾಖಲಾಗಿದ್ದಾರೆ.' },
      versions: { kn: 1 },
    });
    put.flush({});
    await settle();
    expect(toasts()).toContain('Translation saved');
    (await request((u) => u === '/api/v1/ops/languages')).flush(list);
    await settle();
    expect(words(el.querySelector('#lg-tr tbody'))).not.toContain('Machine');
  });

  it('adds a language, which starts switched off', async () => {
    const el = await open();
    (el.querySelector('#lg-add') as HTMLButtonElement).click();
    await settle();
    set('#lg-nl-c', 'kn');
    (document.querySelector('#lg-nl-go') as HTMLButtonElement).click();
    await settle(1);
    expect(text(document.querySelector('#lg-nl-c-e'))).toBe(translate('I18N.LANGUAGE_EXISTS'));
    set('#lg-nl-c', 'or');
    set('#lg-nl-n', 'Odia');
    set('#lg-nl-v', 'ଓଡ଼ିଆ');
    (document.querySelector('#lg-nl-go') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/ops/languages', 'POST');
    expect(post.request.body).toEqual({ code: 'or', name: 'Odia', native: 'ଓଡ଼ିଆ' });
    post.flush(lang('or', 'Odia', 'ଓଡ଼ିଆ', 100, false));
    await settle();
    expect(toasts()).toContain('Odia added');
    await request((u) => u === '/api/v1/ops/languages');
  });
});
