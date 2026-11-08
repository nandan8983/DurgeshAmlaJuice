# Durgesh Amla Juice — delivery management

Fresh amla and beetroot juice, delivered to the door every morning on a prepaid
subscription, in Shirpur, Maharashtra. The business works like a newspaper
route: each rider carries the bottles for their own customers and works through
them one by one, nearest first.

```
schema.sql      PostgreSQL schema — the source of truth for the database
backend/        Node.js + Express + TypeScript REST API (Prisma, Zod, JWT)
admin-web/      React + Vite admin and supervisor dashboard
rider-app/      React Native (Android) app for the riders
scripts/        backup, off-site copy and restore helpers
DEPLOYMENT.md   how to deploy, either on your own server or on Render
```

## Quick start (local)

Needs Node 20+ (Node 22+ for the rider app). No PostgreSQL install required —
`npm run db:dev` runs one for you. Full walkthrough in [TESTING.md](TESTING.md).

```bash
# 1. API
cd backend
npm install
npm run db:dev                # local PostgreSQL on port 55432; leave it running
# in a second terminal:
cp .env.example .env          # set JWT_SECRET (DATABASE_URL already points at db:dev)
npm run migrate:deploy        # creates every table from the repo
npm run seed                  # plans, an admin, a supervisor, 2 riders, 12 customers
npm run dev                   # http://localhost:4000

# 2. Admin dashboard (third terminal)
cd ../admin-web
npm install
echo "VITE_API_BASE_URL=http://localhost:4000" > .env
npm run dev                   # http://localhost:5173

# 3. Rider app (Android emulator or device)
cd ../rider-app
npm install
npm run android               # see README-SETUP.md for the Google Maps key
```

Seeded logins are printed by `npm run seed`. **Change them before going live.**

## How the business rules work

| Rule | Where it lives |
|---|---|
| Subscription amount = plan price × bottles per day | `backend/src/domain/pricing.ts` |
| Combo alternates Amla / Beetroot by delivery day, skipping paused days | `backend/src/domain/combo.ts` |
| Resume extends the end date by the days paused | `backend/src/domain/pause.ts` |
| Who gets a bottle today, and which juice | `backend/src/domain/route.ts` |
| Nearest-first ordering (Haversine) | `backend/src/domain/geo.ts`, mirrored in `rider-app/src/lib/geo.ts` |
| Role scoping: admin / supervisor / rider | `backend/src/domain/scope.ts` |

Those modules are deliberately free of database and HTTP code, so the rules can
be read and tested on their own.

### Plans

Price is for **one bottle a day** across the whole plan; two bottles a day costs
twice as much. Prices are seeded and editable from the dashboard.

| Product | 7 days (trial) | 15 days | 30 days |
|---|---|---|---|
| Amla | ₹140 | ₹299 | ₹549 |
| Beetroot | ₹210 | ₹399 | ₹749 |
| Combo (alternating) | — | ₹349 | ₹699 |

Changing a price never changes money already owed: each subscription snapshots
the price, product, duration and bottles per day when it is created.

### The daily route

A scheduled job at 04:30 IST creates one `deliveries` row per customer who is
active, has a subscription covering today, and is not paused. If that run is
missed, the first `GET /route/today` of the morning generates the day instead,
and the dashboard has a **Generate route** button. All three paths are
idempotent — the unique index on `(customer_id, delivery_date)` guarantees one
set of bottles per customer per day.

## Tests

See [TESTING.md](TESTING.md) for the full walkthrough, including what to click
through in the dashboard and how to exercise the rider app's offline queue.

```bash
cd backend
npm test                 # 83 unit tests, no database needed
npm run typecheck        # includes the test sources

# 54 integration tests against a real PostgreSQL. The target database is
# TRUNCATED and re-seeded, so point it at a throwaway one.
TEST_DATABASE_URL=postgresql://daj:daj_dev_password@127.0.0.1:55432/daj?schema=public npm run test:integration
```

The unit tests cover pricing, combo alternation, pause extension, route
generation, role scoping, distance and date handling. The 54 integration tests
drive the real HTTP API against a real database: login, role scoping (a rider
cannot see or touch another rider's data), route generation and idempotency,
nearest-first ordering, delivery updates and the offline-queue batch endpoint,
pause/resume, payments, public lead capture and conversion, reports and CSV
export.

```bash
cd ../rider-app && npm test     # on-device nearest-first ordering
cd ../admin-web && npm run build
```

## Builds and releases

Every push to a branch or PR runs the full test suite in GitHub Actions
(`.github/workflows/ci.yml`), including the integration tests against a real
PostgreSQL. Every push to `main` additionally builds and publishes a GitHub
Release (`.github/workflows/release.yml`) with the rider APK, the built
dashboard and the compiled API attached — gated on those tests passing.

Set `ANDROID_KEYSTORE_BASE64` and friends to get a properly signed APK; see
[DEPLOYMENT.md](DEPLOYMENT.md#automated-builds-and-releases-github-actions).

## Deployment

Two options, same code: your own Linux server behind Cloudflare Tunnel
(`docker-compose.yml`), or Render (`render.yaml`). Both are driven entirely by
environment variables, and both apps read a single API base URL, so moving
between them is a config change. See [DEPLOYMENT.md](DEPLOYMENT.md), which also
covers the nightly `pg_dump`, the off-site copy and the restore procedure.

## Privacy

Customer phone numbers and addresses are personal data. The API never logs
request bodies, redacts known personal fields from any log line, and scopes
every query by role on the server — a rider's token can only ever read that
rider's customers.
