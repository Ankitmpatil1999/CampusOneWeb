/**
 * Labels of the announcements (prototype CHANNELS, GROUPS and catChip): the dispatch status as the
 * register names it (status.announcement.*), the channels with their icons and the audience groups.
 */
import type { IconName } from '../../../Utils/icons';
import { translate } from '../../../Utils/translate';
import type { Announcement, Channel, DispatchStatus, Group } from './announcements.api';

export const DISPATCH: Readonly<Record<DispatchStatus, { l: () => string; tone: string }>> = {
  QUEUED: { l: () => translate('status.announcement.queued'), tone: 'neutral' },
  PROCESSING: { l: () => translate('status.announcement.processing'), tone: 'info' },
  COMPLETED: { l: () => translate('status.announcement.completed'), tone: 'ok' },
  FAILED: { l: () => translate('status.announcement.failed'), tone: 'bad' },
};

/** The channels in the prototype's order, with its icons. */
export const CHANNELS: readonly { v: Channel; l: string; icon: IconName }[] = [
  { v: 'IN_APP', l: 'In-app', icon: 'bell' },
  { v: 'EMAIL', l: 'E-mail', icon: 'mail' },
  { v: 'SMS', l: 'SMS', icon: 'mobile' },
  { v: 'WHATSAPP', l: 'WhatsApp', icon: 'chats' },
];
export const channelOf = (c: string) =>
  CHANNELS.find((x) => x.v === c) ?? { v: c as Channel, l: c, icon: 'bell' as IconName };

export const GROUPS: readonly { v: Group; l: string }[] = [
  { v: 'ALL', l: 'All' },
  { v: 'STUDENTS', l: 'Students' },
  { v: 'PARENTS', l: 'Parents' },
  { v: 'TEACHERS', l: 'Teachers' },
  { v: 'STAFF', l: 'Staff' },
];
const groupLabel = (g: string) => GROUPS.find((x) => x.v === g)?.l ?? g;

/** "Students, Parents" — or the class section of a teacher's class announcement. */
export function audience(a: Pick<Announcement, 'targets' | 'classSection'>): string {
  const g = a.targets.groups.map(groupLabel).join(', ');
  return a.classSection ? `${a.classSection}${g ? ` · ${g}` : ''}` : g || 'Selected classes';
}

/** The register status of the dispatch (status.announcement.*). */
export function stateOf(a: Pick<Announcement, 'dispatch'>): { l: string; tone: string } {
  const d = DISPATCH[a.dispatch.status];
  return d ? { l: d.l(), tone: d.tone } : { l: a.dispatch.status, tone: 'neutral' };
}

/** The limits of the form (limits register com.title / com.body; COM.TITLE, COM.BODY). */
export const TITLE = { min: 3, max: 120 } as const;
export const BODY = { min: 10, max: 5000 } as const;
export const REASON = { min: 5, max: 300 } as const;
