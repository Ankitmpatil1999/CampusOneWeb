import { DARK_COLORS, LIGHT_COLORS, SCALE } from './tokens';

const block = (selector: string, vars: Readonly<Record<string, string>>, scheme?: string) =>
  `${selector} {\n${Object.entries(vars)
    .map(([k, v]) => `  --${k}: ${v};`)
    .join('\n')}${scheme ? `\n  color-scheme: ${scheme};` : ''}\n}\n`;

/**
 * Renders the CSS custom properties: light by default, dark when `data-theme="dark"` is set or
 * when the system prefers dark and the user has not chosen light (same rules as the prototype).
 */
export function renderTokensCss(): string {
  return [
    '/* Generated from src/theme/tokens.ts (prototype tokens) by `npm run tokens:css` — do not edit. */\n',
    block(':root', { ...LIGHT_COLORS, ...SCALE }, 'light'),
    `@media (prefers-color-scheme: dark) {\n${block(
      ':root:not([data-theme="light"])',
      DARK_COLORS,
      'dark',
    )
      .split('\n')
      .map((l) => (l ? `  ${l}` : l))
      .join('\n')}}\n`,
    block(':root[data-theme="dark"]', DARK_COLORS, 'dark'),
  ].join('\n');
}
