/** Labels and checks of the partner API clients screen (o.partners). */
import type { ClientStatus, PartnerKind, TokenRecord } from './partners.api';

export const PARTNERS: readonly { readonly v: PartnerKind; readonly l: string }[] = [
  { v: 'SPONSOR_BANK', l: 'Sponsor bank' },
  { v: 'PAYMENT_GATEWAY', l: 'Payment gateway' },
  { v: 'OTHER', l: 'Other partner' },
];

export const partnerLabel = (v: string) => PARTNERS.find((p) => p.v === v)?.l ?? v;

/**
 * The scopes a client can hold, grouped as the prototype groups them (its scope register). Only the
 * sponsor bank's virtual-account calls exist so far (PARTNER_SCOPES).
 */
export const SCOPES: readonly { readonly id: string; readonly l: string; readonly g: string }[] = [
  { id: 'va.validate', l: 'Validate a virtual-account credit', g: 'Bank' },
  { id: 'va.notify', l: 'Notify a virtual-account credit', g: 'Bank' },
];

export const scopeLabel = (id: string) => SCOPES.find((s) => s.id === id)?.l ?? id;

export const SCOPE_GROUPS = [...new Set(SCOPES.map((s) => s.g))].map((g) => ({
  g,
  list: SCOPES.filter((s) => s.g === g),
}));

export const STATUS: Record<ClientStatus, { readonly l: string; readonly tone: string }> = {
  ACTIVE: { l: 'Active', tone: 'ok' },
  INACTIVE: { l: 'Suspended', tone: 'bad' },
};

/** Why a token request was refused (the OAuth error the token endpoint logged). */
const REFUSALS: Record<string, string> = {
  // Only a known client id is logged, so this is a wrong secret or a suspended client.
  invalid_client: 'Wrong secret or client suspended',
  IP_NOT_ALLOWED: 'IP address not on the allowlist',
  invalid_scope: 'A scope the client does not hold',
  invalid_grant_type: 'Not a client-credentials request',
};

export const refusalLabel = (reason: string | null) =>
  reason ? (REFUSALS[reason] ?? reason) : 'Refused';

/** A token's state at a glance: live, ended early (rotation, suspension, a newer token) or expired. */
export function tokenState(t: TokenRecord): 'live' | 'revoked' | 'expired' | null {
  if (t.outcome !== 'ISSUED' || !t.expiresAt) return null;
  if (t.live) return 'live';
  return t.revokedAt ? 'revoked' : 'expired';
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

const isIpv6 = (s: string) => {
  if (!s.includes(':') || !/^[0-9a-fA-F:.]+$/.test(s)) return false;
  try {
    return new URL(`http://[${s}]/`).hostname.length > 2;
  } catch {
    return false;
  }
};

/** What the server accepts on an allowlist: an address (IPv4 or IPv6) or an IPv4 CIDR block. */
export function validAllowEntry(e: string): boolean {
  const [addr = '', bits, extra] = e.split('/');
  if (extra !== undefined) return false;
  if (bits === undefined) return IPV4.test(addr) || isIpv6(addr);
  return IPV4.test(addr) && /^\d{1,2}$/.test(bits) && Number(bits) <= 32;
}

/** The textarea's lines: trimmed, blank lines dropped. */
export const allowLines = (text: string) =>
  text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

export const plural = (n: number, word: string) =>
  `${n.toLocaleString('en-IN')} ${word}${n === 1 ? '' : 's'}`;
