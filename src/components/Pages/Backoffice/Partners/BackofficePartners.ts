import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Card, Empty, Kpi } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { ago } from '../../../Utils/dates';
import { formatDate, formatDateTime } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { MessagingChannels } from './MessagingChannels';
import { PartnerDrawer } from './PartnerDrawer';
import { PartnerForm, type CreatedClient } from './PartnerForm';
import { SecretPanel, type ShownSecret } from './SecretPanel';
import { STATUS, partnerLabel, plural, refusalLabel, scopeLabel } from './partner-format';
import { PartnersApi, type ApiClient, type TokenPolicy, type TokenRecord } from './partners.api';

type SortKey = 'name' | 'clientId' | 'status' | 'rotated';
const COLUMNS: readonly { k: SortKey | 'scopes' | 'ips' | 'last'; l: string; sort: boolean }[] = [
  { k: 'name', l: 'Client', sort: true },
  { k: 'clientId', l: 'Client id', sort: true },
  { k: 'scopes', l: 'Scopes', sort: false },
  { k: 'ips', l: 'IP allowlist', sort: false },
  { k: 'status', l: 'Status', sort: true },
  { k: 'last', l: 'Last token', sort: false },
  { k: 'rotated', l: 'Secret rotated', sort: true },
];
const DAY = 86_400_000;
/** Pages of each client's token log read for the 24-hour figures (50 a page). */
const STAT_PAGES = 4;

interface Activity extends TokenRecord {
  readonly client: string;
}

/**
 * o.partners — Partner API clients (SRS 8.13, 18.2; FR-INT-01, NFR-02/03; INT-001…008; prototype
 * o.partners): the key figures, every client with its scopes, allowlist, status and last token, the
 * token policy with its lifetime (INT-007/008), recent token activity, and the signing contract the
 * sponsor bank's calls follow — an example contract until the bank's API is known (C-11). A client
 * opens in the drawer (PartnerDrawer); new clients and their scopes use PartnerForm; a secret is
 * shown once in SecretPanel and never kept. The platform's messaging channels and their switches
 * (INT-009/010, MessagingChannels) close the page.
 */
