import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SessionContext } from '../../../../Context/SessionContext';
import { Amount } from '../../../Shared/Amount';
import { Avatar } from '../../../Shared/Avatar';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate, formatDateTime, formatMobile, istBusinessDate } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { cleanTyped, onlyDigits } from '../../../Utils/typing';
import type { IdentityFix } from '../Applications/AppFields';
import type { Application } from '../Applications/applications.api';
import {
  InstitutionSetupApi,
  type CustomField,
  type UserType,
} from '../Institution/institution.api';
import { t12 } from '../Structure/academic-format';
import { MemberAdmission } from './MemberAdmission';
import {
  MembersApi,
  type AdmissionRecord,
  type ClassView,
  type CorrectionField,
  type HistoryItem,
  type MemberDetail,
  type MemberKind,
  type MemberList,
  type MemberRow,
  type MemberStatus,
  type TransactionPermission,
  type Wallet,
} from './members.api';
import { MemberConsoleAccess } from './MemberConsoleAccess';
import { MemberWallet, type PermissionState } from './MemberWallet';

type Tab = MemberKind | 'ALL';
type DrawerTab = 'profile' | 'admission' | 'status' | 'card' | 'account' | 'history';

const TABS: readonly { v: Tab; l: string }[] = [
  { v: 'STUDENTS', l: 'Students' },
  { v: 'PARENTS', l: 'Parents' },
  { v: 'STAFF', l: 'Staff & teachers' },
  { v: 'MERCHANTS', l: 'Merchants' },
  { v: 'ALL', l: 'All' },
];
const DRAWER_TABS: readonly { v: DrawerTab; l: string }[] = [
  { v: 'profile', l: 'Profile' },
  { v: 'admission', l: 'Admission' },
  { v: 'status', l: 'Status & wallet' },
  { v: 'card', l: 'Card & attendance' },
  { v: 'account', l: 'Account' },
  { v: 'history', l: 'History' },
];
const STATUS: Record<MemberStatus, { l: string; tone: string }> = {
  ACTIVE: { l: 'Active', tone: 'ok' },
  INACTIVE: { l: 'Inactive', tone: 'neutral' },
  SUSPENDED: { l: 'Suspended', tone: 'bad' },
};
const RELATION: Record<string, string> = {
  FATHER: 'Father',
  MOTHER: 'Mother',
  GUARDIAN: 'Guardian',
};
const GENDER: Record<string, string> = { MALE: 'Male', FEMALE: 'Female', OTHER: 'Other' };
const ACTION: Record<string, string> = {
  MEMBER_ONBOARDED: 'Onboarded',
  STAFF_ONBOARDED: 'Onboarded as staff',
  MEMBER_EDITED: 'Profile updated',
  MEMBER_ACTIVATED: 'Activated',
  MEMBER_DEACTIVATED: 'Deactivated',
  MEMBER_SUSPENDED: 'Suspended',
  MEMBER_SUSPENSION_REQUESTED: 'Suspension requested',
  MEMBER_DELINK_REQUESTED: 'De-link requested',
  MEMBER_DELINKED: 'De-linked',
  TXN_PERMISSION_GRANTED: 'Payments turned on',
  TXN_PERMISSION_REVOKED: 'Payments turned off',
  CONSOLE_ROLES_CHANGED: 'Console roles changed',
  SIGNIN_LOCK_RELEASED: 'Sign-in lock released',
};
/** BR-13: payments are allowed until someone turns them off. */
const PAYMENTS_ON: PermissionState = { enabled: true, reason: null, changedAt: null };
const PAGE = 14;
/** Names as the server accepts them: letters, spaces, full stops, apostrophes and hyphens. */
const PERSON = /^[A-Za-z.'-]+(?: [A-Za-z.'-]+)*$/;
const MAX_EVIDENCE = 2 * 1024 * 1024;
const EVIDENCE_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];

/** A display-only identity field (prototype piiList). */
interface PiiField {
  readonly k: CorrectionField;
  readonly l: string;
  /** The stored value (DOB as YYYY-MM-DD, gender as MALE | FEMALE | OTHER). */
  readonly v: string;
  /** As shown. */
  readonly show: string;
}

interface CorrectionDraft {
  readonly m: MemberDetail;
  readonly field: CorrectionField;
  readonly to: string;
  readonly why: string;
  readonly file: File | null;
}

/** Server field names → the modal's fields. */
const CORRECTION_ERRORS: Record<string, string> = {
  field: 'field',
  proposedValue: 'to',
  reason: 'why',
  evidenceFileId: 'ev',
};

/**
 * c.members — Members (SRS 6.20–6.22; IDN-044…046, IDN-054, IDN-055, IDN-058; prototype c.members
 * and its member drawer; CR-06, CR-08, CR-09, CR-12, CR-13). Tabs by kind of member, search and
 * filters, status pills, bulk activate / deactivate, and the drawer with profile, status, account
 * and history. "Status & wallet" shows the wallets, the statement (WAL-008/009) and the payments
 * switch (IDN-056); a staff member's Account tab holds their console roles and sign-in lock
 * (IDN-038, IDN-060…062). Cards and attendance arrive with their modules (Phases 4, 7). Identity
 * fields are display-only; a mistake is fixed with a correction request (IDN-057, CR-06) that an
 * Institution Administrator approves (or that applies at once when one raises it, ADR-0015).
 * "Admission" (MemberAdmission) shows the admission form a student was admitted with — from the
 * public form, the counsellor's desk or the bulk upload — or a parent's children's, with the
 * documents the family uploaded; the Institution Administrator edits it there.
 */
