import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type OnInit,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Avatar } from '../../../Shared/Avatar';
import { Icon } from '../../../Shared/Icon';
import { Modal } from '../../../Shared/Overlays';
import { titleCase } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import type { MemberRow } from '../Members/members.api';
import { CardFace } from './CardFace';
import { CARD_STATUS, type Holder, detailOf, eligible, faceLine, maskToken } from './card-format';
import { CardsApi, type Card } from './cards.api';
import {
  cardReader,
  ensureCardReader,
  readCardUid,
  readerProblem,
  writeCardToken,
} from '../../../Utils/card-reader';
import { newIdempotencyKey } from '../../../Utils/ids';

/**
 * Issue a card (prototype issueDrawer / pickIssue; ATT-004, ATT-005, ATT-027): find the member, see
 * whether they already hold a card, then write a blank card.
 * - With CampusOne Card Reader running (client 2026-10-08) the console writes it on the USB reader: the
 *   card's serial number is read, the card is issued (ATT-027), its token is written and read back.
 *   When the write fails after the card was issued, "Write card" retries the write only.
 * - In a browser the card is written on the card-issue reader (ATT-004); "Verify the written card"
 *   looks the member's card up (ATT-005) and closes the drawer once it is there.
 */
@Component({
  selector: 'rp-card-issue',
  imports: [Avatar, CardFace, Icon, Modal, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      title="Issue an NFC card"
      [sub]="
        reader()
          ? 'Find the member, place a blank card on the reader and write it.'
          : 'Find the member, then write and verify a blank card on the card-issue reader.'
      "
      icon="nfc"
      [drawer]="true"
      [slim]="true"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16">
        <label class="search"
          ><rp-icon name="search" [size]="16" /><input
            type="search"
            id="ci-q"
            placeholder="Name, admission no., employee ID or mobile"
            aria-label="Find the member"
            autocomplete="off"
            [value]="q()"
            (input)="find($event)"
        /></label>
        @if (q().trim().length >= 2 && !picked()) {
          <div class="stack g6" id="ci-res">
            @if (results().length) {
              <div class="list">
                @for (m of results(); track m.id) {
                  <button type="button" class="li" (click)="pick(m.id)">
                    <rp-av [name]="name(m)" />
                    <span class="li-main"
                      ><span class="li-t">{{ name(m) }}</span
                      ><span class="li-s">{{ sub(m) }}</span></span
                    >
                    <span class="li-r">
                      @if (holderOf(m); as h) {
                        <span [class]="'chip dot tone-' + statusOf(h).tone">{{
                          statusOf(h).l()
                        }}</span>
                      } @else {
                        <span class="chip tone-neutral">No card</span>
                      }
                    </span>
                  </button>
                }
              </div>
            } @else {
              <p class="t-sm t-muted" style="padding: 6px 2px">
                No student, teacher or staff member matches “{{ q().trim() }}”. Parents and
                merchants don't get cards.
              </p>
            }
          </div>
        }
        @if (picked(); as m) {
          <div class="card pad row g16 top wrap" id="ci-sel">
            <rp-card-face
              [name]="name(m)"
              [token]="pickedHolder() ? masked(pickedHolder()!) : null"
              [active]="!pickedHolder() || pickedHolder()!.current.status === 'ACTIVE'"
              [line]="line(m)"
            />
            <div class="grow stack g8">
              <div>
                <b>{{ name(m) }}</b>
                <div class="t-sm t-muted">
                  {{ detail(m) }}
                  @if (m.admissionNo || m.employeeNo) {
                    · <span class="t-mono">{{ m.admissionNo ?? m.employeeNo }}</span>
                  }
                </div>
              </div>
              @if (m.status !== 'ACTIVE') {
                <div class="note tone-warn">
                  <rp-icon name="alert" [size]="17" />
                  <div class="grow">
                    {{ name(m) }} is {{ lower(m.status) }}. Activate the member before issuing a
                    card.
                  </div>
                </div>
              } @else if (pickedHolder(); as h) {
                @if (h.current.status === 'ACTIVE') {
                  <div class="note tone-warn">
                    <rp-icon name="alert" [size]="17" />
                    <div class="grow">
                      Already has an active card (<span class="t-mono">{{ masked(h) }}</span
                      >). A member holds one active card — re-issue it instead.
                    </div>
                    @if (!why()) {
                      <button type="button" class="btn btn-sec btn-sm" (click)="reissue.emit(h)">
                        <span>Re-issue</span>
                      </button>
                    }
                  </div>
                } @else {
                  <div class="note tone-info">
                    <rp-icon name="info" [size]="17" />
                    <div class="grow">
                      Has an inactive card (<span class="t-mono">{{ masked(h) }}</span
                      >). Reactivate it, or re-issue a new card with a reason.
                    </div>
                    @if (!why()) {
                      <span class="row g6">
                        <button
                          type="button"
                          class="btn btn-sec btn-sm"
                          (click)="reactivate.emit(h)"
                        >
                          <span>Reactivate</span>
                        </button>
                        <button type="button" class="btn btn-sec btn-sm" (click)="reissue.emit(h)">
                          <span>Re-issue</span>
                        </button>
                      </span>
                    }
                  </div>
                }
              } @else if (reader()) {
                <ol class="cp-ol" id="ci-steps">
                  <li>Place a blank CampusOne card on the reader connected to this computer.</li>
                  <li>
                    Choose <b>Write card</b> and keep the card still until it's written and checked.
                  </li>
                </ol>
                @if (pending()) {
                  <div class="note tone-warn" role="status">
                    <rp-icon name="alert" [size]="17" />
                    <div class="grow">
                      The card is issued for {{ name(m) }} but not written yet. Keep the same card
                      on the reader and choose <b>Write card</b> again.
                    </div>
                  </div>
                }
              } @else {
                <ol class="cp-ol" id="ci-steps">
                  <li>
                    On the card-issue reader{{ writers() ? ' (' + writers() + ')' : '' }}, find
                    <b>{{ name(m) }}</b
                    >.
                  </li>
                  <li>Place a blank CampusOne card on it and keep it still until it's verified.</li>
                  <li>Choose <b>Verify the written card</b> here.</li>
                </ol>
                <div class="note tone-info" id="ci-helper">
                  <rp-icon name="nfc" [size]="17" />
                  <div class="grow">
                    Card reader on this computer? Choose <b>Write card</b>: CampusOne Card Reader opens
                    by itself and the card is written here. Using the separate card-issue reader
                    instead? Write it there, then choose <b>Verify the written card</b>.
                  </div>
                </div>
                @if (noWriter()) {
                  <div class="note tone-warn">
                    <rp-icon name="alert" [size]="17" />
                    <div class="grow">
                      No card-issue reader is registered. Register one under
                      <a routerLink="/console/readers" (click)="closed.emit()">Readers</a> and pair
                      it first.
                    </div>
                  </div>
                }
                @if (notYet()) {
                  <div class="note tone-warn" role="status">
                    <rp-icon name="hourglass" [size]="17" />
                    <div class="grow">
                      No card has been written for {{ name(m) }} yet. Write it on the card-issue
                      reader, then verify again.
                    </div>
                  </div>
                }
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
      <div modal-foot class="row g8">
        <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        @if (!reader()) {
          <button
            type="button"
            class="btn btn-sec"
            id="ci-go"
            [disabled]="!ready() || busy()"
            (click)="verify()"
          >
            <span>Verify the written card</span>
          </button>
        }
        <button
          type="button"
          class="btn btn-pri"
          id="ci-write"
          [class.is-busy]="busy()"
          [disabled]="(!ready() && !pending()) || busy()"
          (click)="write()"
        >
          <rp-icon name="nfc" [size]="17" /><span>{{ busy() ? step() : 'Write card' }}</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class CardIssue implements OnInit {
  private readonly api = inject(CardsApi);

  /** Students and staff (parents and merchants don't get cards). */
  readonly members = input<readonly MemberRow[]>([]);
  readonly holders = input<ReadonlyMap<string, Holder>>(new Map());
  /** The member to start with (a row's "Issue"). */
  readonly memberId = input<string | null>(null);
  /** The card-issue readers' names; '' when there are none (or they can't be listed). */
  readonly writers = input('');
  /** True when the readers were listed and none is a card-issue reader. */
  readonly noWriter = input(false);
  readonly short = input('');
  readonly why = input('');
  readonly closed = output<void>();
  readonly reissue = output<Holder>();
  readonly reactivate = output<Holder>();
  readonly issued = output<{ name: string; card: Card }>();

  protected readonly q = signal('');
  protected readonly pickedId = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly notYet = signal(false);
  protected readonly error = signal('');
  /** CampusOne Card Reader is running on this computer (client 2026-10-08). */
  protected readonly reader = cardReader();
  protected readonly step = signal('');
  /** Issued but not yet written: the write is retried with this token (never shown). */
  protected readonly pending = signal<{ memberId: string; token: string } | null>(null);
  private issueKey = newIdempotencyKey();

  protected readonly results = computed(() => {
    const q = this.q().trim().toLowerCase();
    if (q.length < 2) return [];
    const digits = q.replace(/\D/g, '');
    return this.members()
      .filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.admissionNo ?? '').toLowerCase().includes(q) ||
          (m.employeeNo ?? '').toLowerCase().includes(q) ||
          (digits.length >= 4 && (m.mobile ?? '').includes(digits)),
      )
      .slice(0, 7);
  });
  protected readonly picked = computed(() => {
    const id = this.pickedId();
    return id ? (this.members().find((m) => m.id === id) ?? null) : null;
  });
  protected readonly pickedHolder = computed(() => {
    const m = this.picked();
    return m ? (this.holders().get(m.id) ?? null) : null;
  });
  /** A member without any card, who may get one. */
  protected readonly ready = computed(() => {
    const m = this.picked();
    return !!m && eligible(m) && !this.pickedHolder() && !this.why();
  });

  ngOnInit() {
    const id = this.memberId();
    if (id) this.pickedId.set(id);
  }

  protected find(e: Event) {
    this.q.set((e.target as HTMLInputElement).value);
    this.pickedId.set(null);
    this.notYet.set(false);
  }
  protected pick(id: string) {
    if (this.pickedId() !== id) this.issueKey = newIdempotencyKey();
    this.pickedId.set(id);
    this.notYet.set(false);
    this.error.set('');
  }

  /** ATT-027 with CampusOne Card Reader: read the card, issue it, write its token and check it. */
  protected async write() {
    const m = this.picked();
    if (!m || (!this.ready() && this.pending()?.memberId !== m.id)) return;
    this.busy.set(true);
    this.error.set('');
    try {
      // The action opens CampusOne Card Reader when it isn't running (client 2026-10-08).
      this.step.set('Opening the card reader…');
      if (!(await ensureCardReader())) {
        this.error.set(
          "CampusOne Card Reader didn't start. Install it on this computer, or allow the browser to open it, then try again.",
        );
        return;
      }
      let token = this.pending()?.memberId === m.id ? this.pending()!.token : '';
      if (!token) {
        this.step.set('Reading the card…');
        const uid = await readCardUid();
        this.step.set('Issuing…');
        token = (await this.api.issue(m.id, uid, this.issueKey)).cardToken;
        this.pending.set({ memberId: m.id, token });
      }
      this.step.set('Writing…');
      await writeCardToken(token);
      this.pending.set(null);
      this.issueKey = newIdempotencyKey();
      const page = await this.api.list({ q: titleCase(m.name), status: 'ACTIVE' });
      const card = page.items.find((c) => c.member.id === m.id);
      if (card) this.issued.emit({ name: this.name(m), card });
    } catch (e) {
      this.error.set(
        e instanceof ApiProblem
          ? e.detail
          : this.pending()
            ? `The card wasn't written: ${readerProblem(e)}`
            : readerProblem(e),
      );
    } finally {
      this.step.set('');
      this.busy.set(false);
    }
  }

  /** ATT-005: the member's active card, once the reader has written it. */
  protected async verify() {
    const m = this.picked();
    if (!m || !this.ready()) return;
    this.busy.set(true);
    this.error.set('');
    this.notYet.set(false);
    try {
      const page = await this.api.list({ q: titleCase(m.name), status: 'ACTIVE' });
      const card = page.items.find((c) => c.member.id === m.id);
      if (card) this.issued.emit({ name: this.name(m), card });
      else this.notYet.set(true);
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      this.busy.set(false);
    }
  }

  protected holderOf(m: MemberRow) {
    return this.holders().get(m.id) ?? null;
  }
  protected statusOf(h: Holder) {
    return CARD_STATUS[h.current.status];
  }
  protected name(m: MemberRow) {
    return titleCase(m.name);
  }
  protected detail(m: MemberRow) {
    return detailOf(m);
  }
  protected sub(m: MemberRow) {
    return [detailOf(m), m.admissionNo ?? m.employeeNo].filter(Boolean).join(' · ');
  }
  protected line(m: MemberRow) {
    return [this.short(), faceLine(m)].filter(Boolean).join(' · ');
  }
  protected masked(h: Holder) {
    return maskToken(h.current.token);
  }
  protected lower(s: string) {
    return s.toLowerCase();
  }
}
