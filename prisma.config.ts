// prisma.config.ts
import { defineConfig } from 'prisma/config';

export default defineConfig({
  database: {
    adapter: 'postgresql',
    url: process.env.DATABASE_URL,
  },
});