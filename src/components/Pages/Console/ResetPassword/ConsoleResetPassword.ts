import { ChangeDetectionStrategy, Component } from '@angular/core';
import { StaffSignin } from '../../../Shared/StaffSignin';

/** The page of the console "Forgot password?" e-mail link (SRS 6.4, 6.8; IDN-034, IDN-083). */
@Component({
  selector: 'rp-console-reset-password',
  imports: [StaffSignin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<rp-staff-signin surface="console" mode="reset" />`,
})
export class ConsoleResetPassword {}
