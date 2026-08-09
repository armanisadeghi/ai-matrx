"use client";

/**
 * RagHitCard demo — renders the ONE canonical RAG hit card (expanded +
 * compact) from fixtures, with no backend dependency. Exists so layout work
 * (especially the 375px mobile header wrap) can be verified without needing
 * live indexed content and a reachable retrieval backend.
 */

import { RagHitCard } from "@/features/rag/components/hit-card/RagHitCard";
import type { RagHitView } from "@/features/rag/components/hit-card/types";

const BASE: RagHitView = {
  sourceKind: "cld_file",
  sourceId: "7bf8b4f1-1111-4222-8333-944444444444",
  chunkId: "c1d2e3f4-5555-4666-8777-988888888888",
  fieldId: null,
  parentChunkId: null,
  chunkKind: "chunked_coarse",
  title: "california-workers-comp-guide-2026.pdf",
  pageNumber: 12,
  pageNumbers: [12],
  score: 0.87,
  snippet:
    "Temporary disability benefits generally pay two-thirds of the gross wages you lose while recovering from a job injury, subject to statutory minimums and maximums that adjust annually. Payments are not taxable and typically begin within 14 days of the claim being accepted.",
  vectorRank: 1,
  lexicalRank: 3,
  rerankScore: 0.91,
  entityRank: 2,
  entities: ["temporary disability", "wage replacement", "DWC"],
  metadata: { derivation_kind: "chunked_coarse" },
  libraryShortCode: "CAWC",
  libraryProvenance: null,
};

const HITS: { view: RagHitView; rank: number }[] = [
  { view: BASE, rank: 1 },
  {
    rank: 2,
    view: {
      ...BASE,
      chunkId: "a9b8c7d6-1234-4321-8765-101010101010",
      chunkKind: "table",
      score: 0.72,
      snippet:
        "Benefit rate table: minimum and maximum weekly temporary disability rates by year of injury.",
      metadata: { table_rows: 8, derivation_kind: "table" },
      vectorRank: 4,
      lexicalRank: 1,
      rerankScore: null,
      entityRank: null,
    },
  },
  {
    rank: 3,
    view: {
      ...BASE,
      chunkId: "b1b2b3b4-9999-4888-8777-121212121212",
      sourceKind: "note",
      sourceId: "e5f6a7b8-2222-4333-8444-955555555555",
      title: "Intake call notes — Smith case",
      chunkKind: "chunked_fine",
      pageNumber: null,
      pageNumbers: null,
      score: 0.41,
      snippet: "Client reports the injury occurred on the loading dock.",
      vectorRank: null,
      lexicalRank: null,
      rerankScore: null,
      entityRank: 5,
      libraryShortCode: null,
    },
  },
];

export default function RagHitCardDemoPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 pt-[var(--shell-header-h)]">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">
          Expanded (search lab)
        </h2>
        <div className="space-y-2">
          {HITS.map(({ view, rank }) => (
            <RagHitCard
              key={view.chunkId}
              view={view}
              variant="expanded"
              rank={rank}
              topScore={HITS[0].view.score}
              href={`/rag/library/${view.sourceId}/preview`}
              onOpen={() => {}}
              onReviewRepair={rank === 1 ? () => {} : undefined}
              highlightQuery="temporary disability"
            />
          ))}
        </div>
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">
          Compact (chat + omnibox)
        </h2>
        <div className="space-y-2">
          {HITS.map(({ view }) => (
            <RagHitCard
              key={view.chunkId}
              view={view}
              variant="compact"
              topScore={HITS[0].view.score}
              href={`/rag/library/${view.sourceId}/preview`}
              onOpen={() => {}}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
