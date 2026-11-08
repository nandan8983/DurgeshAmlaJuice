/**
 * Seed data: the real plan prices, one admin, one supervisor, two riders, and
 * 12 customers spread around Shirpur with coordinates so nearest-first ordering
 * can be tested end to end.
 *
 * Idempotent — safe to re-run. Passwords come from env or fall back to the
 * documented development defaults.
 */
// Prisma's CLI loads .env by itself, but this script is run by tsx, which does
// not — without this, `npm run seed` fails with "Environment variable not
// found: DATABASE_URL".
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, type ProductKind } from '@prisma/client';
import { addDays, today, toUtcDate } from '../src/domain/dates';
import { subscriptionAmount, subscriptionEndDate } from '../src/domain/pricing';

const prisma = new PrismaClient();

const PASSWORDS = {
  admin: process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe@Admin1',
  supervisor: process.env.SEED_SUPERVISOR_PASSWORD ?? 'ChangeMe@Super1',
  rider: process.env.SEED_RIDER_PASSWORD ?? 'ChangeMe@Rider1',
};

const PLANS: Array<{
  name: string;
  product: ProductKind;
  durationDays: number;
  price: number;
  isTrial?: boolean;
}> = [
  { name: 'Amla 7-day trial', product: 'amla', durationDays: 7, price: 140, isTrial: true },
  { name: 'Amla 15-day', product: 'amla', durationDays: 15, price: 299 },
  { name: 'Amla 30-day', product: 'amla', durationDays: 30, price: 549 },
  { name: 'Beetroot 7-day trial', product: 'beetroot', durationDays: 7, price: 210, isTrial: true },
  { name: 'Beetroot 15-day', product: 'beetroot', durationDays: 15, price: 399 },
  { name: 'Beetroot 30-day', product: 'beetroot', durationDays: 30, price: 749 },
  { name: 'Combo 15-day', product: 'combo', durationDays: 15, price: 349 },
  { name: 'Combo 30-day', product: 'combo', durationDays: 30, price: 699 },
];

/** Real-ish spots around Shirpur (21.35 N, 74.88 E). */
const CUSTOMERS: Array<{
  name: string;
  mobile: string;
  area: string;
  address: string;
  landmark?: string;
  bottlesPerDay: number;
  latitude: number;
  longitude: number;
  rider: 0 | 1;
  plan: string;
  /** Days already elapsed, so some plans are near expiry for alert testing. */
  startedDaysAgo: number;
  paid: boolean;
}> = [
  { name: 'Ramesh Patil', mobile: '9890011001', area: 'Shivaji Nagar', address: 'Plot 14, Shivaji Nagar', landmark: 'Near water tank', bottlesPerDay: 1, latitude: 21.3498, longitude: 74.8811, rider: 0, plan: 'Amla 30-day', startedDaysAgo: 3, paid: true },
  { name: 'Sunita Deshmukh', mobile: '9890011002', area: 'Shivaji Nagar', address: 'House 7, Lane 2', bottlesPerDay: 2, latitude: 21.3502, longitude: 74.8824, rider: 0, plan: 'Combo 30-day', startedDaysAgo: 10, paid: true },
  { name: 'Anil Jadhav', mobile: '9890011003', area: 'Gandhi Chowk', address: 'Above Jadhav Stores, Gandhi Chowk', landmark: 'Opposite SBI ATM', bottlesPerDay: 1, latitude: 21.3461, longitude: 74.8789, rider: 0, plan: 'Amla 15-day', startedDaysAgo: 13, paid: true },
  { name: 'Prakash Mali', mobile: '9890011004', area: 'Gandhi Chowk', address: 'Mali Wada, Gandhi Chowk', bottlesPerDay: 1, latitude: 21.3455, longitude: 74.8771, rider: 0, plan: 'Beetroot 7-day trial', startedDaysAgo: 5, paid: false },
  { name: 'Vaishali Chaudhari', mobile: '9890011005', area: 'Tapi Road', address: 'Tapi Road, near the bridge', bottlesPerDay: 3, latitude: 21.3571, longitude: 74.8902, rider: 0, plan: 'Amla 30-day', startedDaysAgo: 20, paid: true },
  { name: 'Mahesh Shinde', mobile: '9890011006', area: 'Tapi Road', address: 'Shinde Niwas, Tapi Road', bottlesPerDay: 1, latitude: 21.3588, longitude: 74.8915, rider: 0, plan: 'Combo 15-day', startedDaysAgo: 1, paid: true },
  { name: 'Kavita Bhoi', mobile: '9890011007', area: 'College Road', address: 'Staff quarters, College Road', landmark: 'Behind R C Patel College', bottlesPerDay: 2, latitude: 21.3412, longitude: 74.8698, rider: 1, plan: 'Beetroot 30-day', startedDaysAgo: 7, paid: true },
  { name: 'Sachin Pawar', mobile: '9890011008', area: 'College Road', address: 'Flat 3, Vidya Apartments', bottlesPerDay: 1, latitude: 21.3405, longitude: 74.8681, rider: 1, plan: 'Amla 15-day', startedDaysAgo: 14, paid: true },
  { name: 'Nilesh Girase', mobile: '9890011009', area: 'MIDC', address: 'Quarter B-9, MIDC colony', bottlesPerDay: 1, latitude: 21.3339, longitude: 74.8742, rider: 1, plan: 'Amla 7-day trial', startedDaysAgo: 2, paid: false },
  { name: 'Archana Suryawanshi', mobile: '9890011010', area: 'MIDC', address: 'Row house 22, MIDC', bottlesPerDay: 2, latitude: 21.3321, longitude: 74.8755, rider: 1, plan: 'Combo 30-day', startedDaysAgo: 25, paid: true },
  { name: 'Dinesh Borse', mobile: '9890011011', area: 'Nehru Nagar', address: 'Borse House, Nehru Nagar', bottlesPerDay: 1, latitude: 21.3527, longitude: 74.8668, rider: 1, plan: 'Beetroot 15-day', startedDaysAgo: 4, paid: true },
  { name: 'Shalini Rane', mobile: '9890011012', area: 'Nehru Nagar', address: 'Near Nehru Nagar garden', bottlesPerDay: 1, latitude: 21.3541, longitude: 74.8655, rider: 1, plan: 'Amla 30-day', startedDaysAgo: 0, paid: false },
];

