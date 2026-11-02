import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { Header } from '../../../Header/Header';
import { apiInterceptor } from '../../../Utils/api';
import { ConsoleSearch } from './ConsoleSearch';

const tick = () => new Promise((r) => setTimeout(r, 0));

async function request(url: string, method = 'GET') {
  const ctl = TestBed.inject(HttpTestingController);
  for (let i = 0; i < 60; i++) {
    const found = ctl.match((r) => r.urlWithParams === url && r.method === method);
    if (found[0]) return found[0];
    await tick();
  }
  throw new Error(`no ${method} ${url}`);
}

const results = {
  members: [
    {
      id: 'm-1',
      memberNo: 'TVPS-00001',
      name: 'AARAV SHETTY',
      kind: 'STUDENTS',
      userType: 'Student',
      detail: 'Grade 7 A',
      number: 'TVPS-2019-0142',
      status: 'ACTIVE',
    },
    {
      id: 'm-2',
      memberNo: 'TVPS-00002',
      name: 'AARTI RAO',
      kind: 'STAFF',
      userType: 'Teacher',
      detail: 'Science',
      number: null,
      status: 'SUSPENDED',
    },
  ],
  references: [],
};

describe('console Search (IDN-059)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: CAMPUSONE_WEB_CONFIG, useValue: WEB_CONFIG },
        provideRouter([
          { path: 'console/search', component: ConsoleSearch },
          { path: 'console/members', children: [] },
        ]),
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
      ],
    });
  });

  async function settle(harness: RouterTestingHarness) {
    for (let i = 0; i < 5; i++) await tick();
    harness.detectChanges();
  }

  it('searches the ?q= text and opens a member in the members page', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/console/search?q=aar');
    (await request('/api/v1/console/search?q=aar')).flush(results);
    await settle(harness);
    const el = harness.routeNativeElement as HTMLElement;
    expect((el.querySelector('#q') as HTMLInputElement).value).toBe('aar');
    expect(el.querySelector('.c-ph p')?.textContent).toContain(
      'Results for “aar” — limited to what your role can open',
    );
    expect(el.textContent).toContain('Payment references arrive with the wallet (Phase 3)');
    expect(el.querySelector('.sec-h h3')?.textContent).toBe('Members · 2');
    const rows = [...el.querySelectorAll('tbody tr')] as HTMLElement[];
    expect(rows[0]?.querySelector('.cell-t')?.textContent).toBe('Aarav Shetty');
    expect(rows[0]?.querySelector('.cell-s')?.textContent).toBe('TVPS-00001');
    expect(rows[0]?.querySelector('.t-mono')?.textContent).toBe('TVPS-2019-0142');
    expect(rows[0]?.textContent).toContain('Grade 7 A');
    expect(rows[1]?.querySelector('.t-mono')?.textContent).toBe('—');
    expect(rows[1]?.querySelector('.chip')?.className).toContain('tone-bad');
    expect(rows[1]?.querySelector('.chip')?.textContent?.trim()).toBe('Suspended');
    expect(el.querySelector('.pager')?.textContent).toContain('2 members');

    rows[1]!.click();
    await settle(harness);
    expect(TestBed.inject(Router).url).toBe('/console/members?open=m-2');
  });

  it('asks for two characters before searching', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/console/search?q=a');
    await settle(harness);
    TestBed.inject(HttpTestingController).expectNone(() => true);
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.textContent).toContain('Type at least two characters');
    expect(el.querySelector('.c-ph p')?.textContent).toContain('Results for “a”');
  });

  it('says when nothing matches and searches again from its own box', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/console/search?q=zz');
    (await request('/api/v1/console/search?q=zz')).flush({ members: [], references: [] });
    await settle(harness);
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.textContent).toContain('Nothing matches “zz”');

    const box = el.querySelector('#q') as HTMLInputElement;
    box.value = 'aarav ';
    box.dispatchEvent(new Event('input'));
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    (await request('/api/v1/console/search?q=aarav')).flush(results);
    await settle(harness);
    expect(TestBed.inject(Router).url).toBe('/console/search?q=aarav');
    expect(box.value).toBe('aarav ');
    expect(el.querySelectorAll('tbody tr').length).toBe(2);
  });

  it('shows the server problem with a retry', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/console/search?q=aar');
    (await request('/api/v1/console/search?q=aar')).flush(
      { code: 'GEN.INTERNAL' },
      { status: 500, statusText: 'Server Error' },
    );
    await settle(harness);
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.textContent).toContain("Couldn't search");
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Try again')!.click();
    (await request('/api/v1/console/search?q=aar')).flush(results);
    await settle(harness);
    expect(el.querySelectorAll('tbody tr').length).toBe(2);
  });

  it('the console top bar opens the search page on Enter', async () => {
    const fixture = TestBed.createComponent(Header);
    fixture.componentRef.setInput('surface', 'console');
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const input = (fixture.nativeElement as HTMLElement).querySelector(
      '.search input',
    ) as HTMLInputElement;
    expect(input.placeholder).toBe('Search members, references');

    input.value = '   ';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await fixture.whenStable();
    expect(router.url).toBe('/');

    input.value = ' aarav shetty ';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await fixture.whenStable();
    expect(router.url).toBe('/console/search?q=aarav%20shetty');
  });
});
