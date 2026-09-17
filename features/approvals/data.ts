"use client";

/**
 * THE STORE SEAM — the only module in `features/approvals/` that names where a
 * proposal lives.
 *
 * The store is `platform.assists` (chair ruling, 2026-09-17): the store the SEO
 * value-system queue already used, reached through the assists service, because
 * one approval surface with two stores underneath it is two queues wearing one
 * costume. Cross-repo SoR: common-docs `/systems/platform/assists/FEATURE.md`.
 *
 * A platform proposal is an assist whose `action.kind` is `approval_proposal`
 * (`features/assists/types.ts`), addressed to the OPERATOR — the person whose
 * authority the agent ran under — on the surface below. Reads use the COMPLETE
 * manager query (`queryAssists`), never the presentation-throttled chip read:
 * on 2026-09-14 the chip read returned 0 of one user's 214 pending assists, so
 * a queue built on it hid the very work it exists to show.
 *
 * 🚨 This module decides nothing. `decideAssist` records the person's decision
 * AFTER the kind has replayed the ordinary human write path, so a row never
 * says "approved" for a change that did not happen.
 */

import {
  decideAssist,
  emitAssist,
  queryAssists,
} from "@/features/assists/service";
import type { Assist, AssistAction } from "@/features/assists/types";
import type { Json } from "@/types/database.types";
import type { AutonomyMode } from "./types";

/**
 * The surface every platform approval proposal is addressed to. It is the
 * queue's address, not a page's: `features/approvals/` is the only reader, and
 * the assist chip strips on other surfaces therefore never show these rows
 * (their reviewer is not on screen there).
 */
export const APPROVAL_SURFACE = "matrx-user/approval-queue";

/** One page of proposals is bounded on purpose; the queue shows the total. */
export const APPROVAL_PAGE_SIZE = 50;

/**
 * The source key one kind's rows carry. It is what makes a per-kind read a
 * server-side filter instead of a page the client sifts through.
 */
export function sourceKeyFor(proposalKind: string): string {
  return `approval.${proposalKind}`;
}

/** A proposal as the queue's kinds consume it — the assist, already narrowed. */
export interface ApprovalProposal {
  assist: Assist;
  /** The registry key this row renders through (`gmail_send`, `sheet_write`). */
  proposalKind: string;
  mode: AutonomyMode;
  /** Mode 3 only: when it applies itself. NULL is "no clock", never "soon". */
  autoApplyAt: string | null;
  proposerLabel: string | null;
  proposerAgentId: string | null;
  proposerRunId: string | null;
  operatorUserId: string | null;
  /** The would-be change, verbatim. The kind narrows it; this seam does not. */
  payload: Json;
  /** Present when the addressee cannot perform the change themselves. */
  blocked: { reason: string; whoCan: string } | null;
  /** The subject, as the door registries address it. */
  subject: { token: string; id: string } | null;
}

function narrow(assist: Assist): ApprovalProposal | null {
  const action: AssistAction = assist.action;
  if (action.kind !== "approval_proposal") return null;
  return {
    assist,
    proposalKind: action.proposalKind,
    mode: action.mode,
    // The column is the truth for the clock (it is what a sweep reads); the
    // payload never carries a second copy to disagree with.
    autoApplyAt: assist.autoApplyAt ?? null,
    proposerLabel: action.proposerLabel ?? null,
    proposerAgentId: action.proposerAgentId ?? null,
    proposerRunId: action.proposerRunId ?? null,
    operatorUserId: action.operatorUserId ?? null,
    payload: action.payload,
    blocked: action.blocked ?? null,
    subject:
      assist.entityType && assist.entityId
        ? { token: assist.entityType, id: assist.entityId }
        : null,
  };
}

export interface ApprovalProposalPage {
  proposals: ApprovalProposal[];
  /** The true pending total for this reader and kind, beyond this page. */
  total: number;
}

