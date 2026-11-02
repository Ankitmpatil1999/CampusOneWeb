import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { type EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { apiInterceptor } from './api';
import { CAMPUSONE_WEB_CONFIG, type CampusOneWebConfig } from '../../Config';

/** Core providers for every CampusOne web app: config, HttpClient and the API interceptor. */
export function provideCampusOneCore(config: CampusOneWebConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: CAMPUSONE_WEB_CONFIG, useValue: config },
    provideHttpClient(withFetch(), withInterceptors([apiInterceptor])),
  ]);
}
