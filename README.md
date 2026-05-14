# DAO Treasury Backend

> Node.js/Express backend service for the Stellar DAO treasury multisig platform. Indexes on-chain events, stores proposal state in PostgreSQL, and exposes a REST API for the frontend dashboard.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Quick Start (Docker)](#quick-start-docker)
  - [Manual Setup](#manual-setup)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
  - [Health](#health)
  - [Proposals](#proposals)
  - [Treasury](#treasury)
- [Blockchain Indexer](#blockchain-indexer)
- [Notification System](#notification-system)
- [Database Schema](#database-schema)
- [Conventional Commits](#conventional-commits)
- [Roadmap](#roadmap)

---

## Overview

The backend serves three responsibilities:

1. **Indexer** — polls the Soroban RPC for contract events (`prop_new`, `prop_appr`, `prop_exec`, etc.) and writes them into PostgreSQL, keeping the database in sync with on-chain state.
2. **REST API** — exposes typed endpoints for the frontend to read proposals, submit new ones, record approvals, and query the treasury balance.
3. **Notifications** — sends email alerts to signers when proposals are created or need approval, with automatic retry for failed deliveries.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     DAO Backend                          │
│                                                          │
│  ┌─────────────┐   ┌─────────────┐   ┌───────────────┐  │
│  │   Indexer   │   │  REST API   │   │  Notification │  │
│  │             │   │  (Express)  │   │    Service    │  │
│  │ polls every │   │             │   │               │  │
│  │  5 seconds  │   │  /proposals │   │  email alerts │  │
│  └──────┬──────┘   │  /treasury  │   │  cron retry   │  │
│         │          └──────┬──────┘   └───────┬───────┘  │
│         │                 │                  │           │
│         └─────────────────▼──────────────────▼           │
│                    ┌──────────────┐                       │
│                    │  PostgreSQL  │                       │
│                    │  (Prisma)    │                       │
│                    └──────────────┘                       │
└─────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
  Soroban RPC                    Frontend Dashboard
  (contract events)              (Next.js)
```

---

## Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Runtime | Node.js 20 | LTS, strong ecosystem |
| Framework | Express 4 | Lightweight, well-understood |
| Language | TypeScript 5 | Type-safety across the stack |
| Database | PostgreSQL 16 | Relational integrity, JSONB for event data |
| ORM | Prisma 5 | Type-safe queries, migration management |
| Validation | Zod | Runtime + compile-time schema sharing |
| Stellar SDK | `@stellar/stellar-sdk` | Official Soroban RPC client |
| Email | Nodemailer | SMTP notifications |
| Logging | Pino | Structured, high-performance logs |
| Scheduler | node-cron | Notification retry cron |
| Containerisation | Docker + Compose | Reproducible local dev |

---

## Project Structure

```
dao-backend/
│
├── prisma/
│   ├── schema.prisma       # Database schema — all models and relations
│   └── seed.ts             # Initial signers, sample proposals, treasury snapshot
│
├── src/
│   ├── index.ts            # Entry point — boots server, indexer, cron
│   ├── app.ts              # Express app factory — middleware, routes, error handler
│   │
│   ├── config/
│   │   ├── env.ts          # Zod-validated environment loader (fails fast on bad config)
│   │   ├── database.ts     # Prisma client singleton + connect/disconnect helpers
│   │   ├── logger.ts       # Pino logger — pretty in dev, JSON in production
│   │   └── stellar.ts      # Soroban RPC + Horizon clients, address helpers
│   │
│   ├── models/
│   │   └── types.ts        # Shared TypeScript types + Zod request schemas
│   │
│   ├── services/
│   │   ├── proposal.service.ts     # Proposal CRUD, approval recording, validation
│   │   ├── treasury.service.ts     # Balance fetching, signer management, stats
│   │   └── notification.service.ts # Email dispatch + failed notification retry
│   │
│   ├── controllers/
│   │   ├── proposal.controller.ts  # HTTP handlers for /proposals routes
│   │   ├── treasury.controller.ts  # HTTP handlers for /treasury routes
│   │   └── health.controller.ts    # GET /health — db + network status
│   │
│   ├── routes/
│   │   └── index.ts        # Route registration — maps paths to controllers
│   │
│   ├── middleware/
│   │   └── index.ts        # Error handler, API key auth, Zod validator, request logger
│   │
│   └── indexer/
│       └── index.ts        # Soroban event polling loop + per-event handlers
│
├── .env.example            # All environment variables documented
├── docker-compose.yml      # Postgres + backend for local dev
├── Dockerfile              # Multi-stage production build
├── package.json
└── tsconfig.json
```

---

## Getting Started

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 18.x |
| npm | ≥ 9.x |
| Docker & Docker Compose | latest (optional but recommended) |
| PostgreSQL | 14+ (or use Docker) |

---

### Quick Start (Docker)

The fastest path to a running backend with PostgreSQL:

```bash
# 1. Clone and enter the project
git clone git@github.com:Stellar-Treasury/multisig-contracts.git
cd multisig-contracts/backend

# 2. Copy and configure environment
cp .env.example .env
# Edit .env — at minimum set CONTRACT_ID

# 3. Start everything
docker compose up --build

# 4. Run migrations and seed in a second terminal
docker compose exec backend npm run db:migrate
docker compose exec backend npm run db:seed
```

API is live at **http://localhost:3001/api/v1**

---

### Manual Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL and CONTRACT_ID at minimum

# 3. Run database migrations
npm run db:migrate

# 4. Generate Prisma client
npm run db:generate

# 5. Seed initial data
npm run db:seed

# 6. Start development server (hot-reload)
npm run dev
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `CONTRACT_ID` | ✅ | — | Deployed Soroban contract address |
| `NODE_ENV` | | `development` | `development` \| `production` \| `test` |
| `PORT` | | `3001` | HTTP server port |
| `HOST` | | `0.0.0.0` | HTTP bind address |
| `API_PREFIX` | | `/api/v1` | URL prefix for all routes |
| `STELLAR_NETWORK` | | `testnet` | `testnet` \| `mainnet` \| `futurenet` |
| `SOROBAN_RPC_URL` | | testnet RPC | Soroban JSON-RPC endpoint |
| `HORIZON_URL` | | testnet | Stellar Horizon endpoint |
| `INDEXER_START_LEDGER` | | `0` | Ledger to start indexing from |
| `INDEXER_POLL_MS` | | `5000` | Polling interval in milliseconds |
| `API_KEY` | | — | Shared secret for write endpoints |
| `CORS_ORIGINS` | | `http://localhost:3000` | Comma-separated allowed origins |
| `RATE_LIMIT_WINDOW_MS` | | `60000` | Rate limit window (ms) |
| `RATE_LIMIT_MAX` | | `100` | Max requests per window per IP |
| `SMTP_HOST` | | — | SMTP server (leave empty to disable email) |
| `SMTP_PORT` | | `587` | SMTP port |
| `SMTP_USER` | | — | SMTP username |
| `SMTP_PASS` | | — | SMTP password |
| `NOTIFY_FROM` | | — | From address for notification emails |
| `NOTIFY_TO` | | — | Comma-separated alert recipients |

---

## API Reference

All endpoints are prefixed with `/api/v1`. Write endpoints require the `X-API-Key` header when `API_KEY` is configured.

### Response envelope

Every response follows this shape:

```json
{
  "success": true,
  "data": { ... },
  "meta": { ... }
}
```

Errors return:

```json
{
  "success": false,
  "error": "Human-readable message",
  "meta": { "issues": { ... } }
}
```

---

### Health

#### `GET /health`

Returns server and database status. No authentication required.

**Response `200`**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "database": "connected",
    "network": "testnet",
    "contract": "CBIELTK6...",
    "timestamp": "2024-07-01T12:00:00.000Z",
    "uptime": 3600
  }
}
```

---

### Proposals

#### `GET /proposals`

List proposals with optional filtering and pagination.

**Query parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | `PENDING \| EXECUTED \| CANCELLED` | Filter by status |
| `kind` | `TRANSFER \| ADD_SIGNER \| REMOVE_SIGNER` | Filter by proposal type |
| `proposer` | `string` | Filter by proposer address |
| `page` | `number` | Page number (default: 1) |
| `limit` | `number` | Results per page (default: 20, max: 100) |

**Example**
```bash
curl "http://localhost:3001/api/v1/proposals?status=PENDING&page=1&limit=10"
```

**Response `200`**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "onChainId": 2,
      "proposer": "GDEF...",
      "kind": "TRANSFER",
      "status": "PENDING",
      "description": "Security audit payment",
      "threshold": 2,
      "recipient": "GXYZ...",
      "amount": "12000",
      "approvals": [
        { "signerAddress": "GDEF...", "ledgerSeq": 1105, "createdAt": "..." }
      ],
      "createdAt": "2024-07-01T10:00:00.000Z"
    }
  ],
  "meta": {
    "total": 5,
    "page": 1,
    "limit": 10,
    "pages": 1
  }
}
```

---

#### `POST /proposals`

Create a new proposal. Requires `X-API-Key` header.

**Headers**
```
X-API-Key: your-secret-api-key-here
Content-Type: application/json
```

**Body — Transfer**
```json
{
  "kind": "TRANSFER",
  "proposer": "GABC1234STELLARTEST0000001AAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "recipient": "GXYZ0001DEVGRANTRECIPIENT000000AAAAAAAAAAAAAAAAAAAAAAAA",
  "amount": 5000,
  "description": "Q3 developer grant payment to @alice for Soroban SDK contributions."
}
```

**Body — Add Signer**
```json
{
  "kind": "ADD_SIGNER",
  "proposer": "GABC1234STELLARTEST0000001AAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "signerAddress": "GNEW0001NEWSIGNERCANDIDATE00000DDDDDDDDDDDDDDDDDDDDDDDD",
  "description": "Onboard @dave as fourth DAO council member. Community vote passed 94%."
}
```

**Body — Remove Signer**
```json
{
  "kind": "REMOVE_SIGNER",
  "proposer": "GABC1234STELLARTEST0000001AAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "signerAddress": "GOLD0001DEPARTEDSIGNERADDR00000FFFFFFFFFFFFFFFFFFFFFFFFFFF",
  "description": "Remove inactive signer — no participation in 6 months."
}
```

**Response `201`**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "onChainId": 6,
    "kind": "TRANSFER",
    "status": "PENDING",
    "threshold": 2,
    "approvals": [],
    "createdAt": "2024-07-01T12:00:00.000Z"
  }
}
```

**Validation errors `400`**
```json
{
  "success": false,
  "error": "Validation failed",
  "meta": {
    "issues": {
      "amount": ["Amount must be positive"],
      "description": ["Description must be at least 10 characters"]
    }
  }
}
```

---

#### `GET /proposals/:id`

Fetch a single proposal by internal UUID or on-chain integer ID.

```bash
# By UUID
curl http://localhost:3001/api/v1/proposals/550e8400-e29b-41d4-a716-446655440000

# By on-chain ID
curl http://localhost:3001/api/v1/proposals/2
```

**Response `200`** — same shape as a single item from the list endpoint.

**Response `404`**
```json
{ "success": false, "error": "Proposal not found" }
```

---

#### `POST /proposals/:id/approve`

Record a signer's approval for a proposal. Requires `X-API-Key`.

Enforces:
- Signer must be in the active signer set
- Signer cannot approve the same proposal twice
- Proposal must be in `PENDING` status

If this approval reaches the threshold, the proposal status is automatically updated to `EXECUTED`.

**Body**
```json
{
  "signerAddress": "GDEF5678STELLARTEST0000002BBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  "txHash": "optional-stellar-transaction-hash"
}
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "approval": {
      "id": "uuid",
      "proposalId": "uuid",
      "signerAddress": "GDEF...",
      "createdAt": "2024-07-01T12:01:00.000Z"
    },
    "thresholdMet": true,
    "approvalCount": 2
  }
}
```

**Error `409` — already approved**
```json
{ "success": false, "error": "Signer has already approved this proposal" }
```

**Error `409` — not pending**
```json
{ "success": false, "error": "Proposal is executed" }
```

**Error `403` — not a signer**
```json
{ "success": false, "error": "Address is not an authorised signer" }
```

---

#### `POST /proposals/:id/cancel`

Cancel a pending proposal. Requires `X-API-Key`.

**Body**
```json
{
  "cancellerAddress": "GABC1234STELLARTEST0000001AAAAAAAAAAAAAAAAAAAAAAAAAAAA"
}
```

**Response `200`**
```json
{
  "success": true,
  "data": { "id": "uuid", "status": "CANCELLED", "updatedAt": "..." }
}
```

---

### Treasury

#### `GET /treasury`

Returns the latest treasury snapshot, signer count, and contract configuration.

```bash
curl http://localhost:3001/api/v1/treasury
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "xlmBalance": 142500.75,
    "usdcBalance": 28340.00,
    "totalUsd": 56825.30,
    "threshold": 2,
    "signerCount": 3,
    "contractId": "CBIELTK6...",
    "network": "testnet",
    "lastUpdated": "2024-07-01T12:00:00.000Z"
  }
}
```

---

#### `GET /treasury/stats`

Proposal counts by status — useful for dashboard metrics.

**Response `200`**
```json
{
  "success": true,
  "data": {
    "total": 5,
    "pending": 2,
    "executed": 2,
    "cancelled": 1,
    "signerCount": 3
  }
}
```

---

#### `GET /treasury/signers`

List all currently active DAO signers.

**Response `200`**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "address": "GABC...",
      "label": "Core Team A",
      "active": true,
      "addedAtLedger": 1000,
      "createdAt": "2024-07-01T10:00:00.000Z"
    }
  ]
}
```

---

#### `POST /treasury/refresh`

Force a live balance refresh from Stellar Horizon. Requires `X-API-Key`.

**Body**
```json
{
  "contractAddress": "GABC1234STELLARTEST0000001AAAAAAAAAAAAAAAAAAAAAAAAAAAA"
}
```

**Response `200`** — same shape as `GET /treasury` with updated balances.

---

## Blockchain Indexer

The indexer (`src/indexer/index.ts`) runs in the same process as the API server and polls the Soroban RPC on a configurable interval (`INDEXER_POLL_MS`, default 5 s).

**How it works:**

1. On startup, reads the `IndexerCursor` record from the database to find the last processed ledger.
2. Fetches all contract events from that ledger up to the latest ledger using `getEvents`.
3. For each event, dispatches to a typed handler based on the topic symbol.
4. Advances the cursor so restarts resume without re-processing events.

**Recent Fix**: Ensured indexer starts from ledger 1 instead of 0 to avoid RPC errors, as Stellar ledgers are 1-indexed.

**Event handlers:**

| Event symbol | Action |
|---|---|
| `prop_new` | Upserts a `Proposal` record; fires creation notification |
| `prop_appr` | Upserts an `Approval` record for the proposal |
| `prop_exec` | Updates proposal status to `EXECUTED`; fires execution notification |
| `prop_cncl` | Updates proposal status to `CANCELLED` |
| `sign_add` | Upserts a `Signer` record and marks them active |
| `sign_rm` | Marks the signer inactive and records the removal ledger |

Every raw event is also stored in `ContractEvent` for a complete audit trail.

---

## Notification System

Email notifications are sent via Nodemailer (SMTP). Configure `SMTP_HOST` and related variables to enable them. If `SMTP_HOST` is not set, notifications are silently skipped — the system degrades gracefully.

**Triggers:**

| Event | Recipients |
|-------|-----------|
| New proposal created | `NOTIFY_TO` list |
| Proposal reaches threshold | `NOTIFY_TO` list |
| Proposal executed | `NOTIFY_TO` list |

Failed notifications are stored in the `Notification` table with `sent: false`. A cron job runs every 10 minutes to retry them.

---

## Database Schema

Key models and their relationships:

```
Proposal (1) ──── (N) Approval
Proposal (1) ──── (N) ContractEvent
Signer
TreasurySnapshot
IndexerCursor (singleton)
Notification
```

Run `npm run db:studio` to open Prisma Studio and browse all data visually.

---

## Conventional Commits

```
chore(db): define PostgreSQL schema for DAO treasury backend
chore(config): centralised environment validation using Zod
chore(infra): local development stack — Postgres + backend
feat(indexer): index blockchain events from the multisig contract
feat(api): proposal CRUD service layer
feat(api): treasury balance and signer management service
feat(api): proposal controller — thin HTTP layer over proposal service
feat(api): treasury controller
feat(api): register all API routes
feat(api): configure Express application
feat(notifications): email notification system for pending approvals
chore(db): seed database with initial DAO configuration
docs(backend): add README with API documentation and setup instructions
```

---

## Roadmap

- [ ] WebSocket endpoint for real-time proposal updates
- [ ] Transaction building — construct and return unsigned Soroban transactions for frontend signing
- [ ] JWT authentication replacing shared API key
- [ ] Webhook support — push events to external systems
- [ ] Prometheus metrics endpoint (`/metrics`)
- [ ] Redis caching for treasury balance and proposal lists
- [ ] Multi-contract support for multiple DAO treasuries
