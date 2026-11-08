-- Constraints that schema.sql declares but Prisma's schema language cannot
-- express, so a database built from these migrations matches schema.sql exactly.

-- At most one open pause per subscription. Without this, a double tap on Pause
-- creates two open windows and the resume maths silently loses days.
CREATE UNIQUE INDEX "uniq_open_pause_per_subscription"
  ON "subscription_pauses" ("subscription_id")
  WHERE "resumed_on" IS NULL;

-- ---------------------------------------------------------------- sanity checks
ALTER TABLE "plans"
  ADD CONSTRAINT "plans_duration_days_positive" CHECK ("duration_days" > 0),
  ADD CONSTRAINT "plans_price_non_negative" CHECK ("price" >= 0);

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_bottles_positive" CHECK ("bottles_per_day" > 0);

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_duration_days_positive" CHECK ("duration_days" > 0),
  ADD CONSTRAINT "subscriptions_bottles_positive" CHECK ("bottles_per_day" > 0),
  ADD CONSTRAINT "subscriptions_amount_non_negative" CHECK ("amount" >= 0),
  ADD CONSTRAINT "subscriptions_paused_days_non_negative" CHECK ("paused_days" >= 0),
  ADD CONSTRAINT "subscriptions_window_ordered" CHECK ("end_date" >= "start_date");

ALTER TABLE "subscription_pauses"
  ADD CONSTRAINT "pauses_resume_after_pause"
    CHECK ("resumed_on" IS NULL OR "resumed_on" >= "paused_from");

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_non_negative" CHECK ("amount" >= 0);

ALTER TABLE "deliveries"
  ADD CONSTRAINT "deliveries_qty_positive" CHECK ("qty" > 0);
