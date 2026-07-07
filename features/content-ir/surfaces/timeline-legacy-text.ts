/**
 * `timeline_legacy_text` — the named parser strategy behind the `<timeline>`
 * XML surface (kind_surface: xml_tag/timeline → timeline).
 *
 * WRAPS the one existing legacy parser — `parseTimelineMarkdown`, the exact
 * code TimelineArtifact/TimelineBlock render `<timeline>` markdown through
 * today. It NEVER re-implements that grammar (### title, description
 * paragraph, `**Period**` headers, `- **Title** (Date) [Category] status`
 * bullets with indented descriptions); it only maps the parser's
 * `TimelineData` output onto the canonical timeline value, so the XML
 * surface converges to the SAME shape a `__kind` JSON arrival carries (THE
 * KEYSTONE).
 *
 * Mapping is faithful to the parser's COMPLETE output: the synthesized
 * event ids (`${period}-${index}` — the component keys completion tracking
 * on them), the "TBD" date default, and the title-as-description default
 * all carry through; `status`/`category`/set `description` appear only when
 * the parser produced them (its own `|| undefined` convention).
 *
 * Accepts BOTH host framings — the accumulator's region text includes the
 * literal tags (attribute-tolerant strip here; the parser itself only strips
 * bare `<timeline>`), the splitter's is inner-only. Returns null when the
 * region yields no period with events (the parser's empty result for
 * garbage input) — the caller treats null as parse failure: loud, legacy
 * rendering untouched.
 *
 * NOT registered anywhere yet — central integration adds this to
 * XML_PARSER_STRATEGIES in surfaces/xml-finalize.ts.
 */

import { parseTimelineMarkdown } from "@/components/mardown-display/blocks/timeline/parseTimelineMarkdown";
import { KIND_KEY } from "../core/kind-schema.types";

/** Opening tag with optional attributes, e.g. `<timeline>` — host framing. */
const OPENING_TAG_RE = /^\s*<timeline(?:\s[^>]*)?>/i;
const CLOSING_TAG = "</timeline>";

/**
 * Completed `<timeline>` region text → canonical timeline value, or null
 * when the region parses to no period (the caller falls back to legacy
 * rendering, loudly).
 */
export function timelineLegacyTextToKindValue(
  regionText: string,
): Record<string, unknown> | null {
  let inner = regionText.replace(OPENING_TAG_RE, "");
  const closeIdx = inner.toLowerCase().indexOf(CLOSING_TAG);
  if (closeIdx !== -1) inner = inner.slice(0, closeIdx);

  const parsed = parseTimelineMarkdown(inner);
  if (!parsed || parsed.periods.length === 0) return null;

  return {
    [KIND_KEY]: "timeline",
    title: parsed.title,
    // The parser emits `description: undefined` when absent — include the
    // key only when real so the canonical value (and its fingerprint) is
    // identical to what a __kind JSON arrival would carry.
    ...(parsed.description ? { description: parsed.description } : {}),
    periods: parsed.periods.map((period) => ({
      [KIND_KEY]: "timeline_period",
      period: period.period,
      events: period.events.map((event) => ({
        [KIND_KEY]: "timeline_event",
        id: event.id,
        title: event.title,
        date: event.date,
        description: event.description,
        ...(event.status ? { status: event.status } : {}),
        ...(event.category ? { category: event.category } : {}),
      })),
    })),
  };
}
