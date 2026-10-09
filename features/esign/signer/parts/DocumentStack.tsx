"use client";

// features/esign/signer/parts/DocumentStack.tsx — EVERY PAGE OF EVERY DOCUMENT IN ONE SCROLL
// (esign-parity CONTRACT §13.2; champion S4.1, S4.2). THE platform PDF viewer draws each document in
// its `layout="continuous"` mode (pdf.js on a canvas: a document never runs script on our origin, and
// it renders on Android), and its per-page overlay slot carries the fields. The page is paper in
// dark mode too; "Dim page" turns its brightness down for comfort (ours #24).

import { lazy, Suspense } from "react";

import { Button } from "@ai-matrx/design-system/controls";
import { cn } from "@/lib/utils";

const PdfDocumentRenderer = lazy(() => import("@/features/pdf/components/viewer/PdfDocumentRenderer"));

export interface StackDoc {
  id: string;
  name: string;
  url: string | null;
  mimeType: string | null;
  failed: string | null;
}

export function DocumentStack({
  docs,
  zoom,
  dim,
  renderPage,
  onPageRendered,
  onRetry,
}: {
  docs: StackDoc[];
  zoom: number;
  dim: boolean;
  renderPage: (docId: string, page: number) => React.ReactNode;
  onPageRendered: (docId: string, page: number) => void;
  onRetry: (docId: string) => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[920px] flex-col gap-6 px-2 py-4 sm:px-6">
      {docs.map((doc, i) => (
        <section key={doc.id} data-doc={doc.id} aria-label={doc.name} className="flex flex-col gap-2">
          {docs.length > 1 ? (
            <div className="flex items-center gap-2 px-1 type-secondary text-muted-foreground">
              <span className="font-medium text-foreground">{doc.name}</span>
              <span>
                Document {i + 1} of {docs.length}
              </span>
            </div>
          ) : null}
          {doc.failed ? (
            <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-card p-6 text-center">
              <p className="type-body text-foreground">{doc.failed}</p>
              <Button variant="outline" onClick={() => onRetry(doc.id)}>
                Try again
              </Button>
            </div>
          ) : !doc.url ? (
            <PageSkeleton />
          ) : doc.mimeType?.startsWith("image/") ? (
            <div className="relative w-full bg-white" data-pdf-page={1}>
              {/* eslint-disable-next-line @next/next/no-img-element -- the frozen bytes as a local blob */}
              <img
                src={doc.url}
                alt={doc.name}
                className={cn("block w-full", dim && "brightness-[0.82]")}
                onLoad={() => onPageRendered(doc.id, 1)}
              />
              <div className="absolute inset-0">{renderPage(doc.id, 1)}</div>
            </div>
          ) : (
            <div className={cn(dim && "[&_canvas]:brightness-[0.82]")}>
              <Suspense fallback={<PageSkeleton />}>
                <PdfDocumentRenderer
                  blobUrl={doc.url}
                  fileName={doc.name}
                  layout="continuous"
                  continuousZoom={zoom}
                  renderOverlay={({ pageNumber }) => (
                    <div className="absolute inset-0">{renderPage(doc.id, pageNumber)}</div>
                  )}
                  onPageRendered={(page) => onPageRendered(doc.id, page)}
                />
              </Suspense>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

/** The Pages rail: a thumbnail of every page; a press scrolls the main view there. */
export function PageThumbnails({
  docs,
  onJump,
}: {
  docs: StackDoc[];
  onJump: (docId: string, page: number) => void;
}) {
  return (
    <nav aria-label="Pages" className="flex flex-col gap-3 p-3">
      {docs.map((doc) =>
        doc.url && doc.mimeType === "application/pdf" ? (
          <div key={doc.id} className="flex flex-col gap-1">
            {docs.length > 1 ? <span className="truncate type-secondary text-muted-foreground">{doc.name}</span> : null}
            <Suspense fallback={<PageSkeleton />}>
              <PdfDocumentRenderer
                blobUrl={doc.url}
                fileName={doc.name}
                layout="continuous"
                renderOverlay={({ pageNumber }) => (
                  <button
                    type="button"
                    aria-label={`Go to page ${pageNumber}`}
                    onClick={() => onJump(doc.id, pageNumber)}
                    className="absolute inset-0 flex items-end justify-center pb-1 hover:bg-primary/10"
                  >
                    <span className="rounded bg-black/60 px-1.5 text-xs font-medium text-white">{pageNumber}</span>
                  </button>
                )}
              />
            </Suspense>
          </div>
        ) : null,
      )}
    </nav>
  );
}

/** A page-shaped placeholder: paper, the size of a letter page, while its bytes arrive. */
function PageSkeleton() {
  return <div aria-label="Opening the document" className="aspect-[8.5/11] w-full animate-pulse rounded-sm bg-white/80 shadow-sm" />;
}
