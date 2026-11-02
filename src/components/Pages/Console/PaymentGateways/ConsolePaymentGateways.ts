import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { formatDateTime } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { GatewayForm } from './GatewayForm';
import { GatewaysApi, type PaymentGatewayView } from './gateways.api';

/**
 * c.gateways — Payment gateways (client 2026-10-09; INS-038…041): each school collects online
 * fees into its own gateway accounts, and may have several. The Institution Administrator and the
 * Accountant add them, change them, choose the default for new payments, check the keys with the
 * gateway and disable them. Keys are stored encrypted and never shown again.
 */
@Component({
  selector: 'rp-console-payment-gateways',
  imports: [Empty, GatewayForm, Icon, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Payment gateways"
        sub="Online fees are paid into your school's own gateway accounts. The keys are stored encrypted and are never shown again."
      >
        @if (canView()) {
          @if (editWhy()) {
            <span class="cp-why" [attr.title]="editWhy()"
              ><button type="button" class="btn btn-pri" disabled>
                <rp-icon name="plus" [size]="17" /><span>Add a gateway</span>
              </button></span
            >
          } @else {
            <button type="button" class="btn btn-pri" id="pg-new" (click)="form.set('new')">
              <rp-icon name="plus" [size]="17" /><span>Add a gateway</span>
            </button>
          }
        }
      </rp-page-head>

      @if (!canView()) {
        <rp-empty
          icon="lock"
          title="This page isn't part of your role"
          text="Payment gateways are managed by the institution administrator and the accountant. Pages your role can open are listed in the menu."
        />
      } @else if (error()) {
        <div class="card pad">
          <rp-empty icon="alertc" title="Couldn't load the payment gateways" [text]="error()">
            <button type="button" class="btn btn-sec btn-sm" (click)="load()">
              <span>Try again</span>
            </button>
          </rp-empty>
        </div>
      } @else if (loaded() && !items().length) {
        @if (platformInUse()) {
          <div class="note tone-info" id="pg-platform">
            <rp-icon name="info" [size]="17" />
            <div class="grow">
              Online payments are taken with <b>CampusOne's Razorpay account</b> for now. Add your
              school's own Razorpay account to receive the payments into it.
            </div>
          </div>
        }
        <div class="card pad">
          <rp-empty
            icon="card"
            title="No payment gateway yet"
            text="Add your school's Razorpay account to collect admission fees online into it. The first one you add is used for new payments."
          />
        </div>
      } @else {
        @if (platformInUse()) {
          <div class="note tone-warn" id="pg-platform">
            <rp-icon name="info" [size]="17" />
            <div class="grow">
              None of your gateways is active, so online payments are taken with
              <b>CampusOne's Razorpay account</b>. Enable one to receive the payments into it.
            </div>
          </div>
        }
        <div class="tbl-wrap">
          <table class="tbl" id="pg-table">
            <thead>
              <tr>
                <th>Gateway</th>
                <th>Key</th>
                <th>Used for new payments</th>
                <th>Status</th>
                <th>Last check</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (g of items(); track g.id) {
                <tr [class.off]="g.status === 'DISABLED'">
                  <td>
                    <div class="cell-main">
                      <span class="cell-t">{{ g.label }}</span>
                      <span class="cell-s">{{ g.providerName }}</span>
                    </div>
                  </td>
                  <td>
                    <span class="t-mono" translate="no">{{ g.keyIdHint }}</span>
                    <span
                      class="chip"
                      [class]="'chip tone-' + (g.environment === 'LIVE' ? 'ok' : 'warn')"
                      style="margin-left: 6px"
                      >{{ g.environment === 'LIVE' ? 'Live' : 'Test' }}</span
                    >
                  </td>
                  <td>
                    @if (g.isDefault) {
                      <span class="chip dot tone-ok">Default</span>
                    } @else {
                      <span class="t-faint">—</span>
                    }
                  </td>
                  <td>
                    <span [class]="'chip dot tone-' + (g.status === 'ACTIVE' ? 'ok' : 'neutral')">{{
                      g.status === 'ACTIVE' ? 'Active' : 'Disabled'
                    }}</span>
                  </td>
                  <td>
                    @if (g.lastCheck; as c) {
                      <span [class]="'chip tone-' + (c.ok ? 'ok' : 'bad')">{{
                        c.ok ? 'Keys accepted' : 'Not accepted'
                      }}</span>
                      <span class="cell-s" style="display: block">{{ when(c.at) }}</span>
                      @if (!c.ok && c.note) {
                        <span class="cell-s" style="display: block">{{ c.note }}</span>
                      }
                    } @else {
                      <span class="t-faint">Not checked</span>
                    }
                  </td>
                  <td class="t-right">
                    @if (!editWhy()) {
                      <span class="row g6" style="justify-content: flex-end">
                        <button
                          type="button"
                          class="btn btn-sec btn-sm"
                          [disabled]="busyId() === g.id"
                          (click)="check(g)"
                        >
                          <rp-icon name="refresh" [size]="15" /><span>Check</span>
                        </button>
                        <button type="button" class="btn btn-sec btn-sm" (click)="form.set(g)">
                          <rp-icon name="edit" [size]="15" /><span>Change</span>
                        </button>
                        @if (g.status === 'ACTIVE' && !g.isDefault) {
                          <button
                            type="button"
                            class="btn btn-sec btn-sm"
                            [disabled]="busyId() === g.id"
                            (click)="makeDefault(g)"
                          >
                            <span>Make default</span>
                          </button>
                        }
                        <button
                          type="button"
                          class="btn btn-ghost btn-sm"
                          [disabled]="busyId() === g.id"
                          (click)="toggle(g)"
                        >
                          <span>{{ g.status === 'ACTIVE' ? 'Disable' : 'Enable' }}</span>
                        </button>
                      </span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="note tone-info">
          <rp-icon name="info" [size]="17" />
          <div class="grow">
            New online payments use the <b>default</b> gateway. A payment already started stays with
            the gateway it began with. After adding a gateway, open <b>Change</b> to copy its
            webhook address into the gateway dashboard, so payments are recorded even when a parent
            closes the page.
          </div>
        </div>
      }
    </div>
    @if (form(); as f) {
      <rp-gateway-form
        [gateway]="f === 'new' ? null : f"
        (closed)="form.set(null)"
        (saved)="saved($event, f === 'new')"
      />
    }
  `,
})
export class ConsolePaymentGateways {
  private readonly api = inject(GatewaysApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).console;

  protected readonly items = signal<readonly PaymentGatewayView[]>([]);
  protected readonly loaded = signal(false);
  protected readonly platformInUse = signal(false);
  protected readonly error = signal('');
  protected readonly busyId = signal<string | null>(null);
  protected readonly form = signal<'new' | PaymentGatewayView | null>(null);

  protected readonly canView = computed(
    () => this.session()?.subTasks.includes('gateways.view') ?? false,
  );
  protected readonly editWhy = computed(() =>
    this.session()?.roles.some((r) => r.readOnly)
      ? 'Management has read-only access.'
      : this.session()?.subTasks.includes('gateways.edit')
        ? ''
        : "Your role doesn't include this task.",
  );

  constructor() {
    void this.load();
  }

  protected async load() {
    this.error.set('');
    try {
      const list = await this.api.list();
      this.items.set(list.items);
      this.platformInUse.set(list.platform?.inUse ?? false);
      this.loaded.set(true);
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  protected when(at: string) {
    return formatDateTime(at);
  }

  protected async saved(g: PaymentGatewayView, added: boolean) {
    this.form.set(null);
    this.overlays.toast(added ? `${g.label} added` : `${g.label} saved`, {
      sub: g.lastCheck
        ? g.lastCheck.ok
          ? 'The gateway accepted the keys'
          : `The gateway didn't accept the keys: ${g.lastCheck.note ?? ''}`
        : 'Choose Check to test the keys',
      tone: g.lastCheck && !g.lastCheck.ok ? 'warn' : 'ok',
    });
    await this.load();
  }

  private async act(g: PaymentGatewayView, fn: () => Promise<PaymentGatewayView>, done: string) {
    this.busyId.set(g.id);
    try {
      const out = await fn();
      this.overlays.toast(done, { sub: out.label });
      await this.load();
    } catch (e) {
      this.overlays.toast(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'), {
        tone: 'bad',
      });
      await this.load();
    } finally {
      this.busyId.set(null);
    }
  }

  protected check(g: PaymentGatewayView) {
    return this.act(
      g,
      async () => {
        const out = await this.api.check(g);
        if (!out.lastCheck?.ok) throw new Error(out.lastCheck?.note ?? 'Keys not accepted');
        return out;
      },
      'The gateway accepted the keys',
    ).catch(() => undefined);
  }

  protected makeDefault(g: PaymentGatewayView) {
    return this.act(g, () => this.api.change(g, { isDefault: true }), 'Now used for new payments');
  }

  protected async toggle(g: PaymentGatewayView) {
    const off = g.status === 'ACTIVE';
    if (off) {
      const ok = await this.overlays.confirm({
        title: `Disable ${g.label}?`,
        text: g.isDefault
          ? 'New payments move to your newest other active gateway. Payments already started can still finish.'
          : 'It is no longer used for new payments. Payments already started can still finish.',
        ok: 'Disable',
        tone: 'bad',
      });
      if (!ok) return;
    }
    await this.act(
      g,
      () => this.api.change(g, { status: off ? 'DISABLED' : 'ACTIVE' }),
      off ? 'Gateway disabled' : 'Gateway enabled',
    );
  }
}
