// src/config/database.ts
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { logger } from './logger';

declare global {
  var __prisma: PrismaClient | undefined;
}

const connectionString = process.env.DATABASE_URL;

export const prisma: PrismaClient =
  global.__prisma ??
  new PrismaClient({
    adapter: new PrismaPg(new Pool({ connectionString })),
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
