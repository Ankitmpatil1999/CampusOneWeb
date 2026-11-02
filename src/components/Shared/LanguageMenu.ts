/**
 * The language menu (Phase 10; client request 2026-10-05): the top bar's pill (the prototype's
 * `.c-year`) with the language in use, and the prototype's `.dd-menu` of the languages the platform
 * has switched on — Kannada next to English. Choosing one saves it (for the account when signed in)
 * and reloads the page in that language.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
  type OnInit,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { I18n } from '../Utils/i18n';
import { t as tr } from '../Utils/t';
import { fixedOrigin } from './Dropdown';
import { Icon } from './Icon';

@Component({
  selector: 'rp-lang-menu',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<button
      #btn
      type="button"
      class="c-year"
      id="lang-menu"
      aria-haspopup="listbox"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="label + ': ' + current().nativeName"
      [title]="label"
      (click)="toggle()"
    >
      <rp-icon name="lang" [size]="15" /><b>{{ current().nativeName }}</b
      ><rp-icon name="down" [size]="14" />
    </button>
    @if (open()) {
      <div
        #menu
        class="dd-menu open"
        role="listbox"
        [attr.aria-label]="label"
        [style.left.px]="pos().left"
        [style.top.px]="pos().top"
        [style.min-width.px]="200"
      >
        @for (l of i18n.languages(); track l.code) {
          <button
            type="button"
            class="dd-opt"
            role="option"
            [class.on]="l.code === i18n.lang()"
            [attr.aria-selected]="l.code === i18n.lang()"
            (mousedown)="$event.preventDefault()"
            (click)="pick(l.code)"
          >
            <span>{{ l.nativeName }}</span>
            @if (l.code !== 'en') {
              <span class="sub">{{ l.name }}</span>
            }
            @if (l.code === i18n.lang()) {
              <span class="tick"><rp-icon name="check" [size]="15" /></span>
            }
          </button>
        }
        @if (i18n.machineDraft()) {
          <div class="dd-none">{{ machine }}</div>
        }
      </div>
    }`,
})
export class LanguageMenu implements OnInit {
  protected readonly i18n = inject(I18n);
  /** The signed-in surface whose account keeps the choice (none on sign-in pages). */
  readonly surface = input<'console' | 'ops' | null>(null);
  private readonly btn = viewChild<ElementRef<HTMLButtonElement>>('btn');
  private readonly menu = viewChild<ElementRef<HTMLDivElement>>('menu');
  protected readonly open = signal(false);
  protected readonly pos = signal({ left: 0, top: 0 });
  protected readonly label = tr('ui.web.lang.label');
  protected readonly machine = tr('ui.web.lang.machine');
  protected readonly current = computed(
    () =>
      this.i18n.languages().find((l) => l.code === this.i18n.lang()) ?? {
        code: 'en',
        name: 'English',
        nativeName: 'English',
      },
  );

  constructor() {
    const close = (e: Event) => {
      if (!this.open()) return;
      // Pressing a language or scrolling the list keeps the menu open: the click picks it.
      const m = this.menu()?.nativeElement;
      if (e.target instanceof Node && m?.contains(e.target)) return;
      const b = this.btn()?.nativeElement;
      if (e.type === 'scroll' || !(e.target instanceof Node) || !b?.contains(e.target)) {
        this.open.set(false);
      }
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
    });
  }

  ngOnInit() {
    void this.i18n.loadLanguages();
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
      // Right-aligned under the pill, kept inside the window.
      this.pos.set({
        left: Math.max(8, Math.min(r.right - 200, window.innerWidth - 208)) - o.left,
        top: r.bottom + 4 - o.top,
      });
    }
    this.open.set(true);
  }

  protected pick(code: string) {
    this.open.set(false);
    void this.i18n.change(code, this.surface() ?? undefined);
  }
}
