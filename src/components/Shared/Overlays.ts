/**
 * The prototype's overlays for the console and back office: toasts (RP.toast), the confirmation
 * dialog with an optional recorded reason (RP.confirm) and the modal sheet (RP.sheet, kind modal).
 * They emit the prototype's markup (`.toasts`, `.ov.fixed > .modal`), so its stylesheet applies.
 */
import {
  ChangeDetectionStrategy,
  Component,
  Injectable,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Icon } from './Icon';
import type { IconName } from '../Utils/icons';

export type ToastTone = 'ok' | 'bad' | 'warn' | 'info';

interface Toast {
  readonly id: number;
  readonly title: string;
  readonly sub?: string;
  readonly tone: ToastTone;
  readonly out: boolean;
}

export interface ConfirmOptions {
  readonly title: string;
  readonly text?: string;
  readonly ok?: string;
  readonly cancel?: string;
  readonly tone?: 'brand' | 'warn' | 'bad';
  readonly icon?: IconName;
  /** Ask for a reason (recorded); the dialog resolves with it. */
  readonly reason?: {
    readonly label?: string;
    readonly placeholder?: string;
    readonly min?: number;
    /** The most characters the server accepts (the textarea stops there). */
    readonly max?: number;
    /** false: the reason may be left empty (prototype feature toggles). */
    readonly required?: boolean;
  };
}

export type ConfirmResult = false | { readonly reason?: string };

interface ConfirmState extends ConfirmOptions {
  readonly resolve: (r: ConfirmResult) => void;
}

@Injectable({ providedIn: 'root' })
export class Overlays {
  readonly toasts = signal<readonly Toast[]>([]);
  readonly confirmState = signal<ConfirmState | null>(null);
  private seq = 0;

  toast(title: string, o: { sub?: string; tone?: ToastTone; ms?: number } = {}) {
    const id = ++this.seq;
    const t: Toast = {
      id,
      title,
      tone: o.tone ?? 'ok',
      out: false,
      ...(o.sub ? { sub: o.sub } : {}),
    };
    this.toasts.update((list) => [...list, t].slice(-3));
    setTimeout(() => {
      this.toasts.update((list) => list.map((x) => (x.id === id ? { ...x, out: true } : x)));
      setTimeout(() => this.toasts.update((list) => list.filter((x) => x.id !== id)), 240);
    }, o.ms ?? 3400);
  }

  confirm(o: ConfirmOptions): Promise<ConfirmResult> {
    return new Promise((resolve) => this.confirmState.set({ ...o, resolve }));
  }
}

