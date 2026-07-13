// features/ai-models/capabilities/parse.ts
//
// Parser for `ai.model_definition.capabilities`.
//
// The column is CANONICAL for every row in the live DB. Verified 2026-07-07
// against project txzxabzwovsujtloxrus: all 205 rows (142 active + 63
// deprecated) hold a JSON object carrying `input` / `output` / `features` /
// `interaction`. Zero rows are null, "", a flat label array, a Google-style
// boolean map, or the literal "[transcription]".
//
// Because of that, this module PARSES AND VALIDATES — it never infers. The
// tolerant legacy-shape branches and the `api_class` string-sniffing fallback
// (`*_tts` / `*_image_generation` / `*_realtime` → guessed modalities) were
// deleted with the `api_class` tear-out. `api_class` was DROPPED from the
// table (ai_034, 2026-07-10); nothing may depend on it again.
//
// `DEFAULT_CAPABILITIES` remains the answer for a row that has no capabilities
// at all — i.e. a model being composed in the admin UI before its first save.
//
// Returns a NEW object every call — never mutates input. Pure; no React,
// no Redux. Hot-path readers (the launcher) call this on cached model
// rows, so it must be fast and allocation-light.

import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import {
  DEFAULT_CAPABILITIES,
  isContentType,
  isFeatureKey,
  isInteractionMode,
  type ContentType,
  type FeatureKey,
  type InteractionMode,
  type ModelCapabilities,
} from "./types";

/** Identifies the model whose capabilities are being parsed, for loud reporting. */
export interface CapabilitiesParseContext {
  modelId?: string;
  modelName?: string;
}

/** The five canonical top-level keys of `ai.model_definition.capabilities`. */
const CANONICAL_CAPABILITY_KEYS: ReadonlySet<string> = new Set([
  "input",
  "output",
  "features",
  "interaction",
  "multilingual",
]);

// One scream per (model, field, value) per session — the parser runs on hot
// paths (launcher, pickers) against cached rows; repeating the same report
// thousands of times helps nobody.
const reportedUnknowns = new Set<string>();

/**
 * SCREAM about a capability value the DB carries but this parser's vocabulary
 * doesn't recognize. Silent coercion is exactly what hid `interaction:
 * "extraction"` / `multilingual` being dropped for weeks — an unknown value is
 * a contract violation to surface, never quietly default away. Never throws.
 */
function reportUnknownCapabilityValue(
  field: string,
  value: unknown,
  context: CapabilitiesParseContext | undefined,
): void {
  try {
    const modelId = context?.modelId ?? "unknown";
    const key = `${modelId}|${field}|${JSON.stringify(value)}`;
    if (reportedUnknowns.has(key)) return;
    reportedUnknowns.add(key);
    const message = `Unknown capabilities.${field} value ${JSON.stringify(value)} on model ${modelId}${
      context?.modelName ? ` (${context.modelName})` : ""
    } — not in the FE vocabulary (features/ai-models/capabilities/types.ts); value ignored until the vocabulary is extended.`;
    // eslint-disable-next-line no-console -- deliberate scream: silent coercion is the bug class this kills
    console.warn(`[parseCapabilities] ${message}`);
    captureError({
      source: "data-shape",
      relation: "ai.model_definition.capabilities",
      message,
      details: JSON.stringify({ field, value, modelId, modelName: context?.modelName })?.slice(0, 500),
    });
  } catch {
    // Reporting must never break the caller.
  }
}

/**
 * Keep only valid members of `T`, de-duplicated, in first-seen order.
 * Every rejected string member is screamed about — never silently dropped.
 */
function collect<T extends string>(
  field: string,
  raw: unknown,
  guard: (value: unknown) => value is T,
  context: CapabilitiesParseContext | undefined,
): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  for (const value of raw) {
    if (guard(value)) {
      if (!out.includes(value)) out.push(value);
    } else {
      reportUnknownCapabilityValue(field, value, context);
    }
  }
  return out;
}

