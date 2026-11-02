import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Card, Empty } from '../../../Shared/Blocks';
import { Dropdown } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate, formatDateTime, istBusinessDate } from '../../../Utils/format';
import type { IconName } from '../../../Utils/icons';
import { parseAmount } from '../../../Utils/money';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { PortalApi, type Cancellation, type DataExport, type ExportClass } from '../portal.api';
import { PortalStore } from '../portal.store';
import { Field, PageHead, inr } from '../Shared/PortalUi';

const CLASSES: readonly { k: ExportClass; l: string; d: string }[] = [
  {
    k: 'members',
    l: 'Members and profiles',
    d: 'Everyone, with user types, departments and statuses',
  },
  { k: 'financial', l: 'Financial', d: 'Wallet ledgers, payments, fees, settlements and invoices' },
  { k: 'academic', l: 'Academic', d: 'Classes, timetables, homework, exams and marks' },
  { k: 'attendance', l: 'Attendance', d: 'Gate, class, period and location attendance' },
  {
    k: 'communication',
    l: 'Communication',
    d: 'Announcements and the communication log (never message bodies)',
  },
];

const REASONS = [
  'Moving to another system',
  'Too expensive',
  'Missing features we need',
  'Institution closing or merging',
  'Other',
];

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/**
 * s.data — data and cancellation (FR-SAS-04, OI-SAS-05, OQ-30, UC 4.10; SAS-022…025, SAS-048/049;
 * prototype s.data): export chosen kinds of data as CSV files in a ZIP (signed download link while it
 * is kept), and ask CampusOne to cancel — once the invoices are paid — or withdraw that request.
 */
