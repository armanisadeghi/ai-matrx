import type { Metadata } from "next";
import { ExtractionDatasetClient } from "@/features/page-extraction/data-review/ExtractionDatasetClient";

export const metadata: Metadata = {
  title: "Extraction dataset",
};

/**
 * `/knowledge/extractions/[id]` — the full review/management grid for one
 * extraction dataset (`id` = `page_extraction_jobs.id`).
 */
export default async function ExtractionDatasetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ExtractionDatasetClient jobId={id} />;
}
