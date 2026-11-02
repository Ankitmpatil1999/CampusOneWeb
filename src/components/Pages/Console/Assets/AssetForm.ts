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
import { inrText } from '../../../Shared/Amount';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDateTime } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { ASSET_TYPES, typeLabel } from './asset-format';
import {
  AssetsApi,
  type Asset,
  type AssetGroup,
  type AssetInput,
  type AssetType,
  type VendorInvoice,
} from './assets.api';

type Field = 'name' | 'grp' | 'type' | 'desc';

/**
 * Add an approved asset / open one (prototype cp.as.edit / cp.as.save; INS-024, INS-025): its
 * name (unique in the group), the group, the type, a description and whether vendors can be paid
 * against it, then — for an existing asset — the vendor payments made against it (MER-013).
 * Assets are never deleted; one with payments keeps its reference when made inactive.
 */
@Component({
  selector: 'rp-asset-form',
  imports: [Dropdown, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="asset() ? asset()!.name : 'Add an approved asset'"
      [sub]="sub()"
      icon="box"
      [drawer]="true"
      [slim]="true"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="as-form">
        @if (why()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow"><b>Read-only.</b> {{ why() }}</div>
          </div>
        }
        <div class="c-form">
          <div class="fld full" [class.invalid]="err('name')">
            <label class="fld-l" for="as-name">Asset<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="as-name"
                type="text"
                placeholder="e.g. Compound microscopes ×3"
                maxlength="80"
                autocomplete="off"
                aria-describedby="as-name-e"
                [disabled]="!!why()"
                [value]="name()"
                (input)="name.set(val($event)); clear('name')"
              />
            </div>
            <div class="fld-e" id="as-name-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('name') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('grp')">
            <label class="fld-l" for="as-grp-b">Group<span class="req">*</span></label>
            <rp-dd
              inputId="as-grp"
              placeholder="Choose a group"
              [options]="groupOptions()"
              [value]="grp()"
              [disabled]="!!why() || !!asset()"
              (changed)="grp.set($event); clear('grp')"
            />
            <div class="fld-e" id="as-grp-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('grp') }}</span>
            </div>
            @if (asset()) {
              <div class="fld-h">Fixed — an asset stays in its group</div>
            }
          </div>
          <div class="fld" [class.invalid]="err('type')">
            <label class="fld-l" for="as-type-b">Type<span class="req">*</span></label>
            <rp-dd
              inputId="as-type"
              placeholder="Choose a type"
              [options]="types"
              [value]="type()"
              [disabled]="!!why()"
              (changed)="type.set(asType($event)); clear('type')"
            />
            <div class="fld-e" id="as-type-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('type') }}</span>
            </div>
          </div>
          <div class="fld full" [class.invalid]="err('desc')">
            <label class="fld-l" for="as-desc"
              >Description<span class="opt">(optional)</span></label
            >
            <div class="fld-in">
              <textarea
                id="as-desc"
                rows="2"
                maxlength="200"
                placeholder="Make, model, quantity or what it is for"
                aria-describedby="as-desc-e"
                [disabled]="!!why()"
                [value]="desc()"
                (input)="desc.set(val($event)); clear('desc')"
              ></textarea>
            </div>
            <div class="fld-e" id="as-desc-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('desc') }}</span>
            </div>
          </div>
          <div class="full">
            <label class="chk"
              ><input
                type="checkbox"
                id="as-act"
                [disabled]="!!why()"
                [checked]="active()"
                (change)="active.set(checked($event))"
              /><span><b>Active</b> — vendors can be paid against this asset</span></label
            >
          </div>
        </div>
        @if (asset()) {
          <div>
            <div class="sec-h">
              <h3>Vendor payments · {{ payments().length }}</h3>
            </div>
            @if (payments().length) {
              <div class="list">
                @for (p of payments(); track p.reference) {
                  <div class="li">
                    <span class="li-ic sm"><rp-icon name="receipt" [size]="16" /></span>
                    <span class="li-main"
                      ><span class="li-t">{{ inr(p) }} to {{ p.merchant.name }}</span
                      ><span class="li-s"
                        >Invoice {{ p.invoiceNo }}{{ p.paidAt ? ' · ' + dateTime(p.paidAt) : '' }} ·
                        <span class="t-mono">{{ p.reference }}</span></span
                      ></span
                    >
                  </div>
                }
              </div>
            } @else {
              <p class="t-sm t-muted">No vendor has been paid against this asset yet.</p>
            }
          </div>
        }
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
        <span class="cp-why" [attr.title]="why() || null"
          ><button
            type="button"
            class="btn btn-pri"
            id="as-save"
            [disabled]="!!why() || busy()"
            (click)="save()"
          >
            <rp-icon name="check" [size]="17" /><span>{{
              asset() ? 'Save asset' : 'Add asset'
            }}</span>
          </button></span
        >
      </div>
    </rp-modal>
  `,
})
export class AssetForm implements OnInit {
  private readonly api = inject(AssetsApi);
  private readonly overlays = inject(Overlays);

  /** The asset being opened; null adds one. */
  readonly asset = input<Asset | null>(null);
  readonly groups = input<readonly AssetGroup[]>([]);
  /** Every asset (names are unique in a group). */
  readonly assets = input<readonly Asset[]>([]);
  /** The group chosen in the list, proposed for a new asset. */
  readonly groupId = input('');
  /** Payments made against this asset (MER-013). */
  readonly payments = input<readonly VendorInvoice[]>([]);
  /** Why changes are refused (read-only role, no config.edit); '' when allowed. */
  readonly why = input('');
  readonly closed = output<void>();
  readonly saved = output<{ name: string; group: string; created: boolean }>();

  protected readonly types: readonly DropdownOption[] = ASSET_TYPES;
  protected readonly name = signal('');
  protected readonly grp = signal('');
  protected readonly type = signal<AssetType | ''>('PHYSICAL');
  protected readonly desc = signal('');
  protected readonly active = signal(true);
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  /** Active groups, and the asset's own group even when inactive. */
  protected readonly groupOptions = computed<DropdownOption[]>(() =>
    this.groups()
      .filter((g) => g.status === 'ACTIVE' || g.id === this.asset()?.group.id)
      .map((g) => ({ v: g.id, l: g.name })),
  );
  protected readonly sub = computed(() => {
    const a = this.asset();
    return a
      ? `${typeLabel(a.type)} · ${a.group.name}`
      : 'Vendors are paid against approved assets';
  });

  ngOnInit() {
    const a = this.asset();
    if (a) {
      this.name.set(a.name);
      this.grp.set(a.group.id);
      this.type.set(a.type);
      this.desc.set(a.description ?? '');
      this.active.set(a.status === 'ACTIVE');
      return;
    }
    const opts = this.groupOptions();
    const pick = opts.find((o) => o.v === this.groupId()) ?? opts[0];
    if (pick) this.grp.set(pick.v);
  }

  protected err(f: Field) {
    return this.errors()[f] ?? '';
  }
  protected clear(f: Field) {
    if (this.errors()[f]) this.errors.update((e) => ({ ...e, [f]: '' }));
  }

  private validate(): boolean {
    const e: Partial<Record<Field, string>> = {};
    const name = this.name().trim();
    if (!name) e.name = 'Name the asset';
    else if (name.length < 3 || name.length > 80) e.name = 'Use 3–80 characters';
    else if (
      this.assets().some(
        (a) =>
          a.id !== this.asset()?.id &&
          a.group.id === this.grp() &&
          a.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      e.name = translate('INS.ASSET_TAKEN');
    }
    if (!this.grp()) e.grp = 'Choose a group';
    if (!this.type()) e.type = 'Choose a type';
    if (this.desc().trim().length > 200) e.desc = 'Use at most 200 characters';
    this.errors.set(e);
    return Object.values(e).every((x) => !x);
  }

  protected async save() {
    this.error.set('');
    if (this.why() || !this.validate()) return;
    const a = this.asset();
    const name = this.name().trim();
    const desc = this.desc().trim() || null;
    const status = this.active() ? 'ACTIVE' : 'INACTIVE';
    const type = this.type() as AssetType;
    if (a && a.status === 'ACTIVE' && status === 'INACTIVE') {
      const ok = await this.overlays.confirm({
        title: `Make “${a.name}” inactive?`,
        text: "Vendors can't be paid against it any more. Payments already made keep their reference — assets are never deleted.",
        ok: 'Make inactive',
        tone: 'warn',
      });
      if (!ok) return;
    }
    const group = this.groups().find((g) => g.id === this.grp())?.name ?? '';
    this.busy.set(true);
    try {
      if (a) {
        const body: { -readonly [K in keyof AssetInput]?: AssetInput[K] } = {};
        if (name !== a.name) body.name = name;
        if (type !== a.type) body.type = type;
        if (desc !== (a.description ?? null)) body.description = desc;
        if (status !== a.status) body.status = status;
        if (!Object.keys(body).length) {
          this.overlays.toast('No changes to save', { tone: 'info' });
          return;
        }
        await this.api.updateAsset(a, body);
      } else {
        await this.api.createAsset({ groupId: this.grp(), name, type, description: desc, status });
      }
      this.saved.emit({ name, group, created: !a });
    } catch (e) {
      if (e instanceof ApiProblem && e.code === 'INS.ASSET_TAKEN') {
        this.errors.update((x) => ({ ...x, name: e.detail }));
      } else if (e instanceof ApiProblem && e.status === 412) {
        this.error.set('Someone else changed this asset. Close it and open it again.');
      } else this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      this.busy.set(false);
    }
  }

  protected asType(v: string) {
    return v as AssetType;
  }
  protected inr(p: VendorInvoice) {
    return inrText(p.amount);
  }
  protected dateTime(v: string) {
    return formatDateTime(v);
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected checked(e: Event) {
    return (e.target as HTMLInputElement).checked;
  }
}
