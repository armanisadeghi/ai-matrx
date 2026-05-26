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
 *   `?page` and `?chunk` are accepted for URL backwards-compat. The
 *   library preview surface owns its own internal navigation (page
 *   list + chunks + search), so deep-link forwarding is best-effort
 *   today and lives on the LibraryPreviewPage roadmap.
 */

import { notFound } from "next/navigation";
import { LibraryPreviewPage } from "@/features/rag/components/library/LibraryPreviewPage";

interface RagViewerPageProps {
  params: Promise<{ id: string }>;
}

export default async function DocumentViewerPage({
  params,
}: RagViewerPageProps) {
  const { id } = await params;
  if (!id) notFound();
  return <LibraryPreviewPage documentId={id} />;
}
