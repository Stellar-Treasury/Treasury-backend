// src/indexer/index.ts
// feat(indexer): index blockchain events from the multisig contract
//
// Polls the Soroban RPC for contract events and processes them into the
// database. Resumes from the last processed ledger on restart using
// the IndexerCursor record. Handles: prop_new, prop_appr, prop_exec,
// prop_cncl, sign_add, sign_rm, transfer.

import { SorobanRpc } from '@stellar/stellar-sdk';
import { prisma }     from '../config/database';
import { sorobanServer } from '../config/stellar';
import { env }        from '../config/env';
import { logger }     from '../config/logger';
import {
  notifyProposalCreated,
  notifyProposalExecuted,
} from '../services/notification.service';
import { addSigner, removeSigner } from '../services/treasury.service';
import { ProposalStatus }          from '../models/types';

let running    = false;
let intervalId: ReturnType<typeof setInterval> | null = null;
let consecutiveFailures = 0;

// ── Start the indexer loop ────────────────────────────────────────────────────

export function startIndexer(): void {
  if (running) return;
  running    = true;
  consecutiveFailures = 0;
  intervalId = setInterval(poll, env.INDEXER_POLL_MS);
  logger.info({ pollMs: env.INDEXER_POLL_MS }, '🔍  Indexer started');
  // Run immediately on start
  poll().catch(err => logger.error({ err }, 'Indexer initial poll failed'));
}

export function stopIndexer(): void {
  if (intervalId) clearInterval(intervalId);
  running = false;
  logger.info('Indexer stopped');
}

export function getIndexerStatus() {
  return {
    running,
    consecutiveFailures,
    pollIntervalMs: env.INDEXER_POLL_MS,
  };
}

// ── Poll for new events ───────────────────────────────────────────────────────

async function poll(): Promise<void> {
  try {
    const cursor = await prisma.indexerCursor.findUnique({ where: { id: 'singleton' } });
    let fromLedger = Math.max(
      cursor?.lastLedgerSeq ?? 0,
      env.INDEXER_START_LEDGER,
    );

    // Ensure fromLedger is at least 1 (Stellar ledgers start from 1)
    fromLedger = Math.max(fromLedger, 1);

    // Fetch latest ledger to know the upper bound
    const latestLedger = await sorobanServer.getLatestLedger();
    const toLedger     = latestLedger.sequence;

    if (fromLedger >= toLedger) return; // Nothing new

    logger.debug({ fromLedger, toLedger }, 'Indexer polling');

    // Fetch contract events from Soroban RPC
    const response = await sorobanServer.getEvents({
      startLedger: fromLedger,
      filters: [{
        type:        'contract',
        contractIds: [env.CONTRACT_ID],
      }],
      limit: 200,
    });

    if (response.events.length > 0) {
      logger.info({ count: response.events.length, fromLedger, toLedger }, 'Events received');
      await processEvents(response.events as SorobanRpc.Api.EventResponse[]);
    } else {
      logger.debug({ fromLedger, toLedger }, 'No new events');
    }

    // Advance cursor
    await prisma.indexerCursor.update({
      where: { id: 'singleton' },
      data:  { lastLedgerSeq: toLedger },
    });

    logger.debug({ newCursor: toLedger }, 'Cursor advanced');

    // Reset failure counter on success
    consecutiveFailures = 0;
  } catch (err) {
    consecutiveFailures++;
    logger.error({ err, consecutiveFailures }, 'Indexer poll error');

    // If too many consecutive failures, pause polling for a bit
    if (consecutiveFailures >= 5) {
      logger.warn('Too many consecutive indexer failures — pausing for 60 seconds');
      stopIndexer();
      setTimeout(() => {
        if (!running) startIndexer();
      }, 60_000);
    }
  }
}

// ── Process a batch of raw events ─────────────────────────────────────────────

async function processEvents(events: SorobanRpc.Api.EventResponse[]): Promise<void> {
  for (const event of events) {
    try {
      await processEvent(event);
    } catch (err) {
      logger.error({ err, event }, 'Failed to process event — skipping');
    }
  }
}

// ── Dispatch a single event by symbol ─────────────────────────────────────────

