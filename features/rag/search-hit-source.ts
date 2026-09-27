/**
 * features/rag/search-hit-source.ts
 *
 * How ONE Knowledge search result reads to a person: as its Source — the
 * Source's title, what kind of thing it is, where it came from, the site for a
 * web page — and where it opens: the Source screen at the matched chunk
 * (`/knowledge/sources/<id>?chunk=<chunk>`). Pure: the Source row is read in one
 * batch by `useSearchHitSources`; everything here is a function of the hit and
 * that row, so it is tested directly.
 *
 * Words come from the Sources page's own vocabulary (features/sources/sourceRows),
 * so "Web page" / "Extension · your browser" mean the same thing on both pages.
 * A result is never titled by an id (the 2026-09-27 audit found
 * "Transcript source 61cdb294").
 */

import type { RagSearchHit } from "@/features/rag/api/search";
import { normalizeSourceName } from "@/features/rag/components/hit-card/adapters";
import {
  SOURCE_KIND_LABEL,
  captureClientLabel,
  captureWords,
  listedSource,
  sourceKindGroup,
} from "@/features/sources/sourceRows";
import { sourceStudioPath } from "@/features/source-studio/sourceStudioModel";

/** The Source columns a result needs — nothing wider. */
export const SEARCH_HIT_SOURCE_COLUMNS =
  "id,name,source_kind,origin_client,capture_method,canonical_identity";

export interface SearchHitSourceRow {
  id: string;
  name: string | null;
  source_kind: string;
  origin_client: string | null;
  capture_method: string | null;
  canonical_identity: string | null;
}

export interface SearchHitSourceView {
  title: string;
  kindLabel: string;
  /** How it was captured, in words ("Extension · your browser"); null = unknown. */
  from: string | null;
  /** A web page's site ("example.com"); null for anything else. */
  site: string | null;
}

const EXTRA_KIND_LABEL: Record<string, string> = {
  library_doc: "Library document",
  task: "Task",
  project: "Project",
  research: "Research",
  cx_message: "Conversation",
};

function kindLabelFor(sourceKind: string): string {
  const group = sourceKindGroup(sourceKind);
  if (group !== "other") return SOURCE_KIND_LABEL[group];
  return EXTRA_KIND_LABEL[sourceKind] ?? SOURCE_KIND_LABEL.other;
}

function siteOf(identity: string | null): string | null {
  if (!identity || !/^https?:\/\//i.test(identity)) return null;
  try {
    return new URL(identity).hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

/** Where a result opens: the Source screen at the matched chunk. */
export function searchHitHref(
  hit: Pick<RagSearchHit, "processed_document_id" | "chunk_id">,
): string | null {
  if (!hit.processed_document_id) return null;
  return sourceStudioPath(hit.processed_document_id, { chunk: hit.chunk_id });
}

/**
 * The result's identity as a person reads it. `row` is the Source (null when
 * the hit has no Source row, e.g. a note chunk, or the row is not readable);
 * `fallbackName` is a name the hit itself carries (file name, metadata title).
 */
export function searchHitSourceView(
  hit: Pick<RagSearchHit, "source_kind" | "source_id">,
  row: SearchHitSourceRow | null,
  fallbackName?: string | null,
): SearchHitSourceView {
  const kind = row?.source_kind ?? hit.source_kind;
  const kindLabel = kindLabelFor(kind);
  const rowName = row?.name
    ? normalizeSourceName(listedSource({ name: row.name }).name, hit.source_id)
    : null;
  const title =
    rowName ??
    normalizeSourceName(fallbackName, hit.source_id) ??
    `Untitled ${kindLabel.toLowerCase()}`;
  const from = row
    ? captureWords({
        origin_client: row.origin_client,
        capture_method: row.capture_method,
        source_kind: row.source_kind,
      })
    : null;
  return {
    title,
    kindLabel,
    from: from === "Not recorded" ? null : from,
    site: sourceKindGroup(kind) === "web_page" ? siteOf(row?.canonical_identity ?? null) : null,
  };
}

export interface OriginFacet {
  origin: string;
  label: string;
  count: number;
}

/**
 * Count the RETURNED results by where their Source came from (Extension,
 * Research, YouTube…), so a person can narrow the list she is looking at. The
 * counts are of these results only — the page says so.
 */
export function originFacets(
  rows: readonly (Pick<SearchHitSourceRow, "origin_client"> & {
    source_kind?: string;
  } | null)[],
): OriginFacet[] {
  const counts = new Map<string, OriginFacet>();
  for (const row of rows) {
    if (!row?.origin_client) continue;
    const label = captureClientLabel({
      origin_client: row.origin_client,
      source_kind: row.source_kind ?? "",
    });
    const current = counts.get(row.origin_client);
    if (current) current.count += 1;
    else counts.set(row.origin_client, { origin: row.origin_client, label, count: 1 });
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );
}
