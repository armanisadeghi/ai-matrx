"use client";

// app/(core)/lists/v3/page.tsx — THE PICKLISTS PAGE (lane HANDOVER, 2026-09-27).
//
// The organization's picklists from THE LIST INDEX (one store door), a row opening each at its one
// address `/lists/<id>`. The mount only: organization, the store's records client for the archive,
// and the header. The v1 · v2 · v3 switcher in the header retires at the final switch, when the two
// older editors land here (PROGRESS-FINAL-SWITCH.md, retirement plan).

import { useState } from "react";
import Link from "next/link";
import { RecordsMount, personActor, recordsDataSource } from "@ai-matrx/records-ui";

import { StructuredListEditorHeader } from "@/features/structured-lists/StructuredListEditorHeader";
import { PicklistsIndex } from "@/features/user-lists/components/PicklistsIndex";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationName } from "@/lib/redux/slices/appContextSlice";
import { createClient } from "@/utils/supabase/client";
import { RECORDS_NOTIFY } from "@/features/unified-data/recordsNotify";

export default function PicklistsPage() {
  const userId = useAppSelector(selectUserId);
  const organizationName = useAppSelector(selectOrganizationName);
  const active = useOrganizationRequired();
  const [dataSource] = useState(() => recordsDataSource(createClient()));

  return (
    <>
      <StructuredListEditorHeader title="Picklists" />
      <div className="h-full overflow-y-auto p-4 pt-[calc(var(--shell-header-h)+0.5rem)]">
        {active.organizationState !== "ready" || !active.organizationId || !userId ? (
          <OrganizationContextNotice state={active.organizationState} what="Picklists" />
        ) : (
          <RecordsMount
            letTheStoreDecideRights
            config={{ dataSource, actor: personActor(userId), organizationId: active.organizationId }}
            host={{ Link, density: "condensed", notify: RECORDS_NOTIFY }}
          >
            <PicklistsIndex
              key={active.organizationId}
              organizationId={active.organizationId}
              organizationName={organizationName ?? null}
              userId={userId}
              dataSource={dataSource}
            />
          </RecordsMount>
        )}
      </div>
    </>
  );
}
