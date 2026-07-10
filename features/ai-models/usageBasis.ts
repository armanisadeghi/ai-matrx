/**
 * Usage-basis taxonomy — the billing unit a pricing tier's price maps to.
 *
 * MIRROR of the server SSOT: matrx-ai `matrx_ai/config/usage_config.py`
 * (`USAGE_BASIS_SPECS` + `validate_model_pricing`). Keep the two in sync —
 * the server is authoritative; this drives the admin pricing editor so wrong
 * entry is structurally hard (the root cause of the $30-image / $0-TTS /
 * 1e6×-character billing bugs was a freeform pricing field with no guardrail).
 *
 * The cost formula is always `billing_tokens / 1e6 * price`. Each basis fixes
 * which price field is billed and what real-world unit the price is in.
 */

import { parseCapabilities } from "./capabilities/parse";
import type { ModelCapabilities } from "./capabilities/types";

export type UsageBasis =
  | "image_output"
  | "megapixel_output"
  | "video_unit_output"
  | "video_second_output"
  | "minute"
  | "character_input"
  | "audio_second_input"
  | "audio_hour_input";

/** "" represents `null` usage_basis (standard real-token LLM billing). */
export type UsageBasisValue = UsageBasis | "";

export type BilledField = "input_price" | "output_price";

export interface UsageBasisOption {
  value: UsageBasisValue;
  label: string;
  /** Which price field actually bills under this basis. */
  billedField: BilledField;
  /** Human unit label for the billed price field. */
  priceLabel: string;
  description: string;
}

export const USAGE_BASIS_OPTIONS: readonly UsageBasisOption[] = [
  {
    value: "",
    label: "Token — standard LLM",
    billedField: "output_price",
    priceLabel: "$ / 1M tokens",
    description:
      "Real provider tokens. input/output/cached are all $/1M tokens. Also correct for image models whose provider returns real token usage (gpt-image-*, Gemini image-native).",
  },
  {
    value: "image_output",
    label: "Per image",
    billedField: "output_price",
    priceLabel: "$ / image",
    description: "One generated image = 1 unit. output_price is $/image.",
  },
  {
    value: "megapixel_output",
    label: "Per megapixel",
    billedField: "output_price",
    priceLabel: "$ / megapixel",
    description:
      "Billed by output megapixels (width×height). output_price is $/MP — the server computes real pixels.",
  },
  {
    value: "video_unit_output",
    label: "Per clip",
    billedField: "output_price",
    priceLabel: "$ / clip",
    description: "One generated clip = 1 unit. output_price is $/clip.",
  },
  {
    value: "video_second_output",
    label: "Per second (video)",
    billedField: "output_price",
    priceLabel: "$ / second",
    description:
      "Billed by output seconds. output_price is $/second — the server computes real duration.",
  },
  {
    value: "minute",
    label: "Per minute (realtime)",
    billedField: "input_price",
    priceLabel: "$ / minute",
    description:
      "Session minutes (e.g. realtime voice). input_price is $/minute. Requires the session to report its duration (not yet wired).",
  },
  {
    value: "character_input",
    label: "Per character (TTS)",
    billedField: "input_price",
    priceLabel: "$ / 1M characters",
    description:
      "TTS — billed by input characters. input_price is $/1M characters (NOT $/character — that under-bills 1,000,000×).",
  },
  {
    value: "audio_second_input",
    label: "Per audio second (STT)",
    billedField: "input_price",
    priceLabel: "$ / 1M units (0.01s each)",
    description:
      "Transcription — input_tokens = floor(seconds×100). input_price is $/1M of those units.",
  },
  {
    value: "audio_hour_input",
    label: "Per audio hour (STT)",
    billedField: "input_price",
    priceLabel: "$ / audio hour",
    description:
      "Transcription priced per hour of audio (e.g. ElevenLabs Scribe). input_price is $/hour (not yet wired for ElevenLabs/xAI STT).",
  },
] as const;

const OPTION_BY_VALUE: Record<UsageBasisValue, UsageBasisOption> = Object.fromEntries(
  USAGE_BASIS_OPTIONS.map((o) => [o.value, o]),
) as Record<UsageBasisValue, UsageBasisOption>;

export function usageBasisOption(basis: string | null | undefined): UsageBasisOption {
  return OPTION_BY_VALUE[(basis ?? "") as UsageBasisValue] ?? OPTION_BY_VALUE[""];
}

/** Per-field unit label given the tier's basis. */
export function priceFieldLabel(
  basis: string | null | undefined,
  field: "input_price" | "output_price" | "cached_input_price",
): string {
  const opt = usageBasisOption(basis);
  if (!basis) return "$ / 1M tokens"; // token billing — all fields are $/1M tokens
  if (field === "cached_input_price") return "$ / 1M tokens (cache)";
  const thisField: BilledField = field === "input_price" ? "input_price" : "output_price";
  if (thisField === opt.billedField) return opt.priceLabel;
  return "unused for this basis";
}

