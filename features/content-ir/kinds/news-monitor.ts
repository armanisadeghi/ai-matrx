/**
 * The news engine's six reader-facing kinds (NEWS-ENGINE-SPEC §6, items 11–16)
 * → `NewsMonitorKindBlock` bridges (+ compiled bootstrap definitions).
 *
 *   news_digest              — the per-run receipt (surfaced, watch list with reasons, withheld, sources, cost)
 *   news_triage              — the triage job's pitch-ready / big story / watch verdicts
 *   news_angle_set           — the angles job's proposals for one story (nests news_angle)
 *   news_opportunity_report  — the report job's one channel-neutral render
 *   newsworthiness_verdict   — the newsworthiness check
 *   news_client_context      — what the judgment jobs were told about the client
 *
 * PYTHON-OWNED: the registry rows are published from the engine's own stage
 * contracts (aidream `aidream/kinds/news.py`, derived field-for-field from
 * `aidream/services/news/engine/models.py`) — THE DATABASE ROWS ARE THE SCHEMA
 * OF RECORD and override these once the registry is warm. The compiled schemas
 * below are the bootstrap floor only: each root field is typed `json` (opaque),
 * so the floor never refuses a payload the registry accepts; nesting and
 * validation belong to the registry schema.
 *
 * Complete-only bridges: `{ value }` is the envelope's value verbatim (markers
 * kept — the kind law). The components read defensively.
 */

import type { KindDefinition, KindSchema } from "@ai-matrx/content-ir";

import { makeCompleteEnvelopeBridge } from "./legacy-bridge-utils";
import { genericKindMarkdown } from "./kind-markdown-utils";

export const NEWS_MONITOR_KINDS = {
  digest: "news_digest",
  triage: "news_triage",
  angleSet: "news_angle_set",
  report: "news_opportunity_report",
  verdict: "newsworthiness_verdict",
  clientContext: "news_client_context",
} as const;

/** The render key `kind-route` sets `block.type` to — one block for the family. */
export const NEWS_MONITOR_BLOCK_TYPE = "news_monitor_kind";

/** Root fields per kind, in the engine model's order (json floor; the registry holds the real schema). */
const ROOT_FIELDS: Record<string, string[]> = {
  news_digest: [
    "version",
    "run_id",
    "tracker_id",
    "brand_id",
    "run_generated_at",
    "window",
    "mode",
    "headline",
    "surfaced",
    "watch",
    "watch_overflow",
    "watch_groups",
    "withheld",
    "source_health",
    "performers",
    "notices",
    "cost",
    "links",
  ],
  news_triage: ["triaged", "summary"],
  news_angle_set: ["signal_id", "angles", "refused", "uncomfortable_questions", "next_step"],
  news_opportunity_report: [
    "todays_read",
    "funnel",
    "sections",
    "disclosures",
    "monitor_notes",
    "brief_applied",
    "brief_edit_offer",
    "rendered_markdown",
  ],
  newsworthiness_verdict: [
    "score",
    "newsworthiness_band",
    "recommendation",
    "coverage_outlook",
    "summary",
    "closest_anchor",
    "dimensions",
    "caps_fired",
    "kill_switch",
    "weak_spots",
    "fixes",
    "evidence_used",
    "evidence_gaps",
    "handoff",
  ],
  news_client_context: [
    "run_generated_at",
    "tracker_id",
    "organization_id",
    "brand_id",
    "company",
    "facts",
    "competitors",
    "topics",
    "search_terms",
    "standing",
    "exclusions",
    "brief",
    "proof_on_file",
  ],
};

function floorSchema(kind: string): KindSchema {
  return {
    kind,
    fields: Object.fromEntries(
      (ROOT_FIELDS[kind] ?? []).map((name) => [name, { type: "json" as const }]),
    ),
  };
}

export interface NewsMonitorKindServerData extends Record<string, unknown> {
  value: Record<string, unknown>;
}

function definition(kind: string): KindDefinition {
  return {
    kind,
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: NEWS_MONITOR_BLOCK_TYPE,
    toLegacyServerData: makeCompleteEnvelopeBridge<NewsMonitorKindServerData>(
      kind,
      (value) => ({ value }),
    ),
    toMarkdown: (value) => genericKindMarkdown(kind, value),
    persistence: { persistStructured: true },
    schema: floorSchema(kind),
  };
}

export const NEWS_MONITOR_KIND_DEFINITIONS: KindDefinition[] = Object.values(
  NEWS_MONITOR_KINDS,
).map(definition);
