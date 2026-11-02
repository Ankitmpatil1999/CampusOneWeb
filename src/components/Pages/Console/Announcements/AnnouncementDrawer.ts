import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  type OnInit,
} from '@angular/core';
import { Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate, formatTime } from '../../../Utils/format';
import { person } from '../Applications/app-format';
import { plural } from '../Fees/fee-format';
import { num, problemText } from '../Structure/academic-format';
import {
  AnnouncementsApi,
  type Ack,
  type AckPage,
  type Announcement,
  type AnnouncementDetail,
  type Channel,
} from './announcements.api';
import { REASON, audience, channelOf, stateOf } from './announcement-format';

const ACK_PAGES = 10;

/**
 * Acknowledgements and reminders through other routes than the console's — the principal's
 * (COM-030, COM-031; client 2026-10-13), which have no detail or withdrawal.
 */
export interface AckSource {
  acknowledgements(id: string, q: { cursor?: string | null }): Promise<AckPage>;
  remind(id: string, channels: readonly Channel[]): Promise<{ reminded: number }>;
}

interface AckRow {
  readonly group: string;
  readonly of: number;
  readonly acked: number;
  readonly pct: number;
}

/**
 * An announcement (prototype cc.an.open; COM-003…006): its text, details and dispatch with the
 * outcome of each channel, acknowledgements by class with a reminder to those who haven't, and
 * withdrawing it with a recorded reason.
 */
