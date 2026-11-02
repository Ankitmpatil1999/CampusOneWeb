/**
 * `npm start`: the development server over HTTPS on every network interface (client 2026-10-12),
 * so other computers, terminals and phones open https://<this PC's address>:4200 — browsers keep the
 * terminal's device key store (pairing) and Secure cookies for https:// pages only.
 *
 * The certificate, first found of:
 *   1. TLS_DIR (folder with server.key and server.crt);
 *   2. certs/ in this project (gitignored);
 *   3. ../CampusOne_Backend_API/keys/tls (made by `npm run tls:generate` there — signed by the CampusOne
 *      Local CA, so devices that trust ca.crt show no warning);
 *   otherwise the dev server's own self-signed certificate (the browser warns once).
 *
 * /api and /health go to the API where its own settings put it (../CampusOne_Backend_API/.env: USE_HTTPS
 * and HTTP_PORT — http://localhost:3000 by default, https://localhost:443 on a server set-up), so the
 * two never point at different places; API_TARGET overrides it.
 *
 * Plain HTTP on this computer only: `npm run start:http`. Extra arguments go to `ng serve`.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const here = resolve(import.meta.dirname, '..');
const dirs = [
  process.env.TLS_DIR,
  join(here, 'certs'),
  join(here, '..', 'CampusOne_Backend_API', 'keys', 'tls'),
].filter(Boolean);
const found = dirs.find(
  (d) => existsSync(join(d, 'server.key')) && existsSync(join(d, 'server.crt')),
);

/** The API's address from its .env (the last value of a key wins, as for node --env-file). */
function apiTarget() {
  if (process.env.API_TARGET) return process.env.API_TARGET;
  const file = join(here, '..', 'CampusOne_Backend_API', '.env');
  const env = {};
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  const https = env.USE_HTTPS === 'true';
  const port = env.HTTP_PORT || '3000';
  return `${https ? 'https' : 'http'}://localhost:${port}`;
}
const target = apiTarget();
// The browser checks the dev server's certificate; this hop stays on this computer.
const route = { target, secure: false, changeOrigin: false, xfwd: true };
const proxyFile = join(here, '.angular', 'proxy.dev.json');
mkdirSync(join(here, '.angular'), { recursive: true });
writeFileSync(proxyFile, JSON.stringify({ '/api': route, '/health': route }, null, 2));
console.log(`/api and /health → ${target}`);

const args = ['serve', '--configuration', 'lan', '--proxy-config', proxyFile];
if (found) {
  args.push('--ssl-key', join(found, 'server.key'), '--ssl-cert', join(found, 'server.crt'));
  console.log(`HTTPS with the certificate in ${found}`);
} else {
  console.log(
    "HTTPS with the dev server's own certificate (run `npm run tls:generate` in CampusOne_Backend_API for a trusted one)",
  );
}
args.push(...process.argv.slice(2));

const ng = createRequire(import.meta.url).resolve('@angular/cli/bin/ng.js');
// Windows Application Control blocks Sass's native dart.exe here (CLAUDE.md): use the JS Sass.
const env = { NG_BUILD_SASS_EMBEDDED: '0', ...process.env };
const child = spawn(process.execPath, [ng, ...args], { cwd: here, env, stdio: 'inherit' });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code) => process.exit(code ?? 0));