/**
 * Validate the canonical `{input, output, features, interaction,
 * multilingual}` object. Anything that is not that object — including `null`
 * for an unsaved row — yields the text-only turn-based default.
 *
 * Pass `context` (model id/name) wherever available — it's what makes the
 * unknown-value scream actionable.
 */
export function parseCapabilities(
  raw: unknown,
  context?: CapabilitiesParseContext,
): ModelCapabilities {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ...DEFAULT_CAPABILITIES };
  }

  const obj = raw as Record<string, unknown>;

  // Unknown TOP-LEVEL keys scream too — a flat legacy/audit-shaped object in
  // the column (e.g. `{ text_input: true, ... }`) would otherwise parse to
  // the defaults with zero noise, hiding the corruption.
  for (const key of Object.keys(obj)) {
    if (!CANONICAL_CAPABILITY_KEYS.has(key)) {
      reportUnknownCapabilityValue(key, obj[key], context);
    }
  }

  const input: ContentType[] = collect("input", obj.input, isContentType, context);
  const output: ContentType[] = collect("output", obj.output, isContentType, context);
  const features: FeatureKey[] = collect("features", obj.features, isFeatureKey, context);

  let interaction: InteractionMode;
  if (isInteractionMode(obj.interaction)) {
    interaction = obj.interaction;
  } else {
    // LOUD recovery, not a silent default: an interaction value outside the
    // vocabulary means the DB and this parser disagree — surface it.
    if (obj.interaction !== undefined) {
      reportUnknownCapabilityValue("interaction", obj.interaction, context);
    }
    interaction = "turn";
  }

  let multilingual = false;
  if (typeof obj.multilingual === "boolean") {
    multilingual = obj.multilingual;
  } else if (obj.multilingual !== undefined) {
    reportUnknownCapabilityValue("multilingual", obj.multilingual, context);
  }

  return {
    input: input.length > 0 ? input : ["text"],
    output: output.length > 0 ? output : ["text"],
    features,
    interaction,
    multilingual,
  };
}

// ─── Audit-system bridge: derive the flat boolean view ────────────────────

/**
 * Flat audit-shaped record. Re-exported here for callers that want the
 * derived projection without importing from the audit module.
 */
export type AuditCapabilitiesRecord = Partial<{
  text_input: boolean;
  text_output: boolean;
  image_input: boolean;
  image_output: boolean;
  audio_input: boolean;
  audio_output: boolean;
  video_input: boolean;
  document_input: boolean;
  code_execution: boolean;
  function_calling: boolean;
  streaming: boolean;
  vision: boolean;
  web_search: boolean;
  json_mode: boolean;
  structured_output: boolean;
  system_prompt: boolean;
  multi_turn: boolean;
  embeddings: boolean;
  fine_tuning: boolean;
  batch_api: boolean;
}>;

/**
 * Project the canonical shape onto the flat audit record so existing
 * audit consumers see the same view they always have.
 */
export function toAuditRecord(caps: ModelCapabilities): AuditCapabilitiesRecord {
  return {
    text_input: caps.input.includes("text"),
    text_output: caps.output.includes("text"),
    image_input: caps.input.includes("image"),
    image_output: caps.output.includes("image"),
    audio_input: caps.input.includes("audio"),
    audio_output: caps.output.includes("audio"),
    video_input: caps.input.includes("video"),
    document_input: caps.input.includes("document"),
    // vision is set explicitly OR implied by image input.
    vision: caps.features.includes("vision") || caps.input.includes("image"),
    code_execution: caps.features.includes("code_execution"),
    function_calling: caps.features.includes("function_calling"),
    streaming: caps.features.includes("streaming"),
    web_search: caps.features.includes("web_search"),
    json_mode: caps.features.includes("json_mode"),
    structured_output: caps.features.includes("structured_output"),
    system_prompt: caps.features.includes("system_prompt"),
    multi_turn: caps.features.includes("multi_turn"),
    embeddings: caps.features.includes("embeddings"),
    fine_tuning: caps.features.includes("fine_tuning"),
    batch_api: caps.features.includes("batch_api"),
  };
}

