// tests/health.test.ts
// Basic health check test

import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../src/app';

describe('Health Check', () => {
  it('should return 200 and health data', async () => {
    const app = createApp();
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('status');
    expect(response.body.data).toHaveProperty('database');
    expect(response.body.data).toHaveProperty('indexer');
  });
});