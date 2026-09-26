"use client";

import { ErrorBoundaryView } from "@/components/errors/ErrorBoundaryView";

export default function DataTableError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorBoundaryView
      error={error}
      reset={reset}
      context="Data table"
      homePath="/data"
    />
  );
}
