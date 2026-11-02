import { HttpClient, HttpHeaders, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { apiInterceptor } from './api';
import { ApiHealth } from '../Shared/ApiHealth';
import { CAMPUSONE_WEB_CONFIG } from '../../Config';
import { InrPipe, RpDatePipe, RpDateTimePipe } from './format.pipes';
import { ApiHealthService } from './health.service';
import { ApiProblem } from './problem';
import { amountText, cleanTyped, phoneText } from './typing';
import { onSessionEnded } from './web-session';

function setup(apiBaseUrl = 'https://api.campusone.test') {
  TestBed.configureTestingModule({
    providers: [
      { provide: CAMPUSONE_WEB_CONFIG, useValue: { appName: 'Console', apiBaseUrl } },
      provideHttpClient(withInterceptors([apiInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  return { http: TestBed.inject(HttpClient), ctl: TestBed.inject(HttpTestingController) };
}

describe('apiInterceptor', () => {
  it('prefixes the API base URL, sends cookies and the language', async () => {
    const { http, ctl } = setup();
    const p = firstValueFrom(http.get('/api/v1/registers'));
    const req = ctl.expectOne('https://api.campusone.test/api/v1/registers');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.headers.get('Accept-Language')).toBe('en');
    req.flush({ ok: true });
    await expect(p).resolves.toEqual({ ok: true });
    ctl.verify();
  });

  it('leaves non-API URLs untouched', async () => {
    const { http, ctl } = setup();
    const p = firstValueFrom(http.get('/assets/i18n/en.json'));
    ctl.expectOne('/assets/i18n/en.json').flush({});
    await p;
    ctl.verify();
  });

  it('maps problem+json to an ApiProblem with register wording and the correlation id', async () => {
    const { http, ctl } = setup('');
    const p = firstValueFrom(http.post('/api/v1/things', {}));
    ctl.expectOne('/api/v1/things').flush(
      {
        type: 'urn:campusone:problem:validation.failed',
        code: 'VALIDATION.FAILED',
        detail: 'server text is not shown',
        correlationId: '0199a8b2-7c3e-7d40-8a1b-3f2e4d5c6b7a',
        errors: [{ field: 'mobile', code: 'VALIDATION.MOBILE', message: 'x' }],
      },
      {
        status: 422,
        statusText: 'Unprocessable',
        headers: new HttpHeaders({ 'Content-Type': 'application/problem+json' }),
      },
    );
    const err = await p.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiProblem);
    const problem = err as ApiProblem;
    expect(problem.code).toBe('VALIDATION.FAILED');
    expect(problem.detail).toBe('Please fill in all mandatory fields.');
    expect(problem.correlationId).toBe('0199a8b2-7c3e-7d40-8a1b-3f2e4d5c6b7a');
    expect(problem.errors).toEqual([
      {
        field: 'mobile',
        code: 'VALIDATION.MOBILE',
        message: 'Please enter a valid 10-digit mobile number.',
      },
    ]);
  });

  it('does not retry a POST', async () => {
    const { http, ctl } = setup('');
    const p = firstValueFrom(http.post('/api/v1/payments', {}));
    ctl
      .expectOne('/api/v1/payments')
      .flush({ code: 'GEN.UNAVAILABLE' }, { status: 503, statusText: 'x' });
    const err = (await p.catch((e: unknown) => e)) as ApiProblem;
    expect(err.status).toBe(503);
    ctl.verify();
  });

  it('reports the session as ended when a 401 cannot be renewed (the cookies have lapsed)', async () => {
    const { http, ctl } = setup('');
    const ended: string[] = [];
    const off = onSessionEnded((s) => ended.push(s));
    const p = firstValueFrom(http.get('/api/v1/console/members'));
    ctl
      .expectOne('/api/v1/console/members')
      .flush({ code: 'AUTH.UNAUTHENTICATED' }, { status: 401, statusText: 'Unauthorized' });
    const err = (await p.catch((e: unknown) => e)) as ApiProblem;
    off();
    expect(err.status).toBe(401);
    expect(ended).toEqual(['console']);
  });

  it('maps a server error without a problem body to the generic message', async () => {
    const { http, ctl } = setup('');
    const p = firstValueFrom(http.delete('/api/v1/x'));
    ctl
      .expectOne('/api/v1/x')
      .flush('<html>gateway</html>', { status: 502, statusText: 'Bad Gateway' });
    const err = (await p.catch((e: unknown) => e)) as ApiProblem;
    expect(err.code).toBe('GEN.INTERNAL');
    expect(err.detail).toBe('Something went wrong. Please try again.');
  });
});

describe('ApiHealth component', () => {
  it('shows the loading state, then success', async () => {
    const { ctl } = setup('');
    const fixture = TestBed.createComponent(ApiHealth);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Checking the service');
    ctl.expectOne('/health/live').flush({ status: 'ok' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Service available');
  });

  it('shows the error state with the correlation id and a retry', async () => {
    const { ctl } = setup('');
    const service = TestBed.inject(ApiHealthService);
    const fixture = TestBed.createComponent(ApiHealth);
    fixture.detectChanges();
    for (let i = 0; i < 3; i++) {
      ctl
        .expectOne('/health/live')
        .flush(
          { code: 'GEN.UNAVAILABLE', correlationId: 'ref-123' },
          { status: 503, statusText: 'x' },
        );
      await new Promise((r) => setTimeout(r, 1300));
    }
    await fixture.whenStable();
    fixture.detectChanges();
    expect(service.state().status).toBe('down');
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('The service is temporarily unavailable');
    expect(text).toContain('Ref ref-123');
    expect(fixture.nativeElement.querySelector('button')?.textContent).toContain('Try again');
  }, 10_000);
});

describe('format pipes', () => {
  it('formats money and dates the Indian way', () => {
    expect(new InrPipe().transform('124560.00')).toBe('₹1,24,560.00');
    expect(new InrPipe().transform(5)).toBe('₹0.05');
    expect(new RpDatePipe().transform('2026-09-30')).toBe('30 Sep 2026');
    expect(new RpDateTimePipe().transform('2026-09-30T07:10:00Z')).toBe('30 Sep 2026 · 12:40 PM');
  });
});

describe('typing rules (client 2026-10-14: amounts and contact numbers take numbers only)', () => {
  it('keeps digits and one decimal point, with paise, in an amount', () => {
    expect(amountText('₹1,500.505')).toBe('1500.50');
    expect(amountText('12.3.4')).toBe('12.34');
    expect(amountText('1500.50')).toBe('1500.50');
    expect(amountText('abc')).toBe('');
  });

  it('keeps digits, with a "+" in front only, in a phone number', () => {
    expect(phoneText('+971 50-123 4567')).toBe('+971501234567');
    expect(phoneText('98450x12345')).toBe('9845012345');
    expect(phoneText('98+45')).toBe('9845');
  });

  it('cleans the box itself, so a refused character never shows', () => {
    const el = document.createElement('input');
    document.body.append(el);
    el.value = '12a.5';
    expect(cleanTyped(el, amountText)).toBe('12.5');
    expect(el.value).toBe('12.5');
    el.remove();
  });
});
