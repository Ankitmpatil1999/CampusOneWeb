import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { fixedOrigin, menuPlacement, type DropdownOption } from './Dropdown';
import { Icon } from './Icon';

/**
 * The prototype's ui.select with `search: true`: the `.dd` button and a `.dd-menu` with a search box
 * on top, filtering the options by label and sub text as the user types. Keyboard as rp-dd.
 */
@Component({
  selector: 'rp-search-select',
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
        class="dd-menu open"
        role="listbox"
        [attr.aria-label]="placeholder()"
        [style.left.px]="pos().left"
        [style.top.px]="pos().top"
        [style.width.px]="pos().width"
        (mousedown)="$event.stopPropagation()"
      >
        <div class="dd-search">
          <input
            #search
            type="text"
            placeholder="Search"
            autocomplete="off"
            [attr.aria-label]="'Search ' + placeholder().toLowerCase()"
            [value]="q()"
            (input)="setQ($event)"
            (keydown)="key($event)"
          />
        </div>
        @for (o of shown(); track o.v; let i = $index) {
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
          <div class="dd-none">{{ options().length ? 'Nothing matches' : empty() }}</div>
        }
      </div>
    }`,
})
export class SearchSelect {
  readonly inputId = input.required<string>();
  readonly options = input.required<readonly DropdownOption[]>();
  readonly value = input<string>('');
  readonly placeholder = input('Select');
  readonly disabled = input(false);
  /** Shown when there is nothing to choose at all. */
  readonly empty = input('Nothing to choose');
  readonly changed = output<string>();

  private readonly btn = viewChild<ElementRef<HTMLButtonElement>>('btn');
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');
  protected readonly open = signal(false);
  protected readonly q = signal('');
  protected readonly cursor = signal(-1);
  protected readonly pos = signal({ left: 0, top: 0, width: 0 });
  protected readonly current = computed(() => this.options().find((o) => o.v === this.value()));
  protected readonly shown = computed(() => {
    const q = this.q().trim().toLowerCase();
    return q
      ? this.options().filter(
          (o) => o.l.toLowerCase().includes(q) || (o.sub ?? '').toLowerCase().includes(q),
        )
      : this.options();
  });

  constructor() {
    const close = (e: Event) => {
      if (!this.open()) return;
      const b = this.btn()?.nativeElement;
      if (!(e.target instanceof Node) || !b?.contains(e.target)) this.open.set(false);
    };
    // Scrolling the page or a drawer moves the open menu with its button; it closes once the
    // button leaves the window (closing on every scroll lost the menu to a touchpad's glide, or to
    // the scroll that focusing the search box can cause).
    const follow = (e: Event) => {
      if (!this.open()) return;
      if (e.target instanceof Element && e.target.closest('.dd-menu')) return;
      const b = this.btn()?.nativeElement;
      const p = b ? menuPlacement(b) : null;
      if (p) this.pos.set({ left: p.left, top: p.top, width: p.width });
      else this.open.set(false);
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', follow, true);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', follow, true);
    });
  }

  protected toggle() {
    if (this.open()) {
      this.open.set(false);
      return;
    }
    const b = this.btn()?.nativeElement;
    if (b) {
      const r = b.getBoundingClientRect();
      const o = fixedOrigin(b);
      this.pos.set({ left: r.left - o.left, top: r.bottom + 4 - o.top, width: r.width });
    }
    this.q.set('');
    this.cursor.set(this.options().findIndex((o) => o.v === this.value()));
    this.open.set(true);
    setTimeout(() => this.search()?.nativeElement.focus({ preventScroll: true }), 30);
  }

  protected setQ(e: Event) {
    this.q.set((e.target as HTMLInputElement).value);
    this.cursor.set(this.shown().length ? 0 : -1);
  }

  protected pick(o: DropdownOption) {
    this.open.set(false);
    if (o.v !== this.value()) this.changed.emit(o.v);
    this.btn()?.nativeElement.focus();
  }

  protected key(e: KeyboardEvent) {
    const n = this.shown().length;
    if (!this.open()) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.toggle();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.open.set(false);
      this.btn()?.nativeElement.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      this.cursor.set((this.cursor() + step + n) % Math.max(n, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const o = this.shown()[this.cursor()];
      if (o) this.pick(o);
    }
  }
}
