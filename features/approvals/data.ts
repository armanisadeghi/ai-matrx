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

import { readAllRows } from "@ai-matrx/data/db";
import {
  decideAssist,
  emitAssist,
  getAssistById,
  queryAssists,
} from "@/features/assists/service";
import {
  narrowAction,
  type Assist,
  type AssistAction,
} from "@/features/assists/types";
import { createClient } from "@/utils/supabase/client";
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
 * THE ASSIST ACTION KINDS THIS QUEUE'S REGISTERED KINDS READ.
 *
 * Every kind in `./registry.ts` reads rows of exactly one of these two shapes:
 * the seven platform/Google kinds read `approval_proposal` (this module), and
 * the three keyword kinds read `apply_keyword_meaning` (`./kinds/seo/*`, whose
 * rows are keyed on the record rather than on this surface).
 *
 * It exists so a read BY ID can say "that id is not an approval-queue row at
 * all" instead of reporting any pending assist of the viewer's as a proposal
 * waiting beyond page one — which is what `?item=<a keyword-meaning chip's id>`
 * used to be told (Bugbot MEDIUM, frontend PR 228). A kind added with a third
 * action shape adds it here; the census guard in
 * `__tests__/proposal-reads.test.ts` scans every module under `features/approvals`
 * for `action.kind === "…"` comparisons and fails until it does.
 */
export const APPROVAL_ASSIST_ACTION_KINDS: readonly AssistAction["kind"][] = [
  "approval_proposal",
  "apply_keyword_meaning",
];

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
 * WHAT THE STORE SAYS ABOUT ONE PROPOSAL, by id — the read behind a deep link
 * that landed on a row the queue is not showing.
 *
 * `listPendingProposals` reads ONE page per kind, so a row's absence from the
 * list is not evidence it was decided: it may be row 51, or it may belong to a
 * kind whose rows are keyed on the record rather than on an assist (the SEO
 * kinds). This read answers only what it can prove — `unknown` is a real
 * answer here, and the surface says so rather than inventing a verdict
 * (Bugbot MEDIUM #2, 2026-09-17).
 */
export type ApprovalProposalStatus =
  | "pending"
  | "decided"
  /** The id names an assist, but not one any approval kind can show. */
  | "not_a_proposal"
  | "unknown";

export async function readProposalStatus(
  userId: string | null | undefined,
  proposalId: string,
): Promise<ApprovalProposalStatus> {
  if (!userId || !proposalId) return "unknown";
  try {
    const assist = await getAssistById(userId, proposalId);
    if (!assist) return "unknown";
    // An id that names one of this person's OTHER assists is not an approval
    // item, and calling it one would send the reader hunting through a queue it
    // was never in.
    if (!APPROVAL_ASSIST_ACTION_KINDS.includes(assist.action.kind)) {
      return "not_a_proposal";
    }
    return assist.status === "pending" ? "pending" : "decided";
  } catch (error) {
    // Loud for developers, honest on screen: the caller reports "unconfirmed".
    console.warn(
      `[approvals] could not read proposal ${proposalId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return "unknown";
  }
}

/**
 * HOW MANY PROPOSALS ARE WAITING ON THIS PERSON — the shell badge's count.
 *
 * 🚨 IT RUNS THE SAME NARROWING THE QUEUE DOES. A head-only `count` in SQL
 * counted every pending row on this surface, including rows whose `action` this
 * build cannot read — so the badge could say "3 waiting" over a screen showing
 * nothing, which is the badge lying about work nobody can see (Bugbot HIGH,
 * frontend PR 228). It therefore reads `id, action` (two small columns, no
 * payloads on the wire) through `readAllRows` — a count treated as complete is
 * never a bare `.select()` — and counts the rows that narrow.
 *
 * A row that does NOT narrow is loud in the console rather than counted: the
 * badge agrees with the screen, and the defect is a developer's to fix.
 */
export async function countPendingProposals(userId: string): Promise<number> {
  const supabase = createClient();
  const rows = await readAllRows<{ id: string; action: Json }>(
    ({ from, to }) =>
      supabase
        .schema("platform")
        .from("assists")
        .select("id, action", { count: "exact" })
        .eq("user_id", userId)
        .eq("surface_name", APPROVAL_SURFACE)
        .eq("status", "pending")
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to),
    { label: "platform.assists pending approvals" },
  );
  let count = 0;
  for (const row of rows) {
    const action = narrowAction(row.action);
    if (action && APPROVAL_ASSIST_ACTION_KINDS.includes(action.kind)) {
      count += 1;
      continue;
    }
    console.warn(
      `[approvals] pending row ${row.id} is on the approval surface but its action does not narrow to a proposal this build can show — not counted`,
    );
  }
  return count;
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
