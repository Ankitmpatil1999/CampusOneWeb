import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate, formatDateTime, formatTime } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import {
  STATUS,
  partnerLabel,
  plural,
  refusalLabel,
  scopeLabel,
  tokenState,
} from './partner-format';
import { PartnersApi, type ApiClient, type TokenRecord } from './partners.api';
import type { ShownSecret } from './SecretPanel';
import { copyText } from '../../../Utils/clipboard';

const REASON = { label: 'Reason (recorded)', min: 5, max: 300 } as const;

/**
 * The client drawer (prototype apiView): status, credentials (the secret is never shown again),
 * scopes and the IP allowlist, and the token log (INT-005) with "Load more". The footer ends the
 * live tokens (INT-006), suspends with a reason or reactivates (INT-003) and rotates the secret
 * (INT-004); the new secret goes to the page's one-time panel.
 */
@Component({
  selector: 'rp-partner-drawer',
  imports: [Empty, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="client().name"
      [sub]="partner() + ' · ' + client().clientId"
      icon="plug"
      [drawer]="true"
      (closed)="closed.emit()"
    >
      <div class="stack g16">
        <div class="row g8">
          <span [class]="'chip dot tone-' + status().tone">{{ status().l }}</span>
          @if (client().status !== 'ACTIVE' && client().statusReason) {
            <span class="t-sm t-muted">{{ client().statusReason }}</span>
          }
        </div>
        <div class="fs">
          <h4><rp-icon name="key" [size]="15" /> Credentials</h4>
          <div class="fs-b">
            <dl class="kv">
              <dt>Client id</dt>
              <dd>
                <span class="t-mono">{{ client().clientId }}</span>
                <button
                  type="button"
                  class="btn btn-ghost btn-xs btn-icon"
                  title="Copy client id"
                  aria-label="Copy client id"
                  (click)="copyId()"
                >
                  <rp-icon name="copy" [size]="14" />
                </button>
              </dd>
              <dt>Client secret</dt>
              <dd>
                <span class="t-mono t-muted">••••••••••••</span
                ><span class="t-xs t-muted" style="display: block"
                  >Kept encrypted — it's shown once, when created or rotated</span
                >
              </dd>
              <dt>Partner</dt>
              <dd>{{ partner() }}</dd>
              <dt>Created</dt>
              <dd>{{ date(client().createdAt) }}</dd>
              <dt>Secret last rotated</dt>
              <dd>{{ dt(client().secretRotatedAt) }}</dd>
              @if (previousUntil(); as until) {
                <dt>Previous secret</dt>
                <dd>Works until {{ dt(until) }}</dd>
              }
            </dl>
          </div>
        </div>
        <div class="fs">
          <h4><rp-icon name="shieldck" [size]="15" /> Scopes and network</h4>
          <div class="fs-b">
            <dl class="kv">
              @for (s of client().scopes; track s) {
                <dt>{{ s }}</dt>
                <dd>{{ scope(s) }}</dd>
              }
              <dt>IP allowlist</dt>
              <dd>
                <span class="t-mono">
                  @for (ip of client().ipAllowlist; track ip; let last = $last) {
                    {{ ip }}
                    @if (!last) {
                      <br />
                    }
                  }
                </span>
              </dd>
            </dl>
            <div class="mt12">
              <span class="cp-why" [attr.title]="editWhy() || null"
                ><button
                  type="button"
                  class="btn btn-sec btn-sm"
                  id="ob-api-edit"
                  [disabled]="!!editWhy()"
                  (click)="edit.emit()"
                >
                  <rp-icon name="edit" [size]="15" /><span>Edit scopes and IPs</span>
                </button></span
              >
            </div>
          </div>
        </div>
        <div class="fs">
          <h4><rp-icon name="history" [size]="15" /> Tokens</h4>
          <div class="fs-b" style="padding: 0">
            @if (tokensError()) {
              <div class="card-b">
                <rp-empty icon="alertc" title="Couldn't load the tokens" [text]="tokensError()">
                  <button type="button" class="btn btn-sec btn-sm" (click)="reloadTokens()">
                    <span>Try again</span>
                  </button>
                </rp-empty>
              </div>
            } @else if (tokens().length) {
              <div class="tbl-wrap" style="border: 0; border-radius: 0">
                <table class="tbl dense">
                  <thead>
                    <tr>
                      <th>Issued</th>
                      <th>Expires</th>
                      <th>Scopes</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (t of tokens(); track t.id) {
                      <tr>
                        <td class="ob-nw">{{ dt(t.issuedAt) }}</td>
                        <td class="ob-nw">{{ expires(t) }}</td>
                        <td class="t-mono">{{ t.scopes.length ? t.scopes.join(' ') : '—' }}</td>
                        <td>
                          @if (t.outcome === 'ISSUED') {
                            <span class="chip tone-ok">Issued</span>
                          } @else {
                            <span class="chip tone-bad">Refused · {{ refusal(t.reason) }}</span>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <div class="pager" style="padding: 10px 14px">
                <span
                  >{{ count(tokens().length, 'token request') }}{{ next() ? ' shown' : '' }}</span
                >
                @if (next()) {
                  <button
                    type="button"
                    class="btn btn-sec btn-sm"
                    id="ob-tok-more"
                    [class.is-busy]="loading()"
                    [disabled]="loading()"
                    (click)="loadMore()"
                  >
                    <rp-icon name="down" [size]="15" /><span>Load more</span>
                  </button>
                }
              </div>
            } @else if (loading()) {
              <div class="card-b"><rp-empty icon="hourglass" title="Loading the tokens…" /></div>
            } @else {
              <div class="card-b">
                <rp-empty
                  icon="key"
                  title="No tokens issued"
                  text="Each token request — issued or refused, with the reason — appears here."
                />
              </div>
            }
          </div>
        </div>
      </div>
      <ng-container modal-foot>
        <span class="cp-why" [attr.title]="revokeWhy() || null"
          ><button
            type="button"
            class="btn btn-ghost"
            id="ob-api-revoke"
            [class.is-busy]="busy() === 'revoke'"
            [disabled]="!!revokeWhy() || !!busy()"
            (click)="revoke()"
          >
            <rp-icon name="shieldx" [size]="17" /><span>End live tokens</span>
          </button></span
        >
        <span class="cp-why" [attr.title]="why() || null"
          ><button
            type="button"
            class="btn"
            id="ob-api-st"
            [class.btn-danger-o]="active()"
            [class.btn-sec]="!active()"
            [class.is-busy]="busy() === 'status'"
            [disabled]="!!why() || !!busy()"
            (click)="toggleStatus()"
          >
            <span>{{ active() ? 'Suspend client' : 'Reactivate client' }}</span>
          </button></span
        >
        <span class="cp-why" [attr.title]="editWhy() || null"
          ><button
            type="button"
            class="btn btn-pri"
            id="ob-api-rotate"
            [class.is-busy]="busy() === 'rotate'"
            [disabled]="!!editWhy() || !!busy()"
            (click)="rotate()"
          >
            <rp-icon name="refresh" [size]="17" /><span>Rotate secret</span>
          </button></span
        >
      </ng-container>
    </rp-modal>
  `,
})
export class PartnerDrawer {
  private readonly api = inject(PartnersApi);
  private readonly overlays = inject(Overlays);

  readonly client = input.required<ApiClient>();
  /** Why the operator may not change clients ('' when they hold partners.edit). */
  readonly why = input('');
  readonly closed = output<void>();
  /** Open the scopes and IPs form. */
  readonly edit = output<void>();
  /** The client changed (status, secret): the page reloads the list. */
  readonly changed = output<ApiClient | null>();
  /** A rotated secret for the one-time panel. */
  readonly secret = output<ShownSecret>();

  protected readonly tokens = signal<readonly TokenRecord[]>([]);
  protected readonly next = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly tokensError = signal('');
  protected readonly busy = signal('');
  private seq = 0;

  protected readonly active = computed(() => this.client().status === 'ACTIVE');
  protected readonly status = computed(() => STATUS[this.client().status]);
  protected readonly partner = computed(() => partnerLabel(this.client().partner));
  protected readonly editWhy = computed(
    () => this.why() || (this.active() ? '' : 'Reactivate the client first.'),
  );
  protected readonly revokeWhy = computed(
    () =>
      this.why() ||
      (this.tokens().some((t) => t.live) ? '' : 'The client has no live tokens right now.'),
  );
  protected readonly previousUntil = computed(() => {
    const v = this.client().previousSecretValidUntil;
    return v && new Date(v).getTime() > Date.now() ? v : null;
  });
  private readonly clientId = computed(() => this.client().id);

  constructor() {
    effect(() => {
      // Another client starts the log again; a reload of the same one keeps it.
      this.clientId();
      untracked(() => void this.load());
    });
  }

  private async load(cursor?: string) {
    const n = ++this.seq;
    this.loading.set(true);
    try {
      const p = await this.api.tokens(this.client().id, cursor);
      if (n !== this.seq) return;
      this.tokens.set(cursor ? [...this.tokens(), ...p.items] : p.items);
      this.next.set(p.nextCursor);
      this.tokensError.set('');
    } catch (e) {
      if (n !== this.seq) return;
      this.tokensError.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
  }

  protected loadMore() {
    const c = this.next();
    if (c && !this.loading()) void this.load(c);
  }
  protected reloadTokens() {
    void this.load();
  }

  private refused(title: string, e: unknown) {
    this.overlays.toast(title, {
      sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
      tone: 'bad',
    });
    if (e instanceof ApiProblem && (e.status === 412 || e.status === 428)) this.changed.emit(null);
  }

  protected async copyId() {
    try {
      await copyText(this.client().clientId);
      this.overlays.toast('Client id copied', { sub: this.client().clientId });
    } catch {
      this.overlays.toast("Couldn't copy", { sub: 'Select the id and copy it.', tone: 'warn' });
    }
  }

  /** INT-003: suspend with a reason (live tokens end), or reactivate. */
  protected async toggleStatus() {
    if (this.why() || this.busy()) return;
    const c = this.client();
    const on = c.status === 'ACTIVE';
    const ok = await this.overlays.confirm(
      on
        ? {
            title: `Suspend ${c.name}?`,
            text: "Token requests and calls are refused until it's reactivated. Live tokens are revoked.",
            ok: 'Suspend client',
            tone: 'bad',
            reason: { ...REASON, placeholder: 'e.g. The bank asked us to pause the integration' },
          }
        : {
            title: `Reactivate ${c.name}?`,
            text: 'The client can request tokens again with its current secret.',
            ok: 'Reactivate client',
            tone: 'brand',
            icon: 'power',
            reason: { ...REASON, placeholder: 'e.g. The bank confirmed the integration is safe' },
          },
    );
    if (!ok) return;
    this.busy.set('status');
    try {
      const r = await this.api.update(c, {
        status: on ? 'INACTIVE' : 'ACTIVE',
        reason: ok.reason ?? null,
      });
      this.changed.emit(r);
      this.overlays.toast(`${c.name} ${on ? 'suspended' : 'reactivated'}`, {
        sub: on ? 'Live tokens revoked' : 'It can request tokens again',
      });
      void this.load();
    } catch (e) {
      this.refused('Not changed', e);
    } finally {
      this.busy.set('');
    }
  }

  /** INT-004: a new secret, shown once; the previous one works for the configured overlap. */
  protected async rotate() {
    if (this.editWhy() || this.busy()) return;
    const c = this.client();
    const ok = await this.overlays.confirm({
      title: `Rotate the secret of ${c.name}?`,
      text: 'A new secret is issued now. The current secret keeps working for the overlap set in the platform settings, then stops — the partner must switch to the new secret before then.',
      ok: 'Rotate secret',
      tone: 'bad',
    });
    if (!ok) return;
    this.busy.set('rotate');
    try {
      const r = await this.api.rotate(c.id);
      this.secret.emit({
        clientId: c.clientId,
        secret: r.secret,
        rotated: true,
        previousValidUntil: r.previousSecretValidUntil,
      });
      // The rotation changed the client's version: the page reloads it.
      this.changed.emit(null);
    } catch (e) {
      this.refused('Not rotated', e);
    } finally {
      this.busy.set('');
    }
  }

  /** INT-006: end every live token now, with a reason. */
  protected async revoke() {
    if (this.revokeWhy() || this.busy()) return;
    const c = this.client();
    const ok = await this.overlays.confirm({
      title: `End the live tokens of ${c.name}?`,
      text: 'Calls made with them are refused straight away. The partner can request a new token with its secret.',
      ok: 'End live tokens',
      tone: 'warn',
      reason: { ...REASON, placeholder: 'e.g. A token was logged by the partner by mistake' },
    });
    if (!ok) return;
    this.busy.set('revoke');
    try {
      await this.api.revokeTokens(c.id, ok.reason ?? '');
      this.overlays.toast('Live tokens ended', { sub: c.name });
      void this.load();
    } catch (e) {
      this.refused('Not ended', e);
    } finally {
      this.busy.set('');
    }
  }

  protected expires(t: TokenRecord) {
    const s = tokenState(t);
    return s && t.expiresAt ? `${formatTime(t.expiresAt)} · ${s}` : '—';
  }
  protected refusal(r: string | null) {
    return refusalLabel(r);
  }
  protected scope(s: string) {
    return scopeLabel(s);
  }
  protected count(n: number, w: string) {
    return plural(n, w);
  }
  protected date(v: string) {
    return formatDate(v);
  }
  protected dt(v: string) {
    return formatDateTime(v);
  }
}
