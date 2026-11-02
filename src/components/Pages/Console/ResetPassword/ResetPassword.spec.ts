import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';

const tick = () => new Promise((r) => setTimeout(r, 0));

async function request(url: string, method = 'GET') {
  const ctl = TestBed.inject(HttpTestingController);
  for (let i = 0; i < 50; i++) {
    const found = ctl.match((r) => r.url === url && r.method === method);
    if (found[0]) return found[0];
    await tick();
  }
  throw new Error(`no ${method} ${url}`);
}

const set = (el: HTMLElement, sel: string, v: string) => {
  const i = el.querySelector<HTMLInputElement>(sel)!;
  i.value = v;
  i.dispatchEvent(new Event('input'));
};

describe('staff password reset (IDN-034, IDN-083)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: CAMPUSONE_WEB_CONFIG, useValue: WEB_CONFIG },
        provideRouter(appRoutes),
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
      ],
    });
  });

  it('sends the reset link for the e-mail typed on the sign-in page', async () => {
    const harness = await RouterTestingHarness.create('/console/signin');
    const el = harness.routeNativeElement as HTMLElement;
    const forgot = () =>
      [...el.querySelectorAll<HTMLButtonElement>('.cp-lk')]
        .find((b) => b.textContent?.includes('Forgot password?'))!
        .click();
    forgot();
    harness.detectChanges();
    expect(el.querySelector('#cp-au-email-e')?.textContent?.trim()).not.toBe('');
    set(el, '#cp-au-email', 'Prakash.Shetty@tvps.example.in');
    forgot();
    const r = await request('/api/v1/auth/console/password/forgot', 'POST');
    expect(r.request.body).toEqual({ email: 'prakash.shetty@tvps.example.in' });
    r.flush(null, { status: 202, statusText: 'Accepted' });
    await tick();
    harness.detectChanges();
    expect(document.querySelector('.toasts')?.textContent).toContain('Password reset link sent');
    expect(document.querySelector('.toasts')?.textContent).toContain(
      'If prakash.shetty@tvps.example.in has a console account, a reset link is on its way.',
    );
  });

  it('sets the new password from the link and drops the token from the address', async () => {
    history.replaceState(null, '', '/console/reset-password#token=tok-123');
    const harness = await RouterTestingHarness.create('/console/reset-password');
    (await request('/api/v1/auth/member/signup/reference')).flush({
      password: { minLength: 8, maxLength: 64 },
    });
    await tick();
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    expect(location.hash).toBe('');
    expect(el.querySelector('.cp-af h1')?.textContent?.trim()).toBe('New password');
    expect(el.querySelector('#cp-rp-p1-h')?.textContent).toContain('between 8 and 64 characters');

    set(el, '#cp-rp-p1', 'Tvps@2027new');
    set(el, '#cp-rp-p2', 'Tvps@2027old');
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    harness.detectChanges();
    expect(el.querySelector('#cp-rp-p2-e')?.textContent?.trim()).toBe('Password does not match');

    set(el, '#cp-rp-p2', 'Tvps@2027new');
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    const r = await request('/api/v1/auth/staff/password/reset', 'POST');
    expect(r.request.body).toEqual({ resetToken: 'tok-123', newPassword: 'Tvps@2027new' });
    r.flush(null, { status: 204, statusText: 'No Content' });
    await tick();
    harness.detectChanges();
    expect(el.querySelector('.cp-af h1')?.textContent?.trim()).toBe('Password changed');
  });

  it('explains a used or expired link', async () => {
    history.replaceState(null, '', '/backoffice/reset-password');
    const harness = await RouterTestingHarness.create('/backoffice/reset-password');
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.querySelector('.cp-af p')?.textContent?.trim()).toBe(
      'This link has expired or was already used. Ask for a new one on the sign-in page.',
    );
  });
});
