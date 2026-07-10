// features/ai-models/lab/modelDisplay.ts
//
// TEMPORARY display helpers for the model picker. These paper over a real DB
// gap: there is no clean "maker" field — `model_provider` points at the SERVING
// provider (Groq, Cerebras, Together…), not who built the model. Until the DB
// has a proper maker column, we derive it from the `model_class` prefix and only
// trust the provider name when the provider IS the maker.
//
// Remove/replace once the DB stores maker properly.

/**
 * Providers that only SERVE models they didn't make. Their name must never be
 * shown to a user as the maker (per product rule: never Groq/Cerebras/Together/
 * Replicate…). When a model's provider is one of these, derive the maker from
 * the model_class prefix instead.
 */
const SERVING_ONLY_PROVIDERS = new Set(
  ["groq", "cerebras", "together", "replicate", "ai matrx", "mixtral"].map((s) =>
    s.toLowerCase(),
  ),
);

/** model_class prefix (before "/") → pretty maker name. */
const PREFIX_TO_MAKER: Record<string, string> = {
  openai: "OpenAI",
  "meta-llama": "Meta",
  meta: "Meta",
  google: "Google",
  "google-deepmind": "Google",
  anthropic: "Anthropic",
  "x-ai": "xAI",
  xai: "xAI",
  "black-forest-labs": "Black Forest Labs",
  bytedance: "ByteDance",
  "ideogram-ai": "Ideogram",
  ideogram: "Ideogram",
  kwaivgi: "Kuaishou",
  kuaishou: "Kuaishou",
  "wan-video": "WAN",
  wan: "WAN",
  deepseek: "DeepSeek",
  "deepseek-ai": "DeepSeek",
  qwen: "Qwen",
  "qwen2.5": "Qwen",
  mistralai: "Mistral",
  mistral: "Mistral",
  microsoft: "Microsoft",
  minimax: "MiniMax",
  elevenlabs: "ElevenLabs",
  recraft: "Recraft",
  luma: "Luma",
  runway: "Runway",
  fastino: "Fastino",
  moonshotai: "Moonshot",
  nvidia: "NVIDIA",
};

function prettifyPrefix(prefix: string): string {
  const known = PREFIX_TO_MAKER[prefix.toLowerCase()];
  if (known) return known;
  // Fallback: turn "some-lab" into "Some Lab" without exposing a version string.
  return prefix
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Resolve the maker to SHOW.
 * @param providerName the resolved `model_provider` → provider.name (may be a
 *   serving-only provider we must not surface)
 * @param modelClass the technical `model_class` (e.g. "openai/gpt-oss-20b")
 */
export function resolveMaker(
  providerName: string | null,
  modelClass: string | null,
): string | null {
  const prov = providerName?.trim();
  if (prov && !SERVING_ONLY_PROVIDERS.has(prov.toLowerCase())) {
    return prov; // provider IS the maker (Anthropic, Google, Meta, …)
  }
  // Serving-only or unknown provider → derive from the class prefix.
  if (modelClass && modelClass.includes("/")) {
    return prettifyPrefix(modelClass.split("/")[0]);
  }
  // Last resort: keep the provider even if serving-only, so we never show blank
  // (better a serving name than nothing — but the class-derive above almost
  // always wins for these).
  return prov ?? null;
}

// ── Pricing tiers ──────────────────────────────────────────────────────────
//
// $ … $$$$$+  — a coarse cost band based on OUTPUT cost only. The "+" band is
// reserved for the extreme outliers (Fable / GPT Pro class). Thresholds are
// derived from the loaded set (relative to its median) because absolute point
// magnitudes will be curated in the DB later.

export type PriceTier = "$" | "$$" | "$$$" | "$$$$" | "$$$$$" | "$$$$$+";

export const PRICE_TIERS: PriceTier[] = [
  "$",
  "$$",
  "$$$",
  "$$$$",
  "$$$$$",
  "$$$$$+",
];

/** Build a tiering function from the set's output-cost distribution. */
export function makePriceTierFn(
  outputCosts: Array<number | null>,
): (cost: number | null) => PriceTier | null {
  const valid = outputCosts.filter(
    (c): c is number => typeof c === "number" && c > 0,
  );
  if (valid.length === 0) return () => null;
  const sorted = [...valid].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return (cost) => {
    if (typeof cost !== "number" || cost <= 0) return null;
    const r = cost / median;
    if (r < 0.5) return "$";
    if (r < 1) return "$$";
    if (r < 2) return "$$$";
    if (r < 5) return "$$$$";
    if (r < 15) return "$$$$$";
    return "$$$$$+";
  };
}
