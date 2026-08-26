"use client";

import { FolderOpen, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function FilesTreeLoadingState() {
  return (
    <div
      className="flex h-full min-h-0 flex-col gap-3 p-4"
      role="status"
      aria-label="Loading your files"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <FolderOpen
          className="h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
        Loading your files
      </div>
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(6rem,1fr)_minmax(6rem,1fr)] gap-3 border-b pb-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-24" />
      </div>
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="grid grid-cols-[minmax(0,2fr)_minmax(6rem,1fr)_minmax(6rem,1fr)] items-center gap-3"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-4 w-full max-w-64" />
          </div>
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

export function FilesTreeErrorState({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <div
      className="flex h-full min-h-0 items-center justify-center p-6"
      role="alert"
      data-surface-value="tree_status"
    >
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <TriangleAlert className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            We couldn&apos;t load your files
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {error || "The files service did not return a usable listing."}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
      </div>
    </div>
  );
}
