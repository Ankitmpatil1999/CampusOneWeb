/**
 * The prototype's console building blocks: page head (`.c-ph`), card with a header (`card` /
 * `cardH`), key figure (`ui.kpi`) and empty state (`ui.empty`). They render the prototype's markup
 * so its stylesheet applies unchanged.
 */
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { Icon } from './Icon';
import type { IconName } from '../Utils/icons';

@Component({
  selector: 'rp-page-head',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="c-ph">
    <div class="c-pt">
      <h1>{{ title() }}</h1>
      @if (sub()) {
        <p>{{ sub() }}</p>
      }
    </div>
    <div class="c-pa"><ng-content /></div>
  </div>`,
})
export class PageHead {
  readonly title = input.required<string>();
  readonly sub = input<string>('');
}

@Component({
  selector: 'rp-card',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="card">
    <div class="card-h">
      @if (icon(); as i) {
        <span [class]="plainIcon() ? 'li-ic sm' : 'cp-hic'"
          ><rp-icon [name]="i" [size]="16"
        /></span>
      }
      <span class="t-h4">{{ title() }}</span>
      <ng-content select="[card-right]" />
    </div>
    <div [class.card-b]="!flush()"><ng-content /></div>
  </div>`,
})
export class Card {
  readonly title = input.required<string>();
  readonly icon = input<IconName | null>(null);
  /** The back office's grey header icon (cardH) instead of the console's brand tile. */
  readonly plainIcon = input(false);
  readonly flush = input(false);
}

export type Tone = 'ok' | 'bad' | 'warn' | 'info' | 'accent' | 'brand' | 'violet' | null;

@Component({
  selector: 'rp-kpi',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div
    class="kpi"
    [class.hover]="!!link()"
    [attr.role]="link() ? 'link' : null"
    [attr.tabindex]="link() ? 0 : null"
    (click)="go()"
    (keydown.enter)="go()"
  >
    <span
      class="k-ic"
      [style.background]="tone() ? 'var(--' + tone() + '-soft)' : null"
      [style.color]="tone() ? 'var(--' + tone() + ')' : null"
      ><rp-icon [name]="icon()" [size]="17"
    /></span>
    <span class="k-l">{{ label() }}</span>
    <span class="k-v"
      >{{ value() }}
      @if (small()) {
        <small class="t-sm t-muted" style="font-family: var(--f-body)">{{ small() }}</small>
      }
    </span>
    @if (delta()) {
      <span class="k-d" [class.up]="dir() === 'up'" [class.down]="dir() === 'down'">
        @if (dir()) {
          <rp-icon [name]="dir() === 'up' ? 'trendup' : 'trenddown'" [size]="13" />
        }
        {{ delta() }}</span
      >
    }
  </div>`,
})
export class Kpi {
  private readonly router = inject(Router);
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly icon = input.required<IconName>();
  readonly tone = input<Tone>(null);
  readonly delta = input('');
  /** Smaller text after the value (the prototype's "6 <small>of 9</small>"). */
  readonly small = input('');
  /** The delta's trend arrow and colour (k-d up / down). */
  readonly dir = input<'up' | 'down' | null>(null);
  /** The page the figure opens (ui.kpi go): the card becomes a link. */
  readonly link = input<string | null>(null);

  protected go() {
    const to = this.link();
    if (to) void this.router.navigateByUrl(to);
  }
}

@Component({
  selector: 'rp-empty',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="empty">
    <div class="empty-ic"><rp-icon [name]="icon()" [size]="26" /></div>
    <h4>{{ title() }}</h4>
    @if (text()) {
      <p>{{ text() }}</p>
    }
    <ng-content />
  </div>`,
})
export class Empty {
  readonly icon = input<IconName>('inbox');
  readonly title = input('Nothing here yet');
  readonly text = input('');
}