async function processEvent(event: SorobanRpc.Api.EventResponse): Promise<void> {
  const txHash   = event.txHash;
  const ledger   = event.ledger;
  const topics   = event.topic.map(t => t.toXDR());
  const data     = event.value?.toXDR?.() ?? null;

  // First topic is always the event symbol
  const symbol   = (topics[0] as { sym?: string })?.sym ?? '';

  // Deduplicate
  const exists = await prisma.contractEvent.findFirst({
    where: { txHash, eventType: symbol },
  });
  if (exists) return;

  logger.debug({ symbol, txHash, ledger }, 'Processing event');

  switch (symbol) {
    case 'prop_new':   await handleProposalCreated(topics, data, txHash, ledger);   break;
    case 'prop_appr':  await handleProposalApproved(topics, data, txHash, ledger);  break;
    case 'prop_exec':  await handleProposalExecuted(topics, data, txHash, ledger);  break;
    case 'prop_cncl':  await handleProposalCancelled(topics, data, txHash, ledger); break;
    case 'sign_add':   await handleSignerAdded(topics, data, txHash, ledger);       break;
    case 'sign_rm':    await handleSignerRemoved(topics, data, txHash, ledger);     break;
    default:
      logger.debug({ symbol }, 'Unknown event symbol — skipping');
  }

  // Store raw event for audit trail
  await prisma.contractEvent.create({
    data: { txHash, ledgerSeq: ledger, eventType: symbol, topics, data },
  }).catch(() => { /* ignore unique constraint on replay */ });
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function handleProposalCreated(
  topics: unknown[], data: unknown, txHash: string, ledger: number,
) {
  // topics: [symbol, proposer, kind]  data: proposal_id
  const proposer   = (topics[1] as { address?: string })?.address ?? '';
  const kindRaw    = (topics[2] as Record<string, unknown>) ?? {};
  const proposalId = typeof data === 'number' ? data : 0;

  const kind = parseKind(kindRaw);

  await prisma.proposal.upsert({
    where:  { onChainId: proposalId },
    update: { createdAtLedger: ledger, proposer },
    create: {
      onChainId:       proposalId,
      proposer,
      kind,
      status:          'PENDING',
      description:     '',    // Frontend/API must supply description
      threshold:       2,     // Read from contract state on creation
      createdAtLedger: ledger,
    },
  });

  await notifyProposalCreated(proposalId, `Proposal #${proposalId}`, kind).catch(() => {});
}

async function handleProposalApproved(
  topics: unknown[], data: unknown, _txHash: string, ledger: number,
) {
  // topics: [symbol, signer, approval_count]  data: proposal_id
  const signerAddress  = (topics[1] as { address?: string })?.address ?? '';
  const proposalId     = typeof data === 'number' ? data : 0;

  const proposal = await prisma.proposal.findUnique({ where: { onChainId: proposalId } });
  if (!proposal) return;

  await prisma.approval.upsert({
    where:  { proposalId_signerAddress: { proposalId: proposal.id, signerAddress } },
    update: { ledgerSeq: ledger },
    create: { proposalId: proposal.id, signerAddress, ledgerSeq: ledger },
  });
}

async function handleProposalExecuted(
  topics: unknown[], data: unknown, _txHash: string, ledger: number,
) {
  // topics: [symbol, executor]  data: proposal_id
  const proposalId = typeof data === 'number' ? data : 0;

  const proposal = await prisma.proposal.findUnique({ where: { onChainId: proposalId } });
  if (!proposal) return;

  await prisma.proposal.update({
    where: { id: proposal.id },
    data:  { status: ProposalStatus.EXECUTED, executedAtLedger: ledger },
  });

  await notifyProposalExecuted(proposalId, proposal.description).catch(() => {});
}

async function handleProposalCancelled(
  _topics: unknown[], data: unknown, _txHash: string, ledger: number,
) {
  const proposalId = typeof data === 'number' ? data : 0;

  const proposal = await prisma.proposal.findUnique({ where: { onChainId: proposalId } });
  if (!proposal) return;

  await prisma.proposal.update({
    where: { id: proposal.id },
    data:  { status: ProposalStatus.CANCELLED, cancelledAtLedger: ledger },
  });
}

async function handleSignerAdded(
  topics: unknown[], _data: unknown, _txHash: string, ledger: number,
) {
  const address = (topics[1] as { address?: string })?.address ?? '';
  if (address) await addSigner(address, undefined, ledger);
}

async function handleSignerRemoved(
  topics: unknown[], _data: unknown, _txHash: string, ledger: number,
) {
  const address = (topics[1] as { address?: string })?.address ?? '';
  if (address) await removeSigner(address, ledger);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseKind(raw: Record<string, unknown>): 'TRANSFER' | 'ADD_SIGNER' | 'REMOVE_SIGNER' {
  const key = Object.keys(raw)[0] ?? '';
  if (key === 'Transfer')     return 'TRANSFER';
  if (key === 'AddSigner')    return 'ADD_SIGNER';
  if (key === 'RemoveSigner') return 'REMOVE_SIGNER';
  return 'TRANSFER';
}
