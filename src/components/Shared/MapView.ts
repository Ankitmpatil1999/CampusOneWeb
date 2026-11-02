import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
  type AfterViewInit,
} from '@angular/core';
import {
  loadGoogleMaps,
  MapsSettings,
  themeColor,
  type GMap,
  type GMarker,
  type GoogleMaps,
  type GPolyline,
  type LatLng,
} from '../Utils/google-maps';
import { Icon } from './Icon';

/** school · a stop · a stop already passed · the member's own stop · the bus · the place being picked. */
export type MapPointKind = 'school' | 'stop' | 'done' | 'mine' | 'bus' | 'pick';

export interface MapPoint {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  readonly kind: MapPointKind;
  readonly title: string;
  /** The bus's direction of travel (degrees), when known. */
  readonly heading?: number | null;
}

/** Centre of India until there is something to show. */
const INDIA: LatLng = { lat: 20.59, lng: 78.96 };

/**
 * A Google map (client 2026-10-21) for the transport pages: stops, the school, the bus and its trail,
 * the route's line — or, in picker mode, a pin the user drops or drags to place a stop. The figures
 * stay on the page in words; the map is an aid. Without a browser key (or when Google can't be
 * reached) it says so instead of showing an empty box.
 */
@Component({
  selector: 'rp-map',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: block' },
  styles: `
    .rp-map-box {
      width: 100%;
      border-radius: var(--r-md);
      border: 1px solid var(--line);
      overflow: hidden;
      background: var(--surface-2);
    }
  `,
  template: `
    @if (state() === 'off') {
      <div class="note tone-info">
        <rp-icon name="info" [size]="17" />
        <div class="grow">{{ offText() }}</div>
      </div>
    } @else if (state() === 'error') {
      <div class="note tone-bad" role="alert">
        <rp-icon name="alertc" [size]="17" />
        <div class="grow">The map couldn't load. Check the connection and open the page again.</div>
      </div>
    }
    <div
      #box
      class="rp-map-box"
      role="region"
      [attr.aria-label]="label()"
      [hidden]="state() === 'off' || state() === 'error'"
      [style.height.px]="height()"
    ></div>
    @if (state() === 'ready' && hint()) {
      <p class="t-xs t-muted" style="margin-top: 6px">{{ hint() }}</p>
    }
  `,
})
export class MapView implements AfterViewInit {
  private readonly settings = inject(MapsSettings);
  private readonly box = viewChild.required<ElementRef<HTMLElement>>('box');

  readonly points = input<readonly MapPoint[]>([]);
  /** The route's line (stops in order). */
  readonly path = input<readonly LatLng[]>([]);
  /** Where the bus has been on this trip. */
  readonly trail = input<readonly LatLng[]>([]);
  /** Click or drag a pin to choose a place (`picked`). */
  readonly picker = input(false);
  readonly height = input(300);
  readonly label = input('Map');
  /** The map fits everything again when this changes (not on every refresh). */
  readonly fitKey = input('');
  /** Fit to this place (close up) instead of everything. */
  readonly focus = input<LatLng | null>(null);
  readonly offText = input(
    'The map isn’t set up on this server yet (a Google Maps key is needed). The places are still saved as numbers.',
  );
  /** A line under the map, shown only when the map is there (e.g. how to pick a place). */
  readonly hint = input('');
  readonly picked = output<LatLng>();

  protected readonly state = signal<'loading' | 'ready' | 'off' | 'error'>('loading');
  private readonly g = signal<{ maps: GoogleMaps; map: GMap } | null>(null);
  private readonly markers = new Map<string, GMarker>();
  private line: GPolyline | null = null;
  private trailLine: GPolyline | null = null;
  private fitted = '';
  private readonly listeners: { remove(): void }[] = [];

  constructor() {
    effect(() => {
      const g = this.g();
      const points = this.points();
      const path = this.path();
      const trail = this.trail();
      const key = this.fitKey();
      if (!g) return;
      this.draw(g.maps, g.map, points, path, trail);
      if (key !== this.fitted) {
        this.fitted = key;
        this.fit(g.maps, g.map, points, path, trail);
      }
    });
    inject(DestroyRef).onDestroy(() => {
      for (const l of this.listeners) l.remove();
      for (const m of this.markers.values()) m.setMap(null);
      this.line?.setMap(null);
      this.trailLine?.setMap(null);
    });
  }

