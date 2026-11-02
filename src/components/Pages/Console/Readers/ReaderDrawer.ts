import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate, formatDateTime } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { HEALTH, boundLabel, boundTo, healthOf, purposeOf } from './reader-format';
import { ReadersApi, type Terminal } from './readers.api';

/**
 * The reader drawer (prototype readerDrawer; INS-030, INS-034): status, purpose and binding,
 * location, the paired device and when it was last seen, then the footer's disable / enable, a
 * pairing code and "Rename or move". Captures arrive with attendance (Phase 7); the name history
 * is kept by the server (terminal_changes) but no console call returns it yet.
 */
@Component({
  selector: 'rp-reader-drawer',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="t().name"
      [sub]="sub()"
      [icon]="purpose().icon"
      [drawer]="true"
      [slim]="true"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16">
        @if (readOnly()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow"><b>Read-only.</b> {{ readOnly() }}</div>
          </div>
        }
        <dl class="kv">
          <dt>Status</dt>
          <dd>
            <span [class]="'chip tone-' + health().tone + (health().icon ? '' : ' dot')">
              @if (health().icon) {
                <rp-icon [name]="health().icon!" [size]="12" />
              }
              {{ health().l() }}</span
            >
          </dd>
          <dt>Purpose</dt>
          <dd>{{ purpose().l }}</dd>
          @if (bound()) {
            <dt>{{ boundLabel() }}</dt>
            <dd>{{ bound() }}</dd>
          }
          <dt>Location</dt>
          <dd>
            @if (t().location) {
              {{ t().location }}
            } @else {
              <span class="t-faint">—</span>
            }
          </dd>
          <dt>Device fingerprint</dt>
          <dd>
            @if (t().device) {
              <span class="t-mono">{{ t().device }}</span>
              @if (!why() && t().status === 'ACTIVE') {
                <button
                  type="button"
                  class="linkbtn cp-lk"
                  id="rd-repair"
                  style="margin-left: 8px"
                  [disabled]="busy()"
                  (click)="pair.emit(t())"
                >
                  Pair another device
                </button>
              }
            } @else {
              Not paired
            }
          </dd>
          <dt>Paired since</dt>
          <dd>
            @if (t().pairedAt) {
              {{ date(t().pairedAt!) }}
            } @else {
              <span class="t-faint">—</span>
            }
          </dd>
          <dt>Last seen</dt>
          <dd>
            @if (t().lastSeenAt) {
              {{ dateTime(t().lastSeenAt!) }}
            } @else {
              <span class="t-faint">—</span>
            }
          </dd>
        </dl>

        @switch (state()) {
          @case ('DISABLED') {
            <div class="note tone-neutral">
              <rp-icon name="power" [size]="17" />
              <div class="grow">
                This reader is disabled{{ t().statusReason ? ' — ' + t().statusReason : '' }}. Taps
                on it are refused. Enabling it issues a new pairing code, so the device must pair
                again.
              </div>
            </div>
          }
          @case ('OFFLINE') {
            <div class="note tone-warn">
              <rp-icon name="wifioff" [size]="17" />
              <div class="grow">
                @if (t().lastSeenAt) {
                  Offline since {{ dateTime(t().lastSeenAt!) }}.
                } @else {
                  Not seen since it was paired.
                }
                Taps are queued on the device and sent when it reconnects.
              </div>
            </div>
          }
          @case ('UNPAIRED') {
            <div class="note tone-warn">
              <rp-icon name="hourglass" [size]="17" />
              <div class="grow">
                No device is paired yet. Get a pairing code and enter it on the
                {{ t().purpose === 'POS' ? 'counter' : 'reader' }} within its time limit.
              </div>
              @if (!why()) {
                <button
                  type="button"
                  class="btn btn-sec btn-sm"
                  id="rd-code"
                  [disabled]="busy()"
                  (click)="pair.emit(t())"
                >
                  <rp-icon name="key" [size]="15" /><span>Get pairing code</span>
                </button>
              }
            </div>
          }
        }

        <div>
          <div class="sec-h"><h3>Recent captures</h3></div>
          <p class="t-sm t-muted">
            Taps on this reader are listed here once attendance capture arrives (Phase 7). Captures
            keep the name in force when they were taken (OI-IDN-45).
          </p>
        </div>
        @if (error()) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ error() }}</div>
          </div>
        }
      </div>
      <div modal-foot class="row g8">
        <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="closed.emit()">
          <span>Close</span>
        </button>
        @if (t().status === 'DISABLED') {
          <span class="cp-why" [attr.title]="why() || null"
            ><button
              type="button"
              class="btn btn-pri"
              id="rd-on"
              [disabled]="!!why() || busy()"
              (click)="enable()"
            >
              <rp-icon name="power" [size]="17" /><span>Enable</span>
            </button></span
          >
        } @else {
          <span class="cp-why" [attr.title]="why() || null"
            ><button
              type="button"
              class="btn btn-danger-o"
              id="rd-off"
              [disabled]="!!why() || busy()"
              (click)="disable()"
            >
              <rp-icon name="power" [size]="17" /><span>Disable</span>
            </button></span
          >
          <span class="cp-why" [attr.title]="why() || null"
            ><button
              type="button"
              class="btn btn-pri"
              id="rd-edit"
              [disabled]="!!why() || busy()"
              (click)="edit.emit(t())"
            >
              <rp-icon name="edit" [size]="17" /><span>Rename or move</span>
            </button></span
          >
        }
      </div>
    </rp-modal>
  `,
})
export class ReaderDrawer {
  private readonly api = inject(ReadersApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).console;

  readonly terminal = input.required<Terminal>();
  readonly closed = output<void>();
  readonly edit = output<Terminal>();
  /** Get a (new) pairing code for this terminal. */
  readonly pair = output<Terminal>();
  readonly changed = output<Terminal>();

  private readonly saved = signal<Terminal | null>(null);
  protected readonly t = computed(() => {
    const s = this.saved();
    return s && s.id === this.terminal().id && s.version >= this.terminal().version
      ? s
      : this.terminal();
  });
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly purpose = computed(() => purposeOf(this.t().purpose));
  protected readonly state = computed(() => healthOf(this.t()));
  protected readonly health = computed(() => HEALTH[this.state()]);
  protected readonly bound = computed(() => boundTo(this.t()));
  protected readonly boundLabel = computed(() => boundLabel(this.t().purpose));
  protected readonly sub = computed(() =>
    [this.purpose().l, this.t().location].filter(Boolean).join(' · '),
  );
  protected readonly readOnly = computed(() =>
    this.session()?.roles.some((r) => r.readOnly)
      ? 'Management has read-only access. The administrator makes changes here.'
      : '',
  );
  protected readonly why = computed(
    () =>
      this.readOnly() ||
      (this.session()?.subTasks.includes('readers.edit')
        ? ''
        : "Your role doesn't include this task."),
  );

  protected async disable() {
    const t = this.t();
    const r = await this.overlays.confirm({
      title: `Disable ${t.name}?`,
      text: 'Taps on this reader are refused from now on and its device must pair again. Its history and captures are kept.',
      ok: 'Disable reader',
      tone: 'warn',
      icon: 'power',
      reason: {
        label: 'Reason',
        placeholder: 'e.g. Reader replaced after water damage',
        min: 5,
        max: 300,
      },
    });
    if (!r) return;
    const out = await this.call({ enabled: false, reason: r.reason ?? '' });
    if (out) this.overlays.toast('Reader disabled', { sub: out.name });
  }

  protected async enable() {
    const t = this.t();
    const r = await this.overlays.confirm({
      title: `Enable ${t.name}?`,
      text: 'A new pairing code is issued; the device has to pair again before it accepts taps.',
      ok: 'Enable and get code',
      icon: 'power',
    });
    if (!r) return;
    const out = await this.call({ enabled: true });
    if (out) this.pair.emit(out);
  }

  private async call(body: { enabled: boolean; reason?: string }) {
    this.busy.set(true);
    this.error.set('');
    try {
      const out = await this.api.status(this.t().id, body);
      this.saved.set(out);
      this.changed.emit(out);
      return out;
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
      return null;
    } finally {
      this.busy.set(false);
    }
  }

  protected date(v: string) {
    return formatDate(v);
  }
  protected dateTime(v: string) {
    return formatDateTime(v);
  }
}
