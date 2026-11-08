# Deployment

Written for: whoever runs the server (the owner, or a developer helping them).

Two supported options. Both run the same code and differ only in environment
variables, so you can start on one and move to the other.

| | Option 1 — own Linux server | Option 2 — Render |
|---|---|---|
| API | Docker Compose | Render web service |
| Database | Postgres container (local disk) | Render managed Postgres |
| HTTPS | Cloudflare Tunnel | Render-provided |
| Admin web | any static host (Vercel) | Render static site |
| Backups | nightly `pg_dump` + off-site copy (set up below) | Render snapshots + the same `pg_dump` for an off-Render copy |
| Monthly cost | hardware + domain | service plans |

Before either option, decide the two public addresses:

- the API, e.g. `https://api.durgeshamlajuice.in`
- the admin dashboard, e.g. `https://admin.durgeshamlajuice.in`

`CORS_ORIGINS` on the API must be the exact admin origin, and
`VITE_API_BASE_URL` in the admin build must be the exact API origin.

---

## Option 1 — your own Linux server

### 1. Prerequisites

- Linux with Docker Engine and the Compose plugin
  (`curl -fsSL https://get.docker.com | sh`)
- A domain on Cloudflare (free plan is enough)

### 2. Get the code and configure

```bash
sudo mkdir -p /srv/daj && sudo chown "$USER" /srv/daj
git clone <your-repo-url> /srv/daj
cd /srv/daj

cp .env.docker.example .env
openssl rand -base64 32   # paste as POSTGRES_PASSWORD
openssl rand -base64 48   # paste as JWT_SECRET
$EDITOR .env              # also set CORS_ORIGINS
chmod 600 .env
```

### 3. Start the database and create the schema

```bash
docker compose up -d db
docker compose run --rm api npx prisma migrate deploy
```

The first time only, load the plans and sample data:

```bash
docker compose run --rm \
  -e SEED_ADMIN_PASSWORD='<a strong password>' \
  -e SEED_SUPERVISOR_PASSWORD='<a strong password>' \
  -e SEED_RIDER_PASSWORD='<a strong password>' \
  api npx tsx prisma/seed.ts
```

The seed prints the logins it created. **Change them from the dashboard after
the first sign-in** and delete the sample Shirpur customers once real ones
exist.

> If you want only the plans and the admin login, delete the `CUSTOMERS` array
> entries in `backend/prisma/seed.ts` before running it.

### 4. Start the API and backups

```bash
docker compose up -d api backup
curl -s http://127.0.0.1:4000/health
```

Both the API and Postgres are bound to `127.0.0.1`, so nothing is reachable from
the network yet — that is deliberate.

### 5. Publish it with Cloudflare Tunnel

1. Cloudflare dashboard → **Zero Trust → Networks → Tunnels → Create a tunnel**
   → *Cloudflared*. Name it `daj`.
2. Copy the install token into `.env` as `CLOUDFLARE_TUNNEL_TOKEN`.
3. In the tunnel's **Public hostname** tab, add:
   - Subdomain `api`, your domain, Service **HTTP** → `api:4000`
4. Start it:

   ```bash
   docker compose --profile tunnel up -d cloudflared
   curl -s https://api.your-domain/health
   ```

No ports are forwarded and the server's IP is never exposed. Cloudflare
terminates TLS, and `TRUST_PROXY=true` lets the rate limiters see the real
client IP through it.

### 6. Deploy the admin dashboard

Easiest is Vercel (free, and the marketing site already lives there):

```bash
cd admin-web
npx vercel --prod    # set VITE_API_BASE_URL=https://api.your-domain in the project settings
```

Or serve the built files from any web host:

```bash
cd admin-web
VITE_API_BASE_URL=https://api.your-domain npm ci && npm run build
# copy dist/ to your web root; make sure unknown paths serve index.html
```

Then put that origin in `CORS_ORIGINS` and restart the API:

```bash
$EDITOR /srv/daj/.env
docker compose up -d api
```

### 7. Off-site backups

