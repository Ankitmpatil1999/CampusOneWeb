/**
 * t.pos — the Menu tab (FR-MER-03; MER-002…005): the outlet, its categories and items, availability
 * switched straight from the list, and the add-item, add-category and outlet forms.
 */
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Icon } from '../../Shared/Icon';
import { Modal, Overlays } from '../../Shared/Overlays';
import { formatInr } from '../../Utils/format';
import { amountText, cleanTyped } from '../../Utils/typing';
import { PosState, problemText } from './pos.state';
import { TerminalApi, money, paiseOf, type PosItem } from './terminal.api';

type Sheet = null | 'item' | 'category' | 'outlet';
const NAME = /^[\p{L}0-9 &()'.,×-]+$/u;
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

@Component({
  selector: 'rp-pos-menu',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="tm-menuadm">
      @if (s.menu(); as m) {
        <div class="tm-outlet">
          <span class="tm-dev lg"><rp-icon name="store" [size]="24" /></span>
          <div class="grow">
            <div class="eyebrow">
              Outlet <span class="srs" title="SRS reference">FR-MER-03</span>
            </div>
            <h2>{{ m.outlet.name }}</h2>
            <p>
              {{ hours() }} · GSTIN
              <span class="t-mono">{{ m.outlet.gstin ?? '—' }}</span>
            </p>
          </div>
          <div class="row g8 wrap">
            <button
              type="button"
              class="btn btn-sec btn-sm"
              id="tm-outlet"
              (click)="open('outlet')"
            >
              <rp-icon name="edit" [size]="15" /><span>Edit outlet</span>
            </button>
            <button
              type="button"
              class="btn btn-accent btn-sm"
              id="tm-additem"
              [disabled]="!m.categories.length"
              [title]="m.categories.length ? '' : 'Add a category first'"
              (click)="open('item')"
            >
              <rp-icon name="plus" [size]="15" /><span>Add item</span>
            </button>
          </div>
        </div>
        @for (c of m.categories; track c.id) {
          <div class="tm-sec">
            <div class="tm-h">
              {{ c.name }}
              <span class="tm-h-r"
                >{{ availableOf(c.items) }} of {{ c.items.length }} available</span
              >
            </div>
            @for (i of c.items; track i.id) {
              <div class="tm-mrow" [class.off]="!i.available">
                <span class="grow"
                  ><b>{{ i.name }}</b
                  ><small
                    >GST {{ i.gstRate }}% ·
                    {{ i.foodType === 'NON_VEG' ? 'Non-veg' : 'Veg' }}</small
                  ></span
                >
                <b class="t-num">{{ inr(paise(i.price)) }}</b>
                <span class="tm-avail">{{ i.available ? 'Available' : 'Not available' }}</span>
                <button
                  type="button"
                  class="toggle"
                  role="switch"
                  [attr.aria-checked]="i.available"
                  [attr.aria-label]="i.name + ' available'"
                  (click)="toggle(i)"
                ></button>
              </div>
            } @empty {
              <div class="tm-empty">
                <rp-icon name="utensils" [size]="16" /><span>No items in {{ c.name }} yet.</span>
              </div>
            }
          </div>
        }
        <div>
          <button
            type="button"
            class="btn btn-sec btn-sm"
            id="tm-addcat"
            (click)="open('category')"
          >
            <rp-icon name="plus" [size]="15" /><span>Add category</span>
          </button>
        </div>
      }
    </div>
    @switch (sheet()) {
      @case ('item') {
        <rp-modal
          title="Add a menu item"
          [sub]="(s.menu()?.outlet?.name ?? '') + ' · shown on the counter as soon as it’s saved'"
          icon="utensils"
          (closed)="sheet.set(null)"
        >
          <div class="stack g16">
            <div class="fld" [class.invalid]="!!err()['name']">
              <label class="fld-l" for="tm-in"
                >Item name<span class="req">*</span
                ><span class="count">{{ name().length }}/40</span></label
              >
              <div class="fld-in">
                <input
                  id="tm-in"
                  maxlength="40"
                  autocomplete="off"
                  placeholder="e.g. Rava idli"
                  [value]="name()"
                  (input)="name.set(v($event)); clearErr('name')"
                />
              </div>
              <div class="fld-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err()['name'] }}</span>
              </div>
            </div>
            <div class="grid c2">
              <div class="fld" [class.invalid]="!!err()['cat']">
                <label class="fld-l" for="tm-ic">Category<span class="req">*</span></label>
                <div class="fld-in">
                  <select id="tm-ic" [value]="cat()" (change)="cat.set(v($event)); clearErr('cat')">
                    @for (c of s.menu()?.categories ?? []; track c.id) {
                      <option [value]="c.id">{{ c.name }}</option>
                    }
                  </select>
                </div>
                <div class="fld-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err()['cat'] }}</span>
                </div>
              </div>
              <div class="fld" [class.invalid]="!!err()['price']">
                <label class="fld-l" for="tm-ip">Price<span class="req">*</span></label>
                <div class="fld-in">
                  <span class="pre">₹</span
                  ><input
                    id="tm-ip"
                    inputmode="decimal"
                    autocomplete="off"
                    placeholder="0.00"
                    [value]="price()"
                    (input)="price.set(amountOf($event)); clearErr('price')"
                  />
                </div>
                <div class="fld-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err()['price'] }}</span>
                </div>
              </div>
            </div>
            <div class="grid c2">
              <div class="fld">
                <label class="fld-l" for="tm-ig">GST</label>
                <div class="fld-in">
                  <select id="tm-ig" [value]="gst()" (change)="gst.set(v($event))">
                    @for (r of s.menu()?.gstRates ?? []; track r) {
                      <option [value]="r">{{ r }}% (CGST {{ r / 2 }}% + SGST {{ r / 2 }}%)</option>
                    }
                  </select>
                </div>
              </div>
              <label class="chk" style="align-self: end; padding-bottom: 10px"
                ><input
                  type="checkbox"
                  id="tm-iav"
                  [checked]="avail()"
                  (change)="avail.set(checked($event))"
                /><span>Available today</span></label
              >
            </div>
          </div>
          <div modal-foot>
            <button type="button" class="btn btn-sec" (click)="sheet.set(null)">
              <span>Cancel</span>
            </button>
            <button type="button" class="btn btn-accent" [disabled]="busy()" (click)="saveItem()">
              <rp-icon name="plus" [size]="17" /><span>Add item</span>
            </button>
          </div>
        </rp-modal>
      }
      @case ('category') {
        <rp-modal title="Add a category" icon="layers" (closed)="sheet.set(null)">
          <div class="fld" [class.invalid]="!!err()['cn']">
            <label class="fld-l" for="tm-cn">Category name<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="tm-cn"
                maxlength="24"
                autocomplete="off"
                placeholder="e.g. Desserts"
                [value]="name()"
                (input)="name.set(v($event)); clearErr('cn')"
              />
            </div>
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err()['cn'] }}</span>
            </div>
          </div>
          <div modal-foot>
            <button type="button" class="btn btn-sec" (click)="sheet.set(null)">
              <span>Cancel</span>
            </button>
            <button
              type="button"
              class="btn btn-accent"
              [disabled]="busy()"
              (click)="saveCategory()"
            >
              <span>Add category</span>
            </button>
          </div>
        </rp-modal>
      }
      @case ('outlet') {
        <rp-modal
          title="Outlet details"
          sub="Shown on receipts and the counter"
          icon="store"
          (closed)="sheet.set(null)"
        >
          <div class="stack g16">
            <div class="fld" [class.invalid]="!!err()['on']">
              <label class="fld-l" for="tm-on">Outlet name<span class="req">*</span></label>
              <div class="fld-in">
                <input
                  id="tm-on"
                  maxlength="40"
                  [value]="name()"
                  (input)="name.set(v($event)); clearErr('on')"
                />
              </div>
              <div class="fld-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err()['on'] }}</span>
              </div>
            </div>
            <div class="grid c2">
              <div class="fld" [class.invalid]="!!err()['oa']">
                <label class="fld-l" for="tm-oa">Opens<span class="req">*</span></label>
                <div class="fld-in">
                  <input
                    id="tm-oa"
                    type="time"
                    [value]="opens()"
                    (input)="opens.set(v($event)); clearErr('oa')"
                  />
                </div>
                <div class="fld-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err()['oa'] }}</span>
                </div>
              </div>
              <div class="fld" [class.invalid]="!!err()['ob']">
                <label class="fld-l" for="tm-ob">Closes<span class="req">*</span></label>
                <div class="fld-in">
                  <input
                    id="tm-ob"
                    type="time"
                    [value]="closes()"
                    (input)="closes.set(v($event)); clearErr('ob')"
                  />
                </div>
                <div class="fld-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err()['ob'] }}</span>
                </div>
              </div>
            </div>
            <div class="fld" [class.invalid]="!!err()['og']">
              <label class="fld-l" for="tm-og">GSTIN<span class="req">*</span></label>
              <div class="fld-in">
                <input
                  id="tm-og"
                  maxlength="15"
                  [value]="gstin()"
                  (input)="gstin.set(v($event)); clearErr('og')"
                />
              </div>
              <div class="fld-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err()['og'] }}</span>
              </div>
              <div class="fld-h">15 characters, e.g. 29ABCDE1234F1Z5</div>
            </div>
          </div>
          <div modal-foot>
            <button type="button" class="btn btn-sec" (click)="sheet.set(null)">
              <span>Cancel</span>
            </button>
            <button type="button" class="btn btn-accent" [disabled]="busy()" (click)="saveOutlet()">
              <span>Save outlet</span>
            </button>
          </div>
        </rp-modal>
      }
    }`,
})
export class PosMenuTab {
  protected readonly s = inject(PosState);
  private readonly api = inject(TerminalApi);
  private readonly overlays = inject(Overlays);

  protected readonly sheet = signal<Sheet>(null);
  protected readonly busy = signal(false);
  protected readonly err = signal<Record<string, string>>({});
  protected readonly name = signal('');
  protected readonly cat = signal('');
  protected readonly price = signal('');
  protected readonly gst = signal('5');
  protected readonly avail = signal(true);
  protected readonly opens = signal('07:30');
  protected readonly closes = signal('17:00');
  protected readonly gstin = signal('');

  protected readonly hours = computed(() => {
    const o = this.s.menu()?.outlet;
    return o?.opensAt && o.closesAt ? `Open ${o.opensAt} – ${o.closesAt}` : 'Hours not set';
  });
  protected readonly inr = (p: number) => formatInr(p);
  protected readonly paise = paiseOf;
  protected v(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  /** A price: numbers only, in the box too (client 2026-10-14). */
  protected amountOf(e: Event) {
    return cleanTyped(e.target as HTMLInputElement, amountText);
  }
  protected checked(e: Event) {
    return (e.target as HTMLInputElement).checked;
  }
  protected availableOf(items: readonly PosItem[]) {
    return items.filter((i) => i.available).length;
  }
  protected clearErr(k: string) {
    if (this.err()[k]) this.err.set({ ...this.err(), [k]: '' });
  }

  protected open(sheet: Exclude<Sheet, null>) {
    const m = this.s.menu();
    this.err.set({});
    if (sheet === 'outlet' && m) {
      this.name.set(m.outlet.name);
      this.opens.set(m.outlet.opensAt ?? '07:30');
      this.closes.set(m.outlet.closesAt ?? '17:00');
      this.gstin.set(m.outlet.gstin ?? '');
    } else {
      this.name.set('');
      this.price.set('');
      this.cat.set(m?.categories[0]?.id ?? '');
      this.gst.set(String(m?.defaultGstRate ?? 5));
      this.avail.set(true);
    }
    this.sheet.set(sheet);
  }

  protected async toggle(i: PosItem) {
    try {
      const out = await this.api.patchItem(i.id, i.version, { available: !i.available });
      this.overlays.toast(
        out.available ? `${out.name} is available` : `${out.name} marked not available`,
        {
          tone: out.available ? 'ok' : 'info',
          sub: 'The counter menu updates straight away',
        },
      );
      await this.s.load();
    } catch (e) {
      this.overlays.toast(problemText(e), { tone: 'bad' });
      await this.s.load();
    }
  }

  protected async saveItem() {
    const name = this.name().trim();
    const all = this.s.items();
    const e: Record<string, string> = {};
    if (!name) e['name'] = 'Enter the item name';
    else if (name.length < 2 || name.length > 40) e['name'] = 'Use 2–40 characters';
    else if (!NAME.test(name)) e['name'] = 'Use letters, numbers and simple punctuation only';
    else if (all.some((i) => i.name.toLowerCase() === name.toLowerCase()))
      e['name'] = `${name} is already on the menu`;
    if (!this.cat()) e['cat'] = 'Choose a category';
    const p = this.price().trim();
    const n = Number(p);
    if (!p) e['price'] = 'Enter the price';
    else if (!/^\d+(\.\d{1,2})?$/.test(p)) e['price'] = 'Enter an amount like 45 or 45.50';
    else if (n < 1) e['price'] = 'The price must be at least ₹1.00';
    else if (n > 5000) e['price'] = "The price can't be more than ₹5,000.00";
    this.err.set(e);
    if (Object.values(e).some(Boolean)) return;
    this.busy.set(true);
    try {
      const out = await this.api.addItem({
        categoryId: this.cat(),
        name,
        price: money(Math.round(n * 100)),
        gstRate: Number(this.gst()),
        available: this.avail(),
      });
      this.sheet.set(null);
      const cat = this.s.menu()?.categories.find((c) => c.id === out.categoryId)?.name ?? '';
      this.overlays.toast(`${out.name} added to ${cat}`, { sub: formatInr(paiseOf(out.price)) });
      await this.s.load();
    } catch (x) {
      this.err.set({ name: problemText(x) });
    } finally {
      this.busy.set(false);
    }
  }

  protected async saveCategory() {
    const name = this.name().trim();
    const e: Record<string, string> = {};
    if (!name) e['cn'] = 'Enter a category name';
    else if (!/^[\p{L} &'-]+$/u.test(name)) e['cn'] = 'Use letters only';
    else if (this.s.menu()?.categories.some((c) => c.name.toLowerCase() === name.toLowerCase()))
      e['cn'] = `${name} already exists`;
    this.err.set(e);
    if (Object.values(e).some(Boolean)) return;
    this.busy.set(true);
    try {
      await this.api.addCategory(name);
      this.sheet.set(null);
      this.overlays.toast(`Category ${name} added`);
      await this.s.load();
    } catch (x) {
      this.err.set({ cn: problemText(x) });
    } finally {
      this.busy.set(false);
    }
  }

  protected async saveOutlet() {
    const m = this.s.menu();
    if (!m) return;
    const name = this.name().trim();
    const gstin = this.gstin().trim().toUpperCase();
    const e: Record<string, string> = {};
    if (!name) e['on'] = 'Enter the outlet name';
    else if (name.length < 3 || name.length > 40) e['on'] = 'Use 3–40 characters';
    if (!this.opens()) e['oa'] = 'Enter the opening time';
    if (!this.closes()) e['ob'] = 'Enter the closing time';
    else if (this.closes() <= this.opens()) e['ob'] = 'Closing time must be after opening time';
    if (!gstin) e['og'] = 'Enter the GSTIN';
    else if (!GSTIN.test(gstin)) e['og'] = 'Enter a valid 15-character GSTIN, e.g. 29ABCDE1234F1Z5';
    this.err.set(e);
    if (Object.values(e).some(Boolean)) return;
    this.busy.set(true);
    try {
      await this.api.saveOutlet(m.outlet.version, {
        name,
        opensAt: this.opens(),
        closesAt: this.closes(),
        gstin,
      });
      this.sheet.set(null);
      this.overlays.toast('Outlet details saved');
      await this.s.load();
    } catch (x) {
      this.err.set({ on: problemText(x) });
    } finally {
      this.busy.set(false);
    }
  }
}
