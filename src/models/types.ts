// src/models/types.ts
// Shared domain types and Zod validation schemas used across
// controllers, services, and the indexer.

import { z } from 'zod';
import { ProposalKind, ProposalStatus } from '@prisma/client';

// ── Re-export Prisma enums so callers don't import from @prisma/client ────────
export { ProposalKind, ProposalStatus };

// ── Pagination ────────────────────────────────────────────────────────────────
export const PaginationSchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type Pagination = z.infer<typeof PaginationSchema>;

// ── Proposal schemas ──────────────────────────────────────────────────────────
export const CreateProposalSchema = z.discriminatedUnion('kind', [
  z.object({
    kind:        z.literal('TRANSFER'),
    proposer:    z.string().regex(/^G[A-Z2-7]{55}$/, 'Invalid Stellar address'),
    recipient:   z.string().regex(/^G[A-Z2-7]{55}$/, 'Invalid recipient address'),
    amount:      z.number().positive('Amount must be positive'),
    description: z.string().min(10, 'Description must be at least 10 characters').max(500),
  }),
  z.object({
    kind:         z.literal('ADD_SIGNER'),
    proposer:     z.string().regex(/^G[A-Z2-7]{55}$/, 'Invalid Stellar address'),
    signerAddress: z.string().regex(/^G[A-Z2-7]{55}$/, 'Invalid signer address'),
    description:  z.string().min(10).max(500),
  }),
  z.object({
    kind:         z.literal('REMOVE_SIGNER'),
    proposer:     z.string().regex(/^G[A-Z2-7]{55}$/, 'Invalid Stellar address'),
    signerAddress: z.string().regex(/^G[A-Z2-7]{55}$/, 'Invalid signer address'),
    description:  z.string().min(10).max(500),
  }),
]);
export type CreateProposalInput = z.infer<typeof CreateProposalSchema>;

export const ProposalFilterSchema = z.object({
  status:   z.nativeEnum(ProposalStatus).optional(),
  kind:     z.nativeEnum(ProposalKind).optional(),
  proposer: z.string().optional(),
  ...PaginationSchema.shape,
});
export type ProposalFilter = z.infer<typeof ProposalFilterSchema>;

// ── Approval schemas ──────────────────────────────────────────────────────────
export const ApproveProposalSchema = z.object({
  proposalId:   z.string().uuid('Invalid proposal ID'),
  signerAddress: z.string().regex(/^G[A-Z2-7]{55}$/, 'Invalid Stellar address'),
  txHash:       z.string().optional(),
});
export type ApproveProposalInput = z.infer<typeof ApproveProposalSchema>;

// ── API response shapes ───────────────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?:   T;
  error?:  string;
  meta?:   Record<string, unknown>;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: {
    total:   number;
    page:    number;
    limit:   number;
    pages:   number;
  };
}

// ── Contract event types (from Soroban event indexer) ────────────────────────
export type ContractEventType =
  | 'prop_new'
  | 'prop_appr'
  | 'prop_exec'
  | 'prop_cncl'
  | 'sign_add'
  | 'sign_rm'
  | 'transfer';

export interface ParsedContractEvent {
  txHash:    string;
  ledgerSeq: number;
  type:      ContractEventType;
  topics:    unknown[];
  data:      unknown;
}

// ── Treasury ──────────────────────────────────────────────────────────────────
export interface TreasuryInfo {
  xlmBalance:  number;
  usdcBalance: number;
  totalUsd:    number;
  threshold:   number;
  signerCount: number;
  contractId:  string;
  network:     string;
  lastUpdated: string;
}
