"use client";

import { ErrorBoundaryView } from "@/components/errors/ErrorBoundaryView";

export default function LibrariesError({
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
      context="Libraries"
      homePath="/libraries"
    />
  );
}
