import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { CorporateCodesPanel } from './CorporateCodesPanel';
import { CONSOLE_CODES } from './corporate-codes.api';

/**
 * c.corpcodes — Bank accounts & VANs (client 2026-10-13/14; INS-043…045): the Institution
 * Administrator adds the corporate codes the banks allotted (bank, IFSC, pool account) and chooses
 * which classes use each; one code is the default for everyone else.
 */
@Component({
  selector: 'rp-console-corporate-codes',
  imports: [CorporateCodesPanel, Empty, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Bank accounts & VANs"
        sub="The corporate codes your banks allotted, and which classes use each one for money added by bank transfer."
      />
      @if (!canView()) {
        <rp-empty
          icon="lock"
          title="This page isn't part of your role"
          text="Corporate codes are managed by the institution administrator. Pages your role can open are listed in the menu."
        />
      } @else {
        <rp-corporate-codes [base]="base" [editWhy]="editWhy()" />
      }
    </div>
  `,
})
export class ConsoleCorporateCodes {
  private readonly session = inject(SessionContext).console;
  protected readonly base = CONSOLE_CODES;

  protected readonly canView = computed(
    () => this.session()?.subTasks.includes('corpcodes.view') ?? false,
  );
  protected readonly editWhy = computed(() =>
    this.session()?.roles.some((r) => r.readOnly)
      ? 'Management has read-only access.'
      : this.session()?.subTasks.includes('corpcodes.edit')
        ? ''
        : "Your role doesn't include this task.",
  );
}
