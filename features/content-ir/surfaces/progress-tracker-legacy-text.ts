/**
 * `progress_tracker_legacy_text` — the named parser strategy behind the
 * `<progress_tracker>` XML surface (kind_surface: xml_tag/progress_tracker →
 * progress_tracker).
 *
 * WRAPS the one existing legacy markdown parser — `parseProgressMarkdown`,
 * the exact code ProgressArtifact renders raw `<progress_tracker>` region
 * text through today ("### Title" / "**Category** (N% complete)" /
 * "- [x] task {priority} (2h) [optional] [category:Name]"). It NEVER
 * re-implements that grammar; it only maps the parser's structured output
 * onto the canonical progress_tracker value, so the XML surface converges to
 * the SAME shape a `__kind` JSON arrival carries (THE KEYSTONE).
 *
 * The parser's synthesized ids (`category-N` / `item-N`) and computed totals
 * (`overallProgress` / `totalItems` / `completedItems`) travel into the
 * canonical value: they are part of the component's ProgressTrackerData
 * contract (interaction state is keyed by item id), they are deterministic
 * for a given region text, and the envelope fingerprint hashes the value —
 * so both hosts (accumulator region close, splitter one-shot) produce
 * identical envelopes by construction.
 *
 * A region whose inner text yields no category with at least one checkbox
 * item (`validateProgressTracker`'s floor) returns null — the caller treats
 * that as parse failure: loud, legacy rendering untouched.
 *
 * NOT registered in surfaces/xml-finalize.ts SURFACE_PARSER_STRATEGIES yet —
 * that wiring (plus flipping the kind_surface row active) is the separate
 * integration step, mirroring how the kind rows ship is_active=false.
 */

import {
  parseProgressMarkdown,
  validateProgressTracker,
} from "@/components/mardown-display/blocks/progress/parseProgressMarkdown";
import { KIND_KEY } from "../core/kind-schema.types";

/** Opening tag with optional attributes, e.g. `<progress_tracker>` — host framing. */
const OPENING_TAG_RE = /^\s*<progress_tracker(?:\s[^>]*)?>/i;
const CLOSING_TAG = "</progress_tracker>";

/**
 * Completed `<progress_tracker>` region text → canonical progress_tracker
 * value, or null when the region yields no renderable tracker.
 *
 * Accepts BOTH host framings — the accumulator's region text includes the
 * literal tags, the splitter's is inner-only. Framing is stripped before the
 * parse; unlike the flashcards strategy no completion sentinel is
 * re-appended because `parseProgressMarkdown` is line-based and needs none.
 */
export function progressTrackerLegacyTextToKindValue(
  regionText: string,
): Record<string, unknown> | null {
  let inner = regionText.replace(OPENING_TAG_RE, "");
  const closeIdx = inner.indexOf(CLOSING_TAG);
  if (closeIdx !== -1) inner = inner.slice(0, closeIdx);

  const tracker = parseProgressMarkdown(inner);
  if (!validateProgressTracker(tracker)) return null;

  const value: Record<string, unknown> = {
    [KIND_KEY]: "progress_tracker",
    title: tracker.title,
    phases: tracker.categories.map((category) => {
      const phase: Record<string, unknown> = {
        [KIND_KEY]: "progress_phase",
        id: category.id,
        name: category.name,
        steps: category.items.map((item) => {
          const step: Record<string, unknown> = {
            [KIND_KEY]: "progress_step",
            id: item.id,
            text: item.text,
            completed: item.completed,
          };
          if (item.optional === true) step.optional = true;
          if (item.priority !== undefined) step.priority = item.priority;
          if (item.estimatedHours !== undefined) {
            step.estimated_hours = item.estimatedHours;
          }
          if (item.category !== undefined) step.category = item.category;
          return step;
        }),
      };
      if (category.description !== undefined) {
        phase.description = category.description;
      }
      if (category.color !== undefined) phase.color = category.color;
      if (category.completionPercentage !== undefined) {
        phase.completion_percentage = category.completionPercentage;
      }
      return phase;
    }),
  };

  if (tracker.description !== undefined) {
    value.description = tracker.description;
  }
  if (tracker.overallProgress !== undefined) {
    value.overall_progress = tracker.overallProgress;
  }
  if (tracker.totalItems !== undefined) value.total_items = tracker.totalItems;
  if (tracker.completedItems !== undefined) {
    value.completed_items = tracker.completedItems;
  }

  return value;
}
