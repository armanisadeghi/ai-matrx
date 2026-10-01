"use client";

// features/user-lists/components/PicklistsPage.tsx — THE PICKLISTS PAGE, mounted at /lists for a
// signed-in person (lane HANDOVER, 2026-09-27; moved from /lists/v3 at OLD-READERS-REMOVAL,
// 2026-10-01, when the two older editors and their v1 · v2 · v3 switcher were deleted).
//
// Every picklist the person can open, across all their organizations, from THE LIST INDEX (one
// store door), a row opening each at its one address `/lists/<id>`. The mount only: the store's
// records seam for the archive and the header. The list never waits on an active organization
// (active-org-is-never-a-list-filter law): the active organization is only where a NEW picklist is
// saved, asked for by the create control.

import { useState } from "react";
import { recordsDataSource } from "@ai-matrx/records-ui";

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationName } from "@/lib/redux/slices/appContextSlice";
import { createClient } from "@/utils/supabase/client";
import { PicklistsIndex } from "./PicklistsIndex";

export function PicklistsPage() {
  const userId = useAppSelector(selectUserId);
  const organizationName = useAppSelector(selectOrganizationName);
  const [dataSource] = useState(() => recordsDataSource(createClient()));

  return (
    <>
      <RouteHeader left={<h1 className="truncate text-sm font-medium">Picklists</h1>} />
      <div className="h-full overflow-y-auto p-4 pt-[calc(var(--shell-header-h)+0.5rem)]">
        {userId ? (
          <PicklistsIndex
            organizationName={organizationName ?? null}
            userId={userId}
            dataSource={dataSource}
          />
        ) : null}
      </div>
    </>
  );
}
