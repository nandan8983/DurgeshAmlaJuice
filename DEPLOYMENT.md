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
