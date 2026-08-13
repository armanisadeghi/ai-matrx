"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import dynamic from "next/dynamic";

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

export const REACT_QUERY_DEFAULT_OPTIONS = {
  queries: {
    staleTime: 60 * 1000,
    retry: 1,
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
