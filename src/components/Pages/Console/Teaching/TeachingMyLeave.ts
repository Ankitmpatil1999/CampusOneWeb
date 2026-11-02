/**
 * My leave (client 2026-10-12; the app's own leave screen, ACA-057…059): the teacher's balances by
 * type, their requests this year and where each stands — with the coordinator, then the principal,
 * then decided — applying for leave in a drawer and cancelling a request no one has reviewed yet.
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
import { Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { Dropdown } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate } from '../../../Utils/format';
import { refreshWhileVisible } from '../../../Utils/live';
import { ApiProblem } from '../../../Utils/problem';
import { t as tr } from '../../../Utils/t';
import { addDays, problemText, today } from '../Structure/academic-format';
import { MeApi, type MyLeave, type MyLeaves, type StaffLeaveType } from './me.api';

/** How often the list is read again while the page is open. */
const REFRESH_MS = 20_000;

type Field = 'type' | 'from' | 'to' | 'reason';
const FIELD_OF: Readonly<Record<string, Field>> = {
  type: 'type',
  from: 'from',
  to: 'to',
  reason: 'reason',
};

/** Apply for leave: the type, the days and the reason, within the year's balance. */
@Component({
  selector: 'rp-my-leave-form',
  imports: [Dropdown, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<rp-modal
    [title]="t('ui.web.tch.my.leave.formTitle')"
    [sub]="t('ui.web.tch.my.leave.formSub')"
    icon="leaveic"
    [drawer]="true"
    [dismiss]="!busy()"
    (closed)="closed.emit()"
  >
    <div class="stack g16" id="ml-form">
      @if (error()) {
        <div class="note tone-bad" role="alert">
          <rp-icon name="alertc" [size]="17" />
          <div class="grow">{{ error() }}</div>
        </div>
      }
      <div class="fld" [class.invalid]="err('type')">
        <label class="fld-l" for="ml-type-b"
          >{{ t('ui.web.tch.my.leave.type') }}<span class="req">*</span></label
        >
        <rp-dd
          inputId="ml-type"
          [placeholder]="t('ui.web.tch.my.leave.pickType')"
          [options]="types"
          [value]="type()"
          (changed)="type.set($any($event)); clear('type')"
        />
        <div class="fld-e" role="alert">
          <rp-icon name="alertc" [size]="14" /><span>{{ err('type') }}</span>
        </div>
      </div>
      <div class="c-form">
        <div class="fld" [class.invalid]="err('from')">
          <label class="fld-l" for="ml-from"
            >{{ t('ui.web.tch.my.leave.from') }}<span class="req">*</span></label
          >
          <div class="fld-in">
            <input
              id="ml-from"
              type="date"
              [min]="today"
              [value]="from()"
              (change)="setFrom(val($event))"
            />
          </div>
          <div class="fld-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('from') }}</span>
          </div>
        </div>
        <div class="fld" [class.invalid]="err('to')">
          <label class="fld-l" for="ml-to"
            >{{ t('ui.web.tch.my.leave.to') }}<span class="req">*</span></label
          >
          <div class="fld-in">
            <input
              id="ml-to"
              type="date"
              [min]="from() || today"
              [value]="to()"
              (change)="to.set(val($event)); clear('to')"
            />
          </div>
          <div class="fld-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('to') }}</span>
          </div>
        </div>
      </div>
      <div class="fld" [class.invalid]="err('reason')">
        <label class="fld-l" for="ml-reason"
          >{{ t('ui.web.tch.my.leave.reason') }}<span class="req">*</span
          ><span class="count">{{ reason().length }}/250</span></label
        >
        <div class="fld-in">
          <textarea
            id="ml-reason"
            rows="4"
            maxlength="250"
            [placeholder]="t('ui.web.tch.my.leave.reasonPh')"
            [value]="reason()"
            (input)="reason.set(val($event)); clear('reason')"
          ></textarea>
        </div>
        <div class="fld-e" role="alert">
          <rp-icon name="alertc" [size]="14" /><span>{{ err('reason') }}</span>
        </div>
      </div>
      <p class="t-sm t-muted">{{ t(routeKey()) }}</p>
    </div>
    <div modal-foot class="cc-foot">
      <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="closed.emit()">
        <span>{{ t('ui.web.tch.hw.cancel') }}</span>
      </button>
      <button
        type="button"
        class="btn btn-pri"
        id="ml-send"
        [class.is-busy]="busy()"
        [disabled]="busy()"
        (click)="send()"
      >
        <rp-icon name="send" [size]="17" /><span>{{ t('ui.web.tch.my.leave.send') }}</span>
      </button>
    </div>
  </rp-modal>`,
})
export class MyLeaveForm {
  private readonly api = inject(MeApi);
  protected readonly t = tr;
  readonly closed = output<void>();
  readonly saved = output<MyLeave>();
  /** Who reviews: the coordinator then the principal (a teacher), or the principal alone. */
  readonly reviewedBy = input<MyLeaves['reviewedBy']>('COORDINATOR_THEN_PRINCIPAL');

  protected readonly today = today();
  protected readonly types = (['CASUAL', 'MEDICAL', 'EARNED'] as const).map((v) => ({
    v,
    l: tr(`ui.web.tch.my.leave.t.${v.toLowerCase()}`),
  }));
  protected readonly type = signal<StaffLeaveType | ''>('');
  protected readonly from = signal(addDays(today(), 1));
  protected readonly to = signal(addDays(today(), 1));
  protected readonly reason = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  private readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly routeKey = computed(() =>
    this.reviewedBy() === 'PRINCIPAL'
      ? 'ui.web.tch.my.leave.routePrincipal'
      : 'ui.web.tch.my.leave.routeCoordinator',
  );

  protected err(f: Field) {
    return this.errors()[f] ?? '';
  }
  protected clear(f: Field) {
    this.errors.update((e) => ({ ...e, [f]: '' }));
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected setFrom(v: string) {
    this.from.set(v);
    if (!this.to() || this.to() < v) this.to.set(v);
    this.clear('from');
  }

  /** The server's own checks, first. */
  private check() {
    const e: Partial<Record<Field, string>> = {};
    const reason = this.reason().trim();
    if (!this.type()) e.type = tr('ACA.LEAVE_TYPE');
    if (!this.from()) e.from = tr('VALIDATION.DATE');
    else if (this.from() < this.today) e.from = tr('ACA.LEAVE_PAST');
    if (!this.to()) e.to = tr('VALIDATION.DATE');
    else if (this.from() && this.to() < this.from()) e.to = tr('ACA.LEAVE_DATES');
    if (reason.length < 5 || reason.length > 250) {
      e.reason = tr('ACA.LEAVE_REASON', { min: 5, max: 250 });
    }
    this.errors.set(e);
    return Object.values(e).every((v) => !v);
  }

  protected async send() {
    if (this.busy() || !this.check()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const out = await this.api.applyLeave({
        type: this.type() as StaffLeaveType,
        from: this.from(),
        to: this.to(),
        reason: this.reason().trim(),
      });
      this.saved.emit(out);
    } catch (e) {
      const fields = e instanceof ApiProblem ? e.errors : [];
      const placed = fields.filter((x) => FIELD_OF[x.field]);
      for (const x of placed) {
        this.errors.update((o) => ({ ...o, [FIELD_OF[x.field]!]: x.message }));
      }
      if (!placed.length) this.error.set(problemText(e));
    } finally {
      this.busy.set(false);
    }
  }
}

@Component({
  selector: 'rp-teaching-my-leave',
  imports: [Empty, Icon, Kpi, MyLeaveForm, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="c-page">
      <rp-page-head [title]="t('ui.web.nav.myLeave')" [sub]="t('ui.web.tch.my.leave.sub')">
        <button
          type="button"
          class="btn btn-pri"
          id="ml-new"
          [disabled]="!data()"
          (click)="applying.set(true)"
        >
          <rp-icon name="plus" [size]="17" /><span>{{ t('ui.web.tch.my.leave.new') }}</span>
        </button>
      </rp-page-head>

      @if (error()) {
        <div class="note tone-bad" role="alert" id="ml-error">
          <rp-icon name="alert" [size]="17" />
          <div class="grow">{{ error() }}</div>
          <button type="button" class="btn btn-sec btn-sm" (click)="load()">
            {{ t('ui.web.tch.retry') }}
          </button>
        </div>
      } @else if (loading() && !data()) {
        <div class="card pad">
          <div class="sk" style="height: 240px; border-radius: 16px"></div>
        </div>
      } @else if (data(); as d) {
        <div class="c-grid k3" id="ml-balances">
          @for (b of d.balances; track b.type) {
            <rp-kpi
              [label]="t('ui.web.tch.my.leave.t.' + b.type.toLowerCase())"
              [value]="t('ui.web.tch.my.leave.left', { n: b.left })"
              icon="leaveic"
              [tone]="b.left ? null : 'warn'"
              [delta]="
                t('ui.web.tch.my.leave.balanceSub', {
                  used: b.used,
                  pending: b.pending,
                  total: b.total,
                })
              "
            />
          }
        </div>
        <h2 class="t-h3">{{ t('ui.web.tch.my.leave.requests', { year: d.year.label }) }}</h2>
        @if (!d.items.length) {
          <rp-empty
            icon="leaveic"
            [title]="t('ui.web.tch.my.leave.empty')"
            [text]="t('ui.web.tch.my.leave.emptyText')"
          />
        } @else {
          <div class="stack g12" id="ml-list">
            @for (l of d.items; track l.id; let i = $index) {
              <div class="card pad stack g8" [id]="'ml-' + i">
                <div class="row g12 wrap">
                  <div class="grow" style="min-width: 0">
                    <b>{{ t('ui.web.tch.my.leave.t.' + l.type.toLowerCase()) }}</b>
                    <span class="t-muted"> · {{ dates(l) }}</span>
                    <span class="t-muted"> · {{ t('ui.web.tch.leave.days', { n: l.days }) }}</span>
                  </div>
                  <span class="chip dot" [class]="'tone-' + tone(l)">{{ stateLabel(l) }}</span>
                </div>
                <div>{{ l.reason }}</div>
                <div class="t-muted t-sm">
                  <span class="t-mono">{{ l.reference }}</span>
                  @if (l.appliedAt) {
                    · {{ t('ui.web.tch.my.leave.applied', { date: date(l.appliedAt) }) }}
                  }
                </div>
                @if (l.coordinator; as c) {
                  <div class="t-sm">
                    {{
                      t(
                        c.status === 'APPROVED'
                          ? 'ui.web.tch.my.leave.coordOk'
                          : 'ui.web.tch.my.leave.coordNo',
                        { name: c.by ?? '—' }
                      )
                    }}
                    @if (c.remarks) {
                      — {{ c.remarks }}
                    }
                  </div>
                }
                @if (l.final; as f) {
                  @if (f.status !== 'CANCELLED') {
                    <div class="t-sm">
                      {{
                        t(
                          f.status === 'APPROVED'
                            ? 'ui.web.tch.my.leave.finalOk'
                            : 'ui.web.tch.my.leave.finalNo',
                          { name: f.by ?? '—' }
                        )
                      }}
                      @if (f.remarks) {
                        — {{ f.remarks }}
                      }
                    </div>
                  }
                }
                @if (cancellable(l)) {
                  <div class="row g8" style="justify-content: flex-end">
                    <button
                      type="button"
                      class="btn btn-sec btn-sm"
                      [id]="'ml-cancel-' + i"
                      [disabled]="busy() === l.id"
                      (click)="cancel(l)"
                    >
                      <rp-icon name="x" [size]="15" /><span>{{
                        t('ui.web.tch.my.leave.cancel')
                      }}</span>
                    </button>
                  </div>
                }
              </div>
            }
          </div>
        }
      }
    </div>
    @if (applying()) {
      <rp-my-leave-form
        [reviewedBy]="data()?.reviewedBy ?? 'COORDINATOR_THEN_PRINCIPAL'"
        (closed)="applying.set(false)"
        (saved)="applied($event)"
      />
    }`,
})
export class TeachingMyLeave implements OnInit {
  private readonly api = inject(MeApi);
  private readonly overlays = inject(Overlays);
  protected readonly t = tr;
  protected readonly data = signal<MyLeaves | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal<string | null>(null);
  protected readonly applying = signal(false);

  constructor() {
    // A decision made elsewhere (coordinator, principal) shows without a reload.
    refreshWhileVisible(() => this.quietly(), REFRESH_MS);
  }

  ngOnInit() {
    void this.load();
  }

  /** The list again without the loading state; a failure stays quiet until the next check. */
  private async quietly() {
    if (this.loading() || this.busy()) return;
    try {
      this.data.set(await this.api.leaves());
      this.error.set('');
    } catch {
      // The page keeps what it shows.
    }
  }

  async load() {
    this.loading.set(true);
    try {
      this.data.set(await this.api.leaves());
      this.error.set('');
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected async applied(l: MyLeave) {
    this.applying.set(false);
    this.overlays.toast(tr('ui.web.tch.my.leave.sent'), {
      sub: `${l.reference} · ${this.dates(l)}`,
    });
    await this.load();
  }

  /** ACA-059: only while no one has reviewed it. */
  protected cancellable(l: MyLeave) {
    return l.state === 'PENDING' || (l.state === 'WITH_PRINCIPAL' && !l.needsCoordinator);
  }

  protected async cancel(l: MyLeave) {
    const ok = await this.overlays.confirm({
      title: tr('ui.web.tch.my.leave.cancelTitle'),
      text: tr('ui.web.tch.my.leave.cancelText', { dates: this.dates(l) }),
      ok: tr('ui.web.tch.my.leave.cancel'),
      tone: 'warn',
      icon: 'x',
    });
    if (!ok) return;
    this.busy.set(l.id);
    try {
      await this.api.cancelLeave(l.id);
      this.overlays.toast(tr('ui.web.tch.my.leave.cancelled'), { sub: l.reference });
    } catch (e) {
      this.overlays.toast(problemText(e), { tone: 'bad' });
    } finally {
      this.busy.set(null);
      await this.load();
    }
  }

  protected stateLabel(l: MyLeave) {
    return tr(`ui.web.tch.my.leave.s.${l.state.toLowerCase()}`);
  }
  protected tone(l: MyLeave) {
    switch (l.state) {
      case 'APPROVED':
        return 'ok';
      case 'REJECTED':
      case 'REJECTED_BY_COORDINATOR':
        return 'bad';
      case 'CANCELLED':
        return 'neutral';
      default:
        return 'warn';
    }
  }
  protected dates(l: MyLeave) {
    return l.from === l.to
      ? formatDate(l.from)
      : tr('ui.web.tch.leave.dates', { from: formatDate(l.from), to: formatDate(l.to) });
  }
  protected date(v: string) {
    return formatDate(v);
  }
}
