# CampusOne_Web_App — the web app

One Angular application for every web user of CampusOne. Each area is a lazy-loaded route:

| Area | Route | For |
| --- | --- | --- |
| Institution Console | `/console` | Institution administrators and staff: members, money, fees, academics, attendance, transport, communication |
| Operator Back Office | `/backoffice` | CampusOne operators: institutions, plans, settlement, reconciliation, support, cross-institution reports |
| Admissions | `/admissions` | The public: application form, fee payment, application status |
| Customer Portal | `/portal` | Subscribing institutions: sign-up, onboarding, plan, billing, data export |
| Terminal | `/terminal` | Attendance readers and point-of-sale counters |

Who may use an area is decided by the API on every request (server-side authorisation); the menu only hides what a user cannot open.

**Back-office host name (ADR-0014).** In production the back office should have its own host name. List it in `public/runtime-config.json` (per environment, no rebuild):

```json
{ "backofficeHosts": ["ops.example.in"] }
```

That host then serves only the back office, and every other host stops offering it. With an empty list (local development) every area is available.

Angular 22.2 (standalone components, signals) · TypeScript 6 (strict) · Vitest (unit) · Playwright (end to end).

## Getting it running

```bash
npm install
npm start                     # https://localhost:4200 and https://<this PC's LAN address>:4200 — /api and /health are proxied to the API where its .env puts it (http://localhost:3000 by default; https://localhost:443 when USE_HTTPS/HTTP_PORT say so; API_TARGET overrides)
npm run start:http            # http://localhost:4200, this computer only (the Playwright smoke tests use it)
```

Start the API first (`CampusOne_Backend_API`: `npm run devStart`); without it the status badge shows the error state with a retry.

### On the local network

```bash
npm start                     # (npm run start:lan is the same) https://<this PC's LAN address>:4200 — other computers and phones
```

- **HTTPS (client 2026-10-12).** The page needs a secure context (`crypto.randomUUID`, `crypto.subtle` — terminal pairing), and the session cookies are `Secure` with the `__Host-` prefix (ADR-0011); over plain `http://<LAN address>` browsers refuse both. `scripts/serve.mjs` uses the CampusOne certificate from `TLS_DIR`, `certs/` or `../CampusOne_Backend_API/keys/tls` (`npm run tls:generate` there); install that folder's `ca.crt` as a trusted root on each device and there is no warning. Without one, the dev server's own self-signed certificate is used and each device warns once: choose *Advanced → Proceed*.
- **The API stays on this PC.** The dev server forwards `/api` and `/health` to `localhost:3000` (`proxy.lan.conf.json`) and passes the caller's address (`X-Forwarded-For`), so rate limits and the internal-only health details see the real device, not `127.0.0.1`.
- **Windows firewall.** Allow inbound TCP 4200 on the private network (once, as administrator): `netsh advfirewall firewall add rule name="CampusOne web (LAN)" dir=in action=allow protocol=TCP localport=4200 profile=private`.
- **Links in e-mails.** Set `PUBLIC_WEB_URL=https://<LAN address>:4200` in `CampusOne_Backend_API/.env` so password-reset links open from other devices.
- Open the site by IP address. A host name is refused by the dev server unless it is added to `allowedHosts` in `angular.json`.

## Layout

The folders follow the reference web projects (`ClubPass_Web_Dashboard`, `CampusOne_web_application`):

| Path | Contents |
| --- | --- |
| `src/main.ts` · `src/index.html` · `src/index.scss` | Entry point, page and base styles |
| `src/App.ts` · `App.routes.ts` · `App.config.ts` | Root component, the routes (one per area) and the providers |
| `src/Config.ts` | API base URL and the list of areas |
| `src/Context/` | App-wide state services (`ThemeContext.ts`: light / dark / system) |
| `src/theme/` | Design tokens from the prototype (`tokens.ts`) and the generated `tokens.css` |
| `src/components/Mainpage/` · `Header/` · `Sidebar/` | Page layout: header, area menu, routed page |
| `src/components/Dashboard/` | Landing page |
| `src/components/Pages/<Area>/` | Screens of each area (`Console`, `Backoffice`, `Admissions`, `Portal`, `Terminal`); feature folders go inside, e.g. `Pages/Console/Members/` |
| `src/components/Shared/` | Reusable components (service status badge, area page) |
| `src/components/Utils/` | API interceptor (`api.ts`), problem+json mapping, health service, format pipes, and the shared copies of `money.ts`, `format.ts`, `translate.ts`, `messages.en.ts` |
| `e2e/` | Playwright tests |
| `scripts/tokens-css.ts` | Writes `src/theme/tokens.css` from the tokens |

