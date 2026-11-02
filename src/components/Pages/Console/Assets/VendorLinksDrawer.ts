import {
  ChangeDetectionStrategy,
  Component,
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
import type { Merchant } from '../Merchants/merchants.api';
import { plural } from './asset-format';
import { AssetsApi, type AssetGroup, type VendorLinks } from './assets.api';

/**
 * The asset groups a vendor supplies (prototype cp.al.edit / cp.al.save; INS-026): a payment to
 * the vendor must name an active asset from one of them (9.11 check 7). An inactive group is
 * neither linked nor de-linked, so its box can't be changed.
 */
@Component({
  selector: 'rp-vendor-links',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="'Asset groups for ' + merchant().displayName"
      [sub]="'Vendor merchant · ' + merchant().uniqueId"
      icon="link"
      [drawer]="true"
      [slim]="true"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g12">
        @if (why()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow"><b>Read-only.</b> {{ why() }}</div>
          </div>
        }
        <div class="note tone-info">
          <rp-icon name="info" [size]="17" />
          <div class="grow">
            Payments to this vendor must name an active asset from one of these groups.
          </div>
        </div>
        @if (current() === null) {
          <div class="note tone-warn">
            <rp-icon name="alert" [size]="17" />
            <div class="grow">
              This vendor's current groups couldn't be read. Tick every group it supplies — saving
              replaces its links.
            </div>
          </div>
        }
        <div class="stack g8" id="vl-groups">
          @for (g of groups(); track g.id) {
            <div class="cp-lrow">
              <label class="chk"
                ><input
                  type="checkbox"
                  [id]="'vl-' + g.id"
                  [checked]="picked().has(g.id)"
                  [disabled]="!!why() || g.status !== 'ACTIVE'"
                  (change)="toggle(g.id, $event)"
                /><span
                  ><b>{{ g.name }}</b
                  ><span class="t-xs t-muted"
                    >{{ ' ' + plural(activeCount(g.id), 'active asset')
                    }}{{ g.status === 'ACTIVE' ? '' : ' · group inactive' }}</span
                  ></span
                ></label
              >
            </div>
          } @empty {
            <p class="t-sm t-muted">No asset groups yet. Create one first.</p>
          }
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
        <span class="cp-why" [attr.title]="why() || null"
          ><button
            type="button"
            class="btn btn-pri"
            id="vl-save"
            [disabled]="!!why() || busy() || !groups().length"
            (click)="save()"
          >
            <rp-icon name="check" [size]="17" /><span>Save links</span>
          </button></span
        >
      </div>
    </rp-modal>
  `,
})
export class VendorLinksDrawer implements OnInit {
  private readonly api = inject(AssetsApi);
  private readonly overlays = inject(Overlays);

  readonly merchant = input.required<Merchant>();
  readonly groups = input<readonly AssetGroup[]>([]);
  /** Active assets by group id. */
  readonly active = input<ReadonlyMap<string, number>>(new Map());
  /** The vendor's linked groups; null when they couldn't be read. */
  readonly current = input<ReadonlySet<string> | null>(null);
  readonly why = input('');
  readonly closed = output<void>();
  readonly saved = output<{ merchant: Merchant; links: VendorLinks }>();

  protected readonly plural = plural;
  protected readonly picked = signal<ReadonlySet<string>>(new Set());
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  ngOnInit() {
    this.picked.set(new Set(this.current() ?? []));
  }

  protected activeCount(id: string) {
    return this.active().get(id) ?? 0;
  }

  protected toggle(id: string, e: Event) {
    const on = (e.target as HTMLInputElement).checked;
    const next = new Set(this.picked());
    if (on) next.add(id);
    else next.delete(id);
    this.picked.set(next);
  }

  protected async save() {
    const m = this.merchant();
    const ids = [...this.picked()];
    if (!ids.length) {
      const ok = await this.overlays.confirm({
        title: 'Leave this vendor without groups?',
        text: `${m.displayName} can't be paid until at least one asset group is linked.`,
        ok: 'Save anyway',
        tone: 'warn',
      });
      if (!ok) return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const links = await this.api.setLinks(m.id, ids);
      this.saved.emit({ merchant: m, links });
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      this.busy.set(false);
    }
  }
}
