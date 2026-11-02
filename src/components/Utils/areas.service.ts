import { Injectable, inject, signal } from '@angular/core';
import { type CanMatchFn, Router } from '@angular/router';
import { AREA_LIST, type Area } from '../../Config';

/** Per-environment settings read at start-up from `public/runtime-config.json` (no rebuild). */
export interface RuntimeConfig {
  /**
   * Host names that serve the operator back office only (e.g. ops.example.in). When the list is
   * empty (local development), every host serves every area.
   */
  readonly backofficeHosts: readonly string[];
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = { backofficeHosts: [] };

/**
 * Which areas this host serves (ADR-0014): a back-office host serves only the back office; every
 * other host serves the other areas. Access itself is always decided by the API.
 */
export function areasForHost(hostname: string, config: RuntimeConfig): readonly Area[] {
  const hosts = config.backofficeHosts.map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (hosts.length === 0) return AREA_LIST;
  const isBackofficeHost = hosts.includes(hostname.toLowerCase());
  return AREA_LIST.filter((a) => (a.path === 'backoffice') === isBackofficeHost);
}

const isRuntimeConfig = (v: unknown): v is RuntimeConfig =>
  typeof v === 'object' &&
  v !== null &&
  Array.isArray((v as RuntimeConfig).backofficeHosts) &&
  (v as RuntimeConfig).backofficeHosts.every((h) => typeof h === 'string');

@Injectable({ providedIn: 'root' })
export class AreasService {
  readonly areas = signal<readonly Area[]>(AREA_LIST);

  /** Reads the runtime config; on any failure the defaults apply (every area). */
  async load(
    fetchFn: typeof fetch = fetch,
    hostname = globalThis.location?.hostname ?? '',
  ): Promise<void> {
    let config = DEFAULT_RUNTIME_CONFIG;
    try {
      const res = await fetchFn('runtime-config.json', { cache: 'no-cache' });
      if (res.ok) {
        const body: unknown = await res.json();
        if (isRuntimeConfig(body)) config = body;
      }
    } catch {
      /* missing or unreadable file: keep the defaults */
    }
    this.areas.set(areasForHost(hostname, config));
  }

  has(path: string): boolean {
    return this.areas().some((a) => a.path === path);
  }
}

/** Route guard: an area that this host does not serve sends the user to the landing page. */
export function areaAvailable(path: string): CanMatchFn {
  return () => inject(AreasService).has(path) || inject(Router).parseUrl('/');
}
