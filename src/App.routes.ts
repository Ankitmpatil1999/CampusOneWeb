import type { Routes } from '@angular/router';
import { AREAS } from './Config';
import { portalSession } from './Context/PortalContext';
import { staffSession } from './Context/SessionContext';
import { Mainpage } from './components/Mainpage/Mainpage';
import { areaAvailable } from './components/Utils/areas.service';

/**
 * Routes. The console and the back office use the prototype's frame (Mainpage) behind their sign-in
 * page; menu pages of later increments open the upcoming-page view. Every area is lazy-loaded so its
 * code downloads only when opened; an area this host does not serve (back-office host name,
 * ADR-0014) falls through to the landing page.
 */
const upcoming = () => import('./components/Shared/UpcomingPage').then((m) => m.UpcomingPage);

export const appRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: '/signin',
  },
  {
    path: 'signin',
    title: 'CampusOne — Sign in',
    loadComponent: () =>
      import('./components/Shared/StaffSignin').then((m) => m.StaffSignin),
  },
  // A teacher's way in (Phase 10): the console sign-in, then the teaching pages.
  { path: 'teacher', pathMatch: 'full', redirectTo: '/console/teaching' },
  {
    path: 'console/signin',
    pathMatch: 'full',
    redirectTo: '/signin',
  },
  {
    path: 'console/reset-password',
    canMatch: [areaAvailable(AREAS.console.path)],
    title: 'CampusOne — New console password',
    loadComponent: () =>
      import('./components/Pages/Console/ResetPassword/ConsoleResetPassword').then(
        (m) => m.ConsoleResetPassword,
      ),
  },
  {
    path: AREAS.console.path,
    canMatch: [areaAvailable(AREAS.console.path)],
    canActivate: [staffSession('console')],
    component: Mainpage,
    data: { surface: 'console' },
    children: [
      // Teachers on the web (Phase 10): their own classes, the same APIs as the app.
      {
        path: 'teaching',
        title: 'CampusOne — Today',
        loadComponent: () =>
          import('./components/Pages/Console/Teaching/TeachingToday').then((m) => m.TeachingToday),
      },
      {
        path: 'teaching-marks',
        title: 'CampusOne — Marks',
        loadComponent: () =>
          import('./components/Pages/Console/Teaching/TeachingMarks').then((m) => m.TeachingMarks),
      },
      {
        path: 'teaching-attendance',
        title: 'CampusOne — Attendance',
        loadComponent: () =>
          import('./components/Pages/Console/Teaching/TeachingAttendance').then(
            (m) => m.TeachingAttendance,
          ),
      },
      {
        path: 'teaching-homework',
        title: 'CampusOne — Homework',
        loadComponent: () =>
          import('./components/Pages/Console/Teaching/TeachingHomework').then(
            (m) => m.TeachingHomework,
          ),
      },
      {
        path: 'teaching-leave',
        title: 'CampusOne — Student leave',
        loadComponent: () =>
          import('./components/Pages/Console/Teaching/TeachingLeave').then((m) => m.TeachingLeave),
      },
      {
        path: 'teaching-timetable',
        title: 'CampusOne — Timetable',
        loadComponent: () =>
          import('./components/Pages/Console/Teaching/TeachingTimetable').then(
            (m) => m.TeachingTimetable,
          ),
      },
      {
        path: 'teaching-announce',
        title: 'CampusOne — Class announcements',
        loadComponent: () =>
          import('./components/Pages/Console/Teaching/TeachingAnnounce').then(
            (m) => m.TeachingAnnounce,
          ),
      },
      // The teacher's own pages (client 2026-10-12).
      {
        path: 'teaching-messages',
        title: 'CampusOne — Messages',
        loadComponent: () =>
          import('./components/Pages/Console/Teaching/TeachingMessages').then(
            (m) => m.TeachingMessages,
          ),
      },
      {
        path: 'teaching-notices',
        title: 'CampusOne — Notices',
        loadComponent: () =>
          import('./components/Pages/Console/Teaching/TeachingNotices').then(
            (m) => m.TeachingNotices,
          ),
      },
      {
        path: 'teaching-my-leave',
        title: 'CampusOne — My leave',
        loadComponent: () =>
          import('./components/Pages/Console/Teaching/TeachingMyLeave').then(
            (m) => m.TeachingMyLeave,
          ),
      },
      {
        path: 'teaching-my-attendance',
        title: 'CampusOne — My attendance',
        loadComponent: () =>
          import('./components/Pages/Console/Teaching/TeachingMyAttendance').then(
            (m) => m.TeachingMyAttendance,
          ),
      },
      {
        path: 'teaching-calendar',
        title: 'CampusOne — Calendar',
        loadComponent: () =>
          import('./components/Pages/Console/Teaching/TeachingCalendar').then(
            (m) => m.TeachingCalendar,
          ),
      },
      // The principal on the web (client 2026-10-13): the app's principal pages.
      {
        path: 'principal',
        title: 'CampusOne — School overview',
        loadComponent: () =>
          import('./components/Pages/Console/Principal/PrincipalOverview').then(
            (m) => m.PrincipalOverview,
          ),
      },
      {
        path: 'principal-leave',
        title: 'CampusOne — Teacher leave',
        loadComponent: () =>
          import('./components/Pages/Console/Principal/PrincipalLeave').then(
            (m) => m.PrincipalLeave,
          ),
      },
      {
        path: 'principal-attendance',
        title: 'CampusOne — School attendance',
        loadComponent: () =>
          import('./components/Pages/Console/Principal/PrincipalAttendance').then(
            (m) => m.PrincipalAttendance,
          ),
      },
      {
        path: 'principal-academics',
        title: 'CampusOne — Academics',
        loadComponent: () =>
          import('./components/Pages/Console/Principal/PrincipalAcademics').then(
            (m) => m.PrincipalAcademics,
          ),
      },
      {
        path: 'principal-people',
        title: 'CampusOne — People',
        loadComponent: () =>
          import('./components/Pages/Console/Principal/PrincipalPeople').then(
            (m) => m.PrincipalPeople,
          ),
      },
      // Student Overview and Teacher Overview (SRS 20.32, 20.33; client 2026-10-14).
      {
        path: 'principal-students',
        title: 'CampusOne — Student Overview',
        loadComponent: () =>
          import('./components/Pages/Console/Principal/PrincipalStudents').then(
            (m) => m.PrincipalStudents,
          ),
      },
      {
        path: 'principal-teachers',
        title: 'CampusOne — Teacher Overview',
        loadComponent: () =>
          import('./components/Pages/Console/Principal/PrincipalTeachers').then(
            (m) => m.PrincipalTeachers,
          ),
      },
      {
        path: 'principal-announce',
        title: 'CampusOne — School announcements',
        loadComponent: () =>
          import('./components/Pages/Console/Principal/PrincipalAnnouncements').then(
            (m) => m.PrincipalAnnouncements,
          ),
      },
      // A merchant's counter on the web (client 2026-10-13): the merchant app's pages.
      {
        path: 'business',
        title: 'CampusOne — Merchant home',
        loadComponent: () =>
          import('./components/Pages/Console/Business/BusinessHome').then((m) => m.BusinessHome),
      },
      {
        path: 'business-collect',
        title: 'CampusOne — Collect payment',
        loadComponent: () =>
          import('./components/Pages/Console/Business/BusinessCollect').then(
            (m) => m.BusinessCollect,
          ),
      },
      {
        path: 'business-collections',
        title: 'CampusOne — Collections',
        loadComponent: () =>
          import('./components/Pages/Console/Business/BusinessCollections').then(
            (m) => m.BusinessCollections,
          ),
      },
      {
        path: 'business-settlements',
        title: 'CampusOne — My settlements',
        loadComponent: () =>
          import('./components/Pages/Console/Business/BusinessSettlements').then(
            (m) => m.BusinessSettlements,
          ),
      },
      {
        path: 'business-wallet',
        title: 'CampusOne — Wallet',
        loadComponent: () =>
          import('./components/Pages/Console/Business/BusinessWallet').then(
            (m) => m.BusinessWallet,
          ),
      },
      {
        path: 'business-qr',
        title: 'CampusOne — My QR codes',
        loadComponent: () =>
          import('./components/Pages/Console/Business/BusinessQr').then((m) => m.BusinessQr),
      },
      {
        path: 'business-assets',
        title: 'CampusOne — Approved assets',
        loadComponent: () =>
          import('./components/Pages/Console/Business/BusinessAssets').then(
            (m) => m.BusinessAssets,
          ),
      },
      {
        path: 'business-notices',
        title: 'CampusOne — Notices',
        loadComponent: () =>
          import('./components/Pages/Console/Teaching/TeachingNotices').then(
            (m) => m.TeachingNotices,
          ),
      },
      {
        path: '',
        title: 'CampusOne — Console',
        loadComponent: () =>
          import('./components/Pages/Console/Home/ConsoleHome').then((m) => m.ConsoleHome),
      },
      {
        path: 'institution',
        title: 'CampusOne — Institution & features',
        loadComponent: () =>
          import('./components/Pages/Console/Institution/ConsoleInstitution').then(
            (m) => m.ConsoleInstitution,
          ),
      },
      {
        path: 'roles',
        title: 'CampusOne — User types & departments',
        loadComponent: () =>
          import('./components/Pages/Console/UserTypes/ConsoleUserTypes').then(
            (m) => m.ConsoleUserTypes,
          ),
      },
      {
        path: 'fields',
        title: 'CampusOne — Custom fields',
        loadComponent: () =>
          import('./components/Pages/Console/Fields/ConsoleFields').then((m) => m.ConsoleFields),
      },
      {
        path: 'members',
        title: 'CampusOne — Members',
        loadComponent: () =>
          import('./components/Pages/Console/Members/ConsoleMembers').then((m) => m.ConsoleMembers),
      },
      {
        path: 'onboard',
        title: 'CampusOne — Onboard members',
        loadComponent: () =>
          import('./components/Pages/Console/Onboard/ConsoleOnboard').then((m) => m.ConsoleOnboard),
      },
      {
        path: 'structure',
        title: 'CampusOne — Classes & subjects',
        loadComponent: () =>
          import('./components/Pages/Console/Structure/ConsoleStructure').then(
            (m) => m.ConsoleStructure,
          ),
      },
      {
        path: 'calendar',
        title: 'CampusOne — Academic calendar',
        loadComponent: () =>
          import('./components/Pages/Console/Calendar/ConsoleCalendar').then(
            (m) => m.ConsoleCalendar,
          ),
      },
      {
        path: 'teachers',
        title: 'CampusOne — Teacher assignments',
        loadComponent: () =>
          import('./components/Pages/Console/Teachers/ConsoleTeachers').then(
            (m) => m.ConsoleTeachers,
          ),
      },
      {
        path: 'timetable',
        title: 'CampusOne — Timetable',
        loadComponent: () =>
          import('./components/Pages/Console/Timetable/ConsoleTimetable').then(
            (m) => m.ConsoleTimetable,
          ),
      },
      {
        path: 'enrol',
        title: 'CampusOne — Enrolment & promotion',
        loadComponent: () =>
          import('./components/Pages/Console/Enrol/ConsoleEnrol').then((m) => m.ConsoleEnrol),
      },
      {
        path: 'exams',
        title: 'CampusOne — Exams & marks',
        loadComponent: () =>
          import('./components/Pages/Console/Exams/ConsoleExams').then((m) => m.ConsoleExams),
      },
      {
        path: 'leave',
        title: 'CampusOne — Teacher leave',
        loadComponent: () =>
          import('./components/Pages/Console/Leave/ConsoleLeave').then((m) => m.ConsoleLeave),
      },
      {
        path: 'search',
        title: 'CampusOne — Search',
        loadComponent: () =>
          import('./components/Pages/Console/Search/ConsoleSearch').then((m) => m.ConsoleSearch),
      },
      {
        path: 'subscription',
        title: 'CampusOne — Plan & billing',
        loadComponent: () =>
          import('./components/Pages/Console/Subscription/ConsoleSubscription').then(
            (m) => m.ConsoleSubscription,
          ),
      },
      {
        path: 'approvals',
        title: 'CampusOne — Approvals',
        loadComponent: () =>
          import('./components/Pages/Console/Approvals/ConsoleApprovals').then(
            (m) => m.ConsoleApprovals,
          ),
      },
      {
        path: 'merchants',
        title: 'CampusOne — Merchants & QR',
        loadComponent: () =>
          import('./components/Pages/Console/Merchants/ConsoleMerchants').then(
            (m) => m.ConsoleMerchants,
          ),
      },
      {
        path: 'allowances',
        title: 'CampusOne — Allowances',
        loadComponent: () =>
          import('./components/Pages/Console/Allowances/ConsoleAllowances').then(
            (m) => m.ConsoleAllowances,
          ),
      },
      {
        path: 'coupons',
        title: 'CampusOne — Coupons',
        loadComponent: () =>
          import('./components/Pages/Console/Coupons/ConsoleCoupons').then((m) => m.ConsoleCoupons),
      },
      {
        path: 'fees',
        title: 'CampusOne — Fee structures',
        loadComponent: () =>
          import('./components/Pages/Console/Fees/ConsoleFees').then((m) => m.ConsoleFees),
      },
      {
        path: 'feerecords',
        title: 'CampusOne — Fee records',
        loadComponent: () =>
          import('./components/Pages/Console/FeeRecords/ConsoleFeeRecords').then(
            (m) => m.ConsoleFeeRecords,
          ),
      },
      {
        path: 'feecollection',
        title: 'CampusOne — Fee collection details',
        loadComponent: () =>
          import('./components/Pages/Console/FeeCollection/ConsoleFeeCollection').then(
            (m) => m.ConsoleFeeCollection,
          ),
      },
      {
        path: 'events',
        title: 'CampusOne — Events',
        loadComponent: () =>
          import('./components/Pages/Console/Events/ConsoleEvents').then((m) => m.ConsoleEvents),
      },
      {
        path: 'passes',
        title: 'CampusOne — Entry passes',
        loadComponent: () =>
          import('./components/Pages/Console/Passes/ConsolePasses').then((m) => m.ConsolePasses),
      },
      {
        path: 'attendance',
        title: 'CampusOne — Attendance',
        loadComponent: () =>
          import('./components/Pages/Console/Attendance/ConsoleAttendance').then(
            (m) => m.ConsoleAttendance,
          ),
      },
      // Payroll from attendance (client 2026-10-22): each staff member's month for Accounts.
      {
        path: 'payroll-attendance',
        title: 'CampusOne — Payroll attendance',
        loadComponent: () =>
          import('./components/Pages/Console/Attendance/PayrollAttendance').then(
            (m) => m.PayrollAttendance,
          ),
      },
      {
        path: 'frontdesk',
        title: 'CampusOne — Front desk',
        loadComponent: () =>
          import('./components/Pages/Console/FrontDesk/ConsoleFrontDesk').then(
            (m) => m.ConsoleFrontDesk,
          ),
      },
      {
        path: 'transport',
        title: 'CampusOne — Live trips',
        loadComponent: () =>
          import('./components/Pages/Console/Transport/ConsoleTransport').then(
            (m) => m.ConsoleTransport,
          ),
      },
      {
        path: 'routes',
        title: 'CampusOne — Routes & stops',
        loadComponent: () =>
          import('./components/Pages/Console/Routes/ConsoleRoutes').then((m) => m.ConsoleRoutes),
      },
      {
        path: 'fleet',
        title: 'CampusOne — Vehicles & crew',
        loadComponent: () =>
          import('./components/Pages/Console/Fleet/ConsoleFleet').then((m) => m.ConsoleFleet),
      },
      {
        path: 'tassign',
        title: 'CampusOne — Sessions & assignments',
        loadComponent: () =>
          import('./components/Pages/Console/TransportAssign/ConsoleTransportAssign').then(
            (m) => m.ConsoleTransportAssign,
          ),
      },
      {
        path: 'allocations',
        title: 'CampusOne — Passenger allocations',
        loadComponent: () =>
          import('./components/Pages/Console/Allocations/ConsoleAllocations').then(
            (m) => m.ConsoleAllocations,
          ),
      },
      {
        path: 'notifyevents',
        title: 'CampusOne — Notification settings',
        loadComponent: () =>
          import('./components/Pages/Console/NotifyEvents/ConsoleNotifyEvents').then(
            (m) => m.ConsoleNotifyEvents,
          ),
      },
      {
        path: 'corpcodes',
        title: 'CampusOne — Bank accounts & VANs',
        loadComponent: () =>
          import('./components/Pages/Console/CorporateCodes/ConsoleCorporateCodes').then(
            (m) => m.ConsoleCorporateCodes,
          ),
      },
      {
        path: 'gateways',
        title: 'CampusOne — Payment gateways',
        loadComponent: () =>
          import('./components/Pages/Console/PaymentGateways/ConsolePaymentGateways').then(
            (m) => m.ConsolePaymentGateways,
          ),
      },
      {
        path: 'readers',
        title: 'CampusOne — Readers',
        loadComponent: () =>
          import('./components/Pages/Console/Readers/ConsoleReaders').then((m) => m.ConsoleReaders),
      },
      {
        path: 'cards',
        title: 'CampusOne — NFC cards',
        loadComponent: () =>
          import('./components/Pages/Console/Cards/ConsoleCards').then((m) => m.ConsoleCards),
      },
      {
        path: 'assets',
        title: 'CampusOne — Assets',
        loadComponent: () =>
          import('./components/Pages/Console/Assets/ConsoleAssets').then((m) => m.ConsoleAssets),
      },
      // The counsellor's application: the public form's steps (client 2026-10-15).
      {
        path: 'applications/new',
        title: 'CampusOne — New application',
        loadComponent: () =>
          import('./components/Pages/Console/Applications/ApplicationWizard').then(
            (m) => m.ApplicationWizard,
          ),
      },
      {
        path: 'applications',
        title: 'CampusOne — Applications',
        loadComponent: () =>
          import('./components/Pages/Console/Applications/ConsoleApplications').then(
            (m) => m.ConsoleApplications,
          ),
      },
      {
        path: 'admissionqr',
        title: 'CampusOne — Admission link & QR',
        loadComponent: () =>
          import('./components/Pages/Console/AdmissionQr/ConsoleAdmissionQr').then(
            (m) => m.ConsoleAdmissionQr,
          ),
      },
      {
        path: 'admfees',
        title: 'CampusOne — Admission fees',
        loadComponent: () =>
          import('./components/Pages/Console/AdmissionFees/ConsoleAdmissionFees').then(
            (m) => m.ConsoleAdmissionFees,
          ),
      },
      {
        path: 'settlements',
        title: 'CampusOne — Settlements',
        loadComponent: () =>
          import('./components/Pages/Console/Settlements/ConsoleSettlements').then(
            (m) => m.ConsoleSettlements,
          ),
      },
      {
        path: 'recon',
        title: 'CampusOne — Transactions & MIS',
        loadComponent: () =>
          import('./components/Pages/Console/Recon/ConsoleRecon').then((m) => m.ConsoleRecon),
      },
      {
        path: 'vouchers',
        title: 'CampusOne — Accounting',
        loadComponent: () =>
          import('./components/Pages/Console/Vouchers/ConsoleVouchers').then(
            (m) => m.ConsoleVouchers,
          ),
      },
      {
        path: 'grievances',
        title: 'CampusOne — Grievances',
        loadComponent: () =>
          import('./components/Pages/Console/Grievances/ConsoleGrievances').then(
            (m) => m.ConsoleGrievances,
          ),
      },
      {
        path: 'reports',
        title: 'CampusOne — Reports',
        loadComponent: () =>
          import('./components/Pages/Console/Reports/ConsoleReports').then((m) => m.ConsoleReports),
      },
      {
        path: 'announcements',
        title: 'CampusOne — Announcements',
        loadComponent: () =>
          import('./components/Pages/Console/Announcements/ConsoleAnnouncements').then(
            (m) => m.ConsoleAnnouncements,
          ),
      },
      {
        path: 'commreport',
        title: 'CampusOne — Communication report',
        loadComponent: () =>
          import('./components/Pages/Console/CommReport/ConsoleCommReport').then(
            (m) => m.ConsoleCommReport,
          ),
      },
      { path: ':page', title: 'CampusOne — Console', loadComponent: upcoming },
    ],
  },
  {
    path: 'backoffice/signin',
    pathMatch: 'full',
    redirectTo: '/signin',
  },
  {
    path: 'backoffice/reset-password',
    canMatch: [areaAvailable(AREAS.backoffice.path)],
    title: 'CampusOne — New back-office password',
    loadComponent: () =>
      import('./components/Pages/Backoffice/ResetPassword/BackofficeResetPassword').then(
        (m) => m.BackofficeResetPassword,
      ),
  },
  {
    path: AREAS.backoffice.path,
    canMatch: [areaAvailable(AREAS.backoffice.path)],
    canActivate: [staffSession('ops')],
    component: Mainpage,
    data: { surface: 'ops' },
    children: [
      {
        path: '',
        title: 'CampusOne — Back office',
        loadComponent: () =>
          import('./components/Pages/Backoffice/Home/BackofficeHome').then((m) => m.BackofficeHome),
      },
      {
        path: 'roles',
        title: 'CampusOne — Roles & tasks',
        loadComponent: () =>
          import('./components/Pages/Backoffice/Roles/BackofficeRoles').then(
            (m) => m.BackofficeRoles,
          ),
      },
      {
        path: 'jobs',
        title: 'CampusOne — Scheduled processing',
        loadComponent: () =>
          import('./components/Pages/Backoffice/Jobs/BackofficeJobs').then((m) => m.BackofficeJobs),
      },
      {
        path: 'institutions',
        title: 'CampusOne — Institutions',
        loadComponent: () =>
          import('./components/Pages/Backoffice/Institutions/BackofficeInstitutions').then(
            (m) => m.BackofficeInstitutions,
          ),
      },
      {
        path: 'plans',
        title: 'CampusOne — Plans & billing',
        loadComponent: () =>
          import('./components/Pages/Backoffice/Plans/BackofficePlans').then(
            (m) => m.BackofficePlans,
          ),
      },
      {
        path: 'features',
        title: 'CampusOne — Feature permissions',
        loadComponent: () =>
          import('./components/Pages/Backoffice/Features/BackofficeFeatures').then(
            (m) => m.BackofficeFeatures,
          ),
      },
      {
        // o.search: the top bar's search (RPT-008).
        path: 'search',
        title: 'CampusOne — Search',
        loadComponent: () =>
          import('./components/Pages/Backoffice/Search/BackofficeSearch').then(
            (m) => m.BackofficeSearch,
          ),
      },
      {
        // The console's approvals page on the platform's own requests (ADR-0015).
        path: 'approvals',
        title: 'CampusOne — Approvals',
        data: { surface: 'ops' },
        loadComponent: () =>
          import('./components/Pages/Console/Approvals/ConsoleApprovals').then(
            (m) => m.ConsoleApprovals,
          ),
      },
      {
        path: 'partners',
        title: 'CampusOne — Partner API clients',
        loadComponent: () =>
          import('./components/Pages/Backoffice/Partners/BackofficePartners').then(
            (m) => m.BackofficePartners,
          ),
      },
      {
        path: 'settlements',
        title: 'CampusOne — Settlement approvals',
        loadComponent: () =>
          import('./components/Pages/Backoffice/Settlements/BackofficeSettlements').then(
            (m) => m.BackofficeSettlements,
          ),
      },
      {
        path: 'recon',
        title: 'CampusOne — Reconciliation',
        loadComponent: () =>
          import('./components/Pages/Backoffice/Recon/BackofficeRecon').then(
            (m) => m.BackofficeRecon,
          ),
      },
      {
        path: 'support',
        title: 'CampusOne — Support desk',
        loadComponent: () =>
          import('./components/Pages/Backoffice/Support/BackofficeSupport').then(
            (m) => m.BackofficeSupport,
          ),
      },
      {
        path: 'crossinst',
        title: 'CampusOne — Cross-institution reports',
        loadComponent: () =>
          import('./components/Pages/Backoffice/CrossInst/BackofficeCrossInst').then(
            (m) => m.BackofficeCrossInst,
          ),
      },
      {
        path: 'access',
        title: 'CampusOne — Access records',
        loadComponent: () =>
          import('./components/Pages/Backoffice/Access/BackofficeAccess').then(
            (m) => m.BackofficeAccess,
          ),
      },
      {
        path: 'logs',
        title: 'CampusOne — Log analyser',
        loadComponent: () =>
          import('./components/Pages/Backoffice/Logs/BackofficeLogs').then((m) => m.BackofficeLogs),
      },
      {
        path: 'languages',
        title: 'CampusOne — Languages',
        loadComponent: () =>
          import('./components/Pages/Backoffice/Languages/BackofficeLanguages').then(
            (m) => m.BackofficeLanguages,
          ),
      },
      {
        path: 'quiz',
        title: 'CampusOne — Financial literacy',
        loadComponent: () =>
          import('./components/Pages/Backoffice/Quiz/BackofficeQuiz').then((m) => m.BackofficeQuiz),
      },
      { path: ':page', title: 'CampusOne — Back office', loadComponent: upcoming },
    ],
  },
  {
    path: AREAS.admissions.path,
    pathMatch: 'full',
    canMatch: [areaAvailable(AREAS.admissions.path)],
    title: `CampusOne — ${AREAS.admissions.title}`,
    loadComponent: () =>
      import('./components/Pages/Admissions/AdmissionsHome').then((m) => m.AdmissionsHome),
  },
  // An instalment's payment link or QR code (client 2026-10-19): the school's payment page, served
  // where the admission pages are (family-facing).
  {
    path: 'fees/pay/:requestId',
    canMatch: [areaAvailable(AREAS.admissions.path)],
    title: 'CampusOne — Pay the school fee',
    loadComponent: () => import('./components/Pages/FeePay/FeePay').then((m) => m.FeePay),
  },
  // The public admission pages (prototype p.*), opened from the school's admission link or QR:
  // /admissions/<link token> and its form, checkout, confirmation and status pages; the school's
  // admission-fee payment link /admissions/pay/<application id>?token=…; the bare status page.
  {
    path: AREAS.admissions.path,
    canMatch: [areaAvailable(AREAS.admissions.path)],
    loadComponent: () =>
      import('./components/Pages/Admissions/Layout/AdmissionsFrame').then((m) => m.AdmissionsFrame),
    children: [
      {
        path: 'status',
        title: 'CampusOne — Application status',
        loadComponent: () =>
          import('./components/Pages/Admissions/Status/AdmissionStatus').then(
            (m) => m.AdmissionStatus,
          ),
      },
      {
        path: 'pay/:applicationId',
        title: 'CampusOne — Pay the admission fee',
        loadComponent: () =>
          import('./components/Pages/Admissions/Pay/AdmissionPay').then((m) => m.AdmissionPay),
      },
      {
        path: ':linkToken',
        title: `CampusOne — ${AREAS.admissions.title}`,
        loadComponent: () =>
          import('./components/Pages/Admissions/Landing/AdmissionLanding').then(
            (m) => m.AdmissionLanding,
          ),
      },
      {
        path: ':linkToken/apply',
        title: 'CampusOne — Application for admission',
        loadComponent: () =>
          import('./components/Pages/Admissions/Form/AdmissionForm').then((m) => m.AdmissionForm),
      },
      {
        path: ':linkToken/pay',
        title: 'CampusOne — Pay the application fee',
        loadComponent: () =>
          import('./components/Pages/Admissions/Pay/AdmissionPay').then((m) => m.AdmissionPay),
      },
      {
        path: ':linkToken/done',
        title: 'CampusOne — Application submitted',
        loadComponent: () =>
          import('./components/Pages/Admissions/Done/AdmissionDone').then((m) => m.AdmissionDone),
      },
      {
        path: ':linkToken/status',
        title: 'CampusOne — Application status',
        loadComponent: () =>
          import('./components/Pages/Admissions/Status/AdmissionStatus').then(
            (m) => m.AdmissionStatus,
          ),
      },
    ],
  },
  // The customer portal (prototype s.*): the public website, sign-up and sign-in, then the signed-in
  // account behind the portal's own session (its cookies are separate from the console's).
  {
    path: 'portal/signup',
    canMatch: [areaAvailable(AREAS.portal.path)],
    title: 'CampusOne — Start your free trial',
    loadComponent: () =>
      import('./components/Pages/Portal/Signup/PortalSignup').then((m) => m.PortalSignup),
  },
  {
    path: 'portal/signin',
    canMatch: [areaAvailable(AREAS.portal.path)],
    title: 'CampusOne — Sign in to the portal',
    loadComponent: () =>
      import('./components/Pages/Portal/Signin/PortalSignin').then((m) => m.PortalSignin),
  },
  {
    path: 'portal/reset-password',
    canMatch: [areaAvailable(AREAS.portal.path)],
    title: 'CampusOne — New portal password',
    data: { mode: 'reset' },
    loadComponent: () =>
      import('./components/Pages/Portal/Signin/PortalSignin').then((m) => m.PortalSignin),
  },
  {
    path: AREAS.portal.path,
    canMatch: [areaAvailable(AREAS.portal.path)],
    loadComponent: () =>
      import('./components/Pages/Portal/Layout/PortalSite').then((m) => m.PortalSite),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: `CampusOne — ${AREAS.portal.title}`,
        loadComponent: () =>
          import('./components/Pages/Portal/Home/PortalHome').then((m) => m.PortalHome),
      },
      {
        path: 'pricing',
        title: 'CampusOne — Pricing',
        loadComponent: () =>
          import('./components/Pages/Portal/Pricing/PortalPricing').then((m) => m.PortalPricing),
      },
    ],
  },
  {
    path: AREAS.portal.path,
    canMatch: [areaAvailable(AREAS.portal.path)],
    canActivate: [portalSession],
    loadComponent: () =>
      import('./components/Pages/Portal/Layout/PortalApp').then((m) => m.PortalApp),
    children: [
      {
        path: 'onboard',
        title: 'CampusOne — Onboarding',
        loadComponent: () =>
          import('./components/Pages/Portal/Onboard/PortalOnboard').then((m) => m.PortalOnboard),
      },
      {
        path: 'step/:key',
        title: 'CampusOne — Onboarding step',
        loadComponent: () =>
          import('./components/Pages/Portal/Step/PortalStep').then((m) => m.PortalStep),
      },
      {
        path: 'activate',
        title: 'CampusOne — Go live',
        loadComponent: () =>
          import('./components/Pages/Portal/Activate/PortalActivate').then((m) => m.PortalActivate),
      },
      {
        path: 'account',
        title: 'CampusOne — Overview',
        loadComponent: () =>
          import('./components/Pages/Portal/Account/PortalAccount').then((m) => m.PortalAccount),
      },
      {
        path: 'plan',
        title: 'CampusOne — Plan & usage',
        loadComponent: () =>
          import('./components/Pages/Portal/Plan/PortalPlan').then((m) => m.PortalPlan),
      },
      {
        path: 'billing',
        title: 'CampusOne — Billing',
        loadComponent: () =>
          import('./components/Pages/Portal/Billing/PortalBilling').then((m) => m.PortalBilling),
      },
      {
        path: 'notices',
        title: 'CampusOne — Notices & history',
        loadComponent: () =>
          import('./components/Pages/Portal/Notices/PortalNotices').then((m) => m.PortalNotices),
      },
      {
        path: 'details',
        title: 'CampusOne — Institution details',
        loadComponent: () =>
          import('./components/Pages/Portal/Details/PortalDetails').then((m) => m.PortalDetails),
      },
      {
        path: 'data',
        title: 'CampusOne — Data & cancellation',
        loadComponent: () =>
          import('./components/Pages/Portal/Data/PortalData').then((m) => m.PortalData),
      },
    ],
  },
  {
    path: AREAS.terminal.path,
    canMatch: [areaAvailable(AREAS.terminal.path)],
    // The kiosk (prototype t.*): pairing and sign-in, then the reader or the point of sale.
    loadComponent: () =>
      import('./components/Pages/Terminal/TerminalChrome').then((m) => m.TerminalShell),
    children: [
      {
        path: '',
        title: `CampusOne — ${AREAS.terminal.title}`,
        loadComponent: () =>
          import('./components/Pages/Terminal/TerminalSignin').then((m) => m.TerminalSignin),
      },
      {
        path: 'reader',
        title: 'CampusOne — Reader',
        loadComponent: () =>
          import('./components/Pages/Terminal/TerminalReader').then((m) => m.TerminalReader),
      },
      {
        path: 'pos',
        title: 'CampusOne — Point of sale',
        loadComponent: () =>
          import('./components/Pages/Terminal/TerminalPos').then((m) => m.TerminalPos),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
