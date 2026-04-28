// src/routes/index.ts
// feat(api): register all API routes

import { Router } from 'express';
import { requireApiKey } from '../middleware';

import * as ProposalCtrl from '../controllers/proposal.controller';
import * as TreasuryCtrl from '../controllers/treasury.controller';
import * as HealthCtrl   from '../controllers/health.controller';

const router = Router();

// ── Health ────────────────────────────────────────────────────────────────────
router.get('/health', HealthCtrl.healthCheck);

// ── Proposals ─────────────────────────────────────────────────────────────────
// GET  /proposals          — list with filter + pagination
// POST /proposals          — create new proposal  [auth]
// GET  /proposals/:id      — get single proposal
// POST /proposals/:id/approve — approve proposal  [auth]
// POST /proposals/:id/cancel  — cancel proposal   [auth]

router.get( '/proposals',              ProposalCtrl.getProposals);
router.post('/proposals',              requireApiKey, ProposalCtrl.createProposal);
router.get( '/proposals/:id',          ProposalCtrl.getProposal);
router.post('/proposals/:id/approve',  requireApiKey, ProposalCtrl.approveProposal);
router.post('/proposals/:id/cancel',   requireApiKey, ProposalCtrl.cancelProposal);

// ── Treasury ──────────────────────────────────────────────────────────────────
// GET  /treasury           — balance + config
// GET  /treasury/stats     — proposal counts
// GET  /treasury/signers   — active signer list
// POST /treasury/refresh   — force balance refresh [auth]

router.get( '/treasury',          TreasuryCtrl.getTreasury);
router.get( '/treasury/stats',    TreasuryCtrl.getStats);
router.get( '/treasury/signers',  TreasuryCtrl.getSigners);
router.post('/treasury/refresh',  requireApiKey, TreasuryCtrl.refreshBalance);

export default router;
