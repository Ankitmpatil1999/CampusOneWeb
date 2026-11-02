import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
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
  subTasks: ['home.view', 'members.view', 'members.onboard', 'task.home', 'task.members'],
  preferredLang: 'en',
};

describe('console onboarding (IDN-047, IDN-048, IDN-053)', () => {
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

  it('checks the mobile, then onboards a student with the primary contact as a new parent', async () => {
    const harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/onboard');
    (await request('/api/v1/console/session')).flush(session);
    await nav;
    (await request('/api/v1/console/user-types')).flush({
      items: [
        {
          id: 'ut-s',
          name: 'Student',
          category: 'STUDENT',
          status: 'ACTIVE',
          members: 0,
          departments: [{ id: 'd-1', name: 'Middle school', members: 0 }],
          version: 1,
        },
        {
          id: 'ut-t',
          name: 'Teacher',
          category: 'TEACHER',
          status: 'ACTIVE',
          members: 0,
          departments: [{ id: 'd-2', name: 'Primary', members: 0 }],
          version: 1,
        },
        {
          id: 'ut-p',
          name: 'Parent',
          category: 'PARENT',
          status: 'ACTIVE',
          members: 0,
          departments: [],
          version: 1,
        },
      ],
    });
    (await request('/api/v1/console/classes')).flush({
      year: { id: 'y-1', label: '2026-27' },
      items: [
        {
          id: 'c-7',
          name: 'Grade 7',
          order: 9,
          students: 0,
          version: 1,
          sections: [{ id: 's-7b', name: 'B', capacity: null, students: 0 }],
        },
      ],
    });
    (await request('/api/v1/console/custom-fields')).flush({ maxActivePerEntity: 15, items: [] });
    for (let i = 0; i < 4; i++) await tick();
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    // No bulk upload of members (client 2026-10-23): existing students come in through Applications.
    expect([...el.querySelectorAll('.tabs .tab')].map((t) => t.textContent?.trim())).toEqual([
      'Single member',
      'Staff',
      'Bulk profile update',
    ]);
    expect(el.textContent).not.toContain('Upload a spreadsheet');

    const mob = el.querySelector('#cp-ob-mob') as HTMLInputElement;
    mob.value = '9886112345';
    mob.dispatchEvent(new Event('input'));
    harness.detectChanges();
    [...el.querySelectorAll('button')]
      .find((b) => b.textContent?.includes('Check eligibility'))
      ?.click();
    const check = await request('/api/v1/console/members/eligibility', 'POST');
    expect(check.request.body).toEqual({ mobile: '9886112345' });
    check.flush({ eligible: true, code: 'IDN.NEW_PERSON', account: false, profiles: [] });
    await tick();
    harness.detectChanges();
    expect(el.textContent).toContain('This number is new to CampusOne');
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Continue'))?.click();
    harness.detectChanges();
    // Students only (client 2026-10-19): a teacher is onboarded on the Staff tab.
    (el.querySelector('#cp-ob-ut-b') as HTMLButtonElement).click();
    harness.detectChanges();
    await tick();
    expect([...document.querySelectorAll('.dd-opt')].map((o) => o.textContent?.trim())).toEqual([
      'Student',
    ]);
    (el.querySelector('#cp-ob-ut-b') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(el.querySelector('#cp-ob-students-only')?.textContent).toContain('Staff tab');

    const type = (id: string, v: string) => {
      const i = el.querySelector(`#cp-ob-${id}`) as HTMLInputElement;
      i.value = v;
      i.dispatchEvent(new Event('input'));
    };
    type('first', 'Aarav');
    type('last', 'Hegde');
    type('dob', '2014-04-12');
    type('adm', 'TVPS/2026/0001');
    type('pcn', 'Mahesh Hegde');
    type('pce', 'mahesh@example.in');
    harness.detectChanges();
    const pick = async (dd: string, label: string) => {
      (el.querySelector(`#${dd}-b`) as HTMLButtonElement).click();
      harness.detectChanges();
      await tick();
      const opt = [
        ...document.querySelectorAll('.dd-menu [role="option"], .dd-opt, .dd-menu button'),
      ].find((o) => o.textContent?.trim() === label) as HTMLElement | undefined;
      opt?.click();
      harness.detectChanges();
    };
    await pick('cp-ob-gender', 'Male');
    await pick('cp-ob-cls', 'Grade 7');
    await pick('cp-ob-sec', 'Section B');
    await pick('cp-ob-rel', 'Father');
    [...el.querySelectorAll('button')]
      .find((b) => b.textContent?.includes('Create member'))
      ?.click();
    const post = await request('/api/v1/console/members', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toMatchObject({
      userTypeId: 'ut-s',
      departmentId: 'd-1',
      firstName: 'Aarav',
      lastName: 'Hegde',
      gender: 'MALE',
      dateOfBirth: '2014-04-12',
      admissionNo: 'TVPS/2026/0001',
      sectionId: 's-7b',
      mobile: null,
      guardians: [
        {
          firstName: 'Mahesh',
          lastName: 'Hegde',
          mobile: '9886112345',
          email: 'mahesh@example.in',
          relation: 'FATHER',
        },
      ],
    });
    post.flush({ id: 'm-9', memberNo: 'TVPS-00099', guardians: ['m-10'] });
    await tick();
    harness.detectChanges();
    expect(el.textContent).toContain('Aarav Hegde is onboarded');
    expect(el.textContent).toContain('TVPS-00099');
  });

  // 2026-10-15: "I have uploaded the logo, but it is not reflecting anywhere."
  it('shows the school’s logo at the head of the menu', async () => {
    const harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/onboard');
    const logoUrl = '/api/v1/public/institutions/i-1/logo?v=0123456789ab';
    (await request('/api/v1/console/session')).flush({
      ...session,
      institution: { ...session.institution, logoUrl },
    });
    await nav;
    for (let i = 0; i < 4; i++) await tick();
    harness.detectChanges();
    const img = document.querySelector<HTMLImageElement>('#c-logo')!;
    expect(img.getAttribute('src')).toBe(logoUrl);
    expect(img.alt).toBe('Tunga Valley Public School logo');
  });

  // 2026-10-14: "A Merchant user type doesn't appear in the User Type dropdown when adding staff."
  it('says where a merchant is registered instead of offering Merchant as staff', async () => {
    const harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/onboard?tab=Staff');
    (await request('/api/v1/console/session')).flush({
      ...session,
      subTasks: [...session.subTasks, 'task.merchants', 'merchants.view', 'merchants.edit'],
    });
    await nav;
    const type = (id: string, name: string, category: string) => ({
      id,
      name,
      category,
      status: 'ACTIVE',
      members: 0,
      departments: [],
      version: 1,
    });
    (await request('/api/v1/console/user-types')).flush({
      items: [type('ut-t', 'Teacher', 'TEACHER'), type('ut-m', 'Canteen', 'MERCHANT')],
    });
    (await request('/api/v1/console/classes')).flush({ year: null, items: [] });
    (await request('/api/v1/console/custom-fields')).flush({ maxActivePerEntity: 15, items: [] });
    for (let i = 0; i < 4; i++) await tick();
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    (el.querySelector('#cp-ob-ut-b') as HTMLButtonElement).click();
    harness.detectChanges();
    await tick();
    const options = [...document.querySelectorAll('.dd-menu .dd-opt')].map((o) =>
      o.textContent?.trim(),
    );
    expect(options).toEqual(['Teacher']);
    expect(el.querySelector('#cp-ob-merchant')?.textContent).toContain(
      "Merchants aren't staff: register them in Merchants & QR",
    );
    const go = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    (el.querySelector('#cp-ob-merchant-go') as HTMLButtonElement).click();
    expect(go).toHaveBeenCalledWith(['/console/merchants'], { queryParams: { register: 1 } });
  });

  // Client 2026-10-22: the console role is chosen as the staff member is onboarded.
  it('gives a staff member the console role chosen on the form', async () => {
    const harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/onboard?tab=Staff');
    (await request('/api/v1/console/session')).flush({
      ...session,
      subTasks: [...session.subTasks, 'members.roles'],
    });
    await nav;
    const type = (id: string, name: string, category: string) => ({
      id,
      name,
      category,
      status: 'ACTIVE',
      members: 0,
      departments: [{ id: `d-${id}`, name: 'Primary', members: 0 }],
      version: 1,
    });
    (await request('/api/v1/console/user-types')).flush({
      items: [type('ut-t', 'Teacher', 'TEACHER'), type('ut-p', 'Principal', 'PRINCIPAL')],
    });
    (await request('/api/v1/console/classes')).flush({ year: null, items: [] });
    (await request('/api/v1/console/custom-fields')).flush({ maxActivePerEntity: 15, items: [] });
    const role = (id: string, code: string, name: string, assignable = true) => ({
      id,
      code,
      name,
      description: null,
      readOnly: false,
      assignable,
      tasks: [],
      subTasks: [],
    });
    (await request('/api/v1/console/roles')).flush({
      items: [
        role('r-admin', 'INSTITUTION_ADMIN', 'Institution Administrator', false),
        role('r-teacher', 'TEACHER', 'Teacher'),
        role('r-principal', 'PRINCIPAL', 'Principal'),
        role('r-acc', 'ACCOUNTANT', 'Accountant'),
        role('r-merchant', 'MERCHANT', 'Merchant'),
      ],
    });
    for (let i = 0; i < 4; i++) await tick();
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    const options = async (id: string) => {
      (el.querySelector(`#${id}-b`) as HTMLButtonElement).click();
      harness.detectChanges();
      await tick();
      return [...document.querySelectorAll('.dd-menu .dd-opt')] as HTMLElement[];
    };
    const label = (o: HTMLElement) => o.querySelector('span')!.textContent!.trim();
    /** Picks from an open menu (it closes). */
    const choose = async (open: HTMLElement[], l: string) => {
      open.find((o) => label(o) === l)!.click();
      harness.detectChanges();
      await tick();
    };
    const pick = async (id: string, l: string) => choose(await options(id), l);
    const fill = (id: string, v: string) => {
      const i = el.querySelector(`#${id}`) as HTMLInputElement;
      i.value = v;
      i.dispatchEvent(new Event('input'));
    };
    // The sheet's Role column takes the same roles.
    expect(el.querySelector('#cp-bu-roles')?.textContent?.replace(/\s+/g, ' ')).toContain(
      'Teacher, Principal, Accountant — or None',
    );

    await pick('cp-ob-ut', 'Teacher');
    // Not the administrator's role (CampusOne's), the principal's or a merchant's.
    const roles = await options('cp-sf-role');
    expect(roles.map(label)).toEqual(['No console role', 'Teacher', 'Accountant']);
    await choose(roles, 'Teacher');
    await pick('cp-sf-gender', 'Female');
    fill('cp-ob-first', 'Kavya');
    fill('cp-ob-dob', '1990-07-12');
    fill('cp-sf-mob', '9845098450');
    fill('cp-ob-email', 'kavya.rao@school.example.in');
    harness.detectChanges();
    [...el.querySelectorAll('button')]
      .find((b) => b.textContent?.includes('Onboard staff member'))!
      .click();
    const post = await request('/api/v1/console/staff', 'POST');
    expect(post.request.body).toMatchObject({ userTypeId: 'ut-t', roleId: 'r-teacher' });
    post.flush({
      id: 'm-1',
      memberNo: 'TVPS-00042',
      employeeNo: 'EMP00007',
      newAccount: false,
      role: 'Teacher',
    });
    for (let i = 0; i < 4; i++) await tick();
    harness.detectChanges();
    expect(el.querySelector('#cp-sf-done-role')?.textContent?.trim()).toBe('Teacher');

    // The role is chosen every time — a role, or No console role — and one that fits the type.
    await pick('cp-ob-ut', 'Principal');
    const principal = await options('cp-sf-role');
    expect(principal.map(label)).toContain('Principal');
    await choose(principal, 'No console role');
    await pick('cp-ob-ut', 'Teacher');
    // No console role fits every type; the request then carries no role.
    fill('cp-ob-first', 'Ravi');
    await pick('cp-sf-gender', 'Male');
    fill('cp-ob-dob', '1988-01-02');
    fill('cp-sf-mob', '9845098451');
    fill('cp-ob-email', 'ravi@school.example.in');
    harness.detectChanges();
    [...el.querySelectorAll('button')]
      .find((b) => b.textContent?.includes('Onboard staff member'))!
      .click();
    const plain = await request('/api/v1/console/staff', 'POST');
    expect(plain.request.body).not.toHaveProperty('roleId');
  });

  it('asks for the console role before onboarding a staff member', async () => {
    const harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/onboard?tab=Staff');
    (await request('/api/v1/console/session')).flush({
      ...session,
      subTasks: [...session.subTasks, 'members.roles'],
    });
    await nav;
    (await request('/api/v1/console/user-types')).flush({ items: [] });
    (await request('/api/v1/console/classes')).flush({ year: null, items: [] });
    (await request('/api/v1/console/custom-fields')).flush({ maxActivePerEntity: 15, items: [] });
    (await request('/api/v1/console/roles')).flush({ items: [] });
    for (let i = 0; i < 4; i++) await tick();
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    [...el.querySelectorAll('button')]
      .find((b) => b.textContent?.includes('Onboard staff member'))!
      .click();
    harness.detectChanges();
    expect(el.querySelector('#cp-sf-role-b')?.closest('.fld')?.textContent).toContain(
      'Choose a console role, or No console role',
    );
    TestBed.inject(HttpTestingController).expectNone('/api/v1/console/staff');
  });

  it('leaves the role out for a role that cannot give console roles', async () => {
    const harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/onboard?tab=Staff');
    (await request('/api/v1/console/session')).flush(session);
    await nav;
    (await request('/api/v1/console/user-types')).flush({ items: [] });
    (await request('/api/v1/console/classes')).flush({ year: null, items: [] });
    (await request('/api/v1/console/custom-fields')).flush({ maxActivePerEntity: 15, items: [] });
    for (let i = 0; i < 4; i++) await tick();
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    TestBed.inject(HttpTestingController).expectNone('/api/v1/console/roles');
    expect(el.querySelector('#cp-sf-role-b')).toBeNull();
    expect(el.querySelector('#cp-bu-roles')?.textContent).toContain(
      "Write None in the template's Role column",
    );
  });

  it('onboards a mobile already at another institution: one login for both (client 2026-10-27)', async () => {
    const harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/onboard');
    (await request('/api/v1/console/session')).flush(session);
    await nav;
    (await request('/api/v1/console/user-types')).flush({ items: [] });
    (await request('/api/v1/console/classes')).flush({ year: null, items: [] });
    (await request('/api/v1/console/custom-fields')).flush({ maxActivePerEntity: 15, items: [] });
    for (let i = 0; i < 4; i++) await tick();
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.textContent).not.toContain('another institution');
    const mob = el.querySelector('#cp-ob-mob') as HTMLInputElement;
    mob.value = '9886154321';
    mob.dispatchEvent(new Event('input'));
    harness.detectChanges();
    [...el.querySelectorAll('button')]
      .find((b) => b.textContent?.includes('Check eligibility'))
      ?.click();
    (await request('/api/v1/console/members/eligibility', 'POST')).flush({
      eligible: true,
      code: 'IDN.ACCOUNT_EXISTS',
      account: true,
      elsewhere: true,
      profiles: [],
    });
    await tick();
    harness.detectChanges();
    expect(el.querySelector('.note.tone-ok')?.textContent?.trim()).toBe(
      'Already on CampusOne — they keep one login for both institutions.',
    );
    expect(
      [...el.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Continue'),
    ).toBe(true);
  });
});
