/**
 * /rag/library/[id]/preview — robust document preview.
 *
 * Built on /rag/library/* endpoints (no /api/document/* dependency, no
 * react-pdf). 3 panes: pages list, page text, chunks + test-search.
 */

"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { LibraryPreviewPage } from "@/features/rag/components/library/LibraryPreviewPage";

export default function Page() {
  const params = useParams();
  const searchParams = useSearchParams();
  const documentId = useMemo(() => {
    const raw = params?.id;
    return Array.isArray(raw) ? raw[0] : (raw ?? null);
  }, [params]);
  // `?assets=1` — deep link from the file menu's "Knowledge assets" entry:
  // land with the Knowledge Asset Builder drawer already open.
  const initialAssetsOpen = searchParams?.get("assets") === "1";

  if (!documentId) {
    return (
      <div className="grid place-items-center h-full text-sm text-muted-foreground">
        Missing document id.
      </div>
    );
  }

  return (
    <LibraryPreviewPage
      documentId={documentId}
      initialAssetsOpen={initialAssetsOpen}
    />
  );
}
