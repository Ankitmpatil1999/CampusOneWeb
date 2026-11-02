import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Amount } from '../../../Shared/Amount';
import { Avatar } from '../../../Shared/Avatar';
import { Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal } from '../../../Shared/Overlays';
import { Pager } from '../../../Shared/Pager';
import { formatDate, formatTime } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { inr, paiseOf, plural } from '../Fees/fee-format';
import { FeesApi, type EntryFeesRow, type FeeStructure } from '../Fees/fees.api';
import { RECORD_STATUS } from '../FeeRecords/record-format';
import { MembersApi, type ClassView } from '../Members/members.api';
import {
  FeeCollectionApi,
  type CollectionStudent,
  type EntryFee,
  type FeeCollectionStudent,
  type FeeCollectionView,
  type LineStatus,
  type ReceiptRow,
  type ReceiptsView,
} from './fee-collection.api';
import { FeeCollect } from './FeeCollect';
import { InstalmentReceipt, PAY_MODE } from './InstalmentReceipt';

/** The students with what each paid, or the receipts issued (as the admission fees page). */
type Tab = 'fees' | 'rcpt';
const PAGE = 15;

/**
 * A structure's approved version: the current one when approved, or the one an edit is waiting on
 * (FEE-003 lists `active` only beside a newer draft or pending version). Null: never approved.
 */
const approvedVersion = (s: FeeStructure) =>
  s.status === 'ACTIVE' ? s.current : (s.active ?? null);

/** A head's line status: the record statuses, and a line the financing partner pays. */
const LINE_STATUS: Readonly<Record<LineStatus, { l: () => string; tone: string }>> = {
  DUE: RECORD_STATUS.DUE,
  OVERDUE: RECORD_STATUS.OVERDUE,
  PARTIALLY_PAID: RECORD_STATUS.PARTIALLY_PAID,
  PAID: RECORD_STATUS.PAID,
  FINANCED: { l: () => 'Financed', tone: 'violet' },
};

/**
 * c.feecollection — Fee collection details (FEE-044/045; client 2026-10-16, 2026-10-19): an academic
 * year (the current one at first), narrowed by class, section and — when one is picked — an
 * approved fee structure. Every fee head of the year is a column (only the structure's when one is
 * picked), with the application and admission fees and each student's total collected; the cards
 * add up what every head and the year collected over all the students the filters keep. A page of
 * students at a time; a head opens its instalments for the student. The figures come from the
 * payments made. The Collect fee button is offered only while an instalment is due, but the whole
 * row opens the dialog for every student — paid, nothing due or no fees — so the instalments and
 * their receipts can be seen (client 2026-10-22).
 * The Receipts tab (FEE-057), as the admission fees page's: every instalment receipt of the year the
 * filters keep, newest first, a row opening the receipt with its PDF (FEE-056, FEE-054); its cards
 * add up what the receipts collected, in cash, online and from the wallet. The cards follow the tab
 * and are never the other tab's, even while loading.
 */
