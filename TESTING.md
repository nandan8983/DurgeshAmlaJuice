# Testing the project locally

Written for: whoever is checking this project out on a fresh machine.

Three levels, in increasing order of setup. Level 1 needs nothing but Node.

---

## Level 1 — tests that need no database (about 30 seconds)

```bash
cd backend && npm install && npm test
```

83 tests covering the business rules: plan pricing, combo alternation, the
pause extension, daily route generation, role scoping, distance and dates.

```bash
cd rider-app && npm install && npm test       # 7 tests: on-device nearest-first
cd admin-web && npm install && npm run build  # the dashboard compiles
cd backend && npm run typecheck               # types, including the test files
```

If all of these pass, the logic is sound. What they do *not* prove is that the
API, database and dashboard work together — that is Level 2.

---

## Level 2 — the whole system running (about 5 minutes)

You need a PostgreSQL database. Pick one:

### Option A — the built-in dev database (nothing to install) ⭐

```bash
cd backend
npm run db:dev
```

That downloads a real PostgreSQL as an npm package and runs it on port 55432
out of `backend/.dev-db/`. The first run takes a minute; later runs are
instant. **Leave the terminal open** — it holds the server. `Ctrl+C`, or
`npm run db:stop` from another terminal, shuts it down.

This is a development convenience only (`embedded-postgres` is a
devDependency). Production uses `docker-compose.yml` or Render's managed
Postgres — see [DEPLOYMENT.md](DEPLOYMENT.md).

### Option B — Docker

```bash
cp .env.docker.example .env     # in the repo root; set POSTGRES_PASSWORD and JWT_SECRET
docker compose up -d db
```

Then set `DATABASE_URL` in `backend/.env` to port 5432 instead of 55432.

### Option C — a free hosted database

Create one at Neon or Supabase and paste its connection string into
`backend/.env` as `DATABASE_URL`. No install, but you need internet.

### Then, in a second terminal

```bash
cd backend
cp .env.example .env              # set JWT_SECRET to anything 16+ characters
npm run migrate:deploy            # creates all 8 tables
npm run seed                      # plans, admin, supervisor, 2 riders, 12 customers
npm run dev                       # http://localhost:4000
```

`.env.example` already points `DATABASE_URL` at Option A's port, so with
Option A you only need to set `JWT_SECRET`.

Check it:

```bash
curl http://localhost:4000/health
```

### And the dashboard, in a third terminal

```bash
cd admin-web
echo "VITE_API_BASE_URL=http://localhost:4000" > .env
npm run dev                       # http://localhost:5173
```

Open <http://localhost:5173> and sign in with the credentials the seed printed
(admin is `9999900001` / `ChangeMe@Admin1` unless you overrode it).

### What to click through

| Where | What you should see |
|---|---|
| Dashboard | today's deliveries, collections, renewals due; **Generate route** builds the day |
| Customers | 12 Shirpur customers; change a rider in the dropdown; Pause then Resume one |
| A customer | edit details, start/renew a plan, settle a pending payment, delivery history |
| Subscriptions | the 12 seeded plans with snapshotted amounts |
| Leads | empty until you post one (below), then **Convert** it into a customer |
| Reports | collections per rider, expiring plans, pending payments — each exports CSV |
| Plans | the real price list; edit a price inline |

Try the public website endpoint, the one with no authentication:

```bash
curl -X POST http://localhost:4000/leads -H 'Content-Type: application/json' \
  -d '{"fullName":"Test Lead","mobile":"9876500123","area":"Tapi Road","city":"Shirpur","plan":"Amla 30-day"}'
```

It appears under **Leads** in the dashboard.

### The integration tests

With a database running, these drive the real HTTP API end to end — 54 tests
covering role scoping, route generation, nearest-first ordering, the offline
queue, pause/resume, payments, leads and reports:

```bash
cd backend
TEST_DATABASE_URL="postgresql://daj:daj_dev_password@127.0.0.1:55432/daj?schema=public" npm run test:integration
```

> **The target database is truncated and re-seeded.** That is what makes the
> suite repeatable, but it also means any data you entered by hand is wiped.
> Point it at a throwaway database, or expect to lose your manual test data
> (the seeded 12 customers come back either way).

---

## Level 3 — the rider app on Android

This is the one with real setup cost, because it needs the Android toolchain.

**You do not have the Android SDK installed yet.** To run the app you need:

1. **Android Studio** (<https://developer.android.com/studio>) — install it and
   let it pull down the SDK and an emulator image, or enable USB debugging on a
   physical phone.
2. **Node 22+** for the build. React Native 0.88 declares it; Node 20 runs the
   tests with a warning but is not a supported build target.
3. **A Google Maps API key** in `rider-app/android/local.properties`, only for
   the map on the Add Customer screen — see
   [rider-app/README-SETUP.md](rider-app/README-SETUP.md). Everything else,
   including the Navigate button, works without it.

Then:

```bash
cd rider-app
npm start                 # Metro, in its own terminal
npm run android           # builds and installs
```

The emulator reaches your machine's API at `http://10.0.2.2:4000`, which is
already the debug default in `src/config.ts`. On a physical phone, tap the
`Server:` line on the login screen and enter your computer's LAN address, e.g.
`http://192.168.1.5:4000`.

Sign in as a rider (`9999900011` / `ChangeMe@Rider1`) and check:

- **Today's Route** — bottle counter, nearest stop first (set the emulator's
  location to roughly 21.3486, 74.8805 via Extended controls → Location)
- **A stop** — tap to call, Navigate hands off to Google Maps, Delivered / Skip
- **Offline behaviour** — turn on aeroplane mode, mark a few stops delivered,
  watch the amber "saved on this phone" strip, then turn the network back on
  and watch it sync
- **Add Customer** — the GPS pin, draggable on the map
- **Day Summary** — delivered, missed, bottles left, cash collected

### If you only want to see the rider app logic without Android

The nearest-first ordering, which is the only business logic the app computes
itself, is covered by `cd rider-app && npm test`.

---

## Housekeeping

```bash
cd backend
npm run db:status     # is the dev database up?
npm run db:stop       # stop it
npm run db:reset      # drop everything, re-apply migrations, re-seed
```

To start completely fresh, delete `backend/.dev-db/` and run `npm run db:dev`
again.
