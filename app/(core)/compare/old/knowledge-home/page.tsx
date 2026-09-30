// Old Knowledge home (RagHomePage, served at /rag and labelled "Knowledge home"
// before H6a, 2026-09-27), review-only. Restored verbatim from 143e461807^.
import { RagHomePage } from "../_restored/RagHomePage";
import KnowledgeLanding from "@/features/auth/components/module-landing/landings/KnowledgeLanding";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { OldPageBanner } from "../_components/OldPageBanner";

export default async function OldKnowledgeHomePage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) return <KnowledgeLanding />;
  return (
    <>
      <RagHomePage />
      <OldPageBanner newHref="/knowledge" newLabel="the Knowledge hub" />
    </>
  );
}
