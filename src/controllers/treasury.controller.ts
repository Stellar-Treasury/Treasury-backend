// src/controllers/treasury.controller.ts
// feat(api): treasury controller

import { Request, Response } from 'express';
import * as TreasuryService   from '../services/treasury.service';

// ── GET /treasury ─────────────────────────────────────────────────────────────

export async function getTreasury(_req: Request, res: Response) {
  const info = await TreasuryService.getTreasuryInfo();
  res.json({ success: true, data: info });
}

// ── GET /treasury/stats ───────────────────────────────────────────────────────

export async function getStats(_req: Request, res: Response) {
  const stats = await TreasuryService.getDashboardStats();
  res.json({ success: true, data: stats });
}

// ── GET /treasury/signers ─────────────────────────────────────────────────────

export async function getSigners(_req: Request, res: Response) {
  const signers = await TreasuryService.listSigners();
  res.json({ success: true, data: signers });
}

// ── POST /treasury/refresh ────────────────────────────────────────────────────

export async function refreshBalance(req: Request, res: Response) {
  const { contractAddress } = req.body;
  if (!contractAddress) {
    res.status(400).json({ success: false, error: 'contractAddress is required' });
    return;
  }
  await TreasuryService.refreshTreasuryBalance(contractAddress);
  const info = await TreasuryService.getTreasuryInfo();
  res.json({ success: true, data: info });
}
