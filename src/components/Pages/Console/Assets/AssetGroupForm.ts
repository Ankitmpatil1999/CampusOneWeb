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
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { plural } from './asset-format';
import { AssetsApi, type AssetGroup, type AssetGroupInput } from './assets.api';

/**
 * New asset group / edit a group (prototype cp.ag.edit / cp.ag.save; INS-021, INS-022): its name
 * (unique in the institution), a description and whether vendors can be paid against its assets.
 * Making a group with active assets inactive asks first; groups are never deleted.
 */
@Component({
  selector: 'rp-asset-group-form',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="group() ? 'Edit ' + group()!.name : 'New asset group'"
      [sub]="
        group()
          ? plural(group()!.assets, 'asset') + ' in this group'
          : 'Group the things vendors supply, such as lab equipment or books'
      "
      icon="layers"
      [drawer]="true"
      [slim]="true"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="ag-form">
        <div class="fld" [class.invalid]="nameErr()">
          <label class="fld-l" for="ag-name">Group name<span class="req">*</span></label>
          <div class="fld-in">
            <input
              id="ag-name"
              type="text"
              placeholder="e.g. Science lab equipment"
              maxlength="40"
              autocomplete="off"
              aria-describedby="ag-name-e"
              [value]="name()"
              (input)="name.set(val($event)); nameErr.set('')"
            />
          </div>
          <div class="fld-e" id="ag-name-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ nameErr() }}</span>
          </div>
        </div>
        <div class="fld" [class.invalid]="descErr()">
          <label class="fld-l" for="ag-desc">Description<span class="opt">(optional)</span></label>
          <div class="fld-in">
            <textarea
              id="ag-desc"
              rows="2"
              maxlength="200"
              placeholder="What belongs in this group"
              aria-describedby="ag-desc-e"
              [value]="desc()"
              (input)="desc.set(val($event)); descErr.set('')"
            ></textarea>
          </div>
          <div class="fld-e" id="ag-desc-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ descErr() }}</span>
          </div>
        </div>
        <label class="chk"
          ><input
            type="checkbox"
            id="ag-act"
            [checked]="active()"
            (change)="active.set(checked($event))"
          /><span><b>Active</b> — vendors can be paid against assets in this group</span></label
        >
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
        <button type="button" class="btn btn-pri" id="ag-save" [disabled]="busy()" (click)="save()">
          <rp-icon name="check" [size]="17" /><span>{{
            group() ? 'Save group' : 'Create group'
          }}</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class AssetGroupForm implements OnInit {
  private readonly api = inject(AssetsApi);
  private readonly overlays = inject(Overlays);

  /** The group being edited; null creates one. */
  readonly group = input<AssetGroup | null>(null);
  /** Every group (names must be unique). */
  readonly groups = input<readonly AssetGroup[]>([]);
  /** Active assets in the group being edited (making it inactive asks first). */
  readonly activeAssets = input(0);
  readonly closed = output<void>();
  readonly saved = output<{ name: string; created: boolean }>();

  protected readonly plural = plural;
  protected readonly name = signal('');
  protected readonly desc = signal('');
  protected readonly active = signal(true);
  protected readonly nameErr = signal('');
  protected readonly descErr = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  private readonly others = computed(() => this.groups().filter((g) => g.id !== this.group()?.id));

  ngOnInit() {
    const g = this.group();
    if (!g) return;
    this.name.set(g.name);
    this.desc.set(g.description ?? '');
    this.active.set(g.status === 'ACTIVE');
  }

  protected async save() {
    const name = this.name().trim();
    const desc = this.desc().trim();
    this.error.set('');
    if (!name) this.nameErr.set('Name the group');
    else if (name.length < 3 || name.length > 40) this.nameErr.set('Use 3–40 characters');
    else if (this.others().some((g) => g.name.toLowerCase() === name.toLowerCase())) {
      this.nameErr.set(`A group called “${name}” already exists`);
    }
    if (desc.length > 200) this.descErr.set('Use at most 200 characters');
    if (this.nameErr() || this.descErr()) return;

    const g = this.group();
    const status = this.active() ? 'ACTIVE' : 'INACTIVE';
    if (g && g.status === 'ACTIVE' && status === 'INACTIVE' && this.activeAssets() > 0) {
      const ok = await this.overlays.confirm({
        title: `Make ${g.name} inactive?`,
        text: `Its ${plural(this.activeAssets(), 'active asset')} can't be used for new vendor payments. Past payments keep their reference.`,
        ok: 'Make inactive',
        tone: 'warn',
      });
      if (!ok) return;
    }
    this.busy.set(true);
    try {
      if (g) {
        const body: { -readonly [K in keyof AssetGroupInput]?: AssetGroupInput[K] } = {};
        if (name !== g.name) body.name = name;
        if ((desc || null) !== (g.description ?? null)) body.description = desc || null;
        if (status !== g.status) body.status = status;
        if (!Object.keys(body).length) {
          this.overlays.toast('No changes to save', { tone: 'info' });
          return;
        }
        await this.api.updateGroup(g, body);
      } else {
        await this.api.createGroup({ name, description: desc || null, status });
      }
      this.saved.emit({ name, created: !g });
    } catch (e) {
      if (e instanceof ApiProblem && e.code === 'INS.ASSET_GROUP_TAKEN') this.nameErr.set(e.detail);
      else if (e instanceof ApiProblem && e.status === 412) {
        this.error.set('Someone else changed this group. Close it and open it again.');
      } else this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      this.busy.set(false);
    }
  }

  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected checked(e: Event) {
    return (e.target as HTMLInputElement).checked;
  }
}
