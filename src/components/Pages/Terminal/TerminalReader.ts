/**
 * t.reader — a reader's kiosk screen (CR-10, CR-15; ATT-003, CPN-013/014; prototype t.reader): the
 * purpose's rules, the tap zone, the result of each tap, and the captures of this session.
 * - Balance check: the holder's campus and allowance balances, cleared after 8 seconds.
 * - Coupon counter: bound to its merchant; the holder's types usable now; with more than one the
 *   holder chooses within `cpn.tap.chooseSeconds`, else nothing is used (OI-ATT-26).
 * - Gate, period and location attendance: each tap records it (ATT-002, 30 s double-tap guard).
 * - Card issue: cards are written from the console (NFC cards → Issue) with CampusOne Card Reader.
 * The prototype's demo time and simulated cards become the card reader field. With CampusOne Card Reader
 * running, the USB reader is read once a second and each new card is taken at once (client 2026-10-08,
 * Utils/card-reader); the field stays for a keyboard-wedge reader or typing.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
  type OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { Countdown } from '../../Shared/Countdown';
import { Icon } from '../../Shared/Icon';
import { Overlays } from '../../Shared/Overlays';
import { formatTime } from '../../Utils/format';
import type { IconName } from '../../Utils/icons';
import { problemText } from './pos.state';
import { TerminalApi, paiseOf, type CouponTap } from './terminal.api';
import { TerminalDevice } from './terminal.device';
import { PURPOSES, TapZone, TermBar, TermMark } from './TerminalChrome';
import { avColor, initialsOf, inr, maskCard } from './terminal.format';
import { newUuid } from '../../Utils/ids';
import { cardReader, watchCards } from '../../Utils/card-reader';
import { ReaderLaunch } from '../../Shared/ReaderLaunch';

type Tone = 'ok' | 'bad' | 'warn' | 'info';
interface Result {
  readonly tone: Tone;
  readonly icon?: IconName;
  readonly status: string;
  readonly head: string;
  readonly who?: string;
  readonly sub?: string;
  readonly lines?: readonly (readonly [string, string])[];
  readonly balances?: {
    campus: string | null;
    allowance: string | null;
    campusSub: string;
    allowanceSub: string;
  };
  readonly note?: string;
  readonly at: number;
  readonly ms: number;
}
interface Capture {
  readonly at: number;
  readonly who: string | null;
  readonly detail: string;
  readonly tone: Tone;
  readonly result: string;
}

@Component({
  selector: 'rp-terminal-reader',
  imports: [Countdown, Icon, ReaderLaunch, TapZone, TermBar, TermMark],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: flex; flex-direction: column; flex: 1; min-height: 0' },
  template: `<div class="tm-root tm-rd" [class]="'tm-p-' + kind()">
    <rp-term-bar
      [icon]="purpose().icon"
      [name]="cfg()?.terminal?.name ?? 'Reader'"
      [sub]="barSub()"
      [purpose]="purpose().label"
      [online]="true"
      [signout]="true"
      (signedOut)="signOut()"
    />
    <div class="term-body tm-body">
      <section class="tm-main">
        <div class="tm-rules">
          @for (r of rules(); track r.t) {
            <span class="tm-rule"><rp-icon [name]="r.icon" [size]="13" />{{ r.t }}</span>
          }
        </div>
        <div class="tm-stage" [class]="stageTone()" aria-live="polite">
          @if (choice(); as ch) {
            <div class="tm-choice" role="dialog" aria-label="Choose a coupon">
              <div class="tm-choice-h">
                <span
                  class="av lg"
                  [style.--av]="avColor(ch.holder.maskedName)"
                  aria-hidden="true"
                  >{{ initialsOf(ch.holder.maskedName) }}</span
                >
                <div class="grow">
                  <h2>Choose your coupon</h2>
                  <p>
                    {{ ch.eligibleTypes.length }} coupons can be used now at
                    {{ cfg()?.merchant ?? 'this counter' }}. Tap one.
                  </p>
                </div>
                <rp-countdown
                  [total]="ch.chooseWithinSec"
                  [left]="choiceLeft()"
                  [size]="78"
                  [stroke]="6"
                  caption="to choose"
                />
              </div>
              <div class="tm-opts">
                @for (t of ch.eligibleTypes; track t.id) {
                  <button type="button" class="tm-opt" (click)="pick(t.id, t.name)">
                    <span class="tm-opt-ic"><rp-icon [name]="typeIcon(t.name)" [size]="30" /></span
                    ><b>{{ t.name }}</b
                    ><small>{{ t.window.start }}–{{ t.window.end }}</small>
                  </button>
                }
              </div>
              <div class="tm-choice-f">
                <span
                  ><rp-icon name="info" [size]="14" /> If nothing is chosen in
                  {{ ch.chooseWithinSec }} seconds the tap lapses and no coupon is used.
                  <span class="srs" title="SRS reference">OI-ATT-26</span></span
                >
                <button type="button" class="btn btn-ghost btn-sm" (click)="cancelChoice()">
                  <span>Cancel</span>
                </button>
              </div>
            </div>
          } @else if (res(); as r) {
            <div class="tm-res" [class]="'tm-' + r.tone" role="status">
              <button
                type="button"
                class="tm-res-x"
                aria-label="Clear the screen"
                (click)="res.set(null)"
              >
                <rp-icon name="x" [size]="18" />
              </button>
              <div class="tm-res-top">
                <rp-term-mark [tone]="r.tone" [icon]="r.icon ?? null" />
                <div class="tm-res-status">
                  {{ r.status }}
                </div>
              </div>
              <div class="tm-res-who">
                @if (r.who) {
                  <span class="av xl" [style.--av]="avColor(r.who)" aria-hidden="true">{{
                    initialsOf(r.who)
                  }}</span>
                } @else {
                  <span class="tm-noav"><rp-icon name="card" [size]="26" /></span>
                }
                <div class="grow">
                  <h2>{{ r.head }}</h2>
                  @if (r.sub) {
                    <p>{{ r.sub }}</p>
                  }
                </div>
              </div>
              @if (r.balances; as b) {
                <div class="tm-bal">
                  <div class="tm-bal-i">
                    <span class="tm-bal-l"><rp-icon name="wallet" [size]="16" /> Campus wallet</span
                    ><b class="tm-bal-v t-num">{{ b.campus ?? '—' }}</b
                    ><small>{{ b.campusSub }}</small>
                  </div>
                  <div class="tm-bal-i">
                    <span class="tm-bal-l"><rp-icon name="gift" [size]="16" /> Allowance</span>
                    @if (b.allowance) {
                      <b class="tm-bal-v t-num">{{ b.allowance }}</b>
                    } @else {
                      <b class="tm-bal-v tm-dim">—</b>
                    }
                    <small>{{ b.allowanceSub }}</small>
                  </div>
                </div>
              }
              @if (r.lines?.length) {
                <dl class="tm-res-kv">
                  @for (l of r.lines; track l[0]) {
                    <div>
                      <dt>{{ l[0] }}</dt>
                      <dd>{{ l[1] }}</dd>
                    </div>
                  }
                </dl>
              }
              @if (r.note) {
                <p class="tm-res-note">
                  <rp-icon name="info" [size]="14" /><span>{{ r.note }}</span>
                </p>
              }
              <div class="tm-res-foot">
                <rp-icon name="target" [size]="12" /> Purpose in force
                <b>{{ purpose().label }}</b> · {{ time(r.at) }} · capture logged
              </div>
              <i class="tm-res-timer" [style.animation-duration.ms]="r.ms"></i>
            </div>
          } @else {
            <div class="tm-idle">
              <rp-tapzone
                [cls]="reading() ? 'tm-reading' : ''"
                [icon]="kind() === 'bal' ? 'wallet' : 'nfc'"
              />
              <h2>{{ idle().h }}</h2>
              <p>{{ idle().p }}</p>
            </div>
          }
        </div>
        <div class="tm-recent">
          <div class="tm-h">
            <rp-icon name="history" [size]="14" /> Recent captures
            <span class="tm-h-r"
              >{{ caps().length }} {{ caps().length === 1 ? 'tap' : 'taps' }} this session</span
            >
          </div>
          @if (caps().length) {
            <div class="tm-caps">
              @for (c of caps().slice(0, 3); track c.at) {
                <div class="tm-cap">
                  <span class="tm-cap-t t-num">{{ time(c.at) }}</span>
                  @if (c.who) {
                    <span class="av xs" [style.--av]="avColor(c.who)" aria-hidden="true">{{
                      initialsOf(c.who)
                    }}</span>
                  } @else {
                    <span class="tm-noav xs"><rp-icon name="card" [size]="11" /></span>
                  }
                  <span class="grow tm-cap-m"
                    ><b class="t-clip">{{ c.who ?? 'Unknown card' }}</b
                    ><small class="t-clip">{{ c.detail }}</small></span
                  >
                  <span class="tm-chip" [class]="'tm-' + c.tone">{{ c.result }}</span
                  ><span class="tm-cap-p" title="Purpose recorded with this capture (CR-10)"
                    ><rp-icon name="target" [size]="11" />{{ purpose().label }}</span
                  >
                </div>
              }
            </div>
          } @else {
            <div class="tm-empty">
              <rp-icon name="nfc" [size]="16" /><span>No taps yet. Tap a card on the reader.</span>
            </div>
          }
        </div>
      </section>
      <aside class="tm-side">
        <div class="tm-sim">
          <div class="tm-h"><rp-icon name="nfc" [size]="14" /> Card reader</div>
          @if (!reader() && active()) {
            <div style="margin-bottom: 12px"><rp-reader-launch [block]="true" /></div>
          }
          <p class="tm-hint">
            {{
              choice()
                ? 'Finish the choice on screen first.'
                : reader()
                  ? readerNote() || 'Tap a card on the reader. It is read on its own.'
                  : 'Tap a card on the reader; it types the card’s token here.'
            }}
          </p>
          <form (submit)="$event.preventDefault(); tap()">
            <div class="fld">
              <label class="fld-l" for="tm-rcard">Card</label>
              <div class="fld-in">
                <input
                  id="tm-rcard"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="Card token"
                  [disabled]="!!choice() || reading() || !active()"
                  [value]="card()"
                  (input)="card.set(v($event))"
                />
              </div>
            </div>
            <button
              type="submit"
              class="btn btn-sec btn-block"
              [disabled]="!!choice() || reading() || !card().trim() || !active()"
            >
              <rp-icon name="nfc" [size]="17" /><span>{{
                reading() ? 'Reading…' : 'Read card'
              }}</span>
            </button>
          </form>
        </div>
      </aside>
    </div>
  </div>`,
})
export class TerminalReader implements OnInit {
  private readonly device = inject(TerminalDevice);
  private readonly api = inject(TerminalApi);
  private readonly router = inject(Router);
  private readonly overlays = inject(Overlays);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly cfg = this.device.config;
  protected readonly res = signal<Result | null>(null);
  protected readonly choice = signal<(CouponTap & { tapId: string; until: number }) | null>(null);
  protected readonly reading = signal(false);
  protected readonly card = signal('');
  protected readonly caps = signal<readonly Capture[]>([]);
  protected readonly now = signal(Date.now());
  protected readonly avColor = avColor;
  protected readonly initialsOf = initialsOf;

  protected readonly purpose = computed(() => {
    const p = this.cfg()?.terminal.purpose;
    return p ? PURPOSES[p] : PURPOSES.ATTENDANCE;
  });
  protected readonly kind = computed(() => {
    const p = this.cfg()?.terminal.purpose;
    return p === 'BALANCE_CHECK'
      ? 'bal'
      : p === 'COUPON'
        ? 'coupon'
        : p === 'CARD_ISSUE'
          ? 'issue'
          : p === 'LOCATION'
            ? 'loc'
            : p === 'PERIOD_ATTENDANCE'
              ? 'period'
              : 'gate';
  });
  /** Purposes this screen serves; cards are issued from the console. */
  protected readonly active = computed(() => this.kind() !== 'issue');
  /** CampusOne Card Reader is running on this computer (client 2026-10-08). */
  protected readonly reader = cardReader();
  protected readonly readerNote = signal('');
  protected readonly barSub = computed(() => {
    const c = this.cfg();
    return c ? `${c.terminal.location ?? ''} · ${c.terminal.id.slice(-12).toUpperCase()}` : '';
  });
  protected readonly stageTone = computed(() =>
    this.choice()
      ? 'tm-s-choice'
      : this.res()
        ? `tm-s-${this.res()!.tone}`
        : this.reading()
          ? 'tm-s-reading'
          : '',
  );
  protected readonly choiceLeft = computed(() => {
    const ch = this.choice();
    return ch ? Math.max(0, Math.ceil((ch.until - this.now()) / 1000)) : 0;
  });
  protected readonly rules = computed((): readonly { icon: IconName; t: string }[] => {
    switch (this.kind()) {
      case 'bal':
        return [
          { icon: 'wallet', t: 'Campus wallet and allowance' },
          { icon: 'eyeoff', t: 'Clears after 8 s' },
        ];
      case 'coupon':
        return [
          {
            icon: 'link',
            t: `Bound to ${this.cfg()?.merchant ?? 'its merchant'} · no collection request`,
          },
          { icon: 'ticket', t: 'The holder chooses when more than one type is valid' },
        ];
      case 'issue':
        return [{ icon: 'card', t: 'Cards are issued in the console: NFC cards → Issue' }];
      default:
        return [
          {
            icon: 'calcheck',
            t:
              this.kind() === 'gate'
                ? 'First tap checks in; staff tap again to check out'
                : this.kind() === 'period'
                  ? 'Marks the class period that is on now'
                  : 'Records a visit to this place',
          },
          { icon: 'shield', t: '30 s double-tap guard' },
        ];
    }
  });
  protected readonly idle = computed(() => {
    if (this.reading()) return { h: 'Reading card…', p: 'Hold the card still for a moment.' };
    switch (this.kind()) {
      case 'bal':
        return {
          h: 'Tap to see your balance',
          p: 'Campus wallet and allowance. The screen clears on its own.',
        };
      case 'coupon':
        return {
          h: 'Tap your card for a coupon',
          p: `Coupons accepted at ${this.cfg()?.merchant ?? 'this counter'}.`,
        };
      case 'issue':
        return {
          h: 'Card issue reader',
          p: 'Cards are written for a member in the console (NFC cards → Issue) on a computer running CampusOne Card Reader.',
        };
      default:
        return {
          h: 'Tap your card',
          p:
            this.kind() === 'gate'
              ? 'Your attendance is recorded as you come in and go out.'
              : this.kind() === 'period'
                ? 'Your attendance is marked for this period.'
                : 'Your visit is recorded.',
        };
    }
  });

  constructor() {
    const t = setInterval(() => {
      this.now.set(Date.now());
      const r = this.res();
      if (r && Date.now() - r.at >= r.ms) this.res.set(null);
      const ch = this.choice();
      if (ch && Date.now() >= ch.until) this.lapse();
    }, 250);
    inject(DestroyRef).onDestroy(() => clearInterval(t));
  }

  async ngOnInit() {
    if (this.device.signedOut || !(await this.device.paired())) {
      await this.router.navigateByUrl('/terminal');
      return;
    }
    if (!this.device.signedIn) {
      try {
        await this.device.signIn();
      } catch {
        await this.router.navigateByUrl('/terminal');
      }
    }
    if (this.cfg()?.terminal.purpose === 'POS') {
      await this.router.navigateByUrl('/terminal/pos');
      return;
    }
    // CampusOne Card Reader reads the card: each new card is taken as a tap.
    const watch = watchCards(
      async (token) => {
        this.readerNote.set('');
        if (this.choice() || this.reading() || !this.active()) return;
        this.card.set(token);
        await this.tap();
      },
      { onProblem: (m) => this.readerNote.set(m) },
    );
    this.destroyRef.onDestroy(() => watch.stop());
  }

  protected time(v: number | string) {
    return formatTime(new Date(v));
  }
  protected v(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected typeIcon(name: string): IconName {
    return /breakfast/i.test(name) ? 'coffee' : /snack/i.test(name) ? 'bag' : 'utensils';
  }

  private log(who: string | null, detail: string, tone: Tone, result: string) {
    this.caps.set([{ at: Date.now(), who, detail, tone, result }, ...this.caps()].slice(0, 30));
  }
  private show(r: Omit<Result, 'at' | 'ms'> & { ms?: number }) {
    this.res.set({ ...r, at: Date.now(), ms: r.ms ?? 5200 });
  }

  protected async tap() {
    const token = this.card().trim().toUpperCase();
    this.card.set('');
    if (!token || this.choice() || !this.active()) return;
    this.res.set(null);
    this.reading.set(true);
    try {
      if (this.kind() === 'bal') await this.balance(token);
      else if (this.kind() === 'coupon') await this.coupon(token);
      else await this.attend(token);
    } finally {
      this.reading.set(false);
    }
  }

  private async balance(token: string) {
    try {
      const b = await this.api.balance(token);
      const first = b.member.name.split(' ')[0] ?? b.member.name;
      this.log(b.member.name, 'Campus wallet and allowance', 'info', 'Balance shown');
      this.show({
        tone: 'info',
        icon: 'wallet',
        status: 'Your balance',
        head: `Hello, ${first}`,
        who: b.member.name,
        balances: {
          campus: b.campus ? inr(paiseOf(b.campus.balance)) : null,
          allowance:
            b.allowance && b.allowance.status === 'ACTIVE'
              ? inr(paiseOf(b.allowance.balance))
              : null,
          campusSub: b.campus
            ? b.campus.status === 'ACTIVE'
              ? 'Wallet active'
              : `Wallet ${b.campus.status.toLowerCase()}`
            : 'No wallet',
          allowanceSub:
            b.allowance && b.allowance.status === 'ACTIVE'
              ? 'Allowance wallet'
              : 'No allowance credited',
        },
        note: 'The screen clears on its own. Top up from the CampusOne app.',
        ms: 8000,
      });
    } catch (e) {
      this.refused(token, e);
    }
  }

  /** ATT-002: gate, period or location attendance. */
  private async attend(token: string) {
    try {
      const r = await this.api.attendanceTap(token, newUuid());
      const done: Record<string, [string, string]> = {
        CHECKED_IN: ['Checked in', r.status === 'LATE' ? 'Marked late' : 'Marked present'],
        CHECKED_OUT: ['Checked out', r.status === 'HALF_DAY' ? 'Half day' : 'Full day'],
        PERIOD_RECORDED: ['Marked for this period', 'Present'],
        LOCATION_RECORDED: ['Visit recorded', this.cfg()?.terminal.location ?? ''],
      };
      const [status, sub] = done[r.result] ?? ['Recorded', ''];
      const first = r.member.name.split(' ')[0] ?? r.member.name;
      this.log(r.member.name, r.member.classSection ?? status, 'ok', status);
      this.show({
        tone: 'ok',
        icon: 'calcheck',
        status,
        head: `Hello, ${first}`,
        who: r.member.name,
        sub,
        lines: [
          ['Class & section', r.member.classSection ?? '—'],
          ['Time', this.time(r.at)],
        ],
      });
    } catch (e) {
      this.refused(token, e);
    }
  }

  private async coupon(token: string) {
    const tapId = newUuid();
    try {
      const t = await this.api.couponTap(token, tapId);
      if (t.eligibleTypes.length === 1)
        return this.redeem(tapId, t, t.eligibleTypes[0]!.id, t.eligibleTypes[0]!.name);
      this.choice.set({ ...t, tapId, until: Date.now() + t.chooseWithinSec * 1000 });
    } catch (e) {
      this.refused(token, e);
    }
  }

  protected async pick(typeId: string, name: string) {
    const ch = this.choice();
    if (!ch) return;
    this.choice.set(null);
    await this.redeem(ch.tapId, ch, typeId, name);
  }

  private async redeem(tapId: string, t: CouponTap, typeId: string, name: string) {
    try {
      const r = await this.api.couponRedeem(tapId, typeId);
      this.log(r.holder.name, `${name} coupon`, 'ok', 'Redeemed');
      this.show({
        tone: 'ok',
        status: 'Redeemed',
        head: `Serve ${name}`,
        who: r.holder.name,
        sub: r.holder.name,
        lines: [
          ['Admission no.', t.holder.admissionNo ?? '—'],
          ['Class & section', t.holder.classSection ?? '—'],
          ['Coupon', name],
          ['Redeemed', this.time(r.redeemedAt)],
        ],
        note: 'Check the photo matches the student before serving.',
        ms: 6500,
      });
    } catch (e) {
      this.log(t.holder.maskedName, problemText(e), 'bad', 'Refused');
      this.show({
        tone: 'bad',
        status: 'Not redeemed',
        head: t.holder.maskedName,
        sub: problemText(e),
        note: 'No coupon was used.',
      });
    }
  }

  protected cancelChoice() {
    const ch = this.choice();
    if (!ch) return;
    this.choice.set(null);
    this.log(ch.holder.maskedName, 'Holder cancelled the choice', 'info', 'Cancelled');
    this.show({
      tone: 'info',
      icon: 'x',
      status: 'Cancelled',
      head: ch.holder.maskedName,
      sub: 'No coupon was used.',
      ms: 2800,
    });
  }

  private lapse() {
    const ch = this.choice();
    if (!ch) return;
    this.choice.set(null);
    this.log(ch.holder.maskedName, `No coupon chosen in ${ch.chooseWithinSec} s`, 'warn', 'Lapsed');
    this.show({
      tone: 'warn',
      icon: 'hourglass',
      status: "Time's up",
      head: ch.holder.maskedName,
      sub: `No coupon was chosen within ${ch.chooseWithinSec} seconds, so nothing was used. Tap the card again to choose.`,
    });
  }

  private refused(token: string, e: unknown) {
    const text = problemText(e);
    this.log(null, `Card ${maskCard(token)} · ${text}`, 'bad', 'Refused');
    this.show({
      tone: 'bad',
      status: 'Card not accepted',
      head: "This card can't be used here",
      sub: text,
      note: 'Nothing was recorded.',
    });
  }

  protected async signOut() {
    const ok = await this.overlays.confirm({
      title: 'Sign out of this terminal?',
      text: 'The reader stops accepting taps until it signs in again with its credentials.',
      ok: 'Sign out',
      tone: 'warn',
      icon: 'logout',
    });
    if (!ok) return;
    this.device.signOut();
    this.overlays.toast('Terminal signed out', {
      tone: 'info',
      sub: this.cfg()?.terminal.name ?? '',
    });
    await this.router.navigateByUrl('/terminal');
  }
}
