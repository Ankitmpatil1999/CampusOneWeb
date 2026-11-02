import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type OnInit,
  output,
  signal,
} from '@angular/core';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import type { Merchant } from '../Merchants/merchants.api';
import { LOCATION_TYPES, PURPOSES } from './reader-format';
import { ReadersApi, type Terminal, type TerminalInput, type TerminalPurpose } from './readers.api';

type Field = 'name' | 'loc' | 'cls' | 'lt' | 'mer';

/** API field → form field, for the server's validation errors. */
const FIELD: Readonly<Record<string, Field>> = {
  name: 'name',
  location: 'loc',
  sectionId: 'cls',
  locationType: 'lt',
  merchantId: 'mer',
};

/**
 * Register a reader or rename, move or re-purpose one (prototype readerForm / cp.rd.create /
 * cp.rd.save; INS-031, INS-032): name, location, the purpose and what it is bound to — the class
 * section for period attendance, the location type, or the merchant of a coupon counter or a POS
 * counter. A new reader is then paired (the parent asks for the pairing code).
 */
@Component({
  selector: 'rp-reader-form',
  imports: [Dropdown, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="terminal() ? 'Rename or move ' + terminal()!.name : 'Register a reader'"
      [sub]="
        terminal()
          ? 'The device stays paired'
          : 'Name it, give it a purpose, then pair the device with a one-time pairing code.'
      "
      [icon]="terminal() ? 'edit' : 'nfc'"
      [drawer]="true"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="cp-rdf">
        <div class="c-form">
          <div class="fld" [class.invalid]="err('name')">
            <label class="fld-l" for="rd-name">Reader name<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="rd-name"
                type="text"
                placeholder="e.g. Main gate — entry/exit"
                maxlength="40"
                autocomplete="off"
                aria-describedby="rd-name-e"
                [value]="name()"
                (input)="name.set(val($event)); clear('name')"
              />
            </div>
            <div class="fld-e" id="rd-name-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('name') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('loc')">
            <label class="fld-l" for="rd-loc">Location<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="rd-loc"
                type="text"
                placeholder="e.g. Block B · Room 204"
                maxlength="60"
                autocomplete="off"
                aria-describedby="rd-loc-e"
                [value]="loc()"
                (input)="loc.set(val($event)); clear('loc')"
              />
            </div>
            <div class="fld-e" id="rd-loc-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('loc') }}</span>
            </div>
          </div>
        </div>

        <div class="fld">
          <span class="fld-l" id="rd-pur-l">Purpose<span class="req">*</span></span>
          <div class="cp-purps" role="radiogroup" aria-labelledby="rd-pur-l">
            @for (p of purposes; track p.v) {
              <div
                class="choice"
                [class.on]="purpose() === p.v"
                [attr.data-v]="p.v"
                tabindex="0"
                role="radio"
                [attr.aria-checked]="purpose() === p.v"
                (click)="pick(p.v)"
                (keydown.enter)="pick(p.v)"
                (keydown.space)="$event.preventDefault(); pick(p.v)"
              >
                <span class="li-ic sm"><rp-icon [name]="p.icon" [size]="17" /></span>
                <span class="grow"
                  ><span class="t-h4" style="display: block">{{ p.l }}</span
                  ><span class="t-sm t-muted" style="display: block; margin-top: 1px">{{
                    p.s
                  }}</span></span
                >
                <span class="radio"></span>
              </div>
            }
          </div>
        </div>

        @switch (purpose()) {
          @case ('PERIOD_ATTENDANCE') {
            <div class="c-form">
              <div class="fld" [class.invalid]="err('cls')">
                <label class="fld-l" for="rd-cls-b">Class<span class="req">*</span></label>
                <rp-dd
                  inputId="rd-cls"
                  placeholder="Choose a class"
                  [options]="sections()"
                  [value]="cls()"
                  (changed)="cls.set($event); clear('cls')"
                />
                <div class="fld-e" id="rd-cls-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('cls') }}</span>
                </div>
              </div>
            </div>
          }
          @case ('LOCATION') {
            <div class="c-form">
              <div class="fld" [class.invalid]="err('lt')">
                <label class="fld-l" for="rd-lt-b">Location type<span class="req">*</span></label>
                <rp-dd
                  inputId="rd-lt"
                  placeholder="Choose a type"
                  [options]="locationTypes()"
                  [value]="lt()"
                  (changed)="lt.set($event); clear('lt')"
                />
                <div class="fld-e" id="rd-lt-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('lt') }}</span>
                </div>
              </div>
            </div>
          }
          @case ('COUPON') {
            <div class="c-form">
              <div class="fld" [class.invalid]="err('mer')">
                <label class="fld-l" for="rd-mer-b">Bound merchant<span class="req">*</span></label>
                <rp-dd
                  inputId="rd-mer"
                  placeholder="Choose a merchant"
                  [options]="merchantOptions()"
                  [value]="mer()"
                  (changed)="mer.set($event); clear('mer')"
                />
                <div class="fld-e" id="rd-mer-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('mer') }}</span>
                </div>
                <div class="fld-h">
                  Required for a coupon counter — only regular merchants that accept coupons
                </div>
              </div>
            </div>
          }
          @case ('POS') {
            <div class="c-form">
              <div class="fld" [class.invalid]="err('mer')">
                <label class="fld-l" for="rd-mer-b">Merchant<span class="req">*</span></label>
                <rp-dd
                  inputId="rd-mer"
                  placeholder="Choose a merchant"
                  [options]="merchantOptions()"
                  [value]="mer()"
                  (changed)="mer.set($event); clear('mer')"
                />
                <div class="fld-e" id="rd-mer-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('mer') }}</span>
                </div>
                <div class="fld-h">The merchant whose billing counter this is</div>
              </div>
            </div>
          }
        }

        <div class="note tone-info">
          <rp-icon name="info" [size]="17" />
          <div class="grow">
            The reader shows this purpose on screen, and the purpose is recorded with every capture.
            Changing a name or location keeps the history; earlier captures keep the name in force
            at the time.
          </div>
        </div>
        @if (error()) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ error() }}</div>
          </div>
        }
      </div>
      <div modal-foot class="row g8">
        <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <button type="button" class="btn btn-pri" id="rd-save" [disabled]="busy()" (click)="save()">
          @if (terminal()) {
            <rp-icon name="check" [size]="17" /><span>Save reader</span>
          } @else {
            <rp-icon name="key" [size]="17" /><span>Register and get pairing code</span>
          }
        </button>
      </div>
    </rp-modal>
  `,
})
export class ReaderForm implements OnInit {
  private readonly api = inject(ReadersApi);
  private readonly overlays = inject(Overlays);

  /** The reader being edited; null registers a new one. */
  readonly terminal = input<Terminal | null>(null);
  /** The class sections (period attendance). */
  readonly sections = input<readonly DropdownOption[]>([]);
  /** The institution's merchants (coupon counters and POS counters are bound to one). */
  readonly merchants = input<readonly Merchant[]>([]);
  /** The other terminals, for the "an active reader already has this name" check. */
  readonly others = input<readonly Terminal[]>([]);
  readonly closed = output<void>();
  readonly registered = output<{ id: string; name: string }>();
  readonly updated = output<Terminal>();

  protected readonly purposes = PURPOSES;
  protected readonly name = signal('');
  protected readonly loc = signal('');
  protected readonly purpose = signal<TerminalPurpose>('ATTENDANCE');
  protected readonly cls = signal('');
  protected readonly lt = signal('');
  protected readonly mer = signal('');
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected readonly locationTypes = computed<DropdownOption[]>(() => {
    const list: string[] = [...LOCATION_TYPES];
    const cur = this.terminal()?.locationType;
    if (cur && !list.includes(cur)) list.push(cur);
    return list.map((v) => ({ v, l: v }));
  });
  /** Coupon counters: active regular merchants that accept coupons; POS: active merchants. */
  protected readonly merchantOptions = computed<DropdownOption[]>(() => {
    const coupon = this.purpose() === 'COUPON';
    const cur = this.terminal()?.merchant;
    const list = this.merchants()
      .filter(
        (m) =>
          m.status === 'ACTIVE' &&
          !m.isFeeAccount &&
          (!coupon || (m.subType === 'REGULAR' && m.accepts.coupon)),
      )
      .map((m) => ({ v: m.id, l: m.displayName }));
    if (cur && !list.some((o) => o.v === cur.id)) list.push({ v: cur.id, l: cur.name });
    return list;
  });

  /** Fills the form from the reader being edited (its input is set by now). */
  ngOnInit() {
    const t = this.terminal();
    if (!t) return;
    this.name.set(t.name);
    this.loc.set(t.location ?? '');
    this.purpose.set(t.purpose);
    this.cls.set(t.section?.id ?? '');
    this.lt.set(t.locationType ?? '');
    this.mer.set(t.merchant?.id ?? '');
  }

  protected err(f: Field) {
    return this.errors()[f] ?? '';
  }
  protected clear(f: Field) {
    if (this.errors()[f]) this.errors.update((e) => ({ ...e, [f]: '' }));
  }
  protected pick(p: TerminalPurpose) {
    this.purpose.set(p);
    this.errors.update((e) => ({ ...e, cls: '', lt: '', mer: '' }));
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }

  /** The prototype's readRD rules, then the duplicate-name check. */
  private validate(): boolean {
    const e: Partial<Record<Field, string>> = {};
    const name = this.name().trim();
    const loc = this.loc().trim();
    if (!name) e.name = 'Name the reader';
    else if (name.length < 3 || name.length > 40) e.name = 'Use 3–40 characters';
    else if (
      this.others().some(
        (o) =>
          o.id !== this.terminal()?.id &&
          o.status === 'ACTIVE' &&
          o.name.trim().toLowerCase() === name.toLowerCase(),
      )
    ) {
      e.name = 'An active reader already has this name';
    }
    if (!loc) e.loc = 'Say where the reader is';
    else if (loc.length < 3 || loc.length > 60) e.loc = 'Use 3–60 characters';
    const p = this.purpose();
    if (p === 'PERIOD_ATTENDANCE' && !this.cls()) e.cls = 'Choose the class this reader serves';
    if (p === 'LOCATION' && !this.lt()) e.lt = 'Choose the location type';
    if (p === 'COUPON' && !this.mer()) e.mer = 'A coupon counter must be bound to a merchant';
    if (p === 'POS' && !this.mer()) e.mer = 'Choose the merchant whose counter this is';
    this.errors.set(e);
    return Object.values(e).every((x) => !x);
  }

  private body(): TerminalInput {
    const p = this.purpose();
    return {
      name: this.name().trim(),
      location: this.loc().trim() || null,
      purpose: p,
      merchantId: p === 'COUPON' || p === 'POS' ? this.mer() : null,
      sectionId: p === 'PERIOD_ATTENDANCE' ? this.cls() : null,
      locationType: p === 'LOCATION' ? this.lt() : null,
    };
  }

  /** Only what changed (INS-032); the binding is sent whole when the purpose or binding changed. */
  private patch(t: Terminal, b: TerminalInput): Partial<TerminalInput> {
    const out: { -readonly [K in keyof TerminalInput]?: TerminalInput[K] } = {};
    if (b.name !== t.name) out.name = b.name;
    if ((b.location ?? null) !== (t.location ?? null)) out.location = b.location ?? null;
    const bound =
      b.purpose !== t.purpose ||
      (b.merchantId ?? null) !== (t.merchant?.id ?? null) ||
      (b.sectionId ?? null) !== (t.section?.id ?? null) ||
      (b.locationType ?? null) !== (t.locationType ?? null);
    if (bound) {
      out.purpose = b.purpose;
      out.merchantId = b.merchantId ?? null;
      out.sectionId = b.sectionId ?? null;
      out.locationType = b.locationType ?? null;
    }
    return out;
  }

  protected async save() {
    this.error.set('');
    if (!this.validate()) return;
    const b = this.body();
    const t = this.terminal();
    const changes = t ? this.patch(t, b) : null;
    if (t && changes && !Object.keys(changes).length) {
      this.overlays.toast('No changes to save', { tone: 'info' });
      return;
    }
    this.busy.set(true);
    try {
      if (t) {
        this.updated.emit(await this.api.update(t, changes!));
      } else {
        const r = await this.api.register(b);
        this.registered.emit({ id: r.readerId, name: b.name });
      }
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy.set(false);
    }
  }

  private fail(e: unknown) {
    if (!(e instanceof ApiProblem)) {
      this.error.set(translate('GEN.UNAVAILABLE'));
      return;
    }
    if (e.status === 412) {
      this.error.set('Someone else changed this reader. Close it and open it again.');
      return;
    }
    const fields: Partial<Record<Field, string>> = {};
    for (const f of e.errors) {
      const k = FIELD[f.field];
      if (k) fields[k] = f.message;
    }
    if (Object.keys(fields).length) this.errors.set(fields);
    else this.error.set(e.detail);
  }
}
