"use client";

/**
 * PdfSourceUnavailable — the graceful state shown when a cld_files-backed
 * PDF can't be served because its row is gone (deleted / trashed / absent).
 *
 * This is the "loud recovery" surface for the class of failure introduced by
 * the 2026-05 AWS migration: the original PDF binary was removed (its
 * `cld_files` row soft-deleted) while the derived data — extracted text,
 * per-page rows, analysis — stayed intact. The viewer used to throw pdfjs's
 * raw "Couldn't load this PDF — Failed to fetch" card on the resulting
 * 401/404. That looks like a bug to the user even though the rest of the
 * record is fine.
 *
 * Every PDF surface that resolves bytes via `usePdfRemoteSource` renders this
 * panel when `sourceMissing` is true, so a removed source degrades the same
 * way everywhere instead of erroring.
 */

import { FileX2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PdfSourceUnavailableProps {
  fileName?: string | null;
  /** Optional extra line — e.g. "The extracted text on the right is still available." */
  hint?: string;
  className?: string;
}

export default function PdfSourceUnavailable({
  fileName,
  hint,
  className,
}: PdfSourceUnavailableProps) {
  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center p-6 bg-muted/20",
        className,
      )}
    >
      <div className="max-w-sm text-center space-y-3">
        <div className="w-12 h-12 mx-auto rounded-full bg-muted flex items-center justify-center">
          <FileX2 className="w-5 h-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">
            Original file no longer available
          </p>
          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
            {fileName ? (
              <>
                The stored copy of{" "}
                <span className="font-medium">{fileName}</span> has been
                removed, so the PDF can&apos;t be displayed.
              </>
            ) : (
              <>
                The stored copy of this file has been removed, so the PDF
                can&apos;t be displayed.
              </>
            )}
            {hint ? <> {hint}</> : null}
          </p>
        </div>
      </div>
    </div>
  );
}
