"use client";

// app/(core)/data-v2/page.tsx — THE MOUNT, AND NOTHING MORE.
//
// Every screen on this page comes from `@ai-matrx/records-ui` and every byte it
// shows comes through `@ai-matrx/records`' doors. There is no data access here,
// no layout logic and no per-table code: a capability this page seems to want
// belongs in the package, where /data-v2, a portal, an embed and an agent's
// link all inherit it at once.
//
// The switch: `UNIFIED_DATA_CAMPAIGN.enabled()` is the platform default of
// `custom.code_paths_enabled`, and `useUnifiedDataCampaign` resolves the same
// row for this person in this organization, so the campaign can be on for one
// builder while it stays off for everybody else.

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RecordsMount, TablesHome, personActor, recordsDataSource } from "@ai-matrx/records-ui";

import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { getOrganizationMembers } from "@/features/organizations/service";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { createClient } from "@/utils/supabase/client";
import {
  UNIFIED_DATA_CAMPAIGN,
  UNIFIED_DATA_CAMPAIGN_OFF_SENTENCE,
  useUnifiedDataCampaign,
} from "@/lib/knobs/unifiedDataCampaign";

export default function UnifiedDataPage() {
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  const { organizationId, organizationState } = useOrganizationRequired();
  const campaign = useUnifiedDataCampaign({
    organizationId,
    organizationState,
    userId,
    platformDefault: () => UNIFIED_DATA_CAMPAIGN.enabled(),
  });

  /** The same membership port the table page binds — see its comment. */
  const members = useCallback(async () => {
    if (!organizationId) return [];
    const roster = await getOrganizationMembers(organizationId);
    return roster.map((member) => ({
      userId: member.userId,
      name: member.user?.displayName ?? null,
      email: member.user?.email ?? null,
      avatarUrl: member.user?.avatarUrl ?? null,
    }));
  }, [organizationId]);

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
            host={{ Link, density: "condensed", members }}
          >
            <TablesHome onOpenTable={(tableId) => router.push(`/data-v2/${tableId}`)} />
          </RecordsMount>
        )}
      </div>
    </>
  );
}
