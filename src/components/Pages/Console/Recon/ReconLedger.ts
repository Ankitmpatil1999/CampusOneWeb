import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Amount } from '../../../Shared/Amount';
import { Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { dt, plural } from '../Settlements/settlement-format';
import type { LedgerCheck } from './recon.api';
import { walletKind, walletNo } from './recon-format';

/**
 * The Ledger check tab (prototype recLedger; REC-017, FR-REC-05, NFR-12): every wallet's stored
 * balance against the balance derived from its ledger entries; differences are listed, never
 * corrected here. "Run check now" asks the server again. Reporting a wallet to CampusOne from the
 * console has no API yet: CampusOne reconciliation sees the same differences in its own check
 * (REC-012), so the button explains that instead of pretending to send a report.
 */
@Component({
  selector: 'rp-recon-ledger',
  imports: [Amount, Empty, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <div class="note tone-info">
      <rp-icon name="scale" [size]="17" />
      <div class="grow">
        Every balance change is a balanced debit/credit pair in the ledger. This check lists any
        wallet whose stored balance differs from the balance derived from its ledger entries
        (FR-REC-05). Differences are reported to CampusOne reconciliation — never corrected silently
        (NFR-12).
      </div>
    </div>

    @if (error()) {
      <div class="card pad">
        <rp-empty icon="alertc" title="Couldn't run the ledger check" [text]="error()">
          <button type="button" class="btn btn-sec btn-sm" (click)="run.emit()">
            <span>Try again</span>
          </button>
        </rp-empty>
      </div>
    } @else {
      <div class="row between">
        <span class="t-sm t-muted" id="rl-meta">{{ meta() }}</span>
        <button
          type="button"
          class="btn btn-sec btn-sm"
          id="rl-run"
          [class.is-busy]="running()"
          [disabled]="running()"
          (click)="run.emit()"
        >
          <rp-icon name="refresh" [size]="15" /><span>Run check now</span>
        </button>
      </div>

      <div class="tbl-wrap">
        <table class="tbl" id="rl-table">
          <thead>
            <tr>
              <th>Wallet</th>
              <th class="r">Stored balance</th>
              <th class="r">Ledger-derived</th>
              <th class="r">Difference</th>
              <th>Finding</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            @if (!check()) {
              <tr>
                <td colspan="6"><rp-empty icon="hourglass" title="Checking the ledger…" /></td>
              </tr>
            } @else {
              @for (w of check()!.differences; track w.walletId) {
                <tr>
                  <td>
                    <span class="t-mono">{{ no(w.walletNo) }}</span>
                    <div class="cell-s">{{ kind(w.kind) }}</div>
                  </td>
                  <td class="r"><rp-amt [value]="w.stored" /></td>
                  <td class="r">
                    <rp-amt [value]="w.ledger" [sign]="w.ledgerNegative ? '−' : null" />
                  </td>
                  <td class="r">
                    <b class="t-bad"
                      ><rp-amt [value]="w.difference" [sign]="w.differenceSign < 0 ? '−' : '+'"
                    /></b>
                  </td>
                  <td>
                    <div
                      class="t-sm"
                      style="min-width: 240px; max-width: 360px; white-space: normal"
                    >
                      Stored balance changed without a ledger pair
                      <span class="t-faint">· {{ entries(w.entries) }}</span>
                    </div>
                  </td>
                  <td>
                    <span class="cp-why" [attr.title]="reportWhy"
                      ><button type="button" class="btn btn-danger-o btn-xs" disabled>
                        <rp-icon name="flag" [size]="15" /><span>Report to CampusOne</span>
                      </button></span
                    >
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6">
                    <rp-empty
                      icon="checkc"
                      title="Every wallet matches its ledger"
                      text="Stored balances equal the ledger-derived balances."
                    />
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
      @if (check()?.differences?.length) {
        <div class="pager">
          <span>{{ plural(check()!.differences.length, 'wallet') }}</span>
        </div>
      }
    }
  `,
})
export class ReconLedger {
  readonly check = input<LedgerCheck | null>(null);
  readonly error = input('');
  readonly running = input(false);
  readonly run = output<void>();

  protected readonly plural = plural;
  protected readonly reportWhy =
    'CampusOne reconciliation sees this difference in its own daily check and investigates it; reporting from the console arrives later.';

  protected meta() {
    const c = this.check();
    return c ? `${plural(c.checked, 'wallet')} checked · last run ${dt(c.checkedAt)}` : '';
  }
  protected entries(n: number) {
    return `${n.toLocaleString('en-IN')} ledger ${n === 1 ? 'entry' : 'entries'}`;
  }
  protected no(n: string) {
    return walletNo(n);
  }
  protected kind(k: string) {
    return walletKind(k);
  }
}
