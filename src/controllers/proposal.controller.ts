// src/controllers/proposal.controller.ts
// feat(api): proposal controller — thin HTTP layer over proposal service

import { Request, Response } from 'express';
import * as ProposalService   from '../services/proposal.service';
import { notifyProposalCreated } from '../services/notification.service';
import {
  CreateProposalSchema,
  ApproveProposalSchema,
  ProposalFilterSchema,
} from '../models/types';

// ── GET /proposals ────────────────────────────────────────────────────────────

export async function getProposals(req: Request, res: Response) {
  const filter = ProposalFilterSchema.parse(req.query);
  const result = await ProposalService.listProposals(filter);
  res.json(result);
}

// ── GET /proposals/:id ────────────────────────────────────────────────────────

export async function getProposal(req: Request, res: Response) {
  const proposal = await ProposalService.getProposalById(req.params.id);
  if (!proposal) {
    res.status(404).json({ success: false, error: 'Proposal not found' });
    return;
  }
  res.json({ success: true, data: proposal });
}

// ── POST /proposals ───────────────────────────────────────────────────────────

export async function createProposal(req: Request, res: Response) {
  const input    = CreateProposalSchema.parse(req.body);
  const proposal = await ProposalService.createProposal(input);

  // Fire notification (non-blocking)
  notifyProposalCreated(
    proposal.onChainId,
    proposal.description,
    proposal.kind,
  ).catch(() => {});

  res.status(201).json({ success: true, data: proposal });
}

// ── POST /proposals/:id/approve ───────────────────────────────────────────────

export async function approveProposal(req: Request, res: Response) {
  const input = ApproveProposalSchema.parse({
    ...req.body,
    proposalId: req.params.id,
  });
  const result = await ProposalService.recordApproval(input);
  res.json({ success: true, data: result });
}

// ── POST /proposals/:id/cancel ────────────────────────────────────────────────

export async function cancelProposal(req: Request, res: Response) {
  const { cancellerAddress } = req.body;
  if (!cancellerAddress) {
    res.status(400).json({ success: false, error: 'cancellerAddress is required' });
    return;
  }
  const proposal = await ProposalService.cancelProposal(req.params.id, cancellerAddress);
  res.json({ success: true, data: proposal });
}
