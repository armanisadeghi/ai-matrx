/**
 * THE PLANNER — one pure function shared by the preview and the result.
 *
 * The research context builder's discipline, generalised: the review shows a
 * number only if the returned `SourceSet` will carry exactly that. So the
 * screen, the budget verdict and the output all come from `planSourceReview`,
 * and nothing else does arithmetic.
 *
 * It mirrors the ONE server handler (aidream
 * `services/conversation_context/source_resolution.py`) rule for rule:
 * - chosen form = the ref's `representation`, else the manifest's `default_form`;
 * - picked parts (`include_segments`) replace the whole form;
 * - `max_chars` keeps whole parts in order until the next one would overflow
 *   (`_cap`), cutting only a first part that is bigger than the cap by itself;
 * - the resolved text is the parts rendered as `### Chunk <id> (page N)` blocks
 *   joined by a blank line (`render_grounded_chunk` / `_render`), so the count
 *   here INCLUDES those headers and matches `POST /sources/resolve` exactly
 *   whenever the manifest lists the parts;
 * - "let the AI look it up" (`delivery: "context"`) sends no text at all;
 * - Sources are budgeted in order and one that would overflow is left out,
 *   while later, smaller ones may still go in.
 *
 * Budget tokens use the ONE client estimator (`lib/tokens/estimate.ts`,
 * conservative). The server checks its window with a laxer ratio, so any set
 * this planner says fits, the server also says fits — and Sources the planner
 * leaves out are REMOVED from the returned set (named on screen first), so
 * the server never drops something the review showed as going in.
 */

import type {
  SourceManifest,
  SourceManifestEntry,
  SourceManifestSegment,
  SourceRef,
  SourceSet,
} from "@ai-matrx/agents/sources";
import { createSourceRef, createSourceSet } from "@ai-matrx/agents/sources";
import { estimateTokens } from "@/lib/tokens/estimate";

/** How close to the window counts as "Getting heavy" (the champion's 70%). */
export const HEAVY_SHARE = 0.7;

export type SourcePlanStatus =
  /** Its text goes in. */
  | "included"
  /** The AI looks it up on demand — no text is sent up front. */
  | "on_demand"
  /** Does not fit in what is left of the window — removed from the result. */
  | "left_out"
  /** Cannot be used at all (no access, missing, failed). Kept so the host can show it. */
  | "unusable";

export interface SourcePlanEntry {
  index: number;
  ref: SourceRef;
  entry: SourceManifestEntry;
  status: SourcePlanStatus;
  /** Label of the form in use. */
  formLabel: string;
  /** Characters of the chosen form before parts/cap. */
  formChars: number;
  /** Characters the model receives for this Source (grounding headers included). */
  sentChars: number;
  sentTokens: number;
  /** True when parts are known, so `sentChars` is exact; false = the text body only. */
  exact: boolean;
  /** Number of parts that go in, when parts are known. */
  partsSent: number | null;
  partsTotal: number | null;
  /** The per-Source cap cut something. */
  capped: boolean;
}

export type BudgetVerdict = "empty" | "fine" | "heavy" | "too_much";

export interface SourcePlan {
  entries: SourcePlanEntry[];
  sentChars: number;
  sentTokens: number;
  /** Window the verdict is judged against. */
  windowTokens: number;
  /** True when the window is the labelled default, not the model's own. */
  windowIsFallback: boolean;
  verdict: BudgetVerdict;
  /** Share of the window used, 0..∞. */
  share: number;
  leftOut: SourcePlanEntry[];
  /** Exactly what the review returns. */
  sourceSet: SourceSet;
}

// ---------------------------------------------------------------------------

const PAGE_SUFFIX = (page: number | undefined) =>
  page !== undefined && page > 0 ? ` (page ${page})` : "";

/** Length of one rendered grounding block: `### Chunk <id>[ (page N)]\n<text>`. */
export function renderedPartChars(segment: { id: string; page?: number }, chars: number): number {
  return `### Chunk ${segment.id}${PAGE_SUFFIX(segment.page)}`.length + 1 + chars;
}

/** The server's `_cap`: whole parts in order; only a lone first part is cut. */
function capParts(
  parts: SourceManifestSegment[],
  maxChars: number | undefined,
): { kept: Array<{ seg: SourceManifestSegment; chars: number }>; capped: boolean } {
  if (!maxChars) return { kept: parts.map((seg) => ({ seg, chars: seg.chars })), capped: false };
  const kept: Array<{ seg: SourceManifestSegment; chars: number }> = [];
  let used = 0;
  for (const seg of parts) {
    if (used + seg.chars <= maxChars) {
      kept.push({ seg, chars: seg.chars });
      used += seg.chars;
      continue;
    }
    const room = maxChars - used;
    if (room > 0 && kept.length === 0) kept.push({ seg, chars: room });
    return { kept, capped: true };
  }
  return { kept, capped: false };
}

