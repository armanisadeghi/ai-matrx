"use client";
// Next binding (slice P10): the dynamic() front door moved verbatim from the package call site.
// `next/dynamic` is imported here, literally, so Next's transform still applies.

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

export const LibraryPreviewPage = dynamic(
  () =>
    import("@host/features/rag/components/library/LibraryPreviewPage").then(
      (m) => m.LibraryPreviewPage,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading document…
      </div>
    ),
  },
);
