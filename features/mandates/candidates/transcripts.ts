"use client";

/**
 * Which walkable unit shows what one side of a pair saw (P15).
 *
 * The walk (`reviewWalkWindow`, F2) opens on a `chat.request` (`agent_request`)
 * or an assistant message. A pair records each run's own `chat.user_request`
 * id (`live_request_id` / `candidate_request_id`), so the unit is THAT run's
 * newest `chat.request` (its last provider call). Two runs of one mandate can
 * share a conversation, so the conversation alone cannot tell them apart.
 *
 * Only an older pair whose id names no request falls back to the conversation:
 * its newest request, else its newest assistant message — and when that
 * conversation holds more than one run, the unit says so (`runsInChat`), never
 * a silent pick. The reads run under the viewer's own row security, so a
 * conversation they cannot open answers "none", never a door that fails.
 */

import { useEffect, useState } from "react";

import { supabase } from "@/utils/supabase/client";
import type { WalkUnitRef } from "@/features/review-walk/address";

export type TranscriptUnit =
  | { state: "loading" }
  | { state: "none" }
  | { state: "error"; message: string }
  | {
      state: "ready";
      unit: WalkUnitRef;
      /** Set only on the conversation fallback when the chat holds more than one run. */
      runsInChat?: number;
    };

export interface TranscriptTarget {
  /** The run's own `chat.user_request` id, as the pair recorded it. */
  requestId: string | null | undefined;
  conversationId: string | null | undefined;
}

export async function findTranscriptUnit(target: TranscriptTarget): Promise<TranscriptUnit> {
  const { requestId, conversationId } = target;
  if (requestId) {
    const own = await supabase
      .schema("chat")
      .from("request")
      .select("id")
      .eq("user_request_id", requestId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (own.error) return { state: "error", message: own.error.message };
    if (own.data) {
      return { state: "ready", unit: { unitKind: "agent_request", unitId: own.data.id } };
    }
  }
  if (!conversationId) return { state: "none" };
  const runs = await supabase
    .schema("chat")
    .from("user_request")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .is("deleted_at", null);
  if (runs.error) return { state: "error", message: runs.error.message };
  const runsInChat = (runs.count ?? 0) > 1 ? (runs.count ?? undefined) : undefined;
  const request = await supabase
    .schema("chat")
    .from("request")
    .select("id")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (request.error) return { state: "error", message: request.error.message };
  if (request.data) {
    return { state: "ready", unit: { unitKind: "agent_request", unitId: request.data.id }, runsInChat };
  }
  const message = await supabase
    .schema("chat")
    .from("message")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("role", "assistant")
    .is("deleted_at", null)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (message.error) return { state: "error", message: message.error.message };
  if (message.data) {
    return { state: "ready", unit: { unitKind: "assistant_message", unitId: message.data.id }, runsInChat };
  }
  return { state: "none" };
}

export function useTranscriptUnit(target: TranscriptTarget): TranscriptUnit {
  const { requestId, conversationId } = target;
  const key = requestId || conversationId ? `${requestId ?? ""}/${conversationId ?? ""}` : null;
  const [result, setResult] = useState<{ key: string; unit: TranscriptUnit } | null>(null);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    findTranscriptUnit({ requestId, conversationId })
      .catch((error: unknown): TranscriptUnit => ({
        state: "error",
        message: error instanceof Error ? error.message : String(error),
      }))
      .then((unit) => {
        if (unit.state === "error") {
          console.error("[mandate candidates] transcript lookup failed", key, unit.message);
        }
        if (!cancelled) setResult({ key, unit });
      });
    return () => {
      cancelled = true;
    };
  }, [key, requestId, conversationId]);

  if (!key) return { state: "none" };
  if (!result || result.key !== key) return { state: "loading" };
  return result.unit;
}
