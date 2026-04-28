// src/services/notification.service.ts
// feat(notifications): email notification system for pending approvals

import nodemailer from 'nodemailer';
import { prisma }  from '../config/database';
import { env }     from '../config/env';
import { logger }  from '../config/logger';

// ── Mailer setup ──────────────────────────────────────────────────────────────

function createTransport() {
  if (!env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host:   env.SMTP_HOST,
    port:   env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
      : undefined,
  });
}

const transporter = createTransport();

// ── Send a single email ───────────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!transporter || !env.NOTIFY_FROM) {
    logger.debug({ to, subject }, 'Email skipped — SMTP not configured');
    return false;
  }
  try {
    await transporter.sendMail({ from: env.NOTIFY_FROM, to, subject, html });
    logger.info({ to, subject }, 'Email sent');
    return true;
  } catch (err) {
    logger.error({ err, to, subject }, 'Email failed');
    return false;
  }
}

// ── Notification templates ────────────────────────────────────────────────────

function proposalCreatedHtml(proposalId: number, description: string, kind: string): string {
  return `
    <div style="font-family:monospace;background:#0d1117;color:#c8d8e8;padding:24px;border:1px solid #1c2a38">
      <h2 style="color:#00d4ff;margin:0 0 16px">⬡ New DAO Proposal #${proposalId}</h2>
      <p><strong>Type:</strong> ${kind}</p>
      <p><strong>Description:</strong> ${description}</p>
      <p style="color:#6b8299;font-size:12px">Log in to the DAO dashboard to review and approve.</p>
    </div>
  `;
}

function approvalNeededHtml(proposalId: number, current: number, threshold: number): string {
  return `
    <div style="font-family:monospace;background:#0d1117;color:#c8d8e8;padding:24px;border:1px solid #1c2a38">
      <h2 style="color:#f59e0b;margin:0 0 16px">⏳ Approval Needed — Proposal #${proposalId}</h2>
      <p>This proposal has <strong>${current}/${threshold}</strong> approvals. Your signature is required.</p>
      <p style="color:#6b8299;font-size:12px">Log in to the DAO dashboard to approve.</p>
    </div>
  `;
}

function proposalExecutedHtml(proposalId: number, description: string): string {
  return `
    <div style="font-family:monospace;background:#0d1117;color:#c8d8e8;padding:24px;border:1px solid #1c2a38">
      <h2 style="color:#84cc16;margin:0 0 16px">✓ Proposal #${proposalId} Executed</h2>
      <p><strong>Description:</strong> ${description}</p>
      <p style="color:#6b8299;font-size:12px">This proposal reached threshold and was executed on-chain.</p>
    </div>
  `;
}

// ── Public notification dispatch ──────────────────────────────────────────────

export async function notifyProposalCreated(
  proposalId: number,
  description: string,
  kind: string,
): Promise<void> {
  const recipients = env.NOTIFY_TO?.split(',').map(e => e.trim()).filter(Boolean) ?? [];
  for (const to of recipients) {
    const notif = await prisma.notification.create({
      data: {
        type:      'proposal_created',
        recipient: to,
        payload:   { proposalId, description, kind },
      },
    });
    const ok = await sendEmail(
      to,
      `[DAO] New Proposal #${proposalId}`,
      proposalCreatedHtml(proposalId, description, kind),
    );
    await prisma.notification.update({
      where: { id: notif.id },
      data:  { sent: ok, sentAt: ok ? new Date() : null, error: ok ? null : 'Send failed' },
    });
  }
}

export async function notifyApprovalNeeded(
  proposalId: number,
  current: number,
  threshold: number,
  signerEmails: string[],
): Promise<void> {
  for (const to of signerEmails) {
    const notif = await prisma.notification.create({
      data: {
        type:      'approval_needed',
        recipient: to,
        payload:   { proposalId, current, threshold },
      },
    });
    const ok = await sendEmail(
      to,
      `[DAO] Approval Required — Proposal #${proposalId}`,
      approvalNeededHtml(proposalId, current, threshold),
    );
    await prisma.notification.update({
      where: { id: notif.id },
      data:  { sent: ok, sentAt: ok ? new Date() : null, error: ok ? null : 'Send failed' },
    });
  }
}

export async function notifyProposalExecuted(
  proposalId: number,
  description: string,
): Promise<void> {
  const recipients = env.NOTIFY_TO?.split(',').map(e => e.trim()).filter(Boolean) ?? [];
  for (const to of recipients) {
    const notif = await prisma.notification.create({
      data: {
        type:      'proposal_executed',
        recipient: to,
        payload:   { proposalId, description },
      },
    });
    const ok = await sendEmail(
      to,
      `[DAO] Proposal #${proposalId} Executed`,
      proposalExecutedHtml(proposalId, description),
    );
    await prisma.notification.update({
      where: { id: notif.id },
      data:  { sent: ok, sentAt: ok ? new Date() : null, error: ok ? null : 'Send failed' },
    });
  }
}

// ── Retry unsent notifications (called by cron) ───────────────────────────────

export async function retryFailedNotifications(): Promise<void> {
  const failed = await prisma.notification.findMany({
    where:   { sent: false },
    take:    50,
    orderBy: { createdAt: 'asc' },
  });

  for (const n of failed) {
    const payload = n.payload as Record<string, unknown>;
    let subject = '[DAO] Notification';
    let html    = '<p>DAO notification</p>';

    if (n.type === 'proposal_created') {
      subject = `[DAO] New Proposal #${payload.proposalId}`;
      html    = proposalCreatedHtml(
        payload.proposalId as number,
        payload.description as string,
        payload.kind as string,
      );
    } else if (n.type === 'approval_needed') {
      subject = `[DAO] Approval Required — Proposal #${payload.proposalId}`;
      html    = approvalNeededHtml(
        payload.proposalId as number,
        payload.current    as number,
        payload.threshold  as number,
      );
    } else if (n.type === 'proposal_executed') {
      subject = `[DAO] Proposal #${payload.proposalId} Executed`;
      html    = proposalExecutedHtml(
        payload.proposalId  as number,
        payload.description as string,
      );
    }

    const ok = await sendEmail(n.recipient, subject, html);
    await prisma.notification.update({
      where: { id: n.id },
      data:  { sent: ok, sentAt: ok ? new Date() : null, error: ok ? null : 'Retry failed' },
    });
  }

  if (failed.length > 0) {
    logger.info({ retried: failed.length }, 'Notification retry complete');
  }
}
