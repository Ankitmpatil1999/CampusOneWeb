import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { Modal } from '../../../Shared/Overlays';
import { formatDate, formatDateTime } from '../../../Utils/format';
import type { MemberRow } from '../Members/members.api';
import { CardFace } from './CardFace';
import { CARD_STATUS, type Holder, issueReasonText, maskToken } from './card-format';

interface HistoryItem {
  readonly at: string;
  readonly t: string;
  readonly s: string;
  readonly icon: 'nfc' | 'shieldx' | 'check';
  readonly bad: boolean;
}

/**
 * The card drawer (prototype cardDrawer; ATT-005): the card face, its status, token, issue date,
 * re-issues and why it was written, the cards it replaced (kept on record; taps with them are
 * refused), what happened to the cards, and the last tap. The footer blocks or reactivates the card
 * and re-issues it — the page runs those (ATT-006, ATT-007).
 */
@Component({
  selector: 'rp-card-drawer',
  imports: [CardFace, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="holder().name"
      sub="NFC card"
      icon="nfc"
      [drawer]="true"
      [slim]="true"
      (closed)="closed.emit()"
    >
      <div class="stack g16">
        <div class="row g16 top wrap">
          <rp-card-face
            [name]="holder().name"
            [token]="token()"
            [active]="c().status === 'ACTIVE'"
            [line]="line()"
          />
          <div class="grow">
            <dl class="kv">
              <dt>Card status</dt>
              <dd>
                <span [class]="'chip dot tone-' + status().tone">{{ status().l() }}</span>
              </dd>
              <dt>Token</dt>
              <dd>
                <span class="t-mono">{{ token() }}</span>
              </dd>
              <dt>Issued</dt>
              <dd>{{ date(c().issuedAt) }}</dd>
              <dt>Re-issues</dt>
              <dd>{{ c().reissueCount }}</dd>
              <dt>Written as</dt>
              <dd>{{ reason() }}</dd>
              @if (c().status !== 'ACTIVE' && c().statusReason) {
                <dt>Reason</dt>
                <dd>{{ c().statusReason }}</dd>
              }
            </dl>
          </div>
        </div>
        @if (previous().length) {
          <div class="note tone-neutral">
            <rp-icon name="archive" [size]="17" />
            <div class="grow">
              Previous cards kept on record:
              @for (p of previous(); track p; let last = $last) {
                <span class="t-mono">{{ p }}</span
                >{{ last ? '' : ', ' }}
              }
              . Taps with them are refused.
            </div>
          </div>
        }
        @if (memberInactive()) {
          <div class="note tone-info">
            <rp-icon name="info" [size]="17" />
            <div class="grow">
              {{ holder().name }} is {{ memberInactive() }}, so the card can't be reactivated until
              the member is activated again.
            </div>
          </div>
        }
        <div>
          <div class="sec-h"><h3>Card history</h3></div>
          @if (history().length > 1) {
            <div class="tl">
              @for (h of history(); track $index) {
                <div class="tl-i done" [class.bad]="h.bad">
                  <span class="tl-dot"><rp-icon [name]="h.icon" [size]="13" [stroke]="2.6" /></span>
                  <div class="tl-c">
                    <div class="tl-t">{{ h.t }}</div>
                    <div class="tl-s">{{ h.s }}</div>
                  </div>
                </div>
              }
            </div>
          } @else {
            <p class="t-sm t-muted">Issued {{ date(c().issuedAt) }}. No changes since.</p>
          }
        </div>
        <div>
          <div class="sec-h"><h3>Recent taps</h3></div>
          @if (c().lastTapAt) {
            <div class="list">
              <div class="li">
                <span class="li-ic sm"><rp-icon name="nfc" [size]="16" /></span>
                <span class="li-main"
                  ><span class="li-t">Last tap</span
                  ><span class="li-s">{{ dateTime(c().lastTapAt!) }}</span></span
                >
              </div>
            </div>
          } @else {
            <p class="t-sm t-muted">No taps recorded recently.</p>
          }
        </div>
      </div>
      <div modal-foot class="row g8">
        <button type="button" class="btn btn-sec" (click)="closed.emit()">
          <span>Close</span>
        </button>
        @if (c().status === 'ACTIVE') {
          <span class="cp-why" [attr.title]="why() || null"
            ><button
              type="button"
              class="btn btn-danger-o"
              id="cd-block"
              [disabled]="!!why()"
              (click)="block.emit(holder())"
            >
              <rp-icon name="shieldx" [size]="17" /><span>Block card</span>
            </button></span
          >
        } @else {
          <span class="cp-why" [attr.title]="why() || null"
            ><button
              type="button"
              class="btn btn-ok"
              id="cd-react"
              [disabled]="!!why()"
              (click)="reactivate.emit(holder())"
            >
              <rp-icon name="check" [size]="17" /><span>Reactivate</span>
            </button></span
          >
        }
        <span class="cp-why" [attr.title]="why() || null"
          ><button
            type="button"
            class="btn btn-pri"
            id="cd-re"
            [disabled]="!!why()"
            (click)="reissue.emit(holder())"
          >
            <rp-icon name="refresh" [size]="17" /><span>Re-issue</span>
          </button></span
        >
      </div>
    </rp-modal>
  `,
})
export class CardDrawer {
  readonly holder = input.required<Holder>();
  readonly member = input<MemberRow | undefined>(undefined);
  /** "TVPS · 6 A" on the card face. */
  readonly line = input('');
  /** Why changes are refused (read-only role, no cards.edit); '' when allowed. */
  readonly why = input('');
  readonly closed = output<void>();
  readonly block = output<Holder>();
  readonly reactivate = output<Holder>();
  readonly reissue = output<Holder>();

  protected readonly c = computed(() => this.holder().current);
  protected readonly token = computed(() => maskToken(this.c().token));
  protected readonly status = computed(() => CARD_STATUS[this.c().status]);
  protected readonly reason = computed(() => issueReasonText(this.c().issueReason));
  protected readonly previous = computed(() =>
    this.holder().previous.map((p) => maskToken(p.token)),
  );
  protected readonly memberInactive = computed(() => {
    const m = this.member();
    return m && m.status !== 'ACTIVE' && this.c().status !== 'ACTIVE' ? m.status.toLowerCase() : '';
  });
  /** Every card's writing and blocking, newest first. */
  protected readonly history = computed<HistoryItem[]>(() => {
    const h = this.holder();
    const out: HistoryItem[] = [];
    for (const c of [h.current, ...h.previous]) {
      out.push({
        at: c.issuedAt,
        t: `${c.issueReason === 'NEW_REGISTRATION' ? 'Card issued' : 'New card written'} · ${maskToken(c.token)}`,
        s: `${issueReasonText(c.issueReason)} · ${formatDateTime(c.issuedAt)}`,
        icon: 'nfc',
        bad: false,
      });
      if (c.blockedAt) {
        out.push({
          at: c.blockedAt,
          t: `Card made inactive · ${maskToken(c.token)}`,
          s: [c.statusReason, formatDateTime(c.blockedAt)].filter(Boolean).join(' · '),
          icon: 'shieldx',
          bad: true,
        });
      }
    }
    return out.sort((a, b) => b.at.localeCompare(a.at));
  });

  protected date(v: string) {
    return formatDate(v);
  }
  protected dateTime(v: string) {
    return formatDateTime(v);
  }
}
