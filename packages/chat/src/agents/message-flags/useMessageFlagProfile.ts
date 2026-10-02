"use client";

/**
 * The selected model's wire route + token prices, from
 * `ai.model_message_flag_profile` (aidream ai_091). `ai.offering` is admin-only
 * under RLS; this RPC exposes exactly what the builder needs to say what a
 * cache boundary does on this route and to estimate the cached-read saving.
 *
 * A model's CLASS (pinned offering) decides the route, so a pin reads the
 * class-aware form `(p_model_id, p_offering_id)`; no pin reads the preferred
 * class.
 *
 * Catalog facts change rarely, so one answer per model + class is kept for the
 * session (module cache, keyed by model id and pin).
 */

import { useEffect, useState } from "react";
import { supabase } from "../../host/db";
import type { MessageFlagProfile } from "./flags";
import {
  isForeignPinError,
  isMissingFunctionError,
  warnClassAwareSqlPending,
} from "../image-roles/class-aware-rpc";

const cache = new Map<string, MessageFlagProfile | null>();
const inflight = new Map<string, Promise<MessageFlagProfile | null>>();

const keyOf = (modelId: string, offeringId: string | null | undefined) =>
  `${modelId}::${offeringId ?? ""}`;

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

function reportFailure(label: string, message: string): null {
  console.error(
    `[message-flags] ai.model_message_flag_profile(${label}) failed: ${message}. ` +
      "Cache-boundary compatibility and the savings estimate show as unknown.",
  );
  return null;
}

export async function fetchMessageFlagProfile(
  modelId: string,
  offeringId?: string | null,
): Promise<MessageFlagProfile | null> {
  if (offeringId) {
    const { data, error } = await supabase
      .schema("ai")
      .rpc("model_message_flag_profile", {
        p_model_id: modelId,
        p_offering_id: offeringId,
      });
    if (!error) return parseMessageFlagProfile(data);
    if (!isMissingFunctionError(error)) {
      // A pin that is not a class of this model (P0002) is unknown, never the
      // preferred class's route.
      return reportFailure(
        `${modelId}, ${offeringId}`,
        isForeignPinError(error)
          ? `the pinned class is not an available offering of this model (${error.message})`
          : error.message,
      );
    }
    warnClassAwareSqlPending("ai.model_message_flag_profile");
  }
  const { data, error } = await supabase
    .schema("ai")
    .rpc("model_message_flag_profile", { p_model_id: modelId });
  if (error) return reportFailure(modelId, error.message);
  return parseMessageFlagProfile(data);
}

export function useMessageFlagProfile(
  modelId: string | null | undefined,
  offeringId?: string | null,
): MessageFlagProfile | null {
  const key = modelId ? keyOf(modelId, offeringId) : null;
  const [profile, setProfile] = useState<MessageFlagProfile | null>(() =>
    key ? (cache.get(key) ?? null) : null,
  );
  useEffect(() => {
    if (!modelId || !key) {
      setProfile(null);
      return;
    }
    if (cache.has(key)) {
      setProfile(cache.get(key) ?? null);
      return;
    }
    let live = true;
    let pending = inflight.get(key);
    if (!pending) {
      pending = fetchMessageFlagProfile(modelId, offeringId).then((result) => {
        cache.set(key, result);
        inflight.delete(key);
        return result;
      });
      inflight.set(key, pending);
    }
    pending.then((result) => {
      if (live) setProfile(result);
    });
    return () => {
      live = false;
    };
  }, [key, modelId, offeringId]);
  return profile;
}
