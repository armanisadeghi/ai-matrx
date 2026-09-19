"use client";

// app/(core)/data-v2/[tableId]/page.tsx — THE MOUNT, AND NOTHING MORE.
//
// `TablePage` from `@ai-matrx/records-ui` is the whole screen: the view bar and
// the four layouts, the record peek with its own versioned history and comment
// thread, the settings panel, the action inbox, import and export. None of it
// is assembled here, because a table opened from a portal or from an agent's
// link must be the same screen.

import { use } from "react";
import Link from "next/link";
import { RecordsMount, TablePage, personActor, recordsDataSource } from "@ai-matrx/records-ui";

import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { createClient } from "@/utils/supabase/client";
import {
  UNIFIED_DATA_CAMPAIGN,
  UNIFIED_DATA_CAMPAIGN_OFF_SENTENCE,
  useUnifiedDataCampaign,
} from "@/lib/knobs/unifiedDataCampaign";

export default function UnifiedDataTableRoute({
  params,
}: {
  params: Promise<{ tableId: string }>;
}) {
  const { tableId } = use(params);
  const userId = useAppSelector(selectUserId);
  const { organizationId, organizationState } = useOrganizationRequired();
  const campaign = useUnifiedDataCampaign({
    organizationId,
    organizationState,
    userId,
    platformDefault: () => UNIFIED_DATA_CAMPAIGN.enabled(),
  });

  return (
    <>
      <PageHeader>
        <HeaderStructured title="Data" />
      </PageHeader>
      <div className="h-full overflow-y-auto pt-[var(--shell-header-h)] p-4">
        {organizationState !== "ready" ? (
          <OrganizationContextNotice state={organizationState} what="Data records" />
        ) : campaign.on === null ? null : !campaign.on ? (
          <p className="max-w-2xl text-sm opacity-80">
            {UNIFIED_DATA_CAMPAIGN_OFF_SENTENCE} <span className="opacity-70">{campaign.because}</span>
          </p>
        ) : (
          <RecordsMount
            letTheStoreDecideRights
            config={{
              dataSource: recordsDataSource(createClient()),
              actor: personActor(userId),
              organizationId: organizationId!,
            }}
            host={{ Link, density: "condensed" }}
          >
            <TablePage tableId={tableId} />
          </RecordsMount>
        )}
      </div>
    </>
  );
}
