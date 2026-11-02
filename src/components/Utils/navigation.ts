/**
 * The console and back-office menus, as the prototype draws them (RP.CNAV, RP.ONAV): groups, labels,
 * icons and page titles. Each entry names the task that shows it (the prototype's CNAV/ONAV
 * `task`; the server still checks the sub-task of every action) and the delivery phase its page
 * belongs to (brief §9; docs/reports/phases.json). Pages of later phases open with their title and
 * say when they arrive.
 */
import type { IconName } from './icons';

export type StaffSurface = 'console' | 'ops';

export interface NavItem {
  /** Prototype screen id (c.members …) — also the route: /console/members. */
  readonly id: string;
  readonly label: string;
  /** Page title (the prototype's def.title). */
  readonly title: string;
  readonly icon: IconName;
  /** The task that shows the entry (`task.<code>`; menus follow tasks, RNG-GOV-001). */
  readonly needs: readonly string[];
  /** Delivery phase of the page. */
  readonly phase: number;
  /** What the page is for, shown until it arrives. */
  readonly about: string;
  /** A translated page (Phase 10): the label's key in the web's texts. */
  readonly key?: string;
}

/**
 * A parent task of the menu (prototype v4 CNAV/ONAV): it folds its sub-tasks under one row, and
 * the home's task cards show it with its icon and what it covers. A `solo` task is a single page
 * (Dashboard, Reports): one row, no fold.
 */
export interface NavGroup {
  readonly group: string;
  /** The parent task's id (prototype `k`): the dashboard's ranking and the menu's open task. */
  readonly k: string;
  readonly icon: IconName;
  /** What the task covers (the task card's line). */
  readonly about: string;
  readonly solo?: boolean;
  /** A translated group's key. */
  readonly key?: string;
  readonly items: readonly NavItem[];
}

const item = (
  id: string,
  label: string,
  icon: IconName,
  needs: string | readonly string[],
  phase: number,
  about: string,
  title = label,
): NavItem => ({
  id,
  label,
  title,
  icon,
  needs: typeof needs === 'string' ? [needs] : needs,
  phase,
  about,
});

/** A teacher's page on the web (Phase 10): shown with the Teaching task, translated. */
const teach = (id: string, key: string, label: string, icon: IconName, about: string): NavItem => ({
  ...item(id, label, icon, 'task.teaching', 10, about),
  key,
});

/** One's own page (leave, notices, messages…): a teacher's or the principal's (client 2026-10-13). */
const mine = (id: string, key: string, label: string, icon: IconName, about: string): NavItem => ({
  ...item(id, label, icon, ['task.teaching', 'task.principal'], 10, about),
  key,
});

