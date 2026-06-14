import type { Metadata } from "next";
import { ExtractionCatalogClient } from "@/features/page-extraction/data-review/ExtractionCatalogClient";

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
export default function ExtractionsCatalogPage() {
  return <ExtractionCatalogClient />;
}
