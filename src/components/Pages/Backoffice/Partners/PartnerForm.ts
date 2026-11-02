import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  type OnInit,
} from '@angular/core';
import { Dropdown } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { PARTNERS, SCOPE_GROUPS, SCOPES, allowLines, validAllowEntry } from './partner-format';
import { PartnersApi, type ApiClient, type PartnerKind } from './partners.api';

type Field = 'name' | 'partner' | 'scopes' | 'ips' | 'clientId' | 'secretHash';

/** The new client: what the page needs to show the secret once. */
export interface CreatedClient {
  readonly id: string;
  readonly clientId: string;
  readonly name: string;
  readonly secret: string;
}

const NAME_MAX = 100;

/**
 * The prototype's client form (apiForm) as the "New API client" modal (INT-002) and the "Scopes and
 * IPs" modal (INT-003, If-Match): name and partner for a new client, the scopes by group, and the
 * IP allowlist one address or IPv4 range per line. The server checks everything again.
 */
@Component({
  selector: 'rp-partner-form',
  imports: [Dropdown, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="
        client()
          ? 'Scopes and IPs · ' + client()!.name
          : importing()
            ? 'Import an existing client'
            : 'New API client'
      "
      [sub]="sub()"
      [icon]="client() ? null : 'plug'"
      [wide]="true"
      (closed)="closed.emit()"
    >
      <div class="stack g12">
        @if (!client()) {
          <div class="c-form">
            <div class="fld full" [class.invalid]="err('name')">
              <label class="fld-l" for="ob-ac-n">Client name<span class="req">*</span></label>
              <div class="fld-in">
                <input
                  id="ob-ac-n"
                  name="ob-ac-n"
                  type="text"
                  placeholder="e.g. Sponsor bank — campus virtual accounts"
                  autocomplete="off"
                  aria-describedby="ob-ac-n-e"
                  [attr.maxlength]="nameMax"
                  [value]="name()"
                  (input)="setName($event)"
                />
              </div>
              <div class="fld-e" id="ob-ac-n-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('name') }}</span>
              </div>
            </div>
            <div class="fld full" [class.invalid]="err('partner')">
              <label class="fld-l" for="ob-ac-p-b">Partner<span class="req">*</span></label>
              <rp-dd
                inputId="ob-ac-p"
                placeholder="Choose the kind of partner"
                [options]="partners"
                [value]="partner()"
                (changed)="setPartner($event)"
              />
              <div class="fld-e" id="ob-ac-p-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('partner') }}</span>
              </div>
            </div>
            @if (importing()) {
              <div class="fld full" [class.invalid]="err('clientId')">
                <label class="fld-l" for="ob-ac-cid">Client ID<span class="req">*</span></label>
                <div class="fld-in">
                  <input
                    id="ob-ac-cid"
                    type="text"
                    maxlength="40"
                    autocomplete="off"
                    spellcheck="false"
                    translate="no"
                    placeholder="The client id the partner already has, e.g. AXISBANKEC_6BBFE1A3"
                    [value]="clientId()"
                    (input)="clientId.set(val($event)); clearField('clientId')"
                  />
                </div>
                <div class="fld-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('clientId') }}</span>
                </div>
              </div>
              <div class="fld full" [class.invalid]="err('secretHash')">
                <label class="fld-l" for="ob-ac-hash"
                  >Secret hash (bcrypt)<span class="req">*</span></label
                >
                <div class="fld-in">
                  <input
                    id="ob-ac-hash"
                    type="text"
                    maxlength="100"
                    autocomplete="off"
                    spellcheck="false"
                    translate="no"
                    placeholder="$2b$12$…"
                    [value]="secretHash()"
                    (input)="secretHash.set(val($event)); clearField('secretHash')"
                  />
                </div>
                <div class="fld-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('secretHash') }}</span>
                </div>
                <div class="fld-h">
                  The hash the earlier application stored. The partner keeps its secret; CampusOne
                  checks it against this hash. Such a client calls the bank APIs (token, validate,
                  notify) only.
                </div>
              </div>
            }
          </div>
        }
        <div>
          <div class="fld-l" style="margin-bottom: 8px">Scopes <span class="req">*</span></div>
          @for (g of groups; track g.g) {
            <div class="eyebrow" style="margin: 8px 0 4px">{{ g.g }}</div>
            <div class="ob-cgrid">
              @for (s of g.list; track s.id) {
                <label class="chk"
                  ><input
                    type="checkbox"
                    [id]="'ob-ac-s-' + key(s.id)"
                    [checked]="scopes().includes(s.id)"
                    (change)="toggle(s.id)"
                  /><span
                    ><span class="t-mono t-sm">{{ s.id }}</span
                    >{{ ' ' }}<span class="t-xs t-muted">{{ s.l }}</span></span
                  ></label
                >
              }
            </div>
          }
          <div class="fld" [class.invalid]="err('scopes')">
            <div class="fld-e" id="ob-ac-scopes-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('scopes') }}</span>
            </div>
          </div>
        </div>
        <div class="fld" [class.invalid]="err('ips')">
          <label class="fld-l" for="ob-ac-ip">IP allowlist<span class="req">*</span></label>
          <div class="fld-in">
            <textarea
              id="ob-ac-ip"
              name="ob-ac-ip"
              rows="3"
              placeholder="One IPv4 address or CIDR range per line, e.g. 203.0.113.10 or 192.0.2.40/29"
              aria-describedby="ob-ac-ip-e"
              [value]="ips()"
              (input)="setIps($event)"
            ></textarea>
          </div>
          <div class="fld-e" id="ob-ac-ip-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('ips') }}</span>
          </div>
        </div>
        @if (formError()) {
          <div class="note tone-bad">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ formError() }}</div>
          </div>
        }
      </div>
      <ng-container modal-foot>
        <button type="button" class="btn btn-sec" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        @if (client()) {
          <button
            type="button"
            class="btn btn-pri"
            id="ob-ac-save"
            [class.is-busy]="busy()"
            [disabled]="busy()"
            (click)="save()"
          >
            <span>Save</span>
          </button>
        } @else if (importing()) {
          <button
            type="button"
            class="btn btn-pri"
            id="ob-ac-import"
            [class.is-busy]="busy()"
            [disabled]="busy()"
            (click)="importIt()"
          >
            <rp-icon name="key" [size]="17" /><span>Import client</span>
          </button>
        } @else {
          <button
            type="button"
            class="btn btn-pri"
            id="ob-ac-create"
            [class.is-busy]="busy()"
            [disabled]="busy()"
            (click)="create()"
          >
            <rp-icon name="key" [size]="17" /><span>Create client</span>
          </button>
        }
      </ng-container>
    </rp-modal>
  `,
})
export class PartnerForm implements OnInit {
  private readonly api = inject(PartnersApi);
  private readonly overlays = inject(Overlays);

  /** The client whose scopes and IPs change; null for a new client. */
  readonly client = input<ApiClient | null>(null);
  /** The other clients' names (the server checks again: INT.CLIENT_NAME_TAKEN). */
  readonly names = input<readonly string[]>([]);
  /** The token lifetime, for the explanation under the title. */
  readonly minutes = input(15);
  /** Import a client created elsewhere (INT-009) instead of creating one. */
  readonly importing = input(false);
  readonly closed = output<void>();
  readonly imported = output<ApiClient>();
  readonly created = output<CreatedClient>();
  readonly saved = output<ApiClient>();
  /** The client changed elsewhere (412 / 428): the page reloads it. */
  readonly stale = output<void>();

  protected readonly partners = PARTNERS;
  protected readonly groups = SCOPE_GROUPS;
  protected readonly nameMax = NAME_MAX;

  protected readonly name = signal('');
  protected readonly partner = signal<PartnerKind | ''>('');
  protected readonly scopes = signal<readonly string[]>([]);
  protected readonly ips = signal('');
  protected readonly clientId = signal('');
  protected readonly secretHash = signal('');
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly formError = signal('');
  protected readonly busy = signal(false);

  protected readonly sub = computed(() =>
    this.client()
      ? `Narrowing scopes or IPs takes effect on the next call; live tokens keep their old scopes until they expire (at most ${this.minutes()} minutes).`
      : this.importing()
        ? `For a partner that already has a client id and secret from the earlier application. Tokens last ${this.minutes()} minutes.`
        : `The client gets a client id and a secret for the client-credentials grant. Tokens last ${this.minutes()} minutes.`,
  );

  ngOnInit() {
    const c = this.client();
    if (c) {
      this.scopes.set([...c.scopes]);
      this.ips.set(c.ipAllowlist.join('\n'));
    }
  }

  protected err(f: Field) {
    return this.errors()[f] ?? '';
  }
  private clear(f: Field) {
    if (this.errors()[f]) this.errors.set({ ...this.errors(), [f]: '' });
    this.formError.set('');
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected clearField(f: Field) {
    this.clear(f);
  }
  protected key(id: string) {
    return id.replace(/\W/g, '_');
  }
  protected setName(e: Event) {
    this.name.set((e.target as HTMLInputElement).value);
    this.clear('name');
  }
  protected setPartner(v: string) {
    this.partner.set(v as PartnerKind);
    this.clear('partner');
  }
  protected setIps(e: Event) {
    this.ips.set((e.target as HTMLTextAreaElement).value);
    this.clear('ips');
  }
  protected toggle(id: string) {
    const on = this.scopes().includes(id);
    // Keep the register's order, whatever the order of the clicks.
    this.scopes.set(
      SCOPES.map((s) => s.id).filter((s) => (s === id ? !on : this.scopes().includes(s))),
    );
    this.clear('scopes');
  }

  /** The prototype's checks (apiRead): every field at once, so all mistakes show together. */
  private check(): { ok: boolean; ips: string[] } {
    const e: Partial<Record<Field, string>> = {};
    const ips = allowLines(this.ips());
    if (!this.client()) {
      const n = this.name().trim();
      if (!n) e.name = 'Name the client';
      else if (this.names().some((x) => x.trim().toLowerCase() === n.toLowerCase())) {
        e.name = translate('INT.CLIENT_NAME_TAKEN');
      }
      if (!this.partner()) e.partner = 'Choose the partner';
      if (this.importing()) {
        if (!/^[A-Za-z0-9_.-]{4,40}$/.test(this.clientId().trim())) {
          e.clientId = 'Enter the client id as the partner has it (letters, digits, _ . -)';
        }
        if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(this.secretHash().trim())) {
          e.secretHash = translate('INT.SECRET_HASH_FORMAT');
        }
      }
    }
    if (!this.scopes().length) {
      e.scopes = 'Choose at least one scope — a client can call only what its scopes allow';
    }
    const bad = ips.filter((x) => !validAllowEntry(x));
    if (!ips.length) e.ips = 'Add at least one IP address';
    else if (bad.length) e.ips = `Not a valid IPv4 address or range: ${bad.join(', ')}`;
    this.errors.set(e);
    return { ok: Object.keys(e).length === 0, ips };
  }

  /** Field errors from the server (INT.CLIENT_NAME_TAKEN, INT.SCOPE_UNKNOWN, ipAllowlist.<i>). */
  private refused(e: unknown, ips: readonly string[], title: string) {
    if (!(e instanceof ApiProblem)) {
      this.formError.set(translate('GEN.UNAVAILABLE'));
      return;
    }
    const out: Partial<Record<Field, string>> = {};
    if (e.code === 'INT.CLIENT_NAME_TAKEN') out.name = e.detail;
    if (e.code === 'INT.SCOPE_UNKNOWN') out.scopes = e.detail;
    if (e.code === 'INT.CLIENT_ID_TAKEN') out.clientId = e.detail;
    for (const x of e.errors) {
      if (x.field === 'clientId' || x.field === 'secretHash') out[x.field] = x.message;
    }
    const badIps = e.errors
      .filter((x) => x.field.startsWith('ipAllowlist'))
      .map((x) => ips[Number(x.field.split('.')[1])])
      .filter((x): x is string => !!x);
    if (badIps.length) out.ips = `Not a valid IPv4 address or range: ${badIps.join(', ')}`;
    const nameErr = e.errors.find((x) => x.field === 'name');
    if (nameErr) out.name = nameErr.message;
    if (Object.keys(out).length) {
      this.errors.set({ ...this.errors(), ...out });
      return;
    }
    this.overlays.toast(title, { sub: e.detail, tone: 'bad' });
    if (e.status === 412 || e.status === 428) this.stale.emit();
    else this.formError.set(e.detail);
  }

  protected async create() {
    if (this.busy()) return;
    const r = this.check();
    if (!r.ok) return;
    this.busy.set(true);
    const name = this.name().trim().replace(/\s+/g, ' ');
    try {
      const c = await this.api.create({
        name,
        partner: this.partner() as PartnerKind,
        scopes: this.scopes(),
        ipAllowlist: r.ips,
      });
      this.created.emit({ id: c.id, clientId: c.clientId, name, secret: c.secret });
    } catch (e) {
      this.refused(e, r.ips, 'Not created');
    } finally {
      this.busy.set(false);
    }
  }

  protected async importIt() {
    if (this.busy()) return;
    const r = this.check();
    if (!r.ok) return;
    this.busy.set(true);
    try {
      const c = await this.api.importClient({
        name: this.name().trim().replace(/\s+/g, ' '),
        partner: this.partner() as PartnerKind,
        clientId: this.clientId().trim(),
        secretHash: this.secretHash().trim(),
        scopes: this.scopes(),
        ipAllowlist: r.ips,
      });
      this.imported.emit(c);
    } catch (e) {
      this.refused(e, r.ips, 'Not imported');
    } finally {
      this.busy.set(false);
    }
  }

  protected async save() {
    const c = this.client();
    if (!c || this.busy()) return;
    const r = this.check();
    if (!r.ok) return;
    const ok = await this.overlays.confirm({
      title: `Save changes to ${c.name}?`,
      text: `Scopes: ${this.scopes().join(', ')}. IPs: ${r.ips.join(', ')}.`,
      ok: 'Save',
      icon: 'edit',
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      const saved = await this.api.update(c, { scopes: this.scopes(), ipAllowlist: r.ips });
      this.saved.emit(saved);
    } catch (e) {
      this.refused(e, r.ips, 'Not saved');
    } finally {
      this.busy.set(false);
    }
  }
}