The `backup` service writes a gzipped `pg_dump` to `./backups` every night at
`BACKUP_AT` (UTC) and keeps `BACKUP_KEEP_DAYS` of them. That is still one disk
away from nothing, so copy them off the machine. With
[rclone](https://rclone.org) configured for your cloud storage:

```bash
rclone config                       # create a remote, e.g. "gdrive"
crontab -e
```

```cron
15 3 * * * cd /srv/daj && BACKUP_DEST="gdrive:daj-backups" ./scripts/backup-offsite.sh >> /var/log/daj-offsite.log 2>&1
```

Or to another machine over SSH:

```cron
15 3 * * * cd /srv/daj && BACKUP_DEST="user@backup-host:/srv/daj-backups" ./scripts/backup-offsite.sh >> /var/log/daj-offsite.log 2>&1
```

**Test the restore now, not after an incident** — see
[Restoring a backup](#restoring-a-backup).

### 8. Updating

```bash
cd /srv/daj
git pull
docker compose build api
docker compose run --rm api npx prisma migrate deploy
docker compose up -d api
```

---

## Option 2 — Render

### 1. Create the services

1. Push this repo to GitHub.
2. Render dashboard → **New → Blueprint**, select the repo. `render.yaml`
   creates `daj-postgres`, `daj-api` and `daj-admin`.
3. During creation, fill in the two values marked "sync: false":
   - `daj-api` → `CORS_ORIGINS` = the admin site URL
     (`https://daj-admin.onrender.com` unless you attach a custom domain)
   - `daj-admin` → `VITE_API_BASE_URL` = the API URL
     (`https://daj-api.onrender.com`)

`JWT_SECRET` is generated by Render; you never see or need it.

Migrations run automatically on every deploy via `preDeployCommand`.

### 2. Seed once

Render dashboard → `daj-api` → **Shell**:

```bash
SEED_ADMIN_PASSWORD='<a strong password>' \
SEED_SUPERVISOR_PASSWORD='<a strong password>' \
SEED_RIDER_PASSWORD='<a strong password>' \
npx tsx prisma/seed.ts
```

### 3. Custom domains (optional)

Add `api.your-domain` to `daj-api` and `admin.your-domain` to `daj-admin`, then
update `CORS_ORIGINS` and `VITE_API_BASE_URL` to match and redeploy both.

### 4. A note on the cron jobs

`node-cron` runs inside the API process, so the 04:30 route generation needs a
plan that does not sleep. If the process was asleep at 04:30, the first
`GET /route/today` of the morning generates the day itself — the rider just
waits a moment longer for their first load. You can also trigger it by hand from
the dashboard's **Generate route** button.

### 5. Backups on Render

Paid Postgres plans take daily snapshots, restorable from the dashboard. For a
copy that does not live at Render, run the same dump from any machine with the
**external** connection string:

```bash
pg_dump --clean --if-exists --no-owner --no-privileges "$EXTERNAL_DATABASE_URL" \
  | gzip -9 > "daj-$(date -u +%Y%m%d).sql.gz"
```

---

## Restoring a backup

### Self-hosted

```bash
cd /srv/daj
ls backups/
./scripts/restore.sh backups/daj-20261108-023000.sql.gz
```

The script stops the API, replaces the database contents, and starts it again.
It asks you to type `restore` first, because it is destructive.

### Render

```bash
gunzip -c daj-20261108.sql.gz | psql "$EXTERNAL_DATABASE_URL"
```

Either way, verify afterwards:

```bash
curl -s https://api.your-domain/health
# then sign in to the dashboard and check today's dashboard numbers
```

---

## Automated builds and releases (GitHub Actions)

Two workflows live in `.github/workflows`:

| Workflow | Runs on | Does |
|---|---|---|
| `ci.yml` | every push to a non-`main` branch, every PR | typecheck, 83 unit tests, 54 integration tests against a real PostgreSQL service container, admin-web build, rider-app typecheck and tests |
| `release.yml` | every push to `main`, any `v*` tag, or manually | runs `ci.yml` first, then builds and publishes a GitHub Release |

A push to `main` therefore produces a release automatically, with three files
attached:

| Asset | What to do with it |
|---|---|
| `daj-rider-<version>.apk` | Download on the rider's phone and open it to install |
| `daj-admin-web-<version>.zip` | Unzip onto any static host |
| `daj-backend-<version>.zip` | `npm ci --omit=dev && npx prisma migrate deploy && node dist/src/index.js` |

Tests gate the release: if anything fails, nothing is published.

### Versioning

The version is the `VERSION` file at the repo root plus the workflow run number,
so `VERSION=0.1.0` on run 7 publishes the tag `v0.1.0-build.7`. Bump `VERSION`
when you want a new minor or major line. The Android `versionCode` is the run
number, which always increases — a requirement if you ever publish to the Play
Store.

Pushing a tag by hand instead publishes a clean release at that exact tag:

```bash
git tag v0.2.0 && git push origin v0.2.0
```

Changes to `*.md` files alone do not trigger a release.

### Secrets and variables to configure

Settings → Secrets and variables → Actions.

| Name | Kind | Needed for |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | secret | Signing the APK properly. **Without it the APK is debug-signed** and the release says so. |
| `ANDROID_KEYSTORE_PASSWORD` | secret | " |
| `ANDROID_KEY_ALIAS` | secret | " |
| `ANDROID_KEY_PASSWORD` | secret | " |
| `MAPS_API_KEY` | secret | The map on the rider's Add Customer screen. Without it that map is blank; everything else works. |
| `API_BASE_URL` | variable | Baked into the dashboard bundle at build time. Without it the bundle points at `http://localhost:4000`. |

Nothing is required to get a first green run — the workflow degrades and warns
rather than failing.

### Creating the release keystore

Do this once, on your own machine:

```bash
keytool -genkeypair -v -storetype PKCS12 \
  -keystore daj-rider-release.keystore \
  -alias daj-rider -keyalg RSA -keysize 2048 -validity 10000
```

Then turn it into the secret value:

```bash
# Linux/macOS
base64 -w 0 daj-rider-release.keystore

# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("daj-rider-release.keystore"))
```

Paste that into `ANDROID_KEYSTORE_BASE64`, and set the other three secrets to
the store password, `daj-rider`, and the key password.

> **Back the keystore file up somewhere safe and permanent.** Android identifies
> an app by its signing key: lose it and you can never ship an upgrade that
> installs over the existing one — every rider would have to uninstall and
> reinstall, losing any unsynced queue on their phone. Keep it out of the repo
> (`.gitignore` already covers `*.keystore`).

### Local release build

The same signing path works locally. Put these in
`rider-app/android/local.properties`:

```properties
MAPS_API_KEY=AIza...
RELEASE_STORE_FILE=/absolute/path/to/daj-rider-release.keystore
RELEASE_STORE_PASSWORD=...
RELEASE_KEY_ALIAS=daj-rider
RELEASE_KEY_PASSWORD=...
```

Then `cd rider-app/android && ./gradlew assembleRelease`. With no keystore
configured the build still succeeds, logging a warning and using the debug key.

---

## The rider app

The app is distributed as an APK, not through this deployment.

1. Set the production URL in `rider-app/src/config.ts`
   (`DEFAULT_API_BASE_URL`).
2. Put the Google Maps key in `rider-app/android/local.properties` — see
   [rider-app/README-SETUP.md](rider-app/README-SETUP.md).
3. Build and share:

   ```bash
   cd rider-app/android && ./gradlew assembleRelease
   # android/app/build/outputs/apk/release/app-release.apk
   ```

A rider can also point a handset at a different API from the login screen
without a rebuild, which is useful while testing.

---

## Website sign-up form

Point the form on <https://durgeshamlajuice.vercel.app> at:

```
POST https://api.your-domain/leads
Content-Type: application/json

{ "fullName": "…", "mobile": "…", "area": "…", "city": "Shirpur", "plan": "Amla 30-day", "notes": "…" }
```

No authentication, rate limited to `LEADS_RATE_MAX` submissions per
`RATE_WINDOW_MINUTES` per IP. Leads appear under **Leads** in the dashboard for
conversion into customers.

---

## Security checklist

- [ ] `.env` is `chmod 600` and never committed (`.gitignore` covers it)
- [ ] `JWT_SECRET` is random and at least 32 characters
- [ ] `POSTGRES_PASSWORD` is random; Postgres is not exposed beyond `127.0.0.1`
- [ ] `CORS_ORIGINS` is the exact admin origin — no `*`
- [ ] `TRUST_PROXY=true` behind Cloudflare or Render (so rate limits work)
- [ ] Every seeded password changed after the first sign-in
- [ ] Sample Shirpur customers deleted once real ones are loaded
- [ ] Off-site backup copy running, and a restore tested
- [ ] HTTPS only in production (HSTS is sent when `NODE_ENV=production`)

Customer phone numbers and addresses are personal data. The API never logs
request bodies, redacts the known personal fields from any log line, and scopes
every query by role, so a rider can only ever read their own customers.

---

## Operations cheat sheet

| Task | Command |
|---|---|
| Health check | `curl -s http://127.0.0.1:4000/health` |
| API logs | `docker compose logs -f api` |
| Backup logs | `docker compose logs -f backup` |
| Regenerate today's route | the dashboard's **Generate route** button, or `POST /route/generate` |
| Dump right now | `docker compose exec -T db pg_dump -U daj --clean --if-exists daj \| gzip > manual.sql.gz` |
| Open a psql shell | `docker compose exec db psql -U daj -d daj` |
| Restart just the API | `docker compose up -d --force-recreate api` |
