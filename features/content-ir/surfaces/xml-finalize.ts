/**
 * XML-region finalize convergence — THE KEYSTONE hook (Shape System Stage 1).
 *
 * When a host (stream-block-accumulator / content-splitter-v2) COMPLETES an
 * XML region whose tag resolves through the surface registry, the named
 * parser strategy runs once over the region text, the canonical value wraps
 * into a complete envelope (the same assembler the structured-persistence
 * path uses), and the block's `metadata.__ir` carries it with the XML
 * discriminator — from there the block routes through the SAME kind pipeline
 * a `__kind` JSON arrival takes (`applyIrKindRoute`). Streaming is
 * untouched: today's per-tag skeleton renders until the region completes;
 * convergence happens at COMPLETE only, mirroring the envelope-cache
 * complete-only law.
 *
 * Failure posture: LOUD fail-open. A missing strategy, a throw, or a
 * no-value parse leaves today's rendering untouched and emits exactly ONE
 * console.error per (tag, region source) — the memo carries the null so the
 * hot re-split path never spams. Results are memoized by source text so
 * repeated re-splits of the same message return the SAME envelope object
 * (reference equality → React bail-outs), matching region-envelope-memo.
 */

import type { CanonicalBlockIR, IrDiscriminator } from "@ai-matrx/content-ir";
import { fenceDiscriminator, xmlDiscriminator } from "@ai-matrx/content-ir";
import { envelopeFromCompleteValue } from "@/features/content-ir/registry/kind-correctors";
import { kindRegistry } from "../registry/kind-registry";
import { surfaceRegistry } from "../registry/surface-registry";
import { flashcardsLegacyTextToKindValue } from "./flashcards-legacy-text";
import { mermaidLegacyTextToKindValue } from "./mermaid-legacy-text";
import { tasksLegacyTextToKindValue } from "./tasks-legacy-text";
import { resourcesLegacyTextToKindValue } from "./resources-legacy-text";
import { progressTrackerLegacyTextToKindValue } from "./progress-tracker-legacy-text";
import { timelineLegacyTextToKindValue } from "./timeline-legacy-text";
import { structuredInfoLegacyTextToKindValue } from "./structured-info-legacy-text";
import { transcriptLegacyTextToKindValue } from "./transcript-legacy-text";
import { troubleshootingLegacyTextToKindValue } from "./troubleshooting-legacy-text";
import { cookingRecipeLegacyTextToKindValue } from "./cooking-recipe-legacy-text";
import { researchLegacyTextToKindValue } from "./research-legacy-text";
import { questionnaireLegacyTextToKindValue } from "./questionnaire-legacy-text";

type SurfaceParserStrategy = (
  regionText: string,
) => Record<string, unknown> | null;

/**
 * Named strategy implementations (SHAPE_SYSTEM.md R2). Keys are
 * `kind_surface.parser_strategy` values; every implementation WRAPS an
 * existing parser — a second grammar for a surface is the exact duplication
 * this registry exists to kill.
 */
const SURFACE_PARSER_STRATEGIES: Record<string, SurfaceParserStrategy> = {
  flashcards_legacy_text: flashcardsLegacyTextToKindValue,
  mermaid_legacy_text: mermaidLegacyTextToKindValue,
  tasks_legacy_text: tasksLegacyTextToKindValue,
  resources_legacy_text: resourcesLegacyTextToKindValue,
  progress_tracker_legacy_text: progressTrackerLegacyTextToKindValue,
  timeline_legacy_text: timelineLegacyTextToKindValue,
  structured_info_legacy_text: structuredInfoLegacyTextToKindValue,
  transcript_legacy_text: transcriptLegacyTextToKindValue,
  troubleshooting_legacy_text: troubleshootingLegacyTextToKindValue,
  cooking_recipe_legacy_text: cookingRecipeLegacyTextToKindValue,
  research_legacy_text: researchLegacyTextToKindValue,
  // One strategy, two surfaces: `questionnaire` is detected as BOTH an XML tag
  // and a fence language, and both framings carry the same body grammar.
  questionnaire_legacy_text: questionnaireLegacyTextToKindValue,
};

