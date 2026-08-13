"use client";

/**
 * emitAssistTracked — `emitAssist` plus the local dock update, in one call.
 *
 * Every deterministic CLIENT-side producer wants both halves: write (or
 * refresh) the ledger row, then mirror it into Redux so the dock and any
 * surface strip update without a refetch. Lives beside the slice (not in
 * service.ts) because service.ts must not import the slice — the slice
 * already imports the service.
 */

import type { AppDispatch } from "@/lib/redux/store";
import type { Json } from "@/types/database.types";
import { emitAssist } from "../service";
import { toAssist, type EmitAssistInput } from "../types";
import { assistEmitted } from "./assistsSlice";

export async function emitAssistTracked(
  userId: string,
  input: EmitAssistInput,
  dispatch: AppDispatch,
): Promise<string | null> {
  const id = await emitAssist(userId, input);
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
    action: input.action as unknown as Json,
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
    organization_id: null,
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
