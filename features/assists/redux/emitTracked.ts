"use client";

/**
 * emitAssistTracked — `emitAssist` plus the local dock update, in one call.
 *
 * Every deterministic CLIENT-side producer wants both halves: write (or
 * refresh) the ledger row, then mirror it into Redux so the dock and any
 * surface strip update without a refetch. Lives beside the slice (not in
 * service.ts) because service.ts must not import the slice — the slice
 * already imports the service.
 *
 * 🚨 **This is also the client-side QUIET GATE, and it is the reason quiet is
 * not just a CSS class.** While the user has assists quiet, no client producer
 * writes a row and no agent is launched to think one up — a suggestion nobody
 * will read costs real money to compute, and a mute that only hides the chip
 * keeps spending it. Producers do not each remember to check: they cannot
 * emit without coming through here.
 */

import { getStore, type AppDispatch } from "@/lib/redux/store";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { isQuiet } from "../quiet";
import type { Json } from "@/types/database.types";
import { emitAssist } from "../service";
import { toAssist, type EmitAssistInput } from "../types";
import { assistEmitted } from "./assistsSlice";

export async function emitAssistTracked(
  userId: string,
  input: EmitAssistInput,
  dispatch: AppDispatch,
): Promise<string | null> {
  // `getStore()` is null before the store singleton is created; a producer
  // that early cannot be answering a mute the user has not been able to set.
  const state = getStore()?.getState();
  const quietUntil = state?.userPreferences.assists?.quietUntil ?? null;
  if (isQuiet(quietUntil)) return null;

  // 🚨 NO NULL ORG (owner ruling 2026-08-21, db-rules §2). This chokepoint is
  // where the owning org enters, for the same reason the quiet gate lives here:
  // nine producers call this and none of them should have to remember.
  //
  // `selectOrganizationId` — the org the user EXPLICITLY chose — not
  // `selectEffectiveOrganizationId`, whose own docstring says it is legacy and
  // that "new writes must use selectOrganizationId ... and fail closed when
  // neither exists". §2 says the same thing in stronger words: "No
  // active/preferred/personal/first-org fallback is legal at write time."
  // So with no explicit org we emit NOTHING. An assist is a nudge; skipping one
  // costs the user a suggestion, while guessing its scope puts a row in an org
  // it does not belong to — and a wrongly-scoped row is visible to the wrong
  // people, which is not a cosmetic defect.
  const organizationId = state ? selectOrganizationId(state) : null;
  if (!organizationId) return null;

  const id = await emitAssist(userId, input, organizationId);
  if (!id) return null;
  const now = new Date().toISOString();
  const assist = toAssist({
    // Local mirror of the row we just wrote — enough for the dock.
    id,
    user_id: userId,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    surface_name: input.surfaceName ?? null,
    source_kind: input.sourceKind ?? "deterministic",
    source_key: input.sourceKey,
    title: input.title,
    body: input.body ?? null,
    reasoning: input.reasoning ?? null,
    confidence: input.confidence ?? null,
    action: input.action,
    status: "pending",
    metadata: {},
    decided_at: null,
    decided_by: null,
    decision_note: null,
    evidence: (input.evidence ?? null) as Json,
    first_seen_at: now,
    is_starred: false,
    occurrences: 1,
    resolved_at: null,
    viewed_at: null,
    result: null,
    dedupe_key: input.dedupeKey,
    expires_at: input.expiresAt ?? null,
    suppressed_until: null,
    priority: input.priority ?? 0,
    organization_id: organizationId,
    created_by: userId,
    updated_by: null,
    created_at: now,
    updated_at: now,
    version: 1,
    visibility: "personal",
    deleted_at: null,
  });
  if (assist) dispatch(assistEmitted(assist));
  return id;
}
