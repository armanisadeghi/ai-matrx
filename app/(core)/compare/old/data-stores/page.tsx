// Old Data Stores list (/knowledge/data-stores with no store open, before H6b,
// 2026-09-27), review-only. DataStoresPage is still live (it is the store's
// record page); rendered here with no store_id it shows the old list view.
// Opening a store navigates to the live record page, as the old list did.
import { Suspense } from "react";
import { DataStoresPage } from "@/features/rag/components/data-stores/DataStoresPage";
import KnowledgeLanding from "@/features/auth/components/module-landing/landings/KnowledgeLanding";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { HUB_DATA_STORES_HREF } from "@/features/knowledge/hub/legacyRoutes";
import { OldPageBanner } from "../_components/OldPageBanner";

export default async function OldDataStoresPage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) return <KnowledgeLanding />;
  return (
    <>
      <Suspense>
        <DataStoresPage />
      </Suspense>
      <OldPageBanner newHref={HUB_DATA_STORES_HREF} newLabel="Data stores in the Knowledge hub" />
    </>
  );
}
