/**
 * Display helpers of the console admission screens (prototype 1. APPLICATIONS: appName, ageOn,
 * tcText, APP_TABS, the STATUS tones; 13. ADMISSION FEES). Status labels come from the status
 * register; everything a family typed is shown as typed (names in title case).
 */
import type { IconName } from '../../../Utils/icons';
import { formatDate, formatDateTime, formatInr, titleCase } from '../../../Utils/format';
import { translate } from '../../../Utils/translate';
import { inr0, paiseOf } from '../Fees/fee-format';
import type {
  Address,
  AppSource,
  AppStatus,
  Application,
  Board,
  Category,
  DocType,
  FeeStatus,
  Gender,
  RejectReason,
  Relation,
} from './applications.api';

/** Application statuses (status register: admission_application) with the prototype's tones. */
export const APP_STATUS: Readonly<Record<AppStatus, { l: () => string; tone: string }>> = {
  DRAFT: { l: () => translate('status.admission_application.draft'), tone: 'neutral' },
  SUBMITTED: { l: () => translate('status.admission_application.submitted'), tone: 'info' },
  APPROVED: { l: () => translate('status.admission_application.approved'), tone: 'ok' },
  REJECTED: { l: () => translate('status.admission_application.rejected'), tone: 'bad' },
};

/** Fee statuses (status register: admission_payment). */
export const FEE_STATUS: Readonly<Record<FeeStatus, { l: () => string; tone: string }>> = {
  PENDING: { l: () => translate('status.admission_payment.pending'), tone: 'warn' },
  PAID: { l: () => translate('status.admission_payment.paid'), tone: 'ok' },
  FAILED: { l: () => translate('status.admission_payment.failed'), tone: 'bad' },
};

/** A fee's chip: a paid fee waits for Accounts to confirm its receipt (client 2026-10-09). */
export function feeChip(f: { status: FeeStatus; confirmedAt?: string | null }) {
  if (f.status !== 'PAID') return { l: FEE_STATUS[f.status].l(), tone: FEE_STATUS[f.status].tone };
  return f.confirmedAt ? { l: 'Confirmed', tone: 'ok' } : { l: 'Paid · to confirm', tone: 'warn' };
}

/** The prototype's tabs (APP_TABS): Drafts, Submitted, Approved, Rejected. */
export const APP_TABS: readonly { v: AppStatus; l: string }[] = [
  { v: 'DRAFT', l: 'Drafts' },
  { v: 'SUBMITTED', l: 'Submitted' },
  { v: 'APPROVED', l: 'Approved' },
  { v: 'REJECTED', l: 'Rejected' },
];

export const SOURCE: Readonly<Record<AppSource, string>> = {
  PUBLIC: 'Public form',
  COUNSELLOR: 'Counsellor',
  IMPORT: 'Upload',
};
export const RELATION: Readonly<Record<Relation, string>> = {
  FATHER: 'Father',
  MOTHER: 'Mother',
  GUARDIAN: 'Guardian',
};
export const GENDER: Readonly<Record<Gender, string>> = {
  FEMALE: 'Female',
  MALE: 'Male',
  OTHER: 'Other',
};
export const CATEGORY: Readonly<Record<Category, string>> = {
  GENERAL: 'General',
  OBC: 'OBC',
  SC: 'SC',
  ST: 'ST',
  OTHER: 'Other',
};
export const BOARD: Readonly<Record<Board, string>> = {
  CBSE: 'CBSE',
  ICSE: 'ICSE',
  STATE: 'State',
  IB: 'IB',
  OTHER: 'Other',
};
export const DOC_TYPE: Readonly<Record<DocType, string>> = {
  BIRTH: 'Birth certificate',
  ADDRESS: 'Address proof',
  PHOTO: 'Photograph',
  REPORT: 'Previous report card',
  TC: 'Transfer certificate',
  OTHER: 'Other document',
  // Each person's cards, front and back (client 2026-10-13).
  FATHER_AADHAAR_FRONT: 'Father’s Aadhaar card (front)',
  FATHER_AADHAAR_BACK: 'Father’s Aadhaar card (back)',
  FATHER_PAN_FRONT: 'Father’s PAN card (front)',
  FATHER_PAN_BACK: 'Father’s PAN card (back)',
  MOTHER_AADHAAR_FRONT: 'Mother’s Aadhaar card (front)',
  MOTHER_AADHAAR_BACK: 'Mother’s Aadhaar card (back)',
  MOTHER_PAN_FRONT: 'Mother’s PAN card (front)',
  MOTHER_PAN_BACK: 'Mother’s PAN card (back)',
  GUARDIAN_AADHAAR_FRONT: 'Guardian’s Aadhaar card (front)',
  GUARDIAN_AADHAAR_BACK: 'Guardian’s Aadhaar card (back)',
  GUARDIAN_PAN_FRONT: 'Guardian’s PAN card (front)',
  GUARDIAN_PAN_BACK: 'Guardian’s PAN card (back)',
  LOCAL_GUARDIAN_AADHAAR_FRONT: 'Local guardian’s Aadhaar card (front)',
  LOCAL_GUARDIAN_AADHAAR_BACK: 'Local guardian’s Aadhaar card (back)',
  LOCAL_GUARDIAN_PAN_FRONT: 'Local guardian’s PAN card (front)',
  LOCAL_GUARDIAN_PAN_BACK: 'Local guardian’s PAN card (back)',
  STUDENT_AADHAAR_FRONT: 'Student’s Aadhaar card (front)',
  STUDENT_AADHAAR_BACK: 'Student’s Aadhaar card (back)',
  STUDENT_PAN_FRONT: 'Student’s PAN card (front)',
  STUDENT_PAN_BACK: 'Student’s PAN card (back)',
};
/** ADM-019 reason codes as the decision dialog names them. */
export const REJECT_REASON: Readonly<Record<RejectReason, string>> = {
  AGE_BAND: 'Age outside the band for the class',
  SEATS_FULL: 'No seats left in the class',
  DOCUMENTS: 'Documents missing or not valid',
  INTERACTION: 'Not selected after the interaction',
  DUPLICATE: 'Duplicate application',
  WITHDRAWN: 'Withdrawn by the family',
  OTHER: 'Another reason',
};
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN'] as const;
export const MEDIUMS = ['English', 'Kannada'] as const;

