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
import { istBusinessDate } from '../../../Utils/format';
import {
  checkJoining,
  checkParents,
  checkStudent,
  formKey,
  parentsBody,
  parentsOf,
  studentBody,
  studentOf,
} from './app-form';
import { appName, historyOf, longDay, plusDays, shortDay, tcState } from './app-format';
import { PreviousFields } from './AppFields';
import type { Application, ApplicationList, ApplicationRow } from './applications.api';

const tick = () => new Promise((r) => setTimeout(r, 0));
const money = (amount: string) => ({ amount, currency: 'INR' as const });
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const toasts = () => text(document.querySelector('.toasts'));
const today = istBusinessDate(new Date());

async function request(match: (url: string) => boolean, method = 'GET') {
  const ctl = TestBed.inject(HttpTestingController);
  for (let i = 0; i < 60; i++) {
    const found = ctl.match((r) => match(r.urlWithParams) && r.method === method);
    if (found[0]) return found[0];
    await tick();
  }
  throw new Error(`no ${method} request`);
}

/** Answers every open GET whose path has a route (the page's parallel loads). */
function serve(routes: Readonly<Record<string, unknown>>) {
  const ctl = TestBed.inject(HttpTestingController);
  const hit = (r: { method: string; url: string }) => r.method === 'GET' && r.url in routes;
  for (const r of ctl.match(hit) as TestRequest[]) r.flush(routes[r.request.url] as object);
}

const session = (over: object = {}) => ({
  name: 'FARAH KHAN',
  email: 'counsellor@tvps.example.in',
  institution: {
    id: 'i-1',
    name: 'Tunga Valley Public School',
    shortName: 'TVPS',
    city: 'Shivamogga',
  },
  roles: [{ code: 'COUNSELLOR', name: 'Counsellor', readOnly: false }],
  // The Counsellor role's grants: no academics or set-up, and no approving (client 2026-10-09).
  subTasks: [
    'home.view',
    'task.home',
    'task.admissions',
    'admissions.view',
    'admissions.edit',
    'task.admfees',
    'admfees.view',
    'admfees.collect',
    'task.admqr',
    'admqr.view',
    'admqr.edit',
  ],
  preferredLang: 'en',
  ...over,
});

/**
 * The Co-ordinator, who assigns the admission number and section (client 2026-10-09): academics
 * but no set-up, so the page reads the user types through the admissions grant.
 */
const coordinator = () =>
  session({
    name: 'MEENA RAO',
    email: 'coordinator@tvps.example.in',
    roles: [{ code: 'ACADEMIC_COORDINATOR', name: 'Academic Coordinator', readOnly: false }],
    subTasks: [
      'home.view',
      'task.home',
      'task.academics',
      'academics.view',
      'task.admissions',
      'admissions.view',
      'admissions.edit',
      'admissions.approve',
    ],
  });

const Y26 = { id: 'y-26', label: '2026-27' };
const Y27 = { id: 'y-27', label: '2027-28' };
const row = (over: Partial<ApplicationRow> = {}): ApplicationRow => ({
  id: 'a-1',
  applicationNo: 'TVPS/2027/000001',
  source: 'PUBLIC',
  status: 'SUBMITTED',
  name: 'Diya Shetty',
  primaryContact: { name: 'RAKESH SHETTY', relation: 'FATHER', mobile: '9876501234' },
  class: { id: 'c-g1', name: 'Grade 1' },
  section: null,
  admissionNo: null,
  year: Y27,
  midTerm: false,
  joiningDate: null,
  submittedAt: '2026-09-28T03:41:47.415Z',
  createdAt: '2026-09-28T02:41:47.415Z',
  applicationFee: { amount: money('500.00'), status: 'PAID' },
  ...over,
});
const kiran = () =>
  row({
    id: 'a-2',
    applicationNo: 'TVPS/2026/000001',
    source: 'COUNSELLOR',
    name: 'Kiran Bhat',
    primaryContact: { name: 'MOHAN BHAT', relation: 'FATHER', mobile: '9845001122' },
    class: { id: 'c-g6', name: 'Grade 6' },
    year: Y26,
    midTerm: true,
    joiningDate: '2026-10-11',
  });
const list = (items: ApplicationRow[], over: Partial<ApplicationList> = {}): ApplicationList => ({
  items,
  nextCursor: null,
  counts: { DRAFT: 2, SUBMITTED: 2, REJECTED: 1 },
  kpis: {
    awaitingReview: 2,
    approved: 0,
    midTermThisYear: 1,
    midTermToDecide: 1,
    applicationFeesReceived: money('1500.00'),
    applicationFeesPaid: 3,
  },
  ...over,
});

