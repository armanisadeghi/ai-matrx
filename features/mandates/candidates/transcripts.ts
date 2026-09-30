"use client";

/**
 * Which walkable unit shows what one side of a pair saw (P15).
 *
 * The walk (`reviewWalkWindow`, F2) opens on a `chat.request` (`agent_request`)
 * or an assistant message. A pair records each run's CONVERSATION id; the
 * request ids it records are the run's own request identifiers, which are not
 * `chat.request` row ids (verified on the clone 2026-09-30: none of the pairs'
 * `live_request_id` / `candidate_request_id` values is a `chat.request` row),
 * so the unit is found from the conversation — its newest request, else its
 * newest assistant message. The read runs under the viewer's own row security,
 * so a conversation they cannot open answers "none", never a door that fails.
 */

import { useEffect, useState } from "react";

import { supabase } from "@/utils/supabase/client";
import type { WalkUnitRef } from "@/features/review-walk/address";

export type TranscriptUnit =
  | { state: "loading" }
  | { state: "none" }
  | { state: "error"; message: string }
  | { state: "ready"; unit: WalkUnitRef };

async function findUnit(conversationId: string): Promise<TranscriptUnit> {
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
    return { state: "ready", unit: { unitKind: "agent_request", unitId: request.data.id } };
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
    return { state: "ready", unit: { unitKind: "assistant_message", unitId: message.data.id } };
  }
  return { state: "none" };
}

export function useTranscriptUnit(conversationId: string | null | undefined): TranscriptUnit {
  const [result, setResult] = useState<{ id: string; unit: TranscriptUnit } | null>(null);

  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    findUnit(conversationId)
      .catch((error: unknown): TranscriptUnit => ({
        state: "error",
        message: error instanceof Error ? error.message : String(error),
      }))
      .then((unit) => {
        if (unit.state === "error") {
          console.error("[mandate candidates] transcript lookup failed", conversationId, unit.message);
        }
        if (!cancelled) setResult({ id: conversationId, unit });
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  if (!conversationId) return { state: "none" };
  if (!result || result.id !== conversationId) return { state: "loading" };
  return result.unit;
}
