import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';

const tick = () => new Promise((r) => setTimeout(r, 0));

async function request(match: (url: string) => boolean, method = 'GET') {
  const ctl = TestBed.inject(HttpTestingController);
  for (let i = 0; i < 60; i++) {
    const found = ctl.match((r) => match(r.urlWithParams) && r.method === method);
    if (found[0]) return found[0];
    await tick();
  }
  throw new Error(`no ${method} request`);
}

const session = (subTasks: string[]) => ({
  name: 'PRAKASH SHETTY',
  email: 'prakash.shetty@tvps.example.in',
  institution: {
    id: 'i-1',
    name: 'Tunga Valley Public School',
    shortName: 'TVPS',
    city: 'Shivamogga',
  },
  roles: [{ code: 'INSTITUTION_ADMIN', name: 'Institution Administrator', readOnly: false }],
  subTasks: ['home.view', 'members.view', 'task.home', 'task.members', ...subTasks],
  preferredLang: 'en',
});

const staffRow = {
  id: 's-1',
  memberNo: 'TVPS-00002',
  name: 'Deepa Nayak',
  kind: 'STAFF',
  userType: { id: 'ut-t', name: 'Teacher', category: 'TEACHING' },
  department: null,
  admissionNo: null,
  employeeNo: 'EMP0002',
  grade: null,
  mobile: '9886100002',
  linked: true,
  status: 'ACTIVE',
  pending: { suspension: false, delink: false },
  customFields: {},
};

const list = {
  year: null,
  columns: [],
  filters: [],
  counts: {
    tabs: { STUDENTS: 0, PARENTS: 0, STAFF: 1, MERCHANTS: 0, ALL: 1 },
    statuses: { ACTIVE: 1, INACTIVE: 0, SUSPENDED: 0 },
  },
  items: [staffRow],
  nextCursor: null,
};

const detail = {
  id: 's-1',
  memberNo: 'TVPS-00002',
  name: 'Deepa Nayak',
  firstName: 'Deepa',
  lastName: 'Nayak',
  kind: 'STAFF',
  userType: { id: 'ut-t', name: 'Teacher', category: 'TEACHING' },
  department: null,
  gender: 'FEMALE',
  dateOfBirth: null,
  admissionNo: null,
  employeeNo: 'EMP0002',
  joinedOn: null,
  grade: null,
  contact: { mobile: '9886100002', email: 'deepa@tvps.example.in' },
  account: { linked: true, mobileMasked: '••••••0002' },
  guardians: [],
  wards: [],
  roles: [{ code: 'ACCOUNTANT', name: 'Accountant' }],
  status: 'ACTIVE',
  statusReason: null,
  statusChangedAt: null,
  pending: { suspension: false, delink: false },
  customFields: [],
  onboardedAt: '2026-06-01T05:00:00.000Z',
  lastChangedAt: null,
  version: 2,
};

const role = (id: string, code: string, name: string, over: object = {}) => ({
  id,
  code,
  name,
  description: `${name} work`,
  readOnly: false,
  assignable: true,
  tasks: ['home', 'reports'],
  subTasks: ['home.view'],
  ...over,
});
const roles = {
  items: [
    role('r-admin', 'INSTITUTION_ADMIN', 'Institution Administrator', { assignable: false }),
    role('r-acc', 'ACCOUNTANT', 'Accountant'),
    role('r-cou', 'COUNSELLOR', 'Counsellor'),
    role('r-mgt', 'MANAGEMENT', 'Management', { readOnly: true }),
  ],
};
const account = (over: object = {}) => ({
  id: 's-1',
  memberNo: 'TVPS-00002',
  name: 'Deepa Nayak',
  userType: 'Teacher',
  email: 'deepa@tvps.example.in',
  mobile: '••••••0002',
  status: 'ACTIVE',
  roles: [{ id: 'r-acc', code: 'ACCOUNTANT', name: 'Accountant' }],
  locked: false,
  lastSignInAt: '2026-10-02T04:30:00.000Z',
  ...over,
});

