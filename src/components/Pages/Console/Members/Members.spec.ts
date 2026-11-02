import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import { translate } from '../../../Utils/translate';

const tick = () => new Promise((r) => setTimeout(r, 0));
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
/** A definition list's terms with their values: "Gender Male". */
const kv = (el: Element | null | undefined) =>
  [...(el?.querySelectorAll('dt') ?? [])].map((dt) => `${text(dt)} ${text(dt.nextElementSibling)}`);

async function request(match: (url: string) => boolean, method = 'GET') {
  const ctl = TestBed.inject(HttpTestingController);
  for (let i = 0; i < 60; i++) {
    const found = ctl.match((r) => match(r.urlWithParams) && r.method === method);
    if (found[0]) return found[0];
    await tick();
  }
  throw new Error(`no ${method} request`);
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
  subTasks: [
    'home.view',
    'members.view',
    'members.edit',
    'members.onboard',
    'members.status',
    'members.delink',
    'task.home',
    'task.members',
  ],
  preferredLang: 'en',
};

const money = (amount: string) => ({ amount, currency: 'INR' });

const row = (over: object) => ({
  id: 'm-1',
  memberNo: 'TVPS-00012',
  name: 'Aarav Hegde',
  kind: 'STUDENTS',
  userType: { id: 'ut-s', name: 'Student', category: 'STUDENT' },
  department: { id: 'd-1', name: 'Middle school' },
  admissionNo: 'TVPS/2019/0412',
  employeeNo: null,
  grade: { class: 'Grade 7', section: 'B' },
  mobile: '9886110000',
  linked: false,
  status: 'ACTIVE',
  wallet: { status: 'ACTIVE', balance: money('124560.50') },
  pending: { suspension: false, delink: false },
  customFields: { 'f-1': 'B+' },
  ...over,
});

const list = {
  year: { id: 'y-1', label: '2026-27' },
  columns: [{ id: 'f-1', label: 'Blood group' }],
  filters: [{ id: 'f-1', label: 'Blood group', options: ['A+', 'B+'] }],
  counts: {
    tabs: { STUDENTS: 2, PARENTS: 1, STAFF: 3, MERCHANTS: 0, ALL: 6 },
    statuses: { ACTIVE: 1, INACTIVE: 1, SUSPENDED: 0 },
  },
  items: [
    row({}),
    row({
      id: 'm-2',
      name: 'Diya Rao',
      status: 'INACTIVE',
      admissionNo: 'TVPS/2020/0101',
      wallet: null,
    }),
  ],
  nextCursor: null,
};

const detail = {
  id: 'm-1',
  memberNo: 'TVPS-00012',
  name: 'Aarav Hegde',
  firstName: 'Aarav',
  lastName: 'Hegde',
  kind: 'STUDENTS',
  userType: { id: 'ut-s', name: 'Student', category: 'STUDENT' },
  department: { id: 'd-1', name: 'Middle school' },
  gender: 'MALE',
  dateOfBirth: '2014-04-12',
  admissionNo: 'TVPS/2019/0412',
  employeeNo: null,
  joinedOn: '2019-06-03',
  grade: { class: 'Grade 7', classId: 'c-7', section: 'B', sectionId: 's-7b', year: '2026-27' },
  contact: { mobile: '9886110000', email: null },
  account: { linked: false, mobileMasked: null },
  guardians: [
    {
      id: 'p-1',
      name: 'Mahesh Hegde',
      relation: 'FATHER',
      mobile: '9886110000',
      primary: true,
      status: 'ACTIVE',
    },
  ],
  wards: [],
  roles: [],
  status: 'ACTIVE',
  statusReason: null,
  statusChangedAt: null,
  transactionPermission: { enabled: true, reason: null, changedAt: null },
  wallet: { status: 'ACTIVE', balance: money('124560.50') },
  pending: { suspension: false, delink: false },
  customFields: [
    {
      id: 'f-1',
      label: 'Blood group',
      type: 'DROPDOWN',
      required: true,
      unique: false,
      options: ['A+', 'B+'],
      value: 'B+',
    },
  ],
  onboardedAt: '2026-06-01T05:00:00.000Z',
  lastChangedAt: null,
  version: 3,
};

