import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Dropdown, type DropdownOption } from './Dropdown';

const OPTIONS: DropdownOption[] = Array.from({ length: 12 }, (_, i) => ({
  v: `o${i}`,
  l: `Option ${i}`,
}));

@Component({
  imports: [Dropdown],
  template: `<rp-dd
    inputId="t"
    [options]="options"
    [value]="value()"
    (changed)="value.set($event)"
  />`,
})
class Host {
  readonly options = OPTIONS;
  readonly value = signal('o1');
}

const settle = async (fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) => {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
};

describe('Dropdown', () => {
  const realHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  afterEach(() => {
    if (realHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', realHeight);
  });

  const open = async (buttonRect: Partial<DOMRect>) => {
    const fixture = TestBed.createComponent(Host);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const btn = el.querySelector('.dd-btn') as HTMLButtonElement;
    btn.getBoundingClientRect = () =>
      ({
        left: 20,
        width: 200,
        top: 0,
        bottom: 40,
        right: 220,
        height: 40,
        ...buttonRect,
      }) as DOMRect;
    btn.click();
    await settle(fixture);
    return { fixture, el, menu: () => el.querySelector('.dd-menu') as HTMLElement | null };
  };

  it('opens below the button when there is room, and picks an option', async () => {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      value: 200,
    });
    const { fixture, el, menu } = await open({ top: 100, bottom: 140 });
    expect(menu()).not.toBeNull();
    expect(menu()!.classList.contains('up')).toBe(false);
    expect(menu()!.style.top).toBe('144px');
    (el.querySelectorAll('.dd-opt')[3] as HTMLButtonElement).click();
    await settle(fixture);
    expect(fixture.componentInstance.value()).toBe('o3');
    expect(menu()).toBeNull();
  });

  it('picks an option with a real click: the press, a screen update, then the click', async () => {
    const { fixture, el, menu } = await open({ top: 100, bottom: 140 });
    const opt = el.querySelectorAll('.dd-opt')[4] as HTMLButtonElement;
    // A person's mouse-down reaches the page's "click outside" listener first …
    opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await settle(fixture);
    // … and the menu must still be there for the mouse-up and click.
    expect(menu()).not.toBeNull();
    opt.click();
    await settle(fixture);
    expect(fixture.componentInstance.value()).toBe('o4');
    expect(menu()).toBeNull();
  });

  it('closes when the page is pressed outside it', async () => {
    const { fixture, menu } = await open({ top: 100, bottom: 140 });
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await settle(fixture);
    expect(menu()).toBeNull();
    expect(fixture.componentInstance.value()).toBe('o1');
  });

  it('opens above the button when it would leave the window below', async () => {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      value: 200,
    });
    const bottom = window.innerHeight - 10;
    const { menu } = await open({ top: bottom - 40, bottom });
    expect(menu()!.classList.contains('up')).toBe(true);
    expect(menu()!.style.top).toBe(`${bottom - 40 - 4 - 200}px`);
  });

  it('stays open while its own list scrolls', async () => {
    const { fixture, menu } = await open({ top: 100, bottom: 140 });
    menu()!.dispatchEvent(new Event('scroll'));
    await settle(fixture);
    expect(menu()).not.toBeNull();
  });

  it('follows its button when the page or a drawer scrolls, and closes once it leaves the window', async () => {
    const { fixture, el, menu } = await open({ top: 100, bottom: 140 });
    const btn = el.querySelector('.dd-btn') as HTMLButtonElement;
    // A drawer scrolls the button up by 60 px (a touchpad's glide just after the click, say).
    btn.getBoundingClientRect = () =>
      ({ left: 20, width: 200, top: 40, bottom: 80, right: 220, height: 40 }) as DOMRect;
    document.body.dispatchEvent(new Event('scroll'));
    await settle(fixture);
    expect(menu()).not.toBeNull();
    expect(menu()!.style.top).toBe('84px');
    // Scrolled out of the window: the menu closes.
    btn.getBoundingClientRect = () =>
      ({ left: 20, width: 200, top: -80, bottom: -40, right: 220, height: 40 }) as DOMRect;
    window.dispatchEvent(new Event('scroll'));
    await settle(fixture);
    expect(menu()).toBeNull();
  });
});
