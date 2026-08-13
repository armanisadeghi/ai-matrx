/**
 * Auto-create draft persistence
 *
 * THE INVARIANT: a paid AI generation is written to the database the moment it
 * returns, BEFORE any step that can fail.
 *
 * Auto-creating an agent app burns two agent runs (metadata ~180s, component
 * code ~300s). Before this service existed both results lived only in local
 * `const`s until a single terminal insert — so a slug throw, an RLS rejection,
 * a network blip, or the user closing the tab destroyed both runs permanently.
 *
 * Now the flow writes an `app.definition` row as soon as the METADATA run
 * resolves, updates it with the generated TSX as soon as the CODE run resolves,
 * and only then finalizes. Every later failure leaves a recoverable draft.
 *
 * Progress lives in `metadata.auto_create.stage` — `status` already means
 * "not published yet" for finished apps and cannot express "generation
 * incomplete", so no new column or table was added.
 */

import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";
import type { AppMetadata } from "../types";

/** Where an auto-create attempt got to. Anything but `complete` is unfinished. */
export type AutoCreateStage =
  | "metadata" // metadata run persisted; code run in flight
  | "code" // generated TSX persisted; finalize pending
  | "complete" // fully assembled app
  | "failed"; // a run failed; whatever was paid for is preserved below

export interface AutoCreateProgress {
  stage: AutoCreateStage;
  mode: string;
  started_at: string;
  updated_at: string;
  /** Failure message when `stage === "failed"`. */
  error?: string;
  /**
   * Raw model output when code extraction failed — the paid run's only
   * remaining artifact, kept so the user can recover the code by hand.
   */
  raw_response?: string;
}

/** Local mirror of the row's `metadata` jsonb, merged into on every write. */
export interface DraftHandle {
  appId: string;
  metadata: Record<string, Json>;
  progress: AutoCreateProgress;
}

function mergeMetadata(
  handle: DraftHandle,
  patch: Partial<AutoCreateProgress>,
): { metadata: Record<string, Json>; progress: AutoCreateProgress } {
  const progress: AutoCreateProgress = {
    ...handle.progress,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  return {
    metadata: { ...handle.metadata, auto_create: progress as unknown as Json },
    progress,
  };
}

export interface CreateDraftInput {
  userId: string;
  agentId: string;
  slug: string;
  metadata: AppMetadata;
  mode: string;
  variableSchema: unknown[];
  allowedImports: unknown;
}

/**
 * Persist the metadata run. Returns a handle to the draft row — every later
 * write in the attempt updates THIS row, so a successful run produces exactly
 * one `app.definition` row.
 */
export async function createGenerationDraft(
  input: CreateDraftInput,
): Promise<DraftHandle> {
  const now = new Date().toISOString();
  const progress: AutoCreateProgress = {
    stage: "metadata",
    mode: input.mode,
    started_at: now,
    updated_at: now,
  };

  // `app.definition.organization_id` is NOT NULL with no DB default — resolve
  // the acting user's personal org the same way every other app-creation path
  // does (POST /api/agent-apps, the duplicate route).
  const { data: personalOrgId, error: orgError } = await supabase.rpc(
    "ensure_personal_organization",
    { p_user_id: input.userId },
  );
  if (orgError || !personalOrgId) {
    throw new Error(
      orgError?.message || "Failed to resolve personal organization",
    );
  }

  const { data, error } = await supabase
    .schema("app")
    .from("definition")
    .insert({
      organization_id: personalOrgId,
      // Canonical RLS std_insert on app.definition requires created_by = auth.uid().
      created_by: input.userId,
      agent_id: input.agentId,
      agent_version_id: null,
      use_latest: true,
      slug: input.slug,
      name: input.metadata.name,
      tagline: input.metadata.tagline,
      description: input.metadata.description,
      category: input.metadata.category,
      tags: input.metadata.tags,
      // Placeholder until the code run resolves — the column is NOT NULL.
      component_code: "",
      component_language: "tsx",
      variable_schema: input.variableSchema as Json,
      allowed_imports: input.allowedImports as Json,
      // The AI generator produces a full custom UI; mark the row so the public
      // renderer dispatches to AgentAppFullyCustomShell instead of a built-in
      // shell (which would ignore the generated code).
      shell_kind: "fully_custom",
      rate_limit_per_ip: 10,
      rate_limit_window_hours: 24,
      status: "draft",
      metadata: { auto_create: progress as unknown as Json },
    })
    .select("id, metadata")
    .single();

  if (error) throw new Error(error.message || "Failed to save app draft");
  if (!data) throw new Error("No data returned from database");

  const row = data as { id: string; metadata: Json | null };
  return {
    appId: row.id,
    metadata:
      row.metadata &&
      typeof row.metadata === "object" &&
      !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, Json>)
        : {},
    progress,
  };
}

