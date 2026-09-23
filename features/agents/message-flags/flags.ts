/**
 * Message FLAGS — an instruction to the translator about a message, never
 * content (`common-docs/systems/agents/typed-messages/FEATURE.md`, Flag row).
 *
 *   prefill        — the LAST assistant message; the reply continues from it.
 *   cache_boundary — cache everything up to and including this message.
 *   example        — a few-shot user/assistant turn; the runner collapses them.
 *
 * Stored top-level on the agent-definition message (`flags`); the server keeps
 * them in `cx_message.metadata.flags` at runtime. Placement rules here mirror
 * aidream `matrx_ai/config/message_flags.py::validate_message_flags` — the
 * server refuses a definition that breaks them.
 *
 * COMPATIBILITY IS NEVER SILENT: a flag the selected model cannot honour stays
 * visible, greyed, with the reason (the same law as the Questions part).
 */

import type { AIModelRecord } from "@/features/ai-models/redux/modelRegistrySlice";
import { parseCapabilities } from "@/features/ai-models/capabilities/parse";
import { estimateTokensForText } from "@/lib/tokens/estimate";

export const MESSAGE_FLAG_KEYS = ["prefill", "cache_boundary", "example"] as const;
export type MessageFlagKey = (typeof MESSAGE_FLAG_KEYS)[number];
export type MessageFlags = Partial<Record<MessageFlagKey, true>>;

/** The org knob that decides what an unhonourable flag becomes (aidream ai_091). */
export const FLAG_COMPATIBILITY_KNOB = {
  feature: "agents.messages",
  key: "flag_compatibility_mode",
} as const;
export type FlagCompatibilityMode = "refuse" | "convert" | "drop";
export const DEFAULT_FLAG_COMPATIBILITY_MODE: FlagCompatibilityMode = "refuse";

export function resolveFlagCompatibilityMode(raw: unknown): FlagCompatibilityMode {
  return raw === "convert" || raw === "drop" || raw === "refuse"
    ? raw
    : DEFAULT_FLAG_COMPATIBILITY_MODE;
}

/** What `ai.model_message_flag_profile` answers for the selected model. */
export interface MessageFlagProfile {
  model_id: string;
  wire_format: string | null;
  input_price: number | null;
  cached_input_price: number | null;
  cache_write_5m_price: number | null;
}

interface FlaggedMessageLike {
  role: string;
  content: unknown;
  flags?: MessageFlags;
}

/** Normalize whatever is stored to `{flag: true}`; unknown keys are ignored here
 *  (the definition reader screams about them). */
export function flagsOf(message: { flags?: unknown } | null | undefined): MessageFlags {
  const raw = message?.flags;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: MessageFlags = {};
  for (const key of MESSAGE_FLAG_KEYS) {
    if ((raw as Record<string, unknown>)[key] === true) out[key] = true;
  }
  return out;
}

export function hasFlag(
  message: { flags?: unknown } | null | undefined,
  flag: MessageFlagKey,
): boolean {
  return flagsOf(message)[flag] === true;
}

/** Validate a stored `flags` value; returns a sentence, or null when lawful. */
export function flagsShapeProblem(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return "flags must be an object";
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(MESSAGE_FLAG_KEYS as readonly string[]).includes(key)) {
      return `unknown message flag "${key}"`;
    }
    if (typeof value !== "boolean") return `flag "${key}" must be true or false`;
  }
  return null;
}

function textOf(message: FlaggedMessageLike): string {
  const content = message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) =>
      block && typeof block === "object" && (block as { type?: unknown }).type === "text"
        ? String((block as { text?: unknown }).text ?? "")
        : "",
    )
    .join("");
}

/** Why a flag cannot sit on this message (placement, not model), or null. */
export function flagPlacementProblem(
  messages: readonly FlaggedMessageLike[],
  index: number,
  flag: MessageFlagKey,
): string | null {
  const message = messages[index];
  if (!message) return "No such message.";
  if (flag === "example" && message.role !== "user" && message.role !== "assistant") {
    return "Only user and assistant messages can be examples.";
  }
  if (flag === "prefill") {
    if (message.role !== "assistant") return "Only an assistant message can be a prefill.";
    if (index !== messages.length - 1) {
      return "A prefill must be the last message — the reply continues from it.";
    }
  }
  return null;
}

