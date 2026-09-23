"use client";

/**
 * The selected model's wire route + token prices, from
 * `ai.model_message_flag_profile` (aidream ai_091). `ai.offering` is admin-only
 * under RLS; this RPC exposes exactly what the builder needs to say what a
 * cache boundary does on this route and to estimate the cached-read saving.
 *
 * Catalog facts change rarely, so one answer per model id is kept for the
 * session (module cache, keyed by model id).
 */

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import type { MessageFlagProfile } from "./flags";

const cache = new Map<string, MessageFlagProfile | null>();
const inflight = new Map<string, Promise<MessageFlagProfile | null>>();

function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

export function parseMessageFlagProfile(raw: unknown): MessageFlagProfile | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.model_id !== "string") return null;
  return {
    model_id: r.model_id,
    wire_format: typeof r.wire_format === "string" ? r.wire_format : null,
    input_price: num(r.input_price),
    cached_input_price: num(r.cached_input_price),
    cache_write_5m_price: num(r.cache_write_5m_price),
  };
}

async function fetchProfile(modelId: string): Promise<MessageFlagProfile | null> {
  const { data, error } = await supabase
    .schema("ai")
    .rpc("model_message_flag_profile", { p_model_id: modelId });
  if (error) {
    console.error(
      `[message-flags] ai.model_message_flag_profile(${modelId}) failed: ${error.message}. ` +
        "Cache-boundary compatibility and the savings estimate show as unknown.",
    );
    return null;
  }
  return parseMessageFlagProfile(data);
}

export function useMessageFlagProfile(
  modelId: string | null | undefined,
): MessageFlagProfile | null {
  const [profile, setProfile] = useState<MessageFlagProfile | null>(() =>
    modelId ? (cache.get(modelId) ?? null) : null,
  );
  useEffect(() => {
    if (!modelId) {
      setProfile(null);
      return;
    }
    if (cache.has(modelId)) {
      setProfile(cache.get(modelId) ?? null);
      return;
    }
    let live = true;
    let pending = inflight.get(modelId);
    if (!pending) {
      pending = fetchProfile(modelId).then((result) => {
        cache.set(modelId, result);
        inflight.delete(modelId);
        return result;
      });
      inflight.set(modelId, pending);
    }
    pending.then((result) => {
      if (live) setProfile(result);
    });
    return () => {
      live = false;
    };
  }, [modelId]);
  return profile;
}
