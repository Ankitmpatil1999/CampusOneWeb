/**
 * t.signin — terminal identity and sign-in (CR-10, OI-IDN-45; IDN-040/041, IDN-042; prototype
 * t.signin). The prototype's terminal ID and password become the device-bound identity: the school
 * office issues a one-time pairing code; afterwards this device signs in with its own secret. A
 * point-of-sale counter then asks the operator to tap their NFC tag (step 2 of 2).
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
  type OnInit,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Icon } from '../../Shared/Icon';
import { formatDate } from '../../Utils/format';
import { ApiProblem } from '../../Utils/problem';
import { translate } from '../../Utils/translate';
import { TerminalApi, type PosTag } from './terminal.api';
import { TerminalDevice } from './terminal.device';
import { PURPOSES, TapZone, TermBar } from './TerminalChrome';
import { avColor } from './terminal.format';
import { cardReader, watchCards, type CardWatch } from '../../Utils/card-reader';
import { ReaderLaunch } from '../../Shared/ReaderLaunch';

type Stage = 'loading' | 'pair' | 'signin' | 'operator';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

@Component({
  selector: 'rp-terminal-signin',
  imports: [Icon, ReaderLaunch, TapZone, TermBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: flex; flex-direction: column; flex: 1; min-height: 0' },
  template: `<div class="tm-root tm-si">
    <rp-term-bar
      [icon]="purpose().icon"
      [name]="cfg()?.terminal?.name ?? 'CampusOne terminal'"
      [sub]="barSub()"
      [purpose]="cfg() ? purpose().label : ''"
      [online]="online()"
    />
    <div class="term-body tm-si-body">
      <section class="tm-si-id">
        @if (cfg(); as c) {
          <div class="tm-org">
            <span class="tm-crest" aria-hidden="true">{{ crest() }}</span>
            <div class="grow">
              <b>{{ c.institution.name }}</b
              ><small
                >{{ c.institution.code }} · {{ c.institution.city
                }}{{ c.institution.board ? ' · ' + c.institution.board : '' }}</small
              >
            </div>
            <span class="tm-chip" [class.tm-ok]="instActive()" [class.tm-bad]="!instActive()">{{
              instActive() ? 'Active' : 'Not active'
            }}</span>
          </div>
          <div class="tm-idcard">
            <div class="tm-idcard-h">
              <span class="tm-dev lg" aria-hidden="true"
                ><rp-icon [name]="purpose().icon" [size]="26"
              /></span>
              <div class="grow">
                <div class="eyebrow">
                  This terminal
                  <span class="srs cr" title="Version 2.1 change request">CR-10</span>
                </div>
                <h2>{{ c.terminal.name }}</h2>
                <p>{{ c.terminal.location ?? '' }}</p>
              </div>
            </div>
            <dl class="tm-idkv">
              <div>
                <dt>Terminal ID</dt>
                <dd>
                  <span class="t-mono">{{ shortId(c.terminal.id) }}</span>
                </dd>
              </div>
              <div>
                <dt>Purpose</dt>
                <dd>
                  <b>{{ purpose().label }}</b>
                </dd>
              </div>
              @if (c.merchant) {
                <div>
                  <dt>Bound merchant</dt>
                  <dd>{{ c.merchant }}</dd>
                </div>
              }
              @if (c.section) {
                <div>
                  <dt>Class</dt>
                  <dd>{{ c.section }}</dd>
                </div>
              }
              @if (c.terminal.locationType) {
                <div>
                  <dt>Location type</dt>
                  <dd>{{ c.terminal.locationType }}</dd>
                </div>
              }
              <div>
                <dt>Device fingerprint</dt>
                <dd>
                  <span class="t-mono">{{ c.terminal.fingerprint ?? '—' }}</span>
                </dd>
              </div>
              <div>
                <dt>Registered</dt>
                <dd>
                  {{ date(c.terminal.registeredAt)
                  }}{{ c.terminal.registeredBy ? ' · ' + c.terminal.registeredBy : '' }}
                </dd>
              </div>
            </dl>
            <p class="tm-fine">
              <rp-icon name="shieldck" [size]="13" /> The identity is bound to this device at first
              use with a secret the platform issues and the device stores, so it can't be copied to
              another machine. Reports show the name in force when each tap was captured.
              <span class="srs" title="SRS reference">OI-IDN-45</span>
            </p>
          </div>
        } @else {
          <div class="tm-idcard">
            <div class="tm-idcard-h">
              <span class="tm-dev lg" aria-hidden="true"><rp-icon name="nfc" [size]="26" /></span>
              <div class="grow">
                <div class="eyebrow">
                  This terminal
                  <span class="srs cr" title="Version 2.1 change request">CR-10</span>
                </div>
                <h2>Not paired yet</h2>
                <p>A reader or counter registered in the console</p>
              </div>
            </div>
            <p class="tm-fine">
              <rp-icon name="shieldck" [size]="13" /> Pairing binds the terminal to this device with
              a secret the platform issues and the device stores, so it can't be copied to another
              machine. <span class="srs" title="SRS reference">OI-IDN-45</span>
            </p>
          </div>
        }
      </section>
      <section class="tm-si-form">
        @switch (stage()) {
          @case ('loading') {
            <div class="tm-si-card">
              <div class="eyebrow">Terminal sign-in</div>
              <h1>Signing in…</h1>
              <p>The terminal proves itself with its device secret.</p>
            </div>
          }
          @case ('pair') {
            <div class="tm-si-card">
              <div class="eyebrow">{{ isPos() ? 'Step 1 of 2' : 'Terminal sign-in' }}</div>
              <h1>Pair this terminal</h1>
              <p>Enter the one-time pairing code the institution administrator issued for it.</p>
              <form class="stack g16 tm-si-f" (submit)="$event.preventDefault(); pair()">
                <div class="fld" [class.invalid]="!!codeError()">
                  <label class="fld-l" for="tm-code">Pairing code</label>
                  <div class="fld-in">
                    <input
                      id="tm-code"
                      autocomplete="off"
                      autocapitalize="characters"
                      spellcheck="false"
                      placeholder="From Readers in the console"
                      aria-describedby="tm-code-e"
                      [value]="code()"
                      (input)="code.set(asValue($event)); codeError.set('')"
                    />
                  </div>
                  <div class="fld-e" id="tm-code-e" role="alert">
                    <rp-icon name="alertc" [size]="14" /><span>{{ codeError() }}</span>
                  </div>
                </div>
                <button
                  type="submit"
                  class="btn btn-accent btn-lg btn-block"
                  id="tm-si-btn"
                  [disabled]="busy()"
                >
                  <rp-icon name="key" [size]="17" /><span>{{
                    busy() ? 'Pairing…' : 'Pair and sign in'
                  }}</span>
                </button>
              </form>
              <p class="tm-fine">
                Lost the code? The institution administrator issues a new one from the reader
                register; a new code replaces the old pairing.
              </p>
            </div>
          }
          @case ('signin') {
            <div class="tm-si-card">
              <div class="eyebrow">{{ isPos() ? 'Step 1 of 2' : 'Terminal sign-in' }}</div>
              <h1>Sign in to this {{ isPos() ? 'counter' : 'reader' }}</h1>
              <p>This device signs in with the secret it received when it was paired.</p>
              <div class="stack g16 tm-si-f">
                @if (error()) {
                  <div class="note tone-bad">
                    <rp-icon name="alertc" [size]="17" />
                    <div class="grow">{{ error() }}</div>
                  </div>
                }
                <button
                  type="button"
                  class="btn btn-accent btn-lg btn-block"
                  id="tm-si-btn"
                  [disabled]="busy()"
                  (click)="signIn()"
                >
                  <rp-icon name="key" [size]="17" /><span>{{
                    busy() ? 'Signing in…' : 'Sign in'
                  }}</span>
                </button>
              </div>
              <p class="tm-fine">
                Moved to another device?
                <button type="button" class="tm-link" (click)="repair()">Pair again</button> with a
                new code from the reader register.
              </p>
            </div>
          }
          @case ('operator') {
            <div class="tm-si-card">
              <div class="eyebrow">Step 2 of 2</div>
              <h1>Operator, tap your tag</h1>
              <p>
                {{
                  reader()
                    ? 'The counter is signed in. Each operator taps their own NFC tag on the reader.'
                    : 'The counter is signed in. Each operator signs in with their own NFC tag.'
                }}
              </p>
              <div class="tm-si-tz"><rp-tapzone cls="tm-tz-md" icon="key" /></div>
              @if (!reader()) {
                <div style="margin-bottom: 12px"><rp-reader-launch [block]="true" /></div>
              }
              <form class="tm-tagin" (submit)="$event.preventDefault(); operator()">
                <div class="fld" [class.invalid]="!!tagError()">
                  <label class="fld-l" for="tm-tag">Tag reader</label>
                  <div class="fld-in">
                    <input
                      id="tm-tag"
                      type="password"
                      autocomplete="off"
                      placeholder="Tap the tag on the reader"
                      aria-describedby="tm-tag-e"
                      [value]="tag()"
                      (input)="tag.set(asValue($event)); tagError.set('')"
                    />
                  </div>
                  <div class="fld-e" id="tm-tag-e" role="alert">
                    <rp-icon name="alertc" [size]="14" /><span>{{ tagError() }}</span>
                  </div>
                </div>
              </form>
              <div class="tm-cards">
                @for (t of tags(); track t.id) {
                  <div class="tm-card" aria-disabled="true">
                    <span class="av sm" [style.--av]="avColor(t.operatorName)" aria-hidden="true">{{
                      initialsOf(t.operatorName)
                    }}</span>
                    <span class="grow"
                      ><b>{{ t.operatorName }}</b
                      ><small>Tag {{ t.tag }} · mobile {{ t.mobile }}</small></span
                    >
                    <span class="tm-go"><rp-icon name="nfc" [size]="16" /></span>
                  </div>
                } @empty {
                  <div class="tm-empty">
                    <rp-icon name="key" [size]="16" /><span
                      >No active operator tags. Register one from the POS menu.</span
                    >
                  </div>
                }
              </div>
            </div>
          }
        }
      </section>
    </div>
  </div>`,
})
export class TerminalSignin implements OnInit {
  private readonly device = inject(TerminalDevice);
  private readonly api = inject(TerminalApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly stage = signal<Stage>('loading');
  protected readonly cfg = this.device.config;
  protected readonly busy = signal(false);
  protected readonly online = signal(typeof navigator === 'undefined' || navigator.onLine);
  protected readonly code = signal('');
  protected readonly codeError = signal('');
  protected readonly error = signal('');
  protected readonly tag = signal('');
  /** CampusOne Card Reader is running on this computer (client 2026-10-08). */
  protected readonly reader = cardReader();
  private tagWatch: CardWatch | null = null;
  private readonly destroyRef = inject(DestroyRef);
  protected readonly tagError = signal('');
  protected readonly tags = signal<readonly PosTag[]>([]);

  protected readonly purpose = computed(() => {
    const p = this.cfg()?.terminal.purpose;
    return p ? PURPOSES[p] : { label: 'Terminal', icon: 'nfc' as const };
  });
  protected readonly isPos = computed(() => this.cfg()?.terminal.purpose === 'POS');
  protected readonly instActive = computed(() => this.cfg()?.institution.status === 'ACTIVE');
  protected readonly crest = computed(() => initials(this.cfg()?.institution.name ?? 'CampusOne'));
  protected readonly barSub = computed(() =>
    this.stage() === 'operator'
      ? 'Signed in · waiting for an operator'
      : `Signed out · ${this.isPos() ? 'orders and card taps' : 'taps'} are not accepted`,
  );

  protected readonly date = formatDate;
  protected readonly initialsOf = initials;
  protected readonly avColor = avColor;
  protected readonly shortId = (id: string) => id.slice(-12).toUpperCase();
  protected asValue(e: Event) {
    return (e.target as HTMLInputElement).value;
  }

  async ngOnInit() {
    // From the console's "Pair this computer" (CampusOne Card Reader): the code is filled in.
    const code = this.route.snapshot.queryParamMap.get('code');
    if (code) {
      this.code.set(code);
      return this.stage.set('pair');
    }
    if (!(await this.device.paired())) return this.stage.set('pair');
    if (this.device.signedOut) return this.stage.set('signin');
    await this.signIn();
  }

  protected async pair() {
    const code = this.code().trim();
    if (!code) return this.codeError.set('Enter the pairing code');
    this.busy.set(true);
    try {
      await this.device.pair(code);
      await this.signIn();
    } catch (e) {
      this.codeError.set(this.message(e));
      this.stage.set('pair');
    } finally {
      this.busy.set(false);
    }
  }

  protected async signIn() {
    this.busy.set(true);
    this.error.set('');
    try {
      const cfg = await this.device.signIn();
      if (cfg.terminal.purpose !== 'POS') {
        await this.router.navigateByUrl('/terminal/reader');
        return;
      }
      const menu = await this.api.menu();
      if (menu.operator) {
        await this.router.navigateByUrl('/terminal/pos');
        return;
      }
      this.tags.set((await this.api.tags()).items.filter((t) => t.status === 'ACTIVE'));
      this.stage.set('operator');
      setTimeout(() => document.getElementById('tm-tag')?.focus(), 0);
      this.watchTags();
      if (!this.tags().length) await this.router.navigateByUrl('/terminal/pos');
    } catch (e) {
      if (
        e instanceof ApiProblem &&
        ['TRM.SIGNATURE_INVALID', 'TRM.DEVICE_MISMATCH'].includes(e.code)
      ) {
        await this.device.forget();
        this.codeError.set(this.message(e));
        this.stage.set('pair');
      } else {
        this.error.set(this.message(e));
        this.stage.set('signin');
      }
    } finally {
      this.busy.set(false);
    }
  }

  /** With CampusOne Card Reader the tag on the reader signs the operator in. */
  private watchTags() {
    this.tagWatch?.stop();
    this.tagWatch = watchCards(
      async (token) => {
        if (this.stage() !== 'operator') return;
        this.tag.set(token);
        this.tagError.set('');
        await this.operator();
      },
      { onProblem: (m) => this.tagError.set(m) },
    );
    this.destroyRef.onDestroy(() => this.tagWatch?.stop());
  }

  protected async operator() {
    const token = this.tag().trim();
    if (!token) return this.tagError.set('Tap the tag on the reader');
    try {
      await this.api.operatorSignIn(token);
      await this.router.navigateByUrl('/terminal/pos');
    } catch (e) {
      this.tag.set('');
      this.tagError.set(this.message(e));
    }
  }

  protected async repair() {
    await this.device.forget();
    this.stage.set('pair');
  }

  private message(e: unknown) {
    return e instanceof ApiProblem
      ? e.detail || translate(e.code, e.params)
      : translate('GEN.INTERNAL');
  }
}