@Component({
  selector: 'rp-backoffice-partners',
  imports: [
    Card,
    Empty,
    Icon,
    Kpi,
    MessagingChannels,
    Modal,
    PartnerDrawer,
    PartnerForm,
    SecretPanel,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <div class="c-ph">
        <div class="c-pt">
          <h1>Partner API clients</h1>
          <p>
            Credentials for the sponsor bank and the other partners that call CampusOne — scoped,
            IP-restricted and short-lived.
            <span
              class="row g4 wrap"
              style="display: inline-flex; vertical-align: middle; margin-left: 4px"
              ><span class="srs" title="SRS reference">FR-INT-01</span>
              <span class="srs" title="SRS reference">NFR-02</span>
              <span class="srs" title="SRS reference">NFR-03</span></span
            >
          </p>
        </div>
        <div class="c-pa">
          <span class="cp-why" [attr.title]="why() || null"
            ><button
              type="button"
              class="btn btn-pri"
              id="ob-api-new"
              [disabled]="!!why()"
              (click)="openNew()"
            >
              <rp-icon name="plus" [size]="17" /><span>New API client</span>
            </button></span
          >
          <span class="cp-why" [attr.title]="why() || null"
            ><button
              type="button"
              class="btn btn-sec"
              id="ob-api-import"
              [disabled]="!!why()"
              (click)="openImport()"
            >
              <rp-icon name="key" [size]="17" /><span>Import existing client</span>
            </button></span
          >
        </div>
      </div>

      @if (error()) {
        <div class="card pad">
          <rp-empty icon="alertc" title="Couldn't load the partner clients" [text]="error()">
            <button type="button" class="btn btn-sec btn-sm" (click)="reload()">
              <span>Try again</span>
            </button>
          </rp-empty>
        </div>
      } @else if (loading() && !clients().length) {
        <div class="card pad"><rp-empty icon="hourglass" title="Loading…" /></div>
      } @else {
        <div class="c-grid k4">
          <rp-kpi
            label="Active clients"
            [value]="num(activeCount())"
            icon="plug"
            [delta]="suspendedCount() + ' suspended'"
          />
          <rp-kpi
            label="Tokens issued · 24 h"
            [value]="stats() ? num(stats()!.issued) : '—'"
            icon="key"
            [delta]="stats() ? plural(stats()!.live, 'client') + ' with a live token' : ''"
          />
          <rp-kpi
            label="Token lifetime"
            [value]="policy() ? policy()!.minutes + ' min' : '—'"
            icon="timer"
            delta="Configurable"
          />
          <rp-kpi
            label="Refused · 24 h"
            [value]="stats() ? num(stats()!.refused) : '—'"
            icon="shieldx"
            [tone]="stats()?.refused ? 'warn' : null"
            delta="Wrong secret, address or scope"
          />
        </div>

        <div class="tbl-wrap">
          <table class="tbl">
            <thead>
              <tr>
                @for (c of columns; track c.k) {
                  <th
                    [class.sort]="c.sort"
                    [class.asc]="c.sort && sort()?.k === c.k && sort()?.dir === 'asc'"
                    [class.desc]="c.sort && sort()?.k === c.k && sort()?.dir === 'desc'"
                    [attr.aria-sort]="ariaSort(c.k)"
                  >
                    @if (c.sort) {
                      <button type="button" class="cp-th" (click)="sortBy(c.k)">
                        {{ c.l
                        }}<span class="sa" aria-hidden="true">{{
                          sort()?.k === c.k && sort()?.dir === 'desc' ? '↓' : '↑'
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
              @for (c of sorted(); track c.id) {
                <tr tabindex="0" (click)="open(c.id)" (keydown.enter)="open(c.id)">
                  <td>
                    <div class="stack g4" style="gap: 1px">
                      <span class="cell-t">{{ c.name }}</span>
                      <span class="cell-s">{{ partner(c.partner) }}</span>
                    </div>
                  </td>
                  <td>
                    <span class="t-mono">{{ c.clientId }}</span>
                  </td>
                  <td>
                    <div class="row wrap g4">
                      @for (s of c.scopes; track s) {
                        <span class="tag t-mono" [attr.title]="scope(s)">{{ s }}</span>
                      }
                    </div>
                  </td>
                  <td>
                    <span class="t-mono t-sm">
                      @for (ip of c.ipAllowlist; track ip; let last = $last) {
                        {{ ip }}
                        @if (!last) {
                          <br />
                        }
                      }
                    </span>
                  </td>
                  <td>
                    <span [class]="'chip dot tone-' + statusOf(c).tone">{{ statusOf(c).l }}</span>
                  </td>
                  <td>
                    @if (c.lastTokenAt) {
                      {{ since(c.lastTokenAt) }}
                    } @else {
                      <span class="t-muted">—</span>
                    }
                  </td>
                  <td>{{ date(c.secretRotatedAt) }}</td>
                </tr>
              } @empty {
                <tr>
                  <td [attr.colspan]="columns.length">
                    <rp-empty
                      icon="plug"
                      title="No API clients yet"
                      text="Create a client for the sponsor bank once its integration is agreed. Its secret is shown once, when created."
                    />
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (clients().length) {
          <div class="pager">
            <span>{{ plural(clients().length, 'client') }}</span>
          </div>
        }

        <div class="c-grid k2">
          <rp-card title="Token policy" icon="key" [plainIcon]="true">
            <span card-right class="srs" title="SRS reference">FR-INT-01</span>
            <dl class="kv">
              <dt>Grant</dt>
              <dd>Client credentials</dd>
              <dt>Lifetime</dt>
              <dd>{{ policy() ? plural(policy()!.minutes, 'minute') : '—' }}</dd>
              <dt>On issue</dt>
              <dd>Earlier live tokens of the client end</dd>
              <dt>Every call</dt>
              <dd>Bearer token checked, then the scope, then the source IP, then the signature</dd>
              <dt>Secret rotation</dt>
              <dd>The previous secret keeps working for a set overlap, then stops</dd>
            </dl>
            <div class="mt12">
              <span class="cp-why" [attr.title]="why() || null"
                ><button
                  type="button"
                  class="btn btn-sec btn-sm"
                  id="ob-api-ttl"
                  [disabled]="!!why() || !policy()"
                  (click)="openTtl()"
                >
                  <rp-icon name="timer" [size]="15" /><span>Change lifetime</span>
                </button></span
              >
            </div>
          </rp-card>
          <rp-card title="Recent token activity" icon="activity" [plainIcon]="true">
            @if (recent().length) {
              <div class="list plain">
                @for (t of recent(); track t.id) {
                  <div class="li">
                    <span class="li-ic sm"
                      ><rp-icon [name]="t.outcome === 'REFUSED' ? 'shieldx' : 'key'" [size]="16"
                    /></span>
                    <span class="li-main"
                      ><span class="li-t"
                        >{{ t.client }} ·
                        {{ t.outcome === 'REFUSED' ? 'refused' : 'token issued' }}</span
                      ><span class="li-s"
                        >{{ dt(t.issuedAt) }} ·
                        @if (t.outcome === 'REFUSED') {
                          {{ refusal(t.reason) }}
                        } @else {
                          <span class="t-mono">{{ t.scopes.join(' ') }}</span>
                        }
                      </span></span
                    >
                    @if (t.outcome === 'REFUSED') {
                      <span class="li-r"><span class="chip tone-bad">Refused</span></span>
                    }
                  </div>
                }
              </div>
            } @else {
              <rp-empty
                icon="activity"
                [title]="stats() ? 'No token requests yet' : 'Loading the token activity…'"
                text="Token requests from every client appear here, newest first."
              />
            }
          </rp-card>
        </div>

        <rp-card title="Signing contract" icon="shieldck" [plainIcon]="true">
          <span card-right class="chip tone-warn">Example contract</span>
          <div class="stack g12">
            <div class="note tone-warn">
              <rp-icon name="alert" [size]="17" />
              <div class="grow">
                <b>An example contract until the sponsor bank's API is known.</b> The header names
                and the signature scheme are CampusOne's proposal; they change in one place when the
                bank's specification arrives (C-11).
              </div>
            </div>
            <dl class="kv" id="ob-contract">
              <dt>Token</dt>
              <dd>
                <span class="t-mono">POST /api/v1/partners/oauth/token</span
                ><span class="t-xs t-muted" style="display: block"
                  >JSON: grant_type “client_credentials”, client_id, client_secret, scope
                  (optional)</span
                >
              </dd>
              <dt>Validate a credit</dt>
              <dd>
                <span class="t-mono">POST /api/v1/partners/bank/va/validate</span
                ><span class="t-xs t-muted" style="display: block">Scope va.validate</span>
              </dd>
              <dt>Notify a credit</dt>
              <dd>
                <span class="t-mono">POST /api/v1/partners/bank/va/notify</span
                ><span class="t-xs t-muted" style="display: block">Scope va.notify</span>
              </dd>
              <dt>Authorization</dt>
              <dd><span class="t-mono">Bearer &lt;access token&gt;</span></dd>
              <dt>X-CampusOne-Timestamp</dt>
              <dd>Unix time in seconds, within the allowed clock skew (300 s unless changed)</dd>
              <dt>X-CampusOne-Signature</dt>
              <dd>
                <span class="t-mono"
                  >v1=&lt;hex HMAC-SHA256(secret, "&lt;timestamp&gt;.&lt;raw body&gt;")&gt;</span
                >
              </dd>
              <dt>Replays</dt>
              <dd>
                Each requestId is accepted once: a repeat with the same body gets the first answer;
                a different body is refused
              </dd>
            </dl>
          </div>
        </rp-card>

        <!-- The platform's messaging channels and their switches (INT-009/010). -->
        <rp-messaging-channels [readOnly]="!!why()" />
      }
    </div>

    @if (openClient(); as c) {
      <rp-partner-drawer
        [client]="c"
        [why]="why()"
        (closed)="openId.set(null)"
        (edit)="editing.set(c)"
        (changed)="changed($event)"
        (secret)="shown.set($event)"
      />
    }
    @if (creating() || editing() || importing()) {
      <rp-partner-form
        [client]="editing()"
        [importing]="importing()"
        (imported)="importedClient($event)"
        [names]="names()"
        [minutes]="policy()?.minutes ?? 15"
        (closed)="closeForm()"
        (created)="created($event)"
        (saved)="saved($event)"
        (stale)="closeForm(); reload()"
      />
    }
    @if (ttl(); as f) {
      <rp-modal
        title="Token lifetime"
        sub="Applies to tokens issued from now on (FR-INT-01, configurable)."
        (closed)="ttl.set(null)"
      >
        <div class="stack g12">
          <div class="fld" [class.invalid]="ttlErr('minutes')">
            <label class="fld-l" for="ob-ttl">Minutes<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="ob-ttl"
                name="ob-ttl"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                aria-describedby="ob-ttl-e"
                maxlength="3"
                [value]="f.minutes"
                (input)="setTtl('minutes', $event)"
              />
            </div>
            <div class="fld-e" id="ob-ttl-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ ttlErr('minutes') }}</span>
            </div>
            <div class="fld-h">
              {{ policy()!.min }} to {{ policy()!.max }} minutes. Shorter is safer; partners request
              a new token when theirs expires.
            </div>
          </div>
          <div class="fld" [class.invalid]="ttlErr('reason')">
            <label class="fld-l" for="ob-ttl-r">Reason (recorded)<span class="req">*</span></label>
            <div class="fld-in">
              <textarea
                id="ob-ttl-r"
                name="ob-ttl-r"
                rows="2"
                maxlength="300"
                placeholder="e.g. The bank asked for longer-lived tokens"
                aria-describedby="ob-ttl-r-e"
                [value]="f.reason"
                (input)="setTtl('reason', $event)"
              ></textarea>
            </div>
            <div class="fld-e" id="ob-ttl-r-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ ttlErr('reason') }}</span>
            </div>
          </div>
        </div>
        <ng-container modal-foot>
          <button type="button" class="btn btn-sec" (click)="ttl.set(null)">
            <span>Cancel</span>
          </button>
          <button
            type="button"
            class="btn btn-pri"
            id="ob-ttl-save"
            [class.is-busy]="busy()"
            [disabled]="busy()"
            (click)="saveTtl()"
          >
            <span>Save</span>
          </button>
        </ng-container>
      </rp-modal>
    }
    @if (shown(); as s) {
      <rp-secret-panel [shown]="s" (closed)="shown.set(null)" />
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
export class BackofficePartners {
  private readonly api = inject(PartnersApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).ops;

  protected readonly columns = COLUMNS;
  protected readonly clients = signal<readonly ApiClient[]>([]);
  protected readonly policy = signal<TokenPolicy | null>(null);
  /** Each client's recent token log (for the 24-hour figures and the activity card). */
  private readonly logs = signal<ReadonlyMap<string, readonly TokenRecord[]> | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly sort = signal<{ k: SortKey; dir: 'asc' | 'desc' } | null>(null);
  protected readonly openId = signal<string | null>(null);
  protected readonly creating = signal(false);
  protected readonly importing = signal(false);
  protected readonly editing = signal<ApiClient | null>(null);
  protected readonly ttl = signal<{ minutes: string; reason: string } | null>(null);
  protected readonly ttlErrors = signal<{ minutes?: string; reason?: string }>({});
  protected readonly busy = signal(false);
  /** The secret on show; dropped the moment its panel closes. */
  protected readonly shown = signal<ShownSecret | null>(null);
  private seq = 0;

  protected readonly why = computed(() =>
    this.session()?.subTasks.includes('partners.edit')
      ? ''
      : 'Your role doesn’t hold “Partner API clients”. Ask a Platform Administrator in Roles & tasks.',
  );
  protected readonly activeCount = computed(
    () => this.clients().filter((c) => c.status === 'ACTIVE').length,
  );
  protected readonly suspendedCount = computed(() => this.clients().length - this.activeCount());
  protected readonly names = computed(() => this.clients().map((c) => c.name));
  protected readonly openClient = computed(
    () => this.clients().find((c) => c.id === this.openId()) ?? null,
  );
  protected readonly stats = computed(() => {
    const logs = this.logs();
    if (!logs) return null;
    const from = Date.now() - DAY;
    let issued = 0;
    let refused = 0;
    let live = 0;
    for (const list of logs.values()) {
      if (list.some((t) => t.live)) live++;
      for (const t of list) {
        if (new Date(t.issuedAt).getTime() < from) continue;
        if (t.outcome === 'ISSUED') issued++;
        else refused++;
      }
    }
    return { issued, refused, live };
  });
  protected readonly recent = computed<Activity[]>(() => {
    const logs = this.logs();
    if (!logs) return [];
    const nameOf = new Map(this.clients().map((c) => [c.id, c.name]));
    return [...logs.entries()]
      .flatMap(([id, list]) => list.map((t) => ({ ...t, client: nameOf.get(id) ?? '' })))
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
      .slice(0, 6);
  });
  protected readonly sorted = computed(() => {
    const list = [...this.clients()];
    const s = this.sort();
    if (!s) return list;
    const get = (c: ApiClient) =>
      s.k === 'name'
        ? c.name
        : s.k === 'clientId'
          ? c.clientId
          : s.k === 'status'
            ? STATUS[c.status].l
            : c.secretRotatedAt;
    list.sort((a, b) => {
      const r = get(a).localeCompare(get(b), 'en', { numeric: true });
      return s.dir === 'desc' ? -r : r;
    });
    return list;
  });

  constructor() {
    void this.reload();
  }

  /** INT-001 and INT-007, then each client's recent token log (INT-005). */
  protected async reload() {
    const n = ++this.seq;
    this.loading.set(true);
    try {
      const [list, policy] = await Promise.all([
        this.api.list(),
        this.api.tokenPolicy().catch(() => null),
      ]);
      if (n !== this.seq) return;
      this.clients.set(list.items);
      if (policy) this.policy.set(policy);
      this.error.set('');
      void this.loadLogs(list.items, n);
    } catch (e) {
      if (n === this.seq) {
        this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
      }
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
  }

  private async loadLogs(list: readonly ApiClient[], n: number) {
    const from = Date.now() - DAY;
    const one = async (c: ApiClient): Promise<[string, TokenRecord[]]> => {
      const out: TokenRecord[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < STAT_PAGES; page++) {
        const p = await this.api.tokens(c.id, cursor).catch(() => null);
        if (!p) break;
        out.push(...p.items);
        const last = p.items.at(-1);
        if (!p.nextCursor || !last || new Date(last.issuedAt).getTime() < from) break;
        cursor = p.nextCursor;
      }
      return [c.id, out];
    };
    const entries = await Promise.all(list.map(one));
    if (n === this.seq) this.logs.set(new Map(entries));
  }

  // --- table -----------------------------------------------------------------------------------------
  protected sortBy(k: SortKey | 'scopes' | 'ips' | 'last') {
    if (k === 'scopes' || k === 'ips' || k === 'last') return;
    const s = this.sort();
    this.sort.set({ k, dir: s?.k === k && s.dir === 'asc' ? 'desc' : 'asc' });
  }
  protected ariaSort(k: string) {
    const c = COLUMNS.find((x) => x.k === k);
    if (!c?.sort) return null;
    const s = this.sort();
    return s?.k === k ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  }
  protected open(id: string) {
    this.openId.set(id);
  }

  // --- create and edit -------------------------------------------------------------------------------
  protected openNew() {
    if (this.why()) return;
    this.creating.set(true);
  }
  protected openImport() {
    if (this.why()) return;
    this.importing.set(true);
  }
  protected closeForm() {
    this.creating.set(false);
    this.importing.set(false);
    this.editing.set(null);
  }
  protected importedClient(c: ApiClient) {
    this.closeForm();
    this.overlays.toast(`${c.name} imported`, {
      sub: `Client id ${c.clientId}: the partner keeps using its own secret`,
    });
    void this.reload();
  }
  protected created(c: CreatedClient) {
    this.closeForm();
    this.shown.set({
      clientId: c.clientId,
      secret: c.secret,
      rotated: false,
      previousValidUntil: null,
    });
    void this.reload();
  }
  protected saved(c: ApiClient) {
    this.closeForm();
    this.replace(c);
    this.overlays.toast(`${c.name} updated`, { sub: 'Scopes and IP allowlist saved' });
    void this.reload();
  }
  protected changed(c: ApiClient | null) {
    if (c) this.replace(c);
    void this.reload();
  }
  private replace(c: ApiClient) {
    this.clients.set(
      this.clients().map((x) => (x.id === c.id ? { ...c, lastTokenAt: x.lastTokenAt ?? null } : x)),
    );
  }

  // --- token lifetime (INT-008) ----------------------------------------------------------------------
  protected openTtl() {
    const p = this.policy();
    if (!p || this.why()) return;
    this.ttlErrors.set({});
    this.ttl.set({ minutes: String(p.minutes), reason: '' });
  }
  protected ttlErr(k: 'minutes' | 'reason') {
    return this.ttlErrors()[k] ?? '';
  }
  protected setTtl(k: 'minutes' | 'reason', e: Event) {
    const f = this.ttl();
    if (!f) return;
    this.ttl.set({ ...f, [k]: (e.target as HTMLInputElement).value });
    this.ttlErrors.set({ ...this.ttlErrors(), [k]: '' });
  }
  protected async saveTtl() {
    const f = this.ttl();
    const p = this.policy();
    if (!f || !p || this.busy()) return;
    const errors: { minutes?: string; reason?: string } = {};
    const v = f.minutes.trim();
    if (!v) errors.minutes = 'Enter the lifetime';
    else if (!/^\d+$/.test(v)) errors.minutes = 'Enter whole minutes';
    else if (Number(v) < p.min || Number(v) > p.max) {
      errors.minutes = `Choose ${p.min} to ${p.max} minutes`;
    }
    const reason = f.reason.trim();
    if (!reason) errors.reason = 'Enter a reason to continue';
    else if (reason.length < 5) errors.reason = 'Write at least 5 characters';
    this.ttlErrors.set(errors);
    if (errors.minutes || errors.reason) return;
    this.busy.set(true);
    try {
      const r = await this.api.setTokenPolicy(p.version, { minutes: Number(v), reason });
      this.policy.set(r);
      this.ttl.set(null);
      this.overlays.toast(`Token lifetime set to ${r.minutes} minutes`, {
        sub: 'Applies to tokens issued from now on',
      });
    } catch (e) {
      const field = e instanceof ApiProblem ? e.errors.find((x) => x.field === 'minutes') : null;
      if (field) {
        this.ttlErrors.set({ minutes: field.message });
      } else {
        this.overlays.toast('Not changed', {
          sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
          tone: 'bad',
        });
        if (e instanceof ApiProblem && (e.status === 412 || e.status === 428)) {
          this.ttl.set(null);
          void this.reload();
        }
      }
    } finally {
      this.busy.set(false);
    }
  }

  // --- formatting ------------------------------------------------------------------------------------
  protected statusOf(c: ApiClient) {
    return STATUS[c.status] ?? { l: c.status, tone: 'neutral' };
  }
  protected partner(v: string) {
    return partnerLabel(v);
  }
  protected scope(s: string) {
    return scopeLabel(s);
  }
  protected refusal(r: string | null) {
    return refusalLabel(r);
  }
  protected plural(n: number, w: string) {
    return plural(n, w);
  }
  protected num(n: number) {
    return n.toLocaleString('en-IN');
  }
  protected since(v: string) {
    return ago(v);
  }
  protected date(v: string) {
    return formatDate(v);
  }
  protected dt(v: string) {
    return formatDateTime(v);
  }
}
