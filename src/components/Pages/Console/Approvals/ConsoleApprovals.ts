import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { SessionContext } from '../../../../Context/SessionContext';
import { Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { ago as relativeTime } from '../../../Utils/dates';
import { formatDateTime } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import {
  ApprovalsApi,
  type ApprovalDetail,
  type ApprovalList,
  type ApprovalRow,
  type ApprovalStatus,
  type ApprovalSurface,
} from './approvals.api';

type SortKey = 'no' | 'area' | 'action' | 'maker' | 'decided';
interface Col {
  readonly k: string;
  readonly l: string;
  readonly sort: boolean;
}

const TABS: readonly { v: ApprovalStatus; l: string }[] = [
  { v: 'PENDING', l: 'Pending' },
  { v: 'APPROVED', l: 'Approved' },
  { v: 'REJECTED', l: 'Rejected' },
];
const STATUS: Record<ApprovalStatus, { l: string; tone: string }> = {
  PENDING: { l: 'Pending', tone: 'warn' },
  APPROVED: { l: 'Approved', tone: 'ok' },
  REJECTED: { l: 'Rejected', tone: 'bad' },
};
const MAKER: Record<string, string> = { staff: 'Staff', member: 'Member', operator: 'Operator' };
const NO_COUNTS: ApprovalList['counts'] = {
  tabs: { PENDING: 0, APPROVED: 0, REJECTED: 0 },
  canDecide: 0,
  mine: 0,
  decided30: 0,
};
/** The prototype's table page size (ui.table). */
const PAGE = 12;

/**
 * c.approvals — Approvals (SRS 17; FR-MKC-01, FR-MKC-03; MKR-001…006; ADR-0015; prototype
 * c.approvals): the maker-checker queue with its key figures, Pending / Approved / Rejected tabs,
 * filters, and the request drawer with the before → after rows, the evidence and the decision with
 * mandatory remarks. Nobody decides their own request; only the Institution Administrator decides.
 * The back office uses the same page for the platform's own requests (route data `surface: 'ops'`;
 * corrections from members without an institution, decided by the Platform Administrator).
 */
@Component({
  selector: 'rp-console-approvals',
  imports: [Dropdown, Empty, Icon, Kpi, Modal, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Approvals"
        sub="Maker-checker queue: sensitive changes wait here until a different person decides them."
      />
      @if (readOnly()) {
        <div class="note tone-info">
          <rp-icon name="lock" [size]="17" />
          <div class="grow">
            <b>Read-only.</b> Management has read-only access. The administrator makes changes here.
          </div>
        </div>
      }

      @if (error()) {
        <div class="card pad">
          <rp-empty icon="alertc" title="Couldn't load the approvals" [text]="error()">
            <button type="button" class="btn btn-sec btn-sm" (click)="load()">
              <span>Try again</span>
            </button>
          </rp-empty>
        </div>
      } @else {
        <div class="c-grid k4">
          <rp-kpi
            label="Pending"
            [value]="num(counts().tabs.PENDING)"
            icon="hourglass"
            tone="warn"
          />
          <rp-kpi
            label="You can decide"
            [value]="num(counts().canDecide)"
            icon="approve"
            tone="ok"
            [delta]="roleLine()"
          />
          <rp-kpi
            label="Raised by you"
            [value]="num(counts().mine)"
            icon="send"
            delta="Another checker decides these"
          />
          <rp-kpi label="Decided · 30 days" [value]="num(counts().decided30)" icon="checkc" />
        </div>

        <div class="tabs">
          @for (t of tabs; track t.v) {
            <button type="button" class="tab" [class.on]="tab() === t.v" (click)="setTab(t.v)">
              {{ t.l }}<span class="n">{{ num(counts().tabs[t.v]) }}</span>
            </button>
          }
        </div>

        <div class="c-filters">
          <label class="search"
            ><rp-icon name="search" [size]="16" /><input
              type="search"
              id="ap-q"
              placeholder="Search request, summary or maker"
              autocomplete="off"
              [value]="q()"
              (input)="setQ($event)"
          /></label>
          <rp-dd
            inputId="ap-act"
            [options]="actionOptions()"
            [value]="module()"
            (changed)="module.set($event)"
          />
          <rp-dd
            inputId="ap-mk"
            [options]="makerOptions()"
            [value]="maker()"
            (changed)="maker.set($event)"
          />
          <span class="fsum">{{ summary() }}</span>
        </div>

        <div class="tbl-wrap">
          <table class="tbl">
            <thead>
              <tr>
                @for (c of columns(); track c.k) {
                  <th
                    [class.sort]="c.sort"
                    [class.asc]="c.sort && sort()?.k === c.k && sort()?.dir === 'asc'"
                    [class.desc]="c.sort && sort()?.k === c.k && sort()?.dir === 'desc'"
                    (click)="c.sort && sortBy(c.k)"
                  >
                    {{ c.l }}
                    @if (c.sort) {
                      <span class="sa">{{
                        sort()?.k === c.k && sort()?.dir === 'desc' ? '↓' : '↑'
                      }}</span>
                    }
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @if (loading() && !rows().length) {
                <tr>
                  <td [attr.colspan]="columns().length">
                    <rp-empty icon="hourglass" title="Loading…" />
                  </td>
                </tr>
              }
              @for (r of shown(); track r.id) {
                <tr tabindex="0" (click)="openRequest(r.id)" (keydown.enter)="openRequest(r.id)">
                  <td>
                    <span class="t-mono">{{ r.no }}</span>
                    <div class="cell-s">{{ ago(r.raisedAt) }}</div>
                  </td>
                  <td>
                    <span class="tag">{{ r.area }}</span>
                  </td>
                  <td>
                    <span class="t-sm t-b">{{ r.action }}</span>
                    @if (r.cr) {
                      {{ ' '
                      }}<span class="srs cr" title="Version 2.1 change request">{{ r.cr }}</span>
                    }
                  </td>
                  <td>
                    <div
                      class="t-sm"
                      style="max-width: 380px; white-space: normal; line-height: 1.4"
                    >
                      {{ r.summary }}
                    </div>
                  </td>
                  <td>
                    <span class="t-sm">{{ r.maker.name }}</span>
                    @if (r.maker.you) {
                      <div class="cell-s">You</div>
                    }
                  </td>
                  @if (tab() === 'PENDING') {
                    <td>
                      @if (why(r)) {
                        <span class="cm-why"
                          ><rp-icon name="lock" [size]="12" />{{
                            r.maker.you ? 'Your request' : 'View only'
                          }}</span
                        >
                      } @else {
                        <span class="chip tone-ok">You can decide</span>
                      }
                    </td>
                  } @else {
                    <td>
                      <span class="t-sm">{{
                        r.appliedDirectly ? 'Applied directly' : (r.checker?.name ?? '—')
                      }}</span>
                      <div class="cell-s">{{ r.decidedAt ? dt(r.decidedAt) : '' }}</div>
                    </td>
                    <td>
                      <div class="t-sm t-muted" style="max-width: 260px; white-space: normal">
                        {{ r.remarks ?? '' }}
                      </div>
                    </td>
                  }
                </tr>
              } @empty {
                @if (!loading()) {
                  <tr>
                    <td [attr.colspan]="columns().length">
                      <rp-empty
                        icon="approve"
                        [title]="
                          tab() === 'PENDING'
                            ? 'Nothing waiting for a decision'
                            : 'No ' + tabLabel().toLowerCase() + ' requests'
                        "
                        [text]="
                          tab() === 'PENDING'
                            ? 'New requests from fee, member and grievance changes appear here.'
                            : 'Change the filters to see more.'
                        "
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
              of
              <b class="t-num">{{ num(rows().length) }}{{ data()?.nextCursor ? '+' : '' }}</b></span
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
      }
    </div>

    @if (detail(); as a) {
      <rp-modal
        [title]="'Request ' + a.no"
        [sub]="a.area + ' · ' + a.action"
        icon="approve"
        [drawer]="true"
        cls="cm-m"
        [foot]="a.status === 'PENDING'"
        (closed)="closeRequest()"
      >
        <div class="cm-dr">
          <div class="stack g16">
            <div class="row g8 wrap">
              <span [class]="'chip dot lg tone-' + statusTone(a.status)">{{
                statusLabel(a.status)
              }}</span>
              <span class="tag">{{ a.area }}</span>
              @if (a.cr) {
                <span class="srs cr" title="Version 2.1 change request">{{ a.cr }}</span>
              }
            </div>
            <div class="t-h3">{{ a.action }}</div>
            <p class="t-sm t-ink2" style="line-height: 1.55">{{ a.summary }}</p>
            <dl class="kv">
              <dt>Maker</dt>
              <dd>
                {{ a.maker.name }}<span class="t-faint"> · {{ makerKind(a) }}</span>
              </dd>
              <dt>Raised</dt>
              <dd>{{ dt(a.raisedAt) }}</dd>
              @if (a.checker) {
                <dt>Checker</dt>
                <dd>{{ a.checker.name }}</dd>
              }
              @if (a.decidedAt) {
                <dt>Decided</dt>
                <dd>{{ dt(a.decidedAt) }}</dd>
              }
              @if (a.evidence; as ev) {
                <dt>Evidence</dt>
                <dd>
                  <a class="linkbtn" [href]="ev.url" target="_blank" rel="noopener noreferrer"
                    ><rp-icon name="clip" [size]="13" /> {{ ev.name }}</a
                  >
                </dd>
              }
              @if (a.reason) {
                <dt>Reason given</dt>
                <dd>{{ a.reason }}</dd>
              }
            </dl>
            <div class="sec-h"><h3>Proposed change</h3></div>
            @if (a.changes.length) {
              <div class="tbl-wrap">
                <table class="tbl cm-diff">
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Current</th>
                      <th></th>
                      <th>Proposed</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (c of a.changes; track $index) {
                      <tr>
                        <td class="t-b">{{ c.label }}</td>
                        <td class="cm-from">{{ c.from }}</td>
                        <td class="cm-arr"><rp-icon name="arrowr" [size]="14" /></td>
                        <td class="cm-to">{{ c.to }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <div class="note tone-neutral">
                <rp-icon name="info" [size]="17" />
                <div class="grow">Only the summary of this request is available.</div>
              </div>
            }
            @if (a.module === 'PII_CORRECTION') {
              <p class="t-xs t-muted">
                Approving updates the display-only field and records the correction permanently in
                the member's history (CR-06).
              </p>
            }
            @if (a.module === 'MEMBER_DELINK') {
              <p class="t-xs t-muted">
                De-linking needs a zero campus-wallet balance (BR-19). Members are never deleted —
                the profile becomes Inactive and Unlinked (CR-08).
              </p>
            }
            @if (a.lastError) {
              <div class="note tone-bad">
                <rp-icon name="alertc" [size]="17" />
                <div class="grow"><b>Couldn't apply:</b> {{ a.lastError }}</div>
              </div>
            }
            @if (a.status === 'PENDING') {
              @if (why(a); as w) {
                <div class="note tone-info">
                  <rp-icon name="lock" [size]="17" />
                  <div class="grow">{{ w }}</div>
                </div>
              } @else {
                <div class="fs">
                  <h4><rp-icon name="approve" [size]="16" /> Your decision</h4>
                  <div class="fs-b">
                    <div class="fld" [class.invalid]="remarksError()">
                      <label class="fld-l" for="ap-rem">Remarks<span class="req">*</span></label>
                      <div class="fld-in">
                        <textarea
                          id="ap-rem"
                          name="ap-rem"
                          rows="3"
                          maxlength="300"
                          autocomplete="off"
                          placeholder="Why are you approving or rejecting? Remarks are mandatory."
                          aria-describedby="ap-rem-e"
                          [value]="remarks()"
                          (input)="setRemarks($event)"
                        ></textarea>
                      </div>
                      <div class="fld-e" id="ap-rem-e" role="alert">
                        <rp-icon name="alertc" [size]="14" /><span>{{ remarksError() }}</span>
                      </div>
                      <div class="fld-h">Recorded with your name and the time.</div>
                    </div>
                  </div>
                </div>
              }
            } @else {
              <div class="sec-h"><h3>Decision</h3></div>
              <div class="tl">
                <div class="tl-i done">
                  <span class="tl-dot"><rp-icon name="check" [size]="13" [stroke]="2.6" /></span>
                  <div class="tl-c">
                    <div class="tl-t">Raised by {{ a.maker.name }}</div>
                    <div class="tl-s">{{ dt(a.raisedAt) }}</div>
                  </div>
                </div>
                <div
                  class="tl-i"
                  [class.done]="a.status === 'APPROVED'"
                  [class.bad]="a.status === 'REJECTED'"
                >
                  <span class="tl-dot"
                    ><rp-icon
                      [name]="a.status === 'APPROVED' ? 'check' : 'x'"
                      [size]="13"
                      [stroke]="2.6"
                  /></span>
                  <div class="tl-c">
                    <div class="tl-t">{{ decisionTitle(a) }}</div>
                    <div class="tl-s">
                      {{ a.decidedAt ? dt(a.decidedAt) : ''
                      }}{{ a.remarks ? ' · “' + a.remarks + '”' : '' }}
                    </div>
                  </div>
                </div>
              </div>
            }
          </div>
        </div>
        <ng-container modal-foot>
          @if (a.status === 'PENDING') {
            <button
              type="button"
              class="btn btn-danger-o"
              [class.is-busy]="busy() === 'REJECT'"
              [disabled]="!!why(a) || !!busy()"
              [attr.title]="why(a) || null"
              (click)="decide(a, 'REJECT')"
            >
              <rp-icon name="x" [size]="17" /><span>Reject</span>
            </button>
            <button
              type="button"
              class="btn btn-ok"
              [class.is-busy]="busy() === 'APPROVE'"
              [disabled]="!!why(a) || !!busy()"
              [attr.title]="why(a) || null"
              (click)="decide(a, 'APPROVE')"
            >
              <rp-icon name="check" [size]="17" /><span>Approve</span>
            </button>
          }
        </ng-container>
      </rp-modal>
    }
  `,
})
export class ConsoleApprovals {
  private readonly api = inject(ApprovalsApi);
  private readonly overlays = inject(Overlays);
  private readonly sessions = inject(SessionContext);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /** Console (an institution's requests) or back office (the platform's own requests). */
  protected readonly surface: ApprovalSurface =
    (this.route.snapshot.data['surface'] ?? this.route.parent?.snapshot.data['surface']) === 'ops'
      ? 'ops'
      : 'console';
  protected readonly tabs = TABS;
  protected readonly pageSize = PAGE;
  protected readonly ago = (iso: string) => relativeTime(iso);

  protected readonly tab = signal<ApprovalStatus>('PENDING');
  protected readonly q = signal('');
  protected readonly module = signal('');
  protected readonly maker = signal('');
  protected readonly data = signal<ApprovalList | null>(null);
  protected readonly rows = signal<readonly ApprovalRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly sort = signal<{ k: SortKey; dir: 'asc' | 'desc' } | null>(null);

  protected readonly detail = signal<ApprovalDetail | null>(null);
  protected readonly remarks = signal('');
  protected readonly remarksError = signal('');
  protected readonly busy = signal<'' | 'APPROVE' | 'REJECT'>('');
  private seq = 0;
  private qTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly subTasks = computed(
    () =>
      (this.surface === 'ops'
        ? this.sessions.ops()?.subTasks
        : this.sessions.console()?.subTasks) ?? [],
  );
  /** approvals.decide (console, the Institution Administrator) / mkr.decide (back office). */
  private readonly decider = computed(() =>
    this.subTasks().includes(this.surface === 'ops' ? 'mkr.decide' : 'approvals.decide'),
  );
  protected readonly readOnly = computed(
    () =>
      this.surface === 'console' &&
      (this.sessions.console()?.roles.some((r) => r.readOnly) ?? false),
  );
  protected readonly roleLine = computed(() => {
    if (this.readOnly()) return 'Read-only role';
    if (this.surface === 'ops') return this.sessions.ops()?.role.name ?? '';
    return (this.sessions.console()?.roles ?? []).map((r) => r.name).join(', ');
  });
  protected readonly counts = computed(() => this.data()?.counts ?? NO_COUNTS);
  protected readonly tabLabel = computed(() => STATUS[this.tab()].l);
  protected readonly columns = computed<readonly Col[]>(() => [
    { k: 'no', l: 'Request', sort: true },
    { k: 'area', l: 'Module', sort: true },
    { k: 'action', l: 'Action', sort: true },
    { k: 'sum', l: 'Summary', sort: false },
    { k: 'maker', l: 'Maker', sort: true },
    ...(this.tab() === 'PENDING'
      ? [{ k: 'can', l: '', sort: false }]
      : [
          { k: 'decided', l: 'Decided', sort: true },
          { k: 'rem', l: 'Remarks', sort: false },
        ]),
  ]);
  protected readonly actionOptions = computed<DropdownOption[]>(() => [
    { v: '', l: 'All actions' },
    ...(this.data()?.modules ?? []).map((m) => ({ v: m.code, l: m.label })),
  ]);
  protected readonly makerOptions = computed<DropdownOption[]>(() => [
    { v: '', l: 'Any maker' },
    ...(this.data()?.makers ?? []).map((m) => ({
      v: m.id,
      l: m.name,
      ...(m.you ? { sub: 'You' } : {}),
    })),
  ]);
  protected readonly sorted = computed(() => {
    const list = [...this.rows()];
    const s = this.sort();
    if (!s) return list;
    const get = (r: ApprovalRow) =>
      s.k === 'no'
        ? r.no
        : s.k === 'area'
          ? r.area
          : s.k === 'action'
            ? r.action
            : s.k === 'maker'
              ? r.maker.name
              : (r.decidedAt ?? '');
    list.sort((a, b) => {
      const r = get(a).localeCompare(get(b), 'en', { numeric: true });
      return s.dir === 'desc' ? -r : r;
    });
    return list;
  });
  protected readonly pages = computed(() =>
    Array.from({ length: Math.max(1, Math.ceil(this.rows().length / PAGE)) }, (_, i) => i + 1),
  );
  protected readonly shown = computed(() =>
    this.sorted().slice((this.page() - 1) * PAGE, this.page() * PAGE),
  );
  protected readonly summary = computed(() => {
    const n = this.rows().length;
    const more = this.data()?.nextCursor ? '+' : '';
    return `${this.num(n)}${more} request${n === 1 && !more ? '' : 's'}`;
  });

  constructor() {
    effect(() => {
      // A tab or filter change reloads the first page.
      this.tab();
      this.module();
      this.maker();
      untracked(() => void this.load());
    });
    // ?open=<id> opens the request (links from the notification bell).
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      const id = p.get('open');
      if (id && id !== this.detail()?.id) void this.openRequest(id);
    });
  }

  private query(cursor?: string) {
    return {
      status: this.tab(),
      module: this.module() || undefined,
      maker: this.maker() || undefined,
      q: this.q().trim() || undefined,
      limit: 100,
      cursor,
    };
  }

  protected async load() {
    const id = ++this.seq;
    this.loading.set(true);
    try {
      const d = await this.api.list(this.surface, this.query());
      if (id !== this.seq) return;
      this.data.set(d);
      this.rows.set(d.items);
      this.page.set(1);
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
    try {
      const d = await this.api.list(this.surface, this.query(cursor));
      this.data.set({ ...d, counts: this.data()?.counts ?? d.counts });
      this.rows.set([...this.rows(), ...d.items]);
      this.page.set(this.page() + 1);
    } catch (e) {
      this.overlays.toast("Couldn't load more requests", {
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
    }
  }

  // --- filters ---------------------------------------------------------------------------------------
  protected setTab(t: ApprovalStatus) {
    this.tab.set(t);
    this.sort.set(null);
  }
  protected setQ(e: Event) {
    this.q.set((e.target as HTMLInputElement).value);
    if (this.qTimer) clearTimeout(this.qTimer);
    this.qTimer = setTimeout(() => void this.load(), 250);
  }
  protected sortBy(k: string) {
    const key = k as SortKey;
    const s = this.sort();
    this.sort.set({ k: key, dir: s?.k === key && s.dir === 'asc' ? 'desc' : 'asc' });
    this.page.set(1);
  }

  // --- drawer ----------------------------------------------------------------------------------------
  protected async openRequest(id: string) {
    try {
      const d = await this.api.detail(this.surface, id);
      this.detail.set(d);
      this.remarks.set('');
      this.remarksError.set('');
    } catch (e) {
      this.overlays.toast("Couldn't open the request", {
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
    }
  }

  private async reloadDetail(id: string) {
    try {
      this.detail.set(await this.api.detail(this.surface, id));
    } catch {
      // The drawer keeps what it shows; the list reload shows the current state.
    }
  }

  protected closeRequest() {
    this.detail.set(null);
    if (this.route.snapshot.queryParamMap.has('open')) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { open: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }

  protected setRemarks(e: Event) {
    this.remarks.set((e.target as HTMLTextAreaElement).value);
    this.remarksError.set('');
  }

  /** Why this person can't decide the request (prototype CM.canDecide); empty when they can. */
  protected why(a: ApprovalRow): string {
    if (this.readOnly()) return 'Management has a read-only view of approvals.';
    if (a.status !== 'PENDING') return 'Already decided.';
    if (a.maker.you) {
      return 'You raised this request. A different checker must decide it (maker-checker, FR-MKC-03).';
    }
    if (!a.canDecide || !this.decider()) {
      return this.surface === 'ops'
        ? "Your role can't decide these requests. The Platform Administrator decides them."
        : "Your role can't decide these requests. An Institution Administrator decides them.";
    }
    return '';
  }

  protected async decide(a: ApprovalDetail, decision: 'APPROVE' | 'REJECT') {
    const w = this.why(a);
    if (w) {
      this.overlays.toast("You can't decide this request", { tone: 'bad', sub: w });
      return;
    }
    if (this.busy()) return;
    const remarks = this.remarks().trim();
    if (!remarks) {
      this.remarksError.set(translate('VALIDATION.REQUIRED'));
      return;
    }
    const approve = decision === 'APPROVE';
    const ok = await this.overlays.confirm({
      title: `${approve ? 'Approve' : 'Reject'} ${a.no}?`,
      text: approve
        ? 'The change takes effect immediately and is recorded with your name.'
        : 'Nothing changes. The maker sees your remarks.',
      ok: approve ? 'Approve' : 'Reject',
      tone: approve ? 'brand' : 'bad',
      icon: approve ? 'approve' : 'x',
    });
    if (!ok) return;
    this.busy.set(decision);
    try {
      const d = await this.api.decide(this.surface, a.id, a.version, { decision, remarks });
      this.detail.set(d);
      this.remarks.set('');
      this.overlays.toast(approve ? 'Approved — change applied' : 'Request rejected', {
        tone: approve ? 'ok' : 'info',
        sub: `${a.no} · ${a.action}`,
      });
    } catch (e) {
      if (e instanceof ApiProblem && e.code === 'MKR.EFFECT_FAILED') {
        // The effect refused (e.g. the admission number was taken meanwhile): still pending.
        this.overlays.toast("Couldn't apply the change", { tone: 'bad', sub: e.detail });
        await this.reloadDetail(a.id);
      } else if (e instanceof ApiProblem && e.errors.length) {
        const f = e.errors.find((x) => x.field === 'remarks') ?? e.errors[0];
        this.remarksError.set(f?.message ?? e.detail);
      } else {
        this.overlays.toast('Not decided', {
          sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
          tone: 'bad',
        });
        if (e instanceof ApiProblem && (e.status === 409 || e.status === 412)) {
          await this.reloadDetail(a.id);
        }
      }
    } finally {
      this.busy.set('');
      void this.load();
    }
  }

  // --- formatting ------------------------------------------------------------------------------------
  protected num(n: number) {
    return n.toLocaleString('en-IN');
  }
  protected min(a: number, b: number) {
    return Math.min(a, b);
  }
  protected dt(v: string) {
    return formatDateTime(v);
  }
  protected statusLabel(s: ApprovalStatus) {
    return STATUS[s].l;
  }
  protected statusTone(s: ApprovalStatus) {
    return STATUS[s].tone;
  }
  protected makerKind(a: ApprovalRow) {
    return a.maker.you ? 'You' : (MAKER[a.maker.type] ?? a.maker.type);
  }
  protected decisionTitle(a: ApprovalRow) {
    if (a.appliedDirectly) return `Applied directly by ${a.maker.name}`;
    return `${STATUS[a.status].l} by ${a.checker?.name ?? '—'}`;
  }
}