export const CONSOLE_NAV: readonly NavGroup[] = [
  {
    group: 'Dashboard',
    k: 'dash',
    icon: 'dash',
    about: 'Your day at a glance',
    solo: true,
    items: [item('c.home', 'Home', 'dash', 'task.home', 2, 'Your institution at a glance.')],
  },
  {
    group: 'Teaching',
    k: 'teaching',
    icon: 'bookopen',
    about: 'Your day, marks, attendance, homework and leave',
    key: 'ui.web.nav.teaching',
    items: [
      teach(
        'c.teaching',
        'ui.web.nav.today',
        'Today',
        'dash',
        "The day's periods and your classes.",
      ),
      teach(
        'c.teaching-marks',
        'ui.web.nav.marks',
        'Marks',
        'clipcheck',
        'Enter, upload and publish marks.',
      ),
      teach(
        'c.teaching-attendance',
        'ui.web.nav.attendance',
        'Attendance',
        'calcheck',
        'The class register and period attendance.',
      ),
      teach(
        'c.teaching-homework',
        'ui.web.nav.homework',
        'Homework',
        'bookopen',
        'Set and review homework.',
      ),
      teach(
        'c.teaching-leave',
        'ui.web.nav.leave',
        'Student leave',
        'leaveic',
        "Your class's leave requests.",
      ),
      teach('c.teaching-timetable', 'ui.web.nav.timetable', 'Timetable', 'calendar', 'Your week.'),
      teach(
        'c.teaching-announce',
        'ui.web.nav.announce',
        'Class announcements',
        'megaphone',
        'Notices to your classes.',
      ),
    ],
  },
  // The principal on the web (client 2026-10-13): the app's principal pages.
  {
    group: 'Principal',
    k: 'principal',
    icon: 'school',
    about: "The school's day, leave, attendance, academics and people",
    items: [
      item(
        'c.principal',
        'Overview',
        'dash',
        'task.principal',
        10,
        "The school's day: people, attendance, approvals and academics.",
        'School overview',
      ),
      item(
        'c.principal-leave',
        'Teacher leave',
        'plane',
        'task.principal',
        10,
        'Teacher and staff leave waiting for your decision.',
      ),
      item(
        'c.principal-attendance',
        'Attendance',
        'calcheck',
        'task.principal',
        10,
        "The day's attendance of students, teachers and staff.",
        'School attendance',
      ),
      item(
        'c.principal-academics',
        'Academics',
        'award',
        'task.principal',
        10,
        'Class performance, upcoming exams and timetables.',
      ),
      item(
        'c.principal-people',
        'People',
        'users',
        'task.principal',
        10,
        'Students, teachers and staff of the school.',
      ),
      // SRS 20.32, 20.33 (client 2026-10-14).
      item(
        'c.principal-students',
        'Student overview',
        'school',
        'task.principal',
        10,
        'Every student with their class, admission number and parent or contact.',
        'Student Overview',
      ),
      item(
        'c.principal-teachers',
        'Teacher overview',
        'usercheck',
        'task.principal',
        10,
        'The teachers of the class-teacher and subject-teacher mapping.',
        'Teacher Overview',
      ),
      item(
        'c.principal-announce',
        'Announcements',
        'megaphone',
        'task.principal',
        10,
        "The school's announcements, and your own.",
        'School announcements',
      ),
    ],
  },
  // One's own (client 2026-10-12; the principal's too, 2026-10-13), as in the app.
  {
    group: 'Personal',
    k: 'personal',
    icon: 'user',
    about: 'Your messages, notices, leave, attendance and calendar',
    key: 'ui.web.nav.personal',
    items: [
      mine(
        'c.teaching-messages',
        'ui.web.nav.messages',
        'Messages',
        'chats',
        'Your conversations.',
      ),
      mine(
        'c.teaching-notices',
        'ui.web.nav.notices',
        'Notices',
        'bell',
        'School notices and your notifications.',
      ),
      mine('c.teaching-my-leave', 'ui.web.nav.myLeave', 'My leave', 'briefcase', 'Your own leave.'),
      mine(
        'c.teaching-my-attendance',
        'ui.web.nav.myAttendance',
        'My attendance',
        'usercheck',
        'Your attendance by month.',
      ),
      mine(
        'c.teaching-calendar',
        'ui.web.nav.calendar',
        'Calendar',
        'calcheck',
        'The school calendar and your bus.',
      ),
    ],
  },
  // A merchant's counter on the web (client 2026-10-13): the merchant app's pages; a vendor
  // merchant also sees the assets it is paid against.
  {
    group: 'Merchant',
    k: 'merchant',
    icon: 'store',
    about: 'Collections, settlements, your wallet and QR codes',
    items: [
      item(
        'c.business',
        'Home',
        'dash',
        'task.business',
        10,
        "Today's collections, your wallet and QR codes.",
        'Merchant home',
      ),
      item(
        'c.business-collect',
        'Collect payment',
        'qr',
        'business.collect',
        10,
        'Take a payment with a dynamic QR code or a campus card.',
      ),
      item(
        'c.business-collections',
        'Collections',
        'receipt',
        'task.business',
        10,
        'Every payment you received, with filters and totals.',
      ),
      item(
        'c.business-settlements',
        'Settlements',
        'bank',
        'task.business',
        10,
        'What was paid out to your bank account, day by day.',
        'My settlements',
      ),
      item(
        'c.business-wallet',
        'Wallet',
        'wallet',
        'task.business',
        10,
        'Your merchant wallet and its statement.',
      ),
      item(
        'c.business-qr',
        'QR codes',
        'grid',
        'task.business',
        10,
        'Your static QR codes: print, download or e-mail them.',
        'My QR codes',
      ),
      item(
        'c.business-assets',
        'Assets',
        'box',
        'business.assets',
        10,
        'The approved assets you are paid against.',
        'Approved assets',
      ),
      item(
        'c.business-notices',
        'Notices',
        'bell',
        'task.business',
        10,
        'School notices and your notifications.',
      ),
    ],
  },
  {
    group: 'People',
    k: 'people',
    icon: 'users',
    about: 'Members, onboarding, NFC cards and user types',
    items: [
      item(
        'c.members',
        'Members',
        'users',
        'task.members',
        2,
        'Students, parents, teachers, staff and merchants of the institution.',
      ),
      item(
        'c.onboard',
        'Onboard members',
        'userplus',
        'task.members',
        2,
        'Add members one at a time or from a spreadsheet.',
      ),
      item(
        'c.cards',
        'NFC cards',
        'card',
        'task.cards',
        4,
        'Issue, block and re-issue campus cards.',
      ),
      item(
        'c.roles',
        'User types',
        'layers',
        'task.config',
        2,
        'User types and departments of the institution.',
        'User types & departments',
      ),
    ],
  },
  {
    group: 'Payments',
    k: 'payments',
    icon: 'wallet',
    about: 'Merchants, allowances, coupons, events and passes',
    items: [
      item(
        'c.merchants',
        'Merchants & QR',
        'store',
        'task.merchants',
        3,
        'Campus merchants, their QR codes and collections.',
      ),
      item(
        'c.allowances',
        'Allowances',
        'gift',
        'task.allowances',
        4,
        'Daily spending allowances for students.',
      ),
      item('c.coupons', 'Coupons', 'ticket', 'task.coupons', 4, 'Meal and service coupons.'),
      item('c.events', 'Events', 'calendar', 'task.events', 4, 'Paid events and who has paid.'),
      item('c.passes', 'Entry passes', 'door', 'task.passes', 4, 'Entry passes for events.'),
    ],
  },
  {
    group: 'Fees & finance',
    k: 'finance',
    icon: 'receipt',
    about: 'Fees, settlements, transactions and accounting',
    items: [
      item(
        'c.fees',
        'Fee structures',
        'layers',
        'task.fees',
        5,
        'Fee heads, instalments and due dates.',
      ),
      item(
        'c.feerecords',
        'Fee records',
        'receipt',
        'task.fees',
        5,
        'Each student’s fees, payments and dues.',
      ),
      item(
        'c.feecollection',
        'Fee collection details',
        'rupee',
        'task.fees',
        5,
        'What each student paid, head by head, against an approved fee structure.',
      ),
      item(
        'c.settlements',
        'Settlements',
        'bank',
        'task.settlements',
        6,
        'Daily settlements to merchants and the fee account.',
      ),
      item(
        'c.recon',
        'Transactions & MIS',
        'chart',
        'task.recon',
        6,
        'Every campus transaction, with filters and totals.',
      ),
      item(
        'c.vouchers',
        'Accounting',
        'filetext',
        'task.vouchers',
        6,
        'Accounting vouchers for the institution’s books.',
      ),
      item(
        'c.gateways',
        'Payment gateways',
        'card',
        'task.gateways',
        6,
        'The school’s own online payment accounts.',
      ),
      item(
        'c.corpcodes',
        'Bank accounts & VANs',
        'bank',
        'task.corpcodes',
        6,
        'Corporate codes from your banks, and which classes use each.',
      ),
    ],
  },
  {
    group: 'Admissions',
    k: 'admissions',
    icon: 'grad',
    about: 'Applications, admission fees and the public admission link',
    items: [
      item(
        'c.applications',
        'Applications',
        'filetext',
        'task.admissions',
        5,
        'Admission applications and their decisions.',
      ),
      item(
        'c.admfees',
        'Admission fees',
        'rupee',
        'task.admfees',
        5,
        'Application and admission fees collected.',
      ),
      item(
        'c.admissionqr',
        'Admission link & QR',
        'qr',
        'task.admqr',
        5,
        'The public admission link and its QR code.',
      ),
    ],
  },
  {
    group: 'Academics',
    k: 'academics',
    icon: 'school',
    about: 'Calendar, classes, timetable, exams and leave',
    items: [
      item(
        'c.calendar',
        'Calendar',
        'calendar',
        'task.academics',
        7,
        'Academic years, terms and holidays.',
        'Academic calendar',
      ),
      item(
        'c.structure',
        'Classes & subjects',
        'school',
        'task.academics',
        2,
        'Classes, sections and subjects.',
      ),
      item(
        'c.teachers',
        'Teacher assignments',
        'briefcase',
        'task.academics',
        7,
        'Who teaches which class and subject.',
      ),
      item('c.timetable', 'Timetable', 'grid', 'task.academics', 7, 'The weekly timetable.'),
      item(
        'c.enrol',
        'Enrolment & promotion',
        'grad',
        'task.academics',
        7,
        'Enrol students and promote them to the next year.',
      ),
      item('c.exams', 'Exams & marks', 'award', 'task.academics', 7, 'Exams, marks and results.'),
      item(
        'c.leave',
        'Teacher leave',
        'plane',
        'task.leave',
        7,
        'Leave requests from teachers and their decisions.',
      ),
    ],
  },
  {
    group: 'Attendance',
    k: 'attendance',
    icon: 'calcheck',
    about: 'Attendance reports, the front desk and card readers',
    items: [
      item(
        'c.attendance',
        'Attendance reports',
        'calcheck',
        'task.attendance',
        7,
        'Daily attendance by class and section.',
        'Attendance',
      ),
      // Client 2026-10-22: Accounts runs payroll from the staff's attendance.
      item(
        'c.payroll-attendance',
        'Payroll attendance',
        'rupee',
        'task.attendance',
        10,
        "Each staff member's month for payroll: days worked, leave and loss of pay.",
      ),
      item(
        'c.frontdesk',
        'Front desk',
        'door',
        'task.frontdesk',
        7,
        'Visitors, late arrivals and early leavers.',
      ),
      item('c.readers', 'Readers', 'nfc', 'task.readers', 7, 'Attendance readers on campus.'),
    ],
  },
  {
    group: 'Transport',
    k: 'transport',
    icon: 'bus',
    about: 'Live trips, routes, vehicles and seat allocations',
    items: [
      item('c.transport', 'Live trips', 'bus', 'task.transport', 7, 'Buses on the road now.'),
      item('c.routes', 'Routes & stops', 'route', 'task.transport', 7, 'Bus routes and stops.'),
      item('c.fleet', 'Vehicles & crew', 'truck', 'task.transport', 7, 'Vehicles and crew.'),
      item(
        'c.tassign',
        'Sessions & assignments',
        'clipboard',
        'task.transport',
        7,
        'Trip sessions and crew assignments.',
      ),
      item(
        'c.allocations',
        'Passenger allocations',
        'users',
        'task.transport',
        7,
        'Which student rides which bus.',
      ),
    ],
  },
  {
    group: 'Communication',
    k: 'comms',
    icon: 'megaphone',
    about: 'Announcements and the communication report',
    items: [
      item(
        'c.announcements',
        'Announcements',
        'megaphone',
        'task.comms',
        8,
        'Announcements to students, parents and staff.',
      ),
      item(
        'c.commreport',
        'Communication report',
        'chats',
        'task.commreport',
        8,
        'Every message sent, with its outcome.',
      ),
      item(
        'c.notifyevents',
        'Notification settings',
        'bell',
        'task.config',
        9,
        'Which notices are e-mailed and raise the phone alert.',
      ),
    ],
  },
  {
    group: 'Approvals',
    k: 'controls',
    icon: 'approve',
    about: 'Maker-checker approvals and grievance tickets',
    items: [
      item(
        'c.approvals',
        'Approvals',
        'approve',
        'task.approvals',
        2,
        'Requests waiting for the Institution Administrator’s decision.',
      ),
      item(
        'c.grievances',
        'Grievances',
        'help',
        'task.grievances',
        6,
        'Complaints raised by members and their resolution.',
      ),
    ],
  },
  {
    group: 'Settings',
    k: 'settings',
    icon: 'settings',
    about: 'Institution, features, fields, assets and billing',
    items: [
      item(
        'c.institution',
        'Institution & features',
        'building',
        'task.config',
        2,
        'The institution’s details, logo and features.',
      ),
      item(
        'c.fields',
        'Custom fields',
        'field',
        'task.config',
        2,
        'Extra fields on member records.',
      ),
      item('c.assets', 'Assets', 'box', 'task.config', 4, 'Assets lent to merchants.'),
      item(
        'c.subscription',
        'Plan & billing',
        'card',
        'task.config',
        2,
        'The CampusOne plan, invoices and payments.',
      ),
    ],
  },
  {
    group: 'Reports',
    k: 'reports',
    icon: 'report',
    about: 'Every report your role can open, grouped by area',
    solo: true,
    items: [
      item(
        'c.reports',
        'Reports',
        'report',
        'task.reports',
        8,
        'Every report of the institution in one place.',
      ),
    ],
  },
];

