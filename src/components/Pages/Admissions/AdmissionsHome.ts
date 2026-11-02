import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AREAS } from '../../../Config';
import { AreaPage } from '../../Shared/AreaPage';

/** Public admissions: home page. Its screens arrive with their modules (docs/02). */
@Component({
  selector: 'rp-admissions-home',
  imports: [AreaPage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<rp-area-page [area]="area" />`,
})
export class AdmissionsHome {
  protected readonly area = AREAS.admissions;
}
