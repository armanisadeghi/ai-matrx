"use client";

import { ErrorBoundaryView } from "@/components/errors/ErrorBoundaryView";
import { HUB_LIBRARIES_HREF } from "@/features/knowledge/hub/legacyRoutes";

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
      homePath={HUB_LIBRARIES_HREF}
    />
  );
}
