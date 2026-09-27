/**
 * features/knowledge/hub/hubStage.ts — the Stage facet (KNOWLEDGE-HUB §8 H6a):
 * where a Source stands for search, read from `docproc.source_list_facts`
 * (the same facts the retired Sources page's Stage column read).
 *
 *   not_searchable · indexing · searchable · stale · failed
 *
 * "failed" is honest about what the facts can say: the status read for that
 * Source failed, or entity extraction on its current version failed
 * (`entities_state = failed:<sentence>`). The facts carry no "processing job
 * failed" flag; a failed job leaves the Source "not yet searchable".
 *
 * The search service does not know stages, so the facet narrows the items
 * already loaded — the hub says so when more remain to load.
 */

import type { KnowledgeHit } from "@/features/knowledge/api/knowledgeSearch";
import { sourceStage, type SourceFacts } from "@/features/sources/sourceRows";
import { actionTarget } from "@/features/knowledge/hub/hubActions";

export type HubStage = "not_searchable" | "indexing" | "searchable" | "stale" | "failed";

export const HUB_STAGES: readonly HubStage[] = ["not_searchable", "indexing", "searchable", "stale", "failed"];

export const HUB_STAGE_LABEL: Record<HubStage, string> = {
  not_searchable: "Not yet searchable",
  indexing: "Indexing",
  searchable: "Searchable",
  stale: "Index stale",
  failed: "Failed",
};

/** The Source id a hit's stage is read for, or null (only Sources have a stage). */
export function stageSourceId(hit: KnowledgeHit): string | null {
  const t = actionTarget(hit);
  return t.entity === "processed_document" ? t.id : null;
}

/** One Source's stage bucket; null while its facts are still being read. */
export function stageOf(facts: SourceFacts | undefined, readFailed: boolean): HubStage | null {
  if (!facts) return readFailed ? "failed" : null;
  if (facts.entitiesState?.startsWith("failed")) return "failed";
  const s = sourceStage(facts);
  if (s === "entities") return "searchable";
  return s;
}

export function parseStages(raw: string | null | undefined): HubStage[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is HubStage => (HUB_STAGES as readonly string[]).includes(s));
}

/**
 * Narrow loaded hits to the chosen stages. With no stage chosen, every hit.
 * A hit that is not a Source has no stage, so it never matches a stage filter;
 * a Source whose facts are still being read is kept (never hidden on a guess).
 */
export function narrowByStage(
  hits: KnowledgeHit[],
  stages: readonly HubStage[],
  stageFor: (sourceId: string) => HubStage | null,
): KnowledgeHit[] {
  if (!stages.length) return hits;
  return hits.filter((h) => {
    const id = stageSourceId(h);
    if (!id) return false;
    const s = stageFor(id);
    return s === null || stages.includes(s);
  });
}

/** Counts per stage over the loaded Sources. */
export function stageCounts(hits: KnowledgeHit[], stageFor: (sourceId: string) => HubStage | null): Record<HubStage, number> {
  const out: Record<HubStage, number> = { not_searchable: 0, indexing: 0, searchable: 0, stale: 0, failed: 0 };
  const seen = new Set<string>();
  for (const h of hits) {
    const id = stageSourceId(h);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const s = stageFor(id);
    if (s) out[s] += 1;
  }
  return out;
}
