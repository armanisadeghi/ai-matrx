"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, RotateCcw } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { PdfBatchExtractDebugTrigger } from "@/features/pdf-extractor/components/PdfBatchExtractDebugTrigger";
import { useExistingPdfExtraction } from "@/features/pdf/hooks/useExistingPdfExtraction";
import { Button } from "@/components/ui/button";

/**
 * Client wrapper for the PDF Studio route. Picks desktop vs mobile shell
 * via `useIsMobile` and dynamic-imports both — the studio talks to PDF.js-
 * adjacent iframe sources and Supabase, so no SSR.
 */

const Desktop = dynamic(
  () =>
    import("@/features/pdf-extractor/studio/PdfStudioShell").then((m) => ({
      default: m.PdfStudioShell,
    })),
  { ssr: false, loading: () => <ShellSkeleton /> },
);

const Mobile = dynamic(
  () =>
    import("@/features/pdf-extractor/studio/PdfStudioMobile").then((m) => ({
      default: m.PdfStudioMobile,
    })),
  { ssr: false, loading: () => <ShellSkeleton /> },
);

export default function PdfStudioRouteClient({
  initialDocumentId,
  initialSourceFileId,
}: {
  initialDocumentId?: string;
  initialSourceFileId?: string;
}) {
  const isMobile = useIsMobile();
  if (initialSourceFileId && !initialDocumentId) {
    return <ExistingFileExtractionGate fileId={initialSourceFileId} />;
  }
  return (
    <>
      <PdfBatchExtractDebugTrigger className="fixed bottom-4 right-4 z-40 hidden md:block" />
      {isMobile ? (
        <Mobile initialDocumentId={initialDocumentId} />
      ) : (
        <Desktop initialDocumentId={initialDocumentId} />
      )}
    </>
  );
}

function ExistingFileExtractionGate({ fileId }: { fileId: string }) {
  const router = useRouter();
  const extraction = useExistingPdfExtraction();
  const startedForRef = useRef<string | null>(null);

  function start(): void {
    startedForRef.current = fileId;
    void extraction
      .extract(fileId)
      .then((documentId) => {
        router.replace(`/tools/pdf-extractor/${documentId}`);
      })
      .catch(() => {
        // The hook exposes the captured error and retry affordance below.
      });
  }

  useEffect(() => {
    if (startedForRef.current === fileId) return;
    start();
    // The ref prevents hook progress updates from restarting the pipeline.
  }, [fileId, extraction]);

  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-background p-6">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {extraction.status === "error" ? (
              <FileText className="size-5" />
            ) : (
              <Loader2 className="size-5 animate-spin" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-foreground">
              {extraction.status === "error"
                ? "PDF extraction failed"
                : "Extracting this PDF from Files"}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {extraction.error ??
                extraction.progress ??
                "Preparing the existing file without uploading another copy…"}
            </p>
          </div>
        </div>

        {extraction.textPreview ? (
          <div className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
            {extraction.textPreview}
          </div>
        ) : null}

        {extraction.status === "error" ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                extraction.reset();
                start();
              }}
            >
              <RotateCcw className="mr-1.5 size-3.5" />
              Retry extraction
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push(`/files/f/${fileId}`)}
            >
              Back to file
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Skeleton — server-shaped, zero CLS ────────────────────────────────────

function ShellSkeleton() {
  return (
    <div className="flex h-full min-h-0">
      <div className="hidden md:flex flex-col w-72 lg:w-80 xl:w-96 border-r border-border bg-card/30 min-h-0 p-3 gap-2">
        <div className="h-8 w-full rounded-md bg-muted animate-pulse" />
        <div className="h-7 w-full rounded-md bg-muted/70 animate-pulse" />
        <div className="space-y-1 pt-2">
          {Array.from({ length: 14 }).map((_, i) => (
            <div
              key={i}
              className="h-10 w-full rounded-md bg-muted/40 animate-pulse"
            />
          ))}
        </div>
      </div>
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        <div className="h-11 border-b border-border bg-muted/20 animate-pulse" />
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-px bg-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-card animate-pulse hidden md:block" />
          ))}
          <div className="bg-card animate-pulse md:hidden" />
        </div>
      </div>
      <div className="hidden lg:flex flex-col w-80 xl:w-96 min-h-0 border-l border-border bg-card/30 p-3 gap-3">
        <div className="h-8 w-full rounded-md bg-muted animate-pulse" />
        <div className="h-14 w-full rounded-md bg-muted/40 animate-pulse" />
        <div className="h-14 w-full rounded-md bg-muted/40 animate-pulse" />
        <div className="h-14 w-full rounded-md bg-muted/40 animate-pulse" />
      </div>
    </div>
  );
}
