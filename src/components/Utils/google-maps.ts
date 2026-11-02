/**
 * Google Maps on the web (client 2026-10-21): the Maps JavaScript API, loaded once, on the first page
 * that shows a map, with the browser key the server hands out (TRN-039, GOOGLE_MAPS_BROWSER_KEY —
 * restricted to the site in Google Cloud). Without a key the pages show the place as numbers and say
 * the map isn't set up. Only the few classes the pages use are typed here.
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

export interface MapsConfig {
  /** How road distances are measured on the server: Google, a straight-line estimate, or none. */
  readonly provider: 'off' | 'test' | 'google';
  readonly browserKey: string | null;
  /** How often live positions are refreshed (seconds). */
  readonly refreshSeconds: number;
  /** A bus position older than this is shown as "last seen …" (seconds). */
  readonly staleSeconds: number;
}

interface GLatLng {
  lat(): number;
  lng(): number;
}
export interface GListener {
  remove(): void;
}
export interface GMap {
  setCenter(p: LatLng): void;
  setZoom(z: number): void;
  getZoom(): number | undefined;
  fitBounds(b: GBounds, padding?: number): void;
  panTo(p: LatLng): void;
  addListener(event: string, fn: (e: { latLng?: GLatLng | null }) => void): GListener;
}
export interface GMarker {
  setMap(m: GMap | null): void;
  setPosition(p: LatLng): void;
  setIcon(icon: object): void;
  setTitle(t: string): void;
  getPosition(): GLatLng | null | undefined;
  addListener(event: string, fn: () => void): GListener;
}
export interface GPolyline {
  setMap(m: GMap | null): void;
  setPath(p: readonly LatLng[]): void;
}
export interface GBounds {
  extend(p: LatLng): void;
  isEmpty(): boolean;
}
export interface GoogleMaps {
  readonly Map: new (el: HTMLElement, opts: object) => GMap;
  readonly Marker: new (opts: object) => GMarker;
  readonly Polyline: new (opts: object) => GPolyline;
  readonly LatLngBounds: new () => GBounds;
  readonly SymbolPath: { readonly CIRCLE: number; readonly FORWARD_CLOSED_ARROW: number };
}

type MapsWindow = Window & {
  google?: { maps?: GoogleMaps };
  __campusoneMapsReady?: () => void;
};

let loading: Promise<GoogleMaps> | null = null;

/** Loads the Maps JavaScript API once; a failed load can be tried again. */
export function loadGoogleMaps(key: string): Promise<GoogleMaps> {
  const w = window as MapsWindow;
  if (w.google?.maps?.Map) return Promise.resolve(w.google.maps);
  if (loading) return loading;
  loading = new Promise<GoogleMaps>((resolve, reject) => {
    w.__campusoneMapsReady = () => {
      if (w.google?.maps?.Map) resolve(w.google.maps);
      else reject(new Error('Google Maps did not load'));
    };
    const s = document.createElement('script');
    s.src =
      'https://maps.googleapis.com/maps/api/js?v=weekly&loading=async&callback=__campusoneMapsReady&key=' +
      encodeURIComponent(key);
    s.async = true;
    s.onerror = () => {
      loading = null;
      s.remove();
      reject(new Error('Google Maps did not load'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** The server's map settings (TRN-039), read once per page load. */
@Injectable({ providedIn: 'root' })
export class MapsSettings {
  private readonly http = inject(HttpClient);
  private cached: Promise<MapsConfig> | null = null;

  config(): Promise<MapsConfig> {
    this.cached ??= firstValueFrom(this.http.get<MapsConfig>('/api/v1/console/maps')).catch(
      (e: unknown) => {
        this.cached = null;
        throw e;
      },
    );
    return this.cached;
  }
}

/** A theme colour as the map needs it (Google can't read CSS variables). */
export function themeColor(name: string, fallback: string): string {
  if (typeof getComputedStyle !== 'function') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
