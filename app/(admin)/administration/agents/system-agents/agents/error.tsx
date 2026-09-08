"use client";

import { ErrorBoundaryView } from "@/components/errors/ErrorBoundaryView";

export default function SystemAgentsError({
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
      context="System Agents"
      homePath="/administration/agents/system-agents/agents"
    />
  );
}
