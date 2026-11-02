import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AREA_LIST, CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from './Config';
import { appRoutes } from './App.routes';
import { SessionContext } from './Context/SessionContext';
import { apiInterceptor } from './components/Utils/api';
import { csrfToken, surfaceOfPath } from './components/Utils/web-session';

const tick = () => new Promise((r) => setTimeout(r, 0));

/** Waits for the app to issue a request (guards and components call the API asynchronously). */
async function request(url: string, method = 'GET') {
  const ctl = TestBed.inject(HttpTestingController);
  for (let i = 0; i < 50; i++) {
    const found = ctl.match((r) => r.url === url && r.method === method);
    if (found[0]) return found[0];
    await tick();
  }
  throw new Error(`no ${method} ${url}`);
}

const consoleSession = {
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
    'reports.view',
    'members.view',
    'members.onboard',
    'approvals.view',
    'task.home',
    'task.reports',
    'task.members',
    'task.approvals',
  ],
  preferredLang: 'en',
};

const unauthenticated = { status: 401, statusText: 'Unauthorized' };
const problem = (code: string, detail: string) => ({ type: 'about:blank', code, detail });

describe('CampusOne web application', () => {
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

  it('opens on the landing page with a link to every area', async () => {
    const harness = await RouterTestingHarness.create('/');
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toBe('CampusOne');
    const links = [...el.querySelectorAll('ul.areas a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(AREA_LIST.map((a) => `/${a.path}`));
  });

  it('sends a signed-out visitor from the console to its sign-in page', async () => {
    const harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console');
    (await request('/api/v1/console/session')).flush(null, unauthenticated);
    await nav;
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.querySelector('.cp-af h1')?.textContent?.trim()).toBe('Sign in');
    expect(el.querySelector('.cp-ab h2')?.textContent).toBe('Run the whole campus from one place.');
  });

  it('signs in with the password and then the code, and opens the console home', async () => {
    const harness = await RouterTestingHarness.create('/console/signin');
    const el = () => harness.routeNativeElement as HTMLElement;
    const type = (sel: string, v: string) => {
      const input = el().querySelector<HTMLInputElement>(sel)!;
      input.value = v;
      input.dispatchEvent(new Event('input'));
    };
    type('#cp-au-email', 'Prakash.Shetty@tvps.example.in');
    type('#cp-au-pw', 'Tvps@2026');
    el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    const signIn = await request('/api/v1/auth/console/signin', 'POST');
    expect(signIn.request.body).toEqual({
      email: 'prakash.shetty@tvps.example.in',
      password: 'Tvps@2026',
    });
    signIn.flush({
      challengeId: 'c-1',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      resendAfterSeconds: 60,
      sentTo: 'â€¢â€¢â€¢â€¢â€¢â€¢1201',
      channel: 'SMS',
      emailFallback: 'pâ€¢â€¢â€¢@tvps.example.in',
      testCode: '4821',
    });
    await tick();
    harness.detectChanges();
    expect(el().querySelector('.cp-af h1')?.textContent).toBe("Verify it's you");
    expect(el().querySelector('.demo-hint b')?.textContent).toBe('4821');

    const digits = [...el().querySelectorAll<HTMLInputElement>('.cp-otp input')];
    expect(digits).toHaveLength(4);
    '4821'.split('').forEach((d, i) => {
      digits[i]!.value = d;
      digits[i]!.dispatchEvent(new Event('input'));
    });
    const verify = await request('/api/v1/auth/console/otp/verify', 'POST');
    expect(verify.request.body).toEqual({ challengeId: 'c-1', otp: '4821' });
    verify.flush({ sessionId: 's-1', name: 'PRAKASH SHETTY', csrfToken: 'x' });
    (await request('/api/v1/console/session')).flush(consoleSession);
    // The guard of /console asks again on arrival.
    (await request('/api/v1/console/session')).flush(consoleSession);
    await harness.fixture.whenStable();
    for (let i = 0; i < 20 && !el().querySelector('.c-ph h1'); i++) {
      await tick();
      harness.detectChanges();
    }
    expect(TestBed.inject(Router).url).toBe('/console');
    expect(el().querySelector('.c-ph h1')?.textContent).toMatch(
      /^Good (morning|afternoon|evening), Prakash$/,
    );
    expect(el().querySelector('.c-ph p')?.textContent).toContain('Tunga Valley Public School');
    // The menu's parent tasks (prototype v4): Dashboard and Reports are single pages.
    const rows = [...el().querySelectorAll('.nv-solo, .nv-par')].map((g) => g.textContent?.trim());
    expect(rows).toEqual(['Dashboard', 'People', 'Approvals', 'Reports']);
    const items = [...el().querySelectorAll('.nv-item')].map((a) => a.textContent?.trim());
    expect(items).toEqual(['Members', 'Onboard members', 'Approvals']);
    // The home's key tasks as cards, then the figures.
    const cards = [...el().querySelectorAll('.tl-card .tl-t')].map((c) => c.textContent);
    expect(cards).toEqual(['People', 'Approvals', 'Reports']);
    expect(el().querySelector('.c-user b')?.textContent).toBe('Prakash Shetty');
  });

  it('asks someone at several institutions which to open, and switches from the menu (client 2026-10-27)', async () => {
    const A = {
      id: 'i-1',
      name: 'Tunga Valley Public School',
      shortName: 'TVPS',
      city: 'Shivamogga',
      logoUrl: null,
    };
    const B = {
      id: 'i-2',
      name: 'Sharavathi Vidyalaya',
      shortName: 'SV',
      city: 'Sagar',
      logoUrl: null,
    };
    const atB = {
      ...consoleSession,
      institution: { id: 'i-2', name: B.name, shortName: 'SV', city: 'Sagar' },
    };
    const iso = new Date(Date.now() + 900_000).toISOString();
    const isRefresh = (url: unknown) => String(url).endsWith('/api/v1/auth/token/refresh');
    // The token renewal; anything else (the card reader's status check) finds nothing.
    const fetchMock = vi.fn(async (url: unknown) =>
      isRefresh(url)
        ? Response.json({ accessTokenExpiresAt: iso, refreshTokenExpiresAt: iso })
        : new Response(null, { status: 404 }),
    );
    const renewals = () => fetchMock.mock.calls.filter(([url]) => isRefresh(url)).length;
    vi.stubGlobal('fetch', fetchMock);
    document.cookie = 'rp_console_csrf=tok; path=/';
    try {
      const harness = await RouterTestingHarness.create('/console/signin');
      const el = () => harness.routeNativeElement as HTMLElement;
      const type = (sel: string, v: string) => {
        const input = el().querySelector<HTMLInputElement>(sel)!;
        input.value = v;
        input.dispatchEvent(new Event('input'));
      };
      type('#cp-au-email', 'prakash.shetty@tvps.example.in');
      type('#cp-au-pw', 'Tvps@2026');
      el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
      (await request('/api/v1/auth/console/signin', 'POST')).flush({
        challengeId: 'c-1',
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        resendAfterSeconds: 60,
        sentTo: 'â€¢â€¢â€¢â€¢â€¢â€¢1201',
        channel: 'SMS',
        emailFallback: null,
      });
      await tick();
      harness.detectChanges();
      [...el().querySelectorAll<HTMLInputElement>('.cp-otp input')].forEach((d, i) => {
        d.value = '4821'[i]!;
        d.dispatchEvent(new Event('input'));
      });
      (await request('/api/v1/auth/console/otp/verify', 'POST')).flush({
        sessionId: 's-1',
        name: 'PRAKASH SHETTY',
        institutions: [A, B],
      });
      (await request('/api/v1/console/session')).flush(consoleSession);
      for (let i = 0; i < 5; i++) await tick();
      harness.detectChanges();
      // Before the console: which institution to open.
      expect(el().querySelector('.cp-af h1')?.textContent).toBe('Choose institution');
      const items = [...el().querySelectorAll<HTMLButtonElement>('#inst-list .li')];
      expect(items.map((b) => b.querySelector('.li-t')?.textContent)).toEqual([A.name, B.name]);
      expect(items[1]!.querySelector('.li-s')?.textContent).toBe('Sagar');
      items[1]!.click();
      const put = await request('/api/v1/console/me/institution', 'PUT');
      expect(put.request.body).toEqual({ institutionId: 'i-2' });
      put.flush({ institutionId: 'i-2', profileId: 'p-2' });
      // The tokens are renewed for the chosen institution, then the console opens there.
      (await request('/api/v1/console/session')).flush(atB);
      expect(renewals()).toBe(1);
      (await request('/api/v1/console/me/institutions')).flush({
        current: 'i-2',
        institutions: [A, B],
      });
      for (let i = 0; i < 20 && !el().querySelector('#c-switch'); i++) {
        await tick();
        harness.detectChanges();
      }
      expect(TestBed.inject(Router).url).toBe('/console');
      expect(el().querySelector('.c-brand b')?.textContent).toBe(B.name);

      // "Switch institution" in the menu: the console opens afresh for the other one.
      const restart = vi
        .spyOn(TestBed.inject(SessionContext), 'restart')
        .mockImplementation(() => undefined);
      el().querySelector<HTMLButtonElement>('#c-switch')!.click();
      harness.detectChanges();
      const modal = document.querySelector('.modal') as HTMLElement;
      expect(modal.querySelector('h3')?.textContent).toBe('Switch institution');
      const current = [...modal.querySelectorAll('#inst-list .li')].find((b) =>
        b.textContent?.includes('Current'),
      );
      expect(current?.querySelector('.li-t')?.textContent).toBe(B.name);
      modal.querySelector<HTMLButtonElement>('#inst-list .li')!.click();
      const back = await request('/api/v1/console/me/institution', 'PUT');
      expect(back.request.body).toEqual({ institutionId: 'i-1' });
      back.flush({ institutionId: 'i-1', profileId: 'p-1' });
      for (let i = 0; i < 20 && !restart.mock.calls.length; i++) await tick();
      expect(renewals()).toBe(2);
      expect(restart).toHaveBeenCalledWith('/console');
    } finally {
      document.cookie = 'rp_console_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
      vi.unstubAllGlobals();
    }
  });

  it('shows the register message when sign-in is refused', async () => {
    const harness = await RouterTestingHarness.create('/backoffice/signin');
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.querySelector('.cp-af h1')?.textContent?.trim()).toBe('Back office sign-in');
    const set = (sel: string, v: string) => {
      const i = el.querySelector<HTMLInputElement>(sel)!;
      i.value = v;
      i.dispatchEvent(new Event('input'));
    };
    set('#cp-au-email', 'arjun@campusone.example');
    set('#cp-au-pw', 'Wrong@2026');
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    (await request('/api/v1/ops/auth/signin', 'POST')).flush(
      problem('IDN.CONSOLE_SIGNIN_REFUSED', 'x'),
      unauthenticated,
    );
    await tick();
    harness.detectChanges();
    expect(el.querySelector('.note.tone-bad')?.textContent?.trim()).toBe(
      "That email and password don't match. Give it another go.",
    );
  });

  it('opens an operator page with its title; the operator menu follows the grants', async () => {
    const harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/backoffice/logs');
    (await request('/api/v1/ops/session')).flush({
      name: 'IMRAN SHEIKH',
      email: 'imran@campusone.example',
      role: { code: 'LOG_ANALYST', name: 'Log Analyst' },
      subTasks: ['home.view', 'logs.query', 'task.home', 'task.logs'],
      preferredLang: 'en',
    });
    await nav;
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.querySelector('.c-app')?.classList.contains('op')).toBe(true);
    expect(el.querySelector('.c-ph h1')?.textContent).toBe('Log analyser');
    expect(el.querySelector('#lg-form')).not.toBeNull();
    const items = [...el.querySelectorAll('.nv-solo, .nv-item')].map((a) => a.textContent?.trim());
    expect(items).toEqual(['Dashboard', 'Log analyser']);
    expect(el.querySelector('.c-crumbs')?.textContent).toContain('Governance');
  });

  it('opens one task at a time and folds the menu to its icon rail, remembered (prototype v4)', async () => {
    localStorage.removeItem('rp.nav.mini');
    try {
      const harness = await RouterTestingHarness.create();
      const nav = harness.navigateByUrl('/backoffice/logs');
      (await request('/api/v1/ops/session')).flush({
        name: 'IMRAN SHEIKH',
        email: 'imran@campusone.example',
        role: { code: 'LOG_ANALYST', name: 'Log Analyst' },
        subTasks: ['home.view', 'logs.query', 'task.home', 'task.logs'],
        preferredLang: 'en',
      });
      await nav;
      harness.detectChanges();
      const el = harness.routeNativeElement as HTMLElement;
      const grp = el.querySelector('.nv-grp[data-grp="gov"]')!;
      const par = grp.querySelector('.nv-par') as HTMLButtonElement;
      const sub = grp.querySelector('.nv-sub')!;
      // The open page's task is open, its page marked.
      expect(grp.classList).toContain('open');
      expect(grp.classList).toContain('has-on');
      expect(par.getAttribute('aria-expanded')).toBe('true');
      expect(sub.hasAttribute('inert')).toBe(false);
      expect(grp.querySelector('.nv-item.on')?.getAttribute('aria-current')).toBe('page');
      // Pressing the task folds it, and opens it again.
      par.click();
      harness.detectChanges();
      expect(grp.classList).not.toContain('open');
      expect(par.getAttribute('aria-expanded')).toBe('false');
      expect(sub.hasAttribute('inert')).toBe(true);
      par.click();
      harness.detectChanges();
      expect(grp.classList).toContain('open');
      // On a wide screen the sidebar button folds the menu to its icon rail, and back.
      const rail = el.querySelector('.c-top .nv-rail') as HTMLButtonElement;
      expect(rail.getAttribute('aria-expanded')).toBe('true');
      expect(rail.getAttribute('aria-label')).toBe('Collapse sidebar');
      rail.click();
      harness.detectChanges();
      expect(el.querySelector('.c-app')?.classList.contains('rail')).toBe(true);
      expect(rail.getAttribute('aria-expanded')).toBe('false');
      expect(rail.getAttribute('aria-label')).toBe('Expand sidebar');
      expect(localStorage.getItem('rp.nav.mini')).toBe('1');
      // On the rail, a task's icon opens the full menu at that task.
      par.click();
      harness.detectChanges();
      expect(el.querySelector('.c-app')?.classList.contains('rail')).toBe(false);
      expect(grp.classList).toContain('open');
      expect(localStorage.getItem('rp.nav.mini')).toBe('0');
    } finally {
      localStorage.removeItem('rp.nav.mini');
    }
  });
});

describe('web session helpers', () => {
  it('knows the surface of an API path', () => {
    expect(surfaceOfPath('/api/v1/console/session')).toBe('console');
    expect(surfaceOfPath('/api/v1/ops/settings')).toBe('ops');
    expect(surfaceOfPath('/api/v1/auth/signout')).toBeUndefined();
  });

  it('reads the CSRF cookie of a surface only', () => {
    const cookies = '__Host-rp_ops_csrf=aaa; __Host-rp_console_csrf=b%2Bc; other=1';
    expect(csrfToken('console', cookies)).toBe('b+c');
    expect(csrfToken('ops', cookies)).toBe('aaa');
    expect(csrfToken('portal', cookies)).toBeUndefined();
    // A plain-HTTP test server on the LAN sets it without the __Host- prefix (COOKIE_SECURE=false).
    expect(csrfToken('console', 'rp_console_csrf=lan; other=1')).toBe('lan');
    expect(csrfToken('portal', 'rp_console_csrf=lan')).toBeUndefined();
  });
});
