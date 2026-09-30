"use client";

// app/(core)/lists/v3/page.tsx — THE PICKLISTS PAGE (lane HANDOVER, 2026-09-27).
//
// Every picklist the person can open, across all their organizations, from THE LIST INDEX (one
// store door), a row opening each at its one address `/lists/<id>`. The mount only: the store's
// records seam for the archive and the header. The list never waits on an active organization
// (active-org-is-never-a-list-filter law): the active organization is only where a NEW picklist is
// saved, asked for by the create control. The v1 · v2 · v3 switcher in the header retires at the
// final switch, when the two older editors land here (PROGRESS-FINAL-SWITCH.md, retirement plan).

import { useState } from "react";
import { recordsDataSource } from "@ai-matrx/records-ui";

import { StructuredListEditorHeader } from "@/features/structured-lists/StructuredListEditorHeader";
import { PicklistsIndex } from "@/features/user-lists/components/PicklistsIndex";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationName } from "@/lib/redux/slices/appContextSlice";
import { createClient } from "@/utils/supabase/client";

export default function PicklistsPage() {
  const userId = useAppSelector(selectUserId);
  const organizationName = useAppSelector(selectOrganizationName);
  const [dataSource] = useState(() => recordsDataSource(createClient()));

  return (
    <>
      <StructuredListEditorHeader title="Picklists" />
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
