"use client";

import { useQuery } from "@tanstack/react-query";

import { judgeConnection, loadConnectionSnapshot, type PlatformConnection } from "./connection-state";

/** Connection state per network for the signed-in person; `of(platform)` is the one answer a row shows. */
export function useConnectionStates(organizationId: string) {
  const query = useQuery({
    queryKey: ["marketing", "social", "connection-states", organizationId],
    queryFn: () => loadConnectionSnapshot(organizationId),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
  });
  const of = (platform: string): PlatformConnection | null =>
    query.data ? judgeConnection(platform, query.data.connections, query.data.configs) : null;
  return { ...query, of };
}