/** The admission form Aarav was admitted with: the bulk upload's, as ADM-014 shows it. */
const application = (over: object = {}) => ({
  id: 'a-1',
  applicationNo: 'TVPS/2019/000412',
  source: 'IMPORT',
  status: 'APPROVED',
  step: 7,
  year: { id: 'y-1', label: '2026-27' },
  class: { id: 'c-7', name: 'Grade 7' },
  section: { id: 's-7b', name: 'B' },
  midTerm: false,
  joiningDate: null,
  midTermReason: null,
  student: {
    firstName: 'AARAV',
    middleName: null,
    lastName: 'HEGDE',
    gender: 'MALE',
    dob: '2014-04-12',
    aadhaar: 'XXXX XXXX 2346',
    pan: null,
    category: 'OBC',
    medium: 'English',
    bloodGroup: 'B+',
    allergies: 'Peanuts',
    health: null,
  },
  age: null,
  addresses: {
    residential: {
      line1: 'No. 12, 4th Cross',
      line2: 'Gopala',
      city: 'Shivamogga',
      state: 'Karnataka',
      pin: '577205',
    },
    sameAsResidential: true,
    correspondence: null,
  },
  previous: {
    school: 'Sunshine English School',
    lastClass: 'Grade 6',
    result: 'Pass',
    board: 'STATE',
    otherBoard: null,
  },
  parents: {
    father: {
      name: 'MAHESH HEGDE',
      mobile: '9886110000',
      email: 'mahesh@example.in',
      occupation: 'Farmer',
      annualIncome: 600000,
    },
    mother: {
      name: 'SUMA HEGDE',
      mobile: '9886110001',
      email: null,
      occupation: null,
      annualIncome: null,
    },
    guardian: null,
    primary: 'FATHER',
    children: 'MORE',
    transport: true,
    transportStop: { id: 'st-1', name: 'Gopala Circle' },
  },
  primaryContact: {
    name: 'MAHESH HEGDE',
    relation: 'FATHER',
    mobile: '9886110000',
    email: 'mahesh@example.in',
  },
  identityNumbers: {
    father: { aadhaar: 'XXXX XXXX 9012', pan: '••••••234F' },
    mother: { aadhaar: 'XXXX XXXX 5566', pan: '••••••777K' },
    guardian: { aadhaar: null, pan: null },
    localGuardian: { aadhaar: null, pan: null },
  },
  customFields: { 'cf-1': 'Bus 3' },
  tc: null,
  references: [],
  documents: [
    {
      type: 'BIRTH',
      name: 'birth.pdf',
      sizeBytes: 390000,
      mimeType: 'application/pdf',
      addedAt: '2026-06-01T05:00:00.000Z',
      url: '/api/v1/files/f-1/content?sig=x',
    },
    {
      type: 'MOTHER_AADHAAR_FRONT',
      name: 'suma-aadhaar.jpg',
      sizeBytes: 120000,
      mimeType: 'image/jpeg',
      addedAt: '2026-06-01T05:00:00.000Z',
      url: '/api/v1/files/f-2/content?sig=y',
    },
  ],
  fees: [],
  declaration: null,
  submittedAt: null,
  decidedAt: '2026-06-01T05:00:00.000Z',
  rejection: null,
  admissionNo: 'TVPS/2019/0412',
  memberId: 'm-1',
  createdAt: '2026-06-01T05:00:00.000Z',
  updatedAt: null,
  version: 5,
  ...over,
});
const record = (over: object = {}) => ({
  relation: 'STUDENT',
  student: { id: 'm-1', name: 'Aarav Hegde' },
  editable: true,
  application: application(),
  ...over,
});
/** Aarav's mother, a parent member. */
const mother = {
  ...detail,
  id: 'p-2',
  memberNo: 'TVPS-00013',
  name: 'Suma Hegde',
  firstName: 'Suma',
  kind: 'PARENTS',
  userType: { id: 'ut-p', name: 'Parent', category: 'PARENT' },
  department: null,
  gender: 'FEMALE',
  dateOfBirth: null,
  admissionNo: null,
  grade: null,
  contact: { mobile: '9886110001', email: null },
  guardians: [],
  wards: [
    { id: 'm-1', name: 'Aarav Hegde', relation: 'MOTHER', grade: 'Grade 7 B', status: 'ACTIVE' },
  ],
  customFields: [],
};
const problem = (errors: object[]) =>
  [
    {
      type: 'urn:campusone:problem:validation',
      title: 'Check the highlighted fields',
      status: 422,
      code: 'VALIDATION.FAILED',
      errors,
    },
    { status: 422, statusText: 'Unprocessable Entity' },
  ] as const;

