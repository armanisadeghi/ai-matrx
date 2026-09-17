"use client";

// features/exports/components/ExportsHeader.tsx
//
// The ONE shared header for the /exports family (core-route-headers § "Sibling
// routes sharing one header get ONE shared header component"). The route owns
// only the centre zone; the shell owns both edges.

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function ExportsHeader({
  /** Present on a Library page: the crumb back to the drop zone plus its name. */
  libraryName,
}: {
  libraryName?: string;
}) {
  if (!libraryName) {
    return (
      <div className="flex w-full min-w-0 items-center">
        <span className="truncate text-sm font-medium">Bring your export</span>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 items-center gap-1">
      <Link
        href="/exports"
        aria-label="Back to Bring your export"
        data-tap-target
        className={cn(
          "-ml-2 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm",
          "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        )}
      >
        <ChevronLeft className="h-4 w-4 shrink-0" />
        <span className="max-sm:sr-only">Exports</span>
      </Link>
      <span className="min-w-0 truncate text-sm font-medium">{libraryName}</span>
    </div>
  );
}
