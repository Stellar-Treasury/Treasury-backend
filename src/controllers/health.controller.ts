// src/controllers/health.controller.ts

import { Request, Response } from 'express';
import { prisma }  from '../config/database';
import { env }     from '../config/env';
import { getIndexerStatus } from '../indexer';

export async function healthCheck(_req: Request, res: Response) {
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch { /* db not ready */ }

  const indexerStatus = getIndexerStatus();

  const status = dbOk ? 200 : 503;
  res.status(status).json({
    success: dbOk,
    data: {
      status:    dbOk ? 'ok' : 'degraded',
      database:  dbOk ? 'connected' : 'unreachable',
      indexer:   indexerStatus,
      network:   env.STELLAR_NETWORK,
      contract:  env.CONTRACT_ID,
      timestamp: new Date().toISOString(),
      uptime:    Math.floor(process.uptime()),
    },
  });
}
