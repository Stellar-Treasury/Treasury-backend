// prisma/seed.ts
// chore(db): seed database with initial DAO configuration

import { PrismaClient, ProposalKind, ProposalStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Upsert indexer cursor
  await prisma.indexerCursor.upsert({
    where:  { id: 'singleton' },
    update: {},
    create: { id: 'singleton', lastLedgerSeq: 0 },
  });

  // Initial signers
  const signers = [
    { address: 'GABC1234STELLARTEST0000001AAAAAAAAAAAAAAAAAAAAAAAAAAAA', label: 'Core Team A', addedAtLedger: 1000 },
    { address: 'GDEF5678STELLARTEST0000002BBBBBBBBBBBBBBBBBBBBBBBBBBBB', label: 'Core Team B', addedAtLedger: 1000 },
    { address: 'GHIJ9012STELLARTEST0000003CCCCCCCCCCCCCCCCCCCCCCCCCCCC', label: 'Treasurer',   addedAtLedger: 1000 },
  ];

  for (const s of signers) {
    await prisma.signer.upsert({
      where:  { address: s.address },
      update: {},
      create: s,
    });
  }
  console.log(`  ✔ ${signers.length} signers upserted`);

  // Initial treasury snapshot
  await prisma.treasurySnapshot.create({
    data: {
      xlmBalance:  142500.75,
      usdcBalance: 28340.00,
      totalUsd:    56825.30,
      ledgerSeq:   1000,
    },
  });
  console.log('  ✔ Treasury snapshot created');

  // Sample proposals
  const proposals = [
    {
      onChainId:      1,
      proposer:       'GABC1234STELLARTEST0000001AAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      kind:           ProposalKind.TRANSFER,
      status:         ProposalStatus.EXECUTED,
      description:    'Q3 developer grant — Soroban SDK contributions',
      threshold:      2,
      createdAtLedger: 1080,
      executedAtLedger: 1092,
      recipient:      'GXYZ0001DEVGRANTRECIPIENT000000AAAAAAAAAAAAAAAAAAAAAAAA',
      amount:         5000,
    },
    {
      onChainId:      2,
      proposer:       'GDEF5678STELLARTEST0000002BBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      kind:           ProposalKind.TRANSFER,
      status:         ProposalStatus.PENDING,
      description:    'Security audit — Trail of Bits invoice #TB-2024-0042',
      threshold:      2,
      createdAtLedger: 1102,
      recipient:      'GXYZ0002AUDITFIRMRECIPIENT00000BBBBBBBBBBBBBBBBBBBBBBB',
      amount:         12000,
    },
  ];

  for (const p of proposals) {
    await prisma.proposal.upsert({
      where:  { onChainId: p.onChainId },
      update: {},
      create: p,
    });
  }
  console.log(`  ✔ ${proposals.length} proposals upserted`);

  console.log('✅ Seed complete');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
