/**
 * Teacher and staff leave for the principal on the web (client 2026-10-13; the app's approvals,
 * ACA-061 and ACA-062): what waits for the principal's decision — after the coordinator's
 * recommendation where one is needed — what is still with the coordinator, and what is decided. Each
 * request shows the person's balance and who else is away on those days; approving takes an optional
 * remark, rejecting a reason.
 */
import {
  ChangeDetectionStrategy,
  Component,
  type OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { formatDate } from '../../../Utils/format';
import { person } from '../Applications/app-format';
import { coordinatorLabel, dt, stateChip } from '../Leave/leave-format';
import { problemText } from '../Structure/academic-format';
import { PrincipalApi, type LeaveQueue, type StaffLeave, type StaffLeaves } from './principal.api';

const TABS: readonly { v: LeaveQueue; l: string }[] = [
  { v: 'AWAITING', l: 'Awaiting you' },
  { v: 'COORDINATOR', l: 'With the coordinator' },
  { v: 'DECIDED', l: 'Decided' },
];

@Component({
  selector: 'rp-principal-leave',
  imports: [Empty, Icon, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="c-page">
    <rp-page-head
      title="Teacher leave"
      [sub]="
        'Leave of teachers and staff' +
        (data() ? ' in ' + data()!.year.label : '') +
        '. You decide after the coordinator recommends.'
      "
    >
      <button type="button" class="btn btn-sec" [disabled]="loading()" (click)="load()">
        <rp-icon name="refresh" [size]="17" /><span>Refresh</span>
      </button>
    </rp-page-head>

    <div class="tabs" role="tablist" aria-label="Leave requests">
      @for (x of tabs; track x.v) {
        <button
          type="button"
          class="tab"
          role="tab"
          [id]="'pl-tab-' + x.v.toLowerCase()"
          [class.on]="tab() === x.v"
          [attr.aria-selected]="tab() === x.v"
          (click)="pick(x.v)"
        >
          {{ x.l }}
          @if (count(x.v)) {
            <span class="n">{{ count(x.v) }}</span>
          }
        </button>
      }
    </div>

    @if (error()) {
      <div class="note tone-bad" role="alert" id="pl-error">
        <rp-icon name="alert" [size]="17" />
        <div class="grow">{{ error() }}</div>
        <button type="button" class="btn btn-sec btn-sm" (click)="load()">Try again</button>
      </div>
    } @else if (loading() && !data()) {
      <div class="card pad"><div class="sk" style="height: 220px; border-radius: 16px"></div></div>
    } @else if (data(); as d) {
      @if (!d.items.length) {
        <rp-empty
          icon="plane"
          [title]="emptyTitle()"
          text="Requests appear here as teachers and staff apply in the app or on the web."
        />
      } @else {
        <div class="stack g12" id="pl-list">
          @for (l of d.items; track l.id; let i = $index) {
            <div class="card pad stack g8" [id]="'pl-' + i">
              <div class="row g12 wrap">
                <div class="grow" style="min-width: 0">
                  <b>{{ person(l.staff.name) }}</b>
                  <span class="t-muted"> · {{ l.staff.type }}</span>
                </div>
                <span class="chip dot" [class]="'chip dot tone-' + chip(l).tone">{{
                  chip(l).l
                }}</span>
              </div>
              <div>
                <b>{{ l.typeLabel }}</b>
                <span class="t-muted">
                  · {{ dates(l) }} · {{ l.days }} day{{ l.days === 1 ? '' : 's' }}</span
                >
              </div>
              <div>{{ l.reason }}</div>
              <div class="t-sm t-muted">
                <span class="t-mono">{{ l.reference }}</span>
                · applied {{ dt(l.appliedAt) }} · {{ l.balance.left }} of {{ l.balance.total }}
                {{ l.typeLabel.toLowerCase() }} days left
              </div>
              @if (l.coordinator; as c) {
                <div class="t-sm">
                  {{ coordinatorLabel(c.status === 'APPROVED' ? 'APPROVED' : 'REJECTED') }}
                  by {{ person(c.by ?? '') || 'the coordinator' }}
                  @if (c.remarks) {
                    — “{{ c.remarks }}”
                  }
                </div>
              }
              @if (l.final; as f) {
                @if (f.status !== 'CANCELLED') {
                  <div class="t-sm">
                    {{ f.status === 'APPROVED' ? 'Approved' : 'Rejected' }} by
                    {{ person(f.by ?? '') || 'the principal' }} · {{ dt(f.at) }}
                    @if (f.remarks) {
                      — “{{ f.remarks }}”
                    }
                  </div>
                }
              }
              @if (l.alsoAway.length) {
                <div class="note tone-warn">
                  <rp-icon name="users" [size]="17" />
                  <div class="grow">Also away on some of these days: {{ away(l) }}</div>
                </div>
              }
              @if (tab() === 'AWAITING' && can('principal.leave')) {
                <div class="row g8" style="justify-content: flex-end">
                  <button
                    type="button"
                    class="btn btn-danger-o btn-sm"
                    [id]="'pl-reject-' + i"
                    [disabled]="busy() === l.id"
                    (click)="decide(l, 'REJECTED')"
                  >
                    <rp-icon name="x" [size]="15" /><span>Reject</span>
                  </button>
                  <button
                    type="button"
                    class="btn btn-pri btn-sm"
                    [id]="'pl-approve-' + i"
                    [class.is-busy]="busy() === l.id"
                    [disabled]="busy() === l.id"
                    (click)="decide(l, 'APPROVED')"
                  >
                    <rp-icon name="check" [size]="15" /><span>Approve</span>
                  </button>
                </div>
              }
            </div>
          }
        </div>
      }
    }
  </div>`,
})
export class PrincipalLeave implements OnInit {
  private readonly api = inject(PrincipalApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).console;
  protected readonly tabs = TABS;
  protected readonly person = person;
  protected readonly dt = dt;
  protected readonly coordinatorLabel = coordinatorLabel;
  protected readonly tab = signal<LeaveQueue>('AWAITING');
  protected readonly data = signal<StaffLeaves | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly busy = signal<string | null>(null);
  private seq = 0;

  protected readonly emptyTitle = computed(() =>
    this.tab() === 'AWAITING'
      ? 'Nothing waits for your decision'
      : this.tab() === 'COORDINATOR'
        ? 'Nothing is with the coordinator'
        : 'No decided requests this year',
  );

  ngOnInit() {
    void this.load();
  }

  protected pick(t: LeaveQueue) {
    if (t === this.tab()) return;
    this.tab.set(t);
    void this.load();
  }

  async load() {
    const id = ++this.seq;
    this.loading.set(true);
    try {
      const d = await this.api.leaves(this.tab());
      if (id !== this.seq) return;
      this.data.set(d);
      this.error.set('');
    } catch (e) {
      if (id === this.seq) this.error.set(problemText(e));
    } finally {
      if (id === this.seq) this.loading.set(false);
    }
  }

  protected count(t: LeaveQueue) {
    const c = this.data()?.counts;
    if (!c) return 0;
    return t === 'AWAITING' ? c.awaiting : t === 'COORDINATOR' ? c.coordinator : 0;
  }

  protected chip(l: StaffLeave) {
    return l.state === 'WITH_PRINCIPAL' ? { l: 'Awaiting you', tone: 'warn' } : stateChip(l.state);
  }

  protected dates(l: StaffLeave) {
    return l.from === l.to ? formatDate(l.from) : `${formatDate(l.from)} to ${formatDate(l.to)}`;
  }

  protected away(l: StaffLeave) {
    return l.alsoAway.map((n) => person(n)).join(', ');
  }

  protected can(sub: string) {
    return this.session()?.subTasks.includes(sub) ?? false;
  }

  /** ACA-062: an optional remark when approving; a reason (5–400 characters) when rejecting. */
  protected async decide(l: StaffLeave, decision: 'APPROVED' | 'REJECTED') {
    const name = person(l.staff.name);
    const approve = decision === 'APPROVED';
    const ok = await this.overlays.confirm({
      title: approve ? `Approve ${name}'s leave?` : `Reject ${name}'s leave?`,
      text: `${l.typeLabel} · ${this.dates(l)} · ${l.days} day${l.days === 1 ? '' : 's'}. ${name.split(' ')[0]} is told straight away.`,
      ok: approve ? 'Approve' : 'Reject',
      tone: approve ? 'brand' : 'bad',
      icon: approve ? 'check' : 'x',
      reason: approve
        ? {
            label: 'Remarks (optional)',
            placeholder: 'e.g. Arrange a substitute',
            max: 400,
            required: false,
          }
        : { label: 'Reason', placeholder: 'Why the leave is not approved', min: 5, max: 400 },
    });
    if (!ok) return;
    this.busy.set(l.id);
    try {
      await this.api.decide(l.id, decision, ok.reason?.trim() || null);
      this.overlays.toast(approve ? 'Leave approved' : 'Leave rejected', {
        sub: `${name} · ${this.dates(l)}`,
      });
    } catch (e) {
      this.overlays.toast(problemText(e), { tone: 'bad' });
    } finally {
      this.busy.set(null);
      await this.load();
    }
  }
}
