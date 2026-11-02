/** Display helpers of the assets screen (prototype 33_c_settings: c.assets). */
import { amountPaise } from '../../../Shared/Amount';
import { translate } from '../../../Utils/translate';
import type { AssetStatus, AssetType, VendorInvoice } from './assets.api';

/** The asset types the API takes (INS-024), as the form offers them. */
export const ASSET_TYPES: readonly { readonly v: AssetType; readonly l: string }[] = [
  { v: 'PHYSICAL', l: 'Physical item' },
  { v: 'DIGITAL', l: 'Digital' },
  { v: 'SERVICE', l: 'Service' },
  { v: 'OTHER', l: 'Other' },
];

export const typeLabel = (t: AssetType) => ASSET_TYPES.find((x) => x.v === t)?.l ?? t;

/** The register's labels (status.asset.* and status.asset_group.* read the same). */
export const ASSET_STATUS: Readonly<Record<AssetStatus, { l: () => string; tone: string }>> = {
  ACTIVE: { l: () => translate('status.asset.active'), tone: 'ok' },
  INACTIVE: { l: () => translate('status.asset.inactive'), tone: 'neutral' },
};

/** Payments against each asset (MER-013): how many and the total, in integer paise. */
export function paymentsByAsset(
  invoices: readonly VendorInvoice[],
): Map<string, { n: number; paise: number }> {
  const out = new Map<string, { n: number; paise: number }>();
  for (const i of invoices) {
    if (!i.asset) continue;
    const id = i.asset.id.toLowerCase();
    const cur = out.get(id) ?? { n: 0, paise: 0 };
    out.set(id, { n: cur.n + 1, paise: cur.paise + amountPaise(i.amount) });
  }
  return out;
}

/** Invoices tagged to an asset, by vendor (the merchants table's "Payments tagged"). */
export function taggedByVendor(invoices: readonly VendorInvoice[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const i of invoices) {
    if (!i.asset) continue;
    out.set(i.merchant.id, (out.get(i.merchant.id) ?? 0) + 1);
  }
  return out;
}

/** "1 asset", "9 assets" (fmt.plural). */
export function plural(n: number, noun: string): string {
  return `${n.toLocaleString('en-IN')} ${noun}${n === 1 ? '' : 's'}`;
}
