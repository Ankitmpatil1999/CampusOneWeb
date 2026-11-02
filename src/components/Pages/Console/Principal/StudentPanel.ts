/**
 * One student in full for the principal (SRS 20.32 detail panel; ACA-082; client 2026-10-14): all
 * the personal details, the family and addresses, transport and the hostel, the year's fees and
 * their status, and attendance, leave, the admission and the campus wallet — in tabs. Read-only.
 */
import {
  ChangeDetectionStrategy,
  Component,
  type OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { Modal } from '../../../Shared/Overlays';
import { formatDate, formatDateTime, formatMobile } from '../../../Utils/format';
import { person } from '../Applications/app-format';
import { RECORD_STATUS } from '../FeeRecords/record-format';
import { inr, inr0 } from '../Fees/fee-format';
import {
  PrincipalApi,
  type DetailAddress,
  type FeeRecordStatus,
  type OverviewStudent,
  type StudentDetail,
} from './principal.api';

/** "<class>-<section>", the class alone, or "—" (SRS 20.32.1). */
export const classOf = (s: Pick<OverviewStudent, 'class' | 'section'>) =>
  s.class ? (s.section ? `${s.class}-${s.section}` : s.class) : '—';

type Tab = 'personal' | 'family' | 'transport' | 'fees' | 'more';
const TABS: readonly { v: Tab; l: string }[] = [
  { v: 'personal', l: 'Personal' },
  { v: 'family', l: 'Family & address' },
  { v: 'transport', l: 'Transport & hostel' },
  { v: 'fees', l: 'Fees' },
  { v: 'more', l: 'Attendance & more' },
];

const title = (s: string | null | undefined) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/_/g, ' ') : '';

