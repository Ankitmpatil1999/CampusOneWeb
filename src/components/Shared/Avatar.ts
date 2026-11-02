import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** The prototype's avatar palette (AVC) and name hash (ui.avColor). */
const AVATAR_COLORS = [
  '#0C6F7D',
  '#B4582B',
  '#5E4BB0',
  '#1F7A4D',
  '#A23E6A',
  '#2D5DA8',
  '#8A6A12',
  '#3C6E71',
  '#8C3B3B',
  '#4F6D2E',
] as const;

export function avatarColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length] ?? AVATAR_COLORS[0];
}

/** RP.initials: up to two initials, titles (Dr., Mr. …) skipped. */
export function initials(name: string): string {
  return name
    .replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.)\s*/, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

/** ui.av: initials on the name's colour; `sq` gives the rounded-square school badge. */
@Component({
  selector: 'rp-av',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<span
    class="av"
    [class]="size()"
    [class.sq]="sq()"
    [style.--av]="color() || bg()"
    [style.--s]="px() ? px() + 'px' : null"
    [style.font-family]="sq() ? 'var(--f-display)' : null"
    aria-hidden="true"
    >{{ text() || letters() }}</span
  >`,
})
export class Avatar {
  readonly name = input.required<string>();
  /** '', 'xs', 'sm', 'lg' (prototype sizes) or an exact pixel size via `px`. */
  readonly size = input<'' | 'xs' | 'sm' | 'lg'>('');
  readonly px = input<number | null>(null);
  readonly sq = input(false);
  readonly color = input<string | null>(null);
  /** Fixed text instead of the initials (e.g. a school's short name). */
  readonly text = input<string | null>(null);
  protected readonly letters = computed(() => initials(this.name()));
  protected readonly bg = computed(() => avatarColor(this.name()));
}