/** Every placement problem in a message list, as sentences (empty = lawful). */
export function flagPlacementProblems(messages: readonly FlaggedMessageLike[]): string[] {
  const problems: string[] = [];
  messages.forEach((message, index) => {
    for (const flag of MESSAGE_FLAG_KEYS) {
      if (!hasFlag(message, flag)) continue;
      const problem = flagPlacementProblem(messages, index, flag);
      if (problem) problems.push(`Message ${index + 1}: ${problem}`);
    }
    if (hasFlag(message, "prefill") && !textOf(message).trim()) {
      problems.push(`Message ${index + 1}: a prefill needs text for the reply to continue from.`);
    }
  });
  return problems;
}

function withFlag<T extends FlaggedMessageLike>(message: T, flag: MessageFlagKey, on: boolean): T {
  const next: MessageFlags = { ...flagsOf(message) };
  if (on) next[flag] = true;
  else delete next[flag];
  const { flags: _drop, ...rest } = message;
  return (Object.keys(next).length ? { ...rest, flags: next } : rest) as T;
}

/**
 * Toggle one flag. `example` travels with its pair: flagging a user turn also
 * flags the assistant answer after it (and the reverse), because a few-shot
 * example is the exchange, not half of it.
 */
export function toggleMessageFlag<T extends FlaggedMessageLike>(
  messages: readonly T[],
  index: number,
  flag: MessageFlagKey,
): T[] {
  const on = !hasFlag(messages[index], flag);
  const out = messages.map((m, i) => (i === index ? withFlag(m, flag, on) : m));
  if (flag === "example") {
    const partner =
      messages[index]?.role === "user"
        ? index + 1
        : messages[index]?.role === "assistant"
          ? index - 1
          : -1;
    const partnerMsg = messages[partner];
    if (
      partnerMsg &&
      partnerMsg.role !== messages[index].role &&
      (partnerMsg.role === "user" || partnerMsg.role === "assistant")
    ) {
      out[partner] = withFlag(partnerMsg, flag, on);
    }
  }
  return out;
}

// ── compatibility (model-dependent) ────────────────────────────────────────

export type FlagVerdict =
  | { verdict: "native"; reason: string }
  | { verdict: "converted"; reason: string }
  | { verdict: "noop"; reason: string }
  | { verdict: "refused"; reason: string }
  | { verdict: "unknown"; reason: string };

function modelLabel(model: AIModelRecord | null | undefined): string {
  return model?.common_name?.trim() || model?.name?.trim() || "This model";
}

export function modelSupportsPrefill(model: AIModelRecord | null | undefined): boolean {
  if (!model) return false;
  const caps = parseCapabilities(model.capabilities, { modelId: model.id, modelName: model.name });
  return (caps.features as readonly string[]).includes("assistant_prefill");
}

export function prefillVerdict(
  model: AIModelRecord | null | undefined,
  mode: FlagCompatibilityMode,
): FlagVerdict {
  if (!model) {
    return { verdict: "unknown", reason: "The model's capabilities are still loading." };
  }
  const label = modelLabel(model);
  if (modelSupportsPrefill(model)) {
    return { verdict: "native", reason: `The reply continues from this text on ${label}.` };
  }
  if (mode === "convert") {
    return {
      verdict: "converted",
      reason: `${label} cannot take a prefill, so it is asked to begin its reply with this text — asked for, not forced.`,
    };
  }
  if (mode === "drop") {
    return {
      verdict: "refused",
      reason: `${label} cannot take a prefill; your organization drops it, so this text is not sent.`,
    };
  }
  return {
    verdict: "refused",
    reason: `${label} cannot continue a reply from a prefill, so a run with this flag is refused before anything is spent. Pick a model that supports prefill (for example Claude Haiku 4.5) or remove the flag.`,
  };
}

