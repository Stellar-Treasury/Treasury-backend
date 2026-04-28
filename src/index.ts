// src/index.ts
// Application entry point — wires together Express, DB, indexer, cron

import cron from 'node-cron';

import { env }                 from './config/env';
import { logger }              from './config/logger';
import { connectDatabase, disconnectDatabase } from './config/database';
import { createApp }           from './app';
import { startIndexer, stopIndexer } from './indexer';
import { retryFailedNotifications }  from './services/notification.service';

async function main() {
  // ── Database ──────────────────────────────────────────────────────────────
  await connectDatabase();

  // ── HTTP server ───────────────────────────────────────────────────────────
  const app    = createApp();
  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info(
      `🚀  DAO Backend running on http://${env.HOST}:${env.PORT}${env.API_PREFIX}`,
    );
    logger.info(`    Network  : ${env.STELLAR_NETWORK}`);
    logger.info(`    Contract : ${env.CONTRACT_ID}`);
    logger.info(`    Env      : ${env.NODE_ENV}`);
  });

  // ── Blockchain indexer ────────────────────────────────────────────────────
  if (env.NODE_ENV !== 'test') {
    startIndexer();
  }

  // ── Cron: retry failed notifications every 10 minutes ────────────────────
  cron.schedule('*/10 * * * *', () => {
    retryFailedNotifications().catch(err =>
      logger.error({ err }, 'Notification retry cron failed'),
    );
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  async function shutdown(signal: string) {
    logger.info(`${signal} received — shutting down gracefully`);
    stopIndexer();
    server.close(async () => {
      await disconnectDatabase();
      logger.info('Shutdown complete');
      process.exit(0);
    });
    // Force exit after 10 s
    setTimeout(() => process.exit(1), 10_000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('uncaughtException',  err => { logger.fatal({ err }, 'Uncaught exception');  process.exit(1); });
  process.on('unhandledRejection', err => { logger.fatal({ err }, 'Unhandled rejection'); process.exit(1); });
}

main().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
