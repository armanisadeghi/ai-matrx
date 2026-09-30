// Old Sources page (/knowledge/library before H6a, 2026-09-27), review-only.
// The component is restored verbatim under ../_restored from 143e461807^.
import { SourcesPage } from "../_restored/SourcesPage";
import KnowledgeLanding from "@/features/auth/components/module-landing/landings/KnowledgeLanding";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { HUB_SOURCES_HREF } from "@/features/knowledge/hub/legacyRoutes";
import { OldPageBanner } from "../_components/OldPageBanner";

export default async function OldSourcesPage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) return <KnowledgeLanding />;
  return (
    <>
      <SourcesPage />
      <OldPageBanner newHref={HUB_SOURCES_HREF} newLabel="Sources in the Knowledge hub" />
    </>
  );
}
