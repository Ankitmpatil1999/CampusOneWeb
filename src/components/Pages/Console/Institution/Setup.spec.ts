import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';

const tick = () => new Promise((r) => setTimeout(r, 0));

async function request(url: string, method = 'GET') {
  const ctl = TestBed.inject(HttpTestingController);
  for (let i = 0; i < 60; i++) {
    const found = ctl.match((r) => r.urlWithParams === url && r.method === method);
    if (found[0]) return found[0];
    await tick();
  }
  throw new Error(`no ${method} ${url}`);
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
  subTasks: ['home.view', 'config.view', 'config.edit', 'task.home', 'task.config'],
  preferredLang: 'en',
};

const institution = {
  id: 'i-1',
  identifier: 'RPETUNSHI000011026',
  name: 'Tunga Valley Public School',
  shortName: 'TVPS',
  address: '14, 2nd Cross, Vidyanagar, Shivamogga, Karnataka 577203',
  city: 'Shivamogga',
  pinCode: '577203',
  board: 'CBSE',
  officePhone: '08182 245 610',
  officeEmail: 'office@tvps.example.in',
  status: 'ACTIVE',
  contacts: {
    primary: {
      name: 'Prakash Shetty',
      email: 'prakash.shetty@tvps.example.in',
      mobile: '9845012345',
    },
    secondary: null,
  },
  administrator: { name: 'PRAKASH SHETTY', email: 'prakash.shetty@tvps.example.in' },
  corporateCode: 'RPTV',
  consentValidityMonths: 3,
  logo: null,
  feeAccount: null,
  plan: { id: 'p-1', name: 'Campus Plus', code: 'PL-PLUS' },
  features: [
    {
      key: 'quiz',
      label: 'Financial literacy quiz',
      sub: '',
      consoleLabel: 'Financial literacy',
      consoleSub: 'Quizzes and leaderboards for students (CR-01)',
      icon: 'bulb',
      module: null,
      group: 'Campus',
      cr: 'CR-01',
      enabled: true,
      lock: null,
    },
    {
      key: 'tuition',
      label: 'Tuition-fee collection',
      sub: '',
      consoleLabel: 'Tuition-fee collection',
      consoleSub: 'Collect fees from the campus wallet into the fee account',
      icon: 'receipt',
      module: 'Fees',
      group: 'Money',
      cr: null,
      enabled: true,
      lock: null,
    },
  ],
  channels: [
    {
      key: 'IN_APP',
      label: 'In-app',
      consoleSub: 'Always on',
      icon: 'bell',
      allowance: null,
      enabled: true,
      lock: { kind: 'ALWAYS_ON', text: "In-app notifications can't be switched off." },
    },
    {
      key: 'SMS',
      label: 'SMS',
      consoleSub: 'One-time codes',
      icon: 'chat',
      allowance: 15000,
      enabled: true,
      lock: null,
    },
  ],
  version: 11,
};