describe('console members (IDN-044…046, IDN-054)', () => {
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

  async function open() {
    const harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/members');
    (await request((u) => u === '/api/v1/console/session')).flush(session);
    await nav;
    (await request((u) => u.startsWith('/api/v1/console/members?'))).flush(list);
    (await request((u) => u === '/api/v1/console/classes')).flush({
      year: { id: 'y-1', label: '2026-27' },
      items: [
        {
          id: 'c-7',
          name: 'Grade 7',
          order: 9,
          students: 2,
          version: 1,
          sections: [{ id: 's-7b', name: 'B', capacity: null, students: 2 }],
        },
      ],
    });
    (await request((u) => u === '/api/v1/console/user-types')).flush({
      items: [
        {
          id: 'ut-s',
          name: 'Student',
          category: 'STUDENT',
          status: 'ACTIVE',
          members: 2,
          departments: [{ id: 'd-1', name: 'Middle school', members: 2 }],
          version: 1,
        },
      ],
    });
    for (let i = 0; i < 5; i++) await tick();
    harness.detectChanges();
    return harness;
  }

  it('lists students with tabs, grade, institution fields and status pills', async () => {
    const harness = await open();
    const el = harness.routeNativeElement as HTMLElement;
    const tabs = [...el.querySelectorAll('.tabs .tab')].map((t) =>
      t.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(tabs).toEqual(['Students2', 'Parents1', 'Staff & teachers3', 'Merchants0', 'All6']);
    const heads = [...el.querySelectorAll('thead th')].map((t) => t.textContent?.trim()).slice(1);
    expect(heads).toEqual([
      'Name',
      'Admission no.',
      'Grade',
      'Section',
      'Blood group',
      'Status',
      'Wallet',
    ]);
    const first = el.querySelector('tbody tr') as HTMLElement;
    expect(first.textContent).toContain('Aarav Hegde');
    expect(first.textContent).toContain('Grade 7');
    expect(first.textContent).toContain('B+');
    expect(el.querySelector('tbody tr:nth-child(2)')?.classList).toContain('cp-dim');
    // IDN-044: the wallet column shows the live balance, or a dash without a wallet.
    const wallet = (n: number) =>
      el.querySelector(`tbody tr:nth-child(${n}) td:last-child`)?.textContent?.replace(/\s+/g, '');
    expect(wallet(1)).toBe('₹1,24,560.50');
    expect(wallet(2)).toBe('—');

    // A status pill reloads the list with the filter.
    [...el.querySelectorAll('.pills .pill')]
      .find((p) => p.textContent?.includes('Inactive'))
      ?.dispatchEvent(new Event('click'));
    harness.detectChanges();
    const filtered = await request((u) => u.includes('status=INACTIVE'));
    expect(filtered.request.urlWithParams).toContain('kind=STUDENTS');
    filtered.flush({ ...list, items: [list.items[1]] });
  });

  it('opens the drawer and saves the editable fields with If-Match', async () => {
    const harness = await open();
    const el = harness.routeNativeElement as HTMLElement;
    (el.querySelector('tbody tr') as HTMLElement).click();
    (await request((u) => u === '/api/v1/console/members/m-1')).flush(detail);
    await tick();
    harness.detectChanges();
    const drawer = document.querySelector('.drawer') as HTMLElement;
    expect(drawer.querySelector('h3')?.textContent).toContain('Aarav Hegde');
    expect(drawer.textContent).toContain('Mahesh Hegde');
    const email = drawer.querySelector('#cp-ct-email') as HTMLInputElement;
    email.value = 'aarav@example.in';
    email.dispatchEvent(new Event('input'));
    harness.detectChanges();
    [...drawer.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Save changes')
      ?.click();
    const patch = await request((u) => u === '/api/v1/console/members/m-1', 'PATCH');
    expect(patch.request.headers.get('If-Match')).toBe('"v3"');
    expect(patch.request.body).toEqual({ email: 'aarav@example.in' });
    patch.flush({
      ...detail,
      contact: { mobile: '9886110000', email: 'aarav@example.in' },
      version: 4,
    });
  });

  it("shows a student's school transport on the profile (client 2026-10-15)", async () => {
    const harness = await open();
    const el = harness.routeNativeElement as HTMLElement;
    (el.querySelector('tbody tr') as HTMLElement).click();
    (await request((u) => u === '/api/v1/console/members/m-1')).flush({
      ...detail,
      transport: {
        allocation: {
          route: { code: 'R-07', name: 'Gopala – School', type: 'BOTH' },
          stop: { name: 'Gopala Circle', landmark: 'Near the bus shelter' },
          pickUp: '07:40',
          drop: '16:10',
          from: '2026-06-01',
          to: '2027-03-31',
        },
        trips: [
          {
            session: 'Morning',
            direction: 'PICKUP',
            startTime: '07:10',
            vehicle: { name: 'Bus 3', registration: 'KA19AB1234' },
            driver: { name: 'Suresh Rao', mobile: '9845012345' },
            attendant: null,
          },
        ],
      },
    });
    await tick();
    harness.detectChanges();
    const box = document.querySelector('#cp-transport') as HTMLElement;
    const text = box.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(text).toContain('R-07 · Gopala – School');
    expect(text).toContain('Gopala Circle — Near the bus shelter');
    expect(text).toContain('7:40 AM');
    expect(text).toContain('4:10 PM');
    expect(text).toContain('Morning · 7:10 AM');
    expect(text).toContain('Bus 3 · KA19AB1234');
    expect(text).toContain('Suresh Rao');
  });

  it('requests a correction of a display-only field: uploads the evidence, then sends it', async () => {
    const harness = await open();
    const el = harness.routeNativeElement as HTMLElement;
    (el.querySelector('tbody tr') as HTMLElement).click();
    (await request((u) => u === '/api/v1/console/members/m-1')).flush(detail);
    await tick();
    harness.detectChanges();
    const drawer = document.querySelector('.drawer') as HTMLElement;
    const dob = drawer.querySelector('#cp-pii-DOB') as HTMLInputElement;
    expect(dob.readOnly).toBe(true);
    expect(dob.value).toBe('12 Apr 2014');
    const actions = [...drawer.querySelectorAll('.cp-pii .fld-h .linkbtn')] as HTMLElement[];
    // Full name, date of birth, gender and (a student) the admission number.
    expect(actions.length).toBe(4);
    actions[1]?.click();
    await tick();
    harness.detectChanges();

    const modal = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    expect(modal.querySelector('.sh-h h3')?.textContent).toBe('Request a correction');
    expect(modal.querySelector('#cp-cr-f-b')?.textContent).toContain('Date of birth');
    expect(modal.querySelector('#cp-cr-cur')?.textContent).toContain('12 Apr 2014');
    const send = () =>
      [...modal.querySelectorAll('.sh-f button')]
        .find((b) => b.textContent?.trim() === 'Send for approval')
        ?.dispatchEvent(new Event('click'));

    // Everything is required; the same date is refused before anything is sent.
    send();
    harness.detectChanges();
    expect(modal.querySelectorAll('.fld.invalid').length).toBe(3);

    const to = modal.querySelector('#cp-cr-to') as HTMLInputElement;
    expect(to.type).toBe('date');
    to.value = '2014-04-21';
    to.dispatchEvent(new Event('input'));
    const why = modal.querySelector('#cp-cr-why') as HTMLTextAreaElement;
    why.value = 'The birth certificate shows 21 April 2014';
    why.dispatchEvent(new Event('input'));
    const file = new File(['%PDF-1.4 evidence'], 'birth-certificate.pdf', {
      type: 'application/pdf',
    });
    const ev = modal.querySelector('#cp-cr-ev') as HTMLInputElement;
    Object.defineProperty(ev, 'files', { value: [file] });
    ev.dispatchEvent(new Event('change'));
    harness.detectChanges();
    expect(modal.querySelector('.upl.done')?.textContent).toContain('birth-certificate.pdf');
    send();

    const upload = await request((u) => u === '/api/v1/files', 'POST');
    expect(upload.request.headers.get('X-CampusOne-Surface')).toBe('console');
    const form = upload.request.body as FormData;
    expect(form.get('purpose')).toBe('evidence');
    expect((form.get('file') as File).name).toBe('birth-certificate.pdf');
    upload.flush({ fileId: 'f-1' }, { status: 201, statusText: 'Created' });

    const post = await request((u) => u === '/api/v1/console/members/m-1/pii-corrections', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({
      field: 'DOB',
      proposedValue: '2014-04-21',
      reason: 'The birth certificate shows 21 April 2014',
      evidenceFileId: 'f-1',
    });
    post.flush(
      { approvalId: 'a-7', no: 'APR-0007', applied: false },
      { status: 202, statusText: 'Accepted' },
    );
    await tick();
    harness.detectChanges();
    expect(document.querySelector('.toasts')?.textContent).toContain('Sent for approval');
    expect(document.querySelector('.toasts')?.textContent).toContain(
      'APR-0007 · waits for an Institution Administrator',
    );
    expect(
      [...document.querySelectorAll('.modal .sh-h h3')].some(
        (h) => h.textContent === 'Request a correction',
      ),
    ).toBe(false);
  });

  it('deactivates from the drawer with a reason', async () => {
    const harness = await open();
    const el = harness.routeNativeElement as HTMLElement;
    (el.querySelector('tbody tr') as HTMLElement).click();
    (await request((u) => u === '/api/v1/console/members/m-1')).flush(detail);
    await tick();
    harness.detectChanges();
    const drawer = document.querySelector('.drawer') as HTMLElement;
    [...drawer.querySelectorAll('.tabs .tab')]
      .find((t) => t.textContent?.includes('Status'))
      ?.dispatchEvent(new Event('click'));
    harness.detectChanges();
    [...drawer.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Deactivate')
      ?.click();
    await tick();
    harness.detectChanges();
    const dialog = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    const reason = dialog.querySelector('textarea') as HTMLTextAreaElement;
    reason.value = 'Left at the end of term';
    reason.dispatchEvent(new Event('input'));
    [...dialog.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Deactivate')
      ?.click();
    const post = await request((u) => u === '/api/v1/console/members/m-1/status-changes', 'POST');
    expect(post.request.body).toEqual({ to: 'INACTIVE', reason: 'Left at the end of term' });
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    post.flush({ status: 'INACTIVE', approvalId: null });
  });

  // --- The admission form and its documents (the Admission tab) --------------------------------------
  const APP = '/api/v1/console/applications/a-1';

  /** The drawer of `member` (opened from the first row) on its Admission tab, `records` loaded. */
  async function admission(
    harness: RouterTestingHarness,
    member: { id: string; [k: string]: unknown } = detail,
    records: object[] = [record()],
  ) {
    const el = harness.routeNativeElement as HTMLElement;
    (el.querySelector('tbody tr') as HTMLElement).click();
    (await request((u) => u === '/api/v1/console/members/m-1')).flush(member);
    (await request((u) => u === `/api/v1/console/members/${member.id}/admission`)).flush({
      records,
    });
    if (records.length) {
      // The institution's fields name the form's answers.
      (await request((u) => u === '/api/v1/console/custom-fields')).flush({
        maxActivePerEntity: 10,
        items: [
          { id: 'cf-1', entity: 'ADMISSION_APPLICATION', status: 'ACTIVE', label: 'Bus route' },
          { id: 'cf-9', entity: 'MEMBER', status: 'ACTIVE', label: 'House' },
        ],
      });
    }
    await tick();
    harness.detectChanges();
    const drawer = document.querySelector('.drawer') as HTMLElement;
    const tab = [...drawer.querySelectorAll('.tabs .tab')].find((t) => text(t) === 'Admission');
    (tab as HTMLElement | undefined)?.click();
    await tick();
    harness.detectChanges();
    return drawer;
  }
  const top = () => [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
  const pickFile = (input: HTMLInputElement, file: File) => {
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
  };

  it("shows a student's admission form from the bulk upload, with its documents", async () => {
    const harness = await open();
    const drawer = await admission(harness);
    expect([...drawer.querySelectorAll('.tabs .tab')].map((t) => text(t))).toEqual([
      'Profile',
      'Admission',
      'Status & wallet',
      'Card & attendance',
      'Account',
      'History',
    ]);
    const head = drawer.querySelector('#ma-head-a-1');
    expect(text(head?.querySelector('h4 .t-mono'))).toBe('TVPS/2019/000412');
    expect(text(head?.querySelector('h4 .tag'))).toBe('Bulk upload');
    expect(text(head?.querySelector('h4 .chip'))).toBe('Approved');
    expect(kv(head)).toEqual([
      'Source Bulk upload',
      'Class and year Grade 7 B · 2026-27',
      'Admission number TVPS/2019/0412',
      'Submitted —',
      'Admitted 01 Jun 2026',
    ]);
    // The student's own form: no "for" note, and the student comes first.
    expect(drawer.querySelector('#ma-for-a-1')).toBeNull();
    expect(kv(drawer.querySelector('#ma-student-a-1'))).toEqual([
      'Name Aarav Hegde',
      'Gender Male',
      'Date of birth 12 Apr 2014',
      'Aadhaar XXXX XXXX 2346',
      'PAN —',
      'Category OBC',
      'Medium English',
      'Blood group B+',
      'Food allergies Peanuts',
      'Health —',
    ]);
    const people = [...drawer.querySelectorAll('#ma-parents-a-1 .ma-person')] as HTMLElement[];
    expect(people.map((p) => p.dataset['who'])).toEqual(['father', 'mother']);
    expect(text(people[0])).toContain('Primary contact');
    expect(kv(people[0])).toEqual([
      'Name Mahesh Hegde',
      'Mobile +91 98861 10000',
      'E-mail mahesh@example.in',
      'Occupation · income Farmer · ₹6,00,000 a year',
      'Aadhaar · PAN XXXX XXXX 9012 · ••••••234F',
    ]);
    expect(kv(people[1])).toContain('Mobile +91 98861 10001');
    expect(kv(drawer.querySelector('#ma-parents-a-1'))).toContain('Children More than one child');
    expect(kv(drawer.querySelector('#ma-addresses-a-1'))).toEqual([
      'Residential No. 12, 4th Cross, Gopala, Shivamogga, Karnataka 577205',
      'Correspondence Same as residential',
    ]);
    expect(kv(drawer.querySelector('#ma-previous-a-1'))).toContain('Board State');
    expect(kv(drawer.querySelector('#ma-stay-a-1'))).toEqual([
      'School transport Opted · pick-up at Gopala Circle',
    ]);
    // The institution's fields for applications only, by their labels.
    expect(kv(drawer.querySelector('#ma-fields-a-1'))).toEqual(['Bus route Bus 3']);

    // Each document opens from its signed link; a picture shows as a thumbnail.
    const docs = [...drawer.querySelectorAll('#ma-docs-a-1 .li')] as HTMLElement[];
    expect(docs.map((d) => d.dataset['type'])).toEqual(['BIRTH', 'MOTHER_AADHAAR_FRONT']);
    expect(text(docs[0])).toContain('Birth certificate');
    expect(text(docs[0])).toContain('birth.pdf · 381 KB');
    const link = docs[0]!.querySelector('a.ma-open') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/api/v1/files/f-1/content?sig=x');
    expect(link.target).toBe('_blank');
    expect(docs[0]!.querySelector('img')).toBeNull();
    expect(docs[1]!.querySelector('.ma-thumb img')?.getAttribute('src')).toBe(
      '/api/v1/files/f-2/content?sig=y',
    );
    // The Institution Administrator edits it.
    expect(drawer.querySelector('#ma-edit-student-a-1')).not.toBeNull();
    expect(drawer.querySelector('#ma-doc-a-1')).not.toBeNull();
  });

  it("puts a parent's own details and ID cards first, naming the child; no editing when not editable", async () => {
    const harness = await open();
    const drawer = await admission(harness, mother, [
      record({ relation: 'MOTHER', editable: false }),
    ]);
    expect(text(drawer.querySelector('#ma-for-a-1'))).toContain(
      "Suma Hegde is the mother on Aarav Hegde's admission form.",
    );
    const rec = drawer.querySelector('#ma-a-1') as HTMLElement;
    expect([...rec.children].map((c) => c.id).slice(0, 3)).toEqual([
      'ma-head-a-1',
      'ma-parents-a-1',
      'ma-student-a-1',
    ]);
    const people = [...rec.querySelectorAll('.ma-person')] as HTMLElement[];
    expect(people.map((p) => p.dataset['who'])).toEqual(['mother', 'father']);
    expect(people[0]!.classList.contains('ma-self')).toBe(true);
    expect(text(people[0])).toContain('This member');
    expect(text(people[0])).toContain('XXXX XXXX 5566 · ••••••777K');
    const docs = [...rec.querySelectorAll('#ma-docs-a-1 .li')] as HTMLElement[];
    expect(docs.map((d) => d.dataset['type'])).toEqual(['MOTHER_AADHAAR_FRONT', 'BIRTH']);
    expect(docs[0]!.classList.contains('ma-own')).toBe(true);
    // Not editable: no Edit, no upload or replace — the links still open.
    expect(rec.querySelector('[id^="ma-edit-"]')).toBeNull();
    expect(rec.querySelector('#ma-doc-a-1, .ma-rep')).toBeNull();
    expect(rec.querySelectorAll('a.ma-open')).toHaveLength(2);
    expect(text(rec.querySelector('#ma-head-a-1'))).toContain(
      'Your role can see this form but not change it.',
    );
    // The child opens from the note.
    [...rec.querySelectorAll('#ma-for-a-1 button')]
      .find((b) => text(b) === 'Open Aarav Hegde')
      ?.dispatchEvent(new Event('click'));
    expect(await request((u) => u === '/api/v1/console/members/m-1')).toBeTruthy();
  });

  it('shows no Admission tab to staff without a form', async () => {
    const harness = await open();
    const drawer = await admission(
      harness,
      { ...detail, kind: 'STAFF', admissionNo: null, employeeNo: 'EMP-7', grade: null },
      [],
    );
    expect([...drawer.querySelectorAll('.tabs .tab')].map((t) => text(t))).not.toContain(
      'Admission',
    );
  });

  it('edits a section of the record with If-Match: the identity locked and sent as stored', async () => {
    const harness = await open();
    const drawer = await admission(harness);
    (drawer.querySelector('#ma-edit-student-a-1') as HTMLButtonElement).click();
    await tick();
    harness.detectChanges();
    let m = top();
    expect(text(m.querySelector('h3'))).toBe('Edit student');
    // The names, gender, date of birth, Aadhaar and PAN are locked; a correction changes them.
    const first = m.querySelector('#na-first') as HTMLInputElement;
    expect(first.readOnly).toBe(true);
    expect(first.value).toBe('Aarav');
    expect(first.closest('.fld')!.classList.contains('locked')).toBe(true);
    expect((m.querySelector('#na-dob') as HTMLInputElement).value).toBe('12 Apr 2014');
    expect((m.querySelector('#na-aadhaar') as HTMLInputElement).value).toBe('XXXX XXXX 2346');
    expect(text(first.closest('.fld')!.querySelector('.fld-h'))).toBe(
      'Changes go through a correction request. Request a correction',
    );
    const allergies = m.querySelector('#as-allergies') as HTMLInputElement;
    expect(allergies.value).toBe('Peanuts');
    allergies.value = 'Peanuts, sesame';
    allergies.dispatchEvent(new Event('input'));
    harness.detectChanges();
    (m.querySelector('#as-save') as HTMLButtonElement).click();
    let patch = await request((u) => u === `${APP}/record`, 'PATCH');
    expect(patch.request.headers.get('If-Match')).toBe('"v5"');
    const sent = {
      section: 'student',
      data: {
        firstName: 'AARAV',
        middleName: null,
        lastName: 'HEGDE',
        gender: 'MALE',
        dob: '2014-04-12',
        category: 'OBC',
        medium: 'English',
        bloodGroup: 'B+',
        allergies: 'Peanuts, sesame',
        health: null,
      },
    };
    // No Aadhaar or PAN: the stored ones stay.
    expect(patch.request.body).toEqual(sent);
    // An identity field refused shows on that field.
    patch.flush(...problem([{ field: 'student.firstName', code: 'IDN.PII_READ_ONLY' }]));
    await tick();
    harness.detectChanges();
    expect(first.closest('.fld')!.classList.contains('invalid')).toBe(true);
    expect(text(m.querySelector('#na-first-e'))).toBe(translate('IDN.PII_READ_ONLY'));

    // Saved: the newer form replaces the old one.
    (m.querySelector('#as-save') as HTMLButtonElement).click();
    patch = await request((u) => u === `${APP}/record`, 'PATCH');
    expect(patch.request.body).toEqual(sent);
    patch.flush(
      application({
        version: 6,
        student: { ...application().student, allergies: 'Peanuts, sesame' },
      }),
    );
    await tick();
    harness.detectChanges();
    expect([...document.querySelectorAll('.modal h3')].map((h) => text(h))).not.toContain(
      'Edit student',
    );
    expect(text(document.querySelector('.toasts'))).toContain('Student saved');
    expect(kv(drawer.querySelector('#ma-student-a-1'))).toContain('Food allergies Peanuts, sesame');

    // A locked field's correction is the drawer's own request (CR-06).
    (drawer.querySelector('#ma-edit-student-a-1') as HTMLButtonElement).click();
    await tick();
    harness.detectChanges();
    m = top();
    (m.querySelector('#na-dob')!.closest('.fld')!.querySelector('.linkbtn') as HTMLElement).click();
    await tick();
    harness.detectChanges();
    expect(text(top().querySelector('h3'))).toBe('Request a correction');
    expect(text(top().querySelector('#cp-cr-f-b'))).toContain('Date of birth');
  });

  it('asks the children question on a bulk upload, and sends the parents as stored', async () => {
    const harness = await open();
    const bulk = application({ parents: { ...application().parents, children: null } });
    const drawer = await admission(harness, detail, [record({ application: bulk })]);
    (drawer.querySelector('#ma-edit-parents-a-1') as HTMLButtonElement).click();
    await tick();
    harness.detectChanges();
    const m = top();
    expect(text(m.querySelector('h3'))).toBe('Edit parents');
    expect((m.querySelector('#na-f-name') as HTMLInputElement).readOnly).toBe(true);
    expect((m.querySelector('#na-f-mobile') as HTMLInputElement).readOnly).toBe(true);
    expect((m.querySelector('#as-primary') as HTMLInputElement).value).toBe('Father');
    expect((m.querySelector('#as-m-aadhaar') as HTMLInputElement).value).toBe('XXXX XXXX 5566');
    // No guardian on the form: none is added here.
    expect(m.querySelector('#na-g-name')).toBeNull();
    (m.querySelector('#as-save') as HTMLButtonElement).click();
    await tick();
    harness.detectChanges();
    expect(m.querySelector('#as-children-b')!.closest('.fld')!.classList.contains('invalid')).toBe(
      true,
    );
    expect(TestBed.inject(HttpTestingController).match((r) => r.method === 'PATCH')).toHaveLength(
      0,
    );
    (m.querySelector('#as-children-b') as HTMLButtonElement).click();
    await tick();
    harness.detectChanges();
    (
      [...document.querySelectorAll('.dd-opt')].find((o) =>
        text(o).startsWith('More than one child'),
      ) as HTMLElement
    ).click();
    await tick();
    harness.detectChanges();
    const email = m.querySelector('#na-m-email') as HTMLInputElement;
    email.value = 'suma@example.in';
    email.dispatchEvent(new Event('input'));
    harness.detectChanges();
    (m.querySelector('#as-save') as HTMLButtonElement).click();
    const patch = await request((u) => u === `${APP}/record`, 'PATCH');
    expect(patch.request.headers.get('If-Match')).toBe('"v5"');
    expect(patch.request.body).toEqual({
      section: 'parents',
      data: {
        father: {
          name: 'MAHESH HEGDE',
          mobile: '9886110000',
          email: 'mahesh@example.in',
          occupation: 'Farmer',
          annualIncome: 600000,
        },
        mother: {
          name: 'SUMA HEGDE',
          mobile: '9886110001',
          email: 'suma@example.in',
          occupation: null,
          annualIncome: null,
        },
        guardian: null,
        primary: 'FATHER',
        children: 'MORE',
        transport: true,
        transportStopId: 'st-1',
      },
    });
    patch.flush(...problem([{ field: 'parents.mother.aadhaar', code: 'IDN.PII_READ_ONLY' }]));
    await tick();
    harness.detectChanges();
    expect(text(m.querySelector('#as-m-aadhaar-e'))).toBe(translate('IDN.PII_READ_ONLY'));
  });

  it("fills an older bulk upload's empty identity once: a last name, a mother it never had", async () => {
    const harness = await open();
    const old = application({
      student: { ...application().student, lastName: null },
      parents: { ...application().parents, mother: null },
    });
    const drawer = await admission(harness, detail, [record({ application: old })]);
    (drawer.querySelector('#ma-edit-student-a-1') as HTMLButtonElement).click();
    await tick();
    harness.detectChanges();
    let m = top();
    expect((m.querySelector('#na-first') as HTMLInputElement).readOnly).toBe(true);
    const last = m.querySelector('#na-last') as HTMLInputElement;
    expect(last.readOnly).toBe(false);
    last.value = 'Hegde';
    last.dispatchEvent(new Event('input'));
    harness.detectChanges();
    (m.querySelector('#as-save') as HTMLButtonElement).click();
    const named = await request((u) => u === `${APP}/record`, 'PATCH');
    expect(named.request.body).toMatchObject({
      section: 'student',
      data: { firstName: 'AARAV', middleName: null, lastName: 'Hegde' },
    });
    named.flush(application({ version: 6, parents: old.parents }));
    await tick();
    harness.detectChanges();

    (drawer.querySelector('#ma-edit-parents-a-1') as HTMLButtonElement).click();
    await tick();
    harness.detectChanges();
    m = top();
    expect((m.querySelector('#na-f-name') as HTMLInputElement).readOnly).toBe(true);
    for (const [id, v] of [
      ['#na-m-name', 'Suma Hegde'],
      ['#na-m-mobile', '9886110001'],
    ] as const) {
      const input = m.querySelector(id) as HTMLInputElement;
      expect(input.readOnly).toBe(false);
      input.value = v;
      input.dispatchEvent(new Event('input'));
    }
    harness.detectChanges();
    (m.querySelector('#as-save') as HTMLButtonElement).click();
    const added = await request((u) => u === `${APP}/record`, 'PATCH');
    expect(added.request.headers.get('If-Match')).toBe('"v6"');
    expect(added.request.body).toMatchObject({
      section: 'parents',
      data: {
        father: { name: 'MAHESH HEGDE', mobile: '9886110000' },
        mother: { name: 'Suma Hegde', mobile: '9886110001' },
      },
    });
  });

  it('uploads and replaces the documents of the record (2 MB at most)', async () => {
    const harness = await open();
    const drawer = await admission(harness);
    const docs = drawer.querySelector('#ma-docs-a-1') as HTMLElement;
    // The student's photograph is suggested first: it isn't attached yet.
    expect(text(docs.querySelector('#ma-doc-type-a-1-b'))).toContain('Photograph');
    expect(text(docs.querySelector('.upl'))).toContain('Upload: Photograph');
    const input = docs.querySelector('#ma-doc-a-1') as HTMLInputElement;
    pickFile(
      input,
      new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'photo.png', { type: 'image/png' }),
    );
    await tick();
    harness.detectChanges();
    expect(text(docs.querySelector('#ma-doc-a-1-e'))).toBe(
      translate('FILE.TOO_LARGE', { limit: '2 MB' }),
    );
    const ctl = TestBed.inject(HttpTestingController);
    expect(ctl.match((r) => r.url.endsWith('/record-documents'))).toHaveLength(0);

    pickFile(input, new File(['png'], 'photo.png', { type: 'image/png' }));
    let post = await request((u) => u === `${APP}/record-documents`, 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    let form = post.request.body as FormData;
    expect(form.get('documentType')).toBe('PHOTO');
    expect((form.get('file') as File).name).toBe('photo.png');
    const photo = {
      type: 'PHOTO',
      name: 'photo.png',
      sizeBytes: 3,
      mimeType: 'image/png',
      addedAt: '2026-10-22T05:00:00.000Z',
      url: '/api/v1/files/f-3/content?sig=z',
    };
    post.flush(application({ version: 6, documents: [...application().documents, photo] }), {
      status: 201,
      statusText: 'Created',
    });
    await tick();
    harness.detectChanges();
    expect(text(document.querySelector('.toasts'))).toContain('Document added');
    expect(
      [...drawer.querySelectorAll('#ma-docs-a-1 .li')].map(
        (d) => (d as HTMLElement).dataset['type'],
      ),
    ).toEqual(['BIRTH', 'MOTHER_AADHAAR_FRONT', 'PHOTO']);

    // A document attached already is replaced from its row.
    pickFile(
      drawer.querySelector('#ma-rep-BIRTH-a-1') as HTMLInputElement,
      new File(['%PDF'], 'birth-2.pdf', { type: 'application/pdf' }),
    );
    post = await request((u) => u === `${APP}/record-documents`, 'POST');
    form = post.request.body as FormData;
    expect(form.get('documentType')).toBe('BIRTH');
    post.flush(application({ version: 7 }), { status: 201, statusText: 'Created' });
    await tick();
    harness.detectChanges();
    expect(text(document.querySelector('.toasts'))).toContain('Document replaced');
  });
});
