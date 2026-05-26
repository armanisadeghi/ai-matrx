/**
 * app/(a)/files/f/[fileId]/not-found.tsx
 */

import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function CloudFileNotFound() {
  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex items-center justify-center bg-background">
      <div className="max-w-md w-full rounded-lg border bg-card p-6 shadow-sm space-y-4 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <FileQuestion
            className="h-5 w-5 text-muted-foreground"
            aria-hidden="true"
          />
        </div>
        <div>
          <h2 className="text-base font-semibold">File not found</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This file may have been deleted or you no longer have access.
          </p>
        </div>
        <Link
          href="/files"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
        >
          Back to files
        </Link>
      </div>
    </div>
  );
}
