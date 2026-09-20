"use client";

// app/(core)/data-v2/page.tsx — THE MOUNT, AND NOTHING MORE.
//
// Every screen on this page comes from `@ai-matrx/records-ui` and every byte it
// shows comes through `@ai-matrx/records`' doors. There is no data access here,
// no layout logic and no per-table code: a capability this page seems to want
// belongs in the package, where /data-v2, a portal, an embed and an agent's
// link all inherit it at once.
//
// The switch: ONE per organization. `UNIFIED_DATA_CAMPAIGN.enabled(org)` asks
// the store's own member-readable door whether THIS organization keeps its data
// here, which is what the unified data ramp screen sets, once, for everybody.
// The per-person `custom.code_paths_enabled` half is gone (lane NAV-FIX).

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ActionInbox, RecordsMount, TablesHome, personActor, recordsDataSource } from "@ai-matrx/records-ui";

import { recordStoreShare } from "@/features/sharing/components/RecordStoreShareSurface";
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
  useUnifiedDataCampaign,
} from "@/lib/knobs/unifiedDataCampaign";

export default function UnifiedDataPage() {
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  const { organizationId, organizationState } = useOrganizationRequired();
  // ONE SWITCH: does THIS organization keep its data in the record store? Set
  // once, for everybody, on the unified data ramp screen. There is no second,
  // per-person switch any more (lane NAV-FIX, 19 September).
  const campaign = useUnifiedDataCampaign({
    organizationId,
    organizationState,
    storeSwitch: (organization) => UNIFIED_DATA_CAMPAIGN.enabled(organization),
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
          /* ONE sentence, in plain English, naming the one thing that turns
             it on — never a knob key, and never two sentences saying it twice. */
          <p className="max-w-2xl text-sm opacity-80">{campaign.because}</p>
        ) : (
          <RecordsMount
            letTheStoreDecideRights
            config={{
              dataSource: recordsDataSource(createClient()),
              actor: personActor(userId),
              organizationId: organizationId!,
            }}
            host={{ Link, density: "condensed", members, share: recordStoreShare }}
          >
            {/* WHAT IS WAITING ON THIS PERSON, above the tables — one inbox for
                what they were assigned, what needs their approval and what an
                agent has proposed (PRODUCTS.md row 6). It is the store's own
                queue (`custom.work_inbox`), so an approval raised anywhere in
                the platform arrives here. */}
            <ActionInbox
              className="mb-4 max-h-64"
              onOpenRecord={(recordId, tableId) => router.push(`/data-v2/${tableId}?record=${recordId}`)}
            />
            <TablesHome onOpenTable={(tableId) => router.push(`/data-v2/${tableId}`)} />
          </RecordsMount>
        )}
      </div>
    </>
  );
}