export function chosenForm(entry: SourceManifestEntry, ref: SourceRef) {
  const key = ref.representation ?? entry.default_form;
  return (
    entry.forms.find((f) => f.form === key) ??
    entry.forms.find((f) => f.form === entry.default_form) ??
    null
  );
}

function isUsable(entry: SourceManifestEntry): boolean {
  return entry.state === "ready" || entry.state === "processing";
}

function measure(entry: SourceManifestEntry, ref: SourceRef) {
  const form = chosenForm(entry, ref);
  const formChars = form?.chars ?? 0;
  const formLabel = form?.label ?? "Text";
  const segments = entry.segments ?? null;
  if (segments && segments.length > 0) {
    const wanted = ref.include_segments?.length ? new Set(ref.include_segments) : null;
    const chosen = wanted ? segments.filter((s) => wanted.has(s.id)) : segments;
    const { kept, capped } = capParts(chosen, ref.max_chars);
    const body = kept.reduce((sum, k) => sum + renderedPartChars(k.seg, k.chars), 0);
    const sentChars = kept.length ? body + 2 * (kept.length - 1) : 0;
    return {
      formChars,
      formLabel,
      sentChars,
      exact: true,
      partsSent: kept.length,
      partsTotal: segments.length,
      capped,
    };
  }
  const capped = ref.max_chars !== undefined && formChars > ref.max_chars;
  return {
    formChars,
    formLabel,
    sentChars: capped ? (ref.max_chars ?? formChars) : formChars,
    exact: false,
    partsSent: null,
    partsTotal: null,
    capped,
  };
}

export interface PlanInput {
  manifest: SourceManifest;
  /** The person's current choices, index-aligned with `manifest.sources`. */
  refs: SourceRef[];
  /** The original set — carries topic / grounding / retrieve_query. */
  base: SourceSet;
  /** The model's window, or null when unknown. */
  modelWindowTokens: number | null;
  /** The labelled default used when the model is unknown. */
  fallbackWindowTokens: number;
  targetModelId?: string;
}

export function planSourceReview(input: PlanInput): SourcePlan {
  const windowIsFallback = !input.modelWindowTokens || input.modelWindowTokens <= 0;
  const windowTokens = windowIsFallback
    ? input.fallbackWindowTokens
    : (input.modelWindowTokens as number);

  let sentChars = 0;
  const entries: SourcePlanEntry[] = input.manifest.sources.map((entry, index) => {
    const ref = input.refs[index] ?? entry.ref;
    const m = measure(entry, ref);
    const base = { index, ref, entry, ...m };
    if (!isUsable(entry)) {
      return { ...base, status: "unusable" as const, sentChars: 0, sentTokens: 0 };
    }
    if (ref.delivery === "context") {
      return { ...base, status: "on_demand" as const, sentChars: 0, sentTokens: 0 };
    }
    if (estimateTokens(sentChars + m.sentChars) > windowTokens) {
      return { ...base, status: "left_out" as const, sentTokens: estimateTokens(m.sentChars) };
    }
    sentChars += m.sentChars;
    return { ...base, status: "included" as const, sentTokens: estimateTokens(m.sentChars) };
  });

  const sentTokens = estimateTokens(sentChars);
  const leftOut = entries.filter((e) => e.status === "left_out");
  const share = windowTokens > 0 ? sentTokens / windowTokens : 0;
  const anythingGoesIn = entries.some((e) => e.status === "included" || e.status === "on_demand");
  const verdict: BudgetVerdict = !anythingGoesIn && leftOut.length === 0
    ? "empty"
    : leftOut.length > 0
      ? "too_much"
      : share >= HEAVY_SHARE
        ? "heavy"
        : "fine";

  const kept = entries
    .filter((e) => e.status !== "left_out")
    .map((e) =>
      createSourceRef(e.ref.resource_type, e.ref.resource_id, {
        representation: e.ref.representation,
        include_segments: e.ref.include_segments,
        delivery: e.ref.delivery,
        max_chars: e.ref.max_chars,
        promote: e.ref.promote,
        exclude: e.ref.exclude,
      }),
    );
  const grounding =
    input.base.grounding === "selected" && !kept.some((r) => r.include_segments?.length)
      ? undefined
      : input.base.grounding;
  const sourceSet = createSourceSet(kept, {
    topic: input.base.topic,
    grounding,
    retrieve_query: input.base.retrieve_query,
    target_model_id: input.targetModelId ?? input.base.target_model_id,
  });

  return {
    entries,
    sentChars,
    sentTokens,
    windowTokens,
    windowIsFallback,
    verdict,
    share,
    leftOut,
    sourceSet,
  };
}