export const BACKOFFICE_NAV: readonly NavGroup[] = [
  {
    group: 'Dashboard',
    k: 'dash',
    icon: 'dash',
    about: 'Everything live across your tenants',
    solo: true,
    items: [item('o.home', 'Home', 'dash', 'task.home', 2, 'The platform at a glance.')],
  },
  {
    group: 'Tenants',
    k: 'tenants',
    icon: 'building',
    about: 'Institutions, plans and feature permissions',
    items: [
      item(
        'o.institutions',
        'Institutions',
        'building',
        'task.tenants',
        2,
        'Register institutions and manage their lifecycle.',
      ),
      item(
        'o.plans',
        'Plans & billing',
        'card',
        'task.tenants',
        2,
        'Plans, prices, invoices and payments.',
      ),
      item(
        'o.features',
        'Feature permissions',
        'toggle',
        'task.tenants',
        2,
        'Which features each institution may use.',
      ),
    ],
  },
  {
    group: 'Money operations',
    k: 'money',
    icon: 'bank',
    about: 'Settlements, reconciliation and nightly jobs',
    items: [
      item(
        'o.settlements',
        'Settlement approvals',
        'bank',
        'task.settle',
        6,
        'Two-stage settlement approval and payout references.',
      ),
      item(
        'o.recon',
        'Reconciliation',
        'scale',
        'task.recon',
        6,
        'Bank statements, mismatches, refunds and chargebacks.',
      ),
      item(
        'o.jobs',
        'Scheduled processing',
        'timer',
        'task.jobs',
        2,
        'Scheduled jobs, their runs and logs.',
      ),
    ],
  },
  {
    group: 'Governance',
    k: 'gov',
    icon: 'shieldck',
    about: 'Reports, access records, logs and the support desk',
    items: [
      item(
        'o.crossinst',
        'Cross-institution report',
        'globe',
        'task.crossinst',
        8,
        'Figures across institutions; every view is recorded.',
      ),
      item(
        'o.access',
        'Access record',
        'shieldck',
        'task.access',
        8,
        'Who viewed which institution’s data, and when.',
      ),
      item('o.logs', 'Log analyser', 'terminal', 'task.logs', 8, 'Search the platform logs.'),
      item(
        'o.support',
        'Support desk',
        'phone',
        'task.support',
        6,
        'Look up members and record support calls.',
      ),
    ],
  },
  {
    group: 'Platform',
    k: 'platform',
    icon: 'server',
    about: 'Roles, approvals, languages, partner APIs and the quiz bank',
    items: [
      item(
        'o.roles',
        'Roles & tasks',
        'key',
        'task.platform',
        2,
        'Roles, tasks and sub-tasks for institutions and operators.',
      ),
      item(
        'o.approvals',
        'Approvals',
        'approve',
        'task.platform',
        2,
        'Corrections from members without a school, decided by the Platform Administrator.',
      ),
      item(
        'o.languages',
        'Languages',
        'lang',
        'task.platform',
        2,
        'Languages and their translations.',
      ),
      item(
        'o.partners',
        'Partner API clients',
        'plug',
        'task.platform',
        3,
        'Partners that call the CampusOne API.',
      ),
      item(
        'o.quiz',
        'Quiz question bank',
        'bulb',
        'task.platform',
        8,
        'Questions for the financial-literacy quiz.',
      ),
    ],
  },
];