/** Toasts and the confirmation dialog; placed once inside the console frame. */
@Component({
  selector: 'rp-overlays',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @if (overlays.toasts().length) {
      <!-- Above open drawers and dialogs (.ov.fixed, 700) so a saved toast is seen; below menus. -->
      <div class="toasts" [class.fixed]="fixed()" style="z-index: 750">
        @for (t of overlays.toasts(); track t.id) {
          <div class="toast" [class]="t.tone" [class.out]="t.out" role="status">
            <span class="t-ic"
              ><rp-icon [name]="toastIcon(t.tone)" [size]="13" [stroke]="2.6"
            /></span>
            <div class="grow">
              <b>{{ t.title }}</b>
              @if (t.sub) {
                <span>{{ t.sub }}</span>
              }
            </div>
          </div>
        }
      </div>
    }
    @if (overlays.confirmState(); as c) {
      <div class="ov fixed" (click)="answer(false)" (keydown.escape)="answer(false)" tabindex="-1">
        <div
          class="modal narrow"
          role="alertdialog"
          aria-modal="true"
          [attr.aria-label]="c.title"
          (click)="$event.stopPropagation()"
          (keydown)="$event.stopPropagation()"
          tabindex="-1"
        >
          <div class="sh-b" style="padding-top: 18px">
            <div class="m-center" style="padding-top: 6px">
              <div class="confirm-ic" [class]="c.tone ?? 'brand'">
                <rp-icon [name]="dialogIcon(c)" [size]="24" />
              </div>
              <h3 class="t-h3" style="font-family: var(--f-display); font-size: 18px">
                {{ c.title }}
              </h3>
              @if (c.text) {
                <p class="t-sm t-muted" style="margin-top: 6px; max-width: 40ch; line-height: 1.55">
                  {{ c.text }}
                </p>
              }
            </div>
            @if (c.reason) {
              <div style="margin-top: 16px">
                <div class="fld" [class.invalid]="reasonError()">
                  <label class="fld-l" for="cf-reason"
                    >{{ c.reason.label ?? 'Reason' }}
                    @if (c.reason.required !== false) {
                      <span class="req">*</span>
                    }
                  </label>
                  <div class="fld-in">
                    <textarea
                      id="cf-reason"
                      rows="3"
                      [placeholder]="c.reason.placeholder ?? ''"
                      [attr.maxlength]="c.reason.max ?? null"
                      aria-describedby="cf-reason-e"
                      [value]="reason()"
                      (input)="reason.set(asValue($event)); reasonError.set('')"
                    ></textarea>
                  </div>
                  <div class="fld-e" id="cf-reason-e" role="alert">
                    <rp-icon name="alertc" [size]="14" /><span>{{ reasonError() }}</span>
                  </div>
                </div>
              </div>
            }
          </div>
          <div class="sh-f">
            <button type="button" class="btn btn-sec" (click)="answer(false)">
              <span>{{ c.cancel ?? 'Cancel' }}</span>
            </button>
            <button
              type="button"
              class="btn"
              [class.btn-danger]="c.tone === 'bad'"
              [class.btn-pri]="c.tone !== 'bad'"
              (click)="answer(true)"
            >
              <span>{{ c.ok ?? 'Confirm' }}</span>
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class OverlayHost {
  protected readonly overlays = inject(Overlays);
  /** Toasts fixed to the window (`.toasts.fixed`) for pages that scroll with the document (portal). */
  readonly fixed = input(false);
  protected readonly reason = signal('');
  protected readonly reasonError = signal('');

  protected toastIcon(tone: ToastTone): IconName {
    return ({ ok: 'check', bad: 'x', warn: 'alert', info: 'info' } as const)[tone];
  }

  protected dialogIcon(c: ConfirmOptions): IconName {
    return c.icon ?? (c.tone === 'bad' ? 'alert' : c.tone === 'warn' ? 'alertc' : 'help');
  }

  protected asValue(e: Event) {
    return (e.target as HTMLTextAreaElement).value;
  }

  protected answer(yes: boolean) {
    const c = this.overlays.confirmState();
    if (!c) return;
    if (yes && c.reason) {
      const r = this.reason().trim();
      const min = c.reason.min ?? 5;
      if (!r && c.reason.required === false) return this.finish(c, {});
      if (!r) return this.reasonError.set('Enter a reason to continue');
      if (r.length < min) return this.reasonError.set(`Write at least ${min} characters`);
      this.finish(c, { reason: r });
      return;
    }
    this.finish(c, yes ? {} : false);
  }

  private finish(c: ConfirmState, r: ConfirmResult) {
    this.overlays.confirmState.set(null);
    this.reason.set('');
    this.reasonError.set('');
    c.resolve(r);
  }
}

/** RP.sheet as a modal or drawer: header with title, sub and close; body; footer (`[modal-foot]`). */
@Component({
  selector: 'rp-modal',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div
    class="ov fixed"
    (click)="dismiss() && closed.emit()"
    (keydown.escape)="dismiss() && closed.emit()"
    tabindex="-1"
  >
    <div
      [class]="cls()"
      [class.modal]="!drawer()"
      [class.drawer]="drawer()"
      [class.wide]="wide() || (drawer() && !slim())"
      [class.narrow]="narrow() && !wide() && !drawer()"
      role="dialog"
      aria-modal="true"
      [attr.aria-label]="title()"
      (click)="$event.stopPropagation()"
      (keydown)="$event.stopPropagation()"
      tabindex="-1"
    >
      <div class="sh-h">
        @if (icon(); as i) {
          <span class="li-ic" style="background: var(--brand-soft); color: var(--brand-2)"
            ><rp-icon [name]="i" [size]="19"
          /></span>
        }
        <div class="sh-t">
          <h3>{{ title() }}</h3>
          @if (sub()) {
            <p>{{ sub() }}</p>
          }
        </div>
        @if (dismiss()) {
          <button type="button" class="x-btn" aria-label="Close" (click)="closed.emit()">
            <rp-icon name="x" [size]="18" />
          </button>
        }
      </div>
      <div class="sh-b"><ng-content /></div>
      <div class="sh-f" [hidden]="!foot()"><ng-content select="[modal-foot]" /></div>
    </div>
  </div>`,
})
export class Modal {
  readonly title = input.required<string>();
  readonly sub = input('');
  readonly narrow = input(true);
  /** The prototype's wide modal (RP.sheet size wide). */
  readonly wide = input(false);
  /** The prototype's side drawer (RP.sheet kind drawer, wide) instead of a centred modal. */
  readonly drawer = input(false);
  /** A 560 px drawer (RP.sheet kind drawer without size wide). */
  readonly slim = input(false);
  /** The header icon (RP.sheet icon). */
  readonly icon = input<IconName | null>(null);
  /** Extra classes of the sheet (RP.sheet size, e.g. `cm-m`). */
  readonly cls = input('');
  /** false: no footer bar (RP.sheet without `foot`). */
  readonly foot = input(true);
  /**
   * false: no close button, and neither a click outside nor Escape closes it (RP.sheet
   * `dismiss: false`) — the footer's own button is the only way out.
   */
  readonly dismiss = input(true);
  readonly closed = output<void>();
}
