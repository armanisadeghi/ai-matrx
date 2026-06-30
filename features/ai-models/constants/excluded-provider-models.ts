/**
 * Provider model IDs listed by vendor APIs that we deliberately do not track
 * in the Matrx registry. Provider sync shows these as "Excluded" — not
 * "Not in DB".
 *
 * Keys match provider-sync fetcher keys (`anthropic`, `openai`, `groq`).
 */
export const EXCLUDED_PROVIDER_MODEL_IDS: Readonly<
  Record<string, readonly string[]>
> = {
  anthropic: ["claude-opus-4-5-20251101"],
  openai: [
    "o4-mini-deep-research-2025-06-26",
    "o3-deep-research-2025-06-26",
    "gpt-4o-transcribe-diarize",
  ],
} as const;

export function isExcludedProviderModel(
  providerKey: string | null | undefined,
  modelId: string,
): boolean {
  if (!providerKey) return false;
  const list = EXCLUDED_PROVIDER_MODEL_IDS[providerKey.toLowerCase()];
  if (!list) return false;
  return list.includes(modelId);
}
