// src/config/database.ts
import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.__prisma ??
  new PrismaClient({
    log: [
      { emit: 'event', level: 'query'  },
      { emit: 'event', level: 'error'  },
      { emit: 'event', level: 'warn'   },
    ],
  });

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

prisma.$on('error' as never, (e: { message: string }) => {
  logger.error({ msg: 'Prisma error', error: e.message });
});

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info('✅  Database connected');
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Database disconnected');
}
