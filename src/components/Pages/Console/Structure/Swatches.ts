import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { SWATCHES } from './academic-format';

/** The prototype's colour swatches (`.cc-sw`): a radio group of the ten console colours. */
@Component({
  selector: 'rp-swatches',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="cc-sw" role="radiogroup" aria-label="Colour">
    @for (c of swatches; track c) {
      <label [title]="c"
        ><input
          type="radio"
          [name]="name()"
          [value]="c"
          [checked]="c.toLowerCase() === value().toLowerCase()"
          [disabled]="disabled()"
          [attr.aria-label]="'Colour ' + c"
          (change)="changed.emit(c)" /><i [style.background]="c"></i
      ></label>
    }
  </div>`,
})
export class Swatches {
  protected readonly swatches = SWATCHES;
  readonly name = input.required<string>();
  readonly value = input('');
  readonly disabled = input(false);
  readonly changed = output<string>();
}
