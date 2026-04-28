// src/middleware/index.ts
// Centralised Express middleware: error handling, API key auth, Zod validation

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError }             from 'zod';
import { env }    from '../config/env';
import { logger } from '../config/logger';
import { AppError } from '../services/proposal.service';
import { ApiResponse } from '../models/types';

// ── Global error handler ──────────────────────────────────────────────────────

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error:   err.message,
    } satisfies ApiResponse);
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error:   'Validation failed',
      meta:    { issues: err.flatten().fieldErrors },
    } satisfies ApiResponse);
    return;
  }

  // Unexpected error
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({
    success: false,
    error:   env.NODE_ENV === 'production' ? 'Internal server error' : String(err),
  } satisfies ApiResponse);
}

// ── API key authentication (write endpoints) ──────────────────────────────────

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  if (!env.API_KEY) { next(); return; }       // No key configured → open

  const key =
    req.headers['x-api-key'] as string | undefined ??
    req.headers['authorization']?.replace('Bearer ', '');

  if (key !== env.API_KEY) {
    res.status(401).json({ success: false, error: 'Invalid or missing API key' });
    return;
  }
  next();
}

// ── Zod body / query validator factory ───────────────────────────────────────

export function validate<T>(
  schema: ZodSchema<T>,
  source: 'body' | 'query' | 'params' = 'body',
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(result.error);
      return;
    }
    // Attach parsed + coerced data back onto request
    (req as Request & { parsed: T }).parsed = result.data;
    next();
  };
}

// ── Request logger ────────────────────────────────────────────────────────────

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level]({ method: req.method, url: req.url, status: res.statusCode, ms });
  });
  next();
}

// ── Health check helper ───────────────────────────────────────────────────────

export function notFound(req: Request, res: Response): void {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.path} not found` });
}
