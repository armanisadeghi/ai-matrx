"use client";

/**
 * The record-store provider for the custom-data binding editor and its summary
 * chip — the same seam /data-v2 mounts (`recordsDataSource` over the session
 * client, `personActor`, the organization the person SET), with nothing else.
 *
 * The organization is the ACTIVE one the person chose (`useOrganizationRequired`)
 * — never a saved default, never the personal org. With none set the children
 * are not rendered; the organization notice says why and offers the picker.
 */

import type { ReactNode } from "react";
import { RecordsProvider } from "@ai-matrx/records/react";
import { personActor, recordsDataSource } from "@ai-matrx/records-ui";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { createClient } from "@/utils/supabase/client";

// ONE data seam per page, built lazily (the same pattern as
// features/data-tables/data-source/record-store-grid.ts): a fresh seam per
// render would rebuild the provider's records client every render.
let dataSource: ReturnType<typeof recordsDataSource> | null = null;
function sharedDataSource() {
  dataSource ??= recordsDataSource(createClient());
  return dataSource;
}

interface CustomDataRecordsScopeProps {
  children: ReactNode;
  /** Render nothing (instead of the organization notice) while no organization is set. */
  quiet?: boolean;
}

export function CustomDataRecordsScope({
  children,
  quiet,
}: CustomDataRecordsScopeProps) {
  const userId = useAppSelector(selectUserId);
  const { organizationId, organizationState } = useOrganizationRequired();

  if (organizationState !== "ready" || !organizationId) {
    if (quiet) return null;
    return (
      <OrganizationContextNotice
        state={organizationState}
        what="Your data"
        compact
      />
    );
  }

  return (
    <RecordsProvider
      config={{
        dataSource: sharedDataSource(),
        actor: personActor(userId),
        organizationId,
      }}
    >
      {children}
    </RecordsProvider>
  );
}

/** The organization the scope above is bound to — for calls outside the records client. */
export function useCustomDataOrganizationId(): string | null {
  const { organizationId, organizationState } = useOrganizationRequired();
  return organizationState === "ready" ? organizationId : null;
}
