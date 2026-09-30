// Old Search Lab (/knowledge/search before H6a, 2026-09-27), review-only: the
// whole four-tab page on the USER lane, as it was. RagSearchExperience is
// still live (the admin Search Lab mounts it), so nothing is restored here.
import { Suspense } from "react";
import { RagSearchExperience } from "@/features/rag/components/search/RagSearchExperience";
import KnowledgeLanding from "@/features/auth/components/module-landing/landings/KnowledgeLanding";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { OldPageBanner } from "../_components/OldPageBanner";

export default async function OldSearchLabPage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) return <KnowledgeLanding />;
  return (
    <>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-md bg-muted/50" />}>
        <RagSearchExperience />
      </Suspense>
      <OldPageBanner newHref="/knowledge" newLabel="search in the Knowledge hub" />
    </>
  );
}
