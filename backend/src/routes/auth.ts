import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../prisma';
import { env } from '../env';
import { asyncHandler, forbidden, unauthorized } from '../errors';
import { validate } from '../middleware/validate';
import { loginLimiter } from '../middleware/rateLimit';
import { actorOf, authenticate, signToken } from '../middleware/auth';
import { logger, maskMobile } from '../logger';

export const authRouter = Router();

const loginSchema = z.object({
  // The username is the mobile number — people reach for "admin" otherwise,
  // so say so in the error rather than reporting a character count.
  mobile: z
    .string()
    .trim()
    .min(6, 'Sign in with your mobile number, not a username')
    .max(20, 'That does not look like a mobile number'),
  password: z.string().min(1, 'Enter your password').max(200),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

authRouter.post(
  '/login',
  loginLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { mobile, password } = req.body as z.infer<typeof loginSchema>;

    const user = await prisma.user.findUnique({ where: { mobile } });
    // Same error either way so the endpoint can't be used to enumerate users.
    const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !ok) {
      logger.warn({ mobile: maskMobile(mobile) }, 'Failed login');
      throw unauthorized('Invalid mobile number or password');
    }
    if (!user.isActive) throw forbidden('This account has been deactivated');

    res.json({
      token: signToken(user),
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        supervisorId: user.supervisorId,
      },
    });
  }),
);

authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: actor.id },
      select: { id: true, name: true, role: true, supervisorId: true, isActive: true },
    });
    res.json({ user });
  }),
);

authRouter.post(
  '/change-password',
  authenticate,
  validate(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const { currentPassword, newPassword } = req.body as z.infer<typeof changePasswordSchema>;

    const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw unauthorized('Current password is incorrect');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS) },
    });
    res.json({ ok: true });
  }),
);
