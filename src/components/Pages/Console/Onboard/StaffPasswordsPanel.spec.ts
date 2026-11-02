import { TestBed } from '@angular/core/testing';
import { StaffPasswordsPanel } from './StaffPasswordsPanel';

describe('new staff passwords, shown once (client 2026-10-07)', () => {
  it('lists every password and closes only after the confirmation', () => {
    const fixture = TestBed.createComponent(StaffPasswordsPanel);
    fixture.componentRef.setInput('items', [
      {
        name: 'Asha Hegde',
        email: 'asha@school.example.in',
        employeeNo: 'EMP00011',
        temporaryPassword: 'Ab3dEf6hIj@1',
      },
      {
        name: 'Bhavya Rao',
        email: 'bhavya@school.example.in',
        employeeNo: 'EMP00012',
        temporaryPassword: 'Zy9xWv8uTs@1',
      },
    ]);
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    fixture.detectChanges();
    const list = document.getElementById('ob-staff-pw')!;
    expect(list.textContent).toContain('Ab3dEf6hIj@1');
    expect(list.textContent).toContain('Zy9xWv8uTs@1');
    expect(list.textContent).toContain('EMP00012');
    expect(document.getElementById('ob-staff-pw-all')).toBeTruthy();

    (document.getElementById('ob-staff-pw-done') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(closed).toBe(0);
    expect(document.getElementById('ob-staff-pw-ok-e')?.textContent).toContain(
      "they can't be shown again",
    );
    (document.getElementById('ob-staff-pw-ok') as HTMLInputElement).click();
    (document.getElementById('ob-staff-pw-done') as HTMLButtonElement).click();
    expect(closed).toBe(1);
  });
});
