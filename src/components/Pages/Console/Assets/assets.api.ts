/** Console assets API (INS-020…026, MER-013) and the vendors' asset-group links. */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { newIdempotencyKey } from '../../../Utils/ids';

/** API money: rupees as a decimal string (never a float), always INR. */
export interface Money {
  readonly amount: string;
  readonly currency: 'INR';
}

/** The register's statuses of asset groups and assets (27.2: 1 / 0). */
export type AssetStatus = 'ACTIVE' | 'INACTIVE';
export type AssetType = 'PHYSICAL' | 'DIGITAL' | 'SERVICE' | 'OTHER';

/** INS-020: a group with how many assets and vendors it has. */
export interface AssetGroup {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: AssetStatus;
  readonly assets: number;
  /** Vendors linked to the group. */
  readonly vendors: number;
  readonly version: number;
}

/** INS-023: an approved asset. */
export interface Asset {
  readonly id: string;
  readonly group: { readonly id: string; readonly name: string };
  readonly name: string;
  readonly type: AssetType;
  readonly description: string | null;
  readonly status: AssetStatus;
  readonly version: number;
}

export interface AssetGroupInput {
  readonly name: string;
  readonly description?: string | null;
  readonly status?: AssetStatus;
}

export interface AssetInput {
  readonly groupId: string;
  readonly name: string;
  readonly type: AssetType;
  readonly description?: string | null;
  readonly status?: AssetStatus;
}

/** INS-026: what the vendor is linked to now, and the groups left as they were (inactive). */
export interface VendorLinks {
  readonly linked: readonly { id: string; name: string; status: AssetStatus }[];
  readonly skipped: readonly { groupId: string; reason: 'INACTIVE' | 'UNKNOWN' }[];
}

/** MER-013: a paid vendor invoice (once per vendor), with the asset it was paid against. */
export interface VendorInvoice {
  readonly reference: string;
  readonly merchant: { readonly id: string; readonly name: string };
  readonly invoiceNo: string;
  readonly asset: { readonly id: string; readonly name: string | null } | null;
  readonly amount: Money;
  readonly paidAt: string | null;
  readonly payer: string;
}

/** GOV-005: one entry of the institution's audit trail. */
interface AuditEvent {
  readonly action: string;
  readonly entity: { readonly type: string; readonly id: string | null };
  readonly at: string;
  readonly after: unknown;
}

const once = () => ({ 'Idempotency-Key': newIdempotencyKey() });
const ifMatch = (version: number) => ({ 'If-Match': `"v${version}"` });
/** The most audit pages (of 100) read to find the vendors' latest links. */
const AUDIT_PAGES = 10;

@Injectable({ providedIn: 'root' })
export class AssetsApi {
  private readonly http = inject(HttpClient);

  /** INS-020. */
  groups() {
    return firstValueFrom(this.http.get<{ items: AssetGroup[] }>('/api/v1/console/asset-groups'));
  }

  /** INS-021: name unique in the institution. */
  createGroup(body: AssetGroupInput) {
    return firstValueFrom(
      this.http.post<{ groupId: string }>('/api/v1/console/asset-groups', body, {
        headers: once(),
      }),
    );
  }

  /** INS-022: rename, describe, activate or deactivate (If-Match). */
  updateGroup(g: { id: string; version: number }, body: Partial<AssetGroupInput>) {
    return firstValueFrom(
      this.http.patch<AssetGroup>(`/api/v1/console/asset-groups/${g.id}`, body, {
        headers: ifMatch(g.version),
      }),
    );
  }

  /** INS-023: every asset of the institution, by group and name. */
  assets() {
    return firstValueFrom(this.http.get<{ items: Asset[] }>('/api/v1/console/assets'));
  }

  /** INS-024: name unique in the group. */
  createAsset(body: AssetInput) {
    return firstValueFrom(
      this.http.post<{ assetId: string }>('/api/v1/console/assets', body, { headers: once() }),
    );
  }

  /** INS-025: edit, activate or deactivate (If-Match); the group can't change. */
  updateAsset(a: { id: string; version: number }, body: Partial<Omit<AssetInput, 'groupId'>>) {
    return firstValueFrom(
      this.http.patch<Asset>(`/api/v1/console/assets/${a.id}`, body, {
        headers: ifMatch(a.version),
      }),
    );
  }

  /** INS-026: set a vendor's groups (an inactive group is neither linked nor de-linked). */
  setLinks(merchantId: string, groupIds: readonly string[]) {
    return firstValueFrom(
      this.http.put<VendorLinks>(`/api/v1/console/merchants/${merchantId}/asset-groups`, {
        groupIds,
      }),
    );
  }

  /** MER-013: paid vendor invoices (the latest 500). */
  invoices(q: { merchantId?: string } = {}) {
    let params = new HttpParams();
    if (q.merchantId) params = params.set('merchantId', q.merchantId);
    return firstValueFrom(
      this.http.get<{ items: VendorInvoice[] }>('/api/v1/console/vendor-invoices', { params }),
    );
  }

  /**
   * The vendors' current links, read from the audit trail (GOV-005): no console call lists a
   * vendor's groups, but every change through INS-026 is audited with the groups asked for and
   * those left alone. Returns merchant id → linked group ids, for vendors with such an entry.
   */
  async links(): Promise<Map<string, Set<string>>> {
    const out = new Map<string, Set<string>>();
    let cursor: string | undefined;
    for (let i = 0; i < AUDIT_PAGES; i++) {
      let params = new HttpParams().set('entity', 'merchant').set('limit', 100);
      if (cursor) params = params.set('cursor', cursor);
      const page = await firstValueFrom(
        this.http.get<{ items: AuditEvent[]; nextCursor: string | null }>(
          '/api/v1/console/audit-events',
          { params },
        ),
      );
      // Newest first: the first entry seen for a vendor is its latest.
      for (const e of page.items) {
        const id = e.entity.id;
        if (e.action !== 'VENDOR_ASSET_GROUPS_SET' || !id || out.has(id)) continue;
        out.set(id, linkedAfter(e.after));
      }
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    return out;
  }
}

/**
 * The groups linked after an INS-026 change: those asked for, less those skipped (unknown or
 * inactive, not linked), plus the inactive ones it was linked to and kept (skipped, not asked for).
 */
export function linkedAfter(after: unknown): Set<string> {
  const a = (after ?? {}) as { groups?: unknown; skipped?: unknown };
  const wanted = new Set(
    (Array.isArray(a.groups) ? a.groups : []).filter((x): x is string => typeof x === 'string'),
  );
  const skipped = (Array.isArray(a.skipped) ? a.skipped : [])
    .map((s) => (s as { groupId?: unknown }).groupId)
    .filter((x): x is string => typeof x === 'string');
  const out = new Set([...wanted].filter((g) => !skipped.includes(g)));
  for (const g of skipped) if (!wanted.has(g)) out.add(g);
  return out;
}
