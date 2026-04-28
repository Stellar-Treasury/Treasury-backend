// src/services/proposal.service.ts
// feat(api): proposal CRUD service layer
//
// All database access for proposals lives here.
// Controllers call services; services never call controllers.

import { Prisma, ProposalStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../config/logger';
import {
  CreateProposalInput,
  ProposalFilter,
  PaginatedResponse,
  ApproveProposalInput,
} from '../models/types';

// ── Full proposal shape returned by queries ───────────────────────────────────
const proposalSelect = {
  id:               true,
  onChainId:        true,
  proposer:         true,
  kind:             true,
  status:           true,
  description:      true,
  threshold:        true,
  createdAtLedger:  true,
  executedAtLedger: true,
  cancelledAtLedger:true,
  recipient:        true,
  amount:           true,
  signerAddress:    true,
  createdAt:        true,
  updatedAt:        true,
  approvals: {
    select: {
      id:           true,
      signerAddress: true,
      ledgerSeq:    true,
      txHash:       true,
      createdAt:    true,
    },
  },
} satisfies Prisma.ProposalSelect;

// ── List proposals with filtering and pagination ──────────────────────────────
export async function listProposals(
  filter: ProposalFilter,
): Promise<PaginatedResponse<unknown>> {
  const { page, limit, status, kind, proposer } = filter;
  const skip = (page - 1) * limit;

  const where: Prisma.ProposalWhereInput = {
    ...(status   && { status }),
    ...(kind     && { kind }),
    ...(proposer && { proposer: { equals: proposer, mode: 'insensitive' } }),
  };

  const [total, items] = await prisma.$transaction([
    prisma.proposal.count({ where }),
    prisma.proposal.findMany({
      where,
      select: proposalSelect,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
  ]);

  return {
    success: true,
    data: items,
    meta: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  };
}

// ── Get single proposal by internal UUID or on-chain ID ──────────────────────
export async function getProposalById(id: string) {
  // Try UUID first, then numeric on-chain ID
  const isUuid = /^[0-9a-f-]{36}$/i.test(id);
  const proposal = isUuid
    ? await prisma.proposal.findUnique({ where: { id },          select: proposalSelect })
    : await prisma.proposal.findUnique({ where: { onChainId: parseInt(id, 10) }, select: proposalSelect });

  return proposal;
}

// ── Create a new proposal (off-chain record; indexer will also create from events) ─
export async function createProposal(input: CreateProposalInput, onChainId?: number) {
  // Build next on-chain ID if not provided (draft mode before tx confirmation)
  let nextId = onChainId;
  if (!nextId) {
    const last = await prisma.proposal.findFirst({ orderBy: { onChainId: 'desc' } });
    nextId = (last?.onChainId ?? 0) + 1;
  }

  const base = {
    onChainId:      nextId,
    proposer:       input.proposer,
    kind:           input.kind,
    description:    input.description,
    threshold:      await getActiveThreshold(),
    createdAtLedger: 0, // Will be updated by indexer on confirmation
  };

  const specific =
    input.kind === 'TRANSFER'
      ? { recipient: input.recipient, amount: input.amount }
      : { signerAddress: input.signerAddress };

  const proposal = await prisma.proposal.create({
    data: { ...base, ...specific },
    select: proposalSelect,
  });

  logger.info({ proposalId: proposal.id, kind: proposal.kind }, 'Proposal created');
  return proposal;
}

// ── Record an approval ────────────────────────────────────────────────────────
export async function recordApproval(input: ApproveProposalInput) {
  const proposal = await prisma.proposal.findUnique({
    where:   { id: input.proposalId },
    include: { approvals: true },
  });

  if (!proposal) throw new AppError(404, 'Proposal not found');
  if (proposal.status !== 'PENDING') throw new AppError(409, `Proposal is ${proposal.status.toLowerCase()}`);

  const alreadyApproved = proposal.approvals.some(
    a => a.signerAddress === input.signerAddress,
  );
  if (alreadyApproved) throw new AppError(409, 'Signer has already approved this proposal');

  // Verify the signer is currently active
  const signer = await prisma.signer.findUnique({ where: { address: input.signerAddress } });
  if (!signer?.active) throw new AppError(403, 'Address is not an authorised signer');

  // Create approval + possibly mark proposal executed (if threshold met)
  const newApprovalCount = proposal.approvals.length + 1;
  const thresholdMet     = newApprovalCount >= proposal.threshold;

  const [approval] = await prisma.$transaction([
    prisma.approval.create({
      data: {
        proposalId:    input.proposalId,
        signerAddress: input.signerAddress,
        ledgerSeq:     input.txHash ? 0 : 0, // Updated by indexer
        txHash:        input.txHash,
      },
    }),
    ...(thresholdMet
      ? [prisma.proposal.update({
          where: { id: input.proposalId },
          data:  { status: ProposalStatus.EXECUTED },
        })]
      : []),
  ]);

  logger.info(
    { proposalId: input.proposalId, signer: input.signerAddress, thresholdMet },
    'Approval recorded',
  );

  return { approval, thresholdMet, approvalCount: newApprovalCount };
}

// ── Cancel a proposal ─────────────────────────────────────────────────────────
export async function cancelProposal(proposalId: string, cancellerAddress: string) {
  const proposal = await prisma.proposal.findUnique({ where: { id: proposalId } });
  if (!proposal)               throw new AppError(404, 'Proposal not found');
  if (proposal.status !== 'PENDING') throw new AppError(409, `Proposal is already ${proposal.status.toLowerCase()}`);

  const signer = await prisma.signer.findUnique({ where: { address: cancellerAddress } });
  if (!signer?.active) throw new AppError(403, 'Address is not an authorised signer');

  return prisma.proposal.update({
    where:  { id: proposalId },
    data:   { status: ProposalStatus.CANCELLED },
    select: proposalSelect,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getActiveThreshold(): Promise<number> {
  const count = await prisma.signer.count({ where: { active: true } });
  // Default: simple majority. In production, read from contract state.
  return Math.ceil(count / 2);
}

// ── Typed application error ───────────────────────────────────────────────────
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
