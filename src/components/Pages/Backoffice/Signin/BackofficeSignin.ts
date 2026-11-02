import { ChangeDetectionStrategy, Component } from '@angular/core';
import { StaffSignin } from '../../../Shared/StaffSignin';

/** o.signin — operator back-office sign-in (SRS 6.4, CR-05; IDN-035…037). */
@Component({
  selector: 'rp-backoffice-signin',
  imports: [StaffSignin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<rp-staff-signin surface="ops" />`,
})
export class BackofficeSignin {}
