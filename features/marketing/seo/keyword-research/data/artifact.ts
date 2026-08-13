/**
 * Pure helpers for the durable keyword-research artifact
 * (`content_ir.kind_instance`, kind `keyword_relationship_research`).
 *
 * Deliberately free of any Supabase/browser import so a Server Component, an
 * anonymous share lens, and the signed-in workbench can all read the same
 * shape. `data/queries.ts` (browser client) consumes these — never the reverse.
 */

import { isRecord } from "@/features/content-ir/kinds/legacy-bridge-utils";
import type { KeywordResearchArtifact } from "@/types/python-generated/stream-events";

function keywordLists(value: unknown): KeywordResearchArtifact["keyword_lists"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    const list = isRecord(candidate) ? candidate : null;
    if (!list || typeof list.label !== "string") return [];
    const keywords = Array.isArray(list.keywords)
      ? list.keywords.filter(
          (keyword): keyword is string => typeof keyword === "string",
        )
      : [];
    return [{ label: list.label, keywords }];
  });
}

/**
 * Lenient read: anything carrying a `primary_keyword` is treated as research.
 * Used where the KIND is already known (the org-scoped saved-research reads).
 */
export function parseKeywordResearchArtifact(
  value: unknown,
): KeywordResearchArtifact | null {
  const record = isRecord(value) ? value : null;
  if (!record || typeof record.primary_keyword !== "string") return null;
  return {
    primary_keyword: record.primary_keyword,
    keyword_lists: keywordLists(record.keyword_lists),
  };
}

/**
 * STRICT read — the discriminator for the polymorphic
 * `content_ir_kind_instance` share token, whose public projection carries
 * `data` but not the kind. A payload without BOTH `primary_keyword` and a
 * `keyword_lists` array is some other kind (flashcard set, brief, deck…) and
 * must fall through to the generic lens, never into this report.
 */
export function readKeywordResearchArtifact(
  value: unknown,
): KeywordResearchArtifact | null {
  const record = isRecord(value) ? value : null;
  if (!record || typeof record.primary_keyword !== "string") return null;
  if (!Array.isArray(record.keyword_lists)) return null;
  return {
    primary_keyword: record.primary_keyword,
    keyword_lists: keywordLists(record.keyword_lists),
  };
}

/** Every phrase in the artifact (primary first) — the metrics join key set. */
export function keywordResearchPhrases(
  artifact: KeywordResearchArtifact,
): string[] {
  return [
    artifact.primary_keyword,
    ...(artifact.keyword_lists ?? []).flatMap((list) => list.keywords ?? []),
  ].filter((phrase): phrase is string => Boolean(phrase && phrase.trim()));
}
