/**
 * The prototype's custom dropdown (ui.select): a `.dd` button showing the chosen option and a
 * floating `.dd-menu` of `.dd-opt` rows (label, optional sub text, tick on the current one).
 * Keyboard: Enter/Space/ArrowDown open; ArrowUp/ArrowDown move; Enter picks; Escape closes.
 * The menu opens upwards (the prototype's `.dd-menu.up`) when there is no room below the button. While
 * open it follows its button when the page or a drawer scrolls, and closes when the button leaves the
 * window or the page is pressed outside it.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Icon } from './Icon';

export interface DropdownOption {
  readonly v: string;
  readonly l: string;
  readonly sub?: string;
}

const set = (v: string | undefined) => !!v && v !== 'none' && v !== 'auto' && v !== 'normal';

/**
 * Where `position: fixed` is measured from for `el`'s menus: the viewport, or the nearest ancestor
 * that makes itself the containing block — a modal keeps an identity transform after its entry
 * animation, so a menu placed from viewport coordinates would land off its button.
 */
export function fixedOrigin(el: Element): { left: number; top: number } {
  for (let n = el.parentElement; n; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (
      set(s.transform) ||
      set(s.filter) ||
      set(s.perspective) ||
      set(s.backdropFilter) ||
      /paint|layout|strict|content/.test(s.contain || '') ||
      /transform|filter|perspective/.test(s.willChange || '')
    ) {
      const r = n.getBoundingClientRect();
      return { left: r.left + n.clientLeft, top: r.top + n.clientTop };
    }
  }
  return { left: 0, top: 0 };
}

/**
 * Where a floating menu goes for its button: under it, or above it when the menu (if given) would
 * leave the window below and there is more room above. Null once the button has left the window.
 */
export function menuPlacement(
  b: HTMLElement,
  menu?: HTMLElement | null,
): { up: boolean; left: number; top: number; width: number } | null {
  const r = b.getBoundingClientRect();
  if (r.bottom < 0 || r.top > window.innerHeight) return null;
  const o = fixedOrigin(b);
  const h = menu?.offsetHeight ?? 0;
  const below = window.innerHeight - r.bottom - 4;
  const up = h > below && r.top - 4 > below;
  return {
    up,
    left: r.left - o.left,
    top: (up ? Math.max(4, r.top - 4 - h) : r.bottom + 4) - o.top,
    width: r.width,
  };
}

@Component({
  selector: 'rp-dd',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="dd" [class.open]="open()" [class.is-disabled]="disabled()">
      <button
        #btn
        type="button"
        class="dd-btn"
        [id]="inputId() + '-b'"
        [disabled]="disabled()"
        aria-haspopup="listbox"
        [attr.aria-expanded]="open()"
        [attr.aria-describedby]="inputId() + '-e'"
        (click)="toggle()"
        (keydown)="key($event)"
      >
        <span class="lbl" [class.ph]="!current()">{{ current()?.l ?? placeholder() }}</span>
        <span class="caret"><rp-icon name="down" [size]="16" /></span>
      </button>
    </div>
    @if (open()) {
      <div
        #menu
        class="dd-menu open"
        [class.up]="up()"
        role="listbox"
        [attr.aria-label]="placeholder()"
        [style.left.px]="pos().left"
        [style.top.px]="pos().top"
        [style.width.px]="pos().width"
      >
        @for (o of options(); track o.v; let i = $index) {
          <button
            type="button"
            class="dd-opt"
            role="option"
            [class.on]="o.v === value()"
            [class.cur]="i === cursor()"
            [attr.aria-selected]="o.v === value()"
            (mousedown)="$event.preventDefault()"
            (click)="pick(o)"
          >
            <span>{{ o.l }}</span>
            @if (o.sub) {
              <span class="sub">{{ o.sub }}</span>
            }
            @if (o.v === value()) {
              <span class="tick"><rp-icon name="check" [size]="15" /></span>
            }
          </button>
        } @empty {
          <div class="dd-none">Nothing to choose</div>
        }
      </div>
    }`,
})
export class Dropdown {
  readonly inputId = input.required<string>();
  readonly options = input.required<readonly DropdownOption[]>();
  readonly value = input<string>('');
  readonly placeholder = input('Select');
  readonly disabled = input(false);
  readonly changed = output<string>();

  private readonly btn = viewChild<ElementRef<HTMLButtonElement>>('btn');
  private readonly menu = viewChild<ElementRef<HTMLDivElement>>('menu');
  private readonly injector = inject(Injector);
  protected readonly open = signal(false);
  protected readonly up = signal(false);
  protected readonly cursor = signal(-1);
  protected readonly pos = signal({ left: 0, top: 0, width: 0 });
  protected readonly current = computed(() => this.options().find((o) => o.v === this.value()));

  constructor() {
    const close = (e: Event) => {
      if (!this.open()) return;
      // Pressing an option keeps the menu open: the option's click picks it. (Closing on the press
      // removed the menu before a real click's mouse-up.)
      const m = this.menu()?.nativeElement;
      if (e.target instanceof Node && m?.contains(e.target)) return;
      const b = this.btn()?.nativeElement;
      if (!(e.target instanceof Node) || !b?.contains(e.target)) this.open.set(false);
    };
    // Scrolling the page or a drawer moves the open menu with its button (a touchpad's glide after a
    // scroll used to close the menu as it opened); it closes once the button leaves the window.
    // Scrolling the option list itself changes nothing.
    const follow = (e: Event) => {
      if (!this.open()) return;
      const m = this.menu()?.nativeElement;
      if (e.target instanceof Node && m?.contains(e.target)) return;
      this.place();
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
    });
  }

  protected toggle() {
    if (this.open()) {
      this.open.set(false);
      return;
    }
    this.up.set(false);
    this.cursor.set(this.options().findIndex((o) => o.v === this.value()));
    this.place();
    this.open.set(true);
    // Once drawn, the menu's height is known: place it again (above the button when it would leave
    // the window below and there is more room above).
    afterNextRender(() => this.place(), { injector: this.injector });
  }

  /** Puts the menu under (or over) the button; closes it when the button is out of the window. */
  private place() {
    const b = this.btn()?.nativeElement;
    if (!b) return;
    const p = menuPlacement(b, this.menu()?.nativeElement);
    if (!p) {
      this.open.set(false);
      return;
    }
    this.up.set(p.up);
    this.pos.set({ left: p.left, top: p.top, width: p.width });
  }

  protected pick(o: DropdownOption) {
    this.open.set(false);
    if (o.v !== this.value()) this.changed.emit(o.v);
    this.btn()?.nativeElement.focus();
  }

  protected key(e: KeyboardEvent) {
    const n = this.options().length;
    if (!this.open()) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.toggle();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this.open.set(false);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      this.cursor.set((this.cursor() + step + n) % Math.max(n, 1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const o = this.options()[this.cursor()];
      if (o) this.pick(o);
    }
  }
}
