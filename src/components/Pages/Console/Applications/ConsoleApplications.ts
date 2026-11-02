import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
import { Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { Pager } from '../../../Shared/Pager';
import { formatDate, formatMobile, istBusinessDate } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { AdmissionLinksApi } from '../AdmissionQr/admission-links.api';
import { inr0, paiseOf, plural } from '../Fees/fee-format';
import { FeesApi } from '../Fees/fees.api';
import {
  InstitutionSetupApi,
  type CustomField,
  type UserType,
} from '../Institution/institution.api';
import { MembersApi, type ClassView } from '../Members/members.api';
import { ApplicationDrawer } from './ApplicationDrawer';
import { StudentImport } from './StudentImport';
import { APP_STATUS, APP_TABS, FEE_STATUS, SOURCE, person, shortDay } from './app-format';
import {
  ApplicationsApi,
  type Application,
  type ApplicationList,
  type ApplicationRow,
  type AppStatus,
} from './applications.api';

/** An academic year as the admission screens use it (dates when academics can be read). */
export interface YearOption {
  readonly id: string;
  readonly label: string;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly status: string;
  readonly current: boolean;
}

type SortKey = 'no' | 'name' | 'cls' | 'year' | 'submitted' | 'fee' | 'status';
const PAGE = 10;
const COLUMNS: readonly { k: SortKey; l: string; r?: boolean }[] = [
  { k: 'no', l: 'Application no.' },
  { k: 'name', l: 'Applicant' },
  { k: 'cls', l: 'Class applied' },
  { k: 'year', l: 'Year' },
  { k: 'submitted', l: 'Submitted' },
  { k: 'fee', l: 'Application fee', r: true },
  { k: 'status', l: 'Status' },
];

/** A year has begun (today on or after its start): its applications are mid-term (CR-14). */
export function yearStarted(y: YearOption, today: string): boolean {
  return y.startsOn ? y.startsOn <= today : y.current;
}

/**
 * c.applications — Applications (SRS 19.4, FR-ADM-07/09, CR-14, CR-09; ADM-013…020, ADM-026…030;
 * prototype c.applications): the key figures, the status tabs with their counts, the filters
 * (search, year, class, mid-term only), the table, the application drawer (ApplicationDrawer:
 * references, documents, the transfer certificate, submission, approval and rejection), the
 * counsellor's form (ApplicationWizard: the public form's steps on a page of its own, client
 * 2026-10-15) and the existing-students upload (StudentImport).
 */
@Component({
  selector: 'rp-console-applications',
  imports: [
    Amount,
    ApplicationDrawer,
    Avatar,
    Dropdown,
    Empty,
    Icon,
    Kpi,
    PageHead,
    Pager,
    StudentImport,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Applications"
        sub="Review, approve and enrol — public form and counsellor applications"
      >
        @if (canView()) {
          <span class="cp-why" [attr.title]="editWhy() || null"
            ><button
              type="button"
              class="btn btn-sec"
              id="ap-upload"
              [disabled]="!!editWhy()"
              (click)="importing.set(true)"
            >
              <rp-icon name="upload" [size]="17" /><span>Upload existing students</span>
            </button></span
          >
          <span class="cp-why" [attr.title]="publicWhy() || null"
            ><button
              type="button"
              class="btn btn-sec"
              id="ap-public"
              [disabled]="!!publicWhy()"
              (click)="openPublic()"
            >
              <rp-icon name="external" [size]="17" /><span>Public form</span>
            </button></span
          >
          <span class="cp-why" [attr.title]="editWhy() || null"
            ><button
              type="button"
              class="btn btn-pri"
              id="ap-new"
              [disabled]="!!editWhy()"
              (click)="newApplication()"
            >
              <rp-icon name="plus" [size]="17" /><span>New application</span>
            </button></span
          >
        }
      </rp-page-head>

      @if (!canView()) {
        <rp-empty
          icon="lock"
          title="This page isn't part of your role"
          text="Applications are handled by the admission counsellor. Pages your role can open are listed in the menu."
        />
      } @else {
        @if (readOnly()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow"><b>Read-only.</b> {{ readOnly() }}</div>
          </div>
        }
        <div class="c-grid k4 cc-kp">
          <rp-kpi
            label="Awaiting review"
            icon="inbox"
            tone="info"
            [value]="kpi().awaiting"
            delta="Submitted, fee paid"
          />
          <rp-kpi
            [label]="'Mid-term joiners ' + currentLabel()"
            icon="calendar"
            tone="accent"
            [value]="kpi().mid"
            [delta]="kpi().midSub"
          />
          <rp-kpi
            label="Approved"
            icon="usercheck"
            tone="ok"
            [value]="kpi().approved"
            delta="Enrolled with wallets"
          />
          <rp-kpi
            label="Application fees received"
            icon="rupee"
            [value]="kpi().fees"
            [delta]="kpi().feesSub"
          />
        </div>

        <div class="tabs" role="tablist" aria-label="Application status">
          @for (t of tabs; track t.v) {
            <button
              type="button"
              class="tab"
              role="tab"
              [id]="'ap-tab-' + t.v"
              [class.on]="tab() === t.v"
              [attr.aria-selected]="tab() === t.v"
              (click)="tab.set(t.v)"
            >
              {{ t.l }}<span class="n">{{ count(t.v) }}</span>
            </button>
          }
        </div>

        <div class="c-filters">
          <label class="search"
            ><rp-icon name="search" [size]="16" /><input
              type="search"
              id="ap-q"
              placeholder="Name, application no. or mobile"
              aria-label="Search applications"
              autocomplete="off"
              [value]="q()"
              (input)="search(val($event))"
          /></label>
          <div class="pills" role="group" aria-label="Academic year">
            <button
              type="button"
              class="pill"
              [class.on]="!yearId()"
              [attr.aria-pressed]="!yearId()"
              (click)="yearId.set('')"
            >
              All years
            </button>
            @for (y of yearPills(); track y.id) {
              <button
                type="button"
                class="pill"
                [class.on]="yearId() === y.id"
                [attr.aria-pressed]="yearId() === y.id"
                (click)="yearId.set(y.id)"
              >
                {{ y.l }}
              </button>
            }
          </div>
          <div class="fld">
            <rp-dd
              inputId="ap-cls"
              placeholder="All classes"
              [options]="classOptions()"
              [value]="classId()"
              (changed)="classId.set($event)"
            />
          </div>
          <label class="chk"
            ><input
              type="checkbox"
              id="ap-mt"
              [checked]="midTerm()"
              (change)="midTerm.set(checked($event))"
            /><span>Mid-term only</span></label
          >
          <span class="fsum">{{ summary() }}</span>
        </div>

        @if (error()) {
          <div class="card pad">
            <rp-empty icon="alertc" title="Couldn't load the applications" [text]="error()">
              <button type="button" class="btn btn-sec btn-sm" (click)="load()">
                <span>Try again</span>
              </button>
            </rp-empty>
          </div>
        } @else {
          <div class="tbl-wrap">
            <table class="tbl" id="ap-table">
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
                @if (loading() && !rows().length) {
                  <tr>
                    <td [attr.colspan]="columns.length">
                      <rp-empty icon="hourglass" title="Loading…" />
                    </td>
                  </tr>
                }
                @for (a of shown(); track a.id) {
                  <tr tabindex="0" (click)="opened.set(a.id)" (keydown.enter)="opened.set(a.id)">
                    <td>
                      <span class="t-mono t-sm">{{ a.applicationNo }}</span>
                      <div class="cell-s">{{ source(a) }}</div>
                    </td>
                    <td>
                      <div class="cell-main">
                        <rp-av [name]="a.name ?? '?'" size="sm" />
                        <div style="min-width: 0">
                          <div class="cell-t t-clip">{{ a.name ?? 'Name not entered yet' }}</div>
                          <div class="cell-s">{{ contact(a) }}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <b class="t-sb">{{ a.class?.name ?? '—' }}</b>
                      <div class="cell-s">
                        @if (a.status === 'APPROVED') {
                          {{ a.section ? 'Section ' + a.section : 'Enrolled'
                          }}{{ a.admissionNo ? ' · ' + a.admissionNo : '' }}
                        } @else {
                          Section set on approval
                        }
                      </div>
                    </td>
                    <td>
                      <span class="tag" title="Academic year (CR-13)"
                        ><rp-icon name="calendar" [size]="12" />{{ a.year.label }}</span
                      >
                      @if (a.midTerm) {
                        <div class="row g6" style="margin-top: 4px">
                          <span class="chip dot tone-accent">Mid-term</span>
                          @if (a.joiningDate) {
                            <span class="cell-s">joins {{ short(a.joiningDate) }}</span>
                          }
                        </div>
                      }
                    </td>
                    <td>
                      @if (a.submittedAt) {
                        {{ date(a.submittedAt) }}
                      } @else {
                        <span class="t-faint">Not yet</span>
                      }
                    </td>
                    <td class="r">
                      @if (a.applicationFee; as f) {
                        <rp-amt [value]="f.amount" />
                        <div class="cell-s">{{ feeLabel(f.status) }}</div>
                      } @else {
                        <span class="t-faint">—</span>
                        <div class="cell-s">Not due yet</div>
                      }
                    </td>
                    <td>
                      <span [class]="'chip dot tone-' + st(a.status).tone">{{
                        st(a.status).l()
                      }}</span>
                    </td>
                  </tr>
                } @empty {
                  @if (!loading()) {
                    <tr>
                      <td [attr.colspan]="columns.length">
                        <rp-empty icon="filetext" [title]="emptyTitle()" [text]="emptyText()" />
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
          @if (sorted().length > pageSize) {
            <rp-pager
              [total]="sorted().length"
              [page]="page()"
              [size]="pageSize"
              (go)="page.set($event)"
            />
          } @else if (sorted().length) {
            <div class="pager">
              <span>{{ plural(sorted().length, 'application') }}</span>
            </div>
          }
          @if (cursor()) {
            <div class="row" style="justify-content: center">
              <button
                type="button"
                class="btn btn-sec btn-sm"
                id="ap-more"
                [class.is-busy]="more()"
                [disabled]="more()"
                (click)="loadMore()"
              >
                <span>Load more applications</span>
              </button>
            </div>
          }
        }
      }
    </div>

    @if (opened(); as id) {
      <rp-application-drawer
        [applicationId]="id"
        [years]="years()"
        [classes]="classes()"
        [userTypes]="userTypes()"
        [fields]="fields()"
        [editWhy]="editWhy()"
        [approveWhy]="approveWhy()"
        [collectWhy]="collectWhy()"
        [canSeeFees]="can('fees.view')"
        (closed)="opened.set(null)"
        (changed)="changed($event)"
      />
    }
    @if (importing()) {
      <rp-student-import
        [yearLabel]="currentLabel()"
        (closed)="importing.set(false)"
        (imported)="imported($event)"
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
export class ConsoleApplications {
  private readonly api = inject(ApplicationsApi);
  private readonly feesApi = inject(FeesApi);
  private readonly members = inject(MembersApi);
  private readonly setup = inject(InstitutionSetupApi);
  private readonly linksApi = inject(AdmissionLinksApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).console;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly columns = COLUMNS;
  protected readonly pageSize = PAGE;
  protected readonly tabs = APP_TABS;
  protected readonly plural = plural;
  protected readonly noTask = "Your role doesn't include this task.";
  protected readonly today = istBusinessDate(new Date());

  readonly tab = signal<AppStatus>('SUBMITTED');
  protected readonly q = signal('');
  protected readonly yearId = signal('');
  protected readonly classId = signal('');
  protected readonly midTerm = signal(false);
  protected readonly list = signal<ApplicationList | null>(null);
  protected readonly rows = signal<readonly ApplicationRow[]>([]);
  protected readonly cursor = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly more = signal(false);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly sort = signal<{ k: SortKey; dir: 'asc' | 'desc' } | null>(null);
  protected readonly years = signal<readonly YearOption[]>([]);
  protected readonly classes = signal<readonly ClassView[]>([]);
  protected readonly userTypes = signal<readonly UserType[]>([]);
  protected readonly fields = signal<readonly CustomField[]>([]);
  protected readonly publicUrl = signal<string | null>(null);
  protected readonly opened = signal<string | null>(null);
  protected readonly importing = signal(false);
  /** Years and classes seen in the list (the filters when the lookups can't be read). */
  private readonly seen = signal<{
    years: Map<string, string>;
    classes: Map<string, string>;
  }>({ years: new Map(), classes: new Map() });
  private ready = false;
  private seq = 0;
  private qTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly canView = computed(() => this.can('admissions.view'));
  protected readonly readOnly = computed(() =>
    this.session()?.roles.some((r) => r.readOnly)
      ? 'Management has read-only access. The counsellor and the administrator make changes here.'
      : '',
  );
  protected readonly editWhy = computed(
    () => this.readOnly() || (this.can('admissions.edit') ? '' : this.noTask),
  );
  protected readonly approveWhy = computed(
    () => this.readOnly() || (this.can('admissions.approve') ? '' : this.noTask),
  );
  protected readonly collectWhy = computed(
    () => this.readOnly() || (this.can('admfees.collect') ? '' : this.noTask),
  );
  protected readonly publicWhy = computed(() =>
    this.publicUrl()
      ? ''
      : this.can('admqr.view')
        ? 'No admission link yet — generate one on Admission link & QR.'
        : 'The admission link is shared from Admission link & QR.',
  );

  /** Years open for admission (not closed, not over), newest first. */
  protected readonly openYears = computed(() =>
    this.years().filter((y) => y.status !== 'CLOSED' && (!y.endsOn || y.endsOn >= this.today)),
  );
  protected readonly currentLabel = computed(
    () => this.years().find((y) => y.current)?.label ?? 'this year',
  );
  protected readonly yearPills = computed(() => {
    const known = this.openYears();
    const list = known.length
      ? known.map((y) => ({
          id: y.id,
          l: `${y.label} · ${yearStarted(y, this.today) ? 'mid-term' : 'regular'}`,
        }))
      : [...this.seen().years].map(([id, l]) => ({ id, l }));
    return list;
  });
  protected readonly classOptions = computed<DropdownOption[]>(() => {
    const cls = this.classes().length
      ? this.classes().map((c) => ({ v: c.id, l: c.name }))
      : [...this.seen().classes].map(([v, l]) => ({ v, l }));
    return [{ v: '', l: 'All classes' }, ...cls];
  });
  protected readonly kpi = computed(() => {
    const k = this.list()?.kpis;
    if (!k) {
      return { awaiting: '—', mid: '—', midSub: '', approved: '—', fees: '—', feesSub: '' };
    }
    return {
      awaiting: this.num(k.awaitingReview),
      mid: this.num(k.midTermThisYear),
      midSub: `${this.num(k.midTermToDecide)} to decide · CR-14`,
      approved: this.num(k.approved),
      fees: inr0(paiseOf(k.applicationFeesReceived)),
      feesSub: `${this.num(k.applicationFeesPaid)} paid`,
    };
  });
  protected readonly sorted = computed(() => {
    const s = this.sort();
    const list = this.rows();
    if (!s) return list;
    const val = (a: ApplicationRow): string | number =>
      s.k === 'no'
        ? a.applicationNo
        : s.k === 'name'
          ? (a.name ?? '')
          : s.k === 'cls'
            ? (this.classes().find((c) => c.id === a.class?.id)?.order ?? a.class?.name ?? '')
            : s.k === 'year'
              ? `${a.year.label}${a.joiningDate ?? ''}`
              : s.k === 'submitted'
                ? (a.submittedAt ?? '')
                : s.k === 'fee'
                  ? a.applicationFee
                    ? paiseOf(a.applicationFee.amount)
                    : 0
                  : APP_STATUS[a.status].l();
    return [...list].sort((x, y) => {
      const vx = val(x);
      const vy = val(y);
      const c =
        typeof vx === 'number' && typeof vy === 'number'
          ? vx - vy
          : String(vx).localeCompare(String(vy), 'en', { numeric: true });
      return s.dir === 'desc' ? -c : c;
    });
  });
  protected readonly shown = computed(() =>
    this.sorted().slice((this.page() - 1) * PAGE, this.page() * PAGE),
  );
  protected readonly summary = computed(() =>
    plural(this.list()?.counts[this.tab()] ?? this.rows().length, 'application'),
  );
  protected readonly filtered = computed(
    () => !!(this.q().trim() || this.classId() || this.midTerm() || this.yearId()),
  );
  protected readonly emptyTitle = computed(
    () =>
      `No ${this.tab() === 'DRAFT' ? 'drafts' : APP_STATUS[this.tab()].l().toLowerCase() + ' applications'} match`,
  );
  protected readonly emptyText = computed(() =>
    this.filtered()
      ? 'Try clearing the search or filters.'
      : 'New applications from the public form and the counsellor appear here.',
  );

  constructor() {
    effect(() => {
      // The tab and the filters are applied on the server; the search waits for typing to pause.
      this.tab();
      this.yearId();
      this.classId();
      this.midTerm();
      if (this.ready) untracked(() => void this.load());
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.qTimer));
    this.init();
  }

  private init() {
    if (!this.can('admissions.view')) return;
    // Back from the form: the application it saved or submitted opens on its tab.
    const open = this.route.snapshot.queryParamMap.get('open');
    if (open) this.opened.set(open);
    void this.lookups();
    // The effect loads the list (the tab and filters) once ready.
    this.ready = true;
  }

  /**
   * The years, classes, user types, the institution's fields and the current link. The admissions
   * sub-tasks read the years, classes, user types and fields too (the server allows them): a
   * counsellor needs the student types and the class's sections to approve.
   */
  private async lookups() {
    const jobs: Promise<unknown>[] = [];
    const admissions = this.can('admissions.view');
    if (this.can('academics.view') || admissions) {
      jobs.push(
        this.feesApi
          .academicYears()
          .then((r) =>
            this.years.set(
              (r.items as readonly (YearOption & { status?: string; current?: boolean })[]).map(
                (y) => ({
                  id: y.id,
                  label: y.label,
                  startsOn: y.startsOn ?? null,
                  endsOn: y.endsOn ?? null,
                  status: y.status ?? 'OPEN',
                  current: !!y.current,
                }),
              ),
            ),
          )
          .catch(() => undefined),
        this.members
          .classes()
          .then((r) => this.classes.set(r.items))
          .catch(() => undefined),
      );
    } else if (this.can('fees.view')) {
      jobs.push(
        this.feesApi
          .entryFees()
          .then((r) =>
            this.years.set(
              r.items.map((e) => ({
                id: e.year.id,
                label: e.year.label,
                startsOn: null,
                endsOn: null,
                status: e.year.status,
                current: e.year.current,
              })),
            ),
          )
          .catch(() => undefined),
      );
    }
    if (this.can('config.view') || admissions) {
      jobs.push(
        this.setup
          .userTypes()
          .then((r) => this.userTypes.set(r.items))
          .catch(() => undefined),
        this.setup
          .fields()
          .then((r) =>
            this.fields.set(
              r.items.filter((f) => f.entity === 'ADMISSION_APPLICATION' && f.status === 'ACTIVE'),
            ),
          )
          .catch(() => undefined),
      );
    }
    if (this.can('admqr.view')) {
      jobs.push(
        this.linksApi
          .links()
          .then((r) => this.publicUrl.set(r.current?.url ?? null))
          .catch(() => undefined),
      );
    }
    await Promise.all(jobs);
  }

  private query() {
    return {
      status: this.tab(),
      ...(this.yearId() ? { yearId: this.yearId() } : {}),
      ...(this.classId() ? { classId: this.classId() } : {}),
      ...(this.midTerm() ? { midTerm: true } : {}),
      ...(this.q().trim() ? { q: this.q().trim() } : {}),
    };
  }

  protected async load() {
    const n = ++this.seq;
    this.loading.set(true);
    try {
      const d = await this.api.list(this.query());
      if (n !== this.seq) return;
      this.list.set(d);
      this.rows.set(d.items);
      this.cursor.set(d.nextCursor);
      this.remember(d.items);
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
      const d = await this.api.list({ ...this.query(), cursor });
      if (n !== this.seq) return;
      this.rows.update((l) => [...l, ...d.items]);
      this.cursor.set(d.nextCursor);
      this.remember(d.items);
    } catch (e) {
      this.overlays.toast(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'), {
        tone: 'bad',
      });
    } finally {
      this.more.set(false);
    }
  }

  private remember(items: readonly ApplicationRow[]) {
    const s = this.seen();
    const years = new Map(s.years);
    const classes = new Map(s.classes);
    for (const a of items) {
      years.set(a.year.id, a.year.label);
      if (a.class) classes.set(a.class.id, a.class.name);
    }
    this.seen.set({ years, classes });
  }

  protected search(v: string) {
    this.q.set(v);
    clearTimeout(this.qTimer);
    this.qTimer = setTimeout(() => void this.load(), 300);
  }

  protected openPublic() {
    const url = this.publicUrl();
    if (url) window.open(url, '_blank', 'noopener');
  }

  /** The drawer changed the application: the list and its figures reload; a decision moves tab. */
  protected changed(a: Application) {
    if (a.status !== this.tab() && (a.status === 'APPROVED' || a.status === 'REJECTED')) {
      this.tab.set(a.status);
    } else {
      void this.load();
    }
  }

  /**
   * The counsellor's application: the public form's steps, fields and checks on a page of its own
   * (client 2026-10-15); it comes back here with the application open.
   */
  protected newApplication() {
    if (this.editWhy()) return;
    void this.router.navigate(['/console/applications/new']);
  }

  protected imported(e: { imported: number }) {
    if (e.imported) {
      if (this.tab() !== 'APPROVED') this.tab.set('APPROVED');
      else void this.load();
    }
  }

  // --- formatting ----------------------------------------------------------------------------------
  protected count(s: AppStatus): string {
    const l = this.list();
    return l ? this.num(l.counts[s] ?? 0) : '';
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
  protected st(s: AppStatus) {
    return APP_STATUS[s];
  }
  protected feeLabel(s: keyof typeof FEE_STATUS) {
    return FEE_STATUS[s].l();
  }
  protected source(a: ApplicationRow) {
    return SOURCE[a.source];
  }
  protected contact(a: ApplicationRow) {
    const c = a.primaryContact;
    return [person(c.name), c.mobile ? formatMobile(c.mobile) : ''].filter(Boolean).join(' · ');
  }
  protected date(v: string) {
    return formatDate(v);
  }
  protected short(d: string) {
    return shortDay(d);
  }
  protected num(n: number) {
    return n.toLocaleString('en-IN');
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected checked(e: Event) {
    return (e.target as HTMLInputElement).checked;
  }
  protected can(sub: string) {
    return this.session()?.subTasks.includes(sub) ?? false;
  }
}
