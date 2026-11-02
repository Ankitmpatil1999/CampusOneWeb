import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SessionContext } from '../../../../Context/SessionContext';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Overlays } from '../../../Shared/Overlays';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { plural } from '../Settlements/settlement-format';
import { ReconApi, type LedgerCheck } from './recon.api';
import { ReconLedger } from './ReconLedger';
import { ReconMis } from './ReconMis';
import { ReconPool } from './ReconPool';
import { ReconStatement } from './ReconStatement';
import { ReconTransactions } from './ReconTransactions';

type Tab = 'tx' | 'mis' | 'stmt' | 'pool' | 'ledger';
const TABS: readonly { v: Tab; l: string }[] = [
  { v: 'tx', l: 'Transactions' },
  { v: 'mis', l: 'MIS' },
  { v: 'stmt', l: 'Merchant statement' },
  { v: 'pool', l: 'Pool balance' },
  { v: 'ledger', l: 'Ledger check' },
];

/**
 * c.recon — Transactions & MIS (SRS 15, FR-REC-01/04/05; REC-013…017; prototype c.recon): the
 * campus transactions with an export (ReconTransactions), the payer ↔ merchant matching
 * (ReconMis), a merchant's statement (ReconStatement), the pool balance (ReconPool) and the ledger
 * check (ReconLedger, its count on the tab). Everything here reads; nothing changes a balance.
 */
@Component({
  selector: 'rp-console-recon',
  imports: [Empty, PageHead, ReconLedger, ReconMis, ReconPool, ReconStatement, ReconTransactions],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Transactions & MIS"
        sub="Every campus transaction, management information, merchant statements, the pool balance and the ledger check."
      />

      @if (!canView()) {
        <rp-empty
          icon="lock"
          title="This page isn't part of your role"
          text="Transactions and MIS are followed by the accounts office. Pages your role can open are listed in the menu."
        />
      } @else {
        <div class="tabs" role="tablist" aria-label="Transactions & MIS">
          @for (t of tabs; track t.v) {
            <button
              type="button"
              class="tab"
              role="tab"
              [id]="'rc-tab-' + t.v"
              [class.on]="tab() === t.v"
              [attr.aria-selected]="tab() === t.v"
              (click)="tab.set(t.v)"
            >
              {{ t.l }}
              @if (t.v === 'ledger' && differences()) {
                <span class="n">{{ differences() }}</span>
              }
            </button>
          }
        </div>

        @switch (tab()) {
          @case ('mis') {
            <rp-recon-mis />
          }
          @case ('stmt') {
            <rp-recon-statement />
          }
          @case ('pool') {
            <rp-recon-pool (openLedger)="tab.set('ledger')" />
          }
          @case ('ledger') {
            <rp-recon-ledger
              [check]="check()"
              [error]="checkError()"
              [running]="running()"
              (run)="runCheck(true)"
            />
          }
          @default {
            <rp-recon-transactions />
          }
        }
      }
    </div>
  `,
})
export class ConsoleRecon {
  private readonly api = inject(ReconApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).console;

  protected readonly tabs = TABS;
  protected readonly tab = signal<Tab>('tx');
  protected readonly check = signal<LedgerCheck | null>(null);
  protected readonly checkError = signal('');
  protected readonly running = signal(false);

  protected readonly canView = computed(
    () => this.session()?.subTasks.includes('recon.view') ?? false,
  );
  protected readonly differences = computed(() => this.check()?.differences.length ?? 0);

  constructor() {
    const t = inject(ActivatedRoute).snapshot.queryParamMap.get('tab');
    if (t && TABS.some((x) => x.v === t)) this.tab.set(t as Tab);
    // The ledger check runs once on opening, so its tab shows how many wallets differ.
    if (this.canView()) void this.runCheck(false);
  }

  protected async runCheck(announce: boolean) {
    this.running.set(true);
    this.checkError.set('');
    try {
      const c = await this.api.ledgerCheck();
      this.check.set(c);
      if (announce) {
        const n = c.differences.length;
        this.overlays.toast(
          n
            ? `${plural(n, 'wallet')} ${n === 1 ? 'differs' : 'differ'} from the ledger`
            : 'Every wallet matches its ledger',
          { tone: n ? 'warn' : 'ok' },
        );
      }
    } catch (e) {
      this.checkError.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      this.running.set(false);
    }
  }
}
