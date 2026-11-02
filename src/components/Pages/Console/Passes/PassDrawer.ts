import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDateTime } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { shortId } from '../Coupons/coupon-format';
import { PASS_TONE, isLive, longDay, passState } from './pass-format';
import { PassesApi, type EntryPass } from './passes.api';

/**
 * The pass drawer (prototype cm.ps.open; SRS 9.8–9.9, OQ-18; PAY-028): status, purpose and
 * description; the holder, the day, the scans, transfer and creation; the comments; and the scans
 * so far. A live pass (active or authorised) can be cancelled with a reason. The pass's QR is
 * generated only on the holder's registered phone when they authorise it.
 */
@Component({
  selector: 'rp-pass-drawer',
  imports: [Empty, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="'Pass ' + short()"
      [sub]="p().type.label + ' · ' + p().holder.name"
      icon="door"
      [drawer]="true"
      [slim]="true"
      cls="cm-m"
      [foot]="cancellable()"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="cm-dr">
        @let x = p();
        <div class="stack g16">
          <div class="cm-evhead">
            <div class="grow stack g8">
              <span [class]="'chip dot lg tone-' + tone()" style="align-self: flex-start">{{
                state()
              }}</span>
              <div class="t-h3">{{ x.purpose }}</div>
              <p class="t-sm t-muted">{{ x.description }}</p>
            </div>
            <div class="cm-evqr">
              <div class="cm-qr-ph" style="width: 112px; height: 112px">
                <rp-icon name="qr" [size]="44" />
              </div>
              <small>Shown only on the registered device</small>
            </div>
          </div>
          <dl class="kv">
            <dt>Holder</dt>
            <dd>
              {{ x.holder.name }}{{ x.holder.admissionNo ? ' · ' + x.holder.admissionNo : '' }}
            </dd>
            <dt>Valid on</dt>
            <dd>{{ day(x.validOn) }}</dd>
            <dt>Scans</dt>
            <dd>{{ x.usedScans }} of {{ x.maxScans }}</dd>
            <dt>Transfer to another holder</dt>
            <dd>
              {{
                x.transferAllowed
                  ? 'Allowed (the transfer action is still to be defined — OQ-18)'
                  : 'Not allowed'
              }}
            </dd>
            <dt>Created</dt>
            <dd>{{ dt(x.createdAt) }}</dd>
            @if (state() === 'Authorised' && x.authorisedUntil) {
              <dt>Authorised until</dt>
              <dd>{{ dt(x.authorisedUntil) }}</dd>
            }
            @if (x.cancelReason) {
              <dt>Cancelled because</dt>
              <dd>{{ x.cancelReason }}</dd>
            }
          </dl>
          @if (x.comments) {
            <div class="note tone-info">
              <rp-icon name="info" [size]="17" />
              <div class="grow">{{ x.comments }}</div>
            </div>
          }
          <div class="sec-h"><h3>Scans</h3></div>
          @if (x.usedScans) {
            <div class="note tone-neutral">
              <rp-icon name="scan" [size]="17" />
              <div class="grow">
                {{ x.usedScans }} of {{ x.maxScans }} scan{{ x.maxScans === 1 ? '' : 's' }} used.
                Each scan is recorded with the staff member who checked it.
              </div>
            </div>
          } @else {
            <rp-empty
              icon="scan"
              title="Not scanned yet"
              text="The holder authorises the pass on its day, then any active staff member scans it within the window."
            />
          }
          @if (error()) {
            <div class="note tone-bad" role="alert">
              <rp-icon name="alertc" [size]="17" />
              <div class="grow">{{ error() }}</div>
            </div>
          }
        </div>
      </div>
      <div modal-foot class="row g8" style="width: 100%">
        <span class="grow"></span>
        @if (cancellable()) {
          <button
            type="button"
            class="btn btn-danger-o"
            id="ps-cancel"
            [class.is-busy]="busy()"
            [disabled]="busy()"
            (click)="cancel()"
          >
            <rp-icon name="x" [size]="17" /><span>Cancel pass</span>
          </button>
        }
      </div>
    </rp-modal>
  `,
})
export class PassDrawer {
  private readonly api = inject(PassesApi);
  private readonly overlays = inject(Overlays);

  readonly pass = input.required<EntryPass>();
  /** Whether the session may cancel passes (passes.edit, not read-only). */
  readonly canEdit = input(false);
  readonly closed = output<void>();
  readonly changed = output<EntryPass>();

  private readonly saved = signal<EntryPass | null>(null);
  protected readonly p = computed(() => {
    const s = this.saved();
    return s && s.id === this.pass().id ? s : this.pass();
  });
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly state = computed(() => passState(this.p()));
  protected readonly tone = computed(() => PASS_TONE[this.state()]);
  protected readonly short = computed(() => shortId(this.p().id));
  protected readonly cancellable = computed(() => this.canEdit() && isLive(this.p()));

  protected async cancel() {
    const x = this.p();
    const r = await this.overlays.confirm({
      title: 'Cancel this pass?',
      text: `${x.holder.name}'s ${x.type.label.toLowerCase()} pass for ${longDay(x.validOn)} stops working straight away.`,
      ok: 'Cancel pass',
      cancel: 'Keep it',
      tone: 'bad',
      icon: 'x',
      reason: { label: 'Reason', min: 5, max: 200 },
    });
    if (!r) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const out = await this.api.cancel(x.id, r.reason ?? '');
      this.saved.set(out);
      this.changed.emit(out);
      this.overlays.toast('Pass cancelled', { sub: `${shortId(out.id)} · ${out.holder.name}` });
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      this.busy.set(false);
    }
  }

  protected day(d: string) {
    return longDay(d);
  }
  protected dt(v: string) {
    return formatDateTime(v);
  }
}