@Component({
  selector: 'rp-console-members',
  imports: [
    Amount,
    Avatar,
    Dropdown,
    Empty,
    Icon,
    MemberAdmission,
    MemberConsoleAccess,
    MemberWallet,
    Modal,
    PageHead,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Members"
        sub="Everyone at the institution. Members are never deleted — each is Active, Inactive or Suspended."
      >
        <button type="button" class="btn btn-sec" (click)="exportList()">
          <rp-icon name="download" [size]="17" /><span>Export</span>
        </button>
        @if (can('members.onboard') && !readOnly()) {
          <button type="button" class="btn btn-pri" (click)="router.navigate(['/console/onboard'])">
            <rp-icon name="userplus" [size]="17" /><span>Onboard member</span>
          </button>
        } @else {
          <span class="cp-why" [attr.title]="readOnly() || noTask"
            ><button type="button" class="btn btn-pri" disabled>
              <rp-icon name="userplus" [size]="17" /><span>Onboard member</span>
            </button></span
          >
        }
      </rp-page-head>

      <div class="tabs">
        @for (t of tabs; track t.v) {
          <button type="button" class="tab" [class.on]="tab() === t.v" (click)="setTab(t.v)">
            {{ t.l }}<span class="n">{{ num(data()?.counts?.tabs?.[t.v] ?? 0) }}</span>
          </button>
        }
      </div>

      <div class="c-filters">
        <label class="search"
          ><rp-icon name="search" [size]="16" /><input
            type="search"
            id="cp-mf-q"
            [placeholder]="
              tab() === 'MERCHANTS' ? 'Search merchants' : 'Search name, admission no., mobile'
            "
            [value]="q()"
            (input)="setQ($event)"
            autocomplete="off"
        /></label>
        @if (tab() === 'STUDENTS' || tab() === 'ALL') {
          <rp-dd
            inputId="cp-mf-cls"
            [options]="gradeOptions()"
            [value]="cls()"
            (changed)="setCls($event)"
          />
          <rp-dd
            inputId="cp-mf-sec"
            [options]="sectionOptions()"
            [value]="sec()"
            (changed)="setSec($event)"
          />
        }
        @if (tab() === 'STAFF') {
          <rp-dd
            inputId="cp-mf-ut"
            [options]="typeOptions()"
            [value]="ut()"
            (changed)="setUt($event)"
          />
        }
        @for (f of data()?.filters ?? []; track f.id) {
          <rp-dd
            [inputId]="'cp-mf-' + f.id"
            [options]="cfOptions(f)"
            [value]="cf()[f.id] ?? ''"
            (changed)="setCf(f.id, $event)"
          />
        }
        <div class="pills">
          <button type="button" class="pill" [class.on]="!status()" (click)="setStatus('')">
            All statuses
          </button>
          @for (s of statuses; track s) {
            <button type="button" class="pill" [class.on]="status() === s" (click)="setStatus(s)">
              {{ statusLabel(s) }}<span class="n">{{ data()?.counts?.statuses?.[s] ?? 0 }}</span>
            </button>
          }
        </div>
        @if (filtered()) {
          <button type="button" class="linkbtn cp-lk" (click)="clear()">
            <rp-icon name="x" [size]="13" /> Clear filters
          </button>
        }
        <span class="fsum">{{ summary() }}</span>
      </div>

      @if (selected().length) {
        <div class="bulkbar">
          <span>{{ selected().length }} selected</span><span class="grow"></span>
          @if (readOnly()) {
            <span class="t-xs" style="opacity: 0.8">{{ readOnly() }}</span>
          } @else {
            <button type="button" class="btn btn-sec btn-sm" (click)="bulk('ACTIVE')">
              <rp-icon name="usercheck" [size]="15" /><span>Activate</span>
            </button>
            <button type="button" class="btn btn-sec btn-sm" (click)="bulk('INACTIVE')">
              <rp-icon name="userx" [size]="15" /><span>Deactivate</span>
            </button>
          }
          <button type="button" class="btn btn-sec btn-sm" (click)="selected.set([])">
            <span>Clear</span>
          </button>
        </div>
      }

      @if (error()) {
        <div class="card pad">
          <rp-empty icon="alertc" title="Couldn't load the members" [text]="error()" />
        </div>
      } @else {
        <div class="tbl-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th class="c-chk">
                  <input
                    type="checkbox"
                    class="tbl-chk"
                    aria-label="Select all"
                    [checked]="allShownSelected()"
                    (change)="toggleAll()"
                  />
                </th>
                @for (c of columns(); track c.k) {
                  <th [class.r]="c.r">{{ c.l }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @if (loading() && !rows().length) {
                <tr>
                  <td [attr.colspan]="columns().length + 1">
                    <rp-empty icon="hourglass" title="Loading…" />
                  </td>
                </tr>
              }
              @for (m of shown(); track m.id) {
                <tr
                  tabindex="0"
                  [class.sel]="selected().includes(m.id)"
                  [class.cp-dim]="m.status !== 'ACTIVE'"
                  (click)="openMember(m.id)"
                  (keydown.enter)="openMember(m.id)"
                >
                  <td class="c-chk">
                    <input
                      type="checkbox"
                      class="tbl-chk"
                      aria-label="Select row"
                      [checked]="selected().includes(m.id)"
                      (click)="$event.stopPropagation()"
                      (change)="toggle(m.id)"
                    />
                  </td>
                  @for (c of columns(); track c.k) {
                    <td [class.r]="c.r">
                      @switch (c.k) {
                        @case ('name') {
                          <div class="cell-main">
                            <rp-av [name]="m.name" size="sm" />
                            <div style="min-width: 0">
                              <div class="cell-t">{{ m.name }}</div>
                              <div class="cell-s">
                                {{ m.kind === 'PARENTS' ? relationLabel(m.relation) : m.memberNo }}
                              </div>
                            </div>
                          </div>
                        }
                        @case ('admNo') {
                          <span class="t-mono">{{ m.admissionNo ?? '—' }}</span>
                        }
                        @case ('grade') {
                          @if (m.grade) {
                            {{ m.grade.class }}
                          } @else {
                            <span class="t-faint t-sm">No mapping for {{ year() }}</span>
                          }
                        }
                        @case ('section') {
                          @if (m.grade?.section) {
                            {{ m.grade!.section }}
                          } @else {
                            <span class="t-faint">—</span>
                          }
                        }
                        @case ('mobile') {
                          <span class="t-num">{{ mobile(m.mobile) }}</span>
                        }
                        @case ('children') {
                          @for (ch of m.children ?? []; track ch.id) {
                            <span class="tag"
                              >{{ ch.name }}{{ ch.grade ? ' · ' + ch.grade : '' }}</span
                            >{{ ' ' }}
                          }
                        }
                        @case ('empId') {
                          <span class="t-mono">{{ m.employeeNo ?? '—' }}</span>
                        }
                        @case ('type') {
                          {{ m.userType.name }}
                        }
                        @case ('dept') {
                          {{ m.department?.name ?? '—' }}
                        }
                        @case ('det') {
                          {{
                            m.grade
                              ? m.grade.class + ' ' + (m.grade.section ?? '')
                              : (m.department?.name ?? '—')
                          }}
                        }
                        @case ('id2') {
                          <span class="t-mono">{{ m.admissionNo ?? m.employeeNo ?? '—' }}</span>
                        }
                        @case ('status') {
                          <span class="chip dot" [class]="'chip dot tone-' + tone(m.status)">{{
                            statusLabel(m.status)
                          }}</span>
                          @if (m.pending.suspension) {
                            {{ ' '
                            }}<span class="chip tone-violet" title="Suspension awaiting approval"
                              ><rp-icon name="clock" [size]="11"
                            /></span>
                          }
                        }
                        @case ('wal') {
                          @if (m.wallet) {
                            <rp-amt [value]="m.wallet.balance" />
                          } @else {
                            <span class="t-faint">—</span>
                          }
                        }
                        @default {
                          @if (m.customFields[c.k]) {
                            {{ m.customFields[c.k] }}
                          } @else {
                            <span class="t-faint">—</span>
                          }
                        }
                      }
                    </td>
                  }
                </tr>
              } @empty {
                @if (!loading()) {
                  <tr>
                    <td [attr.colspan]="columns().length + 1">
                      <rp-empty
                        icon="users"
                        title="No members match these filters"
                        text="Try a different name or number, or clear the filters."
                      />
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
        @if (rows().length > pageSize || data()?.nextCursor) {
          <div class="pager">
            <span
              >Showing
              <b class="t-num"
                >{{ (page() - 1) * pageSize + 1 }}–{{ min(page() * pageSize, rows().length) }}</b
              >
              of <b class="t-num">{{ num(total()) }}</b></span
            >
            <div class="pg">
              <button
                type="button"
                [disabled]="page() <= 1"
                aria-label="Previous"
                (click)="page.set(page() - 1)"
              >
                <rp-icon name="left" [size]="14" />
              </button>
              @for (n of pages(); track n) {
                <button type="button" [class.on]="n === page()" (click)="page.set(n)">
                  {{ n }}
                </button>
              }
              <button
                type="button"
                [disabled]="page() >= pages().length && !data()?.nextCursor"
                aria-label="Next"
                (click)="next()"
              >
                <rp-icon name="right" [size]="14" />
              </button>
            </div>
          </div>
        } @else if (rows().length) {
          <div class="pager">
            <span>{{ summary() }}</span>
          </div>
        }
        <p class="t-xs t-muted">
          <rp-icon name="archive" [size]="12" /> There is no delete: a member who leaves is
          de-linked and becomes Inactive, and the record, wallet ledger and history are kept
          (CR-08). Grades and sections are for {{ year() }} (CR-13).
        </p>
      }
    </div>

    @if (member(); as m) {
      <rp-modal
        [title]="m.name"
        [sub]="m.userType.name + ' · ' + m.memberNo"
        [drawer]="true"
        (closed)="closeMember()"
      >
        <div class="stack g16">
          <div class="cp-msum">
            <rp-av [name]="m.name" size="lg" />
            <div class="grow">
              <div class="row g6 wrap">
                <span class="chip dot" [class]="'chip dot tone-' + tone(m.status)">{{
                  statusLabel(m.status)
                }}</span>
                @if (m.pending.suspension) {
                  <span class="chip tone-violet dot">Suspension awaiting approval</span>
                }
                @if (m.pending.delink) {
                  <span class="chip tone-violet dot">De-link awaiting approval</span>
                }
                @if (!m.account.linked) {
                  <span class="chip tone-neutral dot">Not linked to an account</span>
                }
                @if (!txn().enabled) {
                  <span class="chip tone-warn dot">Payments off</span>
                }
              </div>
              <div class="t-sm t-muted mt4">
                {{ detailOf(m) }}
                @if (m.admissionNo || m.employeeNo) {
                  · <span class="t-mono">{{ m.admissionNo ?? m.employeeNo }}</span>
                }
              </div>
            </div>
            <div class="cp-msum-k">
              <span class="t-xs t-muted">{{
                m.kind === 'MERCHANTS' ? 'Merchant wallet' : 'Campus wallet'
              }}</span>
              @if (m.wallet; as w) {
                <rp-amt [value]="w.balance" cls="t-b" />
              } @else {
                <span class="t-faint">—</span>
              }
            </div>
          </div>
          @if (readOnly()) {
            <div class="note tone-info">
              <rp-icon name="lock" [size]="17" />
              <div class="grow"><b>Read-only.</b> {{ readOnly() }}</div>
            </div>
          }
          <div class="tabs">
            @for (t of drawerTabs(); track t.v) {
              <button
                type="button"
                class="tab"
                [class.on]="dtab() === t.v"
                (click)="setDrawerTab(t.v)"
              >
                {{ t.l }}
              </button>
            }
          </div>
          <div class="stack g16 cp-mtab">
            @switch (dtab()) {
              @case ('profile') {
                <div class="fs cp-pii">
                  <h4>
                    <rp-icon name="lock" [size]="15" /> Personal identifying information
                    <span class="srs cr" title="Version 2.1 change request">CR-06</span>
                  </h4>
                  <div class="fs-b stack g12">
                    <p class="t-sm t-muted" style="line-height: 1.5">
                      These fields are display-only. A mistake is fixed with a correction request
                      that another administrator approves, and every correction stays on the
                      member's history.
                    </p>
                    <div class="c-form">
                      @for (f of piiList(m); track f.k) {
                        <div class="fld locked">
                          <label class="fld-l" [for]="'cp-pii-' + f.k">{{ f.l }}</label>
                          <div class="fld-in">
                            <input
                              [id]="'cp-pii-' + f.k"
                              type="text"
                              readonly
                              autocomplete="off"
                              placeholder="Not recorded"
                              [value]="f.show"
                            /><span
                              class="suf plain"
                              title="Display-only personal information (CR-06)"
                              ><rp-icon name="lock" [size]="15"
                            /></span>
                          </div>
                          <div class="fld-h">
                            <rp-icon name="lock" [size]="11" /> Display-only.
                            @if (editWhy()) {
                              Changes go through a correction request.
                            } @else {
                              <button
                                type="button"
                                class="linkbtn"
                                (click)="openCorrection(m, f.k)"
                              >
                                Request a correction
                              </button>
                            }
                          </div>
                        </div>
                      }
                      <div class="fld locked full">
                        <label class="fld-l" for="cp-pii-mobile">Mobile (account key)</label>
                        <div class="fld-in">
                          <input
                            id="cp-pii-mobile"
                            type="text"
                            readonly
                            autocomplete="off"
                            [value]="
                              m.contact.mobile ? mobile(m.contact.mobile) : 'No mobile on record'
                            "
                          /><span class="suf plain"><rp-icon name="lock" [size]="15" /></span>
                        </div>
                        <div class="fld-h">
                          The mobile number identifies the CampusOne account and can't be changed. A
                          person who loses their number moves to a new account through a supervised
                          transfer (OI-IDN-40).
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="fs">
                  <h4>
                    <rp-icon name="mail" [size]="15" /> Contact details
                    <span class="t-xs t-muted" style="font-weight: 500">editable</span>
                  </h4>
                  <div class="fs-b">
                    <div class="c-form">
                      <div class="fld" [class.invalid]="err('email')">
                        <label class="fld-l" for="cp-ct-email"
                          >E-mail<span class="opt">(optional)</span></label
                        >
                        <div class="fld-in">
                          <input
                            id="cp-ct-email"
                            type="email"
                            placeholder="name@example.com"
                            [disabled]="!!editWhy()"
                            [value]="form().email"
                            (input)="patch('email', $event)"
                          />
                        </div>
                        <div class="fld-e" role="alert">
                          <rp-icon name="alertc" [size]="14" /><span>{{ err('email') }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="fs">
                  <h4><rp-icon name="building" [size]="15" /> At {{ shortName() }}</h4>
                  <div class="fs-b stack g12">
                    <div class="c-form">
                      <div class="fld">
                        <label class="fld-l" for="cp-m-dept-b">Department</label>
                        <rp-dd
                          inputId="cp-m-dept"
                          [options]="deptOptions(m)"
                          [value]="form().departmentId"
                          [disabled]="!!editWhy()"
                          (changed)="patchValue('departmentId', $event)"
                        />
                      </div>
                      @if (m.kind === 'STUDENTS') {
                        <div class="fld">
                          <label class="fld-l" for="cp-m-sec-b"
                            >Grade & section · {{ year() }}</label
                          >
                          <rp-dd
                            inputId="cp-m-sec"
                            [options]="allSections()"
                            [value]="form().sectionId"
                            [disabled]="!!editWhy()"
                            (changed)="patchValue('sectionId', $event)"
                          />
                        </div>
                      }
                    </div>
                    <dl class="kv">
                      <dt>User type</dt>
                      <dd>{{ m.userType.name }}</dd>
                      <dt>Joined</dt>
                      <dd>{{ m.joinedOn ? date(m.joinedOn) : '—' }}</dd>
                      @for (g of m.guardians; track g.id) {
                        <dt>{{ relationLabel(g.relation) }}</dt>
                        <dd>
                          <button type="button" class="linkbtn" (click)="openMember(g.id)">
                            {{ g.name }}
                          </button>
                          {{ g.mobile ? ' · ' + mobile(g.mobile) : '' }}
                        </dd>
                      }
                      @if (m.wards.length) {
                        <dt>Children</dt>
                        <dd>
                          @for (w of m.wards; track w.id) {
                            <button type="button" class="linkbtn" (click)="openMember(w.id)">
                              {{ w.name }}</button
                            >{{ w.grade ? ' · ' + w.grade : '' }}<br />
                          }
                        </dd>
                      }
                      @if (m.roles.length) {
                        <dt>Console roles</dt>
                        <dd>{{ roleNames(m) }}</dd>
                      }
                    </dl>
                  </div>
                </div>
                @if ((m.kind === 'STUDENTS' || m.kind === 'STAFF') && m.transport; as tr) {
                  <!-- The student's school transport (client 2026-10-15). -->
                  <div class="fs" id="cp-transport">
                    <h4><rp-icon name="bus" [size]="15" /> School transport</h4>
                    <div class="fs-b stack g12">
                      @if (tr.allocation; as a) {
                        <dl class="kv">
                          <dt>Route</dt>
                          <dd>{{ a.route.code }} · {{ a.route.name }}</dd>
                          <dt>Stop</dt>
                          <dd>
                            {{ a.stop.name }}{{ a.stop.landmark ? ' — ' + a.stop.landmark : '' }}
                          </dd>
                          <dt>Pick-up time</dt>
                          <dd>{{ a.pickUp ? t12(a.pickUp) : '—' }}</dd>
                          <dt>Drop time</dt>
                          <dd>{{ a.drop ? t12(a.drop) : '—' }}</dd>
                          <dt>Allocated</dt>
                          <dd>
                            {{ a.from ? date(a.from) : '—' }} to {{ a.to ? date(a.to) : '—' }}
                          </dd>
                        </dl>
                        @if (tr.trips.length) {
                          <div class="tbl-wrap">
                            <table class="tbl" id="cp-trips">
                              <thead>
                                <tr>
                                  <th>Today's trip</th>
                                  <th>Vehicle</th>
                                  <th>Driver</th>
                                  <th>Attendant</th>
                                </tr>
                              </thead>
                              <tbody>
                                @for (x of tr.trips; track $index) {
                                  <tr>
                                    <td>{{ x.session }} · {{ t12(x.startTime) }}</td>
                                    <td>{{ x.vehicle.name }} · {{ x.vehicle.registration }}</td>
                                    <td>
                                      {{ x.driver.name }}
                                      @if (x.driver.mobile) {
                                        <div class="t-xs t-muted">
                                          {{ mobile(x.driver.mobile) }}
                                        </div>
                                      }
                                    </td>
                                    <td>{{ x.attendant ?? '—' }}</td>
                                  </tr>
                                }
                              </tbody>
                            </table>
                          </div>
                        } @else {
                          <p class="t-sm t-muted">
                            No vehicle or crew is assigned to this route today.
                          </p>
                        }
                      } @else {
                        <p class="t-sm t-muted" id="cp-no-transport">
                          Not allocated to a school bus route.
                        </p>
                      }
                    </div>
                  </div>
                }
                @if (m.customFields.length) {
                  <div class="fs cm-cf">
                    <h4><rp-icon name="field" [size]="16" /> Institution fields</h4>
                    <div class="fs-b">
                      <div class="c-form">
                        @for (f of m.customFields; track f.id) {
                          <div
                            class="fld"
                            [class.invalid]="err('customFields.' + f.id)"
                            [class.full]="f.type === 'LONG_TEXT' || f.type === 'MULTI_SELECT'"
                          >
                            <label class="fld-l" [for]="'cf-' + f.id"
                              >{{ f.label }}
                              @if (f.required) {
                                <span class="req">*</span>
                              } @else {
                                <span class="opt">(optional)</span>
                              }
                            </label>
                            @if (f.type === 'DROPDOWN' || f.type === 'YES_NO') {
                              <rp-dd
                                [inputId]="'cf-' + f.id"
                                [options]="fieldOptions(f)"
                                [value]="cfText(f.id)"
                                [disabled]="!!editWhy()"
                                (changed)="setField(f.id, $event)"
                              />
                            } @else if (f.type === 'MULTI_SELECT') {
                              <div class="row g8 wrap">
                                @for (o of f.options; track o) {
                                  <label class="chk"
                                    ><input
                                      type="checkbox"
                                      [checked]="multiHas(f.id, o)"
                                      [disabled]="!!editWhy()"
                                      (change)="toggleMulti(f.id, o)"
                                    /><span>{{ o }}</span></label
                                  >
                                }
                              </div>
                            } @else {
                              <div class="fld-in">
                                <input
                                  [id]="'cf-' + f.id"
                                  [type]="inputType(f.type)"
                                  [disabled]="!!editWhy()"
                                  [value]="cfText(f.id)"
                                  (input)="setFieldFromInput(f.id, $event, f.type)"
                                />
                              </div>
                            }
                            <div class="fld-e" role="alert">
                              <rp-icon name="alertc" [size]="14" /><span>{{
                                err('customFields.' + f.id)
                              }}</span>
                            </div>
                          </div>
                        }
                      </div>
                    </div>
                  </div>
                }
              }
              @case ('admission') {
                <rp-member-admission
                  [member]="m"
                  [records]="admission()"
                  [error]="admissionError()"
                  [classes]="classes()"
                  [fields]="appFields()"
                  [why]="editWhy()"
                  (changed)="admissionChanged($event)"
                  (retry)="loadAdmission(m.id)"
                  (correct)="correctFrom(m, $event)"
                  (openMember)="openMember($event)"
                />
              }
              @case ('status') {
                <div class="fs">
                  <h4><rp-icon name="user" [size]="15" /> Member status</h4>
                  <div class="fs-b stack g12">
                    <div class="row g12">
                      <span class="chip dot lg" [class]="'chip dot lg tone-' + tone(m.status)">{{
                        statusLabel(m.status)
                      }}</span>
                      <span class="t-sm t-muted"
                        >{{ m.statusReason ? m.statusReason + ' · ' : '' }}since
                        {{ date((m.statusChangedAt ?? m.onboardedAt).slice(0, 10)) }}</span
                      >
                    </div>
                    @if (!m.account.linked && m.status === 'INACTIVE' && m.statusReason) {
                      <div class="note tone-neutral">
                        <rp-icon name="archive" [size]="17" />
                        <div class="grow">
                          De-linked. A de-linked member can't be reactivated — onboard them again if
                          they return.
                        </div>
                      </div>
                    } @else {
                      <div class="row g8 wrap">
                        @if (m.status !== 'ACTIVE') {
                          <button
                            type="button"
                            class="btn btn-ok"
                            [disabled]="!!statusWhy()"
                            [attr.title]="statusWhy() || null"
                            (click)="changeStatus(m, 'ACTIVE')"
                          >
                            <rp-icon name="usercheck" [size]="17" /><span>{{
                              m.status === 'SUSPENDED' ? 'Lift suspension' : 'Activate'
                            }}</span>
                          </button>
                        }
                        @if (m.status === 'ACTIVE') {
                          <button
                            type="button"
                            class="btn btn-sec"
                            [disabled]="!!statusWhy()"
                            [attr.title]="statusWhy() || null"
                            (click)="changeStatus(m, 'INACTIVE')"
                          >
                            <rp-icon name="userx" [size]="17" /><span>Deactivate</span>
                          </button>
                          <button
                            type="button"
                            class="btn btn-danger-o"
                            [disabled]="!!statusWhy() || m.pending.suspension"
                            [attr.title]="
                              statusWhy() ||
                              (m.pending.suspension
                                ? 'A suspension is already waiting for approval.'
                                : null)
                            "
                            (click)="changeStatus(m, 'SUSPENDED')"
                          >
                            <rp-icon name="shieldx" [size]="17" /><span>Suspend…</span>
                          </button>
                        }
                      </div>
                      @if (m.pending.suspension) {
                        <div class="note tone-accent">
                          <rp-icon name="clock" [size]="17" />
                          <div class="grow">
                            A suspension is waiting for a checker. Nothing changes until it's
                            approved.
                          </div>
                        </div>
                      }
                    }
                    <div class="cp-stx">
                      <div>
                        <b>Inactive</b> — left or deactivated administratively. Can't sign in, pay
                        or be paid; dropped from current class lists.
                      </div>
                      <div>
                        <b>Suspended</b> — access withheld pending a decision. Needs a reason and a
                        checker's approval; stays on lists marked suspended; money sent to the
                        wallet is held (OI-IDN-41).
                      </div>
                    </div>
                  </div>
                </div>
                <rp-member-wallet
                  [member]="m"
                  [wallets]="wallets()"
                  [walletsError]="walletsError()"
                  [permission]="txn()"
                  [why]="statusWhy()"
                  [heldAccess]="can('recon.view')"
                  (changed)="permissionChanged($event)"
                  (stale)="refreshMember(m.id, true)"
                />
                <div class="fs">
                  <h4><rp-icon name="logout" [size]="15" /> Leaving the institution</h4>
                  <div class="fs-b stack g12">
                    <p class="t-sm t-muted" style="line-height: 1.5">
                      A leaver is de-linked, never deleted. A checker approves the de-link; the link
                      becomes Unlinked and the profile Inactive (FR-IDN-12).
                    </p>
                    @if (m.pending.delink) {
                      <div class="note tone-accent">
                        <rp-icon name="clock" [size]="17" />
                        <div class="grow">A de-link is waiting for a checker.</div>
                      </div>
                    }
                    <div>
                      <button
                        type="button"
                        class="btn btn-sec"
                        [disabled]="!!delinkWhy(m)"
                        [attr.title]="delinkWhy(m) || null"
                        (click)="delink(m)"
                      >
                        <rp-icon name="logout" [size]="17" /><span>Start de-link</span>
                      </button>
                    </div>
                  </div>
                </div>
                <div class="note tone-neutral">
                  <rp-icon name="archive" [size]="17" />
                  <div class="grow">
                    <b>Members are never deleted.</b> CampusOne has no delete action for members or
                    wallets: the record, the wallet ledger and the full history are kept whatever
                    the status (CR-08).
                  </div>
                </div>
              }
              @case ('card') {
                <div class="fs">
                  <h4><rp-icon name="nfc" [size]="15" /> NFC card</h4>
                  <div class="fs-b">
                    <rp-empty
                      icon="card"
                      title="No NFC card"
                      text="Cards and attendance arrive with their modules (Phases 4 and 7)."
                    />
                  </div>
                </div>
              }
              @case ('account') {
                <div class="fs">
                  <h4><rp-icon name="user" [size]="15" /> Linked CampusOne account</h4>
                  <div class="fs-b stack g12">
                    @if (m.account.linked) {
                      <dl class="kv">
                        <dt>Mobile</dt>
                        <dd class="t-num">{{ m.account.mobileMasked }}</dd>
                        <dt>E-mail</dt>
                        <dd>{{ m.contact.email ?? '—' }}</dd>
                      </dl>
                      <p class="t-xs t-muted">
                        The account holder manages the password, device and PIN in the CampusOne app.
                        One account can hold several profiles in this institution, but never
                        profiles in two institutions (FR-IDN-04, FR-IDN-05).
                      </p>
                    } @else if (m.contact.mobile) {
                      <div class="note tone-info">
                        <rp-icon name="info" [size]="17" />
                        <div class="grow">
                          Waiting for {{ mobile(m.contact.mobile) }} to sign up for CampusOne — the
                          profile links then.
                        </div>
                      </div>
                    } @else {
                      <div class="note tone-neutral">
                        <rp-icon name="info" [size]="17" />
                        <div class="grow">No account is linked yet.</div>
                      </div>
                    }
                  </div>
                </div>
                @if (m.kind === 'STAFF' || m.kind === 'MERCHANTS') {
                  <rp-member-console-access
                    [member]="m"
                    [readOnly]="readOnly()"
                    (changed)="refreshMember(m.id)"
                  />
                }
                <div class="fs">
                  <h4><rp-icon name="hash" [size]="15" /> Identifiers</h4>
                  <div class="fs-b">
                    <dl class="kv">
                      <dt>Member ID</dt>
                      <dd class="t-mono">{{ m.memberNo }}</dd>
                      @if (m.admissionNo) {
                        <dt>Admission number</dt>
                        <dd class="t-mono">{{ m.admissionNo }}</dd>
                      }
                      @if (m.employeeNo) {
                        <dt>Employee ID</dt>
                        <dd class="t-mono">{{ m.employeeNo }}</dd>
                      }
                      <dt>Onboarded</dt>
                      <dd>{{ dt(m.onboardedAt) }}</dd>
                    </dl>
                    <p class="t-xs t-muted mt8">
                      Lists show the admission number; the member ID stays available here and in
                      exports (OI-IDN-43).
                    </p>
                  </div>
                </div>
              }
              @case ('history') {
                <div class="fs">
                  <h4><rp-icon name="history" [size]="15" /> Audit trail</h4>
                  <div class="fs-b">
                    @if (history().length) {
                      <div class="tl">
                        @for (h of history(); track $index) {
                          <div class="tl-i done">
                            <span class="tl-dot"
                              ><rp-icon name="check" [size]="13" [stroke]="2.6"
                            /></span>
                            <div class="tl-c">
                              <div class="tl-t">{{ actionLabel(h.action) }}</div>
                              <div class="tl-s">
                                {{ h.by }} · {{ dt(h.at) }}{{ h.reason ? ' · ' + h.reason : '' }}
                              </div>
                            </div>
                          </div>
                        }
                      </div>
                    } @else {
                      <p class="t-sm t-muted">
                        Onboarded {{ date(m.onboardedAt.slice(0, 10)) }}. No changes recorded since.
                      </p>
                    }
                  </div>
                </div>
              }
            }
          </div>
        </div>
        <ng-container modal-foot>
          <button type="button" class="btn btn-sec" (click)="closeMember()">
            <span>Close</span>
          </button>
          @if (dtab() === 'profile') {
            <button
              type="button"
              class="btn btn-pri"
              [class.is-busy]="busy()"
              [disabled]="!!editWhy()"
              [attr.title]="editWhy() || null"
              (click)="save(m)"
            >
              <rp-icon name="check" [size]="17" /><span>Save changes</span>
            </button>
          }
        </ng-container>
      </rp-modal>
    }

    @if (corr(); as c) {
      <rp-modal
        title="Request a correction"
        [sub]="c.m.name + ' · ' + c.m.memberNo"
        icon="lock"
        [narrow]="false"
        (closed)="closeCorrection()"
      >
        <div class="stack g16">
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow">
              Personal identifying information is display-only (CR-06). This request goes to a
              checker in the approvals queue; the change, the reason and the evidence are recorded
              permanently on the member's history.
            </div>
          </div>
          <div class="c-form">
            <div class="fld" [class.invalid]="cerr('field')">
              <label class="fld-l" for="cp-cr-f-b"
                >Field to correct<span class="req">*</span></label
              >
              <rp-dd
                inputId="cp-cr-f"
                [options]="corrFields(c.m)"
                [value]="c.field"
                (changed)="setCorrField($event)"
              />
              <div class="fld-e" id="cp-cr-f-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ cerr('field') }}</span>
              </div>
            </div>
            <div class="fld">
              <span class="fld-l">Recorded value</span>
              <div class="cp-curv" id="cp-cr-cur">
                <rp-icon name="lock" [size]="13" /> {{ corrCurrent() || '—' }}
              </div>
            </div>
            <div class="fld full" [class.invalid]="cerr('to')">
              <label class="fld-l" [for]="c.field === 'GENDER' ? 'cp-cr-to-b' : 'cp-cr-to'"
                >Corrected value<span class="req">*</span></label
              >
              @if (c.field === 'GENDER') {
                <rp-dd
                  inputId="cp-cr-to"
                  [options]="genderOptions(c.m)"
                  [value]="c.to"
                  (changed)="setCorr('to', $event)"
                />
              } @else {
                <div class="fld-in">
                  <input
                    id="cp-cr-to"
                    name="cp-cr-to"
                    autocomplete="off"
                    aria-describedby="cp-cr-to-e"
                    [type]="c.field === 'DOB' ? 'date' : 'text'"
                    [attr.max]="c.field === 'DOB' ? today : null"
                    [attr.maxlength]="c.field === 'DOB' ? null : c.field === 'FULL_NAME' ? 60 : 30"
                    [attr.placeholder]="c.field === 'DOB' ? null : 'Exactly as it should read'"
                    [value]="c.to"
                    (input)="setCorrInput('to', $event)"
                  />
                </div>
              }
              <div class="fld-e" id="cp-cr-to-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ cerr('to') }}</span>
              </div>
            </div>
            <div class="fld full" [class.invalid]="cerr('why')">
              <label class="fld-l" for="cp-cr-why"
                >Why is the record wrong?<span class="req">*</span></label
              >
              <div class="fld-in">
                <textarea
                  id="cp-cr-why"
                  name="cp-cr-why"
                  rows="3"
                  maxlength="300"
                  autocomplete="off"
                  aria-describedby="cp-cr-why-e"
                  placeholder="e.g. The birth certificate shows 21 March 2017; the admission form was mistyped"
                  [value]="c.why"
                  (input)="setCorrInput('why', $event)"
                ></textarea>
              </div>
              <div class="fld-e" id="cp-cr-why-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ cerr('why') }}</span>
              </div>
            </div>
            <div class="full">
              <div class="fld" [class.invalid]="cerr('ev')">
                <span class="fld-l">Evidence<span class="req">*</span></span>
                <label class="upl" [class.done]="c.file" for="cp-cr-ev"
                  ><span class="upl-ic"
                    ><rp-icon [name]="c.file ? 'checkc' : 'upload'" [size]="20" /></span
                  ><span class="grow" style="min-width: 0"
                    ><span class="t-h4 t-clip" style="display: block">{{
                      c.file?.name ?? 'Choose a file'
                    }}</span
                    ><span class="t-xs t-muted">{{
                      c.file
                        ? fileSize(c.file.size) + ' · ready to send'
                        : 'Birth certificate, ID proof or school record · PDF, JPG or PNG · up to 2 MB'
                    }}</span></span
                  ><input
                    type="file"
                    id="cp-cr-ev"
                    accept="application/pdf,image/png,image/jpeg"
                    (change)="pickEvidence($event)"
                /></label>
                <div class="fld-e" id="cp-cr-ev-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ cerr('ev') }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <ng-container modal-foot>
          <button type="button" class="btn btn-sec" (click)="closeCorrection()">
            <span>Cancel</span>
          </button>
          <button
            type="button"
            class="btn btn-pri"
            [class.is-busy]="corrBusy()"
            [disabled]="corrBusy()"
            (click)="sendCorrection()"
          >
            <rp-icon name="send" [size]="17" /><span>Send for approval</span>
          </button>
        </ng-container>
      </rp-modal>
    }
  `,
})
export class ConsoleMembers {
  private readonly api = inject(MembersApi);
  private readonly setup = inject(InstitutionSetupApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).console;
  private readonly route = inject(ActivatedRoute);
  protected readonly router = inject(Router);

  protected readonly tabs = TABS;
  protected readonly statuses: readonly MemberStatus[] = ['ACTIVE', 'INACTIVE', 'SUSPENDED'];
  protected readonly pageSize = PAGE;
  protected readonly noTask = "Your role doesn't include this task.";

  protected readonly tab = signal<Tab>('STUDENTS');
  protected readonly q = signal('');
  protected readonly cls = signal('');
  protected readonly sec = signal('');
  protected readonly ut = signal('');
  protected readonly status = signal<MemberStatus | ''>('');
  protected readonly cf = signal<Record<string, string>>({});
  protected readonly data = signal<MemberList | null>(null);
  protected readonly rows = signal<readonly MemberRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly selected = signal<readonly string[]>([]);
  protected readonly classes = signal<readonly ClassView[]>([]);
  protected readonly types = signal<readonly UserType[]>([]);

  protected readonly member = signal<MemberDetail | null>(null);
  protected readonly dtab = signal<DrawerTab>('profile');
  protected readonly history = signal<readonly HistoryItem[]>([]);
  /** WAL-008 for the open member (null while loading). */
  protected readonly wallets = signal<readonly Wallet[] | null>(null);
  protected readonly walletsError = signal('');
  /** The admission forms the open member is on (null while they load). */
  protected readonly admission = signal<readonly AdmissionRecord[] | null>(null);
  protected readonly admissionError = signal('');
  /** The institution's active fields for applications (CR-12), read with the first form. */
  protected readonly appFields = signal<readonly CustomField[]>([]);
  private fieldsAsked = false;
  /** IDN-056 as the member detail reports it (IDN-045; BR-13: on unless someone turned it off). */
  protected readonly txn = computed<PermissionState>(
    () => this.member()?.transactionPermission ?? PAYMENTS_ON,
  );
  protected readonly form = signal<{
    email: string;
    departmentId: string;
    sectionId: string;
    fields: Record<string, string | boolean | string[] | null>;
  }>({ email: '', departmentId: '', sectionId: '', fields: {} });
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly busy = signal(false);
  protected readonly corr = signal<CorrectionDraft | null>(null);
  protected readonly corrErrors = signal<Record<string, string>>({});
  protected readonly corrBusy = signal(false);
  protected readonly today = istBusinessDate();
  /** The evidence already uploaded for the open request (a retry does not upload it again). */
  private evidence: { file: File; fileId: string } | null = null;
  private seq = 0;
  private qTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly readOnly = computed(() => {
    const s = this.session();
    if (!s) return '';
    return s.roles.some((r) => r.readOnly)
      ? 'Management has read-only access. The administrator makes changes here.'
      : '';
  });
  /** "Admission" for students and parents, and for anyone else on an admission form. */
  protected readonly drawerTabs = computed(() => {
    const m = this.member();
    const show =
      !!m && (m.kind === 'STUDENTS' || m.kind === 'PARENTS' || !!this.admission()?.length);
    return show ? DRAWER_TABS : DRAWER_TABS.filter((t) => t.v !== 'admission');
  });
  protected readonly editWhy = computed(
    () => this.readOnly() || (this.can('members.edit') ? '' : this.noTask),
  );
  protected readonly statusWhy = computed(
    () => this.readOnly() || (this.can('members.status') ? '' : this.noTask),
  );
  protected readonly year = computed(() => this.data()?.year?.label ?? 'this year');
  protected readonly shortName = computed(
    () => this.session()?.institution.shortName ?? 'the institution',
  );
  protected readonly total = computed(() => {
    const d = this.data();
    if (!d) return 0;
    const t = this.tab();
    const all = d.counts.tabs[t];
    return this.status() ? Math.min(all, d.counts.statuses[this.status() as MemberStatus]) : all;
  });
  protected readonly pages = computed(() =>
    Array.from({ length: Math.max(1, Math.ceil(this.rows().length / PAGE)) }, (_, i) => i + 1),
  );
  protected readonly shown = computed(() =>
    this.rows().slice((this.page() - 1) * PAGE, this.page() * PAGE),
  );
  protected readonly allShownSelected = computed(
    () => this.shown().length > 0 && this.shown().every((m) => this.selected().includes(m.id)),
  );
  protected readonly filtered = computed(
    () =>
      Boolean(this.q() || this.cls() || this.sec() || this.ut() || this.status()) ||
      Object.values(this.cf()).some(Boolean),
  );
  protected readonly summary = computed(() => {
    const n = this.rows().length;
    const noun =
      this.tab() === 'ALL'
        ? 'member'
        : this.tab() === 'STAFF'
          ? n === 1
            ? 'person'
            : 'people'
          : this.tab().toLowerCase().replace(/s$/, '');
    const more = this.data()?.nextCursor ? '+' : '';
    return `${this.num(n)}${more} ${noun === 'people' || n === 1 ? noun : noun + 's'}`;
  });
  protected readonly columns = computed(() => {
    const cf = (this.data()?.columns ?? []).map((c) => ({ k: c.id, l: c.label, r: false }));
    const status = { k: 'status', l: 'Status', r: false };
    const wal = { k: 'wal', l: 'Wallet', r: true };
    switch (this.tab()) {
      case 'STUDENTS':
        return [
          { k: 'name', l: 'Name', r: false },
          { k: 'admNo', l: 'Admission no.', r: false },
          { k: 'grade', l: 'Grade', r: false },
          { k: 'section', l: 'Section', r: false },
          ...cf,
          status,
          wal,
        ];
      case 'PARENTS':
        return [
          { k: 'name', l: 'Name', r: false },
          { k: 'mobile', l: 'Mobile', r: false },
          { k: 'children', l: 'Children', r: false },
          ...cf,
          status,
          wal,
        ];
      case 'STAFF':
        return [
          { k: 'name', l: 'Name', r: false },
          { k: 'empId', l: 'Employee ID', r: false },
          { k: 'type', l: 'User type', r: false },
          { k: 'dept', l: 'Department', r: false },
          ...cf,
          status,
          wal,
        ];
      default:
        return [
          { k: 'name', l: 'Name', r: false },
          { k: 'type', l: 'User type', r: false },
          { k: 'det', l: 'Grade / department', r: false },
          { k: 'id2', l: 'Admission / employee no.', r: false },
          ...cf,
          status,
          wal,
        ];
    }
  });
  protected readonly gradeOptions = computed<DropdownOption[]>(() => [
    { v: '', l: 'All grades' },
    ...this.classes().map((c) => ({ v: c.id, l: c.name })),
  ]);
  protected readonly sectionOptions = computed<DropdownOption[]>(() => {
    const c = this.classes().find((x) => x.id === this.cls());
    const names = c ? c.sections : [];
    return [
      { v: '', l: 'All sections' },
      ...names.map((s) => ({ v: s.id, l: `Section ${s.name}` })),
    ];
  });
  protected readonly typeOptions = computed<DropdownOption[]>(() => [
    { v: '', l: 'All user types' },
    ...this.types()
      .filter((t) => !['STUDENT', 'PARENT', 'MERCHANT'].includes(t.category))
      .map((t) => ({ v: t.id, l: t.name })),
  ]);
  protected readonly allSections = computed<DropdownOption[]>(() =>
    this.classes().flatMap((c) => c.sections.map((s) => ({ v: s.id, l: `${c.name} ${s.name}` }))),
  );

  constructor() {
    const open = this.route.snapshot.queryParamMap.get('open');
    const tab = this.route.snapshot.queryParamMap.get('tab') as Tab | null;
    if (tab && TABS.some((t) => t.v === tab)) this.tab.set(tab);
    effect(() => {
      // Any filter change reloads the first page.
      this.tab();
      this.status();
      this.cls();
      this.sec();
      this.ut();
      this.cf();
      untracked(() => void this.load());
    });
    void this.lookups();
    if (open) void this.openMember(open);
  }

  private async lookups() {
    try {
      const [c, t] = await Promise.all([this.api.classes(), this.setup.userTypes()]);
      this.classes.set(c.items);
      this.types.set(t.items);
    } catch {
      // The filters stay empty; the list still works.
    }
  }

  private query(cursor?: string) {
    const q: Record<string, string | number | undefined> = {
      kind: this.tab(),
      q: this.q() || undefined,
      status: this.status() || undefined,
      classId: this.cls() || undefined,
      sectionId: this.sec() || undefined,
      userTypeId: this.ut() || undefined,
      limit: 200,
      cursor,
    };
    for (const [k, v] of Object.entries(this.cf())) if (v) q[`cf.${k}`] = v;
    return q;
  }

  private async load() {
    const id = ++this.seq;
    this.loading.set(true);
    try {
      const d = await this.api.list(this.query());
      if (id !== this.seq) return;
      this.data.set(d);
      this.rows.set(d.items);
      this.page.set(1);
      this.selected.set([]);
      this.error.set('');
    } catch (e) {
      if (id === this.seq)
        this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      if (id === this.seq) this.loading.set(false);
    }
  }

  protected async next() {
    if (this.page() < this.pages().length) {
      this.page.set(this.page() + 1);
      return;
    }
    const cursor = this.data()?.nextCursor;
    if (!cursor) return;
    const d = await this.api.list(this.query(cursor));
    this.data.set({ ...d, counts: this.data()!.counts });
    this.rows.set([...this.rows(), ...d.items]);
    this.page.set(this.page() + 1);
  }

  // --- filters ---------------------------------------------------------------------------------------
  protected setTab(t: Tab) {
    this.tab.set(t);
    this.cls.set('');
    this.sec.set('');
    this.ut.set('');
  }
  protected setQ(e: Event) {
    this.q.set((e.target as HTMLInputElement).value);
    if (this.qTimer) clearTimeout(this.qTimer);
    this.qTimer = setTimeout(() => void this.load(), 250);
  }
  protected setCls(v: string) {
    this.cls.set(v);
    this.sec.set('');
  }
  protected setSec(v: string) {
    this.sec.set(v);
  }
  protected setUt(v: string) {
    this.ut.set(v);
  }
  protected setStatus(v: MemberStatus | '') {
    this.status.set(v);
  }
  protected setCf(id: string, v: string) {
    this.cf.set({ ...this.cf(), [id]: v });
  }
  protected cfOptions(f: { label: string; options: readonly string[] }): DropdownOption[] {
    return [
      { v: '', l: `${f.label}: any` },
      ...f.options.map((o) => ({ v: o, l: `${f.label}: ${o}` })),
    ];
  }
  protected clear() {
    this.q.set('');
    this.cls.set('');
    this.sec.set('');
    this.ut.set('');
    this.status.set('');
    this.cf.set({});
    void this.load();
  }

  // --- selection and bulk ----------------------------------------------------------------------------
  protected toggle(id: string) {
    const s = this.selected();
    this.selected.set(s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  }
  protected toggleAll() {
    const ids = this.shown().map((m) => m.id);
    this.selected.set(
      this.allShownSelected()
        ? this.selected().filter((x) => !ids.includes(x))
        : [...new Set([...this.selected(), ...ids])],
    );
  }
  protected async bulk(to: 'ACTIVE' | 'INACTIVE') {
    const list = this.rows().filter((m) => this.selected().includes(m.id));
    const todo = list.filter(
      (m) =>
        m.status !== to &&
        !(to === 'ACTIVE' && m.status === 'SUSPENDED') &&
        !(to === 'INACTIVE' && m.status === 'SUSPENDED'),
    );
    if (!todo.length) {
      this.overlays.toast('Nothing to change', {
        sub: `The selected members are already ${to.toLowerCase()} or suspended.`,
        tone: 'info',
      });
      return;
    }
    const ok = await this.overlays.confirm({
      title: `${to === 'ACTIVE' ? 'Activate' : 'Deactivate'} ${this.num(todo.length)} member${todo.length === 1 ? '' : 's'}?`,
      text:
        to === 'ACTIVE'
          ? 'They can sign in, pay and be paid again.'
          : "They won't be able to sign in, pay or be paid. Nothing is deleted.",
      ok: to === 'ACTIVE' ? 'Activate' : 'Deactivate',
      tone: to === 'ACTIVE' ? 'brand' : 'warn',
      ...(to === 'INACTIVE'
        ? {
            reason: {
              label: 'Reason (recorded on each member)',
              placeholder: 'e.g. Left the institution at the end of term',
              min: 8,
            },
          }
        : {}),
    });
    if (!ok) return;
    let done = 0;
    for (const m of todo) {
      try {
        await this.api.status(m.id, { to, reason: ok.reason ?? null });
        done++;
      } catch {
        // Counted below; the list reload shows each member's real status.
      }
    }
    this.selected.set([]);
    this.overlays.toast(
      `${this.num(done)} member${done === 1 ? '' : 's'} ${to === 'ACTIVE' ? 'activated' : 'deactivated'}`,
      {
        sub:
          done < todo.length
            ? `${todo.length - done} could not be changed`
            : 'Recorded on each member',
        tone: done < todo.length ? 'warn' : 'ok',
      },
    );
    await this.load();
  }

  // --- drawer ----------------------------------------------------------------------------------------
  protected async openMember(id: string) {
    try {
      const m = await this.api.detail(id);
      this.member.set(m);
      this.dtab.set('profile');
      this.history.set([]);
      this.errors.set({});
      this.resetForm(m);
      void this.loadMoney(m.id);
      void this.loadAdmission(m.id);
    } catch (e) {
      this.overlays.toast("Couldn't open the member", {
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
    }
  }
  protected closeMember() {
    this.member.set(null);
  }

  /** Reloads the open member (new roles, a newer version) without leaving the current tab. */
  protected async refreshMember(id: string, money = false) {
    try {
      const m = await this.api.detail(id);
      if (this.member()?.id !== id) return;
      this.member.set(m);
      this.resetForm(m);
      if (money) await this.loadMoney(id);
    } catch {
      // The drawer keeps what it shows; the next action reports the problem.
    }
  }

  /** The wallets (WAL-008) for "Status & wallet"; the permission comes with the member (IDN-045). */
  private async loadMoney(id: string) {
    this.wallets.set(null);
    this.walletsError.set('');
    try {
      const w = await this.api.wallets(id);
      if (this.member()?.id === id) this.wallets.set(w.wallets);
    } catch (e) {
      if (this.member()?.id !== id) return;
      this.walletsError.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  /** The admission forms the member is on: their own, or their children's. */
  protected async loadAdmission(id: string) {
    this.admission.set(null);
    this.admissionError.set('');
    try {
      const r = await this.api.admission(id);
      if (this.member()?.id !== id) return;
      this.admission.set(r.records);
      if (r.records.length) void this.loadFields();
    } catch (e) {
      if (this.member()?.id !== id) return;
      this.admission.set([]);
      this.admissionError.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  /** The labels of the forms' institution fields; without them the answers show unlabelled. */
  private async loadFields() {
    if (this.fieldsAsked) return;
    this.fieldsAsked = true;
    try {
      const r = await this.setup.fields();
      this.appFields.set(
        r.items.filter((f) => f.entity === 'ADMISSION_APPLICATION' && f.status === 'ACTIVE'),
      );
    } catch {
      this.fieldsAsked = false;
    }
  }

  /** A form saved or a document added: the newer copy replaces the old one. */
  protected admissionChanged(a: Application) {
    this.admission.update((list) =>
      (list ?? []).map((r) => (r.application.id === a.id ? { ...r, application: a } : r)),
    );
  }

  /** A locked field of the member's own form: the drawer's correction request (CR-06). */
  protected correctFrom(m: MemberDetail, f: IdentityFix) {
    this.openCorrection(m, f);
  }

  /** IDN-056 answered: the new permission, and the member's new version guards the next edit. */
  protected permissionChanged(r: TransactionPermission) {
    const m = this.member();
    if (!m) return;
    this.member.set({
      ...m,
      version: r.version,
      transactionPermission: { enabled: r.enabled, reason: r.reason, changedAt: r.changedAt },
    });
  }
  private resetForm(m: MemberDetail) {
    this.form.set({
      email: m.contact.email ?? '',
      departmentId: m.department?.id ?? '',
      sectionId: m.grade?.sectionId ?? '',
      fields: Object.fromEntries(
        m.customFields.map((f) => [
          f.id,
          f.value === null
            ? null
            : Array.isArray(f.value)
              ? [...f.value]
              : (f.value as string | boolean),
        ]),
      ) as Record<string, string | boolean | string[] | null>,
    });
  }
  protected async setDrawerTab(t: DrawerTab) {
    this.dtab.set(t);
    const m = this.member();
    if (t === 'history' && m) {
      try {
        this.history.set((await this.api.history(m.id)).items);
      } catch {
        this.history.set([]);
      }
    }
  }
  protected patch(k: 'email', e: Event) {
    this.form.set({ ...this.form(), [k]: (e.target as HTMLInputElement).value });
    this.errors.set({ ...this.errors(), [k]: '' });
  }
  protected patchValue(k: 'departmentId' | 'sectionId', v: string) {
    this.form.set({ ...this.form(), [k]: v });
  }
  protected cfText(id: string) {
    const v = this.form().fields[id];
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    return Array.isArray(v) ? v.join(', ') : String(v);
  }
  protected setField(id: string, v: string) {
    this.form.set({ ...this.form(), fields: { ...this.form().fields, [id]: v || null } });
    this.errors.set({ ...this.errors(), [`customFields.${id}`]: '' });
  }
  /** A phone number takes digits only, in the box too (client 2026-10-14). */
  protected setFieldFromInput(id: string, e: Event, type: string) {
    const el = e.target as HTMLInputElement;
    this.setField(id, type === 'PHONE' ? cleanTyped(el, onlyDigits) : el.value);
  }
  protected multiHas(id: string, o: string) {
    const v = this.form().fields[id];
    return Array.isArray(v) && v.includes(o);
  }
  protected toggleMulti(id: string, o: string) {
    const v = this.form().fields[id];
    const list = Array.isArray(v) ? v : [];
    this.form.set({
      ...this.form(),
      fields: {
        ...this.form().fields,
        [id]: list.includes(o) ? list.filter((x) => x !== o) : [...list, o],
      },
    });
  }
  protected fieldOptions(f: { type: string; options: readonly string[] }): DropdownOption[] {
    const opts = f.type === 'YES_NO' ? ['Yes', 'No'] : f.options;
    return [{ v: '', l: 'Select' }, ...opts.map((o) => ({ v: o, l: o }))];
  }
  protected inputType(t: string) {
    return t === 'NUMBER'
      ? 'number'
      : t === 'DATE'
        ? 'date'
        : t === 'EMAIL'
          ? 'email'
          : t === 'PHONE'
            ? 'tel'
            : 'text';
  }
  protected deptOptions(m: MemberDetail): DropdownOption[] {
    const t = this.types().find((x) => x.id === m.userType.id);
    return [
      { v: '', l: 'No department' },
      ...(t?.departments ?? []).map((d) => ({ v: d.id, l: d.name })),
    ];
  }

  protected async save(m: MemberDetail) {
    if (this.editWhy() || this.busy()) return;
    const f = this.form();
    const body: Record<string, unknown> = {};
    if (f.email.trim() !== (m.contact.email ?? '')) body['email'] = f.email.trim() || null;
    if (f.departmentId !== (m.department?.id ?? '')) body['departmentId'] = f.departmentId || null;
    if (m.kind === 'STUDENTS' && f.sectionId && f.sectionId !== (m.grade?.sectionId ?? '')) {
      body['sectionId'] = f.sectionId;
    }
    const custom: Record<string, unknown> = {};
    for (const cf of m.customFields) {
      const before = JSON.stringify(cf.value ?? null);
      let v = f.fields[cf.id] ?? null;
      if (cf.type === 'YES_NO' && typeof v === 'string') v = v === '' ? null : v === 'Yes';
      if (JSON.stringify(v) !== before) custom[cf.id] = v;
    }
    if (Object.keys(custom).length) body['customFields'] = custom;
    if (!Object.keys(body).length) {
      this.overlays.toast('No changes to save', { tone: 'info' });
      return;
    }
    this.busy.set(true);
    try {
      const saved = await this.api.update(m.id, m.version, body);
      this.member.set(saved);
      this.resetForm(saved);
      this.overlays.toast('Changes saved', { sub: m.name });
      void this.load();
    } catch (e) {
      if (e instanceof ApiProblem && e.errors.length) {
        this.errors.set(Object.fromEntries(e.errors.map((x) => [x.field, x.message])));
      } else {
        this.overlays.toast('Not saved', {
          sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
          tone: 'bad',
        });
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected async changeStatus(m: MemberDetail, to: MemberStatus) {
    const texts: Record<
      MemberStatus,
      { title: string; text: string; ok: string; tone: 'brand' | 'warn' | 'bad' }
    > = {
      ACTIVE: {
        title:
          m.status === 'SUSPENDED' ? `Lift the suspension of ${m.name}?` : `Activate ${m.name}?`,
        text: 'They can sign in, pay and be paid again.',
        ok: m.status === 'SUSPENDED' ? 'Lift suspension' : 'Activate',
        tone: 'brand',
      },
      INACTIVE: {
        title: `Deactivate ${m.name}?`,
        text: "They won't be able to sign in, pay or be paid, and their sessions end. Nothing is deleted.",
        ok: 'Deactivate',
        tone: 'warn',
      },
      SUSPENDED: {
        title: `Suspend ${m.name}?`,
        text: 'Access is withheld pending a decision. A checker approves the suspension unless you apply it as the Institution Administrator.',
        ok: 'Suspend',
        tone: 'bad',
      },
    };
    const t = texts[to];
    const ok = await this.overlays.confirm({
      title: t.title,
      text: t.text,
      ok: t.ok,
      tone: t.tone,
      ...(to !== 'ACTIVE'
        ? {
            reason: {
              label: 'Reason (recorded on the member)',
              placeholder: 'e.g. Left the institution at the end of term',
              min: 8,
            },
          }
        : {}),
    });
    if (!ok) return;
    try {
      const r = await this.api.status(m.id, { to, reason: ok.reason ?? null });
      this.overlays.toast(
        r.approvalId
          ? 'Suspension sent for approval'
          : `${m.name} is ${this.statusLabel(to).toLowerCase()}`,
        {
          sub: r.approvalId ? 'A checker decides in Approvals' : 'Recorded on the member',
          tone: r.approvalId ? 'info' : 'ok',
        },
      );
      await this.openMember(m.id);
      this.dtab.set('status');
      void this.load();
    } catch (e) {
      this.overlays.toast('Not changed', {
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
    }
  }

  protected delinkWhy(m: MemberDetail) {
    if (this.readOnly()) return this.readOnly();
    if (!this.can('members.delink')) return this.noTask;
    if (m.pending.delink) return 'A de-link request is already waiting for approval.';
    if (!m.account.linked && m.status === 'INACTIVE') return 'This member is already de-linked.';
    return '';
  }

  protected async delink(m: MemberDetail) {
    const ok = await this.overlays.confirm({
      title: `De-link ${m.name}?`,
      text: 'The profile becomes Inactive and leaves its CampusOne account. The record and history stay. A checker approves it unless you apply it as the Institution Administrator.',
      ok: 'Start de-link',
      tone: 'warn',
      reason: {
        label: 'Reason (recorded on the member)',
        placeholder: 'e.g. Transferred to another school',
        min: 8,
      },
    });
    if (!ok) return;
    try {
      const r = await this.api.delink(m.id, ok.reason ?? '');
      this.overlays.toast(r.approvalId ? 'De-link sent for approval' : `${m.name} is de-linked`, {
        sub: r.approvalId
          ? 'A checker decides in Approvals'
          : 'The profile is Inactive; the record is kept',
        tone: r.approvalId ? 'info' : 'ok',
      });
      await this.openMember(m.id);
      this.dtab.set('status');
      void this.load();
    } catch (e) {
      this.overlays.toast('Not de-linked', {
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
    }
  }

  // --- correction request (IDN-057, CR-06) -----------------------------------------------------------
  protected piiList(m: MemberDetail): PiiField[] {
    const list: PiiField[] = [
      { k: 'FULL_NAME', l: 'Full name', v: m.name, show: m.name },
      {
        k: 'DOB',
        l: 'Date of birth',
        v: m.dateOfBirth ?? '',
        show: m.dateOfBirth ? formatDate(m.dateOfBirth) : '',
      },
      { k: 'GENDER', l: 'Gender', v: m.gender ?? '', show: m.gender ? this.gender(m.gender) : '' },
    ];
    if (m.kind === 'STUDENTS') {
      const v = m.admissionNo ?? '';
      list.push({ k: 'ADMISSION_NO', l: 'Admission number', v, show: v });
    } else if (m.kind === 'STAFF') {
      const v = m.employeeNo ?? '';
      list.push({ k: 'EMPLOYEE_NO', l: 'Employee ID', v, show: v });
    }
    return list;
  }
  protected corrFields(m: MemberDetail): DropdownOption[] {
    return this.piiList(m).map((f) => ({ v: f.k, l: f.l }));
  }
  protected corrCurrent() {
    const c = this.corr();
    return c ? (this.piiList(c.m).find((f) => f.k === c.field)?.show ?? '') : '';
  }
  protected genderOptions(m: MemberDetail): DropdownOption[] {
    return Object.keys(GENDER)
      .filter((g) => g !== m.gender)
      .map((g) => ({ v: g, l: this.gender(g) }));
  }
  protected cerr(k: string) {
    return this.corrErrors()[k] ?? '';
  }
  protected fileSize(b: number) {
    return b >= 1048576
      ? `${(b / 1048576).toFixed(1)} MB`
      : `${Math.max(1, Math.round(b / 1024))} KB`;
  }

  protected openCorrection(m: MemberDetail, field: CorrectionField) {
    if (this.editWhy()) return;
    this.evidence = null;
    this.corrErrors.set({});
    this.corr.set({ m, field, to: '', why: '', file: null });
  }
  protected closeCorrection() {
    this.corr.set(null);
    this.evidence = null;
  }
  protected setCorrField(v: string) {
    const c = this.corr();
    if (!c) return;
    this.corr.set({ ...c, field: v as CorrectionField, to: '' });
    this.corrErrors.set({ ...this.corrErrors(), field: '', to: '' });
  }
  protected setCorr(k: 'to' | 'why', v: string) {
    const c = this.corr();
    if (!c) return;
    this.corr.set({ ...c, [k]: v });
    this.corrErrors.set({ ...this.corrErrors(), [k]: '' });
  }
  protected setCorrInput(k: 'to' | 'why', e: Event) {
    this.setCorr(k, (e.target as HTMLInputElement).value);
  }
  protected pickEvidence(e: Event) {
    const c = this.corr();
    if (!c) return;
    const file = (e.target as HTMLInputElement).files?.[0] ?? null;
    let error = '';
    if (file && !EVIDENCE_TYPES.includes(file.type)) {
      error = translate('FILE.TYPE_NOT_ALLOWED', { types: 'PDF, PNG, JPEG' });
    } else if (file && file.size > MAX_EVIDENCE) {
      error = translate('FILE.TOO_LARGE', { limit: '2 MB' });
    }
    this.corr.set({ ...c, file: error ? null : file });
    this.corrErrors.set({ ...this.corrErrors(), ev: error });
  }

  /** The prototype's checks (cp.corr.send) with the register's wording; the server checks again. */
  private checkCorrection(c: CorrectionDraft, to: string, why: string) {
    const f = this.piiList(c.m).find((x) => x.k === c.field);
    const e: Record<string, string> = {};
    const same =
      !!f?.v &&
      (c.field === 'DOB' || c.field === 'GENDER'
        ? to === f.v
        : to.toLowerCase() === f.v.trim().toLowerCase());
    if (!to) e['to'] = translate('VALIDATION.REQUIRED');
    else if (same) e['to'] = translate('IDN.CORRECTION_SAME');
    else if (c.field === 'FULL_NAME' && (!PERSON.test(to) || to.length > 60)) {
      e['to'] = translate('IDN.NAME_LETTERS_ONLY');
    } else if (c.field === 'DOB' && to >= this.today) e['to'] = translate('IDN.DOB_IN_FUTURE');
    if (!why) e['why'] = translate('VALIDATION.REQUIRED');
    else if (why.length < 10) e['why'] = translate('IDN.REASON_TOO_SHORT', { min: 10 });
    if (!c.file) e['ev'] = translate('VALIDATION.REQUIRED');
    return e;
  }

  protected async sendCorrection() {
    const c = this.corr();
    if (!c || this.corrBusy()) return;
    const to = c.to.trim().replace(/\s+/g, ' ');
    const why = c.why.trim();
    const e = this.checkCorrection(c, to, why);
    if (Object.keys(e).length || !c.file) {
      this.corrErrors.set(e);
      return;
    }
    const file = c.file;
    this.corrBusy.set(true);
    try {
      let fileId = this.evidence?.file === file ? this.evidence.fileId : '';
      if (!fileId) {
        try {
          fileId = (await this.api.uploadEvidence(file)).fileId;
          this.evidence = { file, fileId };
        } catch (err) {
          this.corrErrors.set({
            ev: err instanceof ApiProblem ? err.detail : translate('GEN.UNAVAILABLE'),
          });
          return;
        }
      }
      const r = await this.api.correct(c.m.id, {
        field: c.field,
        proposedValue: to,
        reason: why,
        evidenceFileId: fileId,
      });
      this.closeCorrection();
      if (r.applied) {
        this.overlays.toast('Correction applied', {
          sub: `${r.no} · recorded on the member's history`,
        });
        await this.openMember(c.m.id);
        void this.load();
      } else {
        this.overlays.toast('Sent for approval', {
          sub: `${r.no} · waits for an Institution Administrator`,
        });
      }
    } catch (err) {
      if (err instanceof ApiProblem && err.errors.length) {
        this.corrErrors.set(
          Object.fromEntries(
            err.errors.map((x) => [CORRECTION_ERRORS[x.field] ?? 'to', x.message]),
          ),
        );
      } else if (err instanceof ApiProblem && err.code === 'IDN.CORRECTION_PENDING') {
        this.corrErrors.set({ field: err.detail });
      } else {
        this.overlays.toast('Not sent', {
          sub: err instanceof ApiProblem ? err.detail : translate('GEN.UNAVAILABLE'),
          tone: 'bad',
        });
      }
    } finally {
      this.corrBusy.set(false);
    }
  }

  // --- export ----------------------------------------------------------------------------------------
  protected exportList() {
    const cols = this.columns().filter((c) => c.k !== 'wal');
    const cell = (m: MemberRow, k: string) => {
      switch (k) {
        case 'name':
          return m.name;
        case 'admNo':
          return m.admissionNo ?? '';
        case 'grade':
          return m.grade?.class ?? '';
        case 'section':
          return m.grade?.section ?? '';
        case 'mobile':
          return m.mobile ?? '';
        case 'children':
          return (m.children ?? []).map((c) => c.name).join('; ');
        case 'empId':
          return m.employeeNo ?? '';
        case 'type':
          return m.userType.name;
        case 'dept':
          return m.department?.name ?? '';
        case 'det':
          return m.grade ? `${m.grade.class} ${m.grade.section ?? ''}` : (m.department?.name ?? '');
        case 'id2':
          return m.admissionNo ?? m.employeeNo ?? '';
        case 'status':
          return this.statusLabel(m.status);
        default:
          return m.customFields[k] ?? '';
      }
    };
    const q = (v: string) =>
      /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : /^[=+\-@]/.test(v) ? `'${v}` : v;
    const lines = [
      ['Member ID', ...cols.map((c) => c.l)].map(q).join(','),
      ...this.rows().map((m) => [m.memberNo, ...cols.map((c) => cell(m, c.k))].map(q).join(',')),
    ];
    const blob = new Blob([String.fromCharCode(0xfeff) + lines.join('\r\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `members-${this.tab().toLowerCase()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    this.overlays.toast('Members exported', { sub: `${this.num(this.rows().length)} rows · CSV` });
  }

  // --- formatting ------------------------------------------------------------------------------------
  protected can(sub: string) {
    return this.session()?.subTasks.includes(sub) ?? false;
  }
  protected num(n: number) {
    return n.toLocaleString('en-IN');
  }
  protected min(a: number, b: number) {
    return Math.min(a, b);
  }
  protected tone(s: MemberStatus) {
    return STATUS[s].tone;
  }
  protected statusLabel(s: MemberStatus | string) {
    return STATUS[s as MemberStatus]?.l ?? s;
  }
  protected relationLabel(r: string | null | undefined) {
    return r ? (RELATION[r] ?? r) : 'Parent';
  }
  protected gender(g: string) {
    return GENDER[g] ?? g;
  }
  protected actionLabel(a: string) {
    return ACTION[a] ?? a;
  }
  protected roleNames(m: MemberDetail) {
    return m.roles.map((r) => r.name).join(', ');
  }
  protected mobile(m: string | null) {
    return m ? formatMobile(m) : '—';
  }
  protected date(v: string) {
    return formatDate(v);
  }
  protected t12(hm: string) {
    return t12(hm);
  }
  protected dt(v: string) {
    return formatDateTime(v);
  }
  protected err(k: string) {
    return this.errors()[k] ?? '';
  }
  protected detailOf(m: MemberDetail) {
    if (m.kind === 'STUDENTS')
      return m.grade ? `${m.grade.class} ${m.grade.section ?? ''}`.trim() : m.userType.name;
    if (m.kind === 'PARENTS')
      return `Parent of ${m.wards.map((w) => w.name.split(' ')[0]).join(', ') || '—'}`;
    return `${m.userType.name}${m.department ? ` · ${m.department.name}` : ''}`;
  }
}
