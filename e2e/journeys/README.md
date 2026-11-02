# End-to-end journeys (Phase 9.1)

Three journeys from the prototype, run in a real browser against a real API and MySQL:

| Spec                 | Journey                                                                                                                                                                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `console.spec.ts`    | The institution administrator signs in (e-mail, password, one-time code), adds a class, onboards a student, creates a fee structure (applied directly — the administrator's own request), assigns it, finds the fee records and opens settlements. |
| `backoffice.spec.ts` | An operator signs in, registers an institution for an existing CampusOne account, completes the required checklist steps, activates it and finds it Active in the list.                                                                             |
| `admissions.spec.ts` | The administrator sets entry fees and generates the admission link; a parent applies (mid-term), saves the draft, resumes it with the one-time code, submits and tracks it as Submitted; the school finds it under Applications.                  |

Each journey makes its own names, numbers and codes, so the journeys can be run again and again on
the same database. They run one at a time (the console journeys share the sample administrator).

## The isolated stack

The journeys never touch the development servers (API on 3000, web on 4200) or the database
`campusone`. They use:

- the schema **`campusone_e2e`** on the local MySQL server (same login as `DB_MIGRATOR_URL` in
  `CampusOne_Backend_API/.env`, only the database name differs);
- the **API on port 3021** against that schema, with one-time codes returned to the apps' test banner
  (`OTP_TEST_SHOW_CODE=true`, this API only) and uploads under `CampusOne_Backend_API/uploads/e2e`;
- this app's **dev server on port 4321**, proxied to 3021 (`proxy.e2e.conf.json`).

### 1. Build the database (once, or to start again from scratch)

```sh
cd CampusOne_Backend_API
npm run e2e:db              # drop and recreate campusone_e2e: migrations, reference seeds, development seed
npm run e2e:db -- --keep    # keep the data: pending migrations and the (idempotent) seeds only
```

The sample accounts get fixed test passwords in this schema (the prototype's demo passwords, or
`E2E_STAFF_PASSWORD` / `E2E_OPS_PASSWORD` / `E2E_MEMBER_PASSWORD` — set the same variables when
running the journeys). The command is refused when `NODE_ENV=production` or `APP_ENV` is uat/prod,
and the schema name must end in `_e2e` (`E2E_DB_NAME`).

### 2. Run the journeys

```sh
cd CampusOne_Web_App
npm run e2e:journeys
```

Playwright starts the API (3021) and the web server (4321) when they aren't running and stops them
afterwards (the first web build takes 2–3 minutes). To keep them running between runs, start them
yourself in another terminal and Playwright reuses them:

```sh
node e2e/journeys/stack.mjs        # both; Ctrl+C stops both
node e2e/journeys/stack.mjs api    # or one at a time
node e2e/journeys/stack.mjs web
```

The API alone can also be started from the backend: `npm run e2e:db -- serve`. To run against a
stack started elsewhere, set `BASE_URL` (no server is started then).

Results: the list in the terminal; on a failure, the screenshot and trace under
`test-results/journeys/` (`npx playwright show-trace <trace.zip>`) and the HTML report in
`playwright-report/journeys/`.

## Notes

- One-time codes are read from the test banner (`.demo-hint`); the back-office journey creates the new
  institution's administrator account through the member app's sign-up API (IDN-001…003), as the
  administrator needs an existing CampusOne account.
- On a fresh database the development seed leaves the sample school without classes, students, fee
  records or an admission link: it writes the school straight into the tables without the current
  academic year that registration gives (`e2e:db` adds the year as migration 0020 does), and its
  members step cannot run on a fresh database (it reads `insertId` from a connection that returns
  no result header). So the journeys create the class, the student, the fees, the entry fees and
  the link they need through the console — which also keeps them independent of the seed.
- `npm run e2e` (the smoke tests) is unchanged and does not run these journeys.