/**
 * Every pending proposal of ONE kind addressed to this person.
 *
 * `includeSnoozed` is true deliberately: snoozing is a CHIP concept (out of
 * sight in the ambient strip). A person who snoozed a chip has not decided the
 * proposal, and a queue that hid it would be the silent-omission failure.
 */
export async function listPendingProposals(
  userId: string,
  proposalKind: string,
): Promise<ApprovalProposalPage> {
  const page = await queryAssists(userId, {
    statuses: ["pending"],
    // Filtered SERVER-side by this kind's own source key, so `total` is this
    // kind's real pending count and the paging agrees with what is on screen.
    sourceKey: sourceKeyFor(proposalKind),
    sourceKind: null,
    surfaceName: APPROVAL_SURFACE,
    search: "",
    maxConfidence: null,
    minConfidence: null,
    minPriority: null,
    maxPriority: null,
    page: 1,
    pageSize: APPROVAL_PAGE_SIZE,
    sortField: "created_at",
    sortAscending: false,
    includeSnoozed: true,
    starredOnly: false,
    unseenOnly: false,
  });
  const proposals = page.rows
    .map(narrow)
    .filter((proposal): proposal is ApprovalProposal => proposal !== null)
    // Belt and braces: the source key says what it is, the action proves it.
    .filter((proposal) => proposal.proposalKind === proposalKind);
  return { proposals, total: page.total };
}

/**
 * Record the decision — AFTER the kind's own write succeeded (approve) or
 * immediately (reject, which writes nothing else anywhere).
 *
 * `receipt` is what the replayed human path returned (a Gmail message id, the
 * cells Sheets confirmed) so the row proves what actually happened.
 */
export async function recordApprovalDecision(
  assistId: string,
  decision: "approved" | "rejected",
  reason: string | null,
  receipt?: Json,
): Promise<void> {
  await decideAssist(
    assistId,
    decision === "approved" ? "accepted" : "dismissed",
    receipt ?? null,
    reason ?? undefined,
  );
}

/**
 * Write a proposal into the queue from a client-side path (an attended flow
 * that resolved to a reviewing mode). Server-side producers write the same
 * shape from aidream.
 *
 * Returns the row id, or null when the write was refused — and the refusal is
 * already loud in the console via the assists service. A caller that gets null
 * must NOT perform the change it was proposing.
 */
export async function proposeApproval(input: {
  /** The operator: whose authority the agent ran under. THE addressee. */
  operatorUserId: string;
  organizationId: string;
  proposalKind: string;
  mode: AutonomyMode;
  /** One line the reader sees in the list. */
  title: string;
  body?: string;
  subject: { token: string; id: string };
  payload: Json;
  proposerLabel?: string;
  proposerAgentId?: string;
  proposerRunId?: string;
  blocked?: { reason: string; whoCan: string };
  /** Stable identity so a re-proposal refreshes instead of duplicating. */
  dedupeKey: string;
}): Promise<string | null> {
  const action: AssistAction = {
    kind: "approval_proposal",
    proposalKind: input.proposalKind,
    mode: input.mode,
    payload: input.payload,
    ...(input.proposerLabel ? { proposerLabel: input.proposerLabel } : {}),
    ...(input.proposerAgentId
      ? { proposerAgentId: input.proposerAgentId }
      : {}),
    ...(input.proposerRunId ? { proposerRunId: input.proposerRunId } : {}),
    operatorUserId: input.operatorUserId,
    ...(input.blocked ? { blocked: input.blocked } : {}),
  };
  return emitAssist(
    input.operatorUserId,
    {
      sourceKind: "agent",
      sourceKey: sourceKeyFor(input.proposalKind),
      surfaceName: APPROVAL_SURFACE,
      title: input.title,
      body: input.body,
      action,
      entityType: input.subject.token,
      entityId: input.subject.id,
      dedupeKey: input.dedupeKey,
      // A human has to decide this — the urgent band (see `urgencyFromPriority`).
      priority: 20,
    },
    input.organizationId,
  );
}
