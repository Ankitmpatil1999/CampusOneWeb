/**
 * The Aadhaar card and the PAN card, front and back (client 2026-10-13): four uploads, each with its
 * formats, to view and to remove — and a person's two numbers. The father's, the mother's, a
 * guardian's who is the primary contact and a hostel student's local guardian's are required; the
 * student's optional.
 */
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { fileSize } from '../admissions.store';
import { PaField, PaUpload, type PickedFile } from '../Shared/AdmissionsUi';
import { type FormState, digits, upper } from './form.ctx';
import {
  DIAL_CODES,
  ID_PREFIX,
  type CardSlot,
  type CardType,
  type Draft,
  type Holder,
} from './form.state';

/** A person's Aadhaar number and PAN, both required; write-only (what is kept shows masked). */
@Component({
  selector: 'rp-pa-ids',
  imports: [PaField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `@let x = f().d().ids[h()];
    @let k = f().d().kept.people[h()];
    <div class="pa-g2">
      <rp-pa-fld
        [fid]="id('aadhaar')"
        label="Aadhaar number"
        [req]="true"
        [hint]="
          k.aadhaar
            ? 'Saved: ' + k.aadhaar + ' — type the number again to change it'
            : 'The 12 digits on the Aadhaar card'
        "
        [error]="f().err(id('aadhaar'))"
      >
        <input
          [id]="id('aadhaar')"
          type="text"
          inputmode="numeric"
          maxlength="12"
          autocomplete="off"
          [placeholder]="k.aadhaar ?? '12 digits'"
          [attr.aria-describedby]="id('aadhaar') + '-e'"
          [value]="x.aadhaar"
          (input)="put('aadhaar', digits($event))"
        />
      </rp-pa-fld>
      <rp-pa-fld
        [fid]="id('pan')"
        label="PAN"
        [req]="true"
        [hint]="k.pan ? 'Saved: ' + k.pan + ' — type it again to change it' : ''"
        [error]="f().err(id('pan'))"
      >
        <input
          [id]="id('pan')"
          type="text"
          maxlength="10"
          autocomplete="off"
          autocapitalize="characters"
          [placeholder]="k.pan ?? 'e.g. ABCDE1234F'"
          [attr.aria-describedby]="id('pan') + '-e'"
          [value]="x.pan"
          (input)="put('pan', upper($event))"
        />
      </rp-pa-fld>
    </div>`,
})
export class IdNumbers {
  readonly f = input.required<FormState>();
  readonly h = input.required<Holder>();
  protected id(s: 'aadhaar' | 'pan') {
    return `${ID_PREFIX[this.h()]}-${s}`;
  }
  protected put(k: 'aadhaar' | 'pan', v: string) {
    const h = this.h();
    this.f().edit((d) => {
      d.ids[h][k] = v;
    });
    this.f().clear(this.id(k));
  }
  protected readonly digits = digits;
  protected readonly upper = upper;
}

/**
 * The country code in front of a mobile number (client 2026-10-13): India by default, then the
 * common codes. Placed inside the field's box, before the number.
 */
@Component({
  selector: 'rp-pa-cc',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<select
    class="pa-cc"
    [id]="fid()"
    [attr.aria-label]="'Country code for ' + (what() || 'the mobile')"
    (change)="picked.emit($any($event.target).value)"
  >
    @for (c of codes; track c.v) {
      <option [value]="c.v" [selected]="c.v === value()">{{ c.v }} {{ c.l }}</option>
    }
  </select>`,
})
export class CountryCode {
  readonly fid = input.required<string>();
  readonly value = input('+91');
  readonly what = input('');
  readonly picked = output<string>();
  protected readonly codes = DIAL_CODES;
}

@Component({
  selector: 'rp-pa-cards',
  imports: [PaUpload],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<fieldset class="pa-fs" [id]="fsId()">
    <legend>{{ title() }}</legend>
    @if (note()) {
      <p class="pa-muted">{{ note() }}</p>
    }
    <div class="pa-g2">
      @for (c of slots(); track c.t) {
        <rp-pa-upl
          [fid]="c.fid"
          [label]="c.l"
          [req]="required()"
          [opt]="!required()"
          icon="idcard"
          [file]="f().d().cards[c.t]"
          [progress]="f().pct(c.fid)"
          [error]="f().err(c.fid)"
          [formats]="formats()"
          (picked)="f().upload(c.fid, c.t, $event, put(c.t))"
          (viewed)="f().open(c.t)"
          (removed)="f().remove(c.fid, c.t, drop(c.t))"
        />
      }
    </div>
  </fieldset>`,
})
export class CardUploads {
  readonly f = input.required<FormState>();
  readonly slots = input.required<readonly CardSlot[]>();
  readonly title = input.required<string>();
  readonly note = input('');
  readonly required = input(false);
  readonly fsId = input('');
  protected readonly formats = computed(
    () =>
      `PDF, JPG or PNG · up to ${fileSize(
        this.f().landing()?.rules.documents.maxBytes ?? 2 * 1024 * 1024,
      ).replace('.0 ', ' ')}`,
  );

  protected put(t: CardType) {
    return (d: Draft, file: PickedFile) => {
      d.cards[t] = file;
    };
  }
  protected drop(t: CardType) {
    return (d: Draft) => {
      d.cards[t] = null;
    };
  }
}