const detail = (over: Partial<Application> = {}): Application => ({
  id: 'a-1',
  applicationNo: 'TVPS/2027/000001',
  source: 'PUBLIC',
  status: 'SUBMITTED',
  step: 7,
  year: Y27,
  class: { id: 'c-g1', name: 'Grade 1' },
  section: null,
  midTerm: false,
  joiningDate: null,
  midTermReason: null,
  student: {
    firstName: 'DIYA',
    middleName: null,
    lastName: 'SHETTY',
    gender: 'FEMALE',
    dob: '2021-02-14',
    // Kept encrypted, shown masked (client 2026-10-12).
    aadhaar: 'XXXX XXXX 2346',
    pan: null,
    category: 'GENERAL',
    medium: 'English',
    bloodGroup: 'O+',
    allergies: null,
    health: null,
  },
  age: { years: 6, on: '2027-06-01', band: { min: 6, max: 10 }, withinBand: true },
  addresses: {
    residential: {
      line1: 'No. 12, 4th Cross',
      city: 'Shivamogga',
      state: 'Karnataka',
      pin: '577205',
    },
    sameAsResidential: true,
  },
  previous: {
    school: 'Sunshine English School',
    lastClass: 'UKG',
    result: 'Passed',
    board: 'STATE',
  },
  parents: {
    father: { name: 'Rakesh Shetty', mobile: '9876501234', email: 'rakesh.shetty@example.com' },
    primary: 'FATHER',
  },
  primaryContact: {
    name: 'Rakesh Shetty',
    relation: 'FATHER',
    mobile: '9876501234',
    email: 'rakesh.shetty@example.com',
    aadhaar: 'XXXX XXXX 9012',
    pan: '••••••234F',
  },
  // Each person's, masked (client 2026-10-13).
  identityNumbers: {
    father: { aadhaar: 'XXXX XXXX 9012', pan: '••••••234F' },
    mother: { aadhaar: null, pan: null },
    guardian: { aadhaar: null, pan: null },
    localGuardian: { aadhaar: null, pan: null },
  },
  customFields: {},
  tc: null,
  references: [],
  documents: [
    {
      type: 'BIRTH',
      name: 'birth.pdf',
      sizeBytes: 390000,
      mimeType: 'application/pdf',
      addedAt: '2026-09-28T03:00:00.000Z',
      url: '/api/v1/files/f-1/content?sig=x',
    },
  ],
  fees: [
    {
      id: 'p-1',
      feeType: 'APPLICATION',
      amount: money('500.00'),
      status: 'PAID',
      mode: 'ONLINE',
      receiptNo: 'TVPS/R/2027/000001',
      paidAt: '2026-09-28T03:41:47.415Z',
      paidBy: null,
      failureReason: null,
    },
  ],
  declaration: { at: '2026-09-28T03:41:47.415Z', by: 'Rakesh Shetty' },
  // Verified with a one-time code (client 2026-10-27).
  contactVerified: true,
  submittedAt: '2026-09-28T03:41:47.415Z',
  decidedAt: null,
  rejection: null,
  admissionNo: null,
  memberId: null,
  createdAt: '2026-09-28T02:41:47.415Z',
  updatedAt: '2026-09-28T03:41:47.415Z',
  version: 3,
  ...over,
});

const years = {
  items: [
    {
      id: 'y-27',
      label: '2027-28',
      startsOn: '2027-04-01',
      endsOn: '2028-03-31',
      status: 'OPEN',
      current: false,
      version: 1,
    },
    {
      id: 'y-26',
      label: '2026-27',
      startsOn: '2026-04-01',
      endsOn: plusDays(today, 120),
      status: 'OPEN',
      current: true,
      version: 1,
    },
  ],
};
const classes = {
  year: Y26,
  items: [
    {
      id: 'c-ukg',
      name: 'UKG',
      order: 2,
      sections: [{ id: 's-ukg-a', name: 'A', capacity: null, students: 2 }],
      students: 2,
      version: 1,
    },
    {
      id: 'c-g1',
      name: 'Grade 1',
      order: 3,
      sections: [
        { id: 's-g1-a', name: 'A', capacity: null, students: 2 },
        { id: 's-g1-b', name: 'B', capacity: null, students: 1 },
      ],
      students: 3,
      version: 1,
    },
    {
      id: 'c-g6',
      name: 'Grade 6',
      order: 8,
      sections: [{ id: 's-g6-b', name: 'B', capacity: null, students: 1 }],
      students: 1,
      version: 1,
    },
  ],
};
const userTypes = {
  items: [
    {
      id: 'ut-stu',
      name: 'Student',
      category: 'STUDENT',
      status: 'ACTIVE',
      members: 30,
      departments: [
        { id: 'd-pri', name: 'Primary', members: 10 },
        { id: 'd-mid', name: 'Middle school', members: 10 },
      ],
      version: 1,
    },
    {
      id: 'ut-par',
      name: 'Parent',
      category: 'PARENT',
      status: 'ACTIVE',
      members: 30,
      departments: [],
      version: 1,
    },
  ],
};
const lookups = () => ({
  '/api/v1/console/academic-years': years,
  '/api/v1/console/classes': classes,
  '/api/v1/console/user-types': userTypes,
  '/api/v1/console/custom-fields': { maxActivePerEntity: 15, items: [] },
  '/api/v1/console/admission-links': {
    current: {
      id: 'l-1',
      status: 'ACTIVE',
      url: 'http://localhost:4200/admissions/tok',
      qrSvg: '<svg></svg>',
      year: '2027-28',
      expiresAt: null,
      expired: false,
      createdAt: null,
      replacedAt: null,
    },
    history: [],
  },
});

