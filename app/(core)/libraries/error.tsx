"use client";

import { ErrorBoundaryView } from "@/components/errors/ErrorBoundaryView";
import { LIBRARIES_PATH } from "@/features/knowledge/modulePaths";

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
      homePath={LIBRARIES_PATH}
    />
  );
}
