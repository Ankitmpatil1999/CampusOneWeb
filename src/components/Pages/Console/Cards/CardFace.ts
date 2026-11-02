import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon } from '../../../Shared/Icon';

/** The campus card drawn as the prototype's cardFace (`.cp-nfc`; greyed when not active). */
@Component({
  selector: 'rp-card-face',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="cp-nfc" [class.off]="!active()" aria-hidden="true">
    <rp-icon name="nfc" [size]="20" />
    <span class="t-mono">{{ token() ?? 'Blank card' }}</span>
    <div>
      <b style="font-size: 12.5px; display: block">{{ name() }}</b
      ><small>{{ line() }}</small>
    </div>
  </div>`,
})
export class CardFace {
  readonly name = input.required<string>();
  /** The masked token; null draws a blank card. */
  readonly token = input<string | null>(null);
  readonly active = input(true);
  /** "TVPS · 6 A". */
  readonly line = input('');
}