  async ngAfterViewInit() {
    try {
      const cfg = await this.settings.config();
      if (!cfg.browserKey) {
        this.state.set('off');
        return;
      }
      const maps = await loadGoogleMaps(cfg.browserKey);
      const first = this.points()[0];
      const map = new maps.Map(this.box().nativeElement, {
        center: first ? { lat: first.lat, lng: first.lng } : INDIA,
        zoom: first ? 14 : 5,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        clickableIcons: false,
        gestureHandling: 'cooperative',
      });
      this.listeners.push(
        map.addListener('click', (e) => {
          if (!this.picker() || !e.latLng) return;
          this.picked.emit({ lat: round6(e.latLng.lat()), lng: round6(e.latLng.lng()) });
        }),
      );
      this.state.set('ready');
      this.g.set({ maps, map });
    } catch {
      this.state.set('error');
    }
  }

  private icon(maps: GoogleMaps, p: MapPoint): object | null {
    const brand = themeColor('--brand', '#0C6F7D');
    const accent = themeColor('--accent', '#F0A12E');
    const muted = themeColor('--ink-4', '#9AA5AE');
    switch (p.kind) {
      case 'pick':
        return null; // Google's own pin
      case 'bus':
        return p.heading === null || p.heading === undefined
          ? circle(maps, 10, accent, '#ffffff', 3)
          : {
              path: maps.SymbolPath.FORWARD_CLOSED_ARROW,
              scale: 6,
              rotation: p.heading,
              fillColor: accent,
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
            };
      case 'school':
        return circle(maps, 9, brand, '#ffffff', 3);
      case 'mine':
        return circle(maps, 9, accent, brand, 3);
      case 'done':
        return circle(maps, 6, muted, '#ffffff', 2);
      default:
        return circle(maps, 6, '#ffffff', brand, 3);
    }
  }

  private draw(
    maps: GoogleMaps,
    map: GMap,
    points: readonly MapPoint[],
    path: readonly LatLng[],
    trail: readonly LatLng[],
  ) {
    const seen = new Set<string>();
    for (const p of points) {
      seen.add(p.id);
      const icon = this.icon(maps, p);
      let m = this.markers.get(p.id);
      if (!m) {
        m = new maps.Marker({
          map,
          position: { lat: p.lat, lng: p.lng },
          title: p.title,
          zIndex: p.kind === 'bus' || p.kind === 'pick' ? 10 : p.kind === 'mine' ? 5 : 1,
          draggable: p.kind === 'pick',
          ...(icon ? { icon } : {}),
        });
        if (p.kind === 'pick') {
          const marker = m;
          this.listeners.push(
            marker.addListener('dragend', () => {
              const at = marker.getPosition();
              if (at) this.picked.emit({ lat: round6(at.lat()), lng: round6(at.lng()) });
            }),
          );
        }
        this.markers.set(p.id, m);
      } else {
        m.setPosition({ lat: p.lat, lng: p.lng });
        m.setTitle(p.title);
        if (icon) m.setIcon(icon);
      }
    }
    for (const [id, m] of this.markers) {
      if (!seen.has(id)) {
        m.setMap(null);
        this.markers.delete(id);
      }
    }
    if (path.length > 1) {
      this.line ??= new maps.Polyline({
        map,
        strokeColor: themeColor('--brand', '#0C6F7D'),
        strokeOpacity: 0.55,
        strokeWeight: 4,
      });
      this.line.setPath(path);
    } else this.line?.setPath([]);
    if (trail.length > 1) {
      this.trailLine ??= new maps.Polyline({
        map,
        strokeColor: themeColor('--accent', '#F0A12E'),
        strokeOpacity: 0.9,
        strokeWeight: 4,
        zIndex: 2,
      });
      this.trailLine.setPath(trail);
    } else this.trailLine?.setPath([]);
  }

  private fit(
    maps: GoogleMaps,
    map: GMap,
    points: readonly MapPoint[],
    path: readonly LatLng[],
    trail: readonly LatLng[],
  ) {
    const focus = this.focus();
    if (focus) {
      map.setCenter(focus);
      map.setZoom(16);
      return;
    }
    const all: LatLng[] = [...points, ...path, ...trail];
    if (!all.length) return;
    if (all.length === 1) {
      map.setCenter(all[0]!);
      map.setZoom(16);
      return;
    }
    const b = new maps.LatLngBounds();
    for (const p of all) b.extend({ lat: p.lat, lng: p.lng });
    map.fitBounds(b, 48);
  }
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

function circle(maps: GoogleMaps, scale: number, fill: string, stroke: string, weight: number) {
  return {
    path: maps.SymbolPath.CIRCLE,
    scale,
    fillColor: fill,
    fillOpacity: 1,
    strokeColor: stroke,
    strokeWeight: weight,
  };
}
