// src/app.ts
// feat(api): configure Express application

import 'express-async-errors';
import express      from 'express';
import helmet       from 'helmet';
import cors         from 'cors';
import rateLimit    from 'express-rate-limit';

import { env }            from './config/env';
import { requestLogger, errorHandler, notFound } from './middleware';
import routes             from './routes';

export function createApp() {
  const app = express();

  // ── Security headers ────────────────────────────────────────────────────────
  app.use(helmet());

  // ── CORS ────────────────────────────────────────────────────────────────────
  const allowedOrigins = env.CORS_ORIGINS.split(',').map(o => o.trim());
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        cb(null, true);
      } else {
        cb(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    methods:     ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: true,
  }));

  // ── Rate limiting ───────────────────────────────────────────────────────────
  app.use(rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max:      env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders:   false,
    message: { success: false, error: 'Too many requests — slow down' },
  }));

  // ── Body parsing ────────────────────────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ── Request logging ─────────────────────────────────────────────────────────
  app.use(requestLogger);

  // ── API routes ──────────────────────────────────────────────────────────────
  app.use(env.API_PREFIX, routes);

  // ── 404 + error handler (must be last) ─────────────────────────────────────
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
