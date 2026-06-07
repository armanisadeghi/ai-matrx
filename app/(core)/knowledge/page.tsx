import type { Metadata } from "next";
import KnowledgeShowcasePage from "@/features/knowledge/components/KnowledgeShowcasePage";

export const metadata: Metadata = {
  title: "The Knowledge System — AI Matrx",
  description:
    "Source → knowledge → answer, one continuous system. Raw sources flow through a seven-phase pipeline into a versioned, traceable knowledge hub — then agents turn it into cited, accurate answers.",
  openGraph: {
    title: "The Matrx Knowledge System",
    description:
      "A seven-phase pipeline from any source to a cited, traceable answer — with agents that attach at every stage.",
    type: "website",
  },
};

/**
 * `/knowledge` — informational showcase for the Matrx Knowledge System.
 *
 * Distinct from the guest sales landing at `/rag/data-stores` (KnowledgeLanding).
 * This page documents what the system actually does, built around a rebuilt,
 * theme-aware version of `docs/knowledge/visuals/matrx_knowledge_system_full.svg`.
 * See `features/knowledge/FEATURE.md` for the full vision + truthful built/
 * missing map and the planned guided walkthrough.
 */
export default function KnowledgePage() {
  return (
    <div className="h-dvh w-full overflow-y-auto bg-textured">
      <div style={{ height: "var(--shell-header-h, 2.75rem)" }} />
      <KnowledgeShowcasePage />
    </div>
  );
}
