/**
 * A merchant's home on the web (client 2026-10-13; the merchant app's home, PAY-007): today's
 * collections, the wallet balance, payment requests still open and the QR codes, with the merchant's
 * details — what it accepts and which ways of collecting the school has switched on.
 */
import {
  ChangeDetectionStrategy,
  Component,
  type OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionContext } from '../../../../Context/SessionContext';
import { Card, Kpi, PageHead } from '../../../Shared/Blocks';
import { inrText } from '../../../Shared/Amount';
import { Icon } from '../../../Shared/Icon';
import { TaskLauncher } from '../../../Shared/TaskLauncher';
import { formatDate } from '../../../Utils/format';
import { greeting } from '../../../Utils/greeting';
import { ownHome } from '../../../Utils/navigation';
import { num, problemText } from '../Structure/academic-format';
import { BusinessApi, QR_KIND, type MerchantHome } from './business.api';

@Component({
  selector: 'rp-business-home',
  imports: [Card, Icon, Kpi, PageHead, RouterLink, TaskLauncher],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="c-page">
    <!-- On the merchant's own dashboard the greeting leads (no name: a merchant's account is named
         after the counter, not a person) and the counter's name moves under it. -->
    <rp-page-head
      [title]="home() ? greeting('') : (data()?.merchant?.displayName ?? 'Merchant home')"
      [sub]="
        data()
          ? (home() ? data()!.merchant.displayName + ' · ' : '') +
            'Merchant ID ' +
            data()!.merchant.uniqueId +
            ' · ' +
            typeLabel()
          : 'Your counter at the school.'
      "
    >
      <button type="button" class="btn btn-sec" [disabled]="loading()" (click)="load()">
        <rp-icon name="refresh" [size]="17" /><span>Refresh</span>
      </button>
      @if (canCollect()) {
        <a class="btn btn-pri" id="bh-collect" routerLink="/console/business-collect"
          ><rp-icon name="qr" [size]="17" /><span>Collect payment</span></a
        >
      }
    </rp-page-head>
    <!-- The merchant's dashboard (client 2026-10-27): the task cards under the greeting. -->
    @if (home()) {
      <rp-task-launcher surface="console" />
    }

    @if (error()) {
      <div class="note tone-bad" role="alert" id="bh-error">
        <rp-icon name="alert" [size]="17" />
        <div class="grow">{{ error() }}</div>
        <button type="button" class="btn btn-sec btn-sm" (click)="load()">Try again</button>
      </div>
    } @else if (!data()) {
      <div class="card pad"><div class="sk" style="height: 260px; border-radius: 16px"></div></div>
    } @else if (data(); as d) {
      @if (d.merchant.status !== 'ACTIVE') {
        <div class="note tone-warn" id="bh-status">
          <rp-icon name="alert" [size]="17" />
          <div class="grow">
            <b>{{ d.merchant.status === 'SUSPENDED' ? 'Suspended' : 'Inactive' }}.</b>
            {{ d.merchant.statusReason || 'Payments to you are paused. Ask the school office.' }}
          </div>
        </div>
      }
      <div class="c-grid k4" id="bh-kpis">
        <rp-kpi
          label="Collected today"
          [value]="inr(d.today.gross)"
          icon="rupee"
          tone="ok"
          [delta]="num(d.today.count) + ' payment' + (d.today.count === 1 ? '' : 's')"
          link="/console/business-collections"
        />
        <rp-kpi
          label="Wallet balance"
          [value]="d.wallet ? inr(d.wallet.balance) : '—'"
          icon="wallet"
          [delta]="d.wallet ? 'Wallet ' + d.wallet.walletNo : 'No wallet yet'"
          link="/console/business-wallet"
        />
        <rp-kpi
          label="Waiting to be paid"
          [value]="num(d.openRequests)"
          icon="hourglass"
          [tone]="d.openRequests ? 'warn' : null"
          delta="Open payment requests"
        />
        <rp-kpi
          label="QR codes"
          [value]="num(activeQr())"
          icon="qr"
          [delta]="num(d.qr.length) + ' in all'"
          link="/console/business-qr"
        />
      </div>

      <div class="c-grid k2">
        <rp-card title="Your details" icon="store">
          <dl class="kv" id="bh-details">
            <dt>Merchant ID</dt>
            <dd class="t-mono">{{ d.merchant.uniqueId }}</dd>
            <dt>Type</dt>
            <dd>{{ typeLabel() }}</dd>
            <dt>Department</dt>
            <dd>{{ d.merchant.department || '—' }}</dd>
            <dt>Operator</dt>
            <dd>{{ d.merchant.operator }}</dd>
            <dt>E-mail</dt>
            <dd>{{ d.merchant.email || '—' }}</dd>
            @if (d.merchant.onboardedAt) {
              <dt>With CampusOne since</dt>
              <dd>{{ formatDate(d.merchant.onboardedAt) }}</dd>
            }
          </dl>
        </rp-card>
        <rp-card title="How you are paid" icon="card">
          <div class="stack g12" id="bh-ways">
            <div class="row g8 wrap">
              @for (w of accepts(); track w.l) {
                <span class="chip dot" [class]="'chip dot tone-' + (w.on ? 'ok' : 'neutral')">{{
                  w.l
                }}</span>
              }
            </div>
            <dl class="kv">
              <dt>Dynamic QR for an amount</dt>
              <dd>{{ d.merchant.channels.dynamicQr ? 'On' : 'Off' }}</dd>
              <dt>Campus card (NFC)</dt>
              <dd>{{ d.merchant.channels.nfc ? 'On' : 'Off' }}</dd>
              <dt>Static QR codes</dt>
              <dd>{{ qrText() }}</dd>
            </dl>
            <p class="t-xs t-muted">The school switches these on and off for you.</p>
          </div>
        </rp-card>
      </div>
    }
  </div>`,
})
export class BusinessHome implements OnInit {
  private readonly api = inject(BusinessApi);
  private readonly session = inject(SessionContext).console;
  protected readonly num = num;
  protected readonly inr = inrText;
  protected readonly formatDate = formatDate;
  protected readonly greeting = greeting;
  protected readonly data = signal<MerchantHome | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');

  /** The merchant's own dashboard (no institution home): the greeting, then the task cards. */
  protected readonly home = computed(() => ownHome(this.session()?.subTasks ?? []) === 'business');
  protected readonly canCollect = computed(
    () => this.session()?.subTasks.includes('business.collect') ?? false,
  );
  protected readonly typeLabel = computed(() =>
    this.data()?.merchant.subType === 'VENDOR' ? 'Vendor merchant' : 'Merchant',
  );
  protected readonly activeQr = computed(
    () => this.data()?.qr.filter((q) => q.status === 'ACTIVE').length ?? 0,
  );
  protected readonly accepts = computed(() => {
    const a = this.data()?.merchant.accepts;
    return [
      { l: 'Wallet', on: !!a?.wallet },
      { l: 'Allowance', on: !!a?.allowance },
      { l: 'Coupons', on: !!a?.coupon },
    ];
  });
  protected readonly qrText = computed(() => {
    const q = this.data()?.qr ?? [];
    if (!q.length) return 'None yet';
    return q
      .map((x) => `${QR_KIND[x.kind] ?? x.kind}${x.status === 'ACTIVE' ? '' : ' (inactive)'}`)
      .join(', ');
  });

  ngOnInit() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.data.set(await this.api.home());
      this.error.set('');
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }
}
