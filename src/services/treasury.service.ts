// src/services/treasury.service.ts
// feat(api): treasury balance and signer management service

import { prisma }        from '../config/database';
import { horizonServer } from '../config/stellar';
import { env }           from '../config/env';
import { logger }        from '../config/logger';
import { TreasuryInfo }  from '../models/types';
import { AppError }      from './proposal.service';

// ── Treasury balance ──────────────────────────────────────────────────────────

export async function getTreasuryInfo(): Promise<TreasuryInfo> {
  const [snapshot, signers] = await Promise.all([
    prisma.treasurySnapshot.findFirst({ orderBy: { capturedAt: 'desc' } }),
    prisma.signer.findMany({ where: { active: true } }),
  ]);

  // Threshold: read from latest PENDING proposal or default to ceil(n/2)
  const threshold = Math.ceil(signers.length / 2);

  return {
    xlmBalance:  snapshot ? Number(snapshot.xlmBalance)  : 0,
    usdcBalance: snapshot ? Number(snapshot.usdcBalance) : 0,
    totalUsd:    snapshot ? Number(snapshot.totalUsd)    : 0,
    threshold,
    signerCount: signers.length,
    contractId:  env.CONTRACT_ID,
    network:     env.STELLAR_NETWORK,
    lastUpdated: snapshot?.capturedAt.toISOString() ?? new Date().toISOString(),
  };
}

// ── Fetch live balance from Horizon and snapshot it ──────────────────────────

export async function refreshTreasuryBalance(contractAddress: string): Promise<void> {
  try {
    const account = await horizonServer.loadAccount(contractAddress);
    let xlm  = 0;
    let usdc = 0;

    for (const balance of account.balances) {
      if (balance.asset_type === 'native') {
        xlm = parseFloat(balance.balance);
      } else if (
        balance.asset_type === 'credit_alphanum4' &&
        (balance as { asset_code?: string }).asset_code === 'USDC'
      ) {
        usdc = parseFloat(balance.balance);
      }
    }

    // Approximate USD value (hardcoded rate for demo; replace with oracle)
    const XLM_USD  = 0.25;
    const totalUsd = xlm * XLM_USD + usdc;

    await prisma.treasurySnapshot.create({
      data: {
        xlmBalance:  xlm,
        usdcBalance: usdc,
        totalUsd,
        ledgerSeq:   0, // Updated with real ledger from Soroban RPC
      },
    });

    logger.info({ xlm, usdc, totalUsd }, 'Treasury balance refreshed');
  } catch (err) {
    logger.warn({ err }, 'Could not refresh treasury balance from Horizon');
  }
}

// ── Signers ───────────────────────────────────────────────────────────────────

export async function listSigners() {
  return prisma.signer.findMany({
    where:   { active: true },
    orderBy: { addedAtLedger: 'asc' },
  });
}

export async function getSignerByAddress(address: string) {
  const signer = await prisma.signer.findUnique({ where: { address } });
  if (!signer) throw new AppError(404, 'Signer not found');
  return signer;
}

export async function addSigner(address: string, label: string | undefined, ledgerSeq: number) {
  return prisma.signer.upsert({
    where:  { address },
    update: { active: true, removedAtLedger: null, label },
    create: { address, label, addedAtLedger: ledgerSeq },
  });
}

export async function removeSigner(address: string, ledgerSeq: number) {
  return prisma.signer.update({
    where: { address },
    data:  { active: false, removedAtLedger: ledgerSeq },
  });
}

// ── Stats for dashboard ───────────────────────────────────────────────────────

export async function getDashboardStats() {
  const [total, pending, executed, cancelled, signerCount] = await prisma.$transaction([
    prisma.proposal.count(),
    prisma.proposal.count({ where: { status: 'PENDING'   } }),
    prisma.proposal.count({ where: { status: 'EXECUTED'  } }),
    prisma.proposal.count({ where: { status: 'CANCELLED' } }),
    prisma.signer.count({ where: { active: true } }),
  ]);

  return { total, pending, executed, cancelled, signerCount };
}
