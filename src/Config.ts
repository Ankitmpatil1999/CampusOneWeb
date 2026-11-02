import { InjectionToken } from '@angular/core';

export interface CampusOneWebConfig {
  /** Application name shown in the shell and sent nowhere else. */
  readonly appName: string;
  /**
   * Base URL of the API. Empty string = same origin (production ingress; the dev server proxies
   * /api and /health to the backend — see proxy.conf.json).
   */
  readonly apiBaseUrl: string;
}

export const CAMPUSONE_WEB_CONFIG = new InjectionToken<CampusOneWebConfig>('CAMPUSONE_WEB_CONFIG');

export const WEB_CONFIG: CampusOneWebConfig = { appName: 'CampusOne', apiBaseUrl: '' };

/**
 * The areas of the web application (one app; each area is a lazy-loaded route under
 * components/Pages/<Area>). Who may use an area is decided by the API on every request
 * (server-side authorisation); the menu only hides what a user cannot open.
 */
export interface Area {
  readonly path: string;
  readonly title: string;
  readonly purpose: string;
}

export const AREAS = {
  console: {
    path: 'console',
    title: 'Institution Console',
    purpose:
      'For institution administrators and staff: members, money, fees, academics, attendance, transport and communication.',
  },
  backoffice: {
    path: 'backoffice',
    title: 'Operator Back Office',
    purpose:
      'For platform operators: institutions, plans, settlement, reconciliation, support and cross-institution reporting.',
  },
  admissions: {
    path: 'admissions',
    title: 'Admissions',
    purpose: 'Public admission pages: application form, fee payment and application status.',
  },
  portal: {
    path: 'portal',
    title: 'Customer Portal',
    purpose:
      'For institutions that subscribe to CampusOne: sign-up, onboarding checklist, plan, billing and data export.',
  },
  terminal: {
    path: 'terminal',
    title: 'Terminal',
    purpose: 'Attendance readers and point-of-sale counters.',
  },
} as const satisfies Record<string, Area>;

export const AREA_LIST: readonly Area[] = Object.values(AREAS);
