import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SessionContext } from '../../../../Context/SessionContext';
import { Amount } from '../../../Shared/Amount';
import { Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { Pager } from '../../../Shared/Pager';
import { formatDate, formatTime } from '../../../Utils/format';
import { newIdempotencyKey } from '../../../Utils/ids';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { APP_STATUS, feeChip } from '../Applications/app-format';
import { ApplicationsApi, type AppStatus } from '../Applications/applications.api';
import type { CollectWay } from '../Fees/CollectChoices';
import { deskCheckout } from '../Fees/desk-checkout';
import { inr, inr0, paiseOf, plural, saveCsv } from '../Fees/fee-format';
import { FeesApi, type EntryFeesRow } from '../Fees/fees.api';
import { AdmissionReceipt } from './AdmissionReceipt';
import { CashCollection, type CashTarget } from './CashCollection';
import { CollectFee } from './CollectFee';
import { FeeCell } from './FeeCell';
import { PaymentLinkSheet, type SentLink } from './PaymentLinkSheet';
import { AdmissionFeesApi, type AdmissionFee, type AdmissionFees } from './admission-fees.api';

type Tab = 'fees' | 'rcpt';
/**
 * An application's fees together: DUE (one is not paid), TO_CONFIRM (all paid, Accounts still to
 * confirm one), CONFIRMED (all confirmed — the admission number can be assigned), REJECTED.
 */
type FeeState = 'DUE' | 'TO_CONFIRM' | 'CONFIRMED' | 'REJECTED';
type Pill = '' | 'DUE' | 'TO_CONFIRM' | 'CONFIRMED';
const PAGE = 12;

/** Cash recorded for a fee (ADM-022): its receipt, to open once the list has it. */
interface AdmissionCash {
  readonly receiptNo: string;
  readonly paymentId: string;
}

/** One application with its application fee and admission fee (client 2026-10-12). */
export interface AppFees {
  readonly applicationId: string;
  readonly applicationNo: string;
  readonly applicationStatus: AppStatus;
  readonly student: string | null;
  readonly admissionNo: string | null;
  readonly class: string | null;
  readonly application: AdmissionFee | null;
  readonly admission: AdmissionFee | null;
  readonly state: FeeState;
  /** What is still to collect (paise), and the paid fees Accounts has to confirm. */
  readonly duePaise: number;
  readonly toConfirm: number;
}

const STATE: Readonly<Record<FeeState, { l: string; tone: string }>> = {
  DUE: { l: 'Fees due', tone: 'warn' },
  TO_CONFIRM: { l: 'To confirm', tone: 'info' },
  CONFIRMED: { l: 'Confirmed', tone: 'ok' },
  REJECTED: { l: 'Rejected', tone: 'bad' },
};

/** The fees of each application on one row, in the order the server lists them. */
export function byApplication(items: readonly AdmissionFee[]): AppFees[] {
  const order: string[] = [];
  const by = new Map<string, AdmissionFee[]>();
  for (const f of items) {
    if (!by.has(f.applicationId)) {
      by.set(f.applicationId, []);
      order.push(f.applicationId);
    }
    by.get(f.applicationId)!.push(f);
  }
  return order.map((id) => {
    const list = by.get(id)!;
    const head = list[0]!;
    const unpaid = list.filter((f) => f.status !== 'PAID');
    const toConfirm = list.filter((f) => f.status === 'PAID' && !f.confirmedAt).length;
    const rejected = head.applicationStatus === 'REJECTED';
    return {
      applicationId: id,
      applicationNo: head.applicationNo,
      applicationStatus: head.applicationStatus,
      student: head.student,
      admissionNo: head.admissionNo,
      class: head.class,
      application: list.find((f) => f.feeType === 'APPLICATION') ?? null,
      admission: list.find((f) => f.feeType === 'ADMISSION') ?? null,
      state: rejected ? 'REJECTED' : unpaid.length ? 'DUE' : toConfirm ? 'TO_CONFIRM' : 'CONFIRMED',
      duePaise: rejected ? 0 : unpaid.reduce((a, f) => a + paiseOf(f.amount), 0),
      toConfirm,
    };
  });
}

interface YearChoice {
  readonly id: string;
  readonly label: string;
  readonly current: boolean;
  readonly status: string;
  readonly fees: EntryFeesRow['fees'];
}

/**
 * c.admfees — Admission fees (SRS 19.8, FR-FEE-12, FR-ADM-08, BR-36; ADM-021…024; prototype
 * c.admfees): for the admission year chosen, each application with its application fee and its
 * admission fee on one row (client 2026-10-12) — the status of each and of the two together, how
 * and when each was paid, and what the accounts desk does next (confirm the receipt, or Collect
 * fees: pay now at the gateway, send a payment link or record cash — client 2026-10-22); then the
 * receipts (PDF).
 */
@Component({
  selector: 'rp-console-admission-fees',
  imports: [
    AdmissionReceipt,
    Amount,
    CashCollection,
    CollectFee,
    Empty,
    FeeCell,
    Icon,
    Kpi,
    PageHead,
    Pager,
    PaymentLinkSheet,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Admission fees"
        sub="Each application with its application fee and admission fee — paid online with the form or later as cash. Accounts confirms each receipt before the admission number is assigned."
      />

      @if (!canView()) {
        <rp-empty
          icon="lock"
          title="This page isn't part of your role"
          text="Admission fees are kept by the accounts office. Pages your role can open are listed in the menu."
        />
      } @else {
        @if (readOnly()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow"><b>Read-only.</b> {{ readOnly() }}</div>
          </div>
        }
        <div class="row g12 wrap" id="af-head">
          @if (years().length) {
            <span class="t-sm t-muted">Admission year</span>
            <div class="seg" role="radiogroup" aria-label="Admission year" style="flex: 0 0 auto">
              <span
                class="seg-ind"
                [style.width]="
                  'calc((100% - ' + (years().length * 2 + 4) + 'px) / ' + years().length + ')'
                "
                [style.left]="
                  'calc(3px + ' +
                  yearIndex() +
                  ' * ((100% - ' +
                  (years().length * 2 + 4) +
                  'px) / ' +
                  years().length +
                  ' + 2px))'
                "
              ></span>
              @for (y of years(); track y.id) {
                <button
                  type="button"
                  role="radio"
                  [class.on]="yearId() === y.id"
                  [attr.aria-checked]="yearId() === y.id"
                  (click)="yearId.set(y.id)"
                >
                  {{ y.label }}
                  @if (waiting()[y.label]; as w) {
                    <span
                      class="af-wait"
                      [attr.title]="plural(w, 'receipt') + ' waiting for Accounts to confirm'"
                      >{{ w }}</span
                    >
                  }
                </button>
              }
            </div>
          }
          <span class="t-xs t-muted grow">{{ feeText() }}</span>
          @if (can('fees.view')) {
            <a class="linkbtn" routerLink="/console/fees"
              >Entry fee settings<rp-icon name="right" [size]="14"
            /></a>
          }
        </div>
        @if (elsewhere(); as w) {
          <div class="note tone-warn" id="af-elsewhere" role="status">
            <rp-icon name="info" [size]="17" />
            <div class="grow">
              <b>{{ plural(w.n, 'receipt') }} waiting for Accounts in {{ w.label }}.</b>
              @if (w.current) {
                Mid-term admissions are kept under the year already under way.
              }
            </div>
            <button type="button" class="btn btn-sec btn-sm" (click)="yearId.set(w.id)">
              <span>Show {{ w.label }}</span>
            </button>
          </div>
        }

        <div class="c-grid k4">
          <rp-kpi
            label="Application fees"
            icon="filetext"
            [value]="figures().app"
            [delta]="figures().appSub"
          />
          <rp-kpi
            label="Admission fees collected"
            icon="rupee"
            tone="ok"
            [value]="figures().adm"
            [delta]="figures().admSub"
          />
          <rp-kpi
            label="Admission fees due"
            icon="clock"
            tone="warn"
            [value]="figures().due"
            [delta]="figures().dueSub"
          />
          <rp-kpi
            label="Cash collections"
            icon="receipt"
            [value]="figures().cash"
            delta="Receipts issued at the accounts desk"
          />
        </div>

        <div class="tabs" role="tablist" aria-label="Fees">
          @for (t of tabs; track t.v) {
            <button
              type="button"
              class="tab"
              role="tab"
              [id]="'af-tab-' + t.v"
              [class.on]="tab() === t.v"
              [attr.aria-selected]="tab() === t.v"
              (click)="tab.set(t.v); page.set(1)"
            >
              {{ t.l }}
              @if (data()) {
                <span class="n">{{ tabCount(t.v) }}</span>
              }
            </button>
          }
        </div>

        @if (tab() === 'fees') {
          <div class="c-filters">
            <label class="search"
              ><rp-icon name="search" [size]="16" /><input
                type="search"
                id="af-q"
                placeholder="Student, application or admission no."
                aria-label="Search fees"
                autocomplete="off"
                [value]="q()"
                (input)="q.set(val($event)); page.set(1)"
            /></label>
            <div class="pills" role="group" aria-label="Status">
              @for (p of pills; track p.v) {
                <button
                  type="button"
                  class="pill"
                  [class.on]="pill() === p.v"
                  [attr.aria-pressed]="pill() === p.v"
                  (click)="pill.set(p.v); page.set(1)"
                >
                  {{ p.l }}
                  @if (data()) {
                    <span class="n">{{ pillCount(p.v) }}</span>
                  }
                </button>
              }
            </div>
            <span class="fsum">{{ summary() }}</span>
            <button
              type="button"
              class="btn btn-sec btn-sm"
              id="af-export"
              [disabled]="!feeRows().length"
              (click)="exportFees()"
            >
              <rp-icon name="download" [size]="15" /><span>Export</span>
            </button>
          </div>
        }

        @if (error()) {
          <div class="card pad">
            <rp-empty icon="alertc" title="Couldn't load the fees" [text]="error()">
              <button type="button" class="btn btn-sec btn-sm" (click)="load()">
                <span>Try again</span>
              </button>
            </rp-empty>
          </div>
        } @else {
          <div class="tbl-wrap">
            @if (tab() === 'fees') {
              <table class="tbl" id="af-fees">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Application</th>
                    <th>Application fee</th>
                    <th>Admission fee</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of shownFees(); track r.applicationId) {
                    <tr>
                      <td>
                        <div class="cell-t">{{ r.student ?? '—' }}</div>
                        <div class="cell-s">
                          {{ r.class ?? '—' }} ·
                          <span class="t-mono">{{ r.admissionNo ?? 'no admission no. yet' }}</span>
                        </div>
                      </td>
                      <td>
                        <span class="t-mono">{{ r.applicationNo }}</span>
                        <div class="cell-s">
                          <span [class]="'chip tone-' + appSt(r.applicationStatus).tone">{{
                            appSt(r.applicationStatus).l()
                          }}</span>
                        </div>
                      </td>
                      <td class="af-app">
                        <rp-af-fee
                          type="APPLICATION"
                          [fee]="r.application"
                          [status]="r.applicationStatus"
                          [verifyWhy]="verifyWhy()"
                          [collectWhy]="collectWhy()"
                          [confirming]="
                            !!r.application && confirmBusy() === r.application.paymentId
                          "
                          [busy]="collectBusy() === r.applicationId + ':APPLICATION'"
                          (confirm)="confirm($event)"
                          (receipt)="receiptFor.set($event)"
                          (collect)="collectFor.set({ fee: $event, row: r })"
                        />
                      </td>
                      <td class="af-adm">
                        <rp-af-fee
                          type="ADMISSION"
                          [fee]="r.admission"
                          [status]="r.applicationStatus"
                          [verifyWhy]="verifyWhy()"
                          [collectWhy]="collectWhy()"
                          [confirming]="!!r.admission && confirmBusy() === r.admission.paymentId"
                          [busy]="collectBusy() === r.applicationId + ':ADMISSION'"
                          (confirm)="confirm($event)"
                          (receipt)="receiptFor.set($event)"
                          (collect)="collectFor.set({ fee: $event, row: r })"
                        />
                      </td>
                      <td class="af-state">
                        <span [class]="'chip dot tone-' + state(r).tone">{{ state(r).l }}</span>
                        <div class="cell-s">{{ stateText(r) }}</div>
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="5">
                        @if (loading()) {
                          <rp-empty icon="hourglass" title="Loading…" />
                        } @else {
                          <rp-empty
                            icon="filetext"
                            [title]="
                              filtered()
                                ? 'No applications match'
                                : 'No fees for ' + yearLabel() + ' yet'
                            "
                            [text]="
                              filtered()
                                ? 'Try clearing the search or filters.'
                                : 'An application appears here once the family declares it; the admission fee is due from submission.'
                            "
                          />
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else {
              <table class="tbl" id="af-rcpt">
                <thead>
                  <tr>
                    <th>Receipt / reference</th>
                    <th>For</th>
                    <th>Student</th>
                    <th>Mode</th>
                    <th>Transaction ID</th>
                    <th class="r">Amount</th>
                    <th>Paid</th>
                    <th>Accounts</th>
                  </tr>
                </thead>
                <tbody>
                  @for (f of shownReceipts(); track f.applicationId + f.feeType) {
                    <tr
                      tabindex="0"
                      (click)="receiptFor.set(f)"
                      (keydown.enter)="receiptFor.set(f)"
                    >
                      <td>
                        <span class="t-mono">{{ f.receiptNo ?? '—' }}</span>
                      </td>
                      <td>
                        {{ f.feeType === 'APPLICATION' ? 'Application fee' : 'Admission fee' }}
                      </td>
                      <td>
                        <div class="cell-t">{{ f.student ?? '—' }}</div>
                        <div class="cell-s">{{ f.applicationNo }}</div>
                      </td>
                      <td>
                        <span class="tag"
                          ><rp-icon [name]="f.mode === 'CASH' ? 'rupee' : 'globe'" [size]="12" />{{
                            f.mode === 'CASH' ? 'Cash' : 'Online'
                          }}</span
                        >
                      </td>
                      <!-- The payment gateway's own ID for an online payment (client 2026-10-16). -->
                      <td>
                        <span class="t-mono t-sm">{{ f.transactionId ?? '—' }}</span>
                      </td>
                      <td class="r"><rp-amt [value]="f.amount" /></td>
                      <td>
                        @if (f.paidAt) {
                          <div class="cell-t t-num" style="font-weight: 550">
                            {{ date(f.paidAt) }}
                          </div>
                          <div class="cell-s">{{ time(f.paidAt) }}</div>
                        } @else {
                          —
                        }
                      </td>
                      <td>
                        <span [class]="'chip dot tone-' + chip(f).tone">{{ chip(f).l }}</span>
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="8">
                        @if (loading()) {
                          <rp-empty icon="hourglass" title="Loading…" />
                        } @else {
                          <rp-empty icon="receipt" [title]="'No receipts for ' + yearLabel()" />
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </div>
          @if (count() > pageSize) {
            <rp-pager [total]="count()" [page]="page()" [size]="pageSize" (go)="page.set($event)" />
          } @else if (count()) {
            <div class="pager">
              <span>{{ plural(count(), tab() === 'rcpt' ? 'receipt' : 'application') }}</span>
            </div>
          }
        }
      }
    </div>

    @if (collectFor(); as c) {
      <rp-collect-fee
        [fee]="c.fee"
        [also]="c.also ?? null"
        [why]="waysWhy(c.fee, c.row)"
        (closed)="collectFor.set(null)"
        (chosen)="collect(c.fee, $event, c.also ?? null)"
      />
    }
    @if (cashFor(); as t) {
      <rp-cash-collection [target]="t" (closed)="cashClosed()" (recorded)="recorded($event)" />
    }
    @if (receiptFor(); as f) {
      <rp-admission-receipt [fee]="f" (closed)="receiptClosed()" />
    }
    @if (linkFor(); as l) {
      <rp-payment-link
        [link]="l.link"
        fee="Admission fee"
        [sub]="l.sub"
        (closed)="linkFor.set(null)"
      />
    }
  `,
})
export class ConsoleAdmissionFees {
  private readonly api = inject(AdmissionFeesApi);
  private readonly apps = inject(ApplicationsApi);
  private readonly feesApi = inject(FeesApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).console;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly pageSize = PAGE;
  protected readonly plural = plural;
  protected readonly noTask = "Your role doesn't include this task.";
  protected readonly tabs: readonly { v: Tab; l: string }[] = [
    { v: 'fees', l: 'Fees by application' },
    { v: 'rcpt', l: 'Receipts' },
  ];
  protected readonly pills: readonly { v: Pill; l: string }[] = [
    { v: '', l: 'All' },
    { v: 'DUE', l: 'Fees due' },
    { v: 'TO_CONFIRM', l: 'To confirm' },
    { v: 'CONFIRMED', l: 'Confirmed' },
  ];

  readonly tab = signal<Tab>('fees');
  protected readonly years = signal<readonly YearChoice[]>([]);
  protected readonly yearId = signal('');
  protected readonly q = signal('');
  protected readonly pill = signal<Pill>('');
  protected readonly page = signal(1);
  protected readonly data = signal<AdmissionFees | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly counts = signal<Partial<Record<AppStatus, number>> | null>(null);
  protected readonly cashFor = signal<CashTarget<AdmissionCash> | null>(null);
  protected readonly receiptFor = signal<AdmissionFee | null>(null);
  protected readonly linkFor = signal<{ link: SentLink; sub: string } | null>(null);
  /**
   * Collect fees asks how for this fee (client 2026-10-22), with the admission fee `also` when the
   * counsellor's form chose to collect it now (client 2026-10-23).
   */
  protected readonly collectFor = signal<{
    fee: AdmissionFee;
    row: AppFees;
    also?: AdmissionFee | null;
  } | null>(null);
  /**
   * From the counsellor's form (client 2026-10-23): the application whose fee to collect on opening
   * (`?collect=<id>&fee=APPLICATION|ADMISSION&with=ADMISSION`).
   */
  private pending: { appId: string; fee: 'APPLICATION' | 'ADMISSION'; with: boolean } | null = null;
  /** The admission fee to collect once the application fee's cash receipt is closed. */
  private next: AdmissionFee | null = null;
  /** The fee being collected (`<applicationId>:<feeType>`): a link or the gateway's checkout. */
  protected readonly collectBusy = signal<string | null>(null);
  /** Paid fees waiting for Accounts, by year label — every year, not only the one shown. */
  protected readonly waiting = signal<Readonly<Record<string, number>>>({});
  protected readonly confirmBusy = signal<string | null>(null);
  private ready = false;
  private seq = 0;

  protected readonly canView = computed(() => this.can('admfees.view'));
  protected readonly readOnly = computed(() =>
    this.session()?.roles.some((r) => r.readOnly)
      ? 'Management has read-only access. The accounts desk records collections here.'
      : '',
  );
  protected readonly collectWhy = computed(
    () =>
      this.readOnly() ||
      (this.can('admfees.collect') ? '' : 'Only the accounts desk collects fees.'),
  );
  protected readonly verifyWhy = computed(
    () =>
      this.readOnly() ||
      (this.can('admfees.verify') ? '' : 'Only Accounts confirms that a fee was received.'),
  );
  protected readonly year = computed(() => this.years().find((y) => y.id === this.yearId()));
  protected readonly yearIndex = computed(() =>
    Math.max(
      0,
      this.years().findIndex((y) => y.id === this.yearId()),
    ),
  );
  protected readonly yearLabel = computed(() => this.year()?.label ?? 'this year');
  /** Another year with receipts to confirm, so none is missed behind the year switch. */
  protected readonly elsewhere = computed(() => {
    const w = this.waiting();
    const y = this.years().find((x) => x.id !== this.yearId() && (w[x.label] ?? 0) > 0);
    return y ? { id: y.id, label: y.label, current: y.current, n: w[y.label]! } : null;
  });
  protected readonly feeText = computed(() => {
    const y = this.year();
    if (!y) return '';
    const f = y.fees;
    return f
      ? `Application ${inr(f.applicationFee)} · admission ${inr(f.admissionFee)} — paid online with the form, or later at the desk`
      : 'No entry fees set for this year';
  });
  private readonly items = computed(() => this.data()?.items ?? []);
  private readonly adm = computed(() => this.items().filter((f) => f.feeType === 'ADMISSION'));
  private readonly app = computed(() => this.items().filter((f) => f.feeType === 'APPLICATION'));
  private readonly paid = computed(() =>
    this.items()
      .filter((f) => f.status === 'PAID')
      .sort((a, b) => (b.paidAt ?? '').localeCompare(a.paidAt ?? '')),
  );
  /** Each application with both its fees. */
  private readonly grouped = computed(() => byApplication(this.items()));
  protected readonly filtered = computed(() => !!(this.q().trim() || this.pill()));
  protected readonly feeRows = computed(() => {
    const q = this.q().trim().toLowerCase();
    const pill = this.pill();
    return this.grouped().filter(
      (r) =>
        this.inPill(r, pill) &&
        (!q ||
          (r.student ?? '').toLowerCase().includes(q) ||
          r.applicationNo.toLowerCase().includes(q) ||
          (r.admissionNo ?? '').toLowerCase().includes(q)),
    );
  });
  protected readonly count = computed(() =>
    this.tab() === 'rcpt' ? this.paid().length : this.feeRows().length,
  );
  protected readonly shownFees = computed(() =>
    this.feeRows().slice((this.page() - 1) * PAGE, this.page() * PAGE),
  );
  protected readonly shownReceipts = computed(() =>
    this.paid().slice((this.page() - 1) * PAGE, this.page() * PAGE),
  );
  protected readonly summary = computed(() => {
    const rows = this.feeRows();
    const due = rows.reduce((a, r) => a + r.duePaise, 0);
    const toConfirm = rows.reduce((a, r) => a + r.toConfirm, 0);
    return [
      plural(rows.length, 'application'),
      due ? `${inr0(due)} due` : '',
      toConfirm ? `${plural(toConfirm, 'receipt')} to confirm` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  });
  protected readonly figures = computed(() => {
    if (!this.data()) {
      return { app: '—', appSub: '', adm: '—', admSub: '', due: '—', dueSub: '', cash: '—' };
    }
    const sum = (l: readonly AdmissionFee[]) => l.reduce((a, f) => a + paiseOf(f.amount), 0);
    const appPaid = this.app().filter((f) => f.status === 'PAID');
    const admPaid = this.adm().filter((f) => f.status === 'PAID');
    const admDue = this.adm().filter((f) => f.status !== 'PAID');
    const c = this.counts();
    const apps = c ? Object.values(c).reduce((a, b) => a + (b ?? 0), 0) : this.app().length;
    return {
      app: inr0(sum(appPaid)),
      appSub: `${appPaid.length} of ${plural(apps, 'application')} paid`,
      adm: inr0(sum(admPaid)),
      admSub: `${admPaid.length} of ${plural(this.adm().length, 'student')}`,
      due: inr0(sum(admDue)),
      dueSub: plural(admDue.length, 'student'),
      cash: this.paid()
        .filter((f) => f.mode === 'CASH')
        .length.toLocaleString('en-IN'),
    };
  });

  constructor() {
    effect(() => {
      this.yearId();
      if (this.ready) untracked(() => void this.load());
    });
    void this.init();
  }

  private async init() {
    if (!this.can('admfees.view')) return;
    const q = this.route.snapshot.queryParamMap;
    const collect = q.get('collect');
    let appYear: string | null = null;
    if (collect && this.can('admfees.collect')) {
      this.pending = {
        appId: collect,
        fee: q.get('fee') === 'ADMISSION' ? 'ADMISSION' : 'APPLICATION',
        with: q.get('with') === 'ADMISSION',
      };
      try {
        appYear = (await this.apps.detail(collect)).year.id;
      } catch {
        // Its year isn't known: the year shown is searched.
      }
    }
    let years: YearChoice[] = [];
    if (this.can('fees.view')) {
      try {
        years = (await this.feesApi.entryFees()).items.map((e) => ({
          id: e.year.id,
          label: e.year.label,
          current: e.year.current,
          status: e.year.status,
          fees: e.fees,
        }));
      } catch {
        // The fees of every year are listed together.
      }
    } else if (this.can('academics.view')) {
      try {
        years = (await this.feesApi.academicYears()).items.map((y) => {
          const x = y as typeof y & { status?: string; current?: boolean };
          return {
            id: y.id,
            label: y.label,
            current: !!x.current,
            status: x.status ?? 'OPEN',
            fees: null,
          };
        });
      } catch {
        // As above.
      }
    }
    // Oldest first, as the prototype's year switch; the next intake is chosen while the current
    // year runs (prototype: the year "Admissions open" when there is one).
    years = years
      .filter((y) => y.status !== 'CLOSED')
      .sort((a, b) => a.label.localeCompare(b.label));
    this.years.set(years);
    const pick =
      years.find((y) => y.id === appYear) ??
      years.find((y) => !y.current && y.label > (years.find((x) => x.current)?.label ?? '')) ??
      years.find((y) => y.current) ??
      years.at(-1);
    this.ready = true;
    if (pick) this.yearId.set(pick.id);
    else void this.load();
  }

  protected async load() {
    const n = ++this.seq;
    this.loading.set(true);
    const yearId = this.yearId();
    void this.loadWaiting();
    try {
      const d = await this.api.fees(yearId ? { yearId } : {});
      if (n !== this.seq) return;
      this.data.set(d);
      this.error.set('');
      this.page.set(1);
      this.openPending();
    } catch (e) {
      if (n === this.seq) {
        this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
      }
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
    if (this.can('admissions.view')) {
      try {
        const r = await this.apps.list(yearId ? { yearId } : {});
        if (n === this.seq) this.counts.set(r.counts);
      } catch {
        if (n === this.seq) this.counts.set(null);
      }
    }
  }

  /** The paid fees of every year still to confirm (ADM-021, status PAID), counted by year. */
  private async loadWaiting() {
    try {
      const d = await this.api.fees({ status: 'PAID' });
      const out: Record<string, number> = {};
      for (const f of d.items) if (!f.confirmedAt) out[f.year] = (out[f.year] ?? 0) + 1;
      this.waiting.set(out);
    } catch {
      this.waiting.set({});
    }
  }

  /** "Fees due": a fee to collect; "To confirm": a paid fee Accounts has not confirmed yet. */
  private inPill(r: AppFees, pill: Pill) {
    if (pill === 'DUE') return r.state === 'DUE';
    if (pill === 'TO_CONFIRM') return r.state !== 'REJECTED' && r.toConfirm > 0;
    if (pill === 'CONFIRMED') return r.state === 'CONFIRMED';
    return true;
  }

  /** Record cash for the fee (ADM-022): the dialog shared with Collect fee (client 2026-10-22). */
  protected target(f: AdmissionFee): CashTarget<AdmissionCash> {
    const student = f.student ?? f.applicationNo;
    return {
      fee: f.feeType === 'APPLICATION' ? 'Application fee' : 'Admission fee',
      sub: [student, f.applicationNo, f.admissionNo ? `admission number ${f.admissionNo}` : '']
        .filter(Boolean)
        .join(' · '),
      student,
      amount: f.amount,
      payer: '',
      record: async (entry, key) => {
        const r = await this.api.cash(f.applicationId, { feeType: f.feeType, ...entry }, key);
        return { receiptNo: r.receipt.receiptNo, paymentId: r.receipt.paymentId };
      },
    };
  }

  /**
   * What Collect fees can't do for a fee now: the admission fee isn't paid online on its own while
   * the application fee is due (client 2026-10-12), and a payment link is for the admission fee —
   * the application fee is paid with the form.
   */
  protected waysWhy(f: AdmissionFee, r: AppFees): Partial<Record<CollectWay, string>> {
    if (f.feeType === 'APPLICATION') {
      return {
        LINK: 'The family pays the application fee with the form — a payment link is for the admission fee',
      };
    }
    const why = this.onlineWhy(r);
    return why ? { PAY_NOW: why, LINK: why } : {};
  }

  /**
   * The counsellor's form handed over (client 2026-10-23): Collect fees opens on the application's
   * fee — with the admission fee when chosen "Pay now" — once the list is in.
   */
  private openPending() {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    const row = this.grouped().find((r) => r.applicationId === p.appId);
    const fee = p.fee === 'APPLICATION' ? row?.application : row?.admission;
    if (!row || !fee || fee.status === 'PAID') {
      this.overlays.toast('Nothing to collect for this application', {
        tone: 'info',
        sub: row?.applicationNo,
      });
      return;
    }
    const also =
      p.with && p.fee === 'APPLICATION' && row.admission?.status !== 'PAID' ? row.admission : null;
    this.collectFor.set({ fee, row, also });
  }

  /** The way chosen in Collect fees (client 2026-10-22). */
  protected collect(f: AdmissionFee, way: CollectWay, also: AdmissionFee | null = null) {
    this.collectFor.set(null);
    if (way === 'CASH') {
      // The admission fee chosen with it is recorded next (client 2026-10-23).
      this.next = also;
      this.cashFor.set(this.target(f));
    } else if (way === 'LINK') void this.online(f);
    else void this.payNow(f, also);
  }

  protected cashClosed() {
    this.cashFor.set(null);
    this.next = null;
  }

  /** The receipt closed: the admission fee chosen with the application fee is collected next. */
  protected receiptClosed() {
    this.receiptFor.set(null);
    const n = this.next;
    this.next = null;
    if (!n) return;
    const row = this.grouped().find((r) => r.applicationId === n.applicationId);
    if (row?.admission && row.admission.status !== 'PAID') {
      this.collectFor.set({ fee: row.admission, row });
    }
  }

  /**
   * Send link (ADM-023, prototype cm.adm.online): the link is made and sent to the student and
   * parents by SMS, e-mail and in the app; the sheet shows it and where it went.
   */
  protected async online(f: AdmissionFee) {
    if (f.applicationStatus === 'REJECTED') {
      this.overlays.toast(translate('ADM.REJECTED_NO_PAYMENT'), { tone: 'bad' });
      return;
    }
    this.collectBusy.set(`${f.applicationId}:${f.feeType}`);
    try {
      const l = await this.api.paymentLink(f.applicationId, newIdempotencyKey());
      this.linkFor.set({
        link: {
          url: l.paymentLink,
          amount: l.amount,
          expiresAt: l.expiresAt,
          sms: l.sent?.sms ?? [],
          email: l.sent?.email ?? [],
          inApp: l.sent?.inApp ?? 0,
        },
        sub: `${f.student ?? ''} · ${f.applicationNo}`,
      });
    } catch (e) {
      this.overlays.toast("Couldn't send the payment link", {
        tone: 'bad',
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
      });
    } finally {
      this.collectBusy.set(null);
    }
  }

  /**
   * Pay now (ADM-037/038): the gateway's checkout at the desk, no link; once verified the list
   * reloads and the receipt opens, as for cash.
   */
  protected async payNow(f: AdmissionFee, also: AdmissionFee | null = null) {
    const fee = also
      ? 'Application and admission fees'
      : f.feeType === 'APPLICATION'
        ? 'Application fee'
        : 'Admission fee';
    this.collectBusy.set(`${f.applicationId}:${f.feeType}`);
    try {
      const o = await this.api.order(f.applicationId, f.feeType, newIdempotencyKey(), !!also);
      const answer = await deskCheckout(
        this.overlays,
        o,
        `${fee} · ${f.student ?? f.applicationNo}`,
      );
      if (!answer) {
        this.overlays.toast('Payment not completed', {
          tone: 'info',
          sub: 'The payment window was closed before paying.',
        });
        return;
      }
      const paid = await this.api.verify(f.applicationId, o.paymentId, answer, newIdempotencyKey());
      this.overlays.toast('Paid online', {
        sub: `${fee} ${inr(o.amount)} · receipt ${paid.receiptNo ?? '—'}`,
      });
      await this.load();
      const row = this.items().find(
        (x) => x.applicationId === f.applicationId && x.feeType === f.feeType,
      );
      if (row?.status === 'PAID') this.receiptFor.set(row);
    } catch (e) {
      this.overlays.toast("Couldn't take the payment", {
        tone: 'bad',
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
      });
    } finally {
      this.collectBusy.set(null);
    }
  }

  /**
   * ADM-031: Accounts confirms the money was received (client 2026-10-09). Both fees confirmed let
   * the Co-ordinator assign the admission number and section.
   */
  protected async confirm(f: AdmissionFee) {
    if (!f.paymentId || this.confirmBusy()) return;
    const fee = f.feeType === 'APPLICATION' ? 'application fee' : 'admission fee';
    const ok = await this.overlays.confirm({
      title: `Confirm receipt of ${inr(f.amount)}?`,
      text: `The ${fee} of ${f.student ?? f.applicationNo} — ${f.mode === 'CASH' ? 'cash' : 'online'}, receipt ${f.receiptNo ?? '—'}. Confirm once the money is in the school's account; it can't be undone.`,
      ok: 'Confirm receipt',
    });
    if (!ok) return;
    this.confirmBusy.set(f.paymentId);
    try {
      await this.api.confirm(f.paymentId, newIdempotencyKey());
      this.overlays.toast('Receipt confirmed', {
        sub: `${f.student ?? f.applicationNo} · ${fee} ${inr(f.amount)}`,
      });
      await this.load();
    } catch (e) {
      this.overlays.toast("Couldn't confirm the receipt", {
        tone: 'bad',
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
      });
    } finally {
      this.confirmBusy.set(null);
    }
  }

  protected chip(f: AdmissionFee) {
    return feeChip(f);
  }
  /**
   * A payment link for the admission fee alone isn't sent while the application fee is due (client
   * 2026-10-12): the family pays both together, or both at the desk.
   */
  protected onlineWhy(r: AppFees) {
    return r.application && r.application.status !== 'PAID'
      ? 'The application fee is due first — the admission fee can’t be paid online on its own'
      : '';
  }
  protected state(r: AppFees) {
    return STATE[r.state];
  }
  /** The row's status in words: what is due, what waits for Accounts, or what comes next. */
  protected stateText(r: AppFees) {
    switch (r.state) {
      case 'REJECTED':
        return 'Fees are not collected';
      case 'CONFIRMED':
        return r.admissionNo
          ? 'Both fees confirmed · admission no. assigned'
          : 'Both fees confirmed · ready for the admission number';
      case 'TO_CONFIRM':
        return `Paid — ${plural(r.toConfirm, 'receipt')} for Accounts to confirm`;
      default:
        return [
          `${inr0(r.duePaise)} to collect`,
          r.toConfirm ? `${plural(r.toConfirm, 'receipt')} to confirm` : '',
        ]
          .filter(Boolean)
          .join(' · ');
    }
  }

  /** Cash recorded: the list reloads and the receipt opens (prototype). */
  protected async recorded(r: AdmissionCash) {
    this.cashFor.set(null);
    await this.load();
    const f = this.items().find((x) => x.paymentId === r.paymentId);
    if (f) this.receiptFor.set(f);
    else this.receiptClosed();
  }

  /** The applications as listed, each with both fees (CSV). */
  protected exportFees() {
    const cells = (f: AdmissionFee | null) =>
      f
        ? [
            f.amount.amount,
            feeChip(f).l,
            f.mode === 'CASH' ? 'Cash' : f.mode === 'ONLINE' ? 'Online' : '',
            f.receiptNo ?? '',
            f.transactionId ?? '',
            f.paidAt ? `${formatDate(f.paidAt)} ${formatTime(f.paidAt)}` : '',
            f.confirmedAt ? `${formatDate(f.confirmedAt)} ${formatTime(f.confirmedAt)}` : '',
          ]
        : ['', '', '', '', '', '', ''];
    const head = (t: string) => [
      `${t} fee`,
      `${t} fee status`,
      `${t} fee mode`,
      `${t} fee receipt`,
      `${t} fee transaction ID`,
      `${t} fee paid`,
      `${t} fee confirmed`,
    ];
    saveCsv(`admission-fees-${this.yearLabel()}.csv`, [
      [
        'Application',
        'Student',
        'Class',
        'Admission no.',
        'Application status',
        ...head('Application'),
        ...head('Admission'),
        'Status',
      ],
      ...this.feeRows().map((r) => [
        r.applicationNo,
        r.student ?? '',
        r.class ?? '',
        r.admissionNo ?? '',
        APP_STATUS[r.applicationStatus].l(),
        ...cells(r.application),
        ...cells(r.admission),
        STATE[r.state].l,
      ]),
    ]);
  }

  protected tabCount(t: Tab) {
    const n = t === 'fees' ? this.grouped().length : this.paid().length;
    return n.toLocaleString('en-IN');
  }
  protected pillCount(p: Pill) {
    return this.grouped()
      .filter((r) => this.inPill(r, p))
      .length.toLocaleString('en-IN');
  }
  protected appSt(s: AppStatus) {
    return APP_STATUS[s];
  }
  protected date(v: string) {
    return formatDate(v);
  }
  protected time(v: string) {
    return formatTime(v);
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected can(sub: string) {
    return this.session()?.subTasks.includes(sub) ?? false;
  }
}
