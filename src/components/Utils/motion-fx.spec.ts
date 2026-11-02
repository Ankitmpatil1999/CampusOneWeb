import { installMotionFx } from './motion-fx';

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('the Ocean motion and effects (presentation only)', () => {
  let remove: () => void;
  beforeEach(() => {
    remove = installMotionFx(document);
  });
  afterEach(() => {
    remove();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('marks a page the router opens, a sheet as it opens and the menu as it appears', async () => {
    const shell = document.createElement('rp-mainpage');
    shell.innerHTML =
      '<div class="c-app"><aside class="c-side"><nav class="c-nav"></nav></aside>' +
      '<div class="c-body"><rp-home><div class="c-page"><div class="card">Hello</div></div></rp-home></div></div>';
    document.body.append(shell);
    await settle();
    expect(shell.querySelector('.c-page')?.getAttribute('style')).toContain('xfade');
    expect(shell.querySelector('.c-side')?.classList).toContain('rp-side-in');

    const sheet = document.createElement('rp-sheet');
    sheet.innerHTML = '<div class="ov fixed"><div class="sh-b">Body</div></div>';
    shell.append(sheet);
    await settle();
    expect(sheet.querySelector('.ov')?.classList).toContain('rp-open');
    // The page's content and text are untouched.
    expect(shell.querySelector('.card')?.textContent).toBe('Hello');
  });

  it('spreads a ripple from a pressed button and takes it away again', () => {
    vi.useFakeTimers();
    const btn = document.createElement('button');
    btn.className = 'btn btn-pri';
    btn.textContent = 'Save';
    document.body.append(btn);
    btn.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 4, clientY: 4 }));
    expect(btn.querySelector('.rp-rip')?.getAttribute('aria-hidden')).toBe('true');
    expect(btn.classList).toContain('rp-rip-host');
    vi.advanceTimersByTime(700);
    expect(btn.querySelector('.rp-rip')).toBeNull();
    expect(btn.classList).not.toContain('rp-rip-host');
    expect(btn.textContent).toBe('Save');
  });

  it('leaves a disabled button alone', () => {
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.disabled = true;
    document.body.append(btn);
    btn.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(btn.querySelector('.rp-rip')).toBeNull();
  });
});
