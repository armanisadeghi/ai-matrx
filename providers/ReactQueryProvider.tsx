"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import dynamic from "next/dynamic";
import { isRecordUnavailableError } from "@/lib/records/recordUnavailable";

const ReactQueryDevtools =
  process.env.NODE_ENV === "development"
    ? dynamic(
        () =>
          import("@tanstack/react-query-devtools").then((m) => ({
            default: m.ReactQueryDevtools,
          })),
        { ssr: false },
      )
    : () => null;

function errorCode(error: unknown): string | null {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (
    typeof current === "object" &&
    current !== null &&
    !seen.has(current)
  ) {
    seen.add(current);
    const value = current as { code?: unknown; cause?: unknown };
    if (typeof value.code === "string") return value.code;
    current = value.cause;
  }
  return null;
}

export function isDeterministicQueryFailure(error: unknown): boolean {
  // PostgreSQL 42501 is an authorization/privilege verdict. Repeating the same
  // read cannot change it and only duplicates diagnostics. The original
  // structured object may be wrapped as Error.cause for human-facing copy.
  return errorCode(error) === "42501";
}

export const REACT_QUERY_DEFAULT_OPTIONS = {
  queries: {
    staleTime: 60 * 1000,
    // A zero-row single-record read is a deterministic lifecycle/access
    // result. Replaying it only duplicates the structured capture before the
    // AccessGate can reconcile the first one. Keep the one retry for genuinely
    // transient query failures.
    retry: (failureCount: number, error: unknown) =>
      !isRecordUnavailableError(error) &&
      !isDeterministicQueryFailure(error) &&
      failureCount < 1,
    refetchOnWindowFocus: false,
  },
  mutations: {
    // Mutations are not generically replay-safe. A deterministic PostgREST
    // conflict was previously issued twice because this provider retried every
    // failed POST once. Individual mutations may opt in only when their
    // operation defines idempotency.
    retry: false,
  },
};

export function ReactQueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const showDevtools = false;

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: REACT_QUERY_DEFAULT_OPTIONS,
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* React Query DevTools - toggle showDevtools variable to enable/disable */}
      {showDevtools && process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}