/** The last result is chosen, not typed (client 2026-10-13). */
export const RESULTS = ['Pass', 'Fail'] as const;

/**
 * References allowed on an application: the limits register's default (adm.references.max, 3);
 * the server refuses more with ADM.REFERENCE_LIMIT and its own figure.
 */
export const REF_MAX = 3;
/** Uploads: 2 MB (CR-07), PDF, JPG or PNG (the landing's document rules). */
export const DOC_MAX_BYTES = 2 * 1024 * 1024;
export const DOC_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

/** "Kiran Bhat" from the stored capitals. */
export function appName(a: {
  student: { firstName: string | null; middleName?: string | null; lastName: string | null };
}): string {
  const n = [a.student.firstName, a.student.middleName, a.student.lastName]
    .filter(Boolean)
    .join(' ');
  return n ? titleCase(n) : 'Name not entered yet';
}

/** The person a row lists for an applicant: "Mohan Bhat · +91 98450 01122". */
export const person = (n: string | null | undefined) => (n ? titleCase(n) : '');

/** RP.fmtSize: "381 KB", "1.2 MB". */
export function fileSize(b: number): string {
  return b >= 1_048_576
    ? `${(b / 1_048_576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(b / 1024))} KB`;
}

/** A parent's occupation and annual income (client 2026-10-14), or '' when neither is given. */
export function workText(
  p: { occupation?: string | null; annualIncome?: number | null } | null | undefined,
): string {
  const income = p?.annualIncome != null ? `${inr0(p.annualIncome * 100)} a year` : '';
  return [p?.occupation, income].filter(Boolean).join(' · ');
}

/** A person's Aadhaar and PAN, masked (client 2026-10-13): "XXXX XXXX 9012 · ••••••234F". */
export const idsText = (x: { aadhaar: string | null; pan: string | null } | null | undefined) =>
  `${x?.aadhaar || '—'} · ${x?.pan || '—'}`;

