"use client";

import dynamic from "next/dynamic";
import { useIsMobile } from "@/hooks/use-mobile";

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
}: {
  initialDocumentId?: string;
}) {
  const isMobile = useIsMobile();
  return isMobile ? (
    <Mobile initialDocumentId={initialDocumentId} />
  ) : (
    <Desktop initialDocumentId={initialDocumentId} />
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
        <div className="h-14 border-b border-border bg-muted/20 animate-pulse" />
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-px bg-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="bg-card animate-pulse hidden md:block"
            />
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