export const navOf = (s: StaffSurface) => (s === 'console' ? CONSOLE_NAV : BACKOFFICE_NAV);

/** Route segment of a screen id: c.members → members. */
export const pathOf = (id: string) => id.slice(2);

export function findItem(s: StaffSurface, path: string) {
  for (const g of navOf(s)) {
    const it = g.items.find((i) => pathOf(i.id) === path);
    if (it) return { group: g.group, item: it };
  }
  return undefined;
}

/**
 * The page a console session without the institution home (task.home) lands on — a teacher's day,
 * the principal's school overview or a merchant's counter (client 2026-10-13) — or null when the
 * console home is theirs. That page is the person's dashboard: the greeting, then the task cards.
 */
export function ownHome(subTasks: readonly string[]): 'teaching' | 'principal' | 'business' | null {
  if (subTasks.includes('task.home')) return null;
  return (
    (['teaching', 'principal', 'business'] as const).find((p) => subTasks.includes(`task.${p}`)) ??
    null
  );
}

/** The menu a session sees: entries it has a sub-task for, empty groups dropped. */
export function visibleNav(s: StaffSurface, subTasks: readonly string[]): NavGroup[] {
  const granted = new Set(subTasks);
  return navOf(s)
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => i.needs.some((n) => granted.has(n))),
    }))
    .filter((g) => g.items.length > 0);
}