/** "Flat 3B, Sahyadri Residency, Shivamogga, Karnataka 577201". */
export function addressText(a: Address | null | undefined): string {
  if (!a) return '';
  return [a.line1, a.line2, a.city, `${a.state} ${a.pin}`].filter(Boolean).join(', ');
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** A calendar date the prototype's long way (fmt.dlong): "Monday, 19 October 2026". */
export function longDay(d: string): string {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  const wd = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
  return `${DAYS[wd]}, ${day} ${MONTHS[m - 1]} ${y}`;
}

/** A calendar date the short way (fmt.dshort): "19 Oct". */
export function shortDay(d: string): string {
  return formatDate(d).slice(0, 6).replace(/^0/, '');
}

/** The transfer certificate's state (prototype tcText). */
export function tcState(
  tc: Application['tc'],
  today: string,
): {
  text: string;
  tone: 'bad' | 'warn' | '';
  overdue: boolean;
} {
  if (!tc) return { text: 'Not received', tone: 'bad', overdue: false };
  if (tc.mode === 'TC') {
    const parts = ['Received', tc.number, tc.date ? formatDate(tc.date) : null].filter(Boolean);
    return { text: parts.join(' · '), tone: '', overdue: false };
  }
  const overdue = !!tc.dueDate && tc.dueDate < today;
  return {
    text: `Undertaking · due ${tc.dueDate ? formatDate(tc.dueDate) : '—'}`,
    tone: overdue ? 'warn' : '',
    overdue,
  };
}

/** The application fee (or the admission fee) of an application. */
export const feeOf = (a: Application, t: 'APPLICATION' | 'ADMISSION') =>
  a.fees.find((f) => f.feeType === t) ?? null;

/** "₹500.00". */
export const inrOf = (m: { amount: string }) => formatInr(paiseOf(m));

export interface HistoryItem {
  readonly at: string | null;
  readonly title: string;
  readonly sub: string;
  readonly state: 'done' | 'bad' | 'now';
  readonly icon: IconName;
}

/**
 * The application's history (prototype hist): what the record holds with its time — started,
 * documents added, the declaration, fees paid, submitted and the decision — then what is awaited.
 */
export function historyOf(a: Application): HistoryItem[] {
  const out: HistoryItem[] = [];
  const at = (t: string | null) => (t ? formatDateTime(t) : '');
  if (a.createdAt) {
    out.push({
      at: a.createdAt,
      title:
        a.source === 'PUBLIC'
          ? 'Started on the public form'
          : a.source === 'IMPORT'
            ? 'Imported from the existing-students sheet'
            : 'Created at the counsellor’s desk',
      sub: at(a.createdAt),
      state: 'done',
      icon: 'check',
    });
  }
  for (const d of a.documents) {
    if (!d.addedAt) continue;
    out.push({
      at: d.addedAt,
      title: `Document added · ${DOC_TYPE[d.type]}`,
      sub: `${at(d.addedAt)} · ${d.name}`,
      state: 'done',
      icon: 'check',
    });
  }
  if (a.declaration?.at) {
    out.push({
      at: a.declaration.at,
      title: `Declaration accepted${a.declaration.by ? ` by ${person(a.declaration.by)}` : ''}`,
      sub: at(a.declaration.at),
      state: 'done',
      icon: 'check',
    });
  }
  for (const f of a.fees) {
    if (f.status !== 'PAID' || !f.paidAt) continue;
    out.push({
      at: f.paidAt,
      title: `${f.feeType === 'APPLICATION' ? 'Application' : 'Admission'} fee ${inrOf(f.amount)} paid ${f.mode === 'CASH' ? 'in cash' : 'online'}`,
      sub: `${at(f.paidAt)}${f.receiptNo ? ` · ${f.receiptNo}` : ''}`,
      state: 'done',
      icon: 'check',
    });
  }
  if (a.submittedAt) {
    out.push({
      at: a.submittedAt,
      title: 'Submitted for review',
      sub: at(a.submittedAt),
      state: 'done',
      icon: 'check',
    });
  }
  if (a.decidedAt && a.status === 'APPROVED') {
    out.push({
      at: a.decidedAt,
      title: `Approved · admission number ${a.admissionNo ?? '—'}${a.class ? ` · ${a.class.name}${a.section ? ` ${a.section.name}` : ''}` : ''}`,
      sub: at(a.decidedAt),
      state: 'done',
      icon: 'check',
    });
  }
  if (a.decidedAt && a.status === 'REJECTED') {
    out.push({
      at: a.decidedAt,
      title: `Rejected · ${a.rejection ? REJECT_REASON[a.rejection.reasonCode] : 'no reason recorded'}`,
      sub: `${at(a.decidedAt)}${a.rejection?.remarks ? ` · “${a.rejection.remarks}”` : ''}`,
      state: 'bad',
      icon: 'x',
    });
  }
  out.sort((x, y) => (x.at ?? '').localeCompare(y.at ?? ''));
  if (a.status === 'SUBMITTED') {
    // Accounts confirm the fee receipts first; then the Co-ordinator decides (client 2026-10-14:
    // the decision is the Co-ordinator's, not the Counsellor's).
    if (a.paymentStatus === 'PAID') {
      out.push({
        at: null,
        title: 'Accounts confirmation',
        sub: 'Accounts confirm the fee receipts',
        state: 'now',
        icon: 'dot',
      });
    }
    out.push({
      at: null,
      title: 'Co-ordinator decision',
      sub:
        a.paymentStatus === 'PAID'
          ? 'Next: approve to enrol, or reject with a reason'
          : 'Approve to enrol, or reject with a reason',
      state: 'now',
      icon: 'dot',
    });
  } else if (a.status === 'DRAFT') {
    const fee = feeOf(a, 'APPLICATION');
    out.push({
      at: null,
      title: 'Waiting for submission',
      sub: a.declaration
        ? fee && fee.status !== 'PAID'
          ? 'Declared — the application fee isn’t paid yet'
          : 'Declared — ready to submit'
        : 'The declaration isn’t accepted yet',
      state: 'now',
      icon: 'dot',
    });
  }
  return out;
}

/** The department a class usually belongs to (prototype defDept): suggested, never forced. */
export function suggestedDepartment(order: number): string {
  return order <= 7
    ? 'Primary'
    : order <= 10
      ? 'Middle school'
      : order <= 12
        ? 'Secondary'
        : 'Senior secondary';
}

/** "YYYY-MM-DD" plus n days. */
export function plusDays(d: string, n: number): string {
  return new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Field errors of a form as a map; an unknown field's message goes to `general`. */
export function fieldErrors(
  errors: readonly { field: string; message: string }[],
  map: Readonly<Record<string, string>>,
): { fields: Record<string, string>; general: string[] } {
  const fields: Record<string, string> = {};
  const general: string[] = [];
  for (const e of errors) {
    const k = map[e.field] ?? Object.entries(map).find(([p]) => e.field.startsWith(`${p}.`))?.[1];
    if (k) fields[k] ??= e.message;
    else general.push(e.message);
  }
  return { fields, general };
}