describe('console set-up (INS-010…019)', () => {
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

  async function open(url: string) {
    const harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl(url);
    (await request('/api/v1/console/session')).flush(session);
    await nav;
    return harness;
  }

  const confirm = async (label: string) => {
    await tick();
    const dialog = document.querySelector('.modal') as HTMLElement;
    [...dialog.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)?.click();
  };

  it('saves only what changed, with If-Match; the administrator switches features', async () => {
    const harness = await open('/console/institution');
    (await request('/api/v1/console/institution')).flush(institution);
    for (let i = 0; i < 5; i++) await tick();
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    const features = [...el.querySelectorAll('.cp-tg .li-t')].map((x) => x.textContent?.trim());
    expect(features.slice(0, 2)).toEqual(['Tuition-fee collection', 'Financial literacy']);
    expect((el.querySelector('.cp-tg .toggle') as HTMLButtonElement).disabled).toBe(false);

    const pin = el.querySelector('#cp-in-pin') as HTMLInputElement;
    pin.value = '577204';
    pin.dispatchEvent(new Event('input'));
    const sms = [...el.querySelectorAll('.cp-chrow')]
      .find((r) => r.textContent?.includes('SMS'))
      ?.querySelector('.toggle') as HTMLButtonElement;
    sms.click();
    const quiz = [...el.querySelectorAll('.cp-tg .li')]
      .find((r) => r.textContent?.includes('Financial literacy'))
      ?.querySelector('.toggle') as HTMLButtonElement;
    quiz.click();
    harness.detectChanges();
    (el.querySelector('.row.end .btn-pri') as HTMLButtonElement).click();
    await tick();
    harness.detectChanges();
    expect(document.querySelector('.modal')?.textContent).toContain(
      "You're changing: PIN code, Financial literacy off, SMS off. Switched-off features disappear from every member's app straight away and their operations are refused.",
    );
    await confirm('Save settings');
    const patch = await request('/api/v1/console/institution', 'PATCH');
    expect(patch.request.headers.get('If-Match')).toBe('"v11"');
    expect(patch.request.body).toEqual({
      pinCode: '577204',
      channels: { SMS: false },
      features: { quiz: false },
    });
  });

  it('creates a user type with the kind guessed from its name and its departments', async () => {
    const harness = await open('/console/roles');
    (await request('/api/v1/console/user-types')).flush({ items: [] });
    for (let i = 0; i < 5; i++) await tick();
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    (el.querySelector('.c-ph .btn-pri') as HTMLButtonElement).click();
    await tick();
    harness.detectChanges();
    const drawer = document.querySelector('.drawer') as HTMLElement;
    const name = drawer.querySelector('#cp-ut-name') as HTMLInputElement;
    name.value = 'Visiting teacher';
    name.dispatchEvent(new Event('input'));
    const save = () =>
      [...drawer.querySelectorAll('button')]
        .find((b) => b.textContent?.trim() === 'Create user type')
        ?.click();
    save();
    harness.detectChanges();
    expect(drawer.textContent).toContain(
      'Please enter both a role name and at least one department.',
    );
    const dept = drawer.querySelector('#cp-ut-new') as HTMLInputElement;
    dept.value = 'Music';
    dept.dispatchEvent(new Event('input'));
    [...drawer.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Add')?.click();
    harness.detectChanges();
    expect(drawer.querySelector('.dd-btn .lbl')?.textContent?.trim()).toBe('Teacher');
    save();
    const post = await request('/api/v1/console/user-types', 'POST');
    expect(post.request.body).toEqual({
      name: 'Visiting teacher',
      category: 'TEACHER',
      departments: ['Music'],
    });
  });

  it('defines a field only with the identity-document acknowledgement', async () => {
    const harness = await open('/console/fields');
    (await request('/api/v1/console/custom-fields')).flush({ maxActivePerEntity: 15, items: [] });
    for (let i = 0; i < 5; i++) await tick();
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    (el.querySelector('.c-ph .btn-pri') as HTMLButtonElement).click();
    await tick();
    harness.detectChanges();
    const drawer = document.querySelector('.drawer') as HTMLElement;
    const label = drawer.querySelector('#cp-fd-label') as HTMLInputElement;
    label.value = 'Aadhaar number';
    label.dispatchEvent(new Event('input'));
    const create = () =>
      [...drawer.querySelectorAll('button')]
        .find((b) => b.textContent?.trim() === 'Create field')
        ?.click();
    create();
    harness.detectChanges();
    expect(drawer.textContent).toContain('This label suggests an identity-document number.');
    expect(drawer.textContent).toContain(
      "Confirm that this field won't capture identity-document numbers",
    );
    label.value = 'House';
    label.dispatchEvent(new Event('input'));
    (drawer.querySelector('.cp-ack input') as HTMLInputElement).click();
    harness.detectChanges();
    create();
    const post = await request('/api/v1/console/custom-fields', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({
      entity: 'MEMBER',
      label: 'House',
      type: 'TEXT',
      required: false,
      unique: false,
      listColumn: false,
      filter: false,
      active: true,
      noIdDocAck: true,
    });
  });
});
