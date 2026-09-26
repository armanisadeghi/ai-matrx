"use client";

import { ErrorBoundaryView } from "@/components/errors/ErrorBoundaryView";

/**
 * The route crash screen for every (core) page without an error.tsx of its own
 * — 80 of 89 top-level segments. Without it a render crash fell through to
 * app/global-error.tsx, which drops the app shell. ErrorBoundaryView keeps the
 * shell, captures the crash for the Error Inspector, and carries the Alchemy
 * Menu (RC-B12).
 */
export default function CoreError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorBoundaryView error={error} reset={reset} />;
}