async function main(): Promise<void> {
  const rounds = Number(process.env.BCRYPT_ROUNDS ?? 10);

  // ---------------------------------------------------------------- plans
  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where: { product_durationDays: { product: plan.product, durationDays: plan.durationDays } },
      update: { name: plan.name, price: plan.price, isTrial: plan.isTrial ?? false, isActive: true },
      create: { ...plan, isTrial: plan.isTrial ?? false },
    });
  }
  const plans = await prisma.plan.findMany();
  const planByName = new Map(plans.map((p) => [p.name, p]));

  // ---------------------------------------------------------------- users
  const admin = await prisma.user.upsert({
    where: { mobile: '9999900001' },
    update: {},
    create: {
      name: 'Durgesh (Owner)',
      mobile: '9999900001',
      email: 'owner@durgeshamlajuice.in',
      passwordHash: await bcrypt.hash(PASSWORDS.admin, rounds),
      role: 'admin',
    },
  });

  const supervisor = await prisma.user.upsert({
    where: { mobile: '9999900002' },
    update: {},
    create: {
      name: 'Shirpur Supervisor',
      mobile: '9999900002',
      passwordHash: await bcrypt.hash(PASSWORDS.supervisor, rounds),
      role: 'supervisor',
    },
  });

  const riderHash = await bcrypt.hash(PASSWORDS.rider, rounds);
  const riders = [
    await prisma.user.upsert({
      where: { mobile: '9999900011' },
      update: { supervisorId: supervisor.id },
      create: {
        name: 'Rider Ganesh',
        mobile: '9999900011',
        passwordHash: riderHash,
        role: 'rider',
        supervisorId: supervisor.id,
      },
    }),
    await prisma.user.upsert({
      where: { mobile: '9999900012' },
      update: { supervisorId: supervisor.id },
      create: {
        name: 'Rider Sagar',
        mobile: '9999900012',
        passwordHash: riderHash,
        role: 'rider',
        supervisorId: supervisor.id,
      },
    }),
  ] as const;

  // ---------------------------------------------------------------- customers
  for (const spec of CUSTOMERS) {
    const plan = planByName.get(spec.plan);
    if (!plan) throw new Error(`Seed plan missing: ${spec.plan}`);
    const rider = riders[spec.rider];

    const existing = await prisma.customer.findFirst({ where: { mobile: spec.mobile } });
    const customer =
      existing ??
      (await prisma.customer.create({
        data: {
          name: spec.name,
          mobile: spec.mobile,
          bottlesPerDay: spec.bottlesPerDay,
          status: 'active',
          area: spec.area,
          address: spec.address,
          landmark: spec.landmark ?? null,
          city: 'Shirpur',
          latitude: spec.latitude,
          longitude: spec.longitude,
          riderId: rider.id,
          createdById: admin.id,
        },
      }));

    const hasSubscription = await prisma.subscription.findFirst({
      where: { customerId: customer.id, status: { in: ['active', 'paused'] } },
    });
    if (hasSubscription) continue;

    const startDate = addDays(today(), -spec.startedDaysAgo);
    const amount = subscriptionAmount(Number(plan.price), spec.bottlesPerDay);

    const subscription = await prisma.subscription.create({
      data: {
        customerId: customer.id,
        planId: plan.id,
        product: plan.product,
        durationDays: plan.durationDays,
        bottlesPerDay: spec.bottlesPerDay,
        amount,
        startDate: toUtcDate(startDate),
        endDate: toUtcDate(subscriptionEndDate(startDate, plan.durationDays)),
        createdById: admin.id,
      },
    });

    await prisma.payment.create({
      data: {
        customerId: customer.id,
        subscriptionId: subscription.id,
        amount,
        mode: spec.paid ? 'cash' : 'cash',
        status: spec.paid ? 'paid' : 'pending',
        paidAt: spec.paid ? new Date() : null,
        collectedById: spec.paid ? rider.id : null,
      },
    });
  }

  const counts = {
    plans: await prisma.plan.count(),
    users: await prisma.user.count(),
    customers: await prisma.customer.count(),
    subscriptions: await prisma.subscription.count(),
    payments: await prisma.payment.count(),
  };

  console.log('Seed complete:', counts);
  console.log('\nLogins (mobile / password):');
  console.log(`  admin       9999900001 / ${PASSWORDS.admin}`);
  console.log(`  supervisor  9999900002 / ${PASSWORDS.supervisor}`);
  console.log(`  rider 1     9999900011 / ${PASSWORDS.rider}`);
  console.log(`  rider 2     9999900012 / ${PASSWORDS.rider}`);
  console.log('\nChange these before going live.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
