import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Avatar } from '../../../Shared/Avatar';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { Pager } from '../../../Shared/Pager';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { MerchantsApi, type Merchant } from '../Merchants/merchants.api';
import { inrWhole } from '../Merchants/merchant-format';
import { AssetForm } from './AssetForm';
import { AssetGroupForm } from './AssetGroupForm';
import { VendorLinksDrawer } from './VendorLinksDrawer';
import { ASSET_STATUS, paymentsByAsset, plural, taggedByVendor, typeLabel } from './asset-format';
import {
  AssetsApi,
  type Asset,
  type AssetGroup,
  type AssetStatus,
  type VendorInvoice,
  type VendorLinks,
} from './assets.api';

type SortKey = 'name' | 'type' | 'pays' | 'status';
type MerSortKey = 'name' | 'sub' | 'tagged';
const PAGE = 8;
const COLUMNS: readonly { k: SortKey; l: string; r: boolean }[] = [
  { k: 'name', l: 'Asset', r: false },
  { k: 'type', l: 'Type', r: false },
  { k: 'pays', l: 'Vendor payments', r: true },
  { k: 'status', l: 'Status', r: false },
];

/**
 * c.assets — Assets (SRS 7.7, FR-INS-07, 9.11 check 7; INS-020…026, MER-013; prototype c.assets):
 * the asset groups (select one to filter), the approved assets with the vendor payments made
 * against them, the group and asset drawers, and the merchants with the asset groups each vendor
 * supplies (the links drawer). Assets and groups are never deleted — they're made inactive.
 */
