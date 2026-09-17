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
  getAssistById,
  queryAssists,
} from "@/features/assists/service";
import { type Assist, type AssistAction } from "@/features/assists/types";
import { createClient } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";
import { readApprovalReceipt } from "./receipt";
import {
  ROW_FAMILY_ACTION_KIND,
  warnNotRendered,
  willRenderAction,
  willRenderRow,
} from "./rendered";
import type { ApprovalKind, ApprovalScope, AutonomyMode } from "./types";

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
export const APPROVAL_ASSIST_ACTION_KINDS: readonly AssistAction["kind"][] =
  Object.values(ROW_FAMILY_ACTION_KIND);

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
  /**
   * WHERE the asking queue stands — handed to the same predicate the badge and
   * the deep link ask, so a page cannot include a row the mount would refuse.
   */
  scope: ApprovalScope,
): Promise<ApprovalProposalPage> {
  // The kind doing the asking is, by construction, registered and mounted — so
  // the predicate below judges this page against exactly it. A bare `{ id }` is
  // enough BECAUSE every caller reads the `approval_proposal` family, whose one
  // recogniser is "the kind's id IS the row's proposalKind"; a kind reading
  // another family declares `rendersRow` and reads its own store, not this page.
  const kindsHere: ApprovalKind[] = [{ id: proposalKind } as ApprovalKind];
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
  /**
   * 🚨 THE TOTAL IS WHAT WILL RENDER, NOT WHAT THE SERVER COUNTED. `queryAssists`
   * returns the raw `count` (every matching row) alongside rows its narrowing
   * already dropped, so a section header built on it printed "3" over two
   * visible rows and said nothing — while the badge, which re-narrowed, said 2
   * (round-2 verification § A-ii). One predicate decides, here, and a row it
   * refuses is loud once rather than folded into a number.
   */
  const proposals: ApprovalProposal[] = [];
  let dropped = page.unreadable;
  for (const assist of page.rows) {
    const verdict = willRenderAction(assist.action, {
      kinds: kindsHere,
      scope,
    });
    const narrowed = verdict.renders ? narrow(assist) : null;
    if (narrowed && narrowed.proposalKind === proposalKind) {
      proposals.push(narrowed);
      continue;
    }
    dropped += 1;
    if (!verdict.renders) {
      warnNotRendered(assist.id, verdict, `the ${proposalKind} section`);
    }
  }
  return {
    proposals,
    total: Math.max(page.total - dropped, proposals.length),
  };
}

/**
 * WHAT THE STORE SAYS ABOUT ONE PROPOSAL, by id — the read behind a deep link
 * that landed on a row the queue is not showing.
 *
 * `listPendingProposals` reads ONE page per kind, so a row's absence from the
 * list is not evidence it was decided: it may be row 51, it may belong to a kind
 * this mount does not carry, or its approve may have FAILED after the claim.
 * This read answers only what it can prove — `unknown` is a real answer here,
 * and the surface says so rather than inventing a verdict (Bugbot MEDIUM #2,
 * 2026-09-17; round-2 verification § A-iii; Bugbot round 9 #9).
 *
 * 🚨 IT ASKS THE SAME PREDICATE THE BADGE AND THE LIST ASK (`./rendered.ts`),
 * and it reads the RECEIPT before the status (`./receipt.ts`).
 */
export type ApprovalProposalStatus =
  /** Waiting, and a kind mounted on this queue renders it. */
  | "pending"
  /**
   * Waiting, real, and NOT in this list — some registered kind renders it on a
   * mount this one is not (the keyword kinds need a site). Answered with the
   * door to where it lives; saying "past the first page of this list" about it
   * sent the reader hunting through a list it was never in (Bugbot round 9 #9).
   */
  | "not_in_this_list"
  /** Waiting, and NO registered kind can show it — a producer ran ahead. */
  | "no_screen"
  | "decided"
  /**
   * The person approved it and the change was NOT made (`receipt.state` is
   * `failed`). Never "decided": nobody had been told the change did not happen
   * (round-2 verification § A-iii).
   */
  | "apply_failed"
  /** An approve is in flight right now (`receipt.state` is `applying`). */
  | "applying"
  /** The id names an assist, but not one any approval kind reads. */
  | "not_a_proposal"
  | "unknown";

export interface ApprovalProposalRead {
  status: ApprovalProposalStatus;
  /** `not_in_this_list`: one sentence saying why it is not here. */
  explain?: string;
  /** `not_in_this_list`: the door to where it IS (THE DOOR LAW). */
  where?: { label: string; href: string };
  /** `apply_failed`: the server's refusal, verbatim. */
  error?: string | null;
}

/**
 * Everything the read needs to judge one row for ONE MOUNT. An options object,
 * not four positional arguments, because the mount's SCOPE joined the question
 * on 2026-09-17 and a caller that silently dropped it answered for the wrong
 * site (Bugbot round 10, finding 1).
 */
