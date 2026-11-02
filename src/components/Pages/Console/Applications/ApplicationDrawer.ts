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
import { Router } from '@angular/router';
import { Empty } from '../../../Shared/Blocks';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate, formatMobile, istBusinessDate } from '../../../Utils/format';
import { newIdempotencyKey } from '../../../Utils/ids';
import { PATTERNS } from '../../../Utils/patterns';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { cleanTyped, onlyDigits } from '../../../Utils/typing';
import { ContactVerify } from '../../Admissions/Shared/ContactVerify';
import { CashCollection, type CashTarget } from '../AdmissionFees/CashCollection';
import { AdmissionFeesApi } from '../AdmissionFees/admission-fees.api';
import { inr0, paiseOf } from '../Fees/fee-format';
import { FeesApi, type StructureVersion } from '../Fees/fees.api';
import type { CustomField, UserType } from '../Institution/institution.api';
import type { ClassView } from '../Members/members.api';
import { ApplicationApprove } from './ApplicationApprove';
import { ApplicationReject } from './ApplicationReject';
import { ApplicationSection } from './ApplicationSection';
import type { YearOption } from './ConsoleApplications';
import { TransferCertificate } from './TransferCertificate';
import {
  BOARD,
  CATEGORY,
  DOC_ACCEPT,
  DOC_MAX_BYTES,
  DOC_TYPE,
  FEE_STATUS,
  GENDER,
  REF_MAX,
  REJECT_REASON,
  RELATION,
  SOURCE,
  addressText,
  appName,
  feeChip,
  feeOf,
  fileSize,
  historyOf,
  idsText,
  inrOf,
  longDay,
  person,
  shortDay,
  tcState,
  workText,
} from './app-format';
import { idsNeeded } from './app-form';
import {
  ApplicationsApi,
  type Application,
  type CardOwner,
  type DocType,
  type PaymentState,
  type SectionName,
} from './applications.api';

type RefField = 'name' | 'rel' | 'mobile';

/** Why submitting and approval wait (client 2026-10-27). */
const NOT_VERIFIED = 'Verify the primary contact’s mobile first';

/**
 * The application drawer (prototype openApp / appBody / appFoot; ADM-014, ADM-016, ADM-017,
 * ADM-026…028, ADM-030; the decisions ADM-018/019 in ApplicationApprove and ApplicationReject):
 * the outcome note, the mid-term block (joining date, transfer certificate or undertaking, age on
 * the joining date, the class's fee structure), the student with the age on the reference date and
 * its band, the parents, the addresses, the previous school, the references (add, remove), the
 * documents (download, upload), the declaration and fees, the institution's fields and the history.
 * The footer submits a draft (or records its application fee in cash) and decides a submitted one.
 */
