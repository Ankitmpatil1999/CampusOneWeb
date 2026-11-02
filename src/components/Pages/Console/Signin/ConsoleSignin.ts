import { ChangeDetectionStrategy, Component } from '@angular/core';
import { StaffSignin } from '../../../Shared/StaffSignin';

/** c.signin — institution console sign-in (SRS 6.4, CR-05; IDN-031…033). */
@Component({
  selector: 'rp-console-signin',
  imports: [StaffSignin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<rp-staff-signin surface="console" />`,
})
export class ConsoleSignin {}
