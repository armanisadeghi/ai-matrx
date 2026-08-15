"use client";

import { ErrorBoundaryView } from "@/components/errors/ErrorBoundaryView";

export default function SendingIdentitiesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorBoundaryView error={error} reset={reset} context="Sending Mailboxes" />;
}
