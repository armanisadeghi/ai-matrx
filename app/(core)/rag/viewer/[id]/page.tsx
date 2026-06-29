/**
 * /rag/viewer/[id] — full-page document preview.
 *
 * Citation deep links use search params:
 *   /rag/viewer/<processed_document_id>?page=12&chunk=<chunk_id>
 *
 * Implementation note:
 *   The legacy 4-pane `<DocumentViewer/>` (PDF + raw + cleaned + chunks)
 *   depends on `react-pdf`, the page-image renderer, and the
 *   `/api/document/*` endpoints — any one of which can return 404 and
 *   leave the user staring at a broken page. The Files Document tab
 *   already routes around this by mounting `<LibraryPreviewPage/>`
 *   (which talks to the reliable `/rag/library/*` endpoints). We do the
 *   same here so this standalone route never breaks for documents that
 *   render perfectly inside the file preview.
 *
 *   `?page` is forwarded to the preview so a citation deep link lands the
 *   user on the right page instead of page 1. `?chunk` is accepted for URL
 *   backwards-compat; chunk-level landing lives on the LibraryPreviewPage
 *   roadmap (the page list + chunks panel own internal navigation).
 */

import { notFound } from "next/navigation";
import { LibraryPreviewPage } from "@/features/rag/components/library/LibraryPreviewPage";

interface RagViewerPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; chunk?: string }>;
}

export default async function DocumentViewerPage({
  params,
  searchParams,
}: RagViewerPageProps) {
  const { id } = await params;
  if (!id) notFound();
  const { page } = await searchParams;
  const parsedPage = page ? Number.parseInt(page, 10) : NaN;
  const initialPageNumber =
    Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : undefined;
  return (
    <LibraryPreviewPage documentId={id} initialPageNumber={initialPageNumber} />
  );
}
