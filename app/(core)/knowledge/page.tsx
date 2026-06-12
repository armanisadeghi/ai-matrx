import KnowledgeShowcasePage from "@/features/knowledge/components/KnowledgeShowcasePage";
import { MarketingPageShell } from "@/features/shell/components/MarketingPageShell";

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
    <MarketingPageShell>
      <KnowledgeShowcasePage />
    </MarketingPageShell>
  );
}
