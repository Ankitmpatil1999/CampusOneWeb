import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { ensureCardReader, watchCards, type CardWatch } from '../../../Utils/card-reader';
import { formatTime } from '../../../Utils/format';
import { t as tr } from '../../../Utils/t';

/** What one tap did, as the teacher reads it. */
export interface TapLine {
  readonly tone: 'ok' | 'info' | 'bad';
  readonly name: string | null;
  readonly text: string;
}

/**
 * "Take attendance by card" (client 2026-10-13; ATT-028): the teacher's computer has the USB reader
 * and CampusOne Card Reader; every student taps their card and is marked at once. The page passes
 * `handle`, which records one card and says what happened; this keeps the reader running, shows the
 * latest taps and how many were marked, and stops when the teacher stops it or leaves. The front
 * desk uses it for staff cards (client 2026-10-22) with its own `texts`.
 */
@Component({
  selector: 'rp-card-taker',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card pad stack g12" id="ta-card">
      <div class="row g12 wrap" style="align-items: center">
        <span
          class="ic"
          style="width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center"
          [style.background]="on() ? 'var(--brand-soft, var(--surface-2))' : 'var(--surface-2)'"
          [style.color]="on() ? 'var(--brand)' : 'var(--ink-3)'"
        >
          <rp-icon name="nfc" [size]="20" />
        </span>
        <div class="grow" style="min-width: 0">
          <b>{{ texts().title ?? t('ui.web.tch.card.title') }}</b>
          <div class="t-muted t-sm">
            {{
              on()
                ? (texts().on ?? t('ui.web.tch.card.on'))
                : (texts().off ?? t('ui.web.tch.card.off'))
            }}
          </div>
        </div>
        @if (on()) {
          <span class="chip dot tone-ok" id="ta-card-count">{{
            texts().count?.(count()) ?? t('ui.web.tch.card.count', { n: count() })
          }}</span>
          <button type="button" class="btn btn-sec btn-sm" id="ta-card-stop" (click)="stop()">
            <span>{{ t('ui.web.tch.card.stop') }}</span>
          </button>
        } @else {
          <button
            type="button"
            class="btn btn-pri btn-sm"
            id="ta-card-start"
            [class.is-busy]="starting()"
            [disabled]="starting()"
            (click)="start()"
          >
            <rp-icon name="nfc" [size]="16" /><span>{{
              starting() ? t('ui.web.tch.card.starting') : t('ui.web.tch.card.start')
            }}</span>
          </button>
        }
      </div>
      @if (note()) {
        <div class="note tone-warn" role="alert" id="ta-card-note">
          <rp-icon name="alert" [size]="17" />
          <div class="grow">{{ note() }}</div>
        </div>
      }
      @if (feed().length) {
        <ul class="stack g6" style="list-style: none; margin: 0; padding: 0" id="ta-card-feed">
          @for (l of feed(); track l.at) {
            <li class="row g8" style="align-items: center">
              <span
                [class]="
                  'chip dot tone-' + (l.tone === 'ok' ? 'ok' : l.tone === 'bad' ? 'bad' : 'info')
                "
                >{{ time(l.at) }}</span
              >
              @if (l.name) {
                <b>{{ l.name }}</b>
              }
              <span class="t-muted">{{ l.text }}</span>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class CardTaker {
  /** Records one card and says what happened. */
  readonly handle = input.required<(token: string) => Promise<TapLine>>();
  /** True when reading starts, false when it stops. */
  readonly active = output<boolean>();
  /** The panel's own wording (the front desk's staff cards); the teacher's otherwise. */
  readonly texts = input<{
    readonly title?: string;
    readonly on?: string;
    readonly off?: string;
    readonly count?: (n: number) => string;
  }>({});

  protected readonly t = tr;
  protected readonly on = signal(false);
  protected readonly starting = signal(false);
  protected readonly note = signal('');
  protected readonly count = signal(0);
  protected readonly feed = signal<readonly (TapLine & { at: number })[]>([]);
  private watch: CardWatch | null = null;
  private busy = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  protected async start() {
    this.starting.set(true);
    this.note.set('');
    const ready = await ensureCardReader();
    this.starting.set(false);
    if (!ready) {
      this.note.set(tr('ui.web.tch.card.noReader'));
      return;
    }
    this.watch = watchCards(
      async (token) => {
        // One card at a time: the next is read once this one is recorded.
        if (this.busy) return;
        this.busy = true;
        this.note.set('');
        try {
          const line = await this.handle()(token);
          if (line.tone === 'ok') this.count.update((n) => n + 1);
          this.feed.update((f) => [{ ...line, at: Date.now() }, ...f].slice(0, 6));
        } finally {
          this.busy = false;
        }
      },
      { onProblem: (m) => this.note.set(m) },
    );
    this.on.set(true);
    this.active.emit(true);
  }

  stop() {
    this.watch?.stop();
    this.watch = null;
    if (this.on()) {
      this.on.set(false);
      this.active.emit(false);
    }
  }

  protected time(at: number) {
    return formatTime(new Date(at));
  }
}
