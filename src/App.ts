import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Root component: the routes (App.routes.ts) render inside the Mainpage layout. */
@Component({
  selector: 'rp-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet />`,
})
export class App {}