/**
 * Remove the placeholder version snapshot the draft insert leaves behind.
 *
 * `app.definition` seeds `app.definition_version` v1 on INSERT
 * (`trg_aga_apps_seed_v1`) and snapshots again on any UPDATE that changes
 * `component_code` (`trg_aga_apps_snapshot_version`). Because the draft row is
 * created BEFORE the code exists, v1 captures `component_code = ''` — a
 * restorable snapshot that would BLANK the user's app from the versions page.
 *
 * So: drop the empty snapshot and renumber the real one to 1, leaving exactly
 * the single, correct version row the pre-draft flow produced. Never throws —
 * a failure here costs a junk row, never the generated code.
 */
async function pruneEmptyCodeSnapshot(appId: string): Promise<void> {
  try {
    const { error: deleteError } = await supabase
      .schema("app")
      .from("definition_version")
      .delete()
      .eq("app_id", appId)
      .eq("component_code", "");
    if (deleteError) {
      console.warn(
        "[autoCreateDraft] Could not prune the empty placeholder version:",
        deleteError,
      );
      return;
    }

    // Renumber only when the real snapshot is now the ONLY row, so this can
    // never disturb an app that already has a genuine version history.
    const { data: remaining, error: readError } = await supabase
      .schema("app")
      .from("definition_version")
      .select("id, version_number")
      .eq("app_id", appId);
    if (readError || !remaining || remaining.length !== 1) return;
    const only = remaining[0] as { id: string; version_number: number };
    if (only.version_number === 1) return;

    await supabase
      .schema("app")
      .from("definition_version")
      .update({ version_number: 1 })
      .eq("id", only.id);
  } catch (error) {
    console.warn("[autoCreateDraft] Version-snapshot prune failed:", error);
  }
}

/**
 * Persist the generated TSX. This is the FIRST thing that happens after the
 * code run resolves — nothing may run between the generation and this write.
 * Retried once, because losing this write loses a 5-minute paid run.
 */
export async function saveDraftCode(
  handle: DraftHandle,
  code: string,
): Promise<DraftHandle> {
  const { metadata, progress } = mergeMetadata(handle, { stage: "code" });

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { error } = await supabase
      .schema("app")
      .from("definition")
      .update({ component_code: code, metadata: metadata as Json })
      .eq("id", handle.appId);

    if (!error) {
      await pruneEmptyCodeSnapshot(handle.appId);
      return { ...handle, metadata, progress };
    }
    lastError = error;
    console.error(
      `[autoCreateDraft] Failed to persist generated code (attempt ${attempt + 1}):`,
      error,
    );
  }

  throw new Error(
    (lastError as { message?: string })?.message ||
      "Failed to save generated code",
  );
}

/** Mark the draft fully assembled. Failure here still leaves the code intact. */
export async function finalizeDraft(handle: DraftHandle): Promise<void> {
  const { metadata } = mergeMetadata(handle, { stage: "complete" });

  const { error } = await supabase
    .schema("app")
    .from("definition")
    .update({ metadata: metadata as Json })
    .eq("id", handle.appId);

  if (error) throw new Error(error.message || "Failed to finalize app");
}

/**
 * Record why an attempt stopped, preserving any raw model output that was paid
 * for. Never throws — it runs inside failure handling and must not mask the
 * original error.
 */
export async function recordDraftFailure(
  handle: DraftHandle,
  failure: { error: string; rawResponse?: string | null },
): Promise<void> {
  const { metadata } = mergeMetadata(handle, {
    stage: "failed",
    error: failure.error,
    ...(failure.rawResponse ? { raw_response: failure.rawResponse } : {}),
  });

  const { error } = await supabase
    .schema("app")
    .from("definition")
    .update({ metadata: metadata as Json })
    .eq("id", handle.appId);

  if (error) {
    console.error("[autoCreateDraft] Failed to record draft failure:", error);
  }
}

/** Where the user goes to recover a draft. */
export function draftRecoveryHref(appId: string): string {
  return `/agent-apps/${appId}/code`;
}
