import { TestBed } from '@angular/core/testing';
import { Theme } from './theme';

describe('the theme switch (System → Light → Dark)', () => {
  const root = document.documentElement;
  beforeEach(() => {
    localStorage.removeItem('campusone.theme');
    delete root.dataset['theme'];
    TestBed.resetTestingModule();
  });
  afterEach(() => {
    localStorage.removeItem('campusone.theme');
    delete root.dataset['theme'];
  });

  it('follows the device until a theme is chosen, then goes Light, Dark and back', () => {
    const theme = TestBed.inject(Theme);
    theme.apply();
    expect(theme.mode()).toBe('system');
    expect(theme.icon()).toBe('monitor');
    expect(root.dataset['theme']).toBeUndefined();

    theme.cycle();
    expect(root.dataset['theme']).toBe('light');
    expect(theme.icon()).toBe('sun');
    expect(localStorage.getItem('campusone.theme')).toBe('light');

    theme.cycle();
    expect(root.dataset['theme']).toBe('dark');
    expect(theme.icon()).toBe('moon');

    theme.cycle();
    expect(theme.mode()).toBe('system');
    expect(root.dataset['theme']).toBeUndefined();
    expect(localStorage.getItem('campusone.theme')).toBeNull();
  });

  it('opens on the theme chosen earlier on this browser', () => {
    localStorage.setItem('campusone.theme', 'dark');
    const theme = TestBed.inject(Theme);
    theme.apply();
    expect(theme.mode()).toBe('dark');
    expect(root.dataset['theme']).toBe('dark');
  });
});