/** Shared strategy-run core for the XML and FENCE hooks: memoized, LOUD fail-open. */
function envelopeForCompletedRegion(
  surfaceLabel: "xml" | "fence",
  token: string,
  parserStrategy: string,
  kind: string,
  regionText: string,
  discriminator: IrDiscriminator,
): CanonicalBlockIR | null {
  const memoKey = `${surfaceLabel} ${token} ${regionText}`;
  const cached = memo.get(memoKey);
  if (cached !== undefined) return cached;

  let envelope: CanonicalBlockIR | null = null;
  const strategy = SURFACE_PARSER_STRATEGIES[parserStrategy];
  if (!strategy) {
    console.error(
      `[content-ir] ${surfaceLabel} surface "${token}" names parser strategy "${parserStrategy}", which this build does not implement — region left on legacy rendering`,
    );
  } else {
    try {
      const value = strategy(regionText);
      if (value) {
        envelope = envelopeFromCompleteValue(value, kind, { discriminator });
      } else {
        console.error(
          `[content-ir] ${surfaceLabel} surface "${token}" strategy "${parserStrategy}" produced no canonical value — region left on legacy rendering`,
        );
      }
    } catch (error) {
      console.error(
        `[content-ir] ${surfaceLabel} surface "${token}" strategy "${parserStrategy}" threw — region left on legacy rendering`,
        error,
      );
    }
  }

  if (memo.size >= MEMO_CAP) memo.clear();
  memo.set(memoKey, envelope);
  return envelope;
}

/** `tag\0source` → envelope (null = convergence failed; stays failed). */
const memo = new Map<string, CanonicalBlockIR | null>();
const MEMO_CAP = 200;

/**
 * Non-blocking warm kick for DB-merged detection surfaces (memoized) — later
 * regions see the merged rows; the CURRENT lookup always answers from the
 * compiled bootstrap snapshot, which needs no fetch.
 *
 * 🚨 THE ZERO-PREFETCH LAW (Arman, 2026-08-31): this used to fire on EVERY
 * completed fence or XML region — a plain ```python block or a kindless
 * ```json fence fetched `content_ir.kind_surface` for a session that never
 * met a kind. The warm now waits until a kind signal has demanded Content-IR
 * this session. Guard: `__tests__/zero-prefetch-law.test.ts`.
 */
function warmSurfacesOnlyAfterKindSignal(): void {
  if (kindRegistry.hasBeenDemanded()) void surfaceRegistry.ensureWarm();
}

/**
 * Envelope for a COMPLETED xml region, or null when the tag has no surface
 * entry / the strategy fails (legacy rendering stands either way). Callers:
 * the accumulator's region close and the splitter's one-shot XML block path
 * — each consults this exactly once per completed region.
 */
export function envelopeForCompletedXmlRegion(
  tag: string,
  regionText: string,
): CanonicalBlockIR | null {
  warmSurfacesOnlyAfterKindSignal();

  const surface = surfaceRegistry.getSurfaceForTag(tag);
  if (!surface) return null;

  return envelopeForCompletedRegion(
    "xml",
    tag,
    surface.parserStrategy,
    surface.kind,
    regionText,
    xmlDiscriminator(tag),
  );
}

/**
 * The fence twin: envelope for a COMPLETED fence region whose language
 * resolves through the surface registry, or null (legacy rendering stands).
 * Callers pass the normalized language and the INNER body (fence chrome is
 * host-side framing, not content) and consult this exactly once per completed
 * region, complete-only like the XML hook.
 */
export function envelopeForCompletedFenceRegion(
  language: string,
  regionText: string,
): CanonicalBlockIR | null {
  warmSurfacesOnlyAfterKindSignal();

  const surface = surfaceRegistry.getSurfaceForFence(language);
  if (!surface) return null;

  return envelopeForCompletedRegion(
    "fence",
    language,
    surface.parserStrategy,
    surface.kind,
    regionText,
    fenceDiscriminator(language),
  );
}
