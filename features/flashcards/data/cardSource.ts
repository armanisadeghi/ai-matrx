// features/flashcards/data/cardSource.ts
//
// Read-side of the `fc_card --source--> file` knowledge-lineage edge that
// `fcService.addCards` has written since generate-from-source shipped (edge
// metadata: {processed_document_id, chunk_id, page}). Nothing read this edge
// back until the card-level "See source" build (FastFire spec 26e) — this is
// its ONE reader. Mirrors exportExtras' media read (same RPC, different role
// filter); do not fork another per-card association reader.

import { associationsService } from "@/features/scopes/service/associationsService";
import type { CardSourceRef } from "@/features/education/trust/sourceRef";
import { EDGE_ROLE } from "./types";

/**
 * Batch-read each card's source lineage. One RPC for the whole deck; cards
 * with no `source` edge are simply absent from the result.
 */
export async function readCardSourceRefs(
  cardIds: string[],
): Promise<Record<string, CardSourceRef>> {
  const out: Record<string, CardSourceRef> = {};
  if (cardIds.length === 0) return out;
  const res = await associationsService.listForSources(
    "fc_card",
    cardIds,
    "file",
  );
  if (!res.ok) {
    console.error("[readCardSourceRefs] edge read failed:", res.error);
    return out;
  }
  for (const edge of res.data.edges) {
    if (edge.role !== EDGE_ROLE.source) continue;
    if (out[edge.sourceId]) continue; // first source edge wins
    const meta = (edge.metadata ?? {}) as {
      processed_document_id?: string | null;
      chunk_id?: string | null;
      page?: number | null;
    };
    out[edge.sourceId] = {
      fileId: edge.targetId,
      documentId: meta.processed_document_id ?? null,
      chunkId: meta.chunk_id ?? null,
      page: meta.page ?? null,
      title: edge.label ?? null,
      excerpt: null,
    };
  }
  return out;
}
