/**
 * DERIVED loading slugs — the smart floor under the declared one.
 *
 * A kind that never declared `metadata.loading_component` used to fall all
 * the way through to the `generic` skeleton, which tells the reader nothing
 * about what is coming. On 2026-08-25 that was 354 of the 357 renderable
 * ACTIVE kinds: a backlog nobody can close one row at a time.
 *
 * So the fallback stops being dumb. A kind's own SCHEMA already says what
 * shape it is — a long prose body is a document, a list of structured items
 * is a list, image fields are media — and the loader whose silhouette
 * matches the finished component is derivable from exactly that. Every kind
 * therefore gets a shape-appropriate loader with zero authoring, zero DB
 * writes, and zero deploys.
 *
 * PRECEDENCE — declaration always wins:
 *   metadata.loading_component  →  this derivation  →  `generic`
 * so setting a slug is still the way to override, and the shape doctor's
 * `no-loading-component` yellow still reports the real authoring gap (a
 * derived loader is a good floor, not a substitute for a considered choice).
 *
 * The rules read the schema, never the instance value: derivation must be
 * stable for a kind, identical on every render, and available before a
 * single byte of the value has arrived.
 */

import type { KindSchema } from "@ai-matrx/content-ir";
import type { KindLoadingSlug } from "./kind-loading-slugs";

/** Field-name hints, matched case-insensitively against the whole name. */
const MEDIA_NAME = /(^|_)(image|images|photo|photos|thumbnail|cover_image|video|videos|audio|media)(_|$)/i;
const GALLERY_NAME = /(^|_)(gallery|images|photos|screenshots|slides_images)(_|$)/i;
const BODY_NAME =
  /(^|_)(body|article_body|content|markdown|text|prose|transcript|summary_long|full_text|report|essay|description_long)(_|$)/i;
const CODE_NAME = /(^|_)(code|snippet|source|diff|patch|sql|script)(_|$)/i;
/** Structured arrays that make the whole shape read as a DOCUMENT, not a list. */
const DOC_ARRAY_NAME = /(^|_)(sections|chapters|paragraphs|pages)(_|$)/i;
const CHART_NAME = /(^|_)(series|datapoints|data_points|metrics|chart|trend|timeseries)(_|$)/i;
const TIMELINE_NAME = /(^|_)(timeline|events|milestones|history|phases|periods)(_|$)/i;
const STEP_NAME = /(^|_)(steps|stages|progress|checklist|tasks)(_|$)/i;
const STAT_NAME = /(^|_)(stats|statistics|totals|counts|kpis|summary_stats)(_|$)/i;

/** A field that holds a list of STRUCTURED items (its own item kind). */
function isStructuredArray(field: { type: string }): boolean {
  return field.type === "array" || field.type === "json[]";
}

/** Long-form prose: a string field whose NAME says it carries a body. */
function isProseField(name: string, field: { type: string }): boolean {
  return field.type === "string" && BODY_NAME.test(name);
}

/**
 * The best-matching library slug for this schema, or null when nothing in the
 * shape is distinctive enough to beat the generic skeleton.
 *
 * Ordered most-specific first. The order encodes a judgment made with Arman
 * on 2026-08-24 while looking at real shapes: a kind with BOTH a prose body
 * and structured lists (a newsjacking article: `article_body` + quotes +
 * sources + faqs) reads as a DOCUMENT, because the body is what fills the
 * screen — the lists are supporting material.
 */
export function inferLoadingSlug(
  schema: KindSchema | undefined | null,
): KindLoadingSlug | null {
  if (!schema) return null;

  // A non-object root (a bare string/array kind) has no field map to read.
  if (schema.root) {
    if (schema.root.type === "string") return "document";
    if (isStructuredArray(schema.root)) return "list";
    return null;
  }

  // `__kind` is part of the DATA and appears in emitted schemas — it is a
  // marker, never a shape signal, so it never counts toward the field census.
  const entries = Object.entries(schema.fields ?? {}).filter(
    ([name]) => name !== "__kind",
  );
  if (entries.length === 0) return null;

  let hasProse = false;
  let hasDocArray = false;
  let structuredArrays = 0;
  let hasMedia = false;
  let hasGallery = false;
  let hasCode = false;
  let hasChart = false;
  let hasTimeline = false;
  let hasSteps = false;
  let hasStats = false;

  for (const [name, field] of entries) {
    if (!field || typeof field !== "object") continue;
    if (isProseField(name, field)) hasProse = true;
    if (isStructuredArray(field)) {
      structuredArrays += 1;
      if (DOC_ARRAY_NAME.test(name)) hasDocArray = true;
      if (GALLERY_NAME.test(name)) hasGallery = true;
      if (CHART_NAME.test(name)) hasChart = true;
      if (TIMELINE_NAME.test(name)) hasTimeline = true;
      if (STEP_NAME.test(name)) hasSteps = true;
      if (STAT_NAME.test(name)) hasStats = true;
    }
    if (MEDIA_NAME.test(name) && !isStructuredArray(field)) hasMedia = true;
    if (CODE_NAME.test(name) && field.type === "string") hasCode = true;
  }

  // Most specific silhouettes first.
  if (hasGallery) return "gallery";
  if (hasMedia) return "media";
  if (hasProse || hasDocArray) return "document";
  if (hasCode) return "code";
  if (hasTimeline) return "timeline";
  if (hasChart) return "chart";
  if (hasSteps) return "progress";
  if (hasStats) return "stat-grid";
  if (structuredArrays > 0) return "list";

  // All scalars: a small record reads as a card; a wide one as a form-ish
  // stack, which `card` also covers acceptably. Below the threshold there is
  // nothing distinctive to say — let `generic` handle it.
  if (entries.length >= 2 && entries.length <= 12) return "card";
  return null;
}