@Component({
  selector: 'rp-announcement-drawer',
  imports: [Empty, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="a().title"
      [sub]="a().code + ' · ' + when(a().dispatch.at ?? a().sendAt)"
      icon="megaphone"
      [drawer]="true"
      [wide]="true"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="an-detail">
        <div class="row g8 wrap">
          <span class="cc-cat" [style.--c]="a().category.colour">{{ a().category.label }}</span>
          @if (a().important) {
            <span class="chip tone-bad dot">High importance</span>
          }
          @if (a().ackRequired) {
            <span class="chip tone-accent dot">Acknowledgement required</span>
          }
          @if (a().withdrawn) {
            <span class="chip tone-neutral dot">Withdrawn</span>
          }
          @if (a().source !== 'CONSOLE' && a().classSection) {
            <span class="tag"><rp-icon name="users" [size]="12" />{{ a().classSection }}</span>
          }
        </div>
        @if (a().withdrawn; as w) {
          <div class="note tone-warn">
            <rp-icon name="xc" [size]="17" />
            <div class="grow">
              <b>Withdrawn {{ when(w.at) }}.</b> {{ w.reason }} — members no longer see it in the
              app.
            </div>
          </div>
        }
        <div class="card pad">
          <p style="white-space: pre-wrap; line-height: 1.6; margin: 0">{{ a().text }}</p>
        </div>
        <div class="c-grid k2">
          <div class="fs">
            <h4><rp-icon name="info" [size]="15" />Details</h4>
            <div class="fs-b">
              <dl class="kv">
                <dt>Code</dt>
                <dd>
                  <span class="t-mono">{{ a().code }}</span>
                </dd>
                <dt>Groups</dt>
                <dd>{{ audience(a()) }}</dd>
                <dt>Channels</dt>
                <dd>{{ channelsText() }}</dd>
                <dt>Sent by</dt>
                <dd>{{ person(a().author) || 'The institution' }}</dd>
                <dt>{{ a().scheduled ? 'Sends' : 'Sent' }}</dt>
                <dd>{{ when(a().dispatch.at ?? a().sendAt) }}</dd>
              </dl>
            </div>
          </div>
          <div class="fs">
            <h4><rp-icon name="send" [size]="15" />Dispatch</h4>
            <div class="fs-b">
              <div class="stack g12" id="an-dispatch">
                <div class="row between">
                  <span class="chip dot" [class]="'chip dot tone-' + state().tone">{{
                    state().l
                  }}</span>
                  <span class="t-sm t-muted">{{
                    a().scheduled
                      ? 'Scheduled for ' + when(a().sendAt)
                      : plural(outcomes(), 'outcome')
                  }}</span>
                </div>
                <div class="cc-seg3">
                  <i class="s" [style.width.%]="share(a().dispatch.success)"></i
                  ><i class="f" [style.width.%]="share(a().dispatch.failed)"></i
                  ><i class="k" [style.width.%]="share(a().dispatch.skipped)"></i>
                </div>
                <div class="legend">
                  <span
                    ><i style="background: var(--ok)"></i>Sent
                    <b class="t-num" style="color: var(--ink)">{{
                      num(a().dispatch.success)
                    }}</b></span
                  ><span
                    ><i style="background: var(--bad)"></i>Failed
                    <b class="t-num" style="color: var(--ink)">{{
                      num(a().dispatch.failed)
                    }}</b></span
                  ><span
                    ><i style="background: var(--line-3)"></i>Skipped
                    <b class="t-num" style="color: var(--ink)">{{
                      num(a().dispatch.skipped)
                    }}</b></span
                  >
                </div>
                @for (c of detail()?.perChannel ?? []; track c.channel) {
                  <div class="row between t-sm">
                    <span class="row g6"
                      ><rp-icon [name]="channelOf(c.channel).icon" [size]="14" />{{
                        channelOf(c.channel).l
                      }}</span
                    ><span class="t-num t-muted"
                      >{{ num(c.success) }} · {{ num(c.failed) }} · {{ num(c.skipped) }}</span
                    >
                  </div>
                }
                @if (a().dispatch.reason) {
                  <div class="note tone-warn">
                    <rp-icon name="alert" [size]="17" />
                    <div class="grow">{{ a().dispatch.reason }}</div>
                  </div>
                }
              </div>
            </div>
          </div>
        </div>

        @if (a().ackRequired) {
          <div class="fs">
            <h4>
              <rp-icon name="hand" [size]="15" />Acknowledgements
              @if (a().acknowledgements; as k) {
                <span class="t-xs t-muted t-m" style="margin-left: 6px"
                  >{{ num(k.acknowledged) }} of {{ num(k.of) }}</span
                >
              }
            </h4>
            <div class="fs-b">
              @if (acksLoading()) {
                <div class="sk" style="height: 160px; border-radius: 12px" aria-busy="true"></div>
              } @else if (ackError()) {
                <rp-empty
                  icon="alertc"
                  title="Couldn't load the acknowledgements"
                  [text]="ackError()"
                />
              } @else if (ackRows().length) {
                <div class="tbl-wrap" style="max-height: 300px; overflow: auto">
                  <table class="tbl dense" id="an-acks">
                    <thead>
                      <tr>
                        <th>Class or group</th>
                        <th class="r">Recipients</th>
                        <th class="r">Acknowledged</th>
                        <th style="width: 40%"></th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (r of ackRows(); track r.group) {
                        <tr>
                          <td>
                            <b class="t-sb">{{ r.group }}</b>
                          </td>
                          <td class="r t-num">{{ num(r.of) }}</td>
                          <td class="r t-num">{{ num(r.acked) }}</td>
                          <td>
                            <div class="cc-pbar">
                              <span class="t-num">{{ r.pct }}%</span>
                              <div class="bar" [class.ok]="r.pct >= 80" [class.warn]="r.pct < 80">
                                <i [style.width.%]="r.pct"></i>
                              </div>
                            </div>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                <div class="row between wrap g8 mt8">
                  <span class="t-sm t-muted"
                    >{{
                      pending()
                        ? plural(pending(), 'recipient') + " haven't acknowledged yet."
                        : 'Everyone has acknowledged.'
                    }}
                    A student counts when they or a parent acknowledge.</span
                  >
                  @if (canSend() && !a().withdrawn) {
                    <button
                      type="button"
                      class="btn btn-sec btn-sm"
                      id="an-remind"
                      [class.is-busy]="busy() === 'remind'"
                      [disabled]="!pending() || !!busy() || a().dispatch.status !== 'COMPLETED'"
                      (click)="remind()"
                    >
                      <rp-icon name="bell" [size]="15" /><span>Remind {{ num(pending()) }}</span>
                    </button>
                  }
                </div>
              } @else {
                <p class="t-sm t-muted">
                  {{
                    a().scheduled
                      ? 'Acknowledgements start once it is sent.'
                      : 'No recipients to report yet.'
                  }}
                </p>
              }
            </div>
          </div>
        }
        @if (error()) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ error() }}</div>
          </div>
        }
      </div>
      <div modal-foot class="cc-foot">
        @if (canSend() && !a().withdrawn && !via()) {
          <button
            type="button"
            class="btn btn-danger-o"
            id="an-withdraw"
            [class.is-busy]="busy() === 'withdraw'"
            [disabled]="!!busy()"
            (click)="withdraw()"
          >
            <rp-icon name="xc" [size]="17" /><span>Withdraw</span>
          </button>
        }
        <span class="grow"></span>
        <button type="button" class="btn btn-sec" (click)="closed.emit()">
          <span>Close</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class AnnouncementDrawer implements OnInit {
  private readonly api = inject(AnnouncementsApi);
  private readonly overlays = inject(Overlays);

  readonly item = input.required<Announcement>();
  readonly canSend = input(false);
  readonly via = input<AckSource | null>(null);
  readonly closed = output<void>();
  readonly changed = output<Announcement>();

  protected readonly num = num;
  protected readonly plural = plural;
  protected readonly person = person;
  protected readonly audience = audience;
  protected readonly channelOf = channelOf;

  protected readonly detail = signal<AnnouncementDetail | null>(null);
  private readonly acks = signal<readonly Ack[]>([]);
  protected readonly acksLoading = signal(false);
  protected readonly ackError = signal('');
  protected readonly busy = signal<'' | 'remind' | 'withdraw'>('');
  protected readonly error = signal('');

  protected readonly a = computed<Announcement>(() => this.detail() ?? this.item());
  protected readonly state = computed(() => stateOf(this.a()));
  protected readonly outcomes = computed(() => {
    const d = this.a().dispatch;
    return d.success + d.failed + d.skipped;
  });
  protected readonly channelsText = computed(() =>
    this.a()
      .channels.map((c) => channelOf(c).l)
      .join(', '),
  );
  /** Acknowledgements by class (students) or by member type (parents, staff). */
  protected readonly ackRows = computed<AckRow[]>(() => {
    const by = new Map<string, { of: number; acked: number }>();
    for (const x of this.acks()) {
      const g = x.member.class ?? `${x.member.type}s`;
      const r = by.get(g) ?? { of: 0, acked: 0 };
      r.of += 1;
      if (x.acknowledgedAt) r.acked += 1;
      by.set(g, r);
    }
    return [...by]
      .map(([group, r]) => ({ group, ...r, pct: r.of ? Math.round((r.acked * 100) / r.of) : 0 }))
      .sort((x, y) => x.group.localeCompare(y.group, 'en', { numeric: true }));
  });
  protected readonly pending = computed(() => {
    const k = this.a().acknowledgements;
    return k ? Math.max(0, k.of - k.acknowledged) : 0;
  });

  ngOnInit() {
    void this.load();
  }

  private async load() {
    if (!this.via()) {
      try {
        this.detail.set(await this.api.get(this.item().id));
      } catch (e) {
        this.error.set(problemText(e));
      }
    }
    if (this.a().ackRequired && !this.a().scheduled) await this.loadAcks();
  }

  private async loadAcks() {
    this.acksLoading.set(true);
    const source: AckSource = this.via() ?? this.api;
    try {
      const all: Ack[] = [];
      let cursor: string | null = null;
      for (let i = 0; i < ACK_PAGES; i++) {
        const p: AckPage = await source.acknowledgements(this.item().id, { cursor });
        all.push(...p.items);
        cursor = p.nextCursor;
        if (!cursor) break;
      }
      this.acks.set(all);
      this.ackError.set('');
    } catch (e) {
      this.ackError.set(problemText(e));
    } finally {
      this.acksLoading.set(false);
    }
  }

  protected when(iso: string) {
    return `${formatDate(iso)}, ${formatTime(iso)}`;
  }
  protected share(n: number) {
    const t = this.outcomes();
    return t ? (n * 100) / t : 0;
  }

  /** cc.an.remind: a reminder to those who haven't acknowledged, on the announcement's channels. */
  protected async remind() {
    const n = this.pending();
    const ok = await this.overlays.confirm({
      title: `Remind ${plural(n, 'recipient')}?`,
      icon: 'bell',
      text: 'They get a reminder to read and acknowledge the announcement.',
      ok: 'Send reminder',
    });
    if (!ok) return;
    this.busy.set('remind');
    try {
      const channels: readonly Channel[] = this.a().channels.includes('IN_APP')
        ? ['IN_APP']
        : this.a().channels;
      const r = await (this.via() ?? this.api).remind(this.a().id, channels);
      this.overlays.toast('Reminder sent', { sub: plural(r.reminded ?? n, 'recipient') });
    } catch (e) {
      this.overlays.toast("Couldn't send the reminder", { sub: problemText(e), tone: 'bad' });
    } finally {
      this.busy.set('');
    }
  }

  protected async withdraw() {
    const ok = await this.overlays.confirm({
      title: 'Withdraw this announcement?',
      icon: 'xc',
      tone: 'bad',
      text: 'Members stop seeing it in the app. It stays on record with your reason.',
      ok: 'Withdraw',
      reason: {
        label: 'Reason',
        placeholder: 'e.g. Sent to the wrong group',
        min: REASON.min,
        max: REASON.max,
      },
    });
    if (!ok) return;
    this.busy.set('withdraw');
    this.error.set('');
    try {
      const d = await this.api.withdraw(this.a(), ok.reason ?? '');
      this.detail.set(d);
      this.overlays.toast('Announcement withdrawn', { sub: d.code });
      this.changed.emit(d);
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.busy.set('');
    }
  }
}
