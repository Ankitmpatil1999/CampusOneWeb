import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Card, Empty } from '../../../Shared/Blocks';
import { Dropdown } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate, formatDateTime } from '../../../Utils/format';
import { PATTERNS } from '../../../Utils/patterns';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { PortalApi, type ContactInput, type InstitutionDetails } from '../portal.api';
import { PortalStore } from '../portal.store';
import { Field, PageHead } from '../Shared/PortalUi';

interface Contacts {
  pn: string;
  pe: string;
  pp: string;
  sn: string;
  se: string;
  sp: string;
}
type ChangeField = 'NAME' | 'ADDRESS' | 'BOARD';

const PERSON = /^[A-Za-z][A-Za-z .'-]*$/;
const FIELD: Readonly<Record<string, keyof Contacts>> = {
  'primaryContact.name': 'pn',
  'primaryContact.email': 'pe',
  'primaryContact.mobile': 'pp',
  'secondaryContact.name': 'sn',
  'secondaryContact.email': 'se',
  'secondaryContact.mobile': 'sp',
};
const REQUEST_STATUS: Readonly<Record<string, string>> = {
  PENDING: 'Sent to CampusOne',
  APPROVED: 'Applied',
  REJECTED: 'Declined',
};

/**
 * s.details — institution details (FR-INS-01…03/06, OI-ONB-01; SAS-020, SAS-021, SAS-047; prototype
 * s.details): the identifier, name, address and board (changed by CampusOne on request), bank
 * references, the administrator, and the two contacts the institution keeps itself.
 */
@Component({
  selector: 'rp-portal-details',
  imports: [Card, Dropdown, Empty, Field, Icon, Modal, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-sp-head
      title="Institution details"
      sub="Contacts you can change yourself. Name and address are part of your identifier, so CampusOne changes them on request."
    />
    @if (error()) {
      <div class="card pad">
        <rp-empty icon="wifioff" title="Couldn't load the details" [text]="error()" />
      </div>
    } @else if (data(); as d) {
      <div class="c-grid k2" style="align-items: start">
        <div class="stack g14">
          <div class="fs">
            <h4>
              <rp-icon name="building" [size]="15" /> Institution <span class="grow"></span>
              <button type="button" class="btn btn-ghost btn-sm" (click)="openRequest()">
                <rp-icon name="edit" [size]="15" /><span>Request a change</span>
              </button>
            </h4>
            <div class="fs-b">
              <dl class="kv">
                <dt>Identifier</dt>
                <dd>
                  <span class="t-mono">{{ d.identifier }}</span>
                  <span class="srs" title="SRS reference">FR-INS-02</span>
                </dd>
                <dt>Name</dt>
                <dd>{{ d.name }}</dd>
                <dt>Address</dt>
                <dd>{{ address(d) }}</dd>
                <dt>Board</dt>
                <dd>{{ d.board ?? '—' }}</dd>
                <dt>Registered</dt>
                <dd>
                  {{ d.registeredAt ? date(d.registeredAt) + ' · ' : ''
                  }}{{ d.signupSource === 'PORTAL' ? 'Self-serve portal' : 'Operator' }}
                </dd>
              </dl>
            </div>
          </div>
          @if (d.changeRequests.length) {
            <rp-card title="Change requests" icon="inbox" [plainIcon]="true" [flush]="true">
              <div class="list plain" style="padding: 0 14px">
                @for (r of d.changeRequests; track r.id) {
                  <div class="li">
                    <span class="li-ic sm"><rp-icon name="edit" [size]="16" /></span>
                    <span class="li-main"
                      ><span class="li-t wrap">{{ r.summary }}</span
                      ><span class="li-s wrap"
                        >{{ r.no }} · {{ dt(r.at) }} · {{ requestStatus(r.status)
                        }}{{ r.remarks ? ' — ' + r.remarks : '' }}</span
                      ></span
                    >
                  </div>
                }
              </div>
            </rp-card>
          }
          <div class="fs">
            <h4>
              <rp-icon name="bank" [size]="15" /> Bank references
              <span class="srs" title="SRS reference">FR-INS-06</span>
            </h4>
            <div class="fs-b">
              <dl class="kv">
                <dt>Corporate code</dt>
                <dd>
                  @if (d.bank.corporateCode) {
                    <span class="t-mono">{{ d.bank.corporateCode }}</span>
                  } @else {
                    Being set up by CampusOne
                  }
                </dd>
                <dt>Pool account</dt>
                <dd>
                  @if (d.bank.poolAccount) {
                    <span class="t-mono">{{ d.bank.poolAccount }}</span>
                  } @else {
                    Being set up by CampusOne
                  }
                </dd>
                <dt>Fee account</dt>
                <dd>
                  @if (d.bank.feeAccount) {
                    {{ d.bank.feeAccount }}
                  } @else {
                    <button type="button" class="linkbtn" (click)="go('/portal/step/feeacct')">
                      Set it up
                    </button>
                  }
                </dd>
              </dl>
            </div>
          </div>
          <div class="fs">
            <h4><rp-icon name="key" [size]="15" /> Administrator</h4>
            <div class="fs-b">
              <dl class="kv">
                <dt>CampusOne account</dt>
                <dd>
                  <span class="t-mono">{{ d.administrator?.email ?? '—' }}</span>
                </dd>
              </dl>
              <p class="t-xs t-muted mt8">
                More administrators and console roles are added from the institution console. One
                CampusOne account can belong to several institutions; the console asks which one to
                open at sign-in.
              </p>
            </div>
          </div>
        </div>
        <div class="fs">
          <h4><rp-icon name="users" [size]="15" /> Contacts</h4>
          <div class="fs-b stack g14">
            <p class="t-sm t-muted">
              Lifecycle notices and invoices go to both contacts
              <span class="srs" title="SRS reference">FR-SAS-11</span>.
            </p>
            @let f = form();
            <div class="eyebrow">Primary contact</div>
            <rp-sp-fld fid="sp-dc-pn" label="Name" [req]="true" [error]="err('pn')">
              <input
                id="sp-dc-pn"
                maxlength="60"
                aria-describedby="sp-dc-pn-e"
                [value]="f.pn"
                (input)="set('pn', $event)"
              />
            </rp-sp-fld>
            <div class="c-form">
              <rp-sp-fld fid="sp-dc-pe" label="E-mail" [req]="true" [error]="err('pe')">
                <input
                  id="sp-dc-pe"
                  type="email"
                  maxlength="254"
                  aria-describedby="sp-dc-pe-e"
                  [value]="f.pe"
                  (input)="set('pe', $event)"
                />
              </rp-sp-fld>
              <rp-sp-fld fid="sp-dc-pp" label="Mobile" [req]="true" [error]="err('pp')">
                <input
                  id="sp-dc-pp"
                  inputmode="numeric"
                  maxlength="10"
                  aria-describedby="sp-dc-pp-e"
                  [value]="f.pp"
                  (input)="set('pp', $event, true)"
                />
              </rp-sp-fld>
            </div>
            <div class="eyebrow mt8">
              Secondary contact
              <span
                class="t-faint"
                style="text-transform: none; letter-spacing: 0; font-weight: 500"
                >(optional)</span
              >
            </div>
            <rp-sp-fld fid="sp-dc-sn" label="Name" [error]="err('sn')">
              <input
                id="sp-dc-sn"
                maxlength="60"
                aria-describedby="sp-dc-sn-e"
                [value]="f.sn"
                (input)="set('sn', $event)"
              />
            </rp-sp-fld>
            <div class="c-form">
              <rp-sp-fld fid="sp-dc-se" label="E-mail" [error]="err('se')">
                <input
                  id="sp-dc-se"
                  type="email"
                  maxlength="254"
                  aria-describedby="sp-dc-se-e"
                  [value]="f.se"
                  (input)="set('se', $event)"
                />
              </rp-sp-fld>
              <rp-sp-fld fid="sp-dc-sp" label="Mobile" [error]="err('sp')">
                <input
                  id="sp-dc-sp"
                  inputmode="numeric"
                  maxlength="10"
                  aria-describedby="sp-dc-sp-e"
                  [value]="f.sp"
                  (input)="set('sp', $event, true)"
                />
              </rp-sp-fld>
            </div>
            <div class="row" style="justify-content: flex-end">
              <button
                type="button"
                class="btn btn-pri"
                id="sp-dc-save"
                [class.is-busy]="saving()"
                (click)="saveContacts()"
              >
                <rp-icon name="check" [size]="17" /><span>Save contacts</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    } @else {
      <div class="c-grid k2" style="align-items: start">
        <div class="sk" style="height: 320px; border-radius: 16px"></div>
        <div class="sk" style="height: 420px; border-radius: 16px"></div>
      </div>
    }

    @if (requesting()) {
      <rp-modal
        title="Request a change"
        sub="CampusOne checks that name and address stay unique, then updates your identifier records."
        icon="edit"
        (closed)="requesting.set(false)"
      >
        <div class="stack g12">
          @if (requestError()) {
            <div class="note tone-bad" role="alert">
              <rp-icon name="alertc" [size]="17" />
              <div class="grow">{{ requestError() }}</div>
            </div>
          }
          <div class="fld">
            <label class="fld-l" for="sp-dr-w-b"
              >What should change?<span class="req">*</span></label
            >
            <rp-dd
              inputId="sp-dr-w"
              [options]="changeFields"
              [value]="change()"
              (changed)="change.set($any($event))"
            />
          </div>
          <rp-sp-fld fid="sp-dr-v" label="New value" [req]="true" [error]="newValueError()">
            <textarea
              id="sp-dr-v"
              rows="2"
              maxlength="200"
              aria-describedby="sp-dr-v-e"
              [value]="newValue()"
              (input)="newValue.set(value($event)); newValueError.set('')"
            ></textarea>
          </rp-sp-fld>
          <rp-sp-fld fid="sp-dr-r" label="Why" [req]="true" [error]="reasonError()">
            <input
              id="sp-dr-r"
              maxlength="200"
              placeholder="e.g. We moved to the new campus building"
              aria-describedby="sp-dr-r-e"
              [value]="reason()"
              (input)="reason.set(value($event)); reasonError.set('')"
            />
          </rp-sp-fld>
        </div>
        <ng-container modal-foot>
          <button type="button" class="btn btn-sec" (click)="requesting.set(false)">
            <span>Cancel</span>
          </button>
          <button
            type="button"
            class="btn btn-pri"
            id="sp-dr-send"
            [class.is-busy]="sending()"
            (click)="sendRequest()"
          >
            <rp-icon name="send" [size]="17" /><span>Send request</span>
          </button>
        </ng-container>
      </rp-modal>
    }
  `,
})
export class PortalDetails {
  private readonly api = inject(PortalApi);
  private readonly router = inject(Router);
  private readonly overlays = inject(Overlays);
  private readonly store = inject(PortalStore);

  protected readonly data = signal<InstitutionDetails | null>(null);
  protected readonly error = signal('');
  protected readonly form = signal<Contacts>({ pn: '', pe: '', pp: '', sn: '', se: '', sp: '' });
  protected readonly errors = signal<Partial<Record<keyof Contacts, string>>>({});
  protected readonly saving = signal(false);

  protected readonly changeFields = [
    { v: 'NAME', l: 'Institution name' },
    { v: 'ADDRESS', l: 'Address' },
    { v: 'BOARD', l: 'Board' },
  ];
  protected readonly requesting = signal(false);
  protected readonly change = signal<ChangeField>('ADDRESS');
  protected readonly newValue = signal('');
  protected readonly newValueError = signal('');
  protected readonly reason = signal('');
  protected readonly reasonError = signal('');
  protected readonly requestError = signal('');
  protected readonly sending = signal(false);

  constructor() {
    void this.load();
  }

  private async load() {
    try {
      this.fill(await this.api.details());
      this.error.set('');
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  private fill(d: InstitutionDetails) {
    this.data.set(d);
    const p = d.contacts.primary;
    const s = d.contacts.secondary;
    this.form.set({
      pn: p?.name ?? '',
      pe: p?.email ?? '',
      pp: p?.mobile ?? '',
      sn: s?.name ?? '',
      se: s?.email ?? '',
      sp: s?.mobile ?? '',
    });
    this.errors.set({});
  }

  protected value(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected date(v: string) {
    return formatDate(v);
  }
  protected dt(v: string) {
    return formatDateTime(v);
  }
  protected address(d: InstitutionDetails) {
    return [d.address, [d.city, d.pinCode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  }
  protected requestStatus(s: string) {
    return REQUEST_STATUS[s] ?? s;
  }
  protected go(path: string) {
    void this.router.navigateByUrl(path);
  }
  protected err(k: keyof Contacts) {
    return this.errors()[k] ?? '';
  }
  protected set(k: keyof Contacts, e: Event, numeric = false) {
    const el = e.target as HTMLInputElement;
    if (numeric) el.value = el.value.replace(/\D/g, '');
    this.form.update((f) => ({ ...f, [k]: el.value }));
    const next = { ...this.errors() };
    delete next[k];
    this.errors.set(next);
  }

  /** sp.det.save — the prototype's checks with the register's wording. */
  protected async saveContacts() {
    const d = this.data();
    if (!d || this.saving()) return;
    const f = this.form();
    const e: Partial<Record<keyof Contacts, string>> = {};
    const req = translate('VALIDATION.REQUIRED');
    const check = (n: 'pn' | 'sn', m: 'pe' | 'se', p: 'pp' | 'sp') => {
      if (!f[n].trim()) e[n] = req;
      else if (!PERSON.test(f[n].trim())) e[n] = translate('IDN.NAME_LETTERS_ONLY');
      if (!f[m].trim()) e[m] = req;
      else if (!PATTERNS.email.test(f[m].trim().toLowerCase()))
        e[m] = translate('VALIDATION.EMAIL');
      if (!f[p]) e[p] = req;
      else if (!PATTERNS.mobile.test(f[p])) e[p] = translate('VALIDATION.MOBILE');
    };
    check('pn', 'pe', 'pp');
    if (f.sn.trim() || f.se.trim() || f.sp) check('sn', 'se', 'sp');
    this.errors.set(e);
    if (Object.keys(e).length) return;
    const contact = (name: string, email: string, mobile: string): ContactInput => ({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      mobile,
    });
    const primary = contact(f.pn, f.pe, f.pp);
    const secondary = f.sn.trim() ? contact(f.sn, f.se, f.sp) : null;
    const same = (a: ContactInput | null, b: InstitutionDetails['contacts']['primary']) =>
      (!a && !b) ||
      (!!a &&
        !!b &&
        a.name === b.name &&
        a.email === (b.email ?? '') &&
        a.mobile === (b.mobile ?? ''));
    if (same(primary, d.contacts.primary) && same(secondary, d.contacts.secondary)) {
      this.overlays.toast('Nothing changed', { tone: 'info' });
      return;
    }
    this.saving.set(true);
    try {
      this.fill(
        await this.api.saveContacts(d.version, {
          primaryContact: primary,
          secondaryContact: secondary,
        }),
      );
      void this.store.refresh();
      this.overlays.toast('Contacts saved', { sub: 'Both contacts were told by e-mail' });
    } catch (x) {
      const fields = x instanceof ApiProblem ? x.errors.filter((y) => FIELD[y.field]) : [];
      if (fields.length) {
        this.errors.set(Object.fromEntries(fields.map((y) => [FIELD[y.field]!, y.message])));
      } else {
        this.overlays.toast('Contacts not saved', {
          sub: x instanceof ApiProblem ? x.detail : translate('GEN.UNAVAILABLE'),
          tone: 'bad',
        });
        if (x instanceof ApiProblem && (x.status === 412 || x.status === 428)) void this.load();
      }
    } finally {
      this.saving.set(false);
    }
  }

  /** sp.det.req */
  protected openRequest() {
    this.change.set('ADDRESS');
    this.newValue.set('');
    this.reason.set('');
    this.newValueError.set('');
    this.reasonError.set('');
    this.requestError.set('');
    this.requesting.set(true);
  }

  /** sp.det.send (SAS-021): CampusOne decides it in the platform approvals. */
  protected async sendRequest() {
    if (this.sending()) return;
    const value = this.newValue().trim();
    const reason = this.reason().trim();
    const min = this.change() === 'BOARD' ? 2 : 3;
    this.newValueError.set(
      !value
        ? translate('VALIDATION.REQUIRED')
        : value.length < min || value.length > 200
          ? translate('VALIDATION.FORMAT')
          : '',
    );
    this.reasonError.set(
      !reason
        ? translate('VALIDATION.REQUIRED')
        : reason.length < 5 || reason.length > 200
          ? translate('VALIDATION.FORMAT')
          : '',
    );
    if (this.newValueError() || this.reasonError()) return;
    this.sending.set(true);
    this.requestError.set('');
    try {
      await this.api.requestDetailsChange({ field: this.change(), value, reason });
      this.requesting.set(false);
      this.overlays.toast('Request sent', {
        sub: 'CampusOne replies by e-mail within one working day',
      });
      await this.load();
    } catch (e) {
      if (e instanceof ApiProblem && e.errors.length) {
        for (const x of e.errors) {
          if (x.field === 'value') this.newValueError.set(x.message);
          if (x.field === 'reason') this.reasonError.set(x.message);
        }
      } else {
        this.requestError.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
      }
    } finally {
      this.sending.set(false);
    }
  }
}