describe('console access of a staff member (IDN-038, IDN-060…062)', () => {
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

  async function accountTab(subTasks: string[]) {
    const harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/members?tab=STAFF');
    (await request((u) => u === '/api/v1/console/session')).flush(session(subTasks));
    await nav;
    (await request((u) => u.startsWith('/api/v1/console/members?'))).flush(list);
    (await request((u) => u === '/api/v1/console/classes')).flush({ year: null, items: [] });
    (await request((u) => u === '/api/v1/console/user-types')).flush({ items: [] });
    for (let i = 0; i < 5; i++) await tick();
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    (el.querySelector('tbody tr') as HTMLElement).click();
    (await request((u) => u === '/api/v1/console/members/s-1')).flush(detail);
    await tick();
    harness.detectChanges();
    const drawer = document.querySelector('.drawer') as HTMLElement;
    [...drawer.querySelectorAll('.tabs .tab')]
      .find((t) => t.textContent?.trim() === 'Account')
      ?.dispatchEvent(new Event('click'));
    harness.detectChanges();
    return { harness, drawer };
  }

  const confirmWith = async (harness: RouterTestingHarness, ok: string, reason?: string) => {
    await tick();
    harness.detectChanges();
    const dialog = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    if (reason !== undefined) {
      const t = dialog.querySelector('textarea') as HTMLTextAreaElement;
      t.value = reason;
      t.dispatchEvent(new Event('input'));
    }
    const title = dialog.querySelector('h3')?.textContent?.trim();
    [...dialog.querySelectorAll('button')].find((b) => b.textContent?.trim() === ok)?.click();
    return title;
  };

  it('lists the roles, gives one with a confirmation and sends the whole set', async () => {
    const { harness, drawer } = await accountTab(['members.roles', 'members.unlock']);
    (await request((u) => u === '/api/v1/console/roles')).flush(roles);
    (await request((u) => u === '/api/v1/console/staff-accounts')).flush({
      items: [account({ id: 's-9', name: 'Someone Else' }), account()],
    });
    for (let i = 0; i < 3; i++) await tick();
    harness.detectChanges();

    const access = [...drawer.querySelectorAll('.fs')].find((f) =>
      f.querySelector('h4')?.textContent?.includes('Console access'),
    ) as HTMLElement;
    expect(access.textContent).toContain('02 Oct 2026 · 10:00 AM');
    expect(access.textContent).toContain('Not locked');
    const toggles = [...access.querySelectorAll('#cp-ca-roles .toggle')] as HTMLButtonElement[];
    expect(toggles.map((t) => t.getAttribute('aria-label'))).toEqual([
      'Console role Institution Administrator',
      'Console role Accountant',
      'Console role Counsellor',
      'Console role Management',
    ]);
    expect(toggles.map((t) => t.getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
      'false',
      'false',
    ]);
    // CampusOne gives the administrator role.
    expect(toggles[0]?.disabled).toBe(true);
    expect(toggles[0]?.parentElement?.getAttribute('title')).toContain('CampusOne gives');
    expect(access.textContent).toContain('Read-only');

    toggles[2]?.click();
    expect(await confirmWith(harness, 'Give role')).toBe('Give Counsellor to Deepa Nayak?');
    const put = await request((u) => u === '/api/v1/console/staff-accounts/s-1/roles', 'PUT');
    expect(put.request.body).toEqual({ roleIds: ['r-acc', 'r-cou'] });
    put.flush(
      account({
        roles: [
          { id: 'r-acc', code: 'ACCOUNTANT', name: 'Accountant' },
          { id: 'r-cou', code: 'COUNSELLOR', name: 'Counsellor' },
        ],
      }),
    );
    for (let i = 0; i < 3; i++) await tick();
    harness.detectChanges();
    expect(document.querySelector('.toasts')?.textContent).toContain('Role given');
    expect(document.querySelector('.toasts')?.textContent).toContain(
      'Deepa Nayak · Accountant, Counsellor',
    );
    expect(toggles[2]?.getAttribute('aria-checked')).toBe('true');
    // The drawer reloads the member so the profile shows the new roles.
    await request((u) => u === '/api/v1/console/members/s-1');
  });

  // The principal's and the merchants' own roles go only to the matching profile (client 2026-10-13).
  const own = {
    items: [
      ...roles.items,
      role('r-pri', 'PRINCIPAL', 'Principal'),
      role('r-mer', 'MERCHANT', 'Merchant'),
      role('r-ven', 'VENDOR_MERCHANT', 'Vendor merchant'),
    ],
  };
  const labels = (drawer: HTMLElement) =>
    [...drawer.querySelectorAll('#cp-ca-roles .toggle')].map((t) => t.getAttribute('aria-label'));

  it('offers a teacher the staff roles, not the principal’s or a merchant’s', async () => {
    const { harness, drawer } = await accountTab(['members.roles']);
    (await request((u) => u === '/api/v1/console/roles')).flush(own);
    (await request((u) => u === '/api/v1/console/staff-accounts')).flush({
      items: [account({ category: 'TEACHER', merchantType: null })],
    });
    for (let i = 0; i < 3; i++) await tick();
    harness.detectChanges();
    expect(labels(drawer)).toEqual([
      'Console role Institution Administrator',
      'Console role Accountant',
      'Console role Counsellor',
      'Console role Management',
    ]);
  });

  it('offers a vendor merchant only the Vendor merchant role', async () => {
    const { harness, drawer } = await accountTab(['members.roles']);
    (await request((u) => u === '/api/v1/console/roles')).flush(own);
    (await request((u) => u === '/api/v1/console/staff-accounts')).flush({
      items: [account({ category: 'MERCHANT', merchantType: 'VENDOR', roles: [] })],
    });
    for (let i = 0; i < 3; i++) await tick();
    harness.detectChanges();
    expect(labels(drawer)).toEqual(['Console role Vendor merchant']);
  });

  it('shows a refused role change in register wording', async () => {
    const { harness, drawer } = await accountTab(['members.roles']);
    (await request((u) => u === '/api/v1/console/roles')).flush(roles);
    (await request((u) => u === '/api/v1/console/staff-accounts')).flush({ items: [account()] });
    for (let i = 0; i < 3; i++) await tick();
    harness.detectChanges();
    const toggles = [...drawer.querySelectorAll('#cp-ca-roles .toggle')] as HTMLButtonElement[];
    toggles[1]?.click();
    expect(await confirmWith(harness, 'Take away')).toBe('Take Accountant from Deepa Nayak?');
    const put = await request((u) => u === '/api/v1/console/staff-accounts/s-1/roles', 'PUT');
    expect(put.request.body).toEqual({ roleIds: [] });
    put.flush(
      { code: 'IDN.ROLE_NOT_ASSIGNABLE', status: 409, detail: 'x' },
      { status: 409, statusText: 'Conflict' },
    );
    for (let i = 0; i < 3; i++) await tick();
    harness.detectChanges();
    expect(document.querySelector('.toasts')?.textContent).toContain('Roles not changed');
    expect(document.querySelector('.toasts')?.textContent).toContain(
      "This role can't be given or taken away here.",
    );
    expect(toggles[1]?.getAttribute('aria-checked')).toBe('true');
  });

  it('releases a sign-in lock with a recorded reason', async () => {
    const { harness, drawer } = await accountTab(['members.roles', 'members.unlock']);
    (await request((u) => u === '/api/v1/console/roles')).flush(roles);
    (await request((u) => u === '/api/v1/console/staff-accounts')).flush({
      items: [account({ locked: true, lastSignInAt: null })],
    });
    for (let i = 0; i < 3; i++) await tick();
    harness.detectChanges();
    expect(drawer.textContent).toContain('Never signed in');
    expect(drawer.textContent).toContain('Locked');
    (drawer.querySelector('#cp-ca-unlock') as HTMLButtonElement).click();
    expect(await confirmWith(harness, 'Release lock', 'Called her; the attempts were hers')).toBe(
      'Release the sign-in lock for Deepa Nayak?',
    );
    const post = await request((u) => u === '/api/v1/console/staff-accounts/s-1/unlock', 'POST');
    expect(post.request.body).toEqual({ reason: 'Called her; the attempts were hers' });
    post.flush(null, { status: 204, statusText: 'No Content' });
    for (let i = 0; i < 3; i++) await tick();
    harness.detectChanges();
    expect(document.querySelector('.toasts')?.textContent).toContain('Sign-in lock released');
    (await request((u) => u === '/api/v1/console/roles')).flush(roles);
    (await request((u) => u === '/api/v1/console/staff-accounts')).flush({ items: [account()] });
    for (let i = 0; i < 3; i++) await tick();
    harness.detectChanges();
    expect(drawer.querySelector('#cp-ca-unlock')).toBeNull();
  });

  it('shows the roles read-only without “Assign console roles”', async () => {
    const { harness, drawer } = await accountTab([]);
    for (let i = 0; i < 3; i++) await tick();
    harness.detectChanges();
    const ctl = TestBed.inject(HttpTestingController);
    expect(ctl.match((r) => r.url === '/api/v1/console/staff-accounts').length).toBe(0);
    const access = [...drawer.querySelectorAll('.fs')].find((f) =>
      f.querySelector('h4')?.textContent?.includes('Console access'),
    ) as HTMLElement;
    expect(access.textContent).toContain('Accountant');
    expect(access.querySelector('.toggle')).toBeNull();
    expect(access.textContent).not.toContain('Release a sign-in lock');
  });
});