describe('admission display helpers', () => {
  it('names, dates, the certificate and the history', () => {
    expect(appName(detail())).toBe('Diya Shetty');
    expect(longDay('2026-10-19')).toBe('Monday, 19 October 2026');
    expect(shortDay('2026-10-02')).toBe('2 Oct');
    expect(tcState(null, today).text).toBe('Not received');
    expect(
      tcState({ mode: 'UNDERTAKING', number: null, date: null, dueDate: '2020-01-01' }, today),
    ).toMatchObject({
      overdue: true,
    });
    const h = historyOf(detail());
    expect(h.map((x) => x.title)).toEqual([
      'Started on the public form',
      'Document added · Birth certificate',
      'Declaration accepted by Rakesh Shetty',
      'Application fee ₹500.00 paid online',
      'Submitted for review',
      // The Co-ordinator decides, not the Counsellor (client 2026-10-14).
      'Co-ordinator decision',
    ]);
    expect(h.at(-1)!.state).toBe('now');
    // Fees paid but not yet confirmed: Accounts first, then the Co-ordinator.
    expect(
      historyOf(detail({ paymentStatus: 'PAID' }))
        .map((x) => x.title)
        .slice(-2),
    ).toEqual(['Accounts confirmation', 'Co-ordinator decision']);
  });

  it('checks a joining date and maps server fields to the form', () => {
    expect(checkJoining('', today, '2027-03-31')).toBe('Enter the joining date');
    expect(checkJoining(plusDays(today, -1), today, '2027-03-31')).toContain(
      'choose a joining date from today to 31 Mar 2027',
    );
    expect(formKey('student.firstName')).toBe('first');
    expect(formKey('firstName')).toBe('first');
    expect(formKey('customFields.f-9')).toBe('cf-f-9');
    // The identity digits are kept unless new ones are typed (ADM-016 leaves them out).
    expect(studentBody(studentOf(detail()), detail().student)).not.toHaveProperty('idNumber');
    expect(formKey('student.aadhaar')).toBe('aadhaar');
    expect(formKey('parents.mother.pan')).toBe('m-pan');
  });

  it('sends the Aadhaar numbers and PANs only when typed; the stored ones stay masked (client 2026-10-12)', () => {
    const a = detail();
    const s = studentOf(a);
    expect(s.keptAadhaar).toBe('XXXX XXXX 2346');
    expect(studentBody(s, a.student)).not.toHaveProperty('aadhaar');
    // The student's Aadhaar is optional: an empty field passes, and a removed one is cleared.
    expect(checkStudent(s, '2099-01-01', { lastRequired: true })).not.toHaveProperty('aadhaar');
    expect(studentBody({ ...s, keptAadhaar: null }, a.student)).toMatchObject({ aadhaar: null });
    // No PAN stored: an empty one is sent as none.
    expect(studentBody(s, a.student)).toMatchObject({ pan: null });
    expect(
      studentBody({ ...s, aadhaar: '234123412346', pan: 'abcde1234f' }, a.student),
    ).toMatchObject({ aadhaar: '234123412346', pan: 'ABCDE1234F' });
    // A stored PAN stays unless it is removed.
    const withPan = studentOf(detail({ student: { ...a.student, pan: '••••••234F' } }));
    expect(studentBody(withPan, a.student)).not.toHaveProperty('pan');
    expect(studentBody({ ...withPan, keptPan: null }, a.student)).toMatchObject({ pan: null });

    // The father's and the mother's Aadhaar and PAN, not only the primary contact's (2026-10-13).
    const kept = parentsOf(a);
    expect(kept.kept.father).toEqual({ aadhaar: 'XXXX XXXX 9012', pan: '••••••234F' });
    const p = {
      ...kept,
      children: 'SINGLE' as const,
      mother: { ...kept.mother, name: 'Latha Shetty', mobile: '9876501235' },
    };
    expect(checkParents(p)).toEqual({
      'm-aadhaar': "Enter the mother's Aadhaar number",
      'm-pan': "Enter the mother's PAN",
    });
    const typed = {
      ...p,
      ids: { ...p.ids, mother: { aadhaar: '034123412346', pan: 'ABCPS1234' } },
    };
    expect(checkParents(typed)).toEqual({
      'm-aadhaar': 'Enter a valid 12-digit Aadhaar number.',
      'm-pan': 'Please enter a valid 10-character PAN number.',
    });
    const fixed = {
      ...typed,
      ids: { ...typed.ids, mother: { aadhaar: '2341 2341 2346', pan: 'abcps1234f' } },
    };
    expect(checkParents(fixed)).toEqual({});
    // Sent inside each person, only when typed: the father's stored ones stay.
    const body = parentsBody(fixed, a.parents);
    expect(body.father).not.toHaveProperty('aadhaar');
    expect(body.mother).toMatchObject({ aadhaar: '234123412346', pan: 'ABCPS1234F' });
    expect(body).not.toHaveProperty('primaryAadhaar');
    // Another primary contact changes nobody's numbers; a guardian who is the contact gives theirs.
    expect(checkParents({ ...fixed, primary: 'MOTHER' })).toEqual({
      'm-email': "Enter the primary contact's e-mail",
    });
    const guardian = { ...fixed.guardian, name: 'Ravi Rao', mobile: '9876509090' };
    expect(
      checkParents({
        ...fixed,
        primary: 'GUARDIAN',
        guardian: { ...guardian, relation: 'Uncle', email: 'ravi@example.in' },
      }),
    ).toEqual({
      'g-aadhaar': "Enter the guardian's Aadhaar number",
      'g-pan': "Enter the guardian's PAN",
    });

    // Each their own mobile, Aadhaar and PAN (client 2026-10-14): what is typed is compared.
    const same = {
      ...fixed,
      mother: { ...fixed.mother, mobile: '+91 98765 01234' },
      ids: { ...fixed.ids, father: { aadhaar: '234123412346', pan: 'ABCPS1234F' } },
    };
    expect(checkParents(same)).toEqual({
      'm-mobile':
        'This is the father’s mobile number. The father, the mother and the guardian each need their own.',
      'm-aadhaar':
        'This is the father’s Aadhaar number. The father, the mother and the guardian each have their own.',
      'm-pan':
        'This is the father’s PAN. The father, the mother and the guardian each have their own.',
    });
    // The parents' annual income, in rupees: never the guardian's.
    expect(checkParents({ ...fixed, father: { ...fixed.father, income: '12a' } })).toEqual({
      'f-inc': 'Enter the annual income in rupees, in digits only.',
    });
    const incomes = parentsBody(
      {
        ...fixed,
        father: { ...fixed.father, income: '850000', occupation: 'Engineer' },
        guardian: { ...fixed.guardian, name: 'Ravi Rao', relation: 'Uncle', income: '5' },
      },
      a.parents,
    );
    expect(incomes.father).toMatchObject({ occupation: 'Engineer', annualIncome: 850000 });
    expect(incomes.mother).toMatchObject({ annualIncome: null });
    expect(incomes.guardian).not.toHaveProperty('annualIncome');
  });
});

