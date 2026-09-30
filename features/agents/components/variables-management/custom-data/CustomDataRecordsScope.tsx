"use client";

/**
 * The record-store provider for ONE bound Table — the custom-data binding editor's table details
 * and its summary chip. The same seam /data-v2 mounts (`recordsDataSource` over the session
 * client, `personActor`), bound to THE ORGANIZATION THE TABLE LIVES IN.
 *
 * 🚨 NEVER THE ACTIVE ORGANIZATION (lane ORG-FILTER-CLASS, Arman 2026-09-30). This provider used
 * to bind to the organization the person had SET in the header, so the table picker listed that
 * one organization's tables — silently — and a Table from any other organization read as "outside
 * this organization". The Table's organization comes from the Table itself
 * (`custom.where_id_opens`, `useObjectOrganization`), exactly as every object page reads it;
 * access is personal and the active organization is a filter only.
 *
 * Until the Table's organization is known — or when it does not open for this person — the
 * children are NOT rendered (their hooks need the provider); `fallback` says why.
 */

import { createContext, useContext, type ReactNode } from "react";
import { RecordsProvider } from "@ai-matrx/records/react";
import { personActor, recordsDataSource } from "@ai-matrx/records-ui";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useObjectOrganization } from "@/features/unified-data/objectOrganization";
import { createClient } from "@/utils/supabase/client";

// ONE data seam per page, built lazily (the same pattern as
// features/data-tables/data-source/record-store-grid.ts): a fresh seam per
// render would rebuild the provider's records client every render.
let dataSource: ReturnType<typeof recordsDataSource> | null = null;
function sharedDataSource() {
  dataSource ??= recordsDataSource(createClient());
  return dataSource;
}

/** Why the bound Table's details are not shown — handed to `fallback`. */
export type CustomDataScopeHeld =
  | { state: "resolving" }
  | { state: "not-given" }
  | { state: "unavailable"; why: string; retry: () => void };

interface CustomDataRecordsScopeProps {
  /** The bound Table. Its own organization binds the provider. */
  tableId: string;
  /**
   * The Table's organization when the caller already read it (the table list names every row's
   * organization) — skips the where-it-opens question. Never the active organization.
   */
  organizationId?: string | null | undefined;
  children: ReactNode;
  /** What to render while the Table's organization is unknown, or when it does not open. */
  fallback?: ((held: CustomDataScopeHeld) => ReactNode) | undefined;
}

const BoundOrganization = createContext<string | null>(null);

export function CustomDataRecordsScope({ tableId, organizationId, children, fallback }: CustomDataRecordsScopeProps) {
  const userId = useAppSelector(selectUserId);
  // Asked only when the caller did not already know the Table's organization.
  const opens = useObjectOrganization(sharedDataSource(), organizationId ? null : tableId);

  let bound: string | null = organizationId ?? null;
  if (!bound) {
    if (opens.state === "found") bound = opens.organizationId;
    else if (opens.state === "stand-in") bound = opens.activeOrganizationId; // announced by the module
  }

  if (!bound) {
    const held: CustomDataScopeHeld =
      opens.state === "not-given"
        ? { state: "not-given" }
        : opens.state === "unavailable"
          ? { state: "unavailable", why: opens.why, retry: opens.retry }
          : { state: "resolving" };
    return <>{fallback ? fallback(held) : null}</>;
  }

  return (
    <BoundOrganization.Provider value={bound}>
      <RecordsProvider
        config={{
          dataSource: sharedDataSource(),
          actor: personActor(userId),
          organizationId: bound,
        }}
      >
        {children}
      </RecordsProvider>
    </BoundOrganization.Provider>
  );
}

/** The organization the scope above is bound to (the Table's own) — for calls outside the records client. */
export function useCustomDataOrganizationId(): string | null {
  return useContext(BoundOrganization);
}
