/** Display helpers of the NFC cards screen (prototype 32_c_people: cardFace, cardEligible). */
import { titleCase } from '../../../Utils/format';
import { translate } from '../../../Utils/translate';
import type { MemberRow } from '../Members/members.api';
import type { Card, CardStatus, ReissueReason } from './cards.api';

/** The re-issue reasons the API takes (ATT-007), in the order the form offers them. */
export const REISSUE_REASONS: readonly { readonly v: ReissueReason; readonly l: string }[] = [
  { v: 'LOST', l: 'Lost' },
  { v: 'DAMAGED', l: 'Damaged' },
  { v: 'STOLEN', l: 'Stolen' },
  { v: 'DEFECTIVE', l: 'Defective' },
  { v: 'EXPIRED', l: 'Expired' },
];

/** The register's labels (status.card.*) and the prototype's tones. */
export const CARD_STATUS: Readonly<Record<CardStatus, { l: () => string; tone: string }>> = {
  ACTIVE: { l: () => translate('status.card.active'), tone: 'ok' },
  INACTIVE: { l: () => translate('status.card.inactive'), tone: 'bad' },
};

export const MEMBER_STATUS: Readonly<Record<string, { l: string; tone: string }>> = {
  ACTIVE: { l: 'Active', tone: 'ok' },
  INACTIVE: { l: 'Inactive', tone: 'neutral' },
  SUSPENDED: { l: 'Suspended', tone: 'bad' },
};

/** "New card" or "Re-issue · Lost": why the card was written. */
export function issueReasonText(code: string): string {
  if (code === 'NEW_REGISTRATION') return 'New card';
  const r = REISSUE_REASONS.find((x) => x.v === code);
  return `Re-issue · ${r ? r.l : code}`;
}

/** The token the prototype's way (fmt.mask): "••••0055". */
export function maskToken(token: string): string {
  return `••••${token.slice(-4)}`;
}

/** A member with the cards written for them: the current one first (the active, else the newest). */
export interface Holder {
  readonly memberId: string;
  readonly name: string;
  readonly current: Card;
  readonly previous: readonly Card[];
}

export function holdersOf(cards: readonly Card[]): Holder[] {
  const by = new Map<string, Card[]>();
  for (const c of cards) {
    const list = by.get(c.member.id) ?? [];
    list.push(c);
    by.set(c.member.id, list);
  }
  return [...by.values()].map((list) => {
    const sorted = [...list].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
    const current = sorted.find((c) => c.status === 'ACTIVE') ?? sorted[0]!;
    return {
      memberId: current.member.id,
      name: titleCase(current.member.name),
      current,
      previous: sorted.filter((c) => c !== current),
    };
  });
}

/** Who gets a card (prototype cardEligible): active students, teachers and staff. */
export function eligible(m: MemberRow): boolean {
  return m.status === 'ACTIVE' && (m.kind === 'STUDENTS' || m.kind === 'STAFF');
}

/** "Grade 6 A" for a student, "Teacher · Middle school" for staff (prototype detailOf). */
export function detailOf(m: MemberRow | undefined): string {
  if (!m) return '—';
  if (m.kind === 'STUDENTS') {
    return m.grade
      ? `${m.grade.class}${m.grade.section ? ' ' + m.grade.section : ''}`
      : 'Not enrolled';
  }
  return [m.userType.name, m.department?.name].filter(Boolean).join(' · ');
}

/** The card face's line: "6 A" for a student (RP.q.clsShort), the user type for staff. */
export function faceLine(m: MemberRow | undefined): string {
  if (!m) return '';
  if (m.kind === 'STUDENTS' && m.grade) {
    return `${m.grade.class.replace(/^(Grade|Class)\s+/i, '')}${m.grade.section ? ' ' + m.grade.section : ''}`;
  }
  return m.userType.name;
}

/** "1 card", "13 cards" (fmt.plural). */
export function plural(n: number, noun: string): string {
  return `${n.toLocaleString('en-IN')} ${noun}${n === 1 ? '' : 's'}`;
}

/** The first name, for titles ("Block Aarav's card?"). */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