// ─── Audit-system write bridge: merge the flat view BACK canonically ───────

/** Where each flat audit flag lives in the canonical shape. */
const AUDIT_FLAG_LOCATION: Record<
  keyof AuditCapabilitiesRecord,
  { array: "input" | "output" | "features"; value: string }
> = {
  text_input: { array: "input", value: "text" },
  image_input: { array: "input", value: "image" },
  audio_input: { array: "input", value: "audio" },
  video_input: { array: "input", value: "video" },
  document_input: { array: "input", value: "document" },
  text_output: { array: "output", value: "text" },
  image_output: { array: "output", value: "image" },
  audio_output: { array: "output", value: "audio" },
  // NOTE: `vision` maps to the `vision` FEATURE only. The read projection
  // (`toAuditRecord`) also implies vision from image input, so toggling
  // vision OFF while image input stays on will still project true — that
  // asymmetry is inherent to the flat view, not a data loss.
  vision: { array: "features", value: "vision" },
  code_execution: { array: "features", value: "code_execution" },
  function_calling: { array: "features", value: "function_calling" },
  streaming: { array: "features", value: "streaming" },
  web_search: { array: "features", value: "web_search" },
  json_mode: { array: "features", value: "json_mode" },
  structured_output: { array: "features", value: "structured_output" },
  system_prompt: { array: "features", value: "system_prompt" },
  multi_turn: { array: "features", value: "multi_turn" },
  embeddings: { array: "features", value: "embeddings" },
  fine_tuning: { array: "features", value: "fine_tuning" },
  batch_api: { array: "features", value: "batch_api" },
};

/**
 * Merge an edited flat audit record back INTO the canonical capabilities
 * object — the write-side inverse of `toAuditRecord`. This exists because
 * writing the flat 20-boolean projection over the column destroys
 * `interaction` / `multilingual` / non-text output / the extended feature
 * vocabulary (the exact silent-drop class TASK-003 killed on the read side).
 *
 * Rules:
 * - Starts from the RAW stored object (arrays cloned) — every key and every
 *   array member the editor doesn't model is preserved VERBATIM, including
 *   values outside the FE vocabulary.
 * - Only flags whose edited value DIFFERS from the current projection are
 *   applied (as an add/remove on the owning array), so an untouched Save is
 *   a byte-for-byte no-op: `merge(raw, toAuditRecord(parse(raw))) === raw`.
 * - A flag with no canonical mapping is never written.
 */
export function mergeAuditRecordIntoCapabilities(
  raw: unknown,
  edited: AuditCapabilitiesRecord,
  context?: CapabilitiesParseContext,
): Record<string, unknown> {
  const base: Record<string, unknown> =
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : { input: ["text"], output: ["text"], features: [], interaction: "turn" };
  // Clone the three membership arrays so we never mutate the caller's row.
  for (const key of ["input", "output", "features"] as const) {
    base[key] = Array.isArray(base[key]) ? [...(base[key] as unknown[])] : [];
  }

  const baseline = toAuditRecord(parseCapabilities(raw, context));

  for (const flag of Object.keys(AUDIT_FLAG_LOCATION) as Array<
    keyof AuditCapabilitiesRecord
  >) {
    const desired = edited[flag];
    if (desired === undefined || desired === baseline[flag]) continue;
    const { array, value } = AUDIT_FLAG_LOCATION[flag];
    const members = base[array] as unknown[];
    if (desired) {
      if (!members.includes(value)) members.push(value);
    } else {
      const idx = members.indexOf(value);
      if (idx !== -1) members.splice(idx, 1);
    }
  }

  return base;
}

// Re-exports for the few callers that historically imported from one
// module rather than several.
export {
  CONTENT_TYPES,
  FEATURE_KEYS,
  INTERACTION_MODES,
  DEFAULT_CAPABILITIES,
} from "./types";
export type {
  ContentType,
  FeatureKey,
  InteractionMode,
  ModelCapabilities,
} from "./types";
