import type { AiModel } from "./types";

export const AI_MODELS_LOCATION =
  "AI Matrx Admin — AI Models (/administration/ai-models)";

/** Human-readable, multi-line summary of a single AI model row. */
export function aiModelSummary(m: AiModel): string {
  return [
    `Model: ${m.common_name || m.name}`,
    `Provider: ${m.model_provider ?? m.provider ?? "—"}`,
    `Class: ${m.model_class ?? "—"}${m.api_class ? ` (api: ${m.api_class})` : ""}`,
    `ID: ${m.id}`,
    `Context window: ${m.context_window ?? "—"}`,
    `Max tokens: ${m.max_tokens ?? "—"}`,
    `Flags: ${[
      m.is_primary ? "primary" : null,
      m.is_premium ? "premium" : null,
      m.is_deprecated ? "deprecated" : null,
    ]
      .filter(Boolean)
      .join(", ") || "—"}`,
  ].join("\n");
}