@Component({
  selector: 'rp-portal-data',
  imports: [Card, Dropdown, Empty, Field, Icon, Modal, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-sp-head
      title="Data & cancellation"
      sub="Export your institution's data whenever you like. Cancelling closes the institution after settlements and balances are cleared."
    />
    <div class="c-grid k2" style="align-items: start">
      <div class="stack g14">
        <rp-card title="Export your data" icon="archive" [plainIcon]="true">
          <div class="stack g12">
            <p class="t-sm t-muted">
              Choose what to include. The download link appears under Your exports when it's ready,
              and works until it expires <span class="srs" title="SRS reference">FR-SAS-04</span>.
            </p>
            <div class="stack g8">
              @for (c of classes; track c.k) {
                <label class="chk"
                  ><input
                    type="checkbox"
                    [id]="'sp-ex-' + c.k"
                    [checked]="picked().has(c.k)"
                    (change)="toggle(c.k, $event)"
                  /><span
                    ><b>{{ c.l }}</b
                    ><span class="t-muted">&nbsp;— {{ c.d }}</span></span
                  ></label
                >
              }
            </div>
            <div class="fld" [class.invalid]="!!classesError()">
              <div class="fld-e" id="sp-ex-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ classesError() }}</span>
              </div>
            </div>
            <div class="seg" role="radiogroup" aria-label="Format">
              <span class="seg-ind" style="width: calc((100% - 8px) / 2); left: 3px"></span>
              <button type="button" role="radio" class="on" aria-checked="true">
                CSV files in a ZIP
              </button>
              <button
                type="button"
                role="radio"
                aria-checked="false"
                disabled
                title="Not available yet"
              >
                Excel workbook
              </button>
            </div>
            <div class="row" style="justify-content: flex-end">
              <button
                type="button"
                class="btn btn-pri"
                id="sp-ex-go"
                [class.is-busy]="exporting()"
                (click)="requestExport()"
              >
                <rp-icon name="download" [size]="17" /><span>Request export</span>
              </button>
            </div>
          </div>
        </rp-card>
        @if (exports().length) {
          <rp-card title="Your exports" icon="inbox" [plainIcon]="true" [flush]="true">
            <div class="list plain" style="padding: 0 14px">
              @for (x of exports(); track x.id) {
                <div class="li">
                  <span class="li-ic sm"><rp-icon [name]="exportIcon(x)" [size]="16" /></span>
                  <span class="li-main"
                    ><span class="li-t wrap">{{ what(x) }} · CSV files in a ZIP</span
                    ><span class="li-s wrap">{{ exportLine(x) }}</span></span
                  >
                  <span class="li-r">
                    @if (x.status === 'READY' && x.file) {
                      <button type="button" class="btn btn-sec btn-xs" (click)="download(x)">
                        <rp-icon name="download" [size]="15" /><span>Download</span>
                      </button>
                    } @else if (x.status === 'REQUESTED' || x.status === 'RUNNING') {
                      <span class="sp-spin"></span>
                    }
                  </span>
                </div>
              }
            </div>
          </rp-card>
        }
      </div>
      <div class="stack g14">
        @if (cancelError()) {
          <div class="card pad">
            <rp-empty
              icon="wifioff"
              title="Couldn't load the cancellation"
              [text]="cancelError()"
            />
          </div>
        } @else if (cancellation(); as c) {
          @if (c.status === 'CANCELLED') {
            <rp-card title="Cancelled" icon="archive" [plainIcon]="true">
              <div class="stack g8 t-sm">
                <p>
                  {{ name() }} was cancelled. Balances are frozen and the retention clock has
                  started.
                </p>
                <div class="note tone-info">
                  <rp-icon name="info" [size]="17" />
                  <div class="grow">
                    How long each kind of data is kept after cancellation is still being agreed
                    <span class="srs" title="SRS reference">OQ-30</span>
                    <span class="srs" title="SRS reference">OI-SAS-05</span>. Until it is, nothing
                    is deleted.
                  </div>
                </div>
              </div>
            </rp-card>
          } @else if (c.request?.status === 'PENDING') {
            <rp-card title="Cancellation requested" icon="xc" [plainIcon]="true">
              <div class="stack g12 t-sm">
                <dl class="kv">
                  <dt>Requested</dt>
                  <dd>{{ dt(c.request!.requestedAt) }}</dd>
                  <dt>Effective</dt>
                  <dd>{{ date(c.request!.effectiveOn) }}</dd>
                  <dt>Reason</dt>
                  <dd>{{ c.request!.reason }}</dd>
                  <dt>Status</dt>
                  <dd><span class="chip dot tone-info">Submitted</span></dd>
                </dl>
                <p class="t-muted">
                  CampusOne confirms the closing steps with your primary contact: final settlement,
                  refunds of wallet balances, then cancellation
                  <span class="srs" title="SRS reference">4.10</span>.
                </p>
                <div class="row" style="justify-content: flex-end">
                  <button type="button" class="btn btn-sec" (click)="withdraw(c)">
                    <span>Withdraw request</span>
                  </button>
                </div>
              </div>
            </rp-card>
          } @else {
            <rp-card title="Cancel the subscription" icon="xc" [plainIcon]="true">
              <div class="stack g12 t-sm">
                <p>
                  Cancelling closes {{ name() }} once everything below is clear. After that,
                  everything is blocked, balances are frozen and the data-retention clock starts
                  <span class="srs" title="SRS reference">FR-INS-05</span>.
                </p>
                <div class="stack g6">
                  <div class="row g8">
                    @if (c.unpaid.length) {
                      <span style="color: var(--warn)"><rp-icon name="alertc" [size]="16" /></span>
                      <span
                        >{{ plural(c.unpaid.length, 'unpaid invoice') }} — {{ unpaidSum() }}</span
                      >
                    } @else {
                      <span style="color: var(--ok)"><rp-icon name="checkc" [size]="16" /></span>
                      <span>No unpaid invoices</span>
                    }
                  </div>
                  <div class="row g8">
                    @if (c.walletsToRefund.count) {
                      <span style="color: var(--warn)"><rp-icon name="alertc" [size]="16" /></span>
                      <span
                        >{{ walletRefund() }} in member wallets to refund ·
                        {{ plural(c.walletsToRefund.count, 'wallet') }}</span
                      >
                    } @else {
                      <span style="color: var(--ok)"><rp-icon name="checkc" [size]="16" /></span>
                      <span>No member wallet balances to refund</span>
                    }
                  </div>
                </div>
                @if (c.request?.status === 'DECLINED') {
                  <div class="note tone-warn">
                    <rp-icon name="alert" [size]="17" />
                    <div class="grow">
                      CampusOne declined your last request{{
                        c.request.resolution ? ': ' + c.request.resolution : '.'
                      }}
                    </div>
                  </div>
                }
                <div class="note tone-info">
                  <rp-icon name="info" [size]="17" />
                  <div class="grow">
                    After cancellation, data is deleted at the end of the retention period, which is
                    still being agreed <span class="srs" title="SRS reference">OQ-30</span>. Export
                    first if you'll need it.
                  </div>
                </div>
                <div class="row" style="justify-content: flex-end">
                  <button type="button" class="btn btn-danger-o" (click)="openCancel(c)">
                    <rp-icon name="xc" [size]="17" /><span>Request cancellation</span>
                  </button>
                </div>
              </div>
            </rp-card>
          }
        } @else {
          <div class="sk" style="height: 260px; border-radius: 16px"></div>
        }
      </div>
    </div>

    @if (cancelling()) {
      <rp-modal
        [title]="'Cancel ' + name() + '?'"
        sub="Tell us when and why. CampusOne confirms the closing steps with you before anything is switched off."
        icon="xc"
        (closed)="cancelling.set(false)"
      >
        <div class="stack g12">
          @if (formError()) {
            <div class="note tone-bad" role="alert">
              <rp-icon name="alertc" [size]="17" />
              <div class="grow">{{ formError() }}</div>
            </div>
          }
          <div class="fld">
            <label class="fld-l" for="sp-cx-w-b">When<span class="req">*</span></label>
            <rp-dd
              inputId="sp-cx-w"
              [options]="whenOptions()"
              [value]="when()"
              (changed)="when.set($any($event)); errors.set({})"
            />
          </div>
          @if (when() === 'DATE') {
            <rp-sp-fld fid="sp-cx-d" label="Date" [req]="true" [error]="errors()['date']">
              <input
                id="sp-cx-d"
                type="date"
                aria-describedby="sp-cx-d-e"
                [min]="today"
                [value]="on()"
                (input)="on.set(value($event)); errors.set({})"
              />
            </rp-sp-fld>
          }
          <div class="fld" [class.invalid]="!!errors()['reason']">
            <label class="fld-l" for="sp-cx-r-b">Main reason<span class="req">*</span></label>
            <rp-dd
              inputId="sp-cx-r"
              placeholder="Choose one"
              [options]="reasons"
              [value]="mainReason()"
              (changed)="mainReason.set($event); errors.set({})"
            />
            <div class="fld-e" id="sp-cx-r-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ errors()['reason'] }}</span>
            </div>
          </div>
          <rp-sp-fld fid="sp-cx-n" label="Anything else we should know?" [opt]="true">
            <textarea
              id="sp-cx-n"
              rows="2"
              maxlength="200"
              [value]="note()"
              (input)="note.set(value($event))"
            ></textarea>
          </rp-sp-fld>
          <label class="chk"
            ><input
              type="checkbox"
              id="sp-cx-ok"
              [checked]="understood()"
              (change)="understood.set($any($event.target).checked); errors.set({})"
            /><span
              >I understand members won't be able to sign in or pay once the institution is
              cancelled.</span
            ></label
          >
          <div class="fld" [class.invalid]="!!errors()['ok']">
            <div class="fld-e" id="sp-cx-ok-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ errors()['ok'] }}</span>
            </div>
          </div>
        </div>
        <ng-container modal-foot>
          <button type="button" class="btn btn-sec" (click)="cancelling.set(false)">
            <span>Keep my subscription</span>
          </button>
          <button
            type="button"
            class="btn btn-danger"
            id="sp-cx-send"
            [class.is-busy]="sending()"
            (click)="sendCancel()"
          >
            <span>Request cancellation</span>
          </button>
        </ng-container>
      </rp-modal>
    }
  `,
})
export class PortalData {
  private readonly api = inject(PortalApi);
  private readonly overlays = inject(Overlays);
  private readonly store = inject(PortalStore);

  protected readonly classes = CLASSES;
  protected readonly reasons = REASONS.map((r) => ({ v: r, l: r }));
  protected readonly plural = plural;
  protected readonly today = istBusinessDate();

  protected readonly exports = signal<readonly DataExport[]>([]);
  protected readonly picked = signal<ReadonlySet<ExportClass>>(new Set(CLASSES.map((c) => c.k)));
  protected readonly classesError = signal('');
  protected readonly exporting = signal(false);

  protected readonly cancellation = signal<Cancellation | null>(null);
  protected readonly cancelError = signal('');
  protected readonly cancelling = signal(false);
  protected readonly when = signal<'END_OF_CYCLE' | 'ASAP' | 'DATE'>('ASAP');
  protected readonly on = signal('');
  protected readonly mainReason = signal('');
  protected readonly note = signal('');
  protected readonly understood = signal(false);
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly formError = signal('');
  protected readonly sending = signal(false);

  protected readonly name = computed(
    () => this.store.account()?.institution.name ?? 'your institution',
  );
  protected readonly whenOptions = computed(() => {
    const r = this.cancellation()?.renewsOn;
    return [
      ...(r
        ? [{ v: 'END_OF_CYCLE', l: `At the end of the current cycle · ${formatDate(r)}` }]
        : []),
      { v: 'ASAP', l: 'As soon as possible' },
      { v: 'DATE', l: 'On a date' },
    ];
  });
  protected readonly unpaidSum = computed(() =>
    inr(
      (this.cancellation()?.unpaid ?? []).reduce(
        (s, u) => s + parseAmount(u.total, { allowZero: true }),
        0,
      ),
    ),
  );

  protected readonly walletRefund = computed(() =>
    inr(
      parseAmount(this.cancellation()?.walletsToRefund.amount.amount ?? '0', { allowZero: true }),
    ),
  );

  constructor() {
    void this.loadExports();
    void this.loadCancellation();
    if (!this.store.account()) void this.store.refresh();
  }

  private async loadExports() {
    try {
      this.exports.set((await this.api.exports()).items);
    } catch {
      /* the list stays as it was; requesting an export shows the error */
    }
  }

  private async loadCancellation() {
    try {
      this.cancellation.set(await this.api.cancellation());
      this.cancelError.set('');
    } catch (e) {
      this.cancelError.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  protected value(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected date(v: string | null) {
    return v ? formatDate(v) : '—';
  }
  protected dt(v: string) {
    return formatDateTime(v);
  }

  // --- export (SAS-022, SAS-048) ------------------------------------------------------------------
  protected toggle(k: ExportClass, e: Event) {
    const on = (e.target as HTMLInputElement).checked;
    const next = new Set(this.picked());
    if (on) next.add(k);
    else next.delete(k);
    this.picked.set(next);
    this.classesError.set('');
  }
  protected what(x: DataExport) {
    const keys = Object.keys(x.counts ?? {});
    if (!keys.length || keys.length === CLASSES.length) return 'Everything';
    return CLASSES.filter((c) => keys.includes(c.k))
      .map((c) => c.l)
      .join(', ');
  }
  protected exportIcon(x: DataExport): IconName {
    return x.status === 'READY'
      ? 'checkc'
      : x.status === 'FAILED'
        ? 'alertc'
        : x.status === 'EXPIRED'
          ? 'archive'
          : 'hourglass';
  }
  protected exportLine(x: DataExport) {
    const at = formatDateTime(x.requestedAt);
    switch (x.status) {
      case 'READY':
        return `${at} · ready · link valid until ${x.expiresAt ? formatDate(x.expiresAt) : '—'}`;
      case 'EXPIRED':
        return `${at} · the link has expired`;
      case 'FAILED':
        return `${at} · couldn't be prepared`;
      default:
        return `${at} · preparing…`;
    }
  }
  protected download(x: DataExport) {
    if (x.file) globalThis.open?.(x.file.url, '_blank', 'noopener');
  }

  protected async requestExport() {
    if (this.exporting()) return;
    const classes = CLASSES.map((c) => c.k).filter((k) => this.picked().has(k));
    if (!classes.length) {
      this.classesError.set(translate('VALIDATION.REQUIRED'));
      return;
    }
    this.exporting.set(true);
    try {
      const x = await this.api.requestExport(classes);
      await this.loadExports();
      if (!this.exports().some((y) => y.id === x.id)) this.exports.update((l) => [x, ...l]);
      this.overlays.toast(x.status === 'READY' ? 'Export ready' : 'Export started', {
        sub:
          x.status === 'READY'
            ? `${x.file?.name ?? 'Your export'} · download it under Your exports`
            : "It's being prepared and will appear under Your exports",
        tone: x.status === 'READY' ? 'ok' : 'info',
      });
    } catch (e) {
      this.overlays.toast('Export not started', {
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: e instanceof ApiProblem && e.code === 'SAS.EXPORT_RUNNING' ? 'info' : 'bad',
      });
    } finally {
      this.exporting.set(false);
    }
  }

  // --- cancellation (SAS-024, SAS-025, SAS-049) ---------------------------------------------------
  protected openCancel(c: Cancellation) {
    this.when.set(c.renewsOn ? 'END_OF_CYCLE' : 'ASAP');
    this.on.set('');
    this.mainReason.set('');
    this.note.set('');
    this.understood.set(false);
    this.errors.set({});
    this.formError.set('');
    this.cancelling.set(true);
  }

  protected async sendCancel() {
    if (this.sending()) return;
    const e: Record<string, string> = {};
    const req = translate('VALIDATION.REQUIRED');
    if (this.when() === 'DATE' && !this.on()) e['date'] = req;
    if (!this.mainReason()) e['reason'] = req;
    if (!this.understood()) e['ok'] = req;
    this.errors.set(e);
    if (Object.keys(e).length) return;
    const note = this.note().trim();
    const reason = `${this.mainReason()}${note ? ` — ${note}` : ''}`;
    this.sending.set(true);
    this.formError.set('');
    try {
      await this.api.requestCancellation({
        when: this.when(),
        ...(this.when() === 'DATE' ? { effectiveOn: this.on() } : {}),
        reason,
      });
      this.cancelling.set(false);
      this.overlays.toast('Cancellation requested', {
        sub: 'CampusOne will contact your primary contact to confirm the closing steps',
      });
      await this.loadCancellation();
      void this.store.refresh();
    } catch (x) {
      const field =
        x instanceof ApiProblem ? x.errors.find((y) => y.field === 'effectiveOn') : null;
      if (field) {
        this.when.set('DATE');
        this.errors.set({ date: field.message });
      } else {
        this.formError.set(x instanceof ApiProblem ? x.detail : translate('GEN.UNAVAILABLE'));
      }
    } finally {
      this.sending.set(false);
    }
  }

  protected async withdraw(c: Cancellation) {
    if (!c.request) return;
    const ok = await this.overlays.confirm({
      title: 'Withdraw the cancellation request?',
      text: 'Your subscription carries on as before.',
      ok: 'Withdraw request',
    });
    if (!ok) return;
    try {
      await this.api.withdrawCancellation(c.request.id);
      this.overlays.toast('Request withdrawn', { sub: 'Nothing changes' });
      await this.loadCancellation();
      void this.store.refresh();
    } catch (e) {
      this.overlays.toast('Not withdrawn', {
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
    }
  }
}