export interface ProposalStatusQuestion {
  userId: string | null | undefined;
  proposalId: string;
  /**
   * The kinds the asking queue actually mounted (`mountedApprovalKinds`), THE
   * registry, and WHERE the queue stands. The same predicate the badge and the
   * list use decides whether this row would be on screen — a third rule here is
   * how the three numbers came to disagree in the first place.
   */
  mounted: readonly ApprovalKind[];
  allKinds?: readonly ApprovalKind[];
  scope: ApprovalScope;
}

export async function readProposalStatus({
  userId,
  proposalId,
  mounted,
  allKinds = mounted,
  scope,
}: ProposalStatusQuestion): Promise<ApprovalProposalRead> {
  if (!userId || !proposalId) return { status: "unknown" };
  try {
    const assist = await getAssistById(userId, proposalId);
    if (!assist) return { status: "unknown" };
    // An id that names one of this person's OTHER assists is not an approval
    // item, and calling it one would send the reader hunting through a queue it
    // was never in.
    if (!APPROVAL_ASSIST_ACTION_KINDS.includes(assist.action.kind)) {
      return { status: "not_a_proposal" };
    }
    // 🚨 THE RECEIPT OUTRANKS THE STATUS. A claimed apply that FAILED left the
    // row non-pending with a `failed` receipt, and "decided" over that is the
    // screen telling the next reader the change was made (§ A-iii).
    const receipt = readApprovalReceipt(assist.result);
    if (receipt.state === "failed") {
      return { status: "apply_failed", error: receipt.error };
    }
    if (receipt.state === "applying") return { status: "applying" };
    if (assist.status !== "pending") return { status: "decided" };

    const verdict = willRenderAction(assist.action, {
      kinds: mounted,
      scope,
      allKinds,
    });
    if (verdict.renders) return { status: "pending" };
    if (verdict.elsewhere) {
      return {
        status: "not_in_this_list",
        explain: verdict.elsewhere.explain,
        where: verdict.elsewhere.where,
      };
    }
    warnNotRendered(assist.id, verdict, "the deep-link read");
    return { status: "no_screen" };
  } catch (error) {
    // Loud for developers, honest on screen: the caller reports "unconfirmed".
    console.warn(
      `[approvals] could not read proposal ${proposalId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return { status: "unknown" };
  }
}

/**
 * HOW MANY PROPOSALS ARE WAITING ON THIS PERSON — the shell badge's count.
 *
 * 🚨 IT ASKS THE ONE "WILL THIS ROW RENDER" PREDICATE (`./rendered.ts`). A
 * head-only `count` in SQL counted every pending row on this surface (Bugbot
 * HIGH, frontend PR 228); narrowing the ACTION alone then still counted a row
 * whose `proposalKind` NO REGISTERED KIND RENDERS, so "1 waiting" could sit over
 * an empty screen for a second reason (round-2 verification § A-i). Action
 * narrowing and kind registration are one question and are asked once.
 *
 * It reads `id, action` (two small columns, no payloads on the wire) through
 * `readAllRows` — a count treated as complete is never a bare `.select()`.
 *
 * A row the predicate refuses is loud in the console rather than counted: the
 * badge agrees with the screen, and the defect is a developer's to fix.
 */
export async function countPendingProposals(
  userId: string,
  /**
   * The kinds the queue this badge stands for actually mounts
   * (`mountedApprovalKinds(APPROVAL_KINDS, personScope)`). Passing them is what
   * makes the badge and the screen the same number.
   */
  mounted: readonly ApprovalKind[],
  /**
   * WHERE that queue stands. The badge counts what THAT mount would show, and a
   * row belonging to another site is not one of them (Bugbot round 10 #1).
   */
  scope: ApprovalScope,
): Promise<number> {
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
    const verdict = willRenderRow(row.action, { kinds: mounted, scope });
    if (verdict.renders) {
      count += 1;
      continue;
    }
    warnNotRendered(row.id, verdict, "the approvals badge");
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
 * 🚨 THERE IS NO CLIENT-SIDE PRODUCER, BY RULING (round-2 verification
 * § A-viii, 2026-09-17). `proposeApproval` lived here with zero callers and
 * would have written a row nobody could ever decide: it carries no
 * `metadata.google_workspace`, and BOTH server doors call `_execution_record`
 * first — including `reject_google_approval` — which refuses such a row with
 * 403 "This approval was not created by the Google Workspace producer… Approve
 * it where it was proposed." For every registered Google kind the queue IS
 * where it was proposed, so the row could be neither approved nor rejected and
 * would never leave the list. It was deleted rather than documented (no
 * legacy).
 *
 * THE ONE PRODUCER IS THE SERVER: `aidream/services/google_workspace/approvals.py`,
 * which stores the exact action and arguments the approve door re-runs. A lane
 * that needs a new proposal kind adds it THERE and registers the renderer here.
 */
