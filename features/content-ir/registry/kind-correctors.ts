/**
 * Kind correctors — a registered kind's value made to agree with its own rules at PARSE
 * time, before any renderer sees it. The client twin of aidream's
 * `matrx_ai/processing/blocks/kind_correctors.py`: the server corrects the envelopes it
 * stamps; this corrects the regions the browser parses itself (`memoizedRegionEnvelope` —
 * DB-loaded messages, the hot re-split, the terminal rehydrate).
 *
 * Why at parse and not in a renderer: a kind can be drawn by a compiled bridge, a db
 * component, or the generic fallback, and any one that forgot would show the model's
 * arithmetic. `draft_critique` (the Tough Editor) is the first: "the scale mapping is
 * applied by code from the points, so the score can never disagree with the rubric".
 *
 * Never silent: every change is returned (and rides the block as
 * `metadata[KIND_CORRECTIONS_KEY]` for the renderer to show) and warned. A corrector that
 * cannot run leaves the value as written and says it could not be checked.
 */

import { correctDraftCritique, type DraftCritique } from "@/features/crm/draft-critique/draftCritique";

/** Block metadata key carrying the corrections made to a kind's value (same as aidream). */
export const KIND_CORRECTIONS_KEY = "kindCorrections";

type KindCorrector = (value: Record<string, unknown>) => {
  value: Record<string, unknown>;
  corrections: string[];
};

const CORRECTORS: Record<string, KindCorrector> = {
  draft_critique: (value) => {
    const result = correctDraftCritique(value as DraftCritique);
    return { value: result.critique, corrections: result.corrections };
  },
};

/**
 * The region source to parse instead of `source`, with the corrections made — or null
 * when the region is not JSON, names no kind with a corrector, or is already correct.
 */
export function correctKindRegionSource(
  source: string,
): { source: string; corrections: string[] } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source.trim());
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const value = parsed as Record<string, unknown>;
  const slug = value.__kind;
  const corrector = typeof slug === "string" ? CORRECTORS[slug] : undefined;
  if (!corrector) return null;
  try {
    const out = corrector(value);
    if (out.corrections.length === 0) return null;
    console.warn(`[content-ir] ${slug} corrected at parse: ${out.corrections.join("; ")}`);
    return { source: JSON.stringify(out.value, null, 2), corrections: out.corrections };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[content-ir] ${slug} corrector failed: ${reason} — shown as written`);
    return {
      source,
      corrections: [`${slug} could not be checked against its own rules (${reason}); shown as written`],
    };
  }
}
