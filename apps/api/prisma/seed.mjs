import { config } from 'dotenv';
import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.SUPER_ADMIN_PASSWORD;

if (!email || !password || password.length < 12) {
  throw new Error(
    'Set SUPER_ADMIN_EMAIL and a SUPER_ADMIN_PASSWORD of at least 12 characters in apps/api/.env before seeding.',
  );
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error('SUPER_ADMIN_EMAIL must be a valid email address.');
}

const prisma = new PrismaClient();

try {
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      firstName: 'EventHub',
      lastName: 'Administrator',
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role: UserRole.SUPER_ADMIN,
    },
    update: {},
  });
  if (user.role !== UserRole.SUPER_ADMIN) {
    throw new Error('The configured super-admin email belongs to a non-admin account.');
  }
  if (!user.isActive) {
    throw new Error(
      'The configured Super Admin account is inactive; reactivate it through an active Super Admin account.',
    );
  }
  console.info('Super-admin account is ready.');
} finally {
  await prisma.$disconnect();
}
