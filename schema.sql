-- Durgesh Amla Juice — PostgreSQL schema (source of truth)
-- NOTE: this file was authored from the project brief because the repo did not
-- contain a schema.sql. Prisma models in backend/prisma/schema.prisma mirror it 1:1.
-- Money is numeric(10,2) (rupees). Coordinates are plain lat/lng; PostGIS optional later.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------- enums
CREATE TYPE user_role           AS ENUM ('admin', 'supervisor', 'rider');
CREATE TYPE customer_status     AS ENUM ('active', 'inactive');
CREATE TYPE product_kind        AS ENUM ('amla', 'beetroot', 'combo');
CREATE TYPE delivery_product    AS ENUM ('amla', 'beetroot');
CREATE TYPE subscription_status AS ENUM ('active', 'paused', 'expired', 'cancelled');
CREATE TYPE payment_mode        AS ENUM ('cash', 'upi', 'other');
CREATE TYPE payment_status      AS ENUM ('pending', 'paid');
CREATE TYPE delivery_status     AS ENUM ('pending', 'delivered', 'skipped', 'not_home');
CREATE TYPE lead_status         AS ENUM ('new', 'contacted', 'converted', 'rejected');

-- ---------------------------------------------------------------- users
-- admin / supervisor / rider. Riders hang under a supervisor via supervisor_id.
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  mobile        text        NOT NULL UNIQUE,
  email         text        UNIQUE,
  password_hash text        NOT NULL,
  role          user_role   NOT NULL,
  supervisor_id uuid        REFERENCES users(id) ON DELETE SET NULL,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_role          ON users(role);
CREATE INDEX idx_users_supervisor_id ON users(supervisor_id);

-- ---------------------------------------------------------------- plans
-- price = total price of the plan for ONE bottle per day over duration_days.
-- Subscription amount = price * bottles_per_day.
CREATE TABLE plans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text          NOT NULL,
  product       product_kind  NOT NULL,
  duration_days integer       NOT NULL CHECK (duration_days > 0),
  price         numeric(10,2) NOT NULL CHECK (price >= 0),
  is_trial      boolean       NOT NULL DEFAULT false,
  is_active     boolean       NOT NULL DEFAULT true,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (product, duration_days)
);

-- ---------------------------------------------------------------- customers
-- Mandatory: name, mobile, bottles_per_day, status. Everything else optional
-- so a rider can create a customer at the door with four fields.
CREATE TABLE customers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text            NOT NULL,
  mobile          text            NOT NULL,
  bottles_per_day integer         NOT NULL DEFAULT 1 CHECK (bottles_per_day > 0),
  status          customer_status NOT NULL DEFAULT 'active',
  area            text,
  address         text,
  landmark        text,
  city            text            NOT NULL DEFAULT 'Shirpur',
  notes           text,
  latitude        numeric(10,7),
  longitude       numeric(10,7),
  rider_id        uuid            NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by      uuid            REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz     NOT NULL DEFAULT now(),
  updated_at      timestamptz     NOT NULL DEFAULT now()
);
CREATE INDEX idx_customers_rider_id ON customers(rider_id);
CREATE INDEX idx_customers_status   ON customers(status);
CREATE INDEX idx_customers_mobile   ON customers(mobile);

-- ---------------------------------------------------------------- subscriptions
-- Prepaid. Plan price and bottles_per_day are snapshotted so later price edits
-- never rewrite history.
CREATE TABLE subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid                NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  plan_id         uuid                NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  product         product_kind        NOT NULL,
  duration_days   integer             NOT NULL CHECK (duration_days > 0),
  bottles_per_day integer             NOT NULL CHECK (bottles_per_day > 0),
  amount          numeric(10,2)       NOT NULL CHECK (amount >= 0),
  start_date      date                NOT NULL,
  end_date        date                NOT NULL,
  status          subscription_status NOT NULL DEFAULT 'active',
  paused_days     integer             NOT NULL DEFAULT 0 CHECK (paused_days >= 0),
  created_by      uuid                REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz         NOT NULL DEFAULT now(),
  updated_at      timestamptz         NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX idx_subscriptions_customer_id ON subscriptions(customer_id);
CREATE INDEX idx_subscriptions_status      ON subscriptions(status);
CREATE INDEX idx_subscriptions_end_date    ON subscriptions(end_date);

-- ---------------------------------------------------------------- subscription_pauses
-- resumed_on NULL => currently paused. Resume extends end_date by the paused days.
CREATE TABLE subscription_pauses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid        NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  paused_from     date        NOT NULL,
  resumed_on      date,
  paused_days     integer,
  reason          text,
  paused_by       uuid        REFERENCES users(id) ON DELETE SET NULL,
  resumed_by      uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (resumed_on IS NULL OR resumed_on >= paused_from)
);
CREATE INDEX idx_pauses_subscription_id ON subscription_pauses(subscription_id);
-- at most one open pause per subscription
CREATE UNIQUE INDEX uniq_open_pause_per_subscription
  ON subscription_pauses(subscription_id) WHERE resumed_on IS NULL;

-- ---------------------------------------------------------------- payments
CREATE TABLE payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid           NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  subscription_id uuid           REFERENCES subscriptions(id) ON DELETE SET NULL,
  amount          numeric(10,2)  NOT NULL CHECK (amount >= 0),
  mode            payment_mode   NOT NULL DEFAULT 'cash',
  status          payment_status NOT NULL DEFAULT 'pending',
  paid_at         timestamptz,
  collected_by    uuid           REFERENCES users(id) ON DELETE SET NULL,
  notes           text,
  created_at      timestamptz    NOT NULL DEFAULT now(),
  updated_at      timestamptz    NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_customer_id  ON payments(customer_id);
CREATE INDEX idx_payments_status       ON payments(status);
CREATE INDEX idx_payments_paid_at      ON payments(paid_at);
CREATE INDEX idx_payments_collected_by ON payments(collected_by);

-- ---------------------------------------------------------------- deliveries
-- One row per customer per day, generated each morning.
CREATE TABLE deliveries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid             NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  subscription_id uuid             REFERENCES subscriptions(id) ON DELETE SET NULL,
  rider_id        uuid             NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  delivery_date   date             NOT NULL,
  product         delivery_product NOT NULL,
  qty             integer          NOT NULL CHECK (qty > 0),
  status          delivery_status  NOT NULL DEFAULT 'pending',
  sequence        integer,
  delivered_at    timestamptz,
  latitude        numeric(10,7),
  longitude       numeric(10,7),
  remarks         text,
  updated_by      uuid             REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz      NOT NULL DEFAULT now(),
  updated_at      timestamptz      NOT NULL DEFAULT now(),
  UNIQUE (customer_id, delivery_date)
);
CREATE INDEX idx_deliveries_rider_date ON deliveries(rider_id, delivery_date);
CREATE INDEX idx_deliveries_date       ON deliveries(delivery_date);
CREATE INDEX idx_deliveries_status     ON deliveries(status);

-- ---------------------------------------------------------------- leads
-- Public website sign-up form lands here; admin converts a lead to a customer.
CREATE TABLE leads (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name             text        NOT NULL,
  mobile                text        NOT NULL,
  area                  text,
  city                  text,
  plan_id               uuid        REFERENCES plans(id) ON DELETE SET NULL,
  plan_text             text,
  notes                 text,
  status                lead_status NOT NULL DEFAULT 'new',
  source                text        NOT NULL DEFAULT 'website',
  converted_customer_id uuid        REFERENCES customers(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_mobile ON leads(mobile);
