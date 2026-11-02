import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Countdown } from '../../../Shared/Countdown';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal } from '../../../Shared/Overlays';
import { formatTime } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { REISSUE_REASONS, type Holder, firstName, maskToken } from './card-format';
import { CardsApi, type CardReissued, type ReissueReason } from './cards.api';
import {
  cardReader,
  ensureCardReader,
  readCardUid,
  readerProblem,
  writeCardToken,
} from '../../../Utils/card-reader';
import { newIdempotencyKey } from '../../../Utils/ids';

/**
 * Re-issue a card (prototype cp.card.re / cp.card.re2; ATT-007): the reason, then the server makes
 * the current card inactive (its token stays on record) and authorises the card-issue reader to
 * write the member's new card for att.cardWrite.minutes. The modal then shows that window and the
 * steps on the reader; the new card appears in the register once it's written. With CampusOne Card
 * Reader running (client 2026-10-08) "Write card" writes it here on the USB reader instead (ATT-027).
 */
@Component({
  selector: 'rp-card-reissue',
  imports: [Countdown, Dropdown, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="title()"
      [sub]="sub()"
      icon="refresh"
      [narrow]="false"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      @if (done(); as d) {
        <div class="stack g16">
          <div class="cp-pair" id="cr-done">
            <span class="eyebrow">New card authorised</span>
            <div class="cp-pcode t-mono">{{ d.pairingForWrite.code }}</div>
            @if (left() > 0) {
              <div class="row g12">
                <rp-countdown [total]="total()" [left]="left()" [size]="48" [stroke]="3" />
                <span class="t-sm t-muted" style="text-align: left"
                  >The card-issue reader can write {{ first() }}'s new card until
                  {{ until() }}.</span
                >
              </div>
            } @else {
              <span class="t-sm t-muted"
                >The time to write the card has run out. Re-issue the card again.</span
              >
            }
          </div>
          @if (reader()) {
            <ol class="cp-ol">
              <li>Place a blank CampusOne card on the reader connected to this computer.</li>
              <li>
                Choose <b>Write card</b> and keep the card still until it's written and checked.
              </li>
              <li>
                The new card works straight away. {{ token() }} stays inactive and its token is kept
                on record.
              </li>
            </ol>
            @if (written()) {
              <div class="note tone-ok" role="status" id="cr-written">
                <rp-icon name="checkc" [size]="17" />
                <div class="grow">{{ first() }}'s new card is written and checked.</div>
              </div>
            } @else if (writeError()) {
              <div class="note tone-bad" role="alert">
                <rp-icon name="alertc" [size]="17" />
                <div class="grow">{{ writeError() }}</div>
              </div>
            }
          } @else {
            <ol class="cp-ol">
              <li>
                On the card-issue reader{{ writers() ? ' (' + writers() + ')' : '' }}, find
                <b>{{ holder().name }}</b
                >.
              </li>
              <li>Place a blank CampusOne card on it and keep it still until it's verified.</li>
              <li>
                The new card works straight away. {{ token() }} stays inactive and its token is kept
                on record.
              </li>
            </ol>
            <p class="t-sm t-muted">
              Card reader on this computer? Choose <b>Write card</b>: CampusOne Card Reader opens by
              itself and the new card is written here.
            </p>
            @if (writeError()) {
              <div class="note tone-bad" role="alert">
                <rp-icon name="alertc" [size]="17" />
                <div class="grow">{{ writeError() }}</div>
              </div>
            }
          }
        </div>
      } @else {
        <div class="stack g16">
          <div class="fld" [class.invalid]="reasonErr()">
            <label class="fld-l" for="cr-why-b">Reason<span class="req">*</span></label>
            <rp-dd
              inputId="cr-why"
              placeholder="Choose a reason"
              [options]="reasons"
              [value]="reason()"
              (changed)="pick($event)"
            />
            <div class="fld-e" id="cr-why-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ reasonErr() }}</span>
            </div>
          </div>
          <div class="note tone-info">
            <rp-icon name="info" [size]="17" />
            <div class="grow">
              The current card is made inactive and its token kept on record. A new token is then
              written to a blank card on the card-issue reader, and the re-issue count goes up by
              one.
            </div>
          </div>
          @if (error()) {
            <div class="note tone-bad" role="alert">
              <rp-icon name="alertc" [size]="17" />
              <div class="grow">{{ error() }}</div>
            </div>
          }
        </div>
      }
      <div modal-foot class="row g8">
        @if (done()) {
          @if (!written() && left() > 0) {
            <button
              type="button"
              class="btn btn-sec"
              id="cr-write"
              [class.is-busy]="writing()"
              [disabled]="writing()"
              (click)="write()"
            >
              <rp-icon name="nfc" [size]="17" /><span>Write card</span>
            </button>
          }
          <button type="button" class="btn btn-pri" id="cr-close" (click)="closed.emit()">
            <span>Done</span>
          </button>
        } @else {
          <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="closed.emit()">
            <span>Cancel</span>
          </button>
          <button type="button" class="btn btn-pri" id="cr-go" [disabled]="busy()" (click)="go()">
            <rp-icon name="nfc" [size]="17" /><span>Authorise the new card</span>
          </button>
        }
      </div>
    </rp-modal>
  `,
})
export class CardReissue {
  private readonly api = inject(CardsApi);

  readonly holder = input.required<Holder>();
  /** The card-issue readers' names, for the steps ("Card desk"); '' when unknown. */
  readonly writers = input('');
  readonly closed = output<void>();
  readonly reissued = output<{ holder: Holder; code: CardReissued }>();

  protected readonly reasons: readonly DropdownOption[] = REISSUE_REASONS;
  protected readonly reason = signal<ReissueReason | ''>('');
  protected readonly reasonErr = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly done = signal<CardReissued | null>(null);
  /** CampusOne Card Reader is running on this computer (client 2026-10-08). */
  protected readonly reader = cardReader();
  protected readonly writing = signal(false);
  protected readonly written = signal(false);
  protected readonly writeError = signal('');
  private pendingToken = '';
  private readonly issueKey = newIdempotencyKey();

  protected async write() {
    if (this.writing()) return;
    this.writing.set(true);
    this.writeError.set('');
    try {
      // The action opens CampusOne Card Reader when it isn't running (client 2026-10-08).
      if (!(await ensureCardReader())) {
        this.writeError.set(
          "CampusOne Card Reader didn't start. Install it on this computer, or allow the browser to open it, then try again.",
        );
        return;
      }
      if (!this.pendingToken) {
        const uid = await readCardUid();
        this.pendingToken = (
          await this.api.issue(this.holder().memberId, uid, this.issueKey)
        ).cardToken;
      }
      await writeCardToken(this.pendingToken);
      this.pendingToken = '';
      this.written.set(true);
    } catch (e) {
      this.writeError.set(
        e instanceof ApiProblem
          ? e.detail
          : this.pendingToken
            ? `The card wasn't written: ${readerProblem(e)} Keep the same card on the reader and try again.`
            : readerProblem(e),
      );
    } finally {
      this.writing.set(false);
    }
  }
  private readonly at = signal(Date.now());
  private readonly now = signal(Date.now());

  protected readonly first = computed(() => firstName(this.holder().name));
  protected readonly title = computed(() => `Re-issue ${this.first()}'s card`);
  protected readonly token = computed(() => maskToken(this.holder().current.token));
  protected readonly sub = computed(() => {
    const n = this.holder().current.reissueCount;
    return `Current card ${this.token()} · re-issued ${n} time${n === 1 ? '' : 's'}`;
  });
  protected readonly total = computed(() => {
    const d = this.done();
    return d
      ? Math.max(1, (new Date(d.pairingForWrite.expiresAt).getTime() - this.at()) / 1000)
      : 1;
  });
  protected readonly left = computed(() => {
    const d = this.done();
    return d
      ? Math.max(
          0,
          Math.round((new Date(d.pairingForWrite.expiresAt).getTime() - this.now()) / 1000),
        )
      : 0;
  });
  protected readonly until = computed(() => {
    const d = this.done();
    return d ? formatTime(d.pairingForWrite.expiresAt) : '';
  });

  constructor() {
    const t = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(t));
  }

  protected pick(v: string) {
    this.reason.set(v as ReissueReason);
    this.reasonErr.set('');
  }

  protected async go() {
    const r = this.reason();
    if (!r) {
      this.reasonErr.set('Choose why the card is being re-issued');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const out = await this.api.reissue(this.holder().current.id, r);
      this.at.set(Date.now());
      this.now.set(Date.now());
      this.done.set(out);
      this.reissued.emit({ holder: this.holder(), code: out });
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      this.busy.set(false);
    }
  }
}
