import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import type { NotifyEvent, NotifyEventList } from './notify-events.api';

const tick = () => new Promise((r) => setTimeout(r, 0));
async function request(url: string, method = 'GET') {
  const ctl = TestBed.inject(HttpTestingController);
  for (let i = 0; i < 80; i++) {
    const found = ctl.match((r) => r.urlWithParams === url && r.method === method);
    if (found[0]) return found[0];
    await tick();
  }
  throw new Error(`no ${method} ${url}`);
}

const session = (subTasks: string[], readOnly = false) => ({
  name: 'PRAKASH SHETTY',
  email: 'prakash.shetty@tvps.example.in',
  institution: { id: 'i-1', name: 'Tunga Valley Public School', shortName: 'TVPS', city: 'X' },
  roles: [{ code: 'INSTITUTION_ADMIN', name: 'Institution Administrator', readOnly }],
  subTasks: ['home.view', 'task.home', 'task.config', ...subTasks],
  preferredLang: 'en',
});

const ev = (event: string, label: string, over: Partial<NotifyEvent> = {}): NotifyEvent => ({
  event,
  label,
  description: `${label}: the student and parents`,
  email: true,
  alert: true,
  version: 0,
  ...over,
});
const listOf = (emailChannel = true, over: Partial<NotifyEvent> = {}): NotifyEventList => ({
  emailChannel,
  items: [
    ev('FEE_ASSIGNED', 'Fee assigned', over),
    ev('FEE_DUE', 'Fee due reminder'),
    ev('ATTENDANCE', 'Absent'),
  ],
});

describe('notification settings in the console (COM-032/033; client 2026-10-16)', () => {
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

  async function settle(n = 5) {
    for (let i = 0; i < n; i++) await tick();
    harness.detectChanges();
  }
  const text = (sel: string) => {
    const parts: string[] = [];
    const walk = (n: Node) => {
      if (n.nodeType === Node.TEXT_NODE) parts.push(n.textContent ?? '');
      else n.childNodes.forEach(walk);
      if (n.nodeType === Node.ELEMENT_NODE) parts.push(' ');
    };
    const el = document.querySelector(sel);
    if (el) walk(el);
    return parts.join('').replace(/\s+/g, ' ').trim();
  };
  const sw = (id: string) => document.getElementById(id) as HTMLButtonElement;

  async function open(subTasks: string[], list: NotifyEventList, readOnly = false) {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/notifyevents');
    (await request('/api/v1/console/session')).flush(session(subTasks, readOnly));
    await nav;
    (await request('/api/v1/console/notification-events')).flush(list);
    await settle();
  }

  it('lists every event with e-mail and the phone alert on', async () => {
    await open(['config.view', 'config.edit'], listOf());
    expect(text('#ne-table')).toContain('Fee assigned');
    expect(text('#ne-table')).toContain('Fee due reminder: the student and parents');
    expect(sw('ne-email-FEE_ASSIGNED').getAttribute('aria-checked')).toBe('true');
    expect(sw('ne-alert-ATTENDANCE').getAttribute('aria-checked')).toBe('true');
    expect(document.getElementById('ne-email-off')).toBeNull();
    expect(sw('ne-save').disabled).toBe(true);
  });

  it('saves only the changed events with the version each was read at', async () => {
    await open(['config.view', 'config.edit'], listOf(true, { version: 2 }));
    sw('ne-email-FEE_ASSIGNED').click();
    sw('ne-alert-FEE_ASSIGNED').click();
    sw('ne-alert-ATTENDANCE').click();
    sw('ne-alert-ATTENDANCE').click(); // back as it was: not sent
    await settle();
    expect(sw('ne-email-FEE_ASSIGNED').getAttribute('aria-checked')).toBe('false');
    sw('ne-save').click();
    const patch = await request('/api/v1/console/notification-events', 'PATCH');
    expect(patch.request.body).toEqual({
      changes: [{ event: 'FEE_ASSIGNED', version: 2, email: false, alert: false }],
    });
    patch.flush(listOf(true, { email: false, alert: false, version: 3 }));
    await settle();
    expect(sw('ne-email-FEE_ASSIGNED').getAttribute('aria-checked')).toBe('false');
    expect(sw('ne-save').disabled).toBe(true);
  });

  it('says when e-mail is switched off for the school, and is read-only without config.edit', async () => {
    await open(['config.view'], listOf(false));
    expect(text('#ne-email-off')).toContain('E-mail is switched off for your school');
    expect(sw('ne-email-FEE_DUE').disabled).toBe(true);
    expect(sw('ne-save').disabled).toBe(true);
  });
});