@Component({
  selector: 'rp-student-panel',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<rp-modal
    [title]="name()"
    [sub]="sub()"
    icon="user"
    [drawer]="true"
    [foot]="false"
    (closed)="closed.emit()"
  >
    <div class="stack g16" id="so-panel">
      <div class="tabs" role="tablist" aria-label="Student details">
        @for (t of tabs; track t.v) {
          <button
            type="button"
            class="tab"
            role="tab"
            [id]="'sp-tab-' + t.v"
            [class.on]="tab() === t.v"
            [attr.aria-selected]="tab() === t.v"
            (click)="tab.set(t.v)"
          >
            {{ t.l }}
          </button>
        }
      </div>

      @if (error()) {
        <div class="note tone-bad" role="alert" id="sp-error">
          <rp-icon name="alert" [size]="17" />
          <div class="grow">{{ error() }}</div>
          <button type="button" class="btn btn-sec btn-sm" (click)="load()">Try again</button>
        </div>
      } @else if (!d()) {
        <div aria-busy="true" id="sp-loading">
          <p class="t-sm t-muted">Loading student details…</p>
          <div class="sk" style="height: 260px; border-radius: 16px"></div>
        </div>
      } @else {
        @let x = d()!;
        @switch (tab()) {
          @case ('personal') {
            <section id="sp-personal" class="stack g16">
              <dl class="kv">
                <dt>Grade / Section</dt>
                <dd>{{ classOf(x.student) }}</dd>
                <dt>Class teacher</dt>
                <dd>{{ x.student.classTeacher ? person(x.student.classTeacher) : '—' }}</dd>
                <dt>Admission No</dt>
                <dd class="t-mono">{{ x.student.admissionNo ?? '—' }}</dd>
                <dt>Member ID</dt>
                <dd class="t-mono">{{ x.student.memberNo }}</dd>
                <dt>Department</dt>
                <dd>{{ x.student.department || 'Academics' }}</dd>
                <dt>Academic Year</dt>
                <dd>{{ x.year.label }}</dd>
                <dt>Status</dt>
                <dd>
                  <span class="chip dot" [class]="'chip dot tone-' + statusTone()">{{
                    statusLabel()
                  }}</span>
                  @if (x.student.statusReason) {
                    <span class="t-muted"> · {{ x.student.statusReason }}</span>
                  }
                </dd>
              </dl>
              <h4 class="t-h4">Personal details</h4>
              <dl class="kv">
                <dt>Full name</dt>
                <dd>{{ name() }}</dd>
                <dt>Gender</dt>
                <dd>{{ title(x.student.gender) || '—' }}</dd>
                <dt>Date of birth</dt>
                <dd>{{ x.student.dateOfBirth ? date(x.student.dateOfBirth) + age() : '—' }}</dd>
                <dt>Blood group</dt>
                <dd>{{ blood() }}</dd>
                <dt>Category</dt>
                <dd>{{ x.student.category ? x.student.category : '—' }}</dd>
                <dt>Medium</dt>
                <dd>{{ x.student.medium || '—' }}</dd>
                <dt>Food allergies</dt>
                <dd>{{ x.student.allergies || '—' }}</dd>
                <dt>Health notes</dt>
                <dd>{{ x.student.health || '—' }}</dd>
                <dt>Aadhaar number</dt>
                <dd class="t-mono">{{ x.student.aadhaar ?? '—' }}</dd>
                <dt>PAN</dt>
                <dd class="t-mono">{{ x.student.pan ?? '—' }}</dd>
                <dt>Mobile</dt>
                <dd>{{ x.student.mobile ? mobile(x.student.mobile) : '—' }}</dd>
                <dt>E-mail</dt>
                <dd>{{ x.student.email || '—' }}</dd>
                <dt>Joined on</dt>
                <dd>{{ x.student.joinedOn ? date(x.student.joinedOn) : '—' }}</dd>
                <dt>In this class since</dt>
                <dd>{{ x.student.enrolledOn ? date(x.student.enrolledOn) : '—' }}</dd>
                <dt>CampusOne account</dt>
                <dd>{{ x.student.campusOneAccount ? 'Linked' : 'Not linked' }}</dd>
                @for (c of x.student.customFields; track c.label) {
                  <dt>{{ c.label }}</dt>
                  <dd>{{ value(c.value) }}</dd>
                }
              </dl>
            </section>
          }
          @case ('family') {
            <section id="sp-family" class="stack g16">
              <h4 class="t-h4">Parents and guardians</h4>
              @if (x.family.guardians.length) {
                <div class="tbl-wrap">
                  <table class="tbl" id="sp-guardians">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Relation</th>
                        <th>Mobile</th>
                        <th>E-mail</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (g of x.family.guardians; track $index) {
                        <tr>
                          <td>
                            <b class="t-sb">{{ person(g.name) }}</b>
                            @if (g.primary) {
                              <span class="chip tone-brand" style="margin-left: 6px"
                                >Primary contact</span
                              >
                            }
                          </td>
                          <td>{{ title(g.relation) }}</td>
                          <td>{{ g.mobile ? mobile(g.mobile) : '—' }}</td>
                          <td>{{ g.email || '—' }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              } @else {
                <p class="t-sm t-muted">No parent or guardian is linked to this student.</p>
              }
              @if (x.family.father || x.family.mother || x.family.guardian) {
                <h4 class="t-h4">From the admission form</h4>
                <dl class="kv" id="sp-parents">
                  @if (x.family.father; as p) {
                    <dt>Father</dt>
                    <dd>{{ who(p) }}</dd>
                  }
                  @if (x.family.mother; as p) {
                    <dt>Mother</dt>
                    <dd>{{ who(p) }}</dd>
                  }
                  @if (x.family.guardian; as p) {
                    <dt>Guardian{{ p.relation ? ' (' + p.relation + ')' : '' }}</dt>
                    <dd>{{ who(p) }}</dd>
                  }
                  <dt>Children in the family</dt>
                  <dd>
                    {{
                      x.family.children === 'SINGLE'
                        ? 'Single child'
                        : x.family.children === 'MORE'
                          ? 'More than one child'
                          : '—'
                    }}
                  </dd>
                </dl>
              }
              <h4 class="t-h4">Addresses</h4>
              <dl class="kv" id="sp-addresses">
                <dt>Residential</dt>
                <dd>{{ address(x.addresses?.residential) }}</dd>
                <dt>Correspondence</dt>
                <dd>
                  {{
                    x.addresses?.sameAsResidential
                      ? 'Same as residential'
                      : address(x.addresses?.correspondence)
                  }}
                </dd>
              </dl>
              @if (x.previousSchool; as ps) {
                <h4 class="t-h4">Previous school</h4>
                <dl class="kv" id="sp-previous">
                  <dt>School</dt>
                  <dd>{{ ps.school }}</dd>
                  <dt>Last class</dt>
                  <dd>{{ ps.lastClass || '—' }}</dd>
                  <dt>Result</dt>
                  <dd>{{ ps.result || '—' }}</dd>
                  <dt>Board</dt>
                  <dd>{{ ps.board || '—' }}</dd>
                </dl>
              }
            </section>
          }
          @case ('transport') {
            <section id="sp-transport" class="stack g16">
              <h4 class="t-h4">School transport</h4>
              @if (x.transport.allocation; as a) {
                <dl class="kv" id="sp-allocation">
                  <dt>Route</dt>
                  <dd>{{ a.route.code }} · {{ a.route.name }}</dd>
                  <dt>Stop</dt>
                  <dd>{{ a.stop.name }}{{ a.stop.landmark ? ' — ' + a.stop.landmark : '' }}</dd>
                  <dt>Pick-up time</dt>
                  <dd>{{ a.pickUp ?? '—' }}</dd>
                  <dt>Drop time</dt>
                  <dd>{{ a.drop ?? '—' }}</dd>
                  <dt>Allocated</dt>
                  <dd>{{ a.from ? date(a.from) : '—' }} to {{ a.to ? date(a.to) : '—' }}</dd>
                </dl>
                @if (x.transport.trips.length) {
                  <div class="tbl-wrap">
                    <table class="tbl" id="sp-trips">
                      <thead>
                        <tr>
                          <th>Trip</th>
                          <th>Starts</th>
                          <th>Vehicle</th>
                          <th>Driver</th>
                          <th>Attendant</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (t of x.transport.trips; track $index) {
                          <tr>
                            <td>{{ t.session }} · {{ title(t.direction) }}</td>
                            <td class="t-num">{{ t.startTime }}</td>
                            <td>{{ t.vehicle.name }} · {{ t.vehicle.registration }}</td>
                            <td>
                              {{ person(t.driver.name) }}
                              @if (t.driver.mobile) {
                                <div class="t-xs t-muted">{{ mobile(t.driver.mobile) }}</div>
                              }
                            </td>
                            <td>{{ t.attendant ? person(t.attendant) : '—' }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                } @else {
                  <p class="t-sm t-muted">No vehicle or crew is assigned to this route today.</p>
                }
              } @else {
                <div class="note tone-info" id="sp-no-transport">
                  <rp-icon name="info" [size]="17" />
                  <div class="grow">Not allocated to a route.</div>
                </div>
              }
              <dl class="kv">
                <dt>On the admission form</dt>
                <dd id="sp-transport-choice">
                  @if (x.transport.choice; as c) {
                    {{
                      c.opted
                        ? 'Opted for school transport' +
                          (c.stop ? ' — preferred stop ' + c.stop : '')
                        : 'Did not opt for school transport'
                    }}
                  } @else {
                    —
                  }
                </dd>
              </dl>
              <h4 class="t-h4">Hostel</h4>
              <dl class="kv" id="sp-hostel">
                <dt>Hostel</dt>
                <dd>{{ x.hostel.opted ? 'Yes' : 'No' }}</dd>
                @if (x.hostel.localGuardian; as lg) {
                  <dt>Local guardian</dt>
                  <dd>
                    {{ person(lg.name) }}{{ lg.relation ? ' (' + lg.relation + ')' : '' }}
                    {{ lg.mobile ? ' · ' + mobile(lg.mobile) : '' }}
                  </dd>
                  <dt>Their address</dt>
                  <dd>{{ lg.address || '—' }}</dd>
                }
              </dl>
            </section>
          }
          @case ('fees') {
            <section id="sp-fees" class="stack g16">
              <div class="c-grid k4" id="sp-fee-kpis">
                <div class="card pad">
                  <div class="t-xs t-muted">Annual fee</div>
                  <b class="t-num">{{ inr(x.fees.summary.annual) }}</b>
                </div>
                <div class="card pad">
                  <div class="t-xs t-muted">Paid</div>
                  <b class="t-num">{{ inr(x.fees.summary.paid) }}</b>
                </div>
                <div class="card pad">
                  <div class="t-xs t-muted">Outstanding</div>
                  <b class="t-num">{{ inr(x.fees.summary.outstanding) }}</b>
                </div>
                <div class="card pad">
                  <div class="t-xs t-muted">Paid so far</div>
                  <b class="t-num">{{ x.fees.summary.paidPercent }}%</b>
                </div>
              </div>
              <div class="note" [class]="'note tone-' + feeState().tone" id="sp-fee-status">
                <rp-icon [name]="feeState().tone === 'ok' ? 'checkc' : 'alertc'" [size]="17" />
                <div class="grow">
                  <b>{{ feeState().label }}</b>
                  @if (x.fees.next; as n) {
                    — next: {{ n.label }}, {{ inr(n.amountDue) }} by {{ date(n.dueDate) }}
                  }
                </div>
              </div>
              @if (x.fees.records.length) {
                <div class="tbl-wrap">
                  <table class="tbl" id="sp-fee-records">
                    <thead>
                      <tr>
                        <th>Instalment</th>
                        <th>Due on</th>
                        <th class="r">Amount</th>
                        <th class="r">Paid</th>
                        <th class="r">Due</th>
                        <th>Status</th>
                        <th>Receipt</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (r of x.fees.records; track $index) {
                        <tr>
                          <td>
                            {{ r.label }}
                            <!-- FINANCING-OFF (client 2026-10-22)
                            @if (r.financed) {
                              <span class="chip tone-info" style="margin-left: 6px">Financed</span>
                            }
                            -->
                          </td>
                          <td>{{ date(r.dueDate) }}</td>
                          <td class="r t-num">{{ inr(r.amount) }}</td>
                          <td class="r t-num">{{ inr(r.paid) }}</td>
                          <td class="r t-num">{{ inr(r.amountDue) }}</td>
                          <td>
                            <span
                              class="chip dot"
                              [class]="'chip dot tone-' + recordTone(r.status)"
                              >{{ recordLabel(r.status) }}</span
                            >
                          </td>
                          <td class="t-mono t-xs">{{ r.receipt ?? '—' }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              } @else {
                <p class="t-sm t-muted" id="sp-no-fees">
                  No fees are set for this student in {{ x.year.label }}.
                </p>
              }
              <dl class="kv">
                <dt>Fee structure</dt>
                <dd>{{ x.fees.structure ?? '—' }}</dd>
                @if (x.fees.heads.length) {
                  <dt>Fee heads</dt>
                  <dd>
                    @for (h of x.fees.heads; track h.name) {
                      <div>{{ h.name }} · {{ inr(h.amount) }}</div>
                    }
                  </dd>
                }
                <dt>Auto-debit consent</dt>
                <dd>
                  {{
                    x.fees.consent
                      ? x.fees.consent.valid
                        ? 'Given, valid until ' + dateTime(x.fees.consent.validUntil)
                        : 'Expired'
                      : 'Not given'
                  }}
                </dd>
                <!-- FINANCING-OFF (client 2026-10-22): the fee financing partner is commented out
                     in the whole application; uncomment to bring it back.
                <dt>Fee financing</dt>
                <dd>
                  {{
                    x.fees.financing
                      ? title(x.fees.financing.status) +
                        (x.fees.financing.partnerName ? ' — ' + x.fees.financing.partnerName : '')
                      : 'Not registered'
                  }}
                </dd>
                -->
                <dt>Campus wallet</dt>
                <dd>
                  {{
                    x.wallet
                      ? inr(x.wallet.balance) + ' available · ' + title(x.wallet.status)
                      : 'No wallet'
                  }}
                </dd>
              </dl>
              @if (x.admission?.fees?.length) {
                <h4 class="t-h4">Admission fees</h4>
                <dl class="kv" id="sp-admission-fees">
                  @for (f of x.admission!.fees; track f.feeType) {
                    <dt>{{ f.feeType === 'APPLICATION' ? 'Application fee' : 'Admission fee' }}</dt>
                    <dd>
                      {{ inr(f.amount) }} · {{ title(f.status) }}
                      {{ f.receiptNo ? ' · receipt ' + f.receiptNo : '' }}
                      {{ f.transactionId ? ' · transaction ID ' + f.transactionId : '' }}
                    </dd>
                  }
                </dl>
              }
            </section>
          }
          @case ('more') {
            <section id="sp-more" class="stack g16">
              <h4 class="t-h4">Attendance in {{ x.year.label }}</h4>
              <dl class="kv" id="sp-attendance">
                <dt>Attendance</dt>
                <dd>
                  {{
                    x.attendance.percentage === null
                      ? 'Not marked yet'
                      : x.attendance.percentage + '% of ' + x.attendance.days + ' days marked'
                  }}
                </dd>
                <dt>Present</dt>
                <dd>{{ x.attendance.present }}</dd>
                <dt>Late</dt>
                <dd>{{ x.attendance.late }}</dd>
                <dt>Half day</dt>
                <dd>{{ x.attendance.halfDay }}</dd>
                <dt>Absent</dt>
                <dd>{{ x.attendance.absent }}</dd>
              </dl>
              <h4 class="t-h4">Leave</h4>
              <dl class="kv" id="sp-leave">
                <dt>Approved</dt>
                <dd>{{ x.leave.approved }} ({{ x.leave.days }} school days)</dd>
                <dt>Waiting</dt>
                <dd>{{ x.leave.pending }}</dd>
              </dl>
              <h4 class="t-h4">Admission</h4>
              <dl class="kv" id="sp-admission">
                @if (x.admission; as a) {
                  <dt>Application</dt>
                  <dd class="t-mono">{{ a.applicationNo }}</dd>
                  <dt>Admitted on</dt>
                  <dd>{{ a.admittedOn ? date(a.admittedOn) : '—' }}</dd>
                  <dt>Admission type</dt>
                  <dd>{{ a.midTerm ? 'Mid-term' : 'Regular' }}</dd>
                  <dt>Joining date</dt>
                  <dd>{{ a.joiningDate ? date(a.joiningDate) : '—' }}</dd>
                } @else {
                  <dt>Application</dt>
                  <dd>Added to CampusOne directly (no admission application)</dd>
                }
              </dl>
            </section>
          }
        }
      }
    </div>
  </rp-modal>`,
})
export class StudentPanel implements OnInit {
  private readonly api = inject(PrincipalApi);
  /** The row opened (shown at once while the rest loads). */
  readonly row = input.required<OverviewStudent>();
  readonly closed = output<void>();

  protected readonly tabs = TABS;
  protected readonly person = person;
  protected readonly classOf = classOf;
  protected readonly inr = inr;
  protected readonly title = title;
  protected readonly tab = signal<Tab>('personal');
  protected readonly d = signal<StudentDetail | null>(null);
  protected readonly error = signal('');

  protected readonly name = computed(() => person(this.row().name) || 'Student');
  protected readonly sub = computed(() =>
    [this.row().memberNo, classOf(this.row()), this.d()?.year.label].filter(Boolean).join(' · '),
  );
  protected readonly age = computed(() => {
    const dob = this.d()?.student.dateOfBirth;
    if (!dob) return '';
    const [y, m, dd] = dob.split('-').map(Number) as [number, number, number];
    const now = new Date();
    let a = now.getFullYear() - y;
    if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < dd)) a--;
    return ` (${a} years)`;
  });
  protected readonly blood = computed(() => {
    const b = this.d()?.student.bloodGroup;
    return !b ? '—' : b === 'UNKNOWN' ? 'Not known' : b.replace('-', '−');
  });
  protected readonly statusLabel = computed(() => {
    const s = this.d()?.student.status ?? this.row().status;
    return s === 'ACTIVE' ? 'Active' : s === 'SUSPENDED' ? 'Suspended' : 'Inactive';
  });
  protected readonly statusTone = computed(() => {
    const s = this.d()?.student.status ?? this.row().status;
    return s === 'ACTIVE' ? 'ok' : s === 'SUSPENDED' ? 'bad' : 'neutral';
  });
  /** The fee status in a word: fully paid, overdue, or what is due. */
  protected readonly feeState = computed(() => {
    const f = this.d()?.fees;
    if (!f || !f.records.length) return { label: 'No fees set', tone: 'info' };
    if (f.summary.overdue) {
      return {
        label: `${f.summary.overdue} instalment${f.summary.overdue === 1 ? '' : 's'} overdue`,
        tone: 'bad',
      };
    }
    if (Number(f.summary.outstanding.amount) <= 0) return { label: 'Fully paid', tone: 'ok' };
    return { label: `${inr(f.summary.outstanding)} still due`, tone: 'warn' };
  });

  ngOnInit() {
    void this.load();
  }

  async load() {
    this.error.set('');
    this.d.set(null);
    try {
      this.d.set(await this.api.student(this.row().id));
    } catch {
      this.error.set('Unable to load the student’s details.');
    }
  }

  protected date(v: string) {
    return formatDate(v);
  }
  protected dateTime(v: string | null) {
    return v ? formatDateTime(v) : '—';
  }
  protected mobile(m: string) {
    return formatMobile(m);
  }
  protected who(p: {
    name: string;
    mobile: string | null;
    email: string | null;
    occupation: string | null;
    annualIncome?: number | null;
  }) {
    // With the annual income where the form took it (client 2026-10-14).
    const income = p.annualIncome != null ? `${inr0(p.annualIncome * 100)} a year` : null;
    return [person(p.name), p.mobile ? formatMobile(p.mobile) : null, p.email, p.occupation, income]
      .filter(Boolean)
      .join(' · ');
  }
  protected address(a: DetailAddress | null | undefined) {
    return a ? [a.line1, a.line2, a.city, a.state, a.pin].filter(Boolean).join(', ') : '—';
  }
  protected value(v: unknown) {
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    return v === null || v === undefined || v === '' ? '—' : String(v);
  }
  protected recordLabel(s: FeeRecordStatus) {
    return RECORD_STATUS[s].l();
  }
  protected recordTone(s: FeeRecordStatus) {
    return RECORD_STATUS[s].tone;
  }
}
