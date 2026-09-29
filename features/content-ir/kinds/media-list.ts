/**
 * Compiled parser mirrors for the media list ranker's kinds — `media_list_ranking_result` and its item
 * kind `media_candidate_verdict` (crm.media_list_ranker, Brief 3).
 *
 * THE DATABASE ROWS ARE THE SCHEMA OF RECORD (aidream `aidream/kinds/media_list.py`, published to
 * `content_ir.kind_definition`; payload types in `kinds/generated/kinds.generated.ts`). These schemas
 * exist only so a streaming `__kind` payload reaches the canonical renderer
 * (`components/mardown-display/blocks/media-list/`) before the registry warm completes.
 *
 * Streaming bridge: the uniform `{ value, isComplete }` wrapper — each candidate renders the moment
 * it parses; nothing waits for the complete object.
 */

import type { KindDefinition, KindSchema } from "@ai-matrx/content-ir";
import { KIND_KEY } from "@ai-matrx/content-ir";

import { makeSearchKindBridge } from "./search-results";
import { additionalDetailsSection, collectExtras, joinBlocks } from "./kind-markdown-utils";

export const MEDIA_LIST_RANKING_KIND = "media_list_ranking_result";
export const MEDIA_CANDIDATE_VERDICT_KIND = "media_candidate_verdict";

export const mediaCandidateVerdictKindSchema: KindSchema = {
  kind: MEDIA_CANDIDATE_VERDICT_KIND,
  fields: {
    id: { type: "string", required: true },
    status: {
      type: "enum",
      values: ["fit", "soft_fit", "research_needed", "cut"],
      required: true,
    },
    rank: { type: "number", required: true },
    anchor: { type: "inline_object", open: true, fields: {}, nullable: true },
    why_them: { type: "string", required: true },
    pitch_note: { type: "string", nullable: true },
    cut_reason: { type: "string", nullable: true },
    contact_state: { type: "enum", values: ["verified", "quarantined", "unresolved"], required: true },
    reachability: { type: "enum", values: ["confirmed", "candidate_only", "none", "unknown"], required: true },
    concerns: { type: "string[]" },
  },
};

export const mediaListRankingKindSchema: KindSchema = {
  kind: MEDIA_LIST_RANKING_KIND,
  fields: {
    results: { type: "array", itemKinds: [MEDIA_CANDIDATE_VERDICT_KIND] },
    summary: { type: "inline_object", open: true, fields: {}, required: true },
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const STATUS_LABEL: Record<string, string> = {
  fit: "Fit",
  soft_fit: "Soft fit",
  research_needed: "Research needed",
  cut: "Cut",
};

export function mediaCandidateLine(item: Record<string, unknown>): string {
  const status = STATUS_LABEL[text(item.status)] ?? text(item.status);
  const anchor = isRecord(item.anchor) ? item.anchor : null;
  const anchorLine =
    anchor && text(anchor.title)
      ? ` — [${text(anchor.title)}](${text(anchor.url)}) (${text(anchor.published_at)})`
      : "";
  const lines = [`- **${text(item.id)}** · ${status}${anchorLine}`];
  if (text(item.why_them)) lines.push(`  ${text(item.why_them)}`);
  if (text(item.pitch_note)) lines.push(`  Pitch: ${text(item.pitch_note)}`);
  if (text(item.cut_reason)) lines.push(`  Cut: ${text(item.cut_reason).replaceAll("_", " ")}`);
  return lines.join("\n");
}

const MD_KNOWN_KEYS = ["results", "summary", KIND_KEY];

export function mediaListRankingMarkdownFromValue(value: Record<string, unknown>): string {
  const results = Array.isArray(value.results) ? value.results.filter(isRecord) : [];
  const summary = isRecord(value.summary) ? value.summary : null;
  return joinBlocks([
    results.length > 0 ? results.map(mediaCandidateLine).join("\n") : null,
    summary
      ? `**Asked for** ${summary.requested ?? "—"} · **researched** ${summary.research_target ?? "—"} · ` +
        `**resolved** ${summary.resolved ?? "—"} · **first wave** ${summary.first_wave ?? "—"}`
      : null,
    additionalDetailsSection(collectExtras(value, MD_KNOWN_KEYS)),
  ]);
}

export const MEDIA_LIST_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: MEDIA_LIST_RANKING_KIND,
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: MEDIA_LIST_RANKING_KIND,
    toLegacyServerData: makeSearchKindBridge(MEDIA_LIST_RANKING_KIND),
    toMarkdown: mediaListRankingMarkdownFromValue,
    persistence: { persistStructured: true },
    schema: mediaListRankingKindSchema,
  },
  {
    kind: MEDIA_CANDIDATE_VERDICT_KIND,
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: MEDIA_CANDIDATE_VERDICT_KIND,
    toLegacyServerData: makeSearchKindBridge(MEDIA_CANDIDATE_VERDICT_KIND),
    toMarkdown: (value) => mediaCandidateLine(value),
    persistence: { persistStructured: true },
    schema: mediaCandidateVerdictKindSchema,
  },
];