export function cacheBoundaryVerdict(
  model: AIModelRecord | null | undefined,
  profile: MessageFlagProfile | null | undefined,
): FlagVerdict {
  if (!profile) {
    return {
      verdict: "unknown",
      reason: model ? "Checking how this model's route caches…" : "Pick a model first.",
    };
  }
  const label = modelLabel(model);
  switch (profile.wire_format) {
    case "anthropic_chat":
      return {
        verdict: "native",
        reason: `Everything up to here is cached on ${label}; a repeat run within 5 minutes reads it at the cached price.`,
      };
    case "openai_chat":
      return {
        verdict: "noop",
        reason: `${label} caches repeated prompt prefixes automatically, so this boundary sends nothing extra.`,
      };
    case "google_chat":
      return {
        verdict: "noop",
        reason: `${label} caches repeated prompt prefixes implicitly; explicit context caching is not used, so this boundary sends nothing extra.`,
      };
    default:
      return {
        verdict: "noop",
        reason: `${label}'s route has no prompt caching, so this boundary sends nothing.`,
      };
  }
}

// ── the request preview: examples + cache savings ──────────────────────────

/** Runs of consecutive example-flagged messages: [[start, end], …] inclusive. */
export function exampleRuns(messages: readonly FlaggedMessageLike[]): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  let start = -1;
  messages.forEach((m, i) => {
    if (hasFlag(m, "example")) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      runs.push([start, i - 1]);
      start = -1;
    }
  });
  if (start >= 0) runs.push([start, messages.length - 1]);
  return runs;
}

export interface FlagPreview {
  totalTokens: number;
  exampleTokens: number;
  examplePairs: number;
  /** Tokens up to and including the LAST cache boundary (system included). */
  cachedPrefixTokens: number;
  /** Per repeat run, USD, input side only; null when prices are unknown. */
  fullInputCost: number | null;
  cachedInputCost: number | null;
  savingsPercent: number | null;
  /** Anthropic ignores a cached prefix below the model's minimum. */
  belowCacheMinimum: boolean;
}

/** The smallest prefix any current Claude model caches (Sonnet 5 / 4.x: 1,024). */
export const ANTHROPIC_MIN_CACHEABLE_TOKENS = 1024;

export function flagPreview(
  messages: readonly FlaggedMessageLike[],
  profile: MessageFlagProfile | null | undefined,
): FlagPreview {
  const tokens = messages.map((m) => estimateTokensForText(textOf(m)));
  const totalTokens = tokens.reduce((a, b) => a + b, 0);
  let exampleTokens = 0;
  let exampleMessages = 0;
  let lastBoundary = -1;
  messages.forEach((m, i) => {
    if (hasFlag(m, "example")) {
      exampleTokens += tokens[i];
      exampleMessages += 1;
    }
    if (hasFlag(m, "cache_boundary")) lastBoundary = i;
  });
  const cachedPrefixTokens =
    lastBoundary >= 0 ? tokens.slice(0, lastBoundary + 1).reduce((a, b) => a + b, 0) : 0;
  const native = profile?.wire_format === "anthropic_chat";
  const input = profile?.input_price ?? null;
  const cached = profile?.cached_input_price ?? null;
  let fullInputCost: number | null = null;
  let cachedInputCost: number | null = null;
  let savingsPercent: number | null = null;
  if (native && input !== null && cached !== null && cachedPrefixTokens > 0) {
    fullInputCost = (totalTokens * input) / 1_000_000;
    cachedInputCost =
      (cachedPrefixTokens * cached + (totalTokens - cachedPrefixTokens) * input) / 1_000_000;
    savingsPercent =
      fullInputCost > 0 ? Math.round((1 - cachedInputCost / fullInputCost) * 100) : null;
  }
  return {
    totalTokens,
    exampleTokens,
    examplePairs: Math.floor(exampleMessages / 2),
    cachedPrefixTokens,
    fullInputCost,
    cachedInputCost,
    savingsPercent,
    belowCacheMinimum:
      native && cachedPrefixTokens > 0 && cachedPrefixTokens < ANTHROPIC_MIN_CACHEABLE_TOKENS,
  };
}
