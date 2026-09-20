"use client";

/**
 * THE ONE DOOR a queued CMS content exception is decided through.
 *
 *   POST /cms/exceptions/{id}/approve
 *   POST /cms/exceptions/{id}/reject
 *
 * 🚨 WHY NOT A CLIENT-SIDE WRITE — and this kind is the sharpest case of the
 * rule. Until 2026-09-19 the CMS had its own review screen whose Approve wrote
 * `status` / `reviewed_by` / `reviewed_at` straight into the CMS database from
 * a Next.js route with the CMS secret key. That is a second writer of a
 * STANDING SAFETY POLICY: an approved exception is not a one-time pass, it is a
 * rule eight CMS write paths consult on every future validation
 * (`aidream/services/cms/exceptions_store.py` → `approved_exceptions`). The
 * server door is atomic instead — it claims the proposal row `pending →
 * accepted` in ONE update, replays the ordinary human write path
 * (`set_exception_status`) and stores the receipt — so a second Approve writes
 * nothing and returns the first call's receipt (`applied_now: false`).
 *
 * So this kind never calls `recordApprovalDecision`: the door already recorded
 * it, with evidence. Recording it again here would overwrite a real receipt
 * with a guess.
 *
 * 🚨 THE EXCEPTION ID IS WHAT TRAVELS, not the assist id. The exception row is
 * the identity on both sides of the database boundary — the server finds its
 * proposal by `dedupe_key = cms_exception:<id>` — and nothing else is passed:
 * the change is whatever the reviewed row already holds, so a browser can never
 * approve something other than what the reader was shown.
 *
 * Transport: the canonical `BackendClient`. `sendScopeInBody` is FALSE because
 * both endpoints' request models declare `extra="forbid"`; the organization
 * still rides the `X-Organization-Id` header, which is what the server's
 * admission gate reads.
 */

import { BackendClient } from "@/lib/api/backend-client";
import { AIDREAM_PRODUCTION_URL, ENDPOINTS } from "@/lib/api/endpoints";
import { createClient } from "@/utils/supabase/client";
import type { ApprovalDecisionReply } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The response, checked rather than cast. A shape we do not recognise is a
 * refusal with a remedy, never a silent success: the policy may or may not have
 * changed, and saying "approved" over an unreadable answer is the screen lying.
 */
function decision(body: unknown): ApprovalDecisionReply {
  if (!isRecord(body)) {
    throw new Error(
      "The approval service returned something this screen could not read, so it cannot say whether the exception was decided. Reload the queue to see where this request stands.",
    );
  }
  const {
    approval_id: approvalId,
    status,
    applied_now: appliedNow,
    sentence,
  } = body;
  if (
    typeof approvalId !== "string" ||
    typeof status !== "string" ||
    typeof appliedNow !== "boolean"
  ) {
    throw new Error(
      "The approval service answered in a shape this screen does not recognise, so it cannot say whether the exception was decided. Reload the queue to see where this request stands.",
    );
  }
  return {
    approval_id: approvalId,
    status,
    applied_now: appliedNow,
    receipt: isRecord(body.receipt) ? body.receipt : {},
    // The SERVER'S own sentence, carried through — the queue renders it rather
    // than inferring "what happened" from a status enum (`./receipt.ts`).
    sentence:
      typeof sentence === "string" && sentence.trim().length > 0
        ? sentence
        : null,
  };
}

async function callDoor(
  path: string,
  body: Record<string, unknown>,
  organizationId: string | null | undefined,
  fallback: string,
): Promise<ApprovalDecisionReply> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Sign in to decide content exceptions.");
  }
  const client = new BackendClient({
    baseUrl: AIDREAM_PRODUCTION_URL,
    auth: { type: "token", token: session.access_token },
    scope: { organization_id: organizationId ?? undefined },
    sendScopeInBody: false,
  });
  try {
    return decision(await client.postJson(path, body));
  } catch (error) {
    // The server's own refusal (403 with the reason, 400 with the remedy) is
    // what a person needs; only a bare transport failure gets the fallback.
    const message = error instanceof Error ? error.message : String(error);
    throw message && message !== "Failed to fetch"
      ? error
      : new Error(fallback, { cause: error });
  }
}

/**
 * Allow the blocked content this exception names, from now on, in its scope —
 * exactly once. The exception id IS the idempotency key, on the server.
 */
export async function approveCmsException(
  exceptionId: string,
  organizationId: string | null | undefined,
): Promise<ApprovalDecisionReply> {
  return callDoor(
    ENDPOINTS.cms.approveException(exceptionId),
    {},
    organizationId,
    "The exception could not be approved, so nothing changed and it is still waiting on you.",
  );
}

/** Turn the request down, with the reason kept on the record. */
export async function rejectCmsException(
  exceptionId: string,
  organizationId: string | null | undefined,
  reason: string | null,
): Promise<ApprovalDecisionReply> {
  return callDoor(
    ENDPOINTS.cms.rejectException(exceptionId),
    reason ? { reason } : {},
    organizationId,
    "This request could not be recorded as rejected, so it is still waiting on you.",
  );
}
