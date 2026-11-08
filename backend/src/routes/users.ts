/** Rider and supervisor accounts. Admin manages everyone; a supervisor manages their own riders. */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../prisma';
import { env } from '../env';
import { asyncHandler, badRequest, forbidden, notFound } from '../errors';
import { validate } from '../middleware/validate';
import { actorOf, authenticate, requireStaff } from '../middleware/auth';
import { and, manageableUserScope } from '../domain/scope';

export const usersRouter = Router();

usersRouter.use(authenticate, requireStaff);

const PUBLIC_FIELDS = {
  id: true,
  name: true,
  mobile: true,
  email: true,
  role: true,
  supervisorId: true,
  isActive: true,
  createdAt: true,
} as const;

const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  mobile: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{6,20}$/, 'Enter a valid mobile number'),
  email: z.string().trim().email().optional(),
  password: z.string().min(8).max(200),
  role: z.enum(['admin', 'supervisor', 'rider']),
  supervisorId: z.string().uuid().nullable().optional(),
});

const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().email().nullable().optional(),
    password: z.string().min(8).max(200).optional(),
    supervisorId: z.string().uuid().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

const listQuerySchema = z.object({
  role: z.enum(['admin', 'supervisor', 'rider']).optional(),
  isActive: z.enum(['true', 'false']).optional(),
  search: z.string().trim().max(80).optional(),
});

usersRouter.get(
  '/',
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const q = req.query as unknown as z.infer<typeof listQuerySchema>;

    const users = await prisma.user.findMany({
      where: and(
        manageableUserScope(actor),
        q.role ? { role: q.role } : undefined,
        q.isActive ? { isActive: q.isActive === 'true' } : undefined,
        q.search ? { name: { contains: q.search, mode: 'insensitive' } } : undefined,
      ),
      select: { ...PUBLIC_FIELDS, _count: { select: { customers: true } } },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });

    res.json({
      users: users.map(({ _count, ...u }) => ({ ...u, customerCount: _count.customers })),
    });
  }),
);

usersRouter.post(
  '/',
  validate(createUserSchema),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const body = req.body as z.infer<typeof createUserSchema>;

    // A supervisor may only create riders, and only under themselves.
    if (actor.role === 'supervisor') {
      if (body.role !== 'rider') throw forbidden('A supervisor can only create rider accounts');
      body.supervisorId = actor.id;
    }
    if (body.role === 'rider' && body.supervisorId) {
      const supervisor = await prisma.user.findFirst({
        where: { id: body.supervisorId, role: 'supervisor' },
        select: { id: true },
      });
      if (!supervisor) throw badRequest('supervisorId must be an existing supervisor');
    }
    if (body.role !== 'rider' && body.supervisorId) {
      throw badRequest('Only riders can have a supervisor');
    }

    const user = await prisma.user.create({
      data: {
        name: body.name,
        mobile: body.mobile,
        email: body.email ?? null,
        passwordHash: await bcrypt.hash(body.password, env.BCRYPT_ROUNDS),
        role: body.role,
        supervisorId: body.supervisorId ?? null,
      },
      select: PUBLIC_FIELDS,
    });
    res.status(201).json({ user });
  }),
);

usersRouter.patch(
  '/:id',
  validate(z.object({ id: z.string().uuid() }), 'params'),
  validate(updateUserSchema),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const { id } = req.params as { id: string };
    const body = req.body as z.infer<typeof updateUserSchema>;

    const target = await prisma.user.findFirst({
      where: and({ id }, manageableUserScope(actor)),
      select: { id: true, role: true },
    });
    if (!target) throw notFound('User not found');

    if (actor.role === 'supervisor' && body.supervisorId !== undefined) {
      throw forbidden('A supervisor cannot move riders to another supervisor');
    }
    if (target.role !== 'rider' && body.supervisorId) {
      throw badRequest('Only riders can have a supervisor');
    }
    if (body.isActive === false && target.id === actor.id) {
      throw badRequest('You cannot deactivate your own account');
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.email !== undefined ? { email: body.email } : {}),
        ...(body.supervisorId !== undefined ? { supervisorId: body.supervisorId } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.password !== undefined
          ? { passwordHash: await bcrypt.hash(body.password, env.BCRYPT_ROUNDS) }
          : {}),
      },
      select: PUBLIC_FIELDS,
    });
    res.json({ user });
  }),
);
