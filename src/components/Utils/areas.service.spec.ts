import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { appRoutes } from '../../App.routes';
import { AREA_LIST, CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../Config';
import { AreasService, areasForHost } from './areas.service';

const paths = (areas: readonly { path: string }[]) => areas.map((a) => a.path);
const OPS = { backofficeHosts: ['ops.campusone.example'] };

describe('areasForHost', () => {
  it('serves every area when no back-office host is configured (local development)', () => {
    expect(paths(areasForHost('localhost', { backofficeHosts: [] }))).toEqual(paths(AREA_LIST));
  });

  it('serves only the back office on a back-office host (case-insensitive)', () => {
    expect(paths(areasForHost('OPS.campusone.example', OPS))).toEqual(['backoffice']);
  });

  it('hides the back office on every other host', () => {
    expect(paths(areasForHost('app.campusone.example', OPS))).toEqual([
      'console',
      'admissions',
      'portal',
      'terminal',
    ]);
  });
});

describe('AreasService.load', () => {
  const respond = (body: unknown, ok = true) =>
    (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

  it('applies runtime-config.json for this host', async () => {
    const service = new AreasService();
    await service.load(respond(OPS), 'app.campusone.example');
    expect(service.has('backoffice')).toBe(false);
    expect(service.has('console')).toBe(true);
  });

  it('keeps every area when the file is missing or malformed', async () => {
    const service = new AreasService();
    await service.load(respond({}, false), 'app.campusone.example');
    expect(paths(service.areas())).toEqual(paths(AREA_LIST));
    await service.load(respond({ backofficeHosts: 'nope' }), 'app.campusone.example');
    expect(paths(service.areas())).toEqual(paths(AREA_LIST));
    const failing = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    await service.load(failing, 'app.campusone.example');
    expect(paths(service.areas())).toEqual(paths(AREA_LIST));
  });
});

describe('area routes on a host that does not serve them', () => {
  it('sends /backoffice to the landing page on the school-facing host', async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: CAMPUSONE_WEB_CONFIG, useValue: WEB_CONFIG },
        provideRouter(appRoutes),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    TestBed.inject(AreasService).areas.set(areasForHost('app.campusone.example', OPS));
    const harness = await RouterTestingHarness.create('/backoffice');
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toBe('CampusOne');
    expect(el.textContent).not.toContain('Operator Back Office');
  });
});
