import { DOCUMENT } from '@angular/common';
import {
  type ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { WEB_CONFIG } from './Config';
import { appRoutes } from './App.routes';
import { AreasService } from './components/Utils/areas.service';
import { I18n } from './components/Utils/i18n';
import { installMotionFx } from './components/Utils/motion-fx';
import { provideCampusOneCore } from './components/Utils/provide';
import { Theme } from './components/Utils/theme';
import { REQUIRE_TAB_SESSION } from './components/Utils/web-session';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    { provide: REQUIRE_TAB_SESSION, useValue: true },
    // Same-origin API: the ingress routes /api and /health; the dev server proxies them.
    provideCampusOneCore(WEB_CONFIG),
    // Which areas this host serves (public/runtime-config.json, per environment).
    provideAppInitializer(() => inject(AreasService).load()),
    // The person's language (Phase 10): its bundle is loaded before the first page renders.
    provideAppInitializer(() => inject(I18n).init()),
    // The prototype's Ocean motion and effects (presentation only, src/theme/campusone-ocean.css).
    provideAppInitializer(() => {
      installMotionFx(inject(DOCUMENT));
    }),
    // The light or dark theme chosen on this browser (the top bar's switch), before the first page.
    provideAppInitializer(() => inject(Theme).apply()),
  ],
};
