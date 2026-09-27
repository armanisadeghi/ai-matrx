/**
 * features/knowledge/hub/hubAgentSurface.ts — the hub carries the Knowledge
 * Library agent surface (`matrx-user/knowledge-library`) the retired Sources
 * page emitted: the same scope (Sources on screen) and the same two write
 * handlers, now acting on the hub (KNOWLEDGE-HUB §8 H6a).
 *
 *   library_filters      {search_query?, status_filter?: "all"} → the hub's
 *                        search words; "all" shows every Source.
 *   selected_document_id "<source id>" → opens that Source in the peek.
 *
 * Pure over injected callbacks; unknown keys and ids are refused by name with
 * nothing changed.
 */

import type { KnowledgeHit } from "@/features/knowledge/api/knowledgeSearch";
import type { LibraryDocSummary } from "@/features/rag/types/library";
import type { SourceFacts } from "@/features/sources/sourceRows";
import { stageSourceId } from "@/features/knowledge/hub/hubStage";

export const HUB_LIBRARY_SURFACE = "matrx-user/knowledge-library";

export interface HubAgentCallbacks {
  /** Set the hub's search words. */
  setSearch: (text: string) => void;
  /** Show every Source (the old "all captures"). */
  showAllSources: () => void;
  /** Source ids currently listed. */
  listedSourceIds: () => ReadonlySet<string>;
  /** Open one Source in the peek. */
  openSource: (id: string) => void;
}

export function buildHubWriteHandlers(cb: HubAgentCallbacks): Record<string, (value: unknown) => void> {
  return {
    library_filters: (value: unknown) => {
      const raw = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new Error('library_filters expects an object such as {"search_query": "invoice"}.');
      const input = raw as Record<string, unknown>;
      const bad = Object.keys(input).filter((k) => k !== "search_query" && k !== "status_filter");
      if (bad.length) throw new Error(`library_filters received unknown key(s): ${bad.join(", ")}. Nothing was changed.`);
      if ("status_filter" in input && input.status_filter !== "all")
        throw new Error(
          'The Knowledge hub filters Sources by Stage in its filter menu; library_filters accepts only status_filter "all". Nothing was changed.',
        );
      if ("search_query" in input && typeof input.search_query !== "string")
        throw new Error("library_filters.search_query expects a string.");
      if (input.status_filter === "all") cb.showAllSources();
      if (typeof input.search_query === "string") cb.setSearch(input.search_query);
    },
    selected_document_id: (value: unknown) => {
      if (typeof value !== "string" || !value.trim())
        throw new Error("selected_document_id expects a Source id listed in the Knowledge hub.");
      const id = value.trim();
      if (!cb.listedSourceIds().has(id))
        throw new Error(`"${id}" is not a Source listed in the Knowledge hub right now, so nothing was opened.`);
      cb.openSource(id);
    },
  };
}

/** The listed Sources in the surface's declared row shape. */
export function hubSourceSummaries(
  hits: KnowledgeHit[],
  facts: ReadonlyMap<string, SourceFacts>,
): LibraryDocSummary[] {
  const seen = new Set<string>();
  const out: LibraryDocSummary[] = [];
  for (const h of hits) {
    const id = stageSourceId(h);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const f = facts.get(id);
    const chunks = f?.currentChunkCount ?? 0;
    out.push({
      id,
      name: h.segment?.source_title || h.title,
      sourceKind: h.source_kind ?? "unknown",
      sourceId: id,
      mimeType: null,
      totalPages: null,
      pagesPersisted: 0,
      chunks,
      embeddingsOai: 0,
      embeddingsVoyage: 0,
      dataStoreCount: f?.attachments.filter((a) => a.target_type === "data_store").length ?? 0,
      hasStructuredJson: false,
      derivationKind: "unknown",
      parentProcessedId: null,
      status: chunks > 0 ? "ready" : "extracted",
      createdAt: h.created_at ?? h.updated_at ?? "",
      updatedAt: h.updated_at ?? h.created_at ?? "",
    });
  }
  return out;
}