@Component({
  selector: 'rp-console-assets',
  imports: [AssetForm, AssetGroupForm, Avatar, Empty, Icon, PageHead, Pager, VendorLinksDrawer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Assets"
        sub="Asset groups and the approved assets that vendor payments are tagged to. Link each vendor to the groups it supplies."
      >
        @if (canView()) {
          @if (why()) {
            <span class="cp-why" [attr.title]="why()"
              ><button type="button" class="btn btn-sec" disabled>
                <rp-icon name="plus" [size]="17" /><span>New asset group</span>
              </button></span
            >
            <span class="cp-why" [attr.title]="why()"
              ><button type="button" class="btn btn-pri" disabled>
                <rp-icon name="plus" [size]="17" /><span>Add asset</span>
              </button></span
            >
          } @else {
            <button type="button" class="btn btn-sec" id="ag-new" (click)="groupForm.set('new')">
              <rp-icon name="plus" [size]="17" /><span>New asset group</span>
            </button>
            <button type="button" class="btn btn-pri" id="as-new" (click)="assetForm.set('new')">
              <rp-icon name="plus" [size]="17" /><span>Add asset</span>
            </button>
          }
        }
      </rp-page-head>

      @if (!canView()) {
        <rp-empty
          icon="lock"
          title="This page isn't part of your role"
          text="Assets are managed by the institution administrator. Pages your role can open are listed in the menu."
        />
      } @else if (error()) {
        <div class="card pad">
          <rp-empty icon="alertc" title="Couldn't load the assets" [text]="error()">
            <button type="button" class="btn btn-sec btn-sm" (click)="load()">
              <span>Try again</span>
            </button>
          </rp-empty>
        </div>
      } @else {
        @if (readOnly()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow"><b>Read-only.</b> {{ readOnly() }}</div>
          </div>
        }
        <div class="c-grid s12">
          <div class="card" style="align-self: start">
            <div class="card-h">
              <span class="cp-hic"><rp-icon name="layers" [size]="16" /></span>
              <span class="t-h4">Asset groups</span>
              <span class="t-xs t-muted">{{ groups().length }}</span>
            </div>
            <div class="list plain cp-glist" id="ag-list">
              <div class="cp-grp" [class.on]="!grp()">
                <button
                  type="button"
                  class="li"
                  [attr.aria-pressed]="!grp()"
                  (click)="pickGroup('')"
                >
                  <span class="li-ic sm"><rp-icon name="grid" [size]="16" /></span>
                  <span class="li-main"
                    ><span class="li-t">All groups</span
                    ><span class="li-s">{{ plural(assets().length, 'asset') }}</span></span
                  >
                </button>
              </div>
              @for (g of groups(); track g.id) {
                <div class="cp-grp" [class.on]="grp() === g.id">
                  <button
                    type="button"
                    class="li"
                    [attr.aria-pressed]="grp() === g.id"
                    (click)="pickGroup(grp() === g.id ? '' : g.id)"
                  >
                    <span class="li-ic sm"><rp-icon name="box" [size]="16" /></span>
                    <span class="li-main"
                      ><span class="li-t">{{ g.name }}</span
                      ><span class="li-s"
                        >{{ plural(g.assets, 'asset') }} · {{ plural(g.vendors, 'merchant') }}</span
                      ></span
                    >
                    @if (g.status !== 'ACTIVE') {
                      <span class="li-r"
                        ><span class="chip tone-neutral dot">{{ inactiveLabel }}</span></span
                      >
                    }
                  </button>
                  @if (!why()) {
                    <button
                      type="button"
                      class="iconbtn cp-gedit"
                      [attr.aria-label]="'Edit ' + g.name"
                      (click)="groupForm.set(g)"
                    >
                      <rp-icon name="edit" [size]="15" />
                    </button>
                  }
                </div>
              }
              @if (!loading() && !groups().length) {
                <p class="t-sm t-muted" style="padding: 10px 8px 4px">
                  No groups yet. Create one, such as lab equipment or library books.
                </p>
              }
            </div>
          </div>

          <div class="stack g12">
            <div class="c-filters">
              <label class="search"
                ><rp-icon name="search" [size]="16" /><input
                  type="search"
                  id="as-q"
                  placeholder="Search asset name"
                  aria-label="Search assets"
                  autocomplete="off"
                  [value]="q()"
                  (input)="q.set(val($event)); page.set(1)"
              /></label>
              <div class="pills" role="group" aria-label="Status">
                @for (p of statusPills; track p.v) {
                  <button
                    type="button"
                    class="pill"
                    [class.on]="ast() === p.v"
                    [attr.aria-pressed]="ast() === p.v"
                    (click)="ast.set(p.v); page.set(1)"
                  >
                    {{ p.l }}
                  </button>
                }
              </div>
              <span class="fsum">{{ groupName() }}</span>
            </div>
            <div class="tbl-wrap">
              <table class="tbl" id="as-table">
                <thead>
                  <tr>
                    @for (c of columns; track c.k) {
                      <th
                        class="sort"
                        [class.r]="c.r"
                        [class.asc]="sort()?.k === c.k && sort()?.dir === 'asc'"
                        [class.desc]="sort()?.k === c.k && sort()?.dir === 'desc'"
                        [attr.aria-sort]="ariaSort(c.k)"
                        (click)="sortBy(c.k)"
                      >
                        <button
                          type="button"
                          class="cp-th"
                          (click)="$event.stopPropagation(); sortBy(c.k)"
                        >
                          {{ c.l
                          }}<span class="sa" aria-hidden="true">{{
                            sort()?.k === c.k && sort()?.dir === 'desc' ? '↓' : '↑'
                          }}</span>
                        </button>
                      </th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @if (loading() && !assets().length) {
                    <tr>
                      <td [attr.colspan]="columns.length">
                        <rp-empty icon="hourglass" title="Loading…" />
                      </td>
                    </tr>
                  }
                  @for (a of shown(); track a.id) {
                    <tr
                      tabindex="0"
                      [class.cp-dim]="a.status !== 'ACTIVE'"
                      (click)="assetForm.set(a)"
                      (keydown.enter)="assetForm.set(a)"
                    >
                      <td>
                        <div class="cell-t" style="white-space: normal">{{ a.name }}</div>
                        <div class="cell-s">{{ assetSub(a) }}</div>
                      </td>
                      <td>{{ typeLabel(a.type) }}</td>
                      <td class="r">
                        @if (paysOf(a); as p) {
                          {{ p.n }} · {{ whole(p.paise) }}
                        } @else {
                          <span class="t-faint">None</span>
                        }
                      </td>
                      <td>
                        <span [class]="'chip dot tone-' + status(a.status).tone">{{
                          status(a.status).l()
                        }}</span>
                      </td>
                    </tr>
                  } @empty {
                    @if (!loading()) {
                      <tr>
                        <td [attr.colspan]="columns.length">
                          <rp-empty
                            icon="box"
                            [title]="assets().length ? 'No assets match' : 'No assets here'"
                            [text]="
                              assets().length && (q() || ast())
                                ? 'Try a different search or status.'
                                : 'Add an asset to this group so vendors can be paid against it.'
                            "
                          >
                            @if (!why() && groups().length) {
                              <button
                                type="button"
                                class="btn btn-sec"
                                (click)="assetForm.set('new')"
                              >
                                <rp-icon name="plus" [size]="17" /><span>Add asset</span>
                              </button>
                            }
                          </rp-empty>
                        </td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>
            @if (rows().length > pageSize) {
              <rp-pager
                [total]="rows().length"
                [page]="page()"
                [size]="pageSize"
                (go)="page.set($event)"
              />
            } @else if (rows().length) {
              <div class="pager">
                <span>{{ plural(rows().length, 'asset') }}</span>
              </div>
            }
          </div>
        </div>

        @if (canMerchants()) {
          <section class="stack g8">
            <div class="sec-h"><h3>Merchants and the asset groups they supply</h3></div>
            <div class="tbl-wrap">
              <table class="tbl" id="al-table">
                <thead>
                  <tr>
                    @for (c of merColumns; track c.k) {
                      <th
                        [class.sort]="c.sort"
                        [class.r]="c.r"
                        [class.asc]="c.sort && merSort()?.k === c.k && merSort()?.dir === 'asc'"
                        [class.desc]="c.sort && merSort()?.k === c.k && merSort()?.dir === 'desc'"
                        [attr.aria-sort]="merAria(c)"
                        (click)="c.sort && merSortBy(c.k)"
                      >
                        @if (c.sort) {
                          <button
                            type="button"
                            class="cp-th"
                            (click)="$event.stopPropagation(); merSortBy(c.k)"
                          >
                            {{ c.l
                            }}<span class="sa" aria-hidden="true">{{
                              merSort()?.k === c.k && merSort()?.dir === 'desc' ? '↓' : '↑'
                            }}</span>
                          </button>
                        } @else {
                          {{ c.l }}
                        }
                      </th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (m of merchantRows(); track m.id) {
                    <tr
                      [attr.tabindex]="m.subType === 'VENDOR' ? 0 : null"
                      (click)="m.subType === 'VENDOR' && links.set(m)"
                      (keydown.enter)="m.subType === 'VENDOR' && links.set(m)"
                    >
                      <td>
                        <div class="cell-main">
                          <rp-av [name]="m.displayName" size="sm" />
                          <div style="min-width: 0">
                            <div class="cell-t">{{ m.displayName }}</div>
                            <div class="cell-s">{{ m.department ?? '—' }}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        @if (m.subType === 'VENDOR') {
                          <span class="chip tone-accent">Vendor</span>
                        } @else {
                          <span class="tag">Regular</span>
                        }
                      </td>
                      <td>
                        @if (m.subType !== 'VENDOR') {
                          <span class="t-faint">None</span>
                        } @else if (linkNames(m); as names) {
                          @for (n of names; track n; let last = $last) {
                            <span class="tag">{{ n }}</span
                            >{{ last ? '' : ' ' }}
                          }
                        } @else if (linksOf(m) === null) {
                          <span class="t-faint" title="The current links couldn't be read"
                            >Not known</span
                          >
                        } @else {
                          <span class="chip tone-warn dot">No groups — can't be paid</span>
                        }
                      </td>
                      <td class="r">{{ tagged(m) }}</td>
                      <td>
                        @if (m.subType === 'VENDOR' && !linkWhy()) {
                          <div class="row-acts">
                            <button
                              type="button"
                              class="btn btn-ghost btn-xs"
                              [attr.aria-label]="'Edit links of ' + m.displayName"
                              (click)="$event.stopPropagation(); links.set(m)"
                              (keydown.enter)="$event.stopPropagation()"
                            >
                              <rp-icon name="link" [size]="15" /><span>Edit links</span>
                            </button>
                          </div>
                        }
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td [attr.colspan]="merColumns.length">
                        <rp-empty
                          icon="store"
                          title="No merchants yet"
                          text="Register vendors under Merchants & QR, then link each to the groups it supplies."
                        />
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (merchantRows().length) {
              <div class="pager">
                <span>{{ plural(merchantRows().length, 'merchant') }}</span>
              </div>
            }
            <p class="t-xs t-muted">
              <rp-icon name="info" [size]="12" /> Every payment to a vendor must name an active,
              approved asset from a group linked to that vendor, plus an invoice number (9.11 check
              7). Assets and groups are never deleted — they're made inactive so past payments keep
              their reference.
            </p>
          </section>
        }
      }
    </div>

    @if (groupForm(); as g) {
      <rp-asset-group-form
        [group]="g === 'new' ? null : g"
        [groups]="groups()"
        [activeAssets]="g === 'new' ? 0 : activeIn(g.id)"
        (closed)="groupForm.set(null)"
        (saved)="groupSaved($event)"
      />
    }
    @if (assetForm(); as a) {
      <rp-asset-form
        [asset]="a === 'new' ? null : a"
        [groups]="groups()"
        [assets]="assets()"
        [groupId]="grp()"
        [payments]="a === 'new' ? [] : invoicesOf(a.id)"
        [why]="why()"
        (closed)="assetForm.set(null)"
        (saved)="assetSaved($event)"
      />
    }
    @if (links(); as m) {
      <rp-vendor-links
        [merchant]="m"
        [groups]="groups()"
        [active]="activeByGroup()"
        [current]="linksOf(m)"
        [why]="linkWhy()"
        (closed)="links.set(null)"
        (saved)="linksSaved($event)"
      />
    }
  `,
  styles: `
    .cp-th {
      font: inherit;
      color: inherit;
      text-transform: inherit;
      letter-spacing: inherit;
      background: none;
      border: 0;
      padding: 0;
      cursor: pointer;
    }
    .cp-th:focus-visible {
      outline: 2px solid var(--brand-3);
      outline-offset: 2px;
      border-radius: 4px;
    }
  `,
})
export class ConsoleAssets {
  private readonly api = inject(AssetsApi);
  private readonly merchantsApi = inject(MerchantsApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).console;

  protected readonly columns = COLUMNS;
  protected readonly merColumns: readonly {
    k: MerSortKey | 'links' | 'a';
    l: string;
    r: boolean;
    sort: boolean;
  }[] = [
    { k: 'name', l: 'Merchant', r: false, sort: true },
    { k: 'sub', l: 'Sub-type', r: false, sort: true },
    { k: 'links', l: 'Linked groups', r: false, sort: false },
    { k: 'tagged', l: 'Payments tagged', r: true, sort: true },
    { k: 'a', l: '', r: false, sort: false },
  ];
  protected readonly pageSize = PAGE;
  protected readonly plural = plural;
  protected readonly typeLabel = typeLabel;
  protected readonly inactiveLabel = translate('status.asset_group.inactive');
  protected readonly statusPills: readonly { v: AssetStatus | ''; l: string }[] = [
    { v: '', l: 'All' },
    { v: 'ACTIVE', l: ASSET_STATUS.ACTIVE.l() },
    { v: 'INACTIVE', l: ASSET_STATUS.INACTIVE.l() },
  ];

  protected readonly grp = signal('');
  protected readonly q = signal('');
  protected readonly ast = signal<AssetStatus | ''>('');
  protected readonly page = signal(1);
  protected readonly sort = signal<{ k: SortKey; dir: 'asc' | 'desc' } | null>(null);
  protected readonly merSort = signal<{ k: MerSortKey; dir: 'asc' | 'desc' } | null>(null);
  protected readonly groups = signal<readonly AssetGroup[]>([]);
  protected readonly assets = signal<readonly Asset[]>([]);
  protected readonly merchants = signal<readonly Merchant[]>([]);
  protected readonly invoices = signal<readonly VendorInvoice[]>([]);
  /** Vendor → linked group ids, as last known (audit trail, then our own saves). */
  private readonly known = signal<ReadonlyMap<string, ReadonlySet<string>>>(new Map());
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly groupForm = signal<AssetGroup | 'new' | null>(null);
  protected readonly assetForm = signal<Asset | 'new' | null>(null);
  protected readonly links = signal<Merchant | null>(null);

  protected readonly canView = computed(() => this.can('config.view'));
  protected readonly canMerchants = computed(() => this.can('merchants.view'));
  protected readonly readOnly = computed(() =>
    this.session()?.roles.some((r) => r.readOnly)
      ? 'Management has read-only access. The administrator makes changes here.'
      : '',
  );
  protected readonly why = computed(
    () =>
      this.readOnly() || (this.can('config.edit') ? '' : "Your role doesn't include this task."),
  );
  protected readonly linkWhy = computed(
    () =>
      this.readOnly() || (this.can('merchants.edit') ? '' : "Your role doesn't include this task."),
  );
  protected readonly groupName = computed(() =>
    this.grp() ? (this.groups().find((g) => g.id === this.grp())?.name ?? '') : 'All groups',
  );
  private readonly pays = computed(() => paymentsByAsset(this.invoices()));
  private readonly taggedMap = computed(() => taggedByVendor(this.invoices()));
  protected readonly activeByGroup = computed(() => {
    const out = new Map<string, number>();
    for (const a of this.assets()) {
      if (a.status === 'ACTIVE') out.set(a.group.id, (out.get(a.group.id) ?? 0) + 1);
    }
    return out;
  });
  /**
   * Whether the vendors missing from `known` have no links: true when the known links account for
   * every group's vendor count (INS-020); otherwise their links are not known.
   */
  private readonly complete = computed(() => {
    const per = new Map<string, number>();
    for (const set of this.known().values()) for (const g of set) per.set(g, (per.get(g) ?? 0) + 1);
    return this.groups().every((g) => (per.get(g.id) ?? 0) === g.vendors);
  });
  protected readonly rows = computed(() => {
    const g = this.grp();
    const st = this.ast();
    const q = this.q().trim().toLowerCase();
    const list = this.assets().filter(
      (a) =>
        (!g || a.group.id === g) &&
        (!st || a.status === st) &&
        (!q || a.name.toLowerCase().includes(q) || (a.description ?? '').toLowerCase().includes(q)),
    );
    const s = this.sort();
    if (!s) return list;
    const get = (a: Asset): string | number =>
      s.k === 'name'
        ? a.name
        : s.k === 'type'
          ? typeLabel(a.type)
          : s.k === 'pays'
            ? (this.pays().get(a.id.toLowerCase())?.n ?? 0)
            : a.status;
    return [...list].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      const c =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y), 'en', { numeric: true });
      return s.dir === 'desc' ? -c : c;
    });
  });
  protected readonly shown = computed(() =>
    this.rows().slice((this.page() - 1) * PAGE, this.page() * PAGE),
  );
  /** Vendors first (prototype), then by name — or the chosen column. */
  protected readonly merchantRows = computed(() => {
    const s = this.merSort();
    const list = [...this.merchants()];
    if (!s) {
      return list.sort(
        (a, b) =>
          (a.subType === 'VENDOR' ? 0 : 1) - (b.subType === 'VENDOR' ? 0 : 1) ||
          a.displayName.localeCompare(b.displayName),
      );
    }
    const get = (m: Merchant): string | number =>
      s.k === 'name' ? m.displayName : s.k === 'sub' ? m.subType : this.tagged(m);
    return list.sort((a, b) => {
      const x = get(a);
      const y = get(b);
      const c =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y), 'en', { numeric: true });
      return s.dir === 'desc' ? -c : c;
    });
  });

  constructor() {
    void this.load();
  }

  protected async load() {
    if (!this.canView()) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const [g, a] = await Promise.all([this.api.groups(), this.api.assets()]);
      this.groups.set(g.items);
      this.assets.set(a.items);
      this.error.set('');
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      this.loading.set(false);
    }
    void this.loadMerchants();
  }

  /** The merchants, their paid invoices and the vendors' links (each optional). */
  private async loadMerchants() {
    if (!this.canMerchants()) return;
    const [m, inv, links] = await Promise.all([
      this.merchantsApi.list({ limit: 200 }).catch(() => null),
      this.api.invoices().catch(() => null),
      this.api.links().catch(() => null),
    ]);
    if (m) this.merchants.set(m.items);
    if (inv) this.invoices.set(inv.items);
    if (links) {
      // Our own saves this session are newer than the audit trail read.
      const merged = new Map<string, ReadonlySet<string>>(links);
      for (const [k, v] of this.known()) merged.set(k, v);
      this.known.set(merged);
    }
  }

  // --- actions ---------------------------------------------------------------------------------------
  protected pickGroup(id: string) {
    this.grp.set(id);
    this.page.set(1);
  }

  protected groupSaved(r: { name: string; created: boolean }) {
    this.groupForm.set(null);
    this.overlays.toast(r.created ? 'Group created' : 'Group saved', { sub: r.name });
    void this.load();
  }

  protected assetSaved(r: { name: string; group: string; created: boolean }) {
    this.assetForm.set(null);
    this.overlays.toast(r.created ? 'Asset added' : 'Asset saved', {
      sub: [r.name, r.group].filter(Boolean).join(' · '),
    });
    void this.load();
  }

  protected linksSaved(r: { merchant: Merchant; links: VendorLinks }) {
    this.links.set(null);
    const ids = new Set(r.links.linked.map((g) => g.id));
    const next = new Map(this.known());
    next.set(r.merchant.id, ids);
    this.known.set(next);
    const kept = r.links.skipped.length;
    this.overlays.toast('Links saved', {
      sub: `${r.merchant.displayName} · ${plural(ids.size, 'group')}${kept ? ` · ${plural(kept, 'inactive group')} left as it was` : ''}`,
    });
    void this.load();
  }

  // --- table -----------------------------------------------------------------------------------------
  protected sortBy(k: SortKey) {
    const s = this.sort();
    this.sort.set({ k, dir: s?.k === k && s.dir === 'asc' ? 'desc' : 'asc' });
    this.page.set(1);
  }
  protected ariaSort(k: SortKey) {
    const s = this.sort();
    return s?.k === k ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  }
  protected merSortBy(k: MerSortKey | 'links' | 'a') {
    if (k === 'links' || k === 'a') return;
    const s = this.merSort();
    this.merSort.set({ k, dir: s?.k === k && s.dir === 'asc' ? 'desc' : 'asc' });
  }
  protected merAria(c: { k: string; sort: boolean }) {
    if (!c.sort) return null;
    const s = this.merSort();
    return s?.k === c.k ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  }

  // --- formatting ------------------------------------------------------------------------------------
  protected can(sub: string) {
    return this.session()?.subTasks.includes(sub) ?? false;
  }
  protected activeIn(groupId: string) {
    return this.activeByGroup().get(groupId) ?? 0;
  }
  protected assetSub(a: Asset) {
    return this.grp() ? (a.description ?? '—') : a.group.name;
  }
  protected paysOf(a: Asset) {
    return this.pays().get(a.id.toLowerCase()) ?? null;
  }
  protected invoicesOf(id: string) {
    const k = id.toLowerCase();
    return this.invoices().filter((i) => i.asset?.id.toLowerCase() === k);
  }
  /** Whole rupees of a paise total (fmt.inr0), built from the integer's digits — no float. */
  protected whole(paise: number) {
    const s = String(Math.max(0, Math.trunc(paise))).padStart(3, '0');
    return inrWhole({ amount: `${s.slice(0, -2)}.${s.slice(-2)}` });
  }
  protected status(s: AssetStatus) {
    return ASSET_STATUS[s];
  }
  /** The vendor's linked groups; null when they aren't known. */
  protected linksOf(m: Merchant): ReadonlySet<string> | null {
    const k = this.known().get(m.id);
    if (k) return k;
    return this.complete() ? new Set() : null;
  }
  /** The names of the vendor's linked groups, or null when it has none (or they're unknown). */
  protected linkNames(m: Merchant): string[] | null {
    const set = this.linksOf(m);
    if (!set || !set.size) return null;
    return this.groups()
      .filter((g) => set.has(g.id))
      .map((g) => g.name);
  }
  protected tagged(m: Merchant) {
    return this.taggedMap().get(m.id) ?? 0;
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
}
