// Old Library catalog list (/knowledge/library-catalog with no item open,
// before H6b, 2026-09-27), review-only. LibraryCatalogPage is still live (it
// is an item's record page); rendered here with no id it shows the old list.
import { Suspense } from "react";
import { LibraryCatalogPage } from "@/features/rag/components/library-catalog/LibraryCatalogPage";
import KnowledgeLanding from "@/features/auth/components/module-landing/landings/KnowledgeLanding";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { HUB_LIBRARY_CATALOG_HREF } from "@/features/knowledge/hub/legacyRoutes";
import { OldPageBanner } from "../_components/OldPageBanner";

export default async function OldLibraryCatalogPage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) return <KnowledgeLanding />;
  return (
    <>
      <Suspense>
        <LibraryCatalogPage />
      </Suspense>
      <OldPageBanner newHref={HUB_LIBRARY_CATALOG_HREF} newLabel="Library catalog in the Knowledge hub" />
    </>
  );
}