@Component({
  selector: 'rp-application-drawer',
  imports: [
    ApplicationApprove,
    ApplicationReject,
    ApplicationSection,
    CashCollection,
    ContactVerify,
    Dropdown,
    Empty,
    Icon,
    Modal,
    TransferCertificate,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="title()"
      [sub]="sub()"
      icon="filetext"
      [drawer]="true"
      cls="cm-m"
      (closed)="closed.emit()"
    >
      @if (app(); as a) {
        <div class="stack g16" id="ap-drawer">
          @if (lockedWhy()) {
            <div class="note tone-info">
              <rp-icon name="lock" [size]="17" />
              <div class="grow">{{ lockedWhy() }}</div>
            </div>
          }
          @if (rolledBack(); as rb) {
            <div class="note tone-bad" role="alert" id="ap-rolled">
              <rp-icon name="alertc" [size]="17" />
              <div class="grow"><b>Approval rolled back.</b> {{ rb }} Nothing was saved.</div>
            </div>
          }
          @if (a.status === 'APPROVED') {
            <div class="note tone-ok">
              <rp-icon name="checkc" [size]="17" />
              <div class="grow">
                <b>Enrolled.</b> Admission number
                <span class="t-mono">{{ a.admissionNo ?? '—' }}</span> · {{ a.class?.name ?? ''
                }}{{ a.section ? ' ' + a.section.name : '' }} · {{ a.year.label }}. The student
                profile, campus and allowance wallets and the primary contact's link as the
                student's parent were created together.
              </div>
            </div>
          }
          <!-- The primary contact's mobile, verified before submitting and approval (client
               2026-10-27); applications from before are verified here. -->
          @if (!a.contactVerified && (a.status === 'DRAFT' || a.status === 'SUBMITTED')) {
            <div class="stack g8" id="ap-cv-box">
              <div class="note tone-warn">
                <rp-icon name="phone" [size]="17" />
                <div class="grow">
                  <b>The primary contact's mobile isn't verified.</b>
                  {{ a.status === 'DRAFT' ? 'Needed to submit.' : 'Needed before approval.' }}
                  @if (editable()) {
                    Press Verify; the family reads out the code sent to it.
                  }
                </div>
              </div>
              @if (editable() && a.primaryContact.mobile) {
                <rp-contact-verify
                  fid="ap-cv"
                  [mobile]="mobile(a.primaryContact.mobile)"
                  [verified]="a.contactVerified"
                  [sendCode]="sendCode"
                  [confirmCode]="confirmCode"
                  [counsellor]="true"
                />
              }
            </div>
          }
          @if (a.status === 'REJECTED') {
            <div class="note tone-bad">
              <rp-icon name="alertc" [size]="17" />
              <div class="grow">
                <b>Rejected{{ a.decidedAt ? ' ' + date(a.decidedAt) : '' }}.</b>
                {{ a.rejection ? reason(a.rejection.reasonCode) : ''
                }}{{ a.rejection?.remarks ? ' — ' + a.rejection.remarks : '' }}
              </div>
            </div>
          }

          @if (a.midTerm) {
            <div class="fs cc-mt" id="ap-mid">
              <h4>
                <rp-icon name="calendar" [size]="16" />Mid-term admission
                <span class="chip dot tone-accent">Mid-term</span>
              </h4>
              <div class="fs-b stack g12">
                <dl class="kv">
                  <dt>Joining date</dt>
                  <dd>{{ a.joiningDate ? long(a.joiningDate) : '—' }}</dd>
                  <dt>Why mid-term</dt>
                  <dd>{{ whyMid() }}</dd>
                  <dt>Reason</dt>
                  <dd>
                    @if (a.midTermReason) {
                      {{ a.midTermReason }}
                    } @else {
                      <span class="t-faint">—</span>
                    }
                  </dd>
                  <dt>Transfer certificate</dt>
                  <dd>
                    <span [class.t-bad]="tc().tone === 'bad'" [class.t-sb]="tc().tone === 'bad'">{{
                      tc().text
                    }}</span>
                    @if (tc().overdue) {
                      <span class="t-bad t-sb"> (overdue)</span>
                    }
                  </dd>
                  <dt>Attendance counted from</dt>
                  <dd>
                    {{ a.joiningDate ? date(a.joiningDate) : '—'
                    }}{{ year()?.endsOn ? ' · to ' + date(year()!.endsOn!) : '' }}
                  </dd>
                  <dt>Age on joining date</dt>
                  <dd>
                    @if (a.age; as g) {
                      {{ g.years }} years
                      @if (g.band && g.withinBand === false) {
                        <span class="t-bad">(outside {{ g.band.min }}–{{ g.band.max }})</span>
                      }
                    } @else {
                      <span class="t-faint">—</span>
                    }
                  </dd>
                </dl>
                @if (structure(); as s) {
                  <div class="stack g6" id="ap-structure">
                    <div class="row between">
                      <b class="t-sm">Fee from the class structure</b
                      ><span class="t-sm t-muted">{{ s.name }} · {{ rupees(s.v.total) }}</span>
                    </div>
                    @for (i of s.v.instalments; track i.seq) {
                      <div class="row between t-sm">
                        <span>{{ i.label }} · due {{ date(i.dueDate) }}</span
                        ><span [class]="before(i.dueDate) ? 't-faint' : 't-sb'"
                          >{{ rupees(i.amount)
                          }}{{ before(i.dueDate) ? ' · before joining' : '' }}</span
                        >
                      </div>
                    }
                    <p class="t-xs t-muted">
                      Instalments due before the joining date are marked. What the student is billed
                      follows the fee structure when it is assigned; entry fees are charged in full.
                    </p>
                  </div>
                } @else if (structureMissing()) {
                  <div class="note tone-warn">
                    <rp-icon name="alert" [size]="17" />
                    <div class="grow">
                      No fee structure is assigned to this class yet — ask the accountant to assign
                      one before approval.
                    </div>
                  </div>
                }
                @if (editable()) {
                  @if (!a.tc) {
                    <div class="note tone-warn" id="ap-tc-note">
                      <rp-icon name="alert" [size]="17" />
                      <div class="grow">
                        A mid-term application needs the transfer certificate, or a recorded
                        undertaking with the date it will be produced, before it can be approved.
                      </div>
                      <button
                        type="button"
                        class="btn btn-sec btn-sm note-a"
                        id="ap-tc"
                        (click)="tcMode.set('TC')"
                      >
                        <span>Record certificate</span>
                      </button>
                    </div>
                  } @else if (a.tc.mode === 'UNDERTAKING') {
                    <div>
                      <button
                        type="button"
                        class="btn btn-soft btn-sm"
                        id="ap-tc-received"
                        (click)="tcMode.set('TC')"
                      >
                        <rp-icon name="checkc" [size]="15" /><span>Certificate received</span>
                      </button>
                    </div>
                  }
                }
              </div>
            </div>
          }

          <div class="c-grid k2">
            <div class="fs">
              <h4>
                <rp-icon name="user" [size]="16" />Student
                @if (editable()) {
                  <span style="margin-left: auto"
                    ><button
                      type="button"
                      class="btn btn-ghost btn-xs"
                      id="ap-edit-student"
                      (click)="editing.set('student')"
                    >
                      <rp-icon name="edit" [size]="15" /><span>Edit</span>
                    </button></span
                  >
                }
              </h4>
              <div class="fs-b">
                <dl class="kv">
                  <dt>Name</dt>
                  <dd>{{ title() }}</dd>
                  <dt>Gender</dt>
                  <dd>{{ a.student.gender ? gender(a.student.gender) : '—' }}</dd>
                  <dt>Date of birth</dt>
                  <dd id="ap-dob">
                    @if (a.student.dob) {
                      {{ date(a.student.dob) }}
                      @if (a.age; as g) {
                        · {{ g.years }} yrs on {{ short(g.on) }}
                        @if (g.band && g.withinBand === false) {
                          <span class="t-bad">(band {{ g.band.min }}–{{ g.band.max }})</span>
                        }
                      }
                    } @else {
                      <span class="t-faint">—</span>
                    }
                  </dd>
                  <dt>Aadhaar</dt>
                  <dd id="ap-aadhaar" class="t-mono">{{ a.student.aadhaar || '—' }}</dd>
                  <dt>PAN</dt>
                  <dd id="ap-pan" class="t-mono">{{ a.student.pan || '—' }}</dd>
                  <dt>Contact number</dt>
                  <dd id="ap-smob">{{ a.student.mobile || '—' }}</dd>
                  <dt>E-mail</dt>
                  <dd id="ap-semail">{{ a.student.email || '—' }}</dd>
                  <dt>Category</dt>
                  <dd>{{ a.student.category ? category(a.student.category) : '—' }}</dd>
                  <dt>Medium</dt>
                  <dd>{{ a.student.medium || '—' }}</dd>
                  <dt>Blood group</dt>
                  <dd>{{ blood(a.student.bloodGroup) }}</dd>
                  <dt>Class sought</dt>
                  <dd>{{ a.class?.name ?? '—' }} · {{ a.year.label }}</dd>
                </dl>
              </div>
            </div>
            <div class="fs">
              <h4>
                <rp-icon name="users" [size]="16" />Parents
                @if (editable()) {
                  <span style="margin-left: auto"
                    ><button
                      type="button"
                      class="btn btn-ghost btn-xs"
                      id="ap-edit-parents"
                      (click)="editing.set('parents')"
                    >
                      <rp-icon name="edit" [size]="15" /><span>Edit</span>
                    </button></span
                  >
                }
              </h4>
              <div class="fs-b">
                <dl class="kv">
                  <dt>Father</dt>
                  <dd>{{ person(a.parents?.father?.name) || '—' }}</dd>
                  <!-- Each person's Aadhaar and PAN, masked (client 2026-10-13). -->
                  <dt>Father’s Aadhaar · PAN</dt>
                  <dd id="ap-f-ids" class="t-mono">{{ ids(a, 'father') }}</dd>
                  <!-- The occupation and annual income (client 2026-10-14). -->
                  @if (work(a.parents?.father); as w) {
                    <dt>Father’s occupation · income</dt>
                    <dd id="ap-f-work">{{ w }}</dd>
                  }
                  <dt>Mother</dt>
                  <dd>
                    {{ person(a.parents?.mother?.name) || '—' }}
                    @if (a.parents?.mother?.mobile; as m) {
                      · {{ mobile(m) }}
                    }
                  </dd>
                  <dt>Mother’s Aadhaar · PAN</dt>
                  <dd id="ap-m-ids" class="t-mono">{{ ids(a, 'mother') }}</dd>
                  @if (work(a.parents?.mother); as w) {
                    <dt>Mother’s occupation · income</dt>
                    <dd id="ap-m-work">{{ w }}</dd>
                  }
                  <dt>Children</dt>
                  <dd id="ap-children">
                    {{
                      a.parents?.children === 'SINGLE'
                        ? 'Single child'
                        : a.parents?.children === 'MORE'
                          ? 'More than one child'
                          : '—'
                    }}
                  </dd>
                  @if (a.parents?.transport !== undefined) {
                    <dt>Transport</dt>
                    <dd id="ap-transport">
                      @if (a.parents.transport) {
                        Opted ·
                        {{
                          a.parents.transportStop
                            ? 'pick-up at ' + a.parents.transportStop.name
                            : 'pick-up point to be decided'
                        }}
                      } @else {
                        Not opted
                      }
                    </dd>
                  }
                  @if (a.parents?.guardian; as g) {
                    <dt>Guardian</dt>
                    <dd>{{ person(g.name) }} ({{ g.relation }})</dd>
                    @if (a.parents.primary === 'GUARDIAN') {
                      <dt>Guardian’s Aadhaar · PAN</dt>
                      <dd id="ap-g-ids" class="t-mono">{{ ids(a, 'guardian') }}</dd>
                    }
                  }
                  @if (a.parents?.hostel && a.parents.localGuardian; as lg) {
                    <dt>Hostel</dt>
                    <dd id="ap-hostel">
                      Local guardian {{ person(lg.name) }} ({{ lg.relation }}) ·
                      {{ mobile(lg.mobile) }}
                    </dd>
                    <dt>Local guardian’s Aadhaar · PAN</dt>
                    <dd id="ap-lg-ids" class="t-mono">{{ ids(a, 'localGuardian') }}</dd>
                  }
                  <dt>Primary contact</dt>
                  <dd>
                    {{
                      a.primaryContact.name
                        ? person(a.primaryContact.name) +
                          (a.primaryContact.relation
                            ? ' (' + relation(a.primaryContact.relation) + ')'
                            : '')
                        : '—'
                    }}
                  </dd>
                  <dt>Mobile</dt>
                  <dd id="ap-pc-mobile">
                    {{ a.primaryContact.mobile ? mobile(a.primaryContact.mobile) : '—' }}
                    <!-- Verified with a one-time code (client 2026-10-27). -->
                    @if (a.contactVerified) {
                      <span class="chip dot tone-ok">Verified</span>
                    } @else if (a.status === 'DRAFT' || a.status === 'SUBMITTED') {
                      <span class="chip dot tone-warn">Not verified</span>
                    }
                  </dd>
                  <dt>E-mail</dt>
                  <dd>{{ a.primaryContact.email || '—' }}</dd>
                </dl>
              </div>
            </div>
            <div class="fs">
              <h4>
                <rp-icon name="pin" [size]="16" />Addresses
                @if (editable()) {
                  <span style="margin-left: auto"
                    ><button
                      type="button"
                      class="btn btn-ghost btn-xs"
                      id="ap-edit-addresses"
                      (click)="editing.set('addresses')"
                    >
                      <rp-icon name="edit" [size]="15" /><span>Edit</span>
                    </button></span
                  >
                }
              </h4>
              <div class="fs-b">
                @if (a.addresses; as ad) {
                  <dl class="kv">
                    <dt>Residential</dt>
                    <dd>{{ address(ad.residential) }}</dd>
                    <dt>Correspondence</dt>
                    <dd>
                      {{
                        ad.sameAsResidential || !ad.correspondence
                          ? 'Same as residential'
                          : address(ad.correspondence)
                      }}
                    </dd>
                  </dl>
                } @else {
                  <p class="t-sm t-muted">
                    Not given yet — the residential address is needed to submit.
                  </p>
                }
              </div>
            </div>
            <div class="fs">
              <h4>
                <rp-icon name="school" [size]="16" />Previous school
                @if (editable()) {
                  <span style="margin-left: auto"
                    ><button
                      type="button"
                      class="btn btn-ghost btn-xs"
                      id="ap-edit-previous"
                      (click)="editing.set('previous')"
                    >
                      <rp-icon name="edit" [size]="15" /><span>Edit</span>
                    </button></span
                  >
                }
              </h4>
              <div class="fs-b">
                @if (a.previous && (a.previous.school || a.previous.lastClass)) {
                  <dl class="kv">
                    <dt>School</dt>
                    <dd>{{ a.previous.school || '—' }}</dd>
                    <dt>Last class</dt>
                    <dd>{{ a.previous.lastClass || '—' }}</dd>
                    <dt>Result</dt>
                    <dd>{{ a.previous.result || '—' }}</dd>
                    <dt>Board</dt>
                    <dd>{{ boardText() }}</dd>
                  </dl>
                } @else {
                  <p class="t-sm t-muted">
                    {{
                      classOrder() !== null && classOrder()! <= 1
                        ? 'Not needed for Nursery and LKG.'
                        : 'Not given.'
                    }}
                  </p>
                }
              </div>
            </div>
          </div>

          <div class="fs" id="ap-refs">
            <h4>
              <rp-icon name="handshake" [size]="16" />References
              <span class="t-xs t-muted t-m" style="margin-left: 6px"
                >{{ a.references.length }} of {{ refMax }}</span
              >
            </h4>
            <div class="fs-b">
              <div class="stack g10">
                @if (a.midTerm && !a.references.length) {
                  <div class="note tone-bad">
                    <rp-icon name="alertc" [size]="17" />
                    <div class="grow">
                      No reference yet — one is required before this mid-term application can be
                      approved.
                    </div>
                  </div>
                }
                <p class="t-sm t-muted">
                  {{
                    a.midTerm
                      ? 'At least one reference is required and up to three are allowed on a mid-term application.'
                      : 'References are optional; up to three are allowed.'
                  }}
                  Referees are not contacted by the platform.
                </p>
                @if (a.references.length) {
                  <div class="list plain">
                    @for (r of a.references; track r.id) {
                      <div class="li">
                        <span class="li-ic sm"><rp-icon name="user" [size]="16" /></span
                        ><span class="li-main"
                          ><span class="li-t">{{ person(r.name) }}</span
                          ><span class="li-s"
                            >{{ r.relation || 'Relation not given' }} · {{ mobile(r.mobile)
                            }}{{ r.email ? ' · ' + r.email : '' }}</span
                          ></span
                        >
                        @if (editable()) {
                          <span class="li-r"
                            ><button
                              type="button"
                              class="iconbtn"
                              title="Remove reference"
                              [attr.aria-label]="'Remove reference ' + person(r.name)"
                              [disabled]="busy() === 'ref-' + r.id"
                              (click)="removeRef(r)"
                            >
                              <rp-icon name="x" [size]="16" /></button
                          ></span>
                        }
                      </div>
                    }
                  </div>
                }
                @if (editable() && a.references.length < refMax) {
                  <div class="cc-inline" id="ap-ref-form">
                    <div class="c-form c3">
                      <div class="fld" [class.invalid]="refErr('name')">
                        <label class="fld-l" for="rf-n">Name</label>
                        <div class="fld-in">
                          <input
                            id="rf-n"
                            placeholder="Full name"
                            maxlength="100"
                            autocomplete="off"
                            aria-describedby="rf-n-e"
                            [value]="refName()"
                            (input)="refName.set(val($event)); clearRef('name')"
                          />
                        </div>
                        <div class="fld-e" id="rf-n-e" role="alert">
                          <rp-icon name="alertc" [size]="14" /><span>{{ refErr('name') }}</span>
                        </div>
                      </div>
                      <div class="fld" [class.invalid]="refErr('rel')">
                        <label class="fld-l" for="rf-r">Relation to the student</label>
                        <div class="fld-in">
                          <input
                            id="rf-r"
                            placeholder="e.g. Class teacher, previous school"
                            maxlength="60"
                            autocomplete="off"
                            aria-describedby="rf-r-e"
                            [value]="refRel()"
                            (input)="refRel.set(val($event)); clearRef('rel')"
                          />
                        </div>
                        <div class="fld-e" id="rf-r-e" role="alert">
                          <rp-icon name="alertc" [size]="14" /><span>{{ refErr('rel') }}</span>
                        </div>
                      </div>
                      <div class="fld" [class.invalid]="refErr('mobile')">
                        <label class="fld-l" for="rf-p">Mobile</label>
                        <div class="fld-in">
                          <input
                            id="rf-p"
                            placeholder="10 digits"
                            inputmode="numeric"
                            maxlength="10"
                            autocomplete="off"
                            aria-describedby="rf-p-e"
                            [value]="refMobile()"
                            (input)="refMobile.set(digits($event)); clearRef('mobile')"
                          />
                        </div>
                        <div class="fld-e" id="rf-p-e" role="alert">
                          <rp-icon name="alertc" [size]="14" /><span>{{ refErr('mobile') }}</span>
                        </div>
                      </div>
                    </div>
                    <div class="row end mt8">
                      <button
                        type="button"
                        class="btn btn-sec btn-sm"
                        id="ap-ref-add"
                        [class.is-busy]="busy() === 'ref'"
                        [disabled]="busy() === 'ref'"
                        (click)="addRef()"
                      >
                        <rp-icon name="plus" [size]="15" /><span>Add reference</span>
                      </button>
                    </div>
                  </div>
                }
              </div>
            </div>
          </div>

          <div class="c-grid k2">
            <div class="fs" id="ap-docs">
              <h4><rp-icon name="clip" [size]="16" />Documents</h4>
              <div class="fs-b">
                <div class="stack g10">
                  @if (a.documents.length) {
                    <div class="list plain">
                      @for (d of a.documents; track d.type) {
                        <div class="li">
                          <span class="li-ic sm"><rp-icon name="file" [size]="16" /></span
                          ><span class="li-main"
                            ><span class="li-t">{{ docType(d.type) }}</span
                            ><span class="li-s">{{ d.name }} · {{ size(d.sizeBytes) }}</span></span
                          >
                          @if (d.url) {
                            <span class="li-r"
                              ><a
                                class="iconbtn"
                                [href]="d.url"
                                target="_blank"
                                rel="noopener"
                                [attr.download]="d.name"
                                title="Download"
                                [attr.aria-label]="'Download ' + docType(d.type)"
                                ><rp-icon name="download" [size]="16" /></a
                            ></span>
                          }
                        </div>
                      }
                    </div>
                  } @else {
                    <p class="t-sm t-muted">No documents yet.</p>
                  }
                  @if (missingDocs().length && a.status === 'DRAFT') {
                    <p class="t-xs t-warn">Needed to submit: {{ missingDocs().join(', ') }}.</p>
                  }
                  @if (editable()) {
                    <div class="fld">
                      <rp-dd
                        inputId="ap-doc-type"
                        placeholder="Document type"
                        [options]="docOptions()"
                        [value]="docKind()"
                        (changed)="docPicked.set($any($event))"
                      />
                    </div>
                    <div class="fld" [class.invalid]="docErr()">
                      <label class="upl" [class.done]="busy() === 'doc'" for="ap-doc"
                        ><span class="upl-ic"
                          ><rp-icon
                            [name]="busy() === 'doc' ? 'hourglass' : 'upload'"
                            [size]="20" /></span
                        ><span class="grow" style="min-width: 0"
                          ><span class="t-h4 t-clip" style="display: block">{{
                            busy() === 'doc' ? 'Uploading…' : 'Add a document'
                          }}</span
                          ><span class="t-xs t-muted">PDF, JPG or PNG · up to 2 MB</span></span
                        ><input
                          type="file"
                          id="ap-doc"
                          [attr.accept]="accept"
                          aria-describedby="ap-doc-e"
                          [disabled]="busy() === 'doc'"
                          (change)="pickDoc($event)"
                      /></label>
                      <div class="fld-e" id="ap-doc-e" role="alert">
                        <rp-icon name="alertc" [size]="14" /><span>{{ docErr() }}</span>
                      </div>
                    </div>
                  }
                </div>
              </div>
            </div>
            <div class="fs" id="ap-fees">
              <h4><rp-icon name="receipt" [size]="16" />Declaration and fees</h4>
              <div class="fs-b">
                <dl class="kv">
                  <dt>Declaration</dt>
                  <dd>
                    @if (a.declaration?.at) {
                      Accepted by {{ person(a.declaration!.by) || 'the family' }} ·
                      {{ date(a.declaration!.at!) }}
                    } @else {
                      <span class="t-warn">Not accepted yet</span>
                    }
                  </dd>
                  <dt>Account consent</dt>
                  <dd id="ap-consent">
                    @if (a.registrationConsentAt) {
                      Agreed to register their CampusOne account with these details ·
                      {{ date(a.registrationConsentAt) }}
                    } @else {
                      <span class="t-warn">Not given yet</span>
                    }
                  </dd>
                  <dt>Application fee</dt>
                  <dd>
                    @if (appFee(); as f) {
                      {{ inr(f.amount) }} ·
                      <span [class]="'t-sb t-' + chip(f).tone">{{ chip(f).l }}</span>
                      @if (f.receiptNo) {
                        <span class="t-mono t-xs"> {{ f.receiptNo }}</span>
                      }
                      <!-- The payment gateway's transaction ID (client 2026-10-16). -->
                      @if (f.transactionId) {
                        <div class="t-xs t-muted" id="ap-app-txn">
                          Transaction ID <span class="t-mono">{{ f.transactionId }}</span>
                        </div>
                      } @else if (!f.receiptNo && a.status !== 'DRAFT') {
                        <span class="t-faint t-xs"> — collected on Admission fees</span>
                      }
                    } @else {
                      <span class="t-faint">Not due yet</span>
                    }
                  </dd>
                  <dt>Admission fee</dt>
                  <dd>
                    @if (admFee(); as f) {
                      {{ inr(f.amount) }} ·
                      <span [class]="'t-sb t-' + chip(f).tone">{{ chip(f).l }}</span
                      >{{ f.mode ? ' (' + (f.mode === 'CASH' ? 'Cash' : 'Online') + ')' : '' }}
                      @if (f.transactionId) {
                        <div class="t-xs t-muted" id="ap-adm-txn">
                          Transaction ID <span class="t-mono">{{ f.transactionId }}</span>
                        </div>
                      }
                    } @else if (a.admissionFeeDue && a.status !== 'DRAFT') {
                      {{ inr(a.admissionFeeDue) }} ·
                      <span class="t-warn">Due — collected on Admission fees</span>
                    } @else {
                      <span class="t-faint">Paid with the submitted form, or after</span>
                    }
                  </dd>
                  @if (a.paymentStatus && a.status === 'SUBMITTED') {
                    <dt>Payment</dt>
                    <dd id="ap-payment">
                      <span [class]="'t-sb t-' + payment(a.paymentStatus).tone">{{
                        payment(a.paymentStatus).l
                      }}</span>
                    </dd>
                  }
                  <dt>Source</dt>
                  <dd>{{ source() }}</dd>
                </dl>
              </div>
            </div>
          </div>

          @if (fields().length) {
            <div class="fs" id="ap-fields">
              <h4>
                <rp-icon name="field" [size]="16" />Institution fields
                @if (editable()) {
                  <span style="margin-left: auto"
                    ><button
                      type="button"
                      class="btn btn-ghost btn-xs"
                      id="ap-edit-fields"
                      (click)="editing.set('customFields')"
                    >
                      <rp-icon name="edit" [size]="15" /><span>Edit</span>
                    </button></span
                  >
                }
              </h4>
              <div class="fs-b">
                <dl class="kv">
                  @for (f of fields(); track f.id) {
                    <dt>{{ f.label }}</dt>
                    <dd>
                      @if (cf(f.id); as v) {
                        {{ v }}
                      } @else {
                        <span class="t-faint">—</span>
                      }
                    </dd>
                  }
                </dl>
              </div>
            </div>
          }

          <div class="fs" id="ap-history">
            <h4><rp-icon name="history" [size]="16" />History</h4>
            <div class="fs-b">
              <div class="tl">
                @for (h of history(); track $index) {
                  <div
                    class="tl-i"
                    [class.done]="h.state === 'done'"
                    [class.bad]="h.state === 'bad'"
                    [class.now]="h.state === 'now'"
                  >
                    <span class="tl-dot"
                      ><rp-icon [name]="h.icon" [size]="13" [stroke]="2.6"
                    /></span>
                    <div class="tl-c">
                      <div class="tl-t">{{ h.title }}</div>
                      @if (h.sub) {
                        <div class="tl-s">{{ h.sub }}</div>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>
          </div>
        </div>
      } @else if (error()) {
        <rp-empty icon="alertc" title="Couldn't load the application" [text]="error()">
          <button type="button" class="btn btn-sec btn-sm" (click)="reload()">
            <span>Try again</span>
          </button>
        </rp-empty>
      } @else {
        <rp-empty icon="hourglass" title="Loading…" />
      }

      <div modal-foot class="row g8">
        @if (app(); as a) {
          @if (a.status === 'SUBMITTED') {
            <button type="button" class="btn btn-ghost" (click)="closed.emit()">
              <span>Close</span>
            </button>
            <span class="cp-why" [attr.title]="decideWhy() || null"
              ><button
                type="button"
                class="btn btn-danger-o"
                id="ap-reject"
                [disabled]="!!decideWhy()"
                (click)="rejecting.set(true)"
              >
                <rp-icon name="xc" [size]="17" /><span>Reject</span>
              </button></span
            >
            <span class="cp-why" [attr.title]="assignWhy() || null"
              ><button
                type="button"
                class="btn btn-pri"
                id="ap-approve"
                [disabled]="!!assignWhy()"
                (click)="rolledBack.set(''); approving.set(true)"
              >
                <rp-icon name="usercheck" [size]="17" /><span>Approve admission</span>
              </button></span
            >
          } @else if (a.status === 'DRAFT') {
            <button type="button" class="btn btn-ghost" (click)="closed.emit()">
              <span>Close</span>
            </button>
            @if (!editWhy()) {
              <!-- The draft in the form it was started in (client 2026-10-15). -->
              <button type="button" class="btn btn-sec" id="ap-continue" (click)="continueForm(a)">
                <rp-icon name="edit" [size]="17" /><span>Continue in the form</span>
              </button>
            }
            @if (feeWaiting() && !collectWhy()) {
              <button type="button" class="btn btn-sec" id="ap-cash" (click)="cashing.set(true)">
                <rp-icon name="rupee" [size]="17" /><span>Record fee in cash</span>
              </button>
            }
            <span class="cp-why" [attr.title]="submitWhy() || null"
              ><button
                type="button"
                class="btn btn-pri"
                id="ap-submit"
                [class.is-busy]="busy() === 'submit'"
                [disabled]="!!submitWhy() || busy() === 'submit'"
                (click)="submit()"
              >
                <rp-icon name="send" [size]="17" /><span>Submit application</span>
              </button></span
            >
          } @else {
            <button type="button" class="btn btn-sec" (click)="closed.emit()">
              <span>Close</span>
            </button>
          }
        } @else {
          <button type="button" class="btn btn-sec" (click)="closed.emit()">
            <span>Close</span>
          </button>
        }
      </div>
    </rp-modal>

    @if (app(); as a) {
      @if (approving()) {
        <rp-application-approve
          [application]="a"
          [userTypes]="userTypes()"
          [classes]="classes()"
          [structureName]="structure()?.name ?? null"
          (closed)="approving.set(false)"
          (approved)="decided($event)"
          (failed)="approveFailed($event)"
          (tcSaved)="replace($event)"
        />
      }
      @if (rejecting()) {
        <rp-application-reject
          [application]="a"
          (closed)="rejecting.set(false)"
          (rejected)="decided($event)"
        />
      }
      @if (tcMode(); as m) {
        <rp-transfer-certificate
          [application]="a"
          [mode]="m"
          (closed)="tcMode.set(null)"
          (saved)="tcMode.set(null); replace($event)"
        />
      }
      @if (editing(); as s) {
        <rp-application-section
          [application]="a"
          [section]="s"
          [classes]="classes()"
          [fields]="fields()"
          (closed)="editing.set(null)"
          (saved)="editing.set(null); replace($event)"
        />
      }
      @if (cashing()) {
        <rp-cash-collection
          [target]="cashTarget()!"
          (closed)="cashing.set(false)"
          (recorded)="cashed($event)"
        />
      }
    }
  `,
})
export class ApplicationDrawer {
  private readonly api = inject(ApplicationsApi);
  private readonly feesApi = inject(FeesApi);
  private readonly admissionFees = inject(AdmissionFeesApi);
  private readonly overlays = inject(Overlays);
  private readonly router = inject(Router);

  readonly applicationId = input.required<string>();
  readonly years = input<readonly YearOption[]>([]);
  readonly classes = input<readonly ClassView[]>([]);
  readonly userTypes = input<readonly UserType[]>([]);
  /** The institution's active fields for applications (CR-12). */
  readonly fields = input<readonly CustomField[]>([]);
  /** Why applications can't be changed here ('' when they can). */
  readonly editWhy = input('');
  /** Why this person can't decide ('' when they can). */
  readonly approveWhy = input('');
  /** Why this person can't record cash ('' when they can). */
  readonly collectWhy = input('');
  /** The fee structures can be read (fees.view): the mid-term block shows the class's fees. */
  readonly canSeeFees = input(false);
  readonly closed = output<void>();
  /** The application changed (the list and its counts reload). */
  readonly changed = output<Application>();

  /** The draft opens in the counsellor's form, the public form's steps (client 2026-10-15). */
  protected continueForm(a: Application) {
    this.closed.emit();
    void this.router.navigate(['/console/applications/new'], { queryParams: { app: a.id } });
  }

  protected readonly refMax = REF_MAX;
  protected readonly accept = DOC_ACCEPT;
  protected readonly person = person;
  protected readonly today = istBusinessDate(new Date());
  protected readonly app = signal<Application | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal<string | null>(null);
  protected readonly rolledBack = signal('');
  protected readonly approving = signal(false);
  protected readonly rejecting = signal(false);
  protected readonly cashing = signal(false);
  protected readonly tcMode = signal<'TC' | 'UNDERTAKING' | null>(null);
  protected readonly editing = signal<SectionName | null>(null);
  protected readonly refName = signal('');
  protected readonly refRel = signal('');
  protected readonly refMobile = signal('');
  protected readonly refErrors = signal<Partial<Record<RefField, string>>>({});
  protected readonly docPicked = signal<DocType | ''>('');
  protected readonly docErr = signal('');
  protected readonly structures = signal<readonly { name: string; v: StructureVersion }[] | null>(
    null,
  );
  private loaded = '';
  private refKey = newIdempotencyKey();
  private submitKey = newIdempotencyKey();

  protected readonly title = computed(() => {
    const a = this.app();
    return a ? appName(a) : 'Application';
  });
  protected readonly sub = computed(() => {
    const a = this.app();
    if (!a) return '';
    return [a.applicationNo, a.class?.name, a.year.label, a.midTerm ? 'Mid-term' : '']
      .filter(Boolean)
      .join(' · ');
  });
  protected readonly editable = computed(() => {
    const a = this.app();
    return !!a && (a.status === 'DRAFT' || a.status === 'SUBMITTED') && !this.editWhy();
  });
  protected readonly lockedWhy = computed(() => {
    const a = this.app();
    return a && (a.status === 'DRAFT' || a.status === 'SUBMITTED') && this.editWhy()
      ? this.editWhy()
      : '';
  });
  protected readonly year = computed(() => this.years().find((y) => y.id === this.app()?.year.id));
  protected readonly classOrder = computed(() => {
    const id = this.app()?.class?.id;
    const c = this.classes().find((x) => x.id === id);
    return c ? c.order : null;
  });
  protected readonly whyMid = computed(() => {
    const y = this.year();
    return y?.startsOn
      ? `Joins after the year began on ${formatDate(y.startsOn)}`
      : 'The academic year has already begun';
  });
  protected readonly tc = computed(() => tcState(this.app()?.tc ?? null, this.today));
  protected readonly appFee = computed(() => {
    const a = this.app();
    return a ? feeOf(a, 'APPLICATION') : null;
  });
  protected readonly admFee = computed(() => {
    const a = this.app();
    return a ? feeOf(a, 'ADMISSION') : null;
  });
  /** A declared draft whose application fee isn't paid yet (it submits once the fee is in). */
  protected readonly feeWaiting = computed(() => {
    const a = this.app();
    const f = this.appFee();
    return !!a && a.status === 'DRAFT' && !!a.declaration && !!f && f.status !== 'PAID';
  });
  protected readonly decideWhy = computed(() => this.approveWhy());
  /**
   * Approving assigns the admission number and section: only once Accounts has confirmed both fees
   * (client 2026-10-09). Rejecting needs no payment.
   */
  protected readonly assignWhy = computed(() => {
    if (this.decideWhy()) return this.decideWhy();
    // Only the verified primary contact becomes the student's parent (client 2026-10-27).
    if (this.app()?.contactVerified === false) return NOT_VERIFIED;
    const s = this.app()?.paymentStatus;
    return s && s !== 'CONFIRMED'
      ? 'Waiting for Accounts to confirm the application fee and the admission fee'
      : '';
  });
  protected readonly submitWhy = computed(() => {
    if (this.editWhy()) return this.editWhy();
    if (this.app()?.contactVerified === false) return NOT_VERIFIED;
    const f = this.appFee();
    if (this.feeWaiting() && f) {
      return `The ${inr0(paiseOf(f.amount))} application fee must be paid first (FR-ADM-08)`;
    }
    return '';
  });
  /** The documents a submission needs that aren't attached yet. */
  protected readonly missingDocs = computed(() => {
    const a = this.app();
    if (!a) return [];
    const need: DocType[] = ['BIRTH', 'ADDRESS'];
    const order = this.classOrder();
    if (order !== null && order >= 3) need.push('REPORT');
    // Both sides of the Aadhaar and PAN cards (client 2026-10-13): the father's and the mother's,
    // a guardian's who is the primary contact, a hostel student's local guardian's.
    const n = idsNeeded(a.parents?.primary ?? a.primaryContact.relation, !!a.parents?.hostel);
    const owners: CardOwner[] = [
      ...n.parents.map((k) => k.toUpperCase() as CardOwner),
      ...(n.localGuardian ? (['LOCAL_GUARDIAN'] as const) : []),
    ];
    for (const o of owners) {
      need.push(`${o}_AADHAAR_FRONT`, `${o}_AADHAAR_BACK`, `${o}_PAN_FRONT`, `${o}_PAN_BACK`);
    }
    return need.filter((t) => !a.documents.some((d) => d.type === t)).map((t) => DOC_TYPE[t]);
  });
  protected readonly docOptions = computed<DropdownOption[]>(() => {
    const a = this.app();
    const have = new Set(a?.documents.map((d) => d.type) ?? []);
    const need = new Set(this.missingDocs());
    return (Object.keys(DOC_TYPE) as DocType[]).map((t) => ({
      v: t,
      l: DOC_TYPE[t],
      ...(need.has(DOC_TYPE[t])
        ? { sub: 'Needed to submit' }
        : have.has(t)
          ? { sub: 'Replaces the one attached' }
          : {}),
    }));
  });
  /** The type an upload is filed under: the one picked, else the first one still needed. */
  protected readonly docKind = computed<DocType>(() => {
    if (this.docPicked()) return this.docPicked() as DocType;
    const missing = this.missingDocs()[0];
    const t = (Object.keys(DOC_TYPE) as DocType[]).find((k) => DOC_TYPE[k] === missing);
    return t ?? 'OTHER';
  });
  /** The class's fee structure of the application's year (mid-term block). */
  protected readonly structure = computed(() => {
    const id = this.app()?.class?.id;
    return this.structures()?.find((s) => s.v.classes.some((c) => c.id === id)) ?? null;
  });
  protected readonly structureMissing = computed(
    () => this.structures() !== null && !this.structure(),
  );
  protected readonly history = computed(() => {
    const a = this.app();
    return a ? historyOf(a) : [];
  });
  /** Record cash for the application fee (ADM-022): the application as it then stands. */
  protected readonly cashTarget = computed<CashTarget<{
    receiptNo: string;
    application: Application;
  }> | null>(() => {
    const a = this.app();
    const f = this.appFee();
    if (!a || !f) return null;
    const student = appName(a);
    return {
      fee: 'Application fee',
      sub: [student, a.applicationNo, a.admissionNo ? `admission number ${a.admissionNo}` : '']
        .filter(Boolean)
        .join(' · '),
      student,
      amount: f.amount,
      payer: person(a.primaryContact.name),
      record: async (entry, key) => {
        const r = await this.admissionFees.cash(a.id, { feeType: 'APPLICATION', ...entry }, key);
        return { receiptNo: r.receipt.receiptNo, application: r.application };
      },
    };
  });
  protected readonly boardText = computed(() => {
    const p = this.app()?.previous;
    if (!p?.board) return '—';
    return p.board === 'OTHER' && p.otherBoard ? p.otherBoard : BOARD[p.board];
  });

  constructor() {
    effect(() => {
      const id = this.applicationId();
      untracked(() => {
        if (id === this.loaded) return;
        this.loaded = id;
        this.app.set(null);
        this.rolledBack.set('');
        this.structures.set(null);
        void this.reload();
      });
    });
  }

  protected async reload() {
    const id = this.applicationId();
    this.error.set('');
    try {
      const a = await this.api.detail(id);
      if (this.applicationId() !== id) return;
      this.app.set(a);
      if (a.midTerm && this.canSeeFees() && this.structures() === null) void this.loadStructures(a);
    } catch (e) {
      if (this.applicationId() === id) {
        this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
      }
    }
  }

  private async loadStructures(a: Application) {
    try {
      const r = await this.feesApi.structures({ yearId: a.year.id });
      this.structures.set(
        r.items
          .map((s) => ({ name: s.name, v: s.active ?? s.current }))
          .filter((s) => s.v.state === 'ACTIVE' || s.v.state === 'PENDING'),
      );
    } catch {
      // Without the structures the block leaves the fee out.
    }
  }

  /** A newer copy from the server (an edit, a reference, a document, the certificate). */
  protected replace(a: Application) {
    this.app.set(a);
    this.changed.emit(a);
  }

  // --- the primary contact's mobile (client 2026-10-27) -------------------------------------------
  /** A code to the saved mobile; the family reads it out to the office. */
  protected readonly sendCode = () => this.api.contactOtp(this.applicationId());
  protected readonly confirmCode = async (challengeId: string, otp: string) => {
    const out = await this.api.verifyContactOtp(this.applicationId(), { challengeId, otp });
    this.replace(out.application);
  };

  // --- references (ADM-026 / ADM-027) -------------------------------------------------------------
  protected refErr(f: RefField) {
    return this.refErrors()[f] ?? '';
  }
  protected clearRef(f: RefField) {
    if (this.refErrors()[f]) this.refErrors.update((e) => ({ ...e, [f]: '' }));
  }

  protected async addRef() {
    const a = this.app();
    if (!a) return;
    const name = this.refName().trim().replace(/\s+/g, ' ');
    const rel = this.refRel().trim();
    const mob = this.refMobile().trim();
    const e: Partial<Record<RefField, string>> = {};
    if (!name) e.name = "Enter the referee's name";
    else if (!PATTERNS.personName.test(name)) e.name = 'Use letters only';
    if (!rel) e.rel = 'Say how the referee knows the student';
    if (!mob) e.mobile = 'Enter a mobile number';
    else if (!PATTERNS.mobile.test(mob)) e.mobile = translate('ADM.MOBILE_INVALID');
    else if (a.references.some((r) => r.mobile === mob)) {
      e.mobile = 'This referee is already on the application';
    }
    this.refErrors.set(e);
    if (Object.values(e).some(Boolean)) return;
    this.busy.set('ref');
    try {
      const out = await this.api.addReference(
        a.id,
        { name, relation: rel, mobile: mob },
        this.refKey,
      );
      this.refKey = newIdempotencyKey();
      this.refName.set('');
      this.refRel.set('');
      this.refMobile.set('');
      this.replace(out);
      this.overlays.toast('Reference added', { sub: `${out.references.length} of ${REF_MAX}` });
    } catch (x) {
      this.refKey = newIdempotencyKey();
      if (x instanceof ApiProblem && x.errors.length) {
        const f: Partial<Record<RefField, string>> = {};
        for (const y of x.errors) {
          const k: RefField | null =
            y.field === 'name'
              ? 'name'
              : y.field === 'relation'
                ? 'rel'
                : y.field === 'mobile'
                  ? 'mobile'
                  : null;
          if (k) f[k] = y.message;
        }
        this.refErrors.set(f);
      } else {
        this.overlays.toast("Couldn't add the reference", {
          tone: 'bad',
          sub: x instanceof ApiProblem ? x.detail : translate('GEN.UNAVAILABLE'),
        });
      }
    } finally {
      this.busy.set(null);
    }
  }

  protected async removeRef(r: Application['references'][number]) {
    const a = this.app();
    if (!a) return;
    const ok = await this.overlays.confirm({
      title: 'Remove this reference?',
      text: `${person(r.name)} will be removed from the application.`,
      ok: 'Remove',
      tone: 'warn',
    });
    if (!ok) return;
    this.busy.set(`ref-${r.id}`);
    try {
      const out = await this.api.removeReference(a.id, r.id);
      this.replace(out);
      this.overlays.toast('Reference removed');
    } catch (x) {
      this.overlays.toast("Couldn't remove the reference", {
        tone: 'bad',
        sub: x instanceof ApiProblem ? x.detail : translate('GEN.UNAVAILABLE'),
      });
    } finally {
      this.busy.set(null);
    }
  }

  // --- documents (ADM-028) -------------------------------------------------------------------------
  protected async pickDoc(e: Event) {
    const el = e.target as HTMLInputElement;
    const f = el.files?.[0] ?? null;
    el.value = '';
    const a = this.app();
    this.docErr.set('');
    if (!f || !a) return;
    if (f.size > DOC_MAX_BYTES) {
      this.docErr.set('The file must be under 2 MB.');
      return;
    }
    if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) {
      this.docErr.set('Choose a PDF, JPG or PNG file.');
      return;
    }
    const kind = this.docKind();
    this.busy.set('doc');
    try {
      const out = await this.api.addDocument(a.id, kind, f, newIdempotencyKey());
      this.docPicked.set('');
      this.replace(out);
      this.overlays.toast('Document added', { sub: `${DOC_TYPE[kind]} · ${f.name}` });
    } catch (x) {
      this.docErr.set(
        x instanceof ApiProblem ? (x.errors[0]?.message ?? x.detail) : translate('GEN.UNAVAILABLE'),
      );
    } finally {
      this.busy.set(null);
    }
  }

  // --- submission (ADM-030) and the decisions ----------------------------------------------------
  protected async submit() {
    const a = this.app();
    if (!a || this.submitWhy()) return;
    const ok = await this.overlays.confirm({
      title: 'Submit this application?',
      text: `${appName(a)} will move to Submitted for review — straight away, or once the application fee is paid when it is mandatory. Submit only if the family has read and accepted the declaration, and agrees that the information collected will be used to register their account in CampusOne; they can no longer edit it.`,
      ok: 'Submit application',
    });
    if (!ok) return;
    this.busy.set('submit');
    try {
      const out = await this.api.submit(a.id, this.submitKey);
      this.submitKey = newIdempotencyKey();
      this.replace(out.application);
      if (out.status === 'SUBMITTED') {
        this.overlays.toast('Application submitted', { sub: out.applicationNo });
      } else {
        this.overlays.toast('Declared — waiting for the application fee', {
          tone: 'info',
          sub: out.feeDue
            ? `${inr0(paiseOf({ amount: out.feeDue.amount }))} to pay before it is submitted`
            : out.applicationNo,
        });
      }
    } catch (x) {
      this.submitKey = newIdempotencyKey();
      // A number shared by two people says so (client 2026-10-14); anything else is missing.
      const same =
        x instanceof ApiProblem ? x.errors.find((e) => e.code.startsWith('ADM.SAME_')) : null;
      const detail =
        x instanceof ApiProblem
          ? same
            ? same.message
            : x.errors.length
              ? this.missingText(x.errors.map((e) => e.field))
              : x.detail
          : translate('GEN.UNAVAILABLE');
      this.overlays.toast("Couldn't submit the application", { tone: 'bad', sub: detail });
      // Not verified after all (the number changed meanwhile): the drawer offers Verify again.
      if (x instanceof ApiProblem && x.code === 'ADM.CONTACT_NOT_VERIFIED') void this.reload();
    } finally {
      this.busy.set(null);
    }
  }

  /** What a refused submission lacks, in the drawer's words. */
  private missingText(fields: readonly string[]) {
    const names: Record<string, string> = {
      'class.classId': 'the class sought',
      'student.firstName': 'the first name',
      'student.lastName': 'the last name',
      'student.gender': 'the gender',
      'student.dob': 'the date of birth',
      // Client 2026-10-13: each person's Aadhaar, PAN and cards.
      'parents.father.aadhaar': 'the father’s Aadhaar number',
      'parents.father.pan': 'the father’s PAN',
      'parents.mother.aadhaar': 'the mother’s Aadhaar number',
      'parents.mother.pan': 'the mother’s PAN',
      'parents.guardian.aadhaar': 'the guardian’s Aadhaar number',
      'parents.guardian.pan': 'the guardian’s PAN',
      'parents.localGuardian.aadhaar': 'the local guardian’s Aadhaar number',
      'parents.localGuardian.pan': 'the local guardian’s PAN',
      ...Object.fromEntries(
        (Object.keys(DOC_TYPE) as DocType[])
          .filter((t) => /_(AADHAAR|PAN)_/.test(t))
          .map((t) => [
            `documents.${t}`,
            `the ${DOC_TYPE[t].replace(/^\w/, (c) => c.toLowerCase())}`,
          ]),
      ),
      'addresses.residential': 'the residential address',
      'parents.primary': 'the primary contact',
      'parents.primaryMobile': 'the primary contact’s mobile',
      'documents.BIRTH': 'the birth certificate',
      'documents.ADDRESS': 'the address proof',
      'documents.REPORT': 'the previous report card',
      'documents.TC': 'the transfer certificate',
      // Client 2026-10-13: the father's details, the primary contact's e-mail and cards, the area.
      'parents.father.name': 'the father’s name',
      'parents.father.mobile': 'the father’s mobile',
      'parents.mother.name': 'the mother’s name',
      'parents.mother.mobile': 'the mother’s mobile',
      'parents.father.email': 'the primary contact’s e-mail',
      'parents.mother.email': 'the primary contact’s e-mail',
      'parents.guardian.email': 'the primary contact’s e-mail',
      'addresses.residential.line2': 'the area or locality',
      'addresses.correspondence.line2': 'the area or locality of the correspondence address',
    };
    const list = [...new Set(fields.map((f) => names[f] ?? 'an institution field'))];
    return `Still needed: ${list.join(', ')}.`;
  }

  protected decided(a: Application) {
    this.approving.set(false);
    this.rejecting.set(false);
    this.rolledBack.set('');
    this.replace(a);
  }

  protected approveFailed(detail: string) {
    this.approving.set(false);
    this.rolledBack.set(detail);
    void this.reload();
  }

  protected cashed(r: { application: Application }) {
    this.cashing.set(false);
    this.replace(r.application);
  }

  // --- formatting ----------------------------------------------------------------------------------
  protected cf(id: string): string {
    const v = this.app()?.customFields[id];
    if (v === undefined || v === null || v === '') return '';
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    return String(v);
  }
  protected before(d: string) {
    const j = this.app()?.joiningDate;
    return !!j && d < j;
  }
  protected rupees(m: { amount: string }) {
    return inr0(paiseOf(m));
  }
  protected inr(m: { amount: string }) {
    return inrOf(m);
  }
  protected chip(f: { status: keyof typeof FEE_STATUS; confirmedAt?: string | null }) {
    return feeChip(f);
  }
  /** The fees together (client 2026-10-09). */
  protected payment(s: PaymentState) {
    return s === 'CONFIRMED'
      ? { l: 'Both fees confirmed by Accounts', tone: 'ok' }
      : s === 'PAID'
        ? { l: 'Paid — waiting for Accounts to confirm', tone: 'warn' }
        : { l: 'Fees due — the admission number waits for both', tone: 'warn' };
  }
  protected source() {
    const a = this.app();
    return a ? (a.source === 'COUNSELLOR' ? 'Counsellor’s desk' : SOURCE[a.source]) : '';
  }
  protected reason(c: keyof typeof REJECT_REASON) {
    return REJECT_REASON[c];
  }
  protected gender(g: keyof typeof GENDER) {
    return GENDER[g];
  }
  protected category(c: keyof typeof CATEGORY) {
    return CATEGORY[c];
  }
  protected relation(r: keyof typeof RELATION) {
    return RELATION[r];
  }
  protected blood(b: string | null | undefined) {
    return !b ? '—' : b === 'UNKNOWN' ? 'Not known' : b;
  }
  protected docType(t: DocType) {
    return DOC_TYPE[t];
  }
  protected size(b: number) {
    return fileSize(b);
  }
  protected address(a: Parameters<typeof addressText>[0]) {
    return addressText(a);
  }
  protected mobile(m: string) {
    return formatMobile(m);
  }
  /** A parent's occupation and annual income (client 2026-10-14), or '' when neither is given. */
  protected work(
    p: { occupation?: string | null; annualIncome?: number | null } | null | undefined,
  ) {
    return workText(p);
  }
  /** A person's Aadhaar and PAN, masked (client 2026-10-13). */
  protected ids(a: Application, who: 'father' | 'mother' | 'guardian' | 'localGuardian') {
    return idsText(a.identityNumbers?.[who]);
  }
  protected date(d: string) {
    return formatDate(d);
  }
  protected long(d: string) {
    return longDay(d);
  }
  protected short(d: string) {
    return shortDay(d);
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  /** A mobile: digits only, in the box too (client 2026-10-14). */
  protected digits(e: Event) {
    return cleanTyped(e.target as HTMLInputElement, onlyDigits);
  }
}
