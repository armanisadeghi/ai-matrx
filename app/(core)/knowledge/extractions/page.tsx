import type { Metadata } from "next";
import { Table2 } from "lucide-react";
import { ExtractionCatalogClient } from "@/features/page-extraction/data-review/ExtractionCatalogClient";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

export const metadata: Metadata = {
  title: "Extraction Data",
  description:
    "Review, manage, export, and organize every dataset extracted from your documents.",
};

/**
 * `/knowledge/extractions` — the cross-document catalog of extraction datasets.
 * The list "savior" page that demotes the small PDF-Studio Results tab from
 * the only review surface to a quick-glance one.
 */
export default async function ExtractionsCatalogPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="Extraction Data"
        route="/knowledge/extractions"
        description="Review, manage, export, and organize every dataset extracted from your documents."
        icon={Table2}
      />
    );
  }
  return <ExtractionCatalogClient />;
}
