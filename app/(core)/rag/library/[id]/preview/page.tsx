/**
 * /rag/library/[id]/preview — robust document preview.
 *
 * Built on /rag/library/* endpoints (no /api/document/* dependency, no
 * react-pdf). 3 panes: pages list, page text, chunks + test-search.
 */

"use client";

import { useParams } from "next/navigation";
import { useMemo } from "react";
import { LibraryPreviewPage } from "@/features/rag/components/library/LibraryPreviewPage";

export default function Page() {
  const params = useParams();
  const documentId = useMemo(() => {
    const raw = params?.id;
    return Array.isArray(raw) ? raw[0] : (raw ?? null);
  }, [params]);

  if (!documentId) {
    return (
      <div className="grid place-items-center h-full text-sm text-muted-foreground">
        Missing document id.
      </div>
    );
  }

  return <LibraryPreviewPage documentId={documentId} />;
}
