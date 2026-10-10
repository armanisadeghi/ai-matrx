"use client";

import { useQuery } from "@tanstack/react-query";

import { ensureOrgId } from "@/lib/organizations/ensureOrgId";

import { judgeConnection, loadConnectionSnapshot, type PlatformConnection } from "./connection-state";

/**
 * Connection state per network for the signed-in person; `of(platform)` is the one answer a row shows.
 * Connections belong to the PERSON, not the brand, so the server calls carry the person's active
 * organization — never the record's. A viewer of another organization's brand is not a member of it,
 * and naming it got every status read refused (400 organization_forbidden → "Coming soon" everywhere).
 * `recordOrganizationId` only gates the query to a loaded brand.
 */
export function useConnectionStates(recordOrganizationId: string) {
  const query = useQuery({
    queryKey: ["marketing", "social", "connection-states"],
    queryFn: async () => loadConnectionSnapshot(await ensureOrgId(null)),
    enabled: Boolean(recordOrganizationId),
    staleTime: 60_000,
  });
  const of = (platform: string): PlatformConnection | null =>
    query.data ? judgeConnection(platform, query.data.connections, query.data.configs, query.data.xAvailable) : null;
  return { ...query, of };
}
