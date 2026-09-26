import { redirect } from "next/navigation";
import { sourceStudioPath } from "@/features/source-studio/sourceStudioModel";

/**
 * /tools/pdf-extractor/<processed_documents.id> — a document opens on the one
 * Source screen now (SOURCE-CONVERGENCE §8.2). The PDF tools themselves
 * (crop, reorder, extraction templates, pipeline) stay at
 * `/tools/pdf-extractor?doc=<id>`, reached from the Source screen's
 * "PDF tools" action.
 */
interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PdfStudioDocRedirect({ params, searchParams }: PageProps) {
  const { id } = await params;
  redirect(sourceStudioPath(id, await searchParams));
}