describe('console applications (ADM-013…020, ADM-026…030)', () => {
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

  async function open(s: object = session(), items: ApplicationRow[] = [kiran(), row()]) {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/applications');
    (await request((u) => u === '/api/v1/console/session')).flush(s);
    await nav;
    serve(lookups());
    (await request((u) => u === '/api/v1/console/applications?status=SUBMITTED')).flush(
      list(items),
    );
    serve(lookups());
    await settle(5);
    return harness.routeNativeElement as HTMLElement;
  }

  const confirm = async () => {
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    await settle(2);
  };
  const type = (root: ParentNode, sel: string, v: string) => {
    const i = root.querySelector(sel) as HTMLInputElement;
    i.value = v;
    i.dispatchEvent(new Event('input'));
  };
  const pick = async (id: string, label: string) => {
    (document.querySelector(`#${id}-b`) as HTMLButtonElement).click();
    await settle(1);
    ([...document.querySelectorAll('.dd-menu .dd-opt')] as HTMLButtonElement[])
      .find((b) => text(b).startsWith(label))!
      .click();
    await settle(1);
  };
  const openDrawer = async (el: HTMLElement, i: number, d: Application) => {
    (el.querySelectorAll('#ap-table tbody tr')[i] as HTMLElement).click();
    await settle();
    (await request((u) => u === `/api/v1/console/applications/${d.id}`)).flush(d);
    await settle();
    return document.querySelector('.drawer') as HTMLElement;
  };

  it('shows the figures, the tabs with counts and the table; filters on the server', async () => {
    const el = await open();
    expect(text(el.querySelector('h1'))).toBe('Applications');
    const kpis = [...el.querySelectorAll('.kpi')].map((k) => text(k));
    expect(kpis[0]).toContain('Awaiting review2 Submitted, fee paid');
    expect(kpis[1]).toContain('Mid-term joiners 2026-27');
    expect(kpis[1]).toContain('1 to decide');
    expect(kpis[3]).toContain('₹1,500');
    expect(text(el.querySelector('.tabs'))).toContain('Drafts2');
    const rows = el.querySelectorAll('#ap-table tbody tr');
    expect(rows).toHaveLength(2);
    expect(text(rows[0])).toContain('TVPS/2026/000001');
    expect(text(rows[0])).toContain('Mohan Bhat · +91 98450 01122');
    expect(text(rows[0])).toContain('Mid-term');
    expect(text(rows[0])).toContain('joins 11 Oct');
    expect(text(rows[1])).toContain('₹500.00Paid');
    expect(text(el.querySelector('.pills'))).toContain('2027-28 · regular');
    expect(text(el.querySelector('.pills'))).toContain('2026-27 · mid-term');

    (el.querySelector('#ap-tab-DRAFT') as HTMLButtonElement).click();
    (await request((u) => u === '/api/v1/console/applications?status=DRAFT')).flush(list([]));
    await settle();
    expect(text(el.querySelector('#ap-table'))).toContain('No drafts match');
    ([...el.querySelectorAll('.pill')] as HTMLButtonElement[])
      .find((b) => text(b).startsWith('2026-27'))!
      .click();
    (await request((u) => u === '/api/v1/console/applications?status=DRAFT&yearId=y-26')).flush(
      list([]),
    );
    (el.querySelector('#ap-mt') as HTMLInputElement).click();
    (
      await request(
        (u) => u === '/api/v1/console/applications?status=DRAFT&yearId=y-26&midTerm=true',
      )
    ).flush(list([]));
    await settle();
    expect(text(el.querySelector('#ap-table'))).toContain('Try clearing the search or filters.');
  });

  it('opens an application: age and band, documents, fees, history; adds and removes a reference', async () => {
    const el = await open();
    const d = detail();
    const drawer = await openDrawer(el, 1, d);
    expect(text(drawer.querySelector('.sh-t'))).toContain('Diya Shetty');
    expect(text(drawer.querySelector('#ap-dob'))).toBe('14 Feb 2021 · 6 yrs on 1 Jun');
    expect(text(drawer.querySelector('#ap-docs .li .li-t'))).toBe('Birth certificate');
    expect(text(drawer.querySelector('#ap-docs .li .li-s'))).toBe('birth.pdf · 381 KB');
    expect(drawer.querySelector('#ap-docs a.iconbtn')?.getAttribute('href')).toBe(
      '/api/v1/files/f-1/content?sig=x',
    );
    expect(text(drawer.querySelector('#ap-fees'))).toContain(
      '₹500.00 · Paid · to confirm TVPS/R/2027/000001',
    );
    expect(text(drawer.querySelector('#ap-history'))).toContain('Co-ordinator decision');
    expect(text(drawer.querySelector('#ap-history'))).not.toContain('Counsellor');

    // Inline checks first, then ADM-026.
    (drawer.querySelector('#ap-ref-add') as HTMLButtonElement).click();
    await settle();
    expect(text(drawer.querySelector('#ap-ref-form'))).toContain("Enter the referee's name");
    type(drawer, '#rf-n', 'Anita Rao');
    type(drawer, '#rf-r', 'Class teacher');
    type(drawer, '#rf-p', '12345');
    (drawer.querySelector('#ap-ref-add') as HTMLButtonElement).click();
    await settle();
    expect(text(drawer.querySelector('#ap-ref-form'))).toContain(
      'Mobile number must contain 10 digits',
    );
    type(drawer, '#rf-p', '9876509922');
    (drawer.querySelector('#ap-ref-add') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/console/applications/a-1/references', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({
      name: 'Anita Rao',
      relation: 'Class teacher',
      mobile: '9876509922',
    });
    const ref = {
      id: 'r-1',
      name: 'Anita Rao',
      relation: 'Class teacher',
      mobile: '9876509922',
      email: null,
    };
    post.flush(detail({ references: [ref], version: 4 }), { status: 201, statusText: 'Created' });
    await settle();
    expect(toasts()).toContain('Reference added');
    expect(text(drawer.querySelector('#ap-refs'))).toContain(
      'Anita RaoClass teacher · +91 98765 09922',
    );
    (await request((u) => u === '/api/v1/console/applications?status=SUBMITTED')).flush(
      list([kiran(), row()]),
    );

    (drawer.querySelector('#ap-refs .li-r button') as HTMLButtonElement).click();
    await confirm();
    (await request((u) => u === '/api/v1/console/applications/a-1/references/r-1', 'DELETE')).flush(
      detail({ version: 5 }),
    );
    await settle();
    expect(toasts()).toContain('Reference removed');
  });

  it('approves with a section of the class applied for (ADM-018, If-Match)', async () => {
    const el = await open(coordinator());
    const drawer = await openDrawer(el, 1, detail());
    (drawer.querySelector('#ap-approve') as HTMLButtonElement).click();
    await settle();
    const m = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    expect(text(m.querySelector('#aa-type-b'))).toBe('Student');
    expect(text(m.querySelector('#aa-dept-b'))).toBe('Primary');
    expect(text(m.querySelector('#aa-sec-b'))).toBe('Grade 1 A');
    (m.querySelector('#aa-go') as HTMLButtonElement).click();
    await settle();
    expect(text(m)).toContain('Enter an admission number');
    type(m, '#aa-no', 'TVPS/2027/0101');
    await pick('aa-sec', 'Grade 1 B');
    (m.querySelector('#aa-go') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/console/applications/a-1/approval', 'POST');
    expect(post.request.headers.get('If-Match')).toBe('"v3"');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({
      userTypeId: 'ut-stu',
      departmentId: 'd-pri',
      sectionId: 's-g1-b',
      admissionNo: 'TVPS/2027/0101',
    });
    post.flush({
      memberId: 'm-1',
      application: detail({
        status: 'APPROVED',
        section: { id: 's-g1-b', name: 'B' },
        admissionNo: 'TVPS/2027/0101',
        decidedAt: '2026-10-04T05:00:00.000Z',
        version: 4,
      }),
    });
    await settle();
    expect(toasts()).toContain('Admission approved');
    expect(text(drawer)).toContain(
      'Enrolled. Admission number TVPS/2027/0101 · Grade 1 B · 2027-28.',
    );
    // The decision moves the list to its tab.
    (await request((u) => u === '/api/v1/console/applications?status=APPROVED')).flush(list([]));
  });

  it('shows a refused approval as rolled back', async () => {
    const el = await open(coordinator());
    const drawer = await openDrawer(el, 1, detail());
    (drawer.querySelector('#ap-approve') as HTMLButtonElement).click();
    await settle();
    const m = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    type(m, '#aa-no', 'TVPS/2027/0102');
    (m.querySelector('#aa-go') as HTMLButtonElement).click();
    (await request((u) => u === '/api/v1/console/applications/a-1/approval', 'POST')).flush(
      { status: 409, code: 'IDN.MOBILE_OTHER_INSTITUTION', correlationId: 'c-1' },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();
    (await request((u) => u === '/api/v1/console/applications/a-1')).flush(detail());
    await settle();
    expect(text(drawer.querySelector('#ap-rolled'))).toContain('Approval rolled back.');
    expect(text(drawer.querySelector('#ap-rolled'))).toContain('Nothing was saved.');
  });

  it('records the undertaking with the approval of a mid-term application (ADM-017, ADM-018)', async () => {
    const el = await open(coordinator());
    const ref = {
      id: 'r-1',
      name: 'Sunita Rao',
      relation: 'Teacher',
      mobile: '9845009988',
      email: null,
    };
    const d = detail({
      id: 'a-2',
      applicationNo: 'TVPS/2026/000001',
      year: Y26,
      class: { id: 'c-g6', name: 'Grade 6' },
      midTerm: true,
      joiningDate: '2026-10-11',
      midTermReason: 'The family moved to Shivamogga',
      references: [ref],
    });
    const drawer = await openDrawer(el, 0, d);
    expect(text(drawer.querySelector('#ap-mid'))).toContain('Not received');
    expect(drawer.querySelector('#ap-tc-note')).toBeTruthy();
    (drawer.querySelector('#ap-approve') as HTMLButtonElement).click();
    await settle();
    const m = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    expect(text(m.querySelector('#aa-dept-b'))).toBe('Middle school');
    expect(m.querySelector('#aa-tc-none')).toBeTruthy();
    ([...m.querySelectorAll('input[name="aa-tc"]')] as HTMLInputElement[])[1]!.click();
    await settle();
    const due = plusDays(today, 30);
    type(m, '#aa-tcdue', due);
    type(m, '#aa-no', 'TVPS/2026/0201');
    (m.querySelector('#aa-go') as HTMLButtonElement).click();
    const put = await request(
      (u) => u === '/api/v1/console/applications/a-2/transfer-certificate',
      'PUT',
    );
    expect(put.request.body).toEqual({ mode: 'UNDERTAKING', dueDate: due });
    put.flush({
      ...d,
      tc: { mode: 'UNDERTAKING', number: null, date: null, dueDate: due },
      version: 9,
    });
    await settle();
    const post = await request((u) => u === '/api/v1/console/applications/a-2/approval', 'POST');
    expect(post.request.headers.get('If-Match')).toBe('"v9"');
    expect(post.request.body).toMatchObject({ sectionId: 's-g6-b', departmentId: 'd-mid' });
  });

  it('rejects with a reason code and remarks (ADM-019)', async () => {
    const el = await open(coordinator());
    const drawer = await openDrawer(el, 1, detail());
    (drawer.querySelector('#ap-reject') as HTMLButtonElement).click();
    await settle();
    const m = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    (m.querySelector('#ar-go') as HTMLButtonElement).click();
    await settle();
    expect(text(m)).toContain('Choose a reason');
    expect(text(m)).toContain('Enter a reason to continue');
    await pick('ar-code', 'No seats left');
    const rem = m.querySelector('#ar-rem') as HTMLTextAreaElement;
    rem.value = 'Grade 1 is full for 2027-28.';
    rem.dispatchEvent(new Event('input'));
    (m.querySelector('#ar-go') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/console/applications/a-1/rejection', 'POST');
    expect(post.request.headers.get('If-Match')).toBe('"v3"');
    expect(post.request.body).toEqual({
      reasonCode: 'SEATS_FULL',
      remarks: 'Grade 1 is full for 2027-28.',
    });
    post.flush(
      detail({
        status: 'REJECTED',
        decidedAt: '2026-10-04T05:00:00.000Z',
        rejection: { reasonCode: 'SEATS_FULL', remarks: 'Grade 1 is full for 2027-28.' },
      }),
    );
    await settle();
    expect(toasts()).toContain('Application rejected');
    expect(text(drawer)).toContain('No seats left in the class — Grade 1 is full for 2027-28.');
  });

  it('submits a draft, which waits for its fee, then records the fee in cash (ADM-030, ADM-022)', async () => {
    const el = await open();
    const d = detail({
      status: 'DRAFT',
      submittedAt: null,
      declaration: null,
      fees: [],
      documents: [],
    });
    const drawer = await openDrawer(el, 1, d);
    expect(text(drawer.querySelector('#ap-docs'))).toContain(
      // Both sides of the father's and the mother's cards (client 2026-10-13).
      'Needed to submit: Birth certificate, Address proof, Previous report card, Father’s Aadhaar card (front), Father’s Aadhaar card (back), Father’s PAN card (front), Father’s PAN card (back), Mother’s Aadhaar card (front), Mother’s Aadhaar card (back), Mother’s PAN card (front), Mother’s PAN card (back).',
    );
    // Each person's numbers, masked.
    expect(text(drawer.querySelector('#ap-f-ids'))).toBe('XXXX XXXX 9012 · ••••••234F');
    expect(text(drawer.querySelector('#ap-m-ids'))).toBe('— · —');
    expect(text(drawer.querySelector('#ap-consent'))).toBe('Not given yet');
    (drawer.querySelector('#ap-submit') as HTMLButtonElement).click();
    await settle(2);
    // The counsellor submits only with the family's consent to register their account.
    expect(text(document.querySelector('.modal[role="alertdialog"]'))).toContain(
      'the information collected will be used to register their account in CampusOne',
    );
    await confirm();
    const post = await request((u) => u === '/api/v1/console/applications/a-1/submission', 'POST');
    expect(post.request.body).toEqual({ declarationAccepted: true, registrationConsent: true });
    const declared = detail({
      ...d,
      declaration: { at: '2026-10-04T05:00:00.000Z', by: 'Counsellor' },
      fees: [
        {
          id: 'p-9',
          feeType: 'APPLICATION',
          amount: money('500.00'),
          status: 'PENDING',
          mode: null,
          receiptNo: null,
          paidAt: null,
          paidBy: null,
          failureReason: null,
        },
      ],
      version: 4,
    });
    post.flush({
      status: 'DRAFT',
      applicationNo: d.applicationNo,
      feeDue: { amount: '500.00', currency: 'INR', mandatory: true },
      application: declared,
    });
    await settle();
    expect(toasts()).toContain('Declared — waiting for the application fee');
    expect((drawer.querySelector('#ap-submit') as HTMLButtonElement).disabled).toBe(true);
    (drawer.querySelector('#ap-cash') as HTMLButtonElement).click();
    await settle();
    const m = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    expect((m.querySelector('#cc-by') as HTMLInputElement).value).toBe('Rakesh Shetty');
    type(m, '#cc-rcpt', 'RCPT/0001');
    (m.querySelector('#cc-save') as HTMLButtonElement).click();
    await confirm();
    const cash = await request(
      (u) => u === '/api/v1/console/applications/a-1/admission-fee/cash',
      'POST',
    );
    expect(cash.request.body).toEqual({
      feeType: 'APPLICATION',
      receivedAt: today,
      receiptNo: 'RCPT/0001',
      paidBy: 'Rakesh Shetty',
    });
    cash.flush(
      {
        receipt: {
          paymentId: 'p-9',
          receiptNo: 'RCPT/0001',
          amount: money('500.00'),
          feeType: 'APPLICATION',
        },
        application: detail({ version: 5 }),
      },
      { status: 201, statusText: 'Created' },
    );
    await settle();
    expect(toasts()).toContain('Cash collection recorded');
    expect(text(drawer.querySelector('.sh-f'))).toContain('Approve admission');
  });

  const at = async (url: string) => {
    for (let i = 0; i < 100 && TestBed.inject(Router).url !== url; i++) await settle();
    return TestBed.inject(Router).url;
  };

  it('opens the counsellor’s form, the public form’s steps, on a page of its own (client 2026-10-15)', async () => {
    const el = await open();
    (el.querySelector('#ap-new') as HTMLButtonElement).click();
    expect(await at('/console/applications/new')).toBe('/console/applications/new');
  });

  it('continues a draft in the counsellor’s form (client 2026-10-15)', async () => {
    const el = await open();
    const drawer = await openDrawer(el, 1, detail({ status: 'DRAFT' }));
    (drawer.querySelector('#ap-continue') as HTMLButtonElement).click();
    expect(await at('/console/applications/new?app=a-1')).toBe('/console/applications/new?app=a-1');
  });

  it('keeps the edits and approval closed for a read-only role', async () => {
    const el = await open(
      session({
        roles: [{ code: 'MANAGEMENT', name: 'Management', readOnly: true }],
        subTasks: ['task.admissions', 'admissions.view'],
      }),
    );
    expect(text(el.querySelector('.note'))).toContain('Read-only.');
    expect((el.querySelector('#ap-new') as HTMLButtonElement).disabled).toBe(true);
    expect((el.querySelector('#ap-upload') as HTMLButtonElement).disabled).toBe(true);
    const drawer = await openDrawer(el, 1, detail());
    expect((drawer.querySelector('#ap-approve') as HTMLButtonElement).disabled).toBe(true);
    expect(drawer.querySelector('#ap-ref-form')).toBeNull();
    expect(drawer.querySelector('#ap-edit-student')).toBeNull();
  });

  it('leaves the decision to the Co-ordinator, not the Counsellor (client 2026-10-09)', async () => {
    const el = await open();
    const drawer = await openDrawer(el, 1, detail({ paymentStatus: 'CONFIRMED' }));
    expect((drawer.querySelector('#ap-approve') as HTMLButtonElement).disabled).toBe(true);
    expect((drawer.querySelector('#ap-reject') as HTMLButtonElement).disabled).toBe(true);
  });

  it('assigns the admission number only once Accounts confirms both fees', async () => {
    const el = await open(coordinator());
    const drawer = await openDrawer(el, 1, detail({ paymentStatus: 'PAID' }));
    const approve = drawer.querySelector('#ap-approve') as HTMLButtonElement;
    // Rejecting needs no payment; approving waits for the confirmations.
    expect((drawer.querySelector('#ap-reject') as HTMLButtonElement).disabled).toBe(false);
    expect(approve.disabled).toBe(true);
    expect(approve.parentElement?.getAttribute('title')).toBe(
      'Waiting for Accounts to confirm the application fee and the admission fee',
    );
    expect(text(drawer.querySelector('#ap-payment'))).toContain(
      'Paid — waiting for Accounts to confirm',
    );
  });

  it('verifies the primary contact’s mobile before approval: the family reads out the code (client 2026-10-27)', async () => {
    const el = await open(coordinator());
    const drawer = await openDrawer(el, 1, detail({ contactVerified: false }));
    const approve = drawer.querySelector('#ap-approve') as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect(approve.parentElement?.getAttribute('title')).toBe(
      'Verify the primary contact’s mobile first',
    );
    expect(text(drawer.querySelector('#ap-pc-mobile'))).toBe('+91 98765 01234 Not verified');
    expect(text(drawer.querySelector('#ap-cv-box .note'))).toContain('Needed before approval.');

    (drawer.querySelector('#ap-cv-send') as HTMLButtonElement).click();
    const send = await request((u) => u === '/api/v1/console/applications/a-1/contact-otp', 'POST');
    expect(send.request.body).toEqual({});
    send.flush({
      challengeId: 'ch-1',
      sentTo: '+91 ••••• •••34',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      testCode: '4821',
    });
    await settle();
    expect(text(drawer.querySelector('#ap-cv'))).toContain(
      'Code sent to +91 ••••• •••34. Ask the family for it.',
    );
    expect(text(drawer.querySelector('#ap-cv .demo-hint b'))).toBe('4821');

    // A wrong code: the API's message, and the code can be typed again.
    type(drawer, '#ap-cv-code', '1111');
    await settle(1);
    (drawer.querySelector('#ap-cv-confirm') as HTMLButtonElement).click();
    const verify = '/api/v1/console/applications/a-1/contact-otp/verify';
    const wrong = await request((u) => u === verify, 'POST');
    expect(wrong.request.body).toEqual({ challengeId: 'ch-1', otp: '1111' });
    wrong.flush(
      { type: 'about:blank', code: 'AUTH.OTP_INVALID', detail: 'x' },
      { status: 400, statusText: 'Bad Request' },
    );
    await settle();
    expect(text(drawer.querySelector('#ap-cv-e'))).toBe('Invalid OTP !!!');

    type(drawer, '#ap-cv-code', '4821');
    await settle(1);
    (drawer.querySelector('#ap-cv-confirm') as HTMLButtonElement).click();
    (await request((u) => u === verify, 'POST')).flush({
      application: detail({ contactVerified: true, version: 4 }),
    });
    await settle();
    expect(toasts()).toContain('Mobile number verified');
    expect(drawer.querySelector('#ap-cv-box')).toBeNull();
    expect(text(drawer.querySelector('#ap-pc-mobile'))).toBe('+91 98765 01234 Verified');
    expect(approve.disabled).toBe(false);
  });

  it('says on approval that only the primary contact becomes the student’s parent (client 2026-10-27)', async () => {
    const el = await open(coordinator());
    const drawer = await openDrawer(el, 1, detail());
    (drawer.querySelector('#ap-approve') as HTMLButtonElement).click();
    await settle();
    const m = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    expect(text(m)).toContain(
      "links the primary contact's account (+91 98765 01234) to the student as their parent",
    );
  });

  it('submits a draft only with the primary contact’s mobile verified (client 2026-10-27)', async () => {
    const el = await open();
    const d = detail({ status: 'DRAFT', submittedAt: null, contactVerified: false });
    const drawer = await openDrawer(el, 1, d);
    const submit = drawer.querySelector('#ap-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(submit.parentElement?.getAttribute('title')).toBe(
      'Verify the primary contact’s mobile first',
    );
    expect(text(drawer.querySelector('#ap-cv-box .note'))).toContain('Needed to submit.');
    // Not saved yet: the server says so, in its words.
    (drawer.querySelector('#ap-cv-send') as HTMLButtonElement).click();
    (await request((u) => u === '/api/v1/console/applications/a-1/contact-otp', 'POST')).flush(
      { type: 'about:blank', code: 'ADM.CONTACT_MOBILE_MISSING', detail: 'Save the mobile first.' },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();
    expect(text(drawer.querySelector('#ap-cv-e'))).not.toBe('');
  });

  it('imports existing students and reports each row (ADM-020)', async () => {
    const el = await open();
    (el.querySelector('#ap-upload') as HTMLButtonElement).click();
    await settle();
    const m = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    const input = m.querySelector('#si-file') as HTMLInputElement;
    const file = new File(['Student first name\n'], 'students.csv', { type: 'text/csv' });
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    await settle();
    (m.querySelector('#si-go') as HTMLButtonElement).click();
    await confirm();
    const post = await request((u) => u === '/api/v1/console/applications/imports', 'POST');
    expect(post.request.body instanceof FormData).toBe(true);
    post.flush(
      {
        uploadId: 'u-1',
        total: 2,
        imported: 1,
        rejected: 1,
        rows: [
          {
            row: 2,
            name: 'Rohan Pai',
            outcome: 'IMPORTED',
            applicationNo: 'TVPS/2026/000003',
            errors: [],
          },
          {
            row: 3,
            name: 'Sneha Kamath',
            outcome: 'REJECTED',
            errors: [
              {
                column: 'Parent mobile',
                message: 'Mobile number must contain 10 digits and start with 6, 7, 8 or 9',
              },
            ],
          },
        ],
      },
      { status: 201, statusText: 'Created' },
    );
    await settle();
    const rows = m.querySelectorAll('#si-rows tbody tr');
    expect(rows).toHaveLength(2);
    expect(text(rows[0]!.querySelectorAll('td')[2])).toBe('TVPS/2026/000003');
    expect(text(rows[0]!.querySelectorAll('td')[3])).toBe('Imported');
    expect(text(rows[1])).toContain('Parent mobile: Mobile number must contain 10 digits');
    expect(toasts()).toContain('1 student imported');
  });
});

describe('the previous school’s result (client 2026-10-13)', () => {
  it('is Pass or Fail, and a result typed before stays shown as it was saved', async () => {
    const fx = TestBed.createComponent(PreviousFields);
    fx.componentRef.setInput('full', true);
    fx.componentRef.setInput('value', {
      school: 'Little Stars',
      lastClass: 'UKG',
      result: 'Passed with distinction',
      board: 'STATE',
      otherBoard: '',
    });
    fx.detectChanges();
    const el = fx.nativeElement as HTMLElement;
    expect(el.querySelector('input#na-pr')).toBeNull();
    el.querySelector<HTMLButtonElement>('#na-pr-b')!.click();
    fx.detectChanges();
    const options = [...el.querySelectorAll<HTMLButtonElement>('.dd-opt')];
    expect(options.map((o) => text(o))).toEqual(['Passed with distinction', 'Pass', 'Fail']);
    options[2]!.click();
    fx.detectChanges();
    await fx.whenStable();
    expect(fx.componentInstance.value().result).toBe('Fail');
  });
});
