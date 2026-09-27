import KnowledgeShowcasePage from "@/features/knowledge/components/KnowledgeShowcasePage";
import { MarketingPageShell } from "@/features/shell/components/MarketingPageShell";

/**
 * `/knowledge/about` — informational showcase for the Matrx Knowledge System.
 *
 * Moved off `/knowledge` on 2026-09-27 when `/knowledge` became the Knowledge
 * hub (KNOWLEDGE-HUB §6: "the marketing page moves off `/knowledge`").
 * Distinct from the guest sales landing (KnowledgeLanding).
 */
export default function KnowledgeAboutPage() {
  return (
    <MarketingPageShell>
      <KnowledgeShowcasePage />
    </MarketingPageShell>
  );
}
