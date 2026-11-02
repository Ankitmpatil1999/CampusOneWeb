/**
 * Writes src/theme/tokens.css from src/theme/tokens.ts (the prototype tokens).
 *   npm run tokens:css     regenerate
 *   npm run tokens:check   fail when the committed CSS is stale (part of `npm test`)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderTokensCss } from '../src/theme/tokens-css';

const target = join(import.meta.dirname, '..', 'src', 'theme', 'tokens.css');
const fresh = renderTokensCss();

if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== fresh) {
    console.error('src/theme/tokens.css is stale: run `npm run tokens:css`');
    process.exit(1);
  }
  console.log('src/theme/tokens.css is up to date');
} else {
  writeFileSync(target, fresh);
  console.log(`wrote ${target}`);
}
