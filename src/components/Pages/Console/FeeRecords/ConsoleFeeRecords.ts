import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Amount } from '../../../Shared/Amount';
import { Avatar } from '../../../Shared/Avatar';
import { Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { Pager } from '../../../Shared/Pager';
import { formatDate, formatTime, istBusinessDate, titleCase } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { inrK, paiseOf, plural, rate } from '../Fees/fee-format';
import { FeesApi, type EntryFeesRow, type FeeHead } from '../Fees/fees.api';
import { MembersApi, type ClassView } from '../Members/members.api';
import { FeeAutoDebit } from './FeeAutoDebit';
import { FeeCollectionReport } from './FeeCollectionReport';
// FINANCING-OFF (client 2026-10-22): the fee financing partner is commented out in the whole application; uncomment to bring it back.
// import { FeeFinancing } from './FeeFinancing';
import { FeeRecordDrawer } from './FeeRecordDrawer';
import { FeeRecordForm } from './FeeRecordForm';
import { FeeUpload } from './FeeUpload';
import {
  FeeRecordsApi,
  type CollectionAttempt,
  type CollectionReport,
  type FeeRecord,
  type FeeUpload as Upload,
  type FinancingList,
  type InstitutionRun,
  type RecordStatus,
} from './fee-records.api';
import { RECORD_STATUS, addDays, processing, shortRef } from './record-format';

type Tab = 'rec' | 'rep' | 'job' | 'fin' | 'upl';
type StatusPill = RecordStatus | 'WAITING' | '';
type SortKey = 'name' | 'term' | 'amount' | 'due' | 'fine' | 'status' | 'proc';
const PAGE = 12;
const COLUMNS: readonly { k: SortKey; l: string; r?: boolean }[] = [
  { k: 'name', l: 'Student' },
  { k: 'term', l: 'Instalment' },
  { k: 'amount', l: 'Amount', r: true },
  { k: 'due', l: 'Due' },
  { k: 'fine', l: 'Late fine', r: true },
  { k: 'status', l: 'Status' },
  { k: 'proc', l: 'Processing' },
];

interface Figures {
  readonly all: CollectionReport;
  readonly past: CollectionReport;
  readonly ahead: CollectionReport;
}

/**
 * c.feerecords — Fee records (SRS 13, FR-FEE-02/03/08/11; FEE-010…018, FEE-024/025, FEE-039…041,
 * GOV-006/007; prototype c.feerecords): billed, collected, pending and overdue for the academic
 * year; the records with filters by year, class and section, instalment, processing and status;
 * the record drawer (FeeRecordDrawer: collect now, ask for a change); a manual record
 * (FeeRecordForm); the fee sheet upload (FeeUpload); the collection report (FeeCollectionReport);
 * the auto-debit queue, its runs and "Run auto-debit now" (FeeAutoDebit); the financing partner
 * (FeeFinancing) and the uploads.
 */
@Component({
  selector: 'rp-console-fee-records',
  imports: [
    Amount,
    Avatar,
    Dropdown,
    Empty,
    FeeAutoDebit,
    FeeCollectionReport,
    // FeeFinancing, // FINANCING-OFF (client 2026-10-22)
    FeeRecordDrawer,
    FeeRecordForm,
    FeeUpload,
    Icon,
    Kpi,
    PageHead,
    Pager,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Fee records"
        sub="Instalments billed to students, their collection from the campus wallet, and the jobs behind it."
      >
        @if (canView()) {
          @if (editWhy()) {
            <span class="cp-why" [attr.title]="editWhy()"
              ><button type="button" class="btn btn-sec" disabled>
                <rp-icon name="upload" [size]="17" /><span>Upload fee sheet</span>
              </button></span
            >
            <span class="cp-why" [attr.title]="editWhy()"
              ><button type="button" class="btn btn-pri" disabled>
                <rp-icon name="plus" [size]="17" /><span>Create fee record</span>
              </button></span
            >
          } @else {
            <button type="button" class="btn btn-sec" id="fr-upload" (click)="uploading.set('new')">
              <rp-icon name="upload" [size]="17" /><span>Upload fee sheet</span>
            </button>
            <button type="button" class="btn btn-pri" id="fr-new" (click)="creating.set(true)">
              <rp-icon name="plus" [size]="17" /><span>Create fee record</span>
            </button>
          }
        }
      </rp-page-head>

      @if (!canView()) {
        <rp-empty
          icon="lock"
          title="This page isn't part of your role"
          text="Fee records are kept by the accounts office. Pages your role can open are listed in the menu."
        />
      } @else {
        @if (readOnly()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow"><b>Read-only.</b> {{ readOnly() }}</div>
          </div>
        }
        <div class="c-grid k4">
          <rp-kpi label="Billed" icon="receipt" [value]="billed().v" [delta]="billed().d" />
          <rp-kpi
            label="Collected"
            icon="checkc"
            tone="ok"
            [value]="collected().v"
            [delta]="collected().d"
          />
          <rp-kpi
            label="Pending"
            icon="clock"
            tone="warn"
            [value]="pending().v"
            [delta]="pending().d"
          />
          <rp-kpi
            label="Overdue"
            icon="alert"
            tone="bad"
            [value]="overdue().v"
            [delta]="overdue().d"
          />
        </div>

        <div class="tabs" role="tablist" aria-label="Fee records">
          @for (t of tabs; track t.v) {
            <button
              type="button"
              class="tab"
              role="tab"
              [id]="'fr-tab-' + t.v"
              [class.on]="tab() === t.v"
              [attr.aria-selected]="tab() === t.v"
              (click)="tab.set(t.v)"
            >
              {{ t.l }}
              @if (tabCount(t.v); as n) {
                <span class="n">{{ n }}</span>
              }
            </button>
          }
        </div>

        @switch (tab()) {
          @case ('rep') {
            <rp-fee-collection-report
              [report]="figures()?.all ?? null"
              [error]="figuresError()"
              [classes]="classNames()"
              [yearLabel]="yearLabel()"
              (reload)="loadFigures()"
            />
          }
          @case ('job') {
            <rp-fee-auto-debit
              [attempts]="attempts()"
              [attemptsError]="attemptsError()"
              [runs]="runs()"
              [runsError]="runsError()"
              [runWhy]="collectWhy()"
              [running]="running()"
              (run)="runAutoDebit()"
              (open)="openById($event)"
            />
          }
          <!-- FINANCING-OFF (client 2026-10-22): the fee financing partner is commented out in the whole application; uncomment to bring it back.
          @case ('fin') {
            <rp-fee-financing
              [list]="financing()"
              [error]="financingError()"
              [editWhy]="editWhy()"
              (reload)="loadFinancing()"
              (registeredOne)="afterChange(); loadFinancing()"
              (records)="showStudent($event)"
            />
          }
          -->
          @case ('upl') {
            @if (uploadsError()) {
              <div class="card pad">
                <rp-empty icon="alertc" title="Couldn't load the uploads" [text]="uploadsError()">
                  <button type="button" class="btn btn-sec btn-sm" (click)="loadUploads()">
                    <span>Try again</span>
                  </button>
                </rp-empty>
              </div>
            } @else {
              <div class="tbl-wrap">
                <table class="tbl" id="upl-table">
                  <thead>
                    <tr>
                      <th>Upload</th>
                      <th>When</th>
                      <th>By</th>
                      <th>File</th>
                      <th class="r">Accepted</th>
                      <th class="r">Rejected</th>
                      <th class="r">Records</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (u of uploads(); track u.id) {
                      <tr
                        tabindex="0"
                        (click)="uploading.set(u.id)"
                        (keydown.enter)="uploading.set(u.id)"
                      >
                        <td>
                          <span class="t-mono" [attr.title]="u.id">{{ short(u.id) }}</span>
                        </td>
                        <td>
                          @if (u.uploadedAt) {
                            <div class="cell-t t-num" style="font-weight: 550">
                              {{ date(u.uploadedAt) }}
                            </div>
                            <div class="cell-s">{{ time(u.uploadedAt) }}</div>
                          } @else {
                            —
                          }
                        </td>
                        <td>{{ u.uploadedBy ? person(u.uploadedBy) : '—' }}</td>
                        <td>
                          <span class="t-sm"
                            ><rp-icon name="sheet" [size]="13" /> {{ u.fileName }}</span
                          >
                          @if (u.status === 'VALIDATED') {
                            <div class="cell-s">Validated only — records not created</div>
                          }
                        </td>
                        <td class="r t-num">{{ num(u.accepted) }}</td>
                        <td class="r">
                          @if (u.rejected) {
                            <span class="t-bad t-num">{{ u.rejected }}</span>
                          } @else {
                            0
                          }
                        </td>
                        <td class="r t-num">{{ num(u.recordsCreated ?? 0) }}</td>
                      </tr>
                    } @empty {
                      <tr>
                        <td colspan="7">
                          @if (uploadsLoading()) {
                            <rp-empty icon="hourglass" title="Loading…" />
                          } @else {
                            <rp-empty
                              icon="upload"
                              title="No uploads yet"
                              text="Upload a fee sheet to create records in bulk."
                            >
                              @if (!editWhy()) {
                                <button
                                  type="button"
                                  class="btn btn-sec btn-sm"
                                  (click)="uploading.set('new')"
                                >
                                  <rp-icon name="upload" [size]="15" /><span>Upload fee sheet</span>
                                </button>
                              }
                            </rp-empty>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              @if (uploads().length) {
                <div class="pager">
                  <span>{{ plural(uploads().length, 'upload') }}</span>
                </div>
              }
            }
          }
          @default {
            <div class="c-filters">
              <label class="search"
                ><rp-icon name="search" [size]="16" /><input
                  type="search"
                  id="fr-q"
                  placeholder="Search student, admission no. or record"
                  aria-label="Search fee records"
                  autocomplete="off"
                  [value]="q()"
                  (input)="q.set(val($event)); page.set(1)"
              /></label>
              @if (yearOptions().length > 1) {
                <div class="fld">
                  <rp-dd
                    inputId="fr-year"
                    placeholder="Academic year"
                    [options]="yearOptions()"
                    [value]="yearId()"
                    (changed)="yearId.set($event)"
                  />
                </div>
              }
              <div class="fld">
                <rp-dd
                  inputId="fr-cls"
                  placeholder="All classes"
                  [options]="classOptions()"
                  [value]="classId()"
                  (changed)="classId.set($event); sectionId.set(''); page.set(1)"
                />
              </div>
              @if (sectionOptions().length > 1) {
                <div class="fld">
                  <rp-dd
                    inputId="fr-sec"
                    placeholder="All sections"
                    [options]="sectionOptions()"
                    [value]="sectionId()"
                    (changed)="sectionId.set($event)"
                  />
                </div>
              }
              <div class="fld">
                <rp-dd
                  inputId="fr-term"
                  placeholder="All instalments"
                  [options]="termOptions()"
                  [value]="term()"
                  (changed)="term.set($event); page.set(1)"
                />
              </div>
              <div class="fld">
                <rp-dd
                  inputId="fr-proc"
                  placeholder="Any processing"
                  [options]="procOptions"
                  [value]="proc()"
                  (changed)="proc.set($event); page.set(1)"
                />
              </div>
              <div class="pills" role="group" aria-label="Status">
                @for (p of pills; track p.v) {
                  <button
                    type="button"
                    class="pill"
                    [class.on]="status() === p.v"
                    [attr.aria-pressed]="status() === p.v"
                    (click)="status.set(p.v)"
                  >
                    {{ p.l }}
                  </button>
                }
              </div>
              @if (student(); as s) {
                <span class="chip tone-brand" id="fr-student"
                  >{{ s.name }}
                  <button
                    type="button"
                    class="iconbtn"
                    style="width: 18px; height: 18px"
                    aria-label="Show every student"
                    (click)="student.set(null)"
                  >
                    <rp-icon name="x" [size]="12" /></button
                ></span>
              }
              <span class="fsum">{{ summary() }}</span>
            </div>

            @if (error()) {
              <div class="card pad">
                <rp-empty icon="alertc" title="Couldn't load the fee records" [text]="error()">
                  <button type="button" class="btn btn-sec btn-sm" (click)="load()">
                    <span>Try again</span>
                  </button>
                </rp-empty>
              </div>
            } @else {
              <div class="tbl-wrap">
                <table class="tbl" id="fr-table">
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
                    @if (loading() && !records().length) {
                      <tr>
                        <td [attr.colspan]="columns.length">
                          <rp-empty icon="hourglass" title="Loading…" />
                        </td>
                      </tr>
                    }
                    @for (r of shown(); track r.id) {
                      <tr
                        tabindex="0"
                        (click)="openRecord.set(r)"
                        (keydown.enter)="openRecord.set(r)"
                      >
                        <td>
                          <div class="cell-main">
                            <rp-av [name]="r.student.name" size="sm" />
                            <div style="min-width: 0">
                              <div class="cell-t t-clip">{{ r.student.name }}</div>
                              <div class="cell-s">
                                {{ r.student.admissionNo ?? '—' }} ·
                                {{ r.student.classSection ?? 'Not enrolled' }}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div class="cell-t" style="font-weight: 550">
                            {{ r.instalment.label }}
                          </div>
                          <div class="cell-s t-mono" [attr.title]="r.id">{{ short(r.id) }}</div>
                        </td>
                        <td class="r"><rp-amt [value]="r.amount" /></td>
                        <td>{{ date(r.dueDate) }}</td>
                        <td class="r">
                          @if (paise(r.lateFine)) {
                            <rp-amt [value]="r.lateFine" />
                          } @else {
                            <span class="t-faint">—</span>
                          }
                        </td>
                        <td>
                          <span [class]="'chip dot tone-' + st(r).tone">{{ st(r).l() }}</span>
                          @if (r.pendingAttempt && open(r)) {
                            <div class="cell-s t-warn">Waiting for balance</div>
                          }
                        </td>
                        <td>
                          <span [class]="'chip dot tone-' + pr(r).tone">{{ pr(r).l }}</span>
                        </td>
                      </tr>
                    } @empty {
                      @if (!loading()) {
                        <tr>
                          <td [attr.colspan]="columns.length">
                            <rp-empty
                              icon="receipt"
                              [title]="
                                records().length
                                  ? 'No records match'
                                  : 'No fee records for ' + yearLabel()
                              "
                              [text]="
                                records().length
                                  ? 'Change the filters or search.'
                                  : 'Assign a fee structure, upload a fee sheet or create a record.'
                              "
                            />
                          </td>
                        </tr>
                      }
                    }
                  </tbody>
                </table>
              </div>
              @if (filtered().length > pageSize) {
                <rp-pager
                  [total]="filtered().length"
                  [page]="page()"
                  [size]="pageSize"
                  (go)="page.set($event)"
                />
              } @else if (filtered().length) {
                <div class="pager">
                  <span>{{ plural(filtered().length, 'record') }}</span>
                </div>
              }
              @if (cursor()) {
                <div class="row" style="justify-content: center">
                  <button
                    type="button"
                    class="btn btn-sec btn-sm"
                    id="fr-more"
                    [class.is-busy]="more()"
                    [disabled]="more()"
                    (click)="loadMore()"
                  >
                    <span>Load more records</span>
                  </button>
                </div>
              }
            }
          }
        }
      }
    </div>

    @if (openRecord(); as r) {
      <rp-fee-record-drawer
        [record]="r"
        [readOnly]="editWhy()"
        [collectBlocked]="collectWhy()"
        [canSeeWallet]="can('members.view')"
        (closed)="openRecord.set(null)"
        (changed)="afterChange()"
      />
    }
    @if (creating()) {
      <rp-fee-record-form
        [year]="year()"
        [heads]="heads()"
        (closed)="creating.set(false)"
        (created)="creating.set(false); afterChange(); openRecord.set($event)"
      />
    }
    @if (uploading(); as u) {
      <rp-fee-upload
        [uploadId]="u === 'new' ? '' : u"
        [commitWhy]="editWhy()"
        (closed)="uploading.set(null)"
        (validated)="loadUploads()"
        (committed)="committed($event)"
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
export class ConsoleFeeRecords {
  private readonly api = inject(FeeRecordsApi);
  private readonly fees = inject(FeesApi);
  private readonly members = inject(MembersApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).console;

  protected readonly columns = COLUMNS;
  protected readonly pageSize = PAGE;
  protected readonly plural = plural;
  protected readonly noTask = "Your role doesn't include this task.";
  protected readonly tabs: readonly { v: Tab; l: string }[] = [
    { v: 'rec', l: 'Records' },
    { v: 'rep', l: 'Collection report' },
    { v: 'job', l: 'Auto-debit' },
    // { v: 'fin', l: 'Financing partner' }, // FINANCING-OFF (client 2026-10-22)
    { v: 'upl', l: 'Uploads' },
  ];
  protected readonly pills: readonly { v: StatusPill; l: string }[] = [
    { v: '', l: 'All' },
    { v: 'DUE', l: translate('status.fee_record.due') },
    { v: 'OVERDUE', l: translate('status.fee_record.overdue') },
    { v: 'PAID', l: translate('status.fee_record.paid') },
    { v: 'WAITING', l: 'Waiting for balance' },
  ];
  protected readonly procOptions: readonly DropdownOption[] = [
    { v: '', l: 'Any processing' },
    { v: 'wallet', l: 'Processed (wallet)' },
    // { v: 'financed', l: 'Financed' }, // FINANCING-OFF (client 2026-10-22)
  ];

  readonly tab = signal<Tab>('rec');
  protected readonly q = signal('');
  protected readonly yearId = signal('');
  protected readonly classId = signal('');
  protected readonly sectionId = signal('');
  protected readonly term = signal('');
  protected readonly proc = signal('');
  protected readonly status = signal<StatusPill>('');
  /** One student's records (from the financing tab). */
  protected readonly student = signal<{ id: string; name: string } | null>(null);
  protected readonly records = signal<readonly FeeRecord[]>([]);
  protected readonly cursor = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly more = signal(false);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly sort = signal<{ k: SortKey; dir: 'asc' | 'desc' } | null>(null);
  protected readonly figures = signal<Figures | null>(null);
  protected readonly figuresError = signal('');
  protected readonly attempts = signal<readonly CollectionAttempt[]>([]);
  protected readonly attemptsError = signal('');
  protected readonly runs = signal<readonly InstitutionRun[]>([]);
  protected readonly runsError = signal('');
  protected readonly running = signal(false);
  protected readonly financing = signal<FinancingList | null>(null);
  protected readonly financingError = signal('');
  protected readonly uploads = signal<readonly Upload[]>([]);
  protected readonly uploadsLoading = signal(true);
  protected readonly uploadsError = signal('');
  protected readonly entry = signal<readonly EntryFeesRow[]>([]);
  protected readonly classes = signal<readonly ClassView[]>([]);
  protected readonly heads = signal<readonly FeeHead[]>([]);
  protected readonly openRecord = signal<FeeRecord | null>(null);
  protected readonly creating = signal(false);
  protected readonly uploading = signal<string | null>(null);
  private ready = false;
  private seq = 0;
  private figSeq = 0;

  protected readonly canView = computed(() => this.can('fees.view'));
  protected readonly readOnly = computed(() =>
    this.session()?.roles.some((r) => r.readOnly)
      ? 'Management has read-only access. The administrator makes changes here.'
      : '',
  );
  protected readonly editWhy = computed(
    () => this.readOnly() || (this.can('fees.edit') ? '' : this.noTask),
  );
  protected readonly collectWhy = computed(
    () => this.readOnly() || (this.can('fees.collect') ? '' : this.noTask),
  );
  protected readonly year = computed(() => {
    const e = this.entry().find((x) => x.year.id === this.yearId());
    return { id: this.yearId(), label: e?.year.label ?? '' };
  });
  protected readonly yearLabel = computed(() => this.year().label || 'this year');
  protected readonly yearOptions = computed<DropdownOption[]>(() =>
    this.entry().map((e) => ({
      v: e.year.id,
      l: `Academic year ${e.year.label}`,
      ...(e.year.current
        ? { sub: 'Current' }
        : e.year.status === 'CLOSED'
          ? { sub: 'Closed' }
          : {}),
    })),
  );
  protected readonly classNames = computed(() => this.classes().map((c) => c.name));
  protected readonly classOptions = computed<DropdownOption[]>(() => [
    { v: '', l: 'All classes' },
    ...this.classes().map((c) => ({ v: c.id, l: c.name })),
  ]);
  protected readonly sectionOptions = computed<DropdownOption[]>(() => {
    const c = this.classes().find((x) => x.id === this.classId());
    return c
      ? [
          { v: '', l: 'All sections' },
          ...c.sections.map((s) => ({ v: s.id, l: `Section ${s.name}` })),
        ]
      : [];
  });
  protected readonly termOptions = computed<DropdownOption[]>(() => [
    { v: '', l: 'All instalments' },
    ...[...new Set(this.records().map((r) => r.instalment.label))]
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
      .map((t) => ({ v: t, l: t })),
  ]);
  /** The loaded records narrowed by class, instalment, processing, waiting and search. */
  protected readonly filtered = computed(() => {
    const q = this.q().trim().toLowerCase();
    const cls = this.classes().find((c) => c.id === this.classId())?.name;
    const list = this.records().filter(
      (r) =>
        (!cls ||
          (r.student.classSection ?? '').startsWith(`${cls} `) ||
          r.student.classSection === cls) &&
        (!this.term() || r.instalment.label === this.term()) &&
        (!this.proc() || (this.proc() === 'financed') === r.financed) &&
        (this.status() !== 'WAITING' || (!!r.pendingAttempt && this.open(r))) &&
        (!q ||
          r.student.name.toLowerCase().includes(q) ||
          (r.student.admissionNo ?? '').toLowerCase().includes(q) ||
          r.id.replace(/-/g, '').toLowerCase().includes(q.replace(/-/g, ''))),
    );
    const s = this.sort();
    if (!s) return list;
    const val = (r: FeeRecord): string | number =>
      s.k === 'name'
        ? r.student.name
        : s.k === 'term'
          ? r.instalment.label
          : s.k === 'amount'
            ? paiseOf(r.amount)
            : s.k === 'due'
              ? r.dueDate
              : s.k === 'fine'
                ? paiseOf(r.lateFine)
                : s.k === 'status'
                  ? RECORD_STATUS[r.status].l()
                  : processing(r).l;
    return [...list].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const c =
        typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb), 'en', { numeric: true });
      return s.dir === 'desc' ? -c : c;
    });
  });
  protected readonly shown = computed(() =>
    this.filtered().slice((this.page() - 1) * PAGE, this.page() * PAGE),
  );
  protected readonly summary = computed(
    () => `${plural(this.filtered().length, 'record')}${this.cursor() ? ' loaded' : ''}`,
  );
  protected readonly waitingCount = computed(
    () => this.attempts().filter((a) => a.status === 'PENDING').length,
  );

  // --- the key figures (FEE-017 for the year, before today and from today) ------------------------
  protected readonly billed = computed(() => {
    const t = this.figures()?.all.totals;
    return t
      ? { v: inrK(paiseOf(t.billed)), d: `${this.num(t.records)} records · ${this.yearLabel()}` }
      : { v: '—', d: '' };
  });
  protected readonly collected = computed(() => {
    const t = this.figures()?.all.totals;
    return t
      ? {
          v: inrK(paiseOf(t.collected)),
          d: `${rate(paiseOf(t.collected), paiseOf(t.billed)).toFixed(1)}% of billed`,
        }
      : { v: '—', d: '' };
  });
  protected readonly pending = computed(() => {
    const t = this.figures()?.ahead.totals;
    if (!this.figures()) return { v: '—', d: '' };
    const due =
      this.cursor() || this.status() || this.student() || this.sectionId()
        ? null
        : this.records().filter((r) => r.status === 'DUE' || r.status === 'PARTIALLY_PAID').length;
    const parts = [
      due !== null ? `${this.num(due)} due` : '',
      `${this.num(this.waitingCount())} waiting for balance`,
    ].filter(Boolean);
    return { v: inrK(t ? paiseOf(t.outstanding) : 0), d: parts.join(' · ') };
  });
  protected readonly overdue = computed(() => {
    const f = this.figures();
    if (!f) return { v: '—', d: '' };
    const t = f.past.totals;
    return {
      v: inrK(t ? paiseOf(t.outstanding) : 0),
      d: `${this.num(t?.overdue ?? 0)} records past due`,
    };
  });

  constructor() {
    effect(() => {
      // The year, section, status and student filters reload from the server.
      this.yearId();
      this.sectionId();
      this.status();
      this.student();
      if (this.ready) untracked(() => void this.load());
    });
    effect(() => {
      this.yearId();
      if (this.ready) untracked(() => void this.loadFigures());
    });
    void this.init();
  }

  private async init() {
    if (!this.can('fees.view')) return;
    void this.lookups();
    void this.loadAttempts();
    void this.loadRuns();
    // void this.loadFinancing(); // FINANCING-OFF (client 2026-10-22)
    void this.loadUploads();
    try {
      const r = await this.fees.entryFees();
      this.entry.set(r.items);
      const cur = r.items.find((e) => e.year.current) ?? r.items[0];
      this.ready = true;
      if (cur) this.yearId.set(cur.year.id);
      else {
        void this.load();
        void this.loadFigures();
      }
    } catch {
      this.ready = true;
      void this.load();
      void this.loadFigures();
    }
  }

  private async lookups() {
    try {
      this.classes.set((await this.members.classes()).items);
    } catch {
      // The class and section filters then offer "All classes" only.
    }
    try {
      this.heads.set((await this.fees.heads()).items);
    } catch {
      // A manual record is then billed under Tuition (the API's default).
    }
  }

  // --- loading -------------------------------------------------------------------------------------
  private query() {
    const s = this.status();
    return {
      ...(this.yearId() ? { yearId: this.yearId() } : {}),
      ...(this.sectionId() ? { sectionId: this.sectionId() } : {}),
      ...(this.student() ? { studentId: this.student()!.id } : {}),
      ...(s && s !== 'WAITING' ? { status: s as RecordStatus } : {}),
    };
  }

  protected async load() {
    const n = ++this.seq;
    this.loading.set(true);
    try {
      const d = await this.api.records(this.query());
      if (n !== this.seq) return;
      this.records.set(d.items);
      this.cursor.set(d.nextCursor);
      this.page.set(1);
      this.error.set('');
    } catch (e) {
      if (n === this.seq) {
        this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
      }
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
  }

  protected async loadMore() {
    const cursor = this.cursor();
    if (!cursor || this.more()) return;
    const n = this.seq;
    this.more.set(true);
    try {
      const d = await this.api.records({ ...this.query(), cursor });
      if (n !== this.seq) return;
      this.records.update((l) => [...l, ...d.items]);
      this.cursor.set(d.nextCursor);
    } catch (e) {
      this.overlays.toast(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'), {
        tone: 'bad',
      });
    } finally {
      this.more.set(false);
    }
  }

  /** The year's report, and the parts due before today (overdue) and from today (pending). */
  protected async loadFigures() {
    const n = ++this.figSeq;
    const y = this.yearId() ? { yearId: this.yearId() } : {};
    const today = istBusinessDate(new Date());
    try {
      const [all, past, ahead] = await Promise.all([
        this.api.report(y),
        this.api.report({ ...y, to: addDays(today, -1) }),
        this.api.report({ ...y, from: today }),
      ]);
      if (n !== this.figSeq) return;
      this.figures.set({ all, past, ahead });
      this.figuresError.set('');
    } catch (e) {
      if (n === this.figSeq) {
        this.figuresError.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
      }
    }
  }

  protected async loadAttempts() {
    try {
      this.attempts.set((await this.api.attempts()).items);
      this.attemptsError.set('');
    } catch (e) {
      this.attemptsError.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  protected async loadRuns() {
    try {
      this.runs.set((await this.api.runs()).items);
      this.runsError.set('');
    } catch (e) {
      this.runsError.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  protected async loadFinancing() {
    try {
      this.financing.set(await this.api.financing());
      this.financingError.set('');
    } catch (e) {
      this.financingError.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  protected async loadUploads() {
    try {
      this.uploads.set((await this.api.uploads()).items);
      this.uploadsError.set('');
    } catch (e) {
      this.uploadsError.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      this.uploadsLoading.set(false);
    }
  }

  // --- changes -------------------------------------------------------------------------------------
  /** A record changed somewhere: the list, the figures and the queue reload. */
  protected afterChange() {
    void this.load();
    void this.loadFigures();
    void this.loadAttempts();
  }

  protected async openById(id: string) {
    const found = this.records().find((r) => r.id === id);
    if (found) {
      this.openRecord.set(found);
      return;
    }
    try {
      this.openRecord.set(await this.api.record(id));
    } catch (e) {
      this.overlays.toast(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'), {
        tone: 'bad',
      });
    }
  }

  protected showStudent(s: { id: string; name: string }) {
    this.student.set(s);
    this.classId.set('');
    this.sectionId.set('');
    this.tab.set('rec');
  }

  /** GOV-007 after a confirmation with the reason recorded (prototype cm.fr.retry). */
  protected async runAutoDebit() {
    const c = await this.overlays.confirm({
      title: 'Run auto-debit now?',
      text: `Every pending fee payment of this institution is tried once now (${plural(this.waitingCount(), 'payment')} waiting). Unpaid records past their due date become overdue with the late fine.`,
      ok: 'Run now',
      reason: {
        label: 'Reason',
        placeholder: 'e.g. Parents topped up this morning',
        min: 5,
        max: 200,
      },
    });
    if (!c) return;
    this.running.set(true);
    try {
      const r = await this.api.runAutoDebit(c.reason ?? '');
      this.overlays.toast('Auto-debit finished', {
        tone: r.processed ? 'ok' : 'info',
        sub: `${plural(r.processed, 'payment')} collected${r.failed ? ` · ${r.failed} failed` : ''}${r.note ? ` · ${r.note}` : ''}`,
      });
      void this.loadRuns();
      this.afterChange();
    } catch (e) {
      this.overlays.toast("Couldn't run the auto-debit", {
        tone: 'bad',
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
      });
    } finally {
      this.running.set(false);
    }
  }

  protected committed(e: { created: number; skipped: number; fileName: string }) {
    this.uploading.set(null);
    this.overlays.toast(`${this.num(e.created)} fee records created`, {
      sub: `${e.fileName}${e.skipped ? ` · ${plural(e.skipped, 'row')} skipped` : ''}`,
    });
    this.tab.set('upl');
    void this.loadUploads();
    this.afterChange();
  }

  // --- formatting ----------------------------------------------------------------------------------
  protected tabCount(t: Tab): string {
    if (t === 'rec') {
      return this.loading() ? '' : `${this.num(this.records().length)}${this.cursor() ? '+' : ''}`;
    }
    if (t === 'fin')
      return this.financing()?.items.length ? this.num(this.financing()!.items.length) : '';
    if (t === 'upl') return this.uploads().length ? this.num(this.uploads().length) : '';
    if (t === 'job') return this.waitingCount() ? this.num(this.waitingCount()) : '';
    return '';
  }
  protected sortBy(k: SortKey) {
    const s = this.sort();
    this.sort.set({ k, dir: s?.k === k && s.dir === 'asc' ? 'desc' : 'asc' });
    this.page.set(1);
  }
  protected ariaSort(k: SortKey) {
    const s = this.sort();
    return s?.k === k ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  }
  protected st(r: FeeRecord) {
    return RECORD_STATUS[r.status];
  }
  protected pr(r: FeeRecord) {
    return processing(r);
  }
  protected open(r: FeeRecord) {
    return r.status === 'DUE' || r.status === 'OVERDUE' || r.status === 'PARTIALLY_PAID';
  }
  protected paise(m: { amount: string }) {
    return paiseOf(m);
  }
  protected short(id: string) {
    return shortRef(id);
  }
  protected date(v: string) {
    return formatDate(v);
  }
  protected time(v: string) {
    return formatTime(v);
  }
  /** Names are stored in capitals; shown in title case. */
  protected person(n: string) {
    return titleCase(n);
  }
  protected num(n: number) {
    return n.toLocaleString('en-IN');
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected can(sub: string) {
    return this.session()?.subTasks.includes(sub) ?? false;
  }
}
