// src/config/env.ts
// chore(config): centralised environment validation using Zod

import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // Server
  NODE_ENV:    z.enum(['development', 'production', 'test']).default('development'),
  PORT:        z.coerce.number().default(3001),
  HOST:        z.string().default('0.0.0.0'),
  API_PREFIX:  z.string().default('/api/v1'),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Stellar / Soroban
  STELLAR_NETWORK:     z.enum(['testnet', 'mainnet', 'futurenet']).default('testnet'),
  SOROBAN_RPC_URL:     z.string().url().default('https://soroban-testnet.stellar.org'),
  HORIZON_URL:         z.string().url().default('https://horizon-testnet.stellar.org'),
  CONTRACT_ID:         z.string().min(1, 'CONTRACT_ID is required'),
  INDEXER_START_LEDGER: z.coerce.number().default(0),
  INDEXER_POLL_MS:     z.coerce.number().default(5000),

  // Auth / Security
  API_KEY:       z.string().optional(),   // Simple API key for write endpoints
  CORS_ORIGINS:  z.string().default('http://localhost:3000'),

  // Notifications (optional)
  SMTP_HOST:     z.string().optional(),
  SMTP_PORT:     z.coerce.number().default(587),
  SMTP_USER:     z.string().optional(),
  SMTP_PASS:     z.string().optional(),
  NOTIFY_FROM:   z.string().email().optional(),
  NOTIFY_TO:     z.string().optional(),   // Comma-separated emails for alerts

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  RATE_LIMIT_MAX:       z.coerce.number().default(100),
});

function loadEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌  Invalid environment configuration:');
    result.error.issues.forEach(issue => {
      console.error(`   ${issue.path.join('.')}: ${issue.message}`);
    });
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
export type Env  = typeof env;