## Commands

| Task | Command |
| --- | --- |
| Dev server | `npm start` |
| Production build → `dist/` | `npm run build` |
| Unit tests (and the tokens.css check) | `npm test` |
| End-to-end tests (starts the dev server) | `npm run e2e` (first time: `npx playwright install chromium`) |
| Lint · type-check · format | `npm run lint` · `npm run typecheck` · `npm run format` |
| Regenerate `src/theme/tokens.css` | `npm run tokens:css` |
| CampusOne Card Reader, the USB NFC reader helper (dev) | `npm run tauri:dev` |
| CampusOne Card Reader installer → `src-tauri/target/release/bundle/` | `npm run tauri:build` |

## CampusOne Card Reader (USB NFC reader)

Browsers can't talk to a USB NFC reader. CampusOne stays in the browser; a small helper,
**CampusOne Card Reader** (`src-tauri/`, Tauri 2 + Rust), runs next to it on the computer with the
reader (ACR122U or any PC/SC reader). Its small window only shows the service, the reader and a
**Test read** button. It offers the CUG dashboard's three operations to this computer only:

| Call | What it does |
| --- | --- |
| `GET http://127.0.0.1:47821/status` | Running, version, reader names |
| `GET /uid` | The card's serial number (hex) |
| `GET /token` | Sector 1, blocks 4–6 of a MIFARE Classic 1K card, base64 |
| `POST /token {token}` | Writes them (a new card's key is changed from the factory key first) |

Only CampusOne's own sites over https (`campusone.in`, `uat-campusone.com`, `campusone.com` and their
subdomains) and pages from this computer or the private network (localhost, 192.168.x, 10.x,
172.16–31.x) may call it; `CAMPUSONE_READER_ORIGINS` (comma-separated) replaces that list and
`CAMPUSONE_READER_PORT` the port.

`src/components/Utils/card-reader.ts` is the only place the pages use it. It checks every 5 s whether
the helper runs. CampusOne writes the card's own token (`NFC…`, or `OT…` for a POS operator tag) as plain
text, so a read gives exactly what the API expects as `cardToken`. With the helper running:

- **Console → NFC cards → Issue / Re-issue:** "Write card" reads the card, issues it
  (`POST /console/cards`, ATT-027) and writes and checks the token.
- **Terminal reader** (balance, coupons, gate / period / location attendance) and **POS** (payment
  taps, operator sign-in) read the card every second; a card left on the reader counts once.
- **POS → Operator tags:** "Write to tag" writes the new tag.
- **Readers → a reader → pairing code:** "Pair this computer" opens the terminal screen with the code.

Without the helper nothing changes: the text fields stay for a keyboard-style reader.

**Started from the page:** the helper registers the link `campusone-reader://open`. "Write card",
"Write to tag", **Open card reader** (terminal reader, POS, operator sign-in) and starting a POS card
collection open it when it isn't running (the browser asks once), wait until it answers, then carry on.
Started by a link it stays minimised; a second start only wakes the running copy (single instance).

**Run it:** `npm run tauri:dev` (development) or `npm run tauri:build` (an installer in
`src-tauri/target/release/bundle/`). Needs Rust (`rustup`, stable), the WebView2 runtime (Windows
10/11 has it) and the reader's driver. Chrome may ask once to let the CampusOne page reach apps on this
device (CampusOne's website or a LAN address); allow it.

## Shared files

`src/components/Utils/money.ts`, `format.ts`, `translate.ts` and `messages.en.ts` are copies of the masters in `CampusOne_Backend_API/utils/`. `src/theme/tokens.ts` is the master of the design tokens, copied to the mobile app. Do not edit the copies; edit the master and run `npm run shared:sync` in `CampusOne_Backend_API`.
