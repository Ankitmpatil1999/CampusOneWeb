/**
 * Display helpers of c.leave (prototype LV_TABS, ui.status tones, lvBody's timeline): the request's
 * status as the prototype names it, the tabs it falls under, the coordinator's line and the
 * progress timeline, with the register's labels for the coordinator's and the final status.
 */
import type { IconName } from '../../../Utils/icons';
import { formatDate, formatTime } from '../../../Utils/format';
import { translate } from '../../../Utils/translate';
import { person } from '../Applications/app-format';
import type { LeaveState, StaffLeave } from './leave.api';

export type LeaveTab = 'PENDING' | 'REVIEWED' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'all';

/** The prototype's tabs (LV_TABS). */
export const LEAVE_TABS: readonly { v: LeaveTab; l: string }[] = [
  { v: 'PENDING', l: 'Pending' },
  { v: 'REVIEWED', l: 'Coordinator reviewed' },
  { v: 'APPROVED', l: 'Approved' },
  { v: 'REJECTED', l: 'Rejected' },
  { v: 'CANCELLED', l: 'Cancelled' },
  { v: 'all', l: 'All' },
];

/** The tab a request belongs to: a coordinator's rejection is final (OI-ACA-51), so Rejected. */
export function tabOf(s: LeaveState): LeaveTab {
  switch (s) {
    case 'PENDING':
      return 'PENDING';
    case 'WITH_PRINCIPAL':
      return 'REVIEWED';
    case 'APPROVED':
      return 'APPROVED';
    case 'CANCELLED':
      return 'CANCELLED';
    default:
      return 'REJECTED';
  }
}

/** The status chip (prototype ui.status tones: Pending warn, Coordinator reviewed info …). */
export function stateChip(s: LeaveState): { l: string; tone: string } {
  switch (s) {
    case 'PENDING':
      return { l: 'Pending', tone: 'warn' };
    case 'WITH_PRINCIPAL':
      return { l: 'Coordinator reviewed', tone: 'info' };
    case 'APPROVED':
      return { l: translate('status.staffLeave.approved'), tone: 'ok' };
    case 'REJECTED':
      return { l: translate('status.staffLeave.rejected'), tone: 'bad' };
    case 'REJECTED_BY_COORDINATOR':
      return { l: translate('status.staffLeave.rejected'), tone: 'bad' };
    default:
      return { l: translate('status.staffLeave.cancelled'), tone: 'neutral' };
  }
}

/** The coordinator's decision as the register names it (Recommended, Rejected by the coordinator). */
export const coordinatorLabel = (s: 'APPROVED' | 'REJECTED') =>
  translate(
    s === 'APPROVED'
      ? 'status.staffLeaveCoordinator.approved'
      : 'status.staffLeaveCoordinator.rejected',
  );

/** fmt.dt: "29 Sep 2026, 11:00 AM" (IST). */
export const dt = (v: string | null | undefined) =>
  v ? `${formatDate(v)}, ${formatTime(v)}` : '—';

export interface TimelineItem {
  readonly title: string;
  readonly sub: string;
  readonly state: 'done' | 'now' | 'bad' | '';
  readonly icon: IconName;
}

const dot = (state: TimelineItem['state']): IconName =>
  state === 'done' ? 'check' : state === 'bad' ? 'x' : 'dot';

/** lvBody's progress: applied, the coordinator's review, the principal's decision. */
export function timeline(l: StaffLeave): TimelineItem[] {
  const out: TimelineItem[] = [
    { title: 'Applied', sub: dt(l.appliedAt), state: 'done', icon: 'check' },
  ];
  const c = l.coordinator;
  if (c) {
    const state = c.status === 'REJECTED' ? 'bad' : 'done';
    out.push({
      title:
        c.status === 'REJECTED'
          ? coordinatorLabel('REJECTED')
          : `Coordinator: ${coordinatorLabel('APPROVED')}`,
      sub: [c.by ? person(c.by) : '', c.at ? dt(c.at) : '', c.remarks ?? '']
        .filter(Boolean)
        .join(' · '),
      state,
      icon: dot(state),
    });
  } else {
    const state = l.state === 'PENDING' ? 'now' : '';
    out.push({
      title: 'Coordinator review',
      sub: l.state === 'CANCELLED' ? 'Not needed' : 'Waiting for you',
      state,
      icon: dot(state),
    });
  }
  const f = l.final;
  if (f && f.status !== 'CANCELLED') {
    const state = f.status === 'APPROVED' ? 'done' : 'bad';
    out.push({
      title: `Principal: ${translate(f.status === 'APPROVED' ? 'status.staffLeave.approved' : 'status.staffLeave.rejected')}`,
      sub: [f.by ? person(f.by) : '', f.at ? dt(f.at) : '', f.remarks ?? '']
        .filter(Boolean)
        .join(' · '),
      state,
      icon: dot(state),
    });
  } else if (f) {
    out.push({
      title: translate('status.staffLeave.cancelled'),
      sub: `Withdrawn by the teacher${f.at ? ' · ' + dt(f.at) : ''}`,
      state: '',
      icon: 'dot',
    });
  } else if (l.state === 'REJECTED_BY_COORDINATOR') {
    out.push({
      title: "Principal's decision",
      sub: 'Not needed — the request closed with the coordinator',
      state: '',
      icon: 'dot',
    });
  } else {
    const state = l.state === 'WITH_PRINCIPAL' ? 'now' : '';
    out.push({
      title: "Principal's decision",
      sub:
        l.state === 'WITH_PRINCIPAL'
          ? 'With the principal in the member app'
          : "After the coordinator's review",
      state,
      icon: dot(state),
    });
  }
  return out;
}

export const overlaps = (a: { from: string; to: string }, b: { from: string; to: string }) =>
  a.from <= b.to && a.to >= b.from;