// --- Validation — mirrors usage_config.validate_model_pricing -----------------

export type IssueSeverity = "error" | "warning";

export interface PricingIssue {
  tierIndex: number;
  severity: IssueSeverity;
  code: string;
  message: string;
}

/**
 * A model bills per media UNIT (image / video-second / audio-second / character)
 * rather than per real provider token. Derived from the canonical
 * `capabilities` shape: it emits a media modality, or it consumes audio and
 * nothing else (speech-to-text).
 *
 * Replaces the old `api_class` regex (`/image|video|imagen|tts|stt|.../`).
 * Verified against the live DB on 2026-07-07: identical verdict on 204 of 205
 * `ai.model_definition` rows. The single divergence is the DEPRECATED
 * `meta-llama/llama-4-scout-17b-16e-instruct`, whose `capabilities.output`
 * wrongly claims `image` — a data bug in that row, not in this rule; the new
 * rule flags it (fail-closed), the old one didn't.
 */
export function isMediaModel(caps: ModelCapabilities): boolean {
  if (caps.output.some((c) => c === "image" || c === "video" || c === "audio")) {
    return true;
  }
  return caps.input.includes("audio") && !caps.input.includes("text");
}

interface TierLike {
  input_price?: number | null;
  output_price?: number | null;
  usage_basis?: string | null;
}

/**
 * The facts this validator needs. Both are DATA, never derived from a model name.
 *
 * - `capabilities` — the raw canonical jsonb column; decides `isMediaModel`.
 * - `tokenBilled`  — `ai.offering.token_billed` (migration `ai_012`). A media
 *   model whose provider bills on REAL tokens (gpt-image-*, Gemini native
 *   image, Gemini TTS) legitimately carries a NULL `usage_basis`. This flag is
 *   what makes that NULL *intentional*; without it a NULL basis is a pricing
 *   bug. It cannot be derived from `capabilities` (gpt-image and Imagen are
 *   both "image out"; one is token-billed, one is per-image) nor from
 *   `ai.api.translator_key` — so it is recorded per offering.
 *
 * Fail-closed: when the fact is unknown, pass `tokenBilled: false` and let the
 * validator scream. Never guess from the model name.
 */
export interface PricedModel {
  capabilities: unknown;
  tokenBilled: boolean;
}

export function validatePricingTiers(
  model: PricedModel | null | undefined,
  tiers: readonly TierLike[] | null | undefined,
): PricingIssue[] {
  const issues: PricingIssue[] = [];
  const isMedia = model ? isMediaModel(parseCapabilities(model.capabilities)) : false;
  const tokenBilled = model?.tokenBilled ?? false;
  if (!Array.isArray(tiers)) return issues;

  tiers.forEach((tier, idx) => {
    const basis = tier.usage_basis || null;
    const inP = Number(tier.input_price ?? 0) || 0;
    const outP = Number(tier.output_price ?? 0) || 0;

    if (basis !== null && !(basis in OPTION_BY_VALUE)) {
      issues.push({
        tierIndex: idx,
        severity: "error",
        code: "unknown_basis",
        message: `usage_basis "${basis}" is not a recognized billing unit — cost would use the wrong unit.`,
      });
      return;
    }

    if (basis === null && isMedia && !tokenBilled) {
      issues.push({
        tierIndex: idx,
        severity: "error",
        code: "missing_basis",
        message:
          "Media/audio model with NO usage basis, and the offering is not marked token-billed. Billing will mis-charge — pick a usage basis, or set Token-billed if the provider really bills real tokens.",
      });
    }

    if (basis !== null) {
      const opt = usageBasisOption(basis);
      const billed = opt.billedField === "input_price" ? inP : outP;
      if (billed <= 0) {
        issues.push({
          tierIndex: idx,
          severity: "warning",
          code: "zero_price",
          message: `This basis bills off ${opt.billedField} but it's 0 — nothing will be billed.`,
        });
      }
      if (basis === "character_input" && billed > 0 && billed < 0.01) {
        issues.push({
          tierIndex: idx,
          severity: "error",
          code: "char_price_scale",
          message: `input_price ${billed} looks like $/character, not $/1M characters (off by ~1,000,000×). Multiply by 1e6.`,
        });
      }
    }

    for (const [label, p] of [
      ["input_price", inP],
      ["output_price", outP],
    ] as const) {
      if (p > 100000) {
        issues.push({
          tierIndex: idx,
          severity: "warning",
          code: "implausible_price",
          message: `${label} ${p} is implausibly high — per-unit vs per-1M confusion?`,
        });
      }
    }
  });

  return issues;
}