@Component({
  selector: 'rp-console-fee-collection',
  imports: [
    Amount,
    Avatar,
    Dropdown,
    Empty,
    FeeCollect,
    Icon,
    InstalmentReceipt,
    Kpi,
    Modal,
    PageHead,
    Pager,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Fee collection details"
        sub="What each student has paid in the academic year, head by head."
      />

      @if (!canView()) {
        <rp-empty
          icon="lock"
          title="This page isn't part of your role"
          text="Fee collections are kept by the accounts office. Pages your role can open are listed in the menu."
        />
      } @else {
        <div class="c-filters">
          <div class="fld">
            <rp-dd
              inputId="fc-year"
              placeholder="Academic year"
              [options]="yearOptions()"
              [value]="yearId()"
              (changed)="pickYear($event)"
            />
          </div>
          <div class="fld">
            <rp-dd
              inputId="fc-cls"
              placeholder="All classes"
              [options]="classOptions()"
              [value]="classId()"
              (changed)="classId.set($event); sectionId.set(''); reload()"
            />
          </div>
          @if (sectionOptions().length > 1) {
            <div class="fld">
              <rp-dd
                inputId="fc-sec"
                placeholder="All sections"
                [options]="sectionOptions()"
                [value]="sectionId()"
                (changed)="sectionId.set($event); reload()"
              />
            </div>
          }
          <!-- Receipts aren't kept by structure (FEE-057). -->
          @if (tab() === 'fees') {
            <div class="fld" style="min-width: 220px">
              <rp-dd
                inputId="fc-structure"
                placeholder="All fee structures"
                [options]="structureOptions()"
                [value]="structureId()"
                (changed)="structureId.set($event); reload()"
              />
            </div>
          }
          <label class="search"
            ><rp-icon name="search" [size]="16" /><input
              type="search"
              id="fc-q"
              [placeholder]="
                tab() === 'rcpt'
                  ? 'Search student, admission or receipt no.'
                  : 'Search student or admission no.'
              "
              [attr.aria-label]="tab() === 'rcpt' ? 'Search receipts' : 'Search students'"
              autocomplete="off"
              [value]="q()"
              (input)="search(val($event))"
          /></label>
        </div>

        <div class="tabs" role="tablist" aria-label="Fee collection">
          @for (t of tabs; track t.v) {
            <button
              type="button"
              class="tab"
              role="tab"
              [id]="'fc-tab-' + t.v"
              [class.on]="tab() === t.v"
              [attr.aria-selected]="tab() === t.v"
              (click)="pickTab(t.v)"
            >
              {{ t.l }}
            </button>
          }
        </div>

        @if (error()) {
          <div class="card pad">
            <rp-empty icon="alertc" [title]="failed()" [text]="error()">
              <button type="button" class="btn btn-sec btn-sm" (click)="load()">
                <span>Try again</span>
              </button>
            </rp-empty>
          </div>
        } @else if (tab() === 'rcpt') {
          @if (rcpt(); as r) {
            <div class="c-grid k4" id="fc-rcards">
              <rp-kpi
                [label]="'Collected · ' + r.year.label"
                icon="checkc"
                tone="ok"
                [value]="inr(r.totals.collected)"
                [delta]="plural(r.totals.count, 'receipt')"
              />
              <rp-kpi
                label="Cash"
                icon="rupee"
                [value]="inr(r.totals.cash.amount)"
                [delta]="plural(r.totals.cash.count, 'receipt')"
              />
              <rp-kpi
                label="Online"
                icon="globe"
                [value]="inr(r.totals.online.amount)"
                [delta]="plural(r.totals.online.count, 'receipt')"
              />
              <rp-kpi
                label="Wallet"
                icon="wallet"
                [value]="inr(r.totals.wallet.amount)"
                [delta]="plural(r.totals.wallet.count, 'receipt')"
              />
            </div>

            <div class="tbl-wrap">
              <table class="tbl" id="fc-rcpt">
                <thead>
                  <tr>
                    <th>Receipt / reference</th>
                    <th>For</th>
                    <th>Student</th>
                    <th>Mode</th>
                    <th>Transaction ID</th>
                    <th class="r">Amount</th>
                    <th>Paid</th>
                  </tr>
                </thead>
                <tbody>
                  @for (x of r.items; track x.collectionId) {
                    <tr
                      tabindex="0"
                      data-act
                      (click)="receiptId.set(x.collectionId)"
                      (keydown.enter)="receiptId.set(x.collectionId)"
                    >
                      <td>
                        <span class="t-mono">{{ x.receiptNo }}</span>
                      </td>
                      <td>{{ x.instalment.label }}</td>
                      <td>
                        <div class="cell-t">{{ x.student.name }}</div>
                        <div class="cell-s">
                          {{ x.student.admissionNo ?? '—' }} ·
                          {{ x.student.classSection ?? 'Not enrolled' }}
                        </div>
                      </td>
                      <td>
                        <span class="tag"
                          ><rp-icon [name]="mode(x).icon" [size]="12" />{{ mode(x).l }}</span
                        >
                      </td>
                      <!-- The payment gateway's own ID for an online payment (client 2026-10-16). -->
                      <td>
                        <span class="t-mono t-sm">{{ x.transactionId ?? '—' }}</span>
                      </td>
                      <td class="r">
                        <rp-amt [value]="x.total" />
                        @if (fined(x)) {
                          <div class="cell-s">incl. fine {{ inr(x.fine) }}</div>
                        }
                      </td>
                      <td>
                        <div class="cell-t t-num" style="font-weight: 550">
                          {{ date(x.paidAt) }}
                        </div>
                        <div class="cell-s">{{ time(x.paidAt) }}</div>
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="7">
                        <rp-empty
                          icon="receipt"
                          [title]="
                            filtered() ? 'No receipt matches' : 'No receipts for ' + r.year.label
                          "
                        />
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <rp-pager
              [total]="r.total"
              [page]="r.page"
              [size]="pageSize"
              [always]="true"
              (go)="goPage($event)"
            />
          } @else {
            <div class="card pad"><rp-empty icon="hourglass" title="Loading…" /></div>
          }
        } @else if (!view()) {
          <div class="card pad"><rp-empty icon="hourglass" title="Loading…" /></div>
        } @else {
          @let v = view()!;
          <div class="c-grid k4" id="fc-cards">
            <rp-kpi
              [label]="'Total collected · ' + v.year.label"
              icon="checkc"
              tone="ok"
              [value]="inr(v.cards.total.collected)"
              [small]="'of ' + inr(v.cards.total.amount)"
            />
            @for (c of v.cards.heads; track c.headId; let i = $index) {
              <rp-kpi [label]="v.heads[i]!.name" icon="receipt" [value]="inr(c.collected)" />
            }
            <rp-kpi
              label="Application fee"
              icon="file"
              [value]="inr(v.cards.applicationFee.collected)"
            />
            <rp-kpi
              label="Admission fee"
              icon="school"
              [value]="inr(v.cards.admissionFee.collected)"
            />
          </div>

          <div class="tbl-wrap">
            <table class="tbl" id="fc-table">
              <thead>
                <tr>
                  <th>Student</th>
                  @for (h of v.heads; track h.id) {
                    <th class="r">{{ h.name }}</th>
                  }
                  <th class="r">Application fee</th>
                  <th class="r">Admission fee</th>
                  <th class="r">Total fee collected</th>
                  @if (canCollect()) {
                    <th><span class="sr">Collect</span></th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (st of v.students; track st.id) {
                  <!-- The whole row opens Collect fee, for every student: a paid one's instalments
                       and receipts are seen there too (client 2026-10-22). -->
                  <tr
                    [attr.tabindex]="canCollect() ? 0 : null"
                    [attr.data-act]="canCollect() ? '' : null"
                    (click)="collect(st)"
                    (keydown.enter)="$event.target === $event.currentTarget && collect(st)"
                  >
                    <td>
                      <div class="cell-main">
                        <rp-av [name]="st.name" size="sm" />
                        <div style="min-width: 0">
                          <div class="cell-t t-clip">{{ st.name }}</div>
                          <div class="cell-s">
                            {{ st.admissionNo ?? '—' }} · {{ st.classSection ?? 'Not enrolled' }}
                          </div>
                        </div>
                      </div>
                    </td>
                    @for (c of st.heads; track $index) {
                      <td class="r">
                        @if (c) {
                          <button
                            type="button"
                            class="linkbtn fc-head"
                            [attr.aria-label]="v.heads[$index]!.name + ' instalments of ' + st.name"
                            (click)="$event.stopPropagation(); show(st, $index)"
                          >
                            <rp-amt [value]="c.collected" />
                          </button>
                          <div class="cell-s">of {{ inr(c.amount) }}</div>
                        } @else {
                          <span class="t-faint">—</span>
                        }
                      </td>
                    }
                    @for (e of [st.applicationFee, st.admissionFee]; track $index) {
                      <td class="r fc-entry">
                        @if (e) {
                          <rp-amt [value]="e.collected" />
                          <div class="cell-s" [class.t-warn]="e.status !== 'PAID'">
                            {{ entryText(e) }}
                          </div>
                        } @else {
                          <span class="t-faint">—</span>
                        }
                      </td>
                    }
                    <td class="r fc-total">
                      <rp-amt [value]="st.total.collected" cls="t-b" />
                      <div class="cell-s">of {{ inr(st.total.amount) }}</div>
                    </td>
                    @if (canCollect()) {
                      <!-- Only something still due is collected (client 2026-10-22). -->
                      <td class="r">
                        @if (st.collectable) {
                          <button
                            type="button"
                            class="btn btn-sec btn-sm fc-collect"
                            [attr.aria-label]="'Collect fee from ' + st.name"
                            (click)="$event.stopPropagation(); collect(st)"
                          >
                            <rp-icon name="rupee" [size]="15" /><span>Collect fee</span>
                          </button>
                        } @else {
                          <span class="chip fc-nodue">{{ noDue(st) }}</span>
                        }
                      </td>
                    }
                  </tr>
                } @empty {
                  <tr>
                    <td [attr.colspan]="v.heads.length + (canCollect() ? 5 : 4)">
                      <rp-empty
                        icon="users"
                        [title]="filtered() ? 'No student matches' : 'No student in this year'"
                      />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <rp-pager
            [total]="v.total"
            [page]="v.page"
            [size]="pageSize"
            [always]="true"
            (go)="goPage($event)"
          />
        }
      }
    </div>

    @if (receiptId(); as id) {
      <rp-instalment-receipt [collectionId]="id" (closed)="receiptId.set('')" />
    }

    @if (collecting(); as c) {
      <rp-fee-collect
        [studentId]="c.id"
        [studentName]="c.name"
        [yearId]="yearId()"
        (closed)="collecting.set(null)"
        (changed)="load()"
      />
    }

    @if (opened(); as o) {
      <rp-modal
        [title]="o.head + ' · ' + o.student.name"
        [sub]="(o.student.classSection ?? 'Not enrolled') + ' · ' + (o.student.admissionNo ?? '—')"
        icon="receipt"
        [narrow]="false"
        (closed)="opened.set(null)"
      >
        @if (detailError()) {
          <rp-empty icon="alertc" title="Couldn't load the instalments" [text]="detailError()" />
        } @else if (!line()) {
          <rp-empty icon="hourglass" title="Loading…" />
        } @else {
          <dl class="kv" id="fc-sum">
            <dt>Total fee</dt>
            <dd><rp-amt [value]="line()!.amount" /></dd>
            <dt>Collected</dt>
            <dd><rp-amt [value]="line()!.collected" /></dd>
            <dt>Pending</dt>
            <dd><rp-amt [value]="line()!.pending" /></dd>
          </dl>
          <div class="tbl-wrap mt12">
            <table class="tbl" id="fc-inst">
              <thead>
                <tr>
                  <th>Instalment</th>
                  <th>Due</th>
                  <th class="r">Amount</th>
                  <th class="r">Collected</th>
                  <th class="r">Pending</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (x of line()!.instalments; track $index) {
                  <tr>
                    <td>{{ x.label }}</td>
                    <td>{{ date(x.dueDate) }}</td>
                    <td class="r"><rp-amt [value]="x.amount" /></td>
                    <td class="r"><rp-amt [value]="x.collected" /></td>
                    <td class="r"><rp-amt [value]="x.pending" /></td>
                    <td>
                      <span [class]="'chip dot tone-' + status(x.status).tone">{{
                        status(x.status).l()
                      }}</span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
        <div modal-foot class="row g8">
          <button type="button" class="btn btn-sec" (click)="opened.set(null)">
            <span>Close</span>
          </button>
        </div>
      </rp-modal>
    }
  `,
})
export class ConsoleFeeCollection {
  private readonly api = inject(FeeCollectionApi);
  private readonly fees = inject(FeesApi);
  private readonly members = inject(MembersApi);
  private readonly session = inject(SessionContext).console;

  protected readonly plural = plural;
  protected readonly inr = inr;
  protected readonly pageSize = PAGE;
  protected readonly tabs: readonly { v: Tab; l: string }[] = [
    { v: 'fees', l: 'Fees by student' },
    { v: 'rcpt', l: 'Receipts' },
  ];

  protected readonly canView = computed(
    () => this.session()?.subTasks.includes('fees.view') ?? false,
  );
  /** Collect Fee (client 2026-10-19, 2026-10-22): pay now, a payment link, or cash. */
  protected readonly canCollect = computed(
    () => this.session()?.subTasks.includes('fees.collect') ?? false,
  );
  /** The student whose fee is being collected. */
  protected readonly collecting = signal<CollectionStudent | null>(null);
  private readonly years = signal<readonly EntryFeesRow[]>([]);
  private readonly classes = signal<readonly ClassView[]>([]);
  /** The year's approved structures. */
  private readonly structures = signal<readonly FeeStructure[]>([]);
  protected readonly yearId = signal('');
  protected readonly classId = signal('');
  protected readonly sectionId = signal('');
  protected readonly structureId = signal('');
  protected readonly q = signal('');
  private readonly page = signal(1);
  readonly tab = signal<Tab>('fees');
  protected readonly view = signal<FeeCollectionView | null>(null);
  /** The Receipts tab's page and totals (FEE-057). */
  protected readonly rcpt = signal<ReceiptsView | null>(null);
  /** The receipt open from the Receipts tab (FEE-056). */
  protected readonly receiptId = signal('');
  protected readonly error = signal('');

  protected readonly opened = signal<{
    student: CollectionStudent;
    headId: string;
    head: string;
  } | null>(null);
  private readonly detail = signal<FeeCollectionStudent | null>(null);
  protected readonly detailError = signal('');
  /** Answers to an earlier query are dropped. */
  private seq = 0;
  private typing: ReturnType<typeof setTimeout> | undefined;

  protected readonly yearOptions = computed<DropdownOption[]>(() =>
    this.years().map((e) => ({
      v: e.year.id,
      l: `Academic year ${e.year.label}`,
      ...(e.year.current
        ? { sub: 'Current' }
        : e.year.status === 'CLOSED'
          ? { sub: 'Closed' }
          : {}),
    })),
  );
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
  protected readonly structureOptions = computed<DropdownOption[]>(() => [
    { v: '', l: 'All fee structures' },
    ...this.structures().map((s) => ({
      v: s.id,
      l: s.name,
      sub: `Version ${approvedVersion(s)!.no}`,
    })),
  ]);
  protected readonly failed = computed(() =>
    this.tab() === 'rcpt' ? "Couldn't load the receipts" : "Couldn't load the collection",
  );
  /** Narrowed beyond the year (the structure counts on the fees tab only). */
  protected readonly filtered = computed(
    () =>
      !!(
        this.classId() ||
        this.sectionId() ||
        (this.tab() === 'fees' && this.structureId()) ||
        this.q().trim()
      ),
  );
  /** The head opened for the student. */
  protected readonly line = computed(() => {
    const o = this.opened();
    return this.detail()?.heads.find((h) => h.id === o?.headId) ?? null;
  });

  constructor() {
    if (this.canView()) void this.init();
  }

  private async init() {
    void this.loadClasses();
    try {
      const r = await this.fees.entryFees();
      this.years.set(r.items);
      const cur = r.items.find((e) => e.year.current) ?? r.items[0];
      if (cur) this.yearId.set(cur.year.id);
    } catch {
      // The API's current year is used.
    }
    void this.loadStructures();
    void this.load();
  }

  private async loadClasses() {
    try {
      this.classes.set((await this.members.classes()).items);
    } catch {
      // The class and section filters then offer "All classes" only.
    }
  }

  /** The year's approved structures. */
  private async loadStructures() {
    const year = this.yearId();
    try {
      const r = await this.fees.structures(year ? { yearId: year } : {});
      if (year === this.yearId()) this.structures.set(r.items.filter((s) => approvedVersion(s)));
    } catch {
      this.structures.set([]);
    }
  }

  protected pickYear(id: string) {
    this.yearId.set(id);
    this.structureId.set('');
    this.structures.set([]);
    void this.loadStructures();
    this.reload();
  }

  /** A filter changed: from the first page. */
  protected reload() {
    this.page.set(1);
    void this.load();
  }

  protected search(v: string) {
    this.q.set(v);
    clearTimeout(this.typing);
    this.typing = setTimeout(() => this.reload(), 300);
  }

  protected goPage(p: number) {
    this.page.set(p);
    void this.load();
  }

  /**
   * Another tab: its own rows and cards from the first page, the same filters. Neither tab's
   * figures are kept, so the cards never show the other tab's numbers while the new ones load.
   */
  protected pickTab(t: Tab) {
    if (t === this.tab()) return;
    this.tab.set(t);
    this.view.set(null);
    this.rcpt.set(null);
    this.reload();
  }

  /** The tab's page: the students (FEE-044) or the receipts (FEE-057). */
  protected async load() {
    const mine = ++this.seq;
    this.error.set('');
    const q = {
      yearId: this.yearId(),
      classId: this.classId(),
      sectionId: this.sectionId(),
      q: this.q().trim(),
      page: this.page(),
      pageSize: PAGE,
    };
    try {
      if (this.tab() === 'rcpt') {
        const r = await this.api.receipts(q);
        if (mine === this.seq) this.rcpt.set(r);
      } else {
        const v = await this.api.view({ ...q, structureId: this.structureId() });
        if (mine === this.seq) this.view.set(v);
      }
    } catch (e) {
      if (mine === this.seq) {
        this.view.set(null);
        this.rcpt.set(null);
        this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
      }
    }
  }

  protected async show(student: CollectionStudent, idx: number) {
    const head = this.view()?.heads[idx];
    if (!head) return;
    this.detail.set(null);
    this.detailError.set('');
    this.opened.set({ student, headId: head.id, head: head.name });
    try {
      const d = await this.api.student(student.id, {
        yearId: this.yearId(),
        structureId: this.structureId(),
      });
      if (this.opened()?.student.id === student.id) this.detail.set(d);
    } catch (e) {
      this.detailError.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  /**
   * Collect fee for the student — from the row (any student: a paid one's instalments and receipts
   * are there too) or its button; one dialog at a time.
   */
  protected collect(st: CollectionStudent) {
    if (this.canCollect() && !this.collecting()) this.collecting.set(st);
  }

  /**
   * Nothing to collect here: "No fees" when the student has none, "Paid" when nothing is pending,
   * else "No instalment due" (what is left is the admission fee, collected on its own page, or an
   * instalment the financing partner pays).
   */
  protected noDue(st: CollectionStudent) {
    if (paiseOf(st.total.amount) <= 0) return 'No fees';
    return paiseOf(st.total.pending) > 0 ? 'No instalment due' : 'Paid';
  }

  /** "Paid · Online", "Pending ₹10,000.00", "Failed". */
  protected entryText(e: EntryFee) {
    if (e.status === 'PAID') {
      return e.mode ? `Paid · ${e.mode === 'CASH' ? 'Cash' : 'Online'}` : 'Paid';
    }
    return e.status === 'FAILED' ? 'Failed' : `Pending ${inr(e.pending)}`;
  }
  protected status(s: LineStatus) {
    return LINE_STATUS[s];
  }
  protected mode(x: ReceiptRow) {
    return PAY_MODE[x.mode];
  }
  /** A late fine was paid with the instalment. */
  protected fined(x: ReceiptRow) {
    return paiseOf(x.fine) > 0;
  }
  protected date(d: string) {
    return formatDate(d);
  }
  protected time(d: string) {
    return formatTime(d);
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
}
