"use client";

import { ErrorBoundaryView } from "@/components/errors/ErrorBoundaryView";

export default function NotesError({
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
      context="Notes"
      homePath="/notes"
    />
  );
}
