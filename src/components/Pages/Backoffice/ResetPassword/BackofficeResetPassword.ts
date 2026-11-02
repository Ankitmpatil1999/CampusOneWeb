import { ChangeDetectionStrategy, Component } from '@angular/core';
import { StaffSignin } from '../../../Shared/StaffSignin';

/** The page of the back-office "Forgot password?" e-mail link (SRS 6.4, 6.8; IDN-082, IDN-083). */
@Component({
  selector: 'rp-backoffice-reset-password',
  imports: [StaffSignin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<rp-staff-signin surface="ops" mode="reset" />`,
})
export class BackofficeResetPassword {}
