/**
 * agent-output-filter — the composer's Output TYPES narrow the agent picker
 * (Arman, 2026-10-04: "For filtering by output type such as image, text, etc.
 * that's easy … do it now").
 *
 * The signal is the agent's MODEL: an agent passes when its model's output
 * modalities include ANY modality the chosen types map to. Types with no model
 * modality (Document, Spreadsheet, Presentation, PDF, Code, Data) do not
 * filter. The default (Text only) — or any choice that maps to text alone —
 * shows everything. An agent whose model or modalities are unknown is shown.
 *
 * PURE — no React, no Redux — so it is unit-testable.
 */

import { outputTypeLabel } from "./output-selection";

/** Output type id → the model output modality it asks for. */
export const OUTPUT_TYPE_MODALITY: Readonly<Record<string, string>> = {
  text: "text",
  image: "image",
  audio: "audio",
  voice: "audio",
  music: "audio",
  video: "video",
};

export interface AgentOutputFilterSpec {
  /** The picker chip's words, e.g. "Makes: Image". */
  label: string;
  /** Model output modalities that satisfy the filter. */
  modalities: string[];
}

/** The filter the chosen types ask for, or `null` when they ask for none. */
export function agentOutputFilterSpec(types: readonly string[]): AgentOutputFilterSpec | null {
  const modalities: string[] = [];
  const labels: string[] = [];
  for (const type of types) {
    const modality = OUTPUT_TYPE_MODALITY[type];
    if (!modality) continue;
    labels.push(outputTypeLabel(type));
    if (!modalities.includes(modality)) modalities.push(modality);
  }
  if (modalities.length === 0) return null;
  if (modalities.length === 1 && modalities[0] === "text") return null;
  return { label: `Makes: ${labels.join(", ")}`, modalities };
}

/** A model's output modalities from its canonical `capabilities`, or `null`. */
export function modelOutputModalities(capabilities: unknown): string[] | null {
  if (!capabilities || typeof capabilities !== "object") return null;
  const output = (capabilities as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;
  const list = output.filter((value): value is string => typeof value === "string");
  return list.length > 0 ? list : null;
}

/** Does a model with these outputs satisfy the filter? Unknown → yes. */
export function modelMakesAny(outputs: readonly string[] | null, wanted: readonly string[]): boolean {
  if (!outputs) return true;
  return wanted.some(
    // A decision model answers typed questions instead of writing; it serves
    // a text ask (the same rule the model picker applies to agent models).
    (want) => outputs.includes(want) || (want === "text" && outputs.includes("decision")),
  );
}
