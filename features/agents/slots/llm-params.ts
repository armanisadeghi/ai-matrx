/**
 * Pure narrowing of a slot binding's `config_overrides` Json into the
 * generated LLMParams shape — shared by the client resolver (service.ts) and
 * the SSR resolver (service.server.ts) so the two can never drift on which
 * keys the client run path honours. Field by field, no casts; unknown keys
 * are dropped LOUDLY (the server's apply_overrides stays the authority).
 */

import type { JsonObject } from "@/types/json";
import type { FeLlmParams } from "@/features/agents/types/agent-api-types";

export function toLlmParams(obj: JsonObject): Partial<FeLlmParams> {
  const out: Partial<FeLlmParams> = {};
  if (typeof obj.model === "string") out.model = obj.model;
  if (typeof obj.offering_id === "string") out.offering_id = obj.offering_id;
  if (typeof obj.temperature === "number") out.temperature = obj.temperature;
  if (typeof obj.top_p === "number") out.top_p = obj.top_p;
  if (typeof obj.max_output_tokens === "number") out.max_output_tokens = obj.max_output_tokens;
  const handled = new Set([
    "model",
    "offering_id",
    "temperature",
    "top_p",
    "max_output_tokens",
    "thinking_level",
    "reasoning_effort",
    "verbosity",
  ]);
  const thinkingLevels = ["minimal", "low", "medium", "high"] as const;
  const thinking = thinkingLevels.find((v) => v === obj.thinking_level);
  if (thinking) out.thinking_level = thinking;
  const efforts = ["auto", "none", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
  const effort = efforts.find((v) => v === obj.reasoning_effort);
  if (effort) out.reasoning_effort = effort;
  const verbosities = ["low", "medium", "high"] as const;
  const verbosity = verbosities.find((v) => v === obj.verbosity);
  if (verbosity) out.verbosity = verbosity;
  const dropped = Object.keys(obj).filter((k) => !handled.has(k));
  if (dropped.length > 0) {
    console.warn(
      `[agent-slots] slot resolution dropped unsupported config_overrides keys: ${dropped.join(", ")} — extend toLlmParams or apply them server-side`,
    );
  }
  return out;
}
