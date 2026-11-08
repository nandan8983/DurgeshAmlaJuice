# Project: Durgesh Amla Juice Delivery

You are helping me build a complete delivery-management system for **Durgesh Amla Juice** (a fresh amla and beetroot juice business in Shirpur, Maharashtra, India; website: https://durgeshamlajuice.vercel.app/). Work in phases, starting with the backend. Before writing code, read `schema.sql` in the repo root (my PostgreSQL schema) and treat it as the source of truth for the database. If you think it needs changes, propose them and explain why before changing anything.

## 1. What we are building

Three parts in one monorepo:

```
/backend      Node.js + Express + TypeScript REST API
/admin-web    React (Vite + TypeScript) admin / supervisor web dashboard
/rider-app    React Native (TypeScript) Android app for delivery riders
```

The business works like a **newspaper route**: each customer takes a bottle of juice delivered to their home every morning on a prepaid subscription. Riders carry the bottles for their own customers and deliver one by one. The app must show the **nearest pending customer next** and let the rider navigate to the home.

## 2. Roles and access

- **Admin (owner):** sees and manages everything (all supervisors, riders, customers, payments, reports). Can assign or reassign any rider to any customer.
- **Supervisor / Reseller (add later, but the schema and permissions must support it now):** manages a group of riders and sees only those riders' customers, deliveries, and payments. Riders are assigned under a supervisor (`users.supervisor_id`).
- **Rider:** sees only their own customers (`customers.rider_id = me`). Can add new customers on the spot, deliver, skip, pause/resume a customer's subscription, and record payments.

Every API endpoint must enforce this scoping on the server (JWT with role and user id), never only in the UI. Admin sees all; supervisor sees data where the rider's `supervisor_id` is the supervisor; rider sees data where `rider_id` is the rider.

The admin interface is a **separate web page** (admin-web), not part of the Android app. The Android app is for riders (supervisors may log in to the web dashboard).

## 3. Business rules

**Customers**
- Mandatory fields: name, mobile number, bottles per day, subscription status (active / inactive).
- Optional: area, address, landmark, city (Shirpur now; Dhule, Pune, Mumbai planned), notes, GPS location (latitude and longitude).
- A rider adds a new customer at the customer's door. The app captures the rider's current GPS as the home pin, which the rider can adjust on a map. If the rider only fills the four mandatory fields, the admin can complete the rest later.
- Each customer belongs to exactly one rider. Admin (and the supervisor, for their own riders) can reassign.

**Plans (prepaid, price is per bottle per day, seeded in `plans` and editable)**

| Product | 7 days (trial) | 15 days | 30 days |
|---|---|---|---|
| Amla juice | ₹140 | ₹299 | ₹549 |
| Beetroot juice | ₹210 | ₹399 | ₹749 |
| Combo (alternates Amla and Beetroot daily) | - | ₹349 | ₹699 |

- Subscription amount = plan price × bottles per day (snapshotted in `subscriptions.amount` and `subscriptions.bottles_per_day`).
- Combo alternates by day: Day 1 Amla, Day 2 Beetroot, Day 3 Amla, and so on (counting delivery days from the start date, excluding paused days).
- When a subscription's end date passes without renewal, it becomes inactive and drops out of the daily route automatically.
- Renewal alert: when a plan has 2 days left (make the threshold configurable), flag the customer to the rider and to the admin.

**Pause and resume**
- Admin, supervisor, or rider can pause and resume a customer's subscription. The customer is skipped from the daily route while paused.
- Assumption: when resumed, **extend the subscription end date by the number of paused days**. Make this a single, clearly isolated function so it's easy to change.
- Pauses are stored in `subscription_pauses` (who paused, who resumed, reason).

**Payments**
- Prepaid per subscription, tracked in `payments` (amount, mode cash/UPI/other, pending/paid, paid_at, collected_by).
- Reports: collected today / this month, pending payments by customer, collection per rider and per supervisor.

**Daily route generation**
- Each morning (a scheduled job, plus "generate on first request of the day" as a fallback), create `deliveries` rows (unique per customer per date) for every customer that is active, has an active subscription covering today, and is not paused today.
- Set `product` to amla or beetroot (resolving combo by the alternation rule) and `qty` to bottles per day.
- The rider's screen shows a bottle counter ("bottles left: 7 / 12"), split by product when both Amla and Beetroot are in the route.

**Nearest-first delivery**
- The rider app shows the nearest pending customer as the next stop. Calculate it on the phone from the rider's live GPS using the Haversine formula, so it works offline and updates after each delivery.
- Statuses per delivery: pending, delivered, skipped, not_home. Skipped and not-home customers return to the pending list and can be suggested again later.
- The rider can change quantity for a single day (extra bottle), and can drag a stop to the front.
- Phase 1 navigation: a **Navigate** button that opens Google Maps turn-by-turn to the customer's coordinates (`google.navigation:q=LAT,LNG`). Later phase: in-app route preview with the Google Directions API and polyline.

**Website leads**
- The public website has a subscription sign-up form (full name, mobile, area, city, plan, notes). Add a public `POST /leads` endpoint (rate-limited, validated, no auth) so these can be pushed into the `leads` table. The admin converts a lead to a customer and assigns a rider.

## 4. Rider app screens (React Native)

1. Login
2. Today's Route: next stop highlighted, bottle counter, remaining list sorted by distance
3. Next Stop card: name, phone (tap to call), distance, juice type and quantity, Navigate, Delivered, Skip / Not home
4. Add Customer: GPS pin with map adjustment, and a form with the mandatory fields plus plan and start date
5. Customers: search, edit, pause/resume, record payment
6. Day Summary: delivered, missed, bottles remaining, cash collected, new customers added

Requirements: Android first, TypeScript, React Navigation, React Query for server data, Zustand for local state, `react-native-maps` (Google Maps), location permission handling (foreground first), and an **offline cache plus a queue for status updates** that syncs automatically when the connection returns (riders often have a poor signal).

## 5. Admin web (React + Vite)

- Dashboard: today's deliveries, collections, renewals due, paused customers
- Customers: list, search, filter (rider, status), edit, reassign rider, pause/resume
- Riders and supervisors management (create, activate/deactivate, assign riders under supervisors)
- Subscriptions and payments
- Leads: convert a lead to a customer
- Reports with CSV export: collections, deliveries per rider, expiring plans, pauses, per supervisor
- Plans / price management

## 6. Backend and database

- **Stack:** Node.js, Express, TypeScript, **PostgreSQL**. Use **Prisma** (or Drizzle) as the ORM, **Zod** for request validation, **JWT** for auth with bcrypt-hashed passwords, and `node-cron` (or similar) for the daily generation and renewal alert jobs.
- **Database:** PostgreSQL. `schema.sql` defines these tables: `users` (admin / supervisor / rider with `supervisor_id`), `plans`, `customers`, `subscriptions`, `subscription_pauses`, `payments`, `deliveries`, `leads`. Convert it into the ORM's migrations so the database can be recreated from the repo. Plain `latitude` / `longitude` columns are enough for now (PostGIS is optional later).
- **Key endpoints:**
  - `POST /auth/login`
  - `POST /customers`, `GET /customers`, `GET /customers/:id`, `PATCH /customers/:id`
  - `PATCH /customers/:id/assign` (admin or supervisor: change rider)
  - `GET /route/today` (rider's list for the day)
  - `PATCH /deliveries/:id` (delivered / skipped / not_home, with optional GPS and remarks)
  - `POST /subscriptions`, `POST /subscriptions/:id/pause`, `POST /subscriptions/:id/resume`
  - `POST /payments`
  - `GET /admin/reports/...` (payments, deliveries, expiring plans)
  - `POST /leads` (public) and `GET /leads`, `POST /leads/:id/convert` (admin)
- Include seed data: one admin user, a sample supervisor, two riders, and about 12 sample customers around Shirpur with coordinates, so I can test nearest-first logic.

## 7. Deployment

I haven't decided between two options, so build it so either works:

1. **My own physical server** (Linux). Run the API and PostgreSQL there (Docker Compose is preferred), put **Cloudflare Tunnel** in front for HTTPS without exposing the network, and set up an automatic **nightly `pg_dump` backup copied off the machine**.
2. **Render** (web service for the API plus managed PostgreSQL). The admin web can be deployed as a static site (for example, Vercel or Render Static).

Requirements:
- Everything configured through environment variables (`DATABASE_URL`, `JWT_SECRET`, `PORT`, `CORS_ORIGINS`, and so on) with a documented `.env.example`. The apps must read a single `API_BASE_URL`, so moving between the two hosts is a config change only.
- Provide a `Dockerfile` and `docker-compose.yml` for the backend plus Postgres, a `render.yaml` for Render, and a short `DEPLOYMENT.md` describing both options step by step, including the backup and restore procedure.
- HTTPS only in production, CORS restricted to the admin site's domain, and rate limiting on login and the public leads endpoint.
- Customer phone numbers and addresses are personal data: never log them in plain text, and keep per-role access checks in place.

## 8. How I want you to work

1. Start by reading `schema.sql`, then give me a short plan and the folder structure. Wait for my go-ahead only if something is ambiguous; otherwise proceed.
2. Build in this order, finishing and testing each step before the next:
   1. Backend skeleton, ORM migrations from `schema.sql`, seed data
   2. Auth and role-based access control
   3. Customers CRUD and rider assignment
   4. Plans, subscriptions, pause/resume (with end-date extension)
   5. Daily delivery generator (including the combo alternation) and `GET /route/today`
   6. Delivery status updates and payments
   7. Reports, leads, and renewal alerts
   8. Rider app: login, today's route with nearest-first, Navigate, Delivered/Skip, Add Customer, offline queue
   9. Admin web
   10. Deployment files and `DEPLOYMENT.md`
3. Write tests for the business rules (daily generation, combo alternation, pause extension, role scoping, price calculation).
4. Keep code in TypeScript with clear naming, small modules, and comments only where the logic isn't obvious.
5. Commit after each step with a clear message. Tell me what you assumed whenever you make a decision I didn't specify.
