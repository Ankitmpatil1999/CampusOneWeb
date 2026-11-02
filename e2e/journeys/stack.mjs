// The isolated stack for the journeys (Phase 9.1): the API on port 3021 against the schema
// `campusone_e2e` (CampusOne_Backend_API: `npm run e2e:db -- serve`) and this app's dev server on port 4321
// proxied to it (proxy.e2e.conf.json). The user's API (3000) and web server (4200) are never touched.
//
//   node e2e/journeys/stack.mjs          both (Ctrl+C stops both)
//   node e2e/journeys/stack.mjs api      the API only
//   node e2e/journeys/stack.mjs web      the web dev server only
//
// Build the database first: `npm run e2e:db` in CampusOne_Backend_API.
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const backend = resolve(web, '../CampusOne_Backend_API');
const webPort = process.env['E2E_WEB_PORT'] ?? '4321';
const which = process.argv[2] ?? 'all';

const children = [];
const start = (name, args, cwd, env = process.env) => {
  const child = spawn(process.execPath, args, { cwd, env, stdio: 'inherit' });
  child.on('exit', (code) => {
    console.log(`[stack] ${name} exited (${code})`);
    for (const c of children) if (c !== child && c.exitCode === null) c.kill();
    process.exitCode = code ?? 0;
  });
  children.push(child);
  console.log(`[stack] ${name} started (pid ${child.pid}; stack pid ${process.pid})`);
};

if (which === 'all' || which === 'api') {
  start('api', ['scripts/e2e-db.mjs', 'serve'], backend);
}
if (which === 'all' || which === 'web') {
  // Windows Application Control blocks the native Sass binary: use the JavaScript Sass.
  start(
    'web',
    [
      resolve(web, 'node_modules/@angular/cli/bin/ng.js'),
      'serve',
      '--port',
      webPort,
      '--proxy-config',
      'proxy.e2e.conf.json',
      // A stable build for the run: no rebuilds or reloads when files change meanwhile.
      '--no-watch',
      '--no-live-reload',
      '--no-hmr',
    ],
    web,
    { ...process.env, NG_BUILD_SASS_EMBEDDED: '0', NG_CLI_ANALYTICS: 'false' },
  );
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    for (const c of children) if (c.exitCode === null) c.kill(signal);
  });
}
