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

// api_classes that legitimately bill on REAL provider tokens (no basis needed).
const TOKEN_BILLED_MEDIA_API_CLASSES = new Set<string>([
  "openai_image_generation",
  "openai_image_edit",
  "google_image_native",
  "google_image_generation",
  "google_tts",
]);

const MEDIA_API_CLASS_RE = /image|video|imagen|tts|stt|speech|audio|realtime|transcrib/i;

export function isMediaApiClass(apiClass: string | null | undefined): boolean {
  return MEDIA_API_CLASS_RE.test(apiClass ?? "");
}

interface TierLike {
  input_price?: number | null;
  output_price?: number | null;
  usage_basis?: string | null;
}

export function validatePricingTiers(
  apiClass: string | null | undefined,
  tiers: readonly TierLike[] | null | undefined,
): PricingIssue[] {
  const issues: PricingIssue[] = [];
  const isMedia = isMediaApiClass(apiClass);
  const cls = apiClass ?? "";
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

    if (basis === null && isMedia && !TOKEN_BILLED_MEDIA_API_CLASSES.has(cls)) {
      issues.push({
        tierIndex: idx,
        severity: "error",
        code: "missing_basis",
        message:
          "Media/audio model with NO usage basis (and the provider isn't token-billed). Billing will mis-charge — pick a usage basis.",
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
