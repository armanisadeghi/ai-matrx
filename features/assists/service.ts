"use client";

/**
 * Assists service — the ONE browser read/write path for `platform.assists`.
 *
 * THE VIEW LAW: every list read declares its own scope. Assists are personal
 * nudges, so the scope is always MINE (user_id = the caller), pending, live
 * (unexpired, unsuppressed, not soft-deleted).
 *
 * Producers use `emitAssist` — idempotent by `dedupe_key` (re-noticing the
 * same thing updates the live pending chip, never stacks a duplicate).
 */

import { createClient } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";
import {
  toAssist,
  type Assist,
  type AssistRow,
  type AssistStatus,
  type EmitAssistInput,
} from "./types";

const TABLE = "assists" as const;

function nowIso(): string {
  return new Date().toISOString();
}

/** My live pending assists, highest priority first. */
export async function listMyPendingAssists(userId: string): Promise<Assist[]> {
  const supabase = createClient();
  const now = nowIso();
  const { data, error } = await supabase
    .schema("platform")
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .eq("status", "pending")
    .is("deleted_at", null)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .or(`suppressed_until.is.null,suppressed_until.lt.${now}`)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    throw new Error(`[assists] list failed: ${error.message}`);
  }
  const assists: Assist[] = [];
  for (const row of data ?? []) {
    const assist = toAssist(row);
    if (assist) {
      assists.push(assist);
    } else {
      console.error(
        `[assists] row ${row.id} (${row.source_key}) has an action that does not narrow — skipped`,
      );
    }
  }
  return assists;
}

/**
 * Emit (or refresh) an assist. Idempotent by `dedupe_key`: an existing live
 * pending row with the same key is UPDATED in place. Returns the row id, or
 * null when the write was refused (surfaced loudly, never thrown into UI).
 */
export async function emitAssist(
  userId: string,
  input: EmitAssistInput,
): Promise<string | null> {
  const supabase = createClient();
  const payload = {
    user_id: userId,
    // Producers address the assist; created_by = addressee keeps RLS honest
    // even when a service-role producer writes on someone's behalf.
    created_by: userId,
    source_kind: input.sourceKind ?? "deterministic",
    source_key: input.sourceKey,
    title: input.title,
    body: input.body ?? null,
    action: input.action as unknown as Json,
    surface_name: input.surfaceName ?? null,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    dedupe_key: input.dedupeKey,
    expires_at: input.expiresAt ?? null,
    priority: input.priority ?? 0,
  };

  const { data: existing, error: findError } = await supabase
    .schema("platform")
    .from(TABLE)
    .select("id")
    .eq("dedupe_key", input.dedupeKey)
    .eq("status", "pending")
    .is("deleted_at", null)
    .maybeSingle();
  if (findError) {
    console.error(`[assists] emit lookup failed: ${findError.message}`);
    return null;
  }

  if (existing) {
    const { error } = await supabase
      .schema("platform")
      .from(TABLE)
      .update({
        title: payload.title,
        body: payload.body,
        action: payload.action,
        expires_at: payload.expires_at,
        priority: payload.priority,
      })
      .eq("id", existing.id);
    if (error) {
      console.error(`[assists] emit refresh failed: ${error.message}`);
      return null;
    }
    return existing.id;
  }

  const { data, error } = await supabase
    .schema("platform")
    .from(TABLE)
    .insert(payload)
    .select("id")
    .single();
  if (error) {
    // 23505 = a concurrent producer won the dedupe race — that's success.
    if (error.code === "23505") return null;
    console.error(`[assists] emit failed: ${error.message}`);
    return null;
  }
  return data.id;
}

/**
 * Has this dedupe key EVER been decided (dismissed/accepted/…)? Producers use
 * this so a user's dismissal is durable — re-noticing the same thing must not
 * resurrect the chip.
 */
export async function wasAssistDecided(dedupeKey: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("platform")
    .from(TABLE)
    .select("id")
    .eq("dedupe_key", dedupeKey)
    .neq("status", "pending")
    .limit(1);
  if (error) {
    console.error(`[assists] decided lookup failed: ${error.message}`);
    return false;
  }
  return (data ?? []).length > 0;
}

/**
 * Batch form of `wasAssistDecided` — returns the subset of keys with NO
 * decided row (safe to emit). One query, producers call it before a sweep.
 */
export async function filterUndecidedKeys(keys: string[]): Promise<string[]> {
  if (keys.length === 0) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("platform")
    .from(TABLE)
    .select("dedupe_key")
    .in("dedupe_key", keys)
    .neq("status", "pending");
  if (error) {
    console.error(`[assists] decided batch lookup failed: ${error.message}`);
    return [];
  }
  const decided = new Set((data ?? []).map((r) => r.dedupe_key));
  return keys.filter((k) => !decided.has(k));
}

/** Decide an assist (accept / dismiss) with an optional receipt. */
export async function decideAssist(
  id: string,
  status: Extract<AssistStatus, "accepted" | "dismissed">,
  result?: Json,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .schema("platform")
    .from(TABLE)
    .update({
      status,
      decided_at: nowIso(),
      result: result ?? null,
    })
    .eq("id", id);
  if (error) {
    throw new Error(`[assists] decide failed: ${error.message}`);
  }
}

