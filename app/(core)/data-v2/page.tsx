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

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ActionInbox, RecordsMount, personActor, recordsDataSource } from "@ai-matrx/records-ui";

import { OrganizationHub } from "@/features/unified-data/hub/OrganizationHub";

import { recordStoreShare } from "@/features/sharing/components/RecordStoreShareSurface";
import { RecordScopedChat } from "@/features/unified-data/record-chat/RecordScopedChat";
import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { getOrganizationMembers } from "@/features/organizations/service";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { createClient } from "@/utils/supabase/client";
import { createRecordsRealtimePort } from "@/features/unified-data/realtime/recordsRealtimePort";
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";
import { useUnifiedDataCampaign } from "@/lib/knobs/useUnifiedDataCampaignGate";
import { UnifiedDataSwitchNotice } from "@/features/unified-data/components/UnifiedDataSwitchNotice";
import { openPath } from "@/lib/deep-link/openPath";

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
    storeSwitch: (organization) => UNIFIED_DATA_CAMPAIGN.check(organization),
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

  /**
   * THE ONE DATA SEAM, built once and handed to BOTH the mount and the hub.
   * The hub reads three doors this installed client predates and so calls them
   * through this seam by name; building a second one here would mean two
   * supabase clients on one page and two ideas of who is signed in.
   */
  const dataSource = useMemo(() => recordsDataSource(createClient()), []);

  return (
    <>
      <PageHeader>
        <HeaderStructured title="Data" />
      </PageHeader>
      <div className="h-full overflow-y-auto pt-[var(--shell-header-h)] p-4">
        {organizationState !== "ready" ? (
          <OrganizationContextNotice state={organizationState} what="Data records" />
        ) : campaign.state !== "on" ? (
          /* THE ONE NOTICE. Resolving, could-not-check and genuinely-off are
             three different things and this says which — a failed check is
             "could not check, try again", never a claim about the organization
             (lane SHARE-OUT, item 3). */
          <UnifiedDataSwitchNotice gate={campaign} what="Data records" />
        ) : (
          <RecordsMount
            letTheStoreDecideRights
            config={{
              dataSource,
              actor: personActor(userId),
              organizationId: organizationId!,
              // LIVE UPDATES. The grid's "Not live: this host bound no realtime port" banner
              // was naming exactly this seam. The port joins the private topic the database
              // broadcasts a NOTICE on and re-reads through the read door; `undefined` when
              // the store's switch is off, and the honest banner comes back.
              realtime: createRecordsRealtimePort(organizationId!),
            }}
            host={{
              Link,
              density: "condensed",
              members,
              share: recordStoreShare,
              // AGT-N-9 / PRODUCTS row 11. The package builds the record SCOPE and
              // hands it here; this returns the platform's ONE chat column bound to
              // that record. Never a second chat (the canvas ruling).
              chat: (ctx) => <RecordScopedChat ctx={ctx} organizationId={organizationId} />,
            }}
          >
            {/* THE ORGANIZATION'S HUB — every capability the record store has, each
                read through the ONE door that answers for the whole organization,
                with the lanes as filters and the tables list inside it. This is
                /data-v2's landing; there is deliberately no second route family
                for it. Lane DATA-HUB, 2026-09-22. */}
            <OrganizationHub
              organizationId={organizationId!}
              dataSource={dataSource}
              /* WHAT IS WAITING ON THIS PERSON — one inbox for what they were
                 assigned, what needs their approval and what an agent has
                 proposed (PRODUCTS.md row 6), the store's own `custom.work_inbox`,
                 so an approval raised anywhere in the platform arrives here.
                 🚨 IT IS A SLOT ON THE HUB NOW, NOT A BLOCK ABOVE IT: rendered
                 here it filled the whole first screen of the organization's
                 front door with thirty-seven approval cards (VERIFIER-14 §3).
                 The hub puts it under the listings. */
              inbox={
                <ActionInbox
                  className="max-h-64"
                  /* THE ONE ADDRESS (lane ROUTE-RESOLVER). An approval raised in
                     another organization's table, or on a table shared in, used to open
                     here inside whichever organization was selected and say "This table
                     is not here". `/o/<id>` asks the one door, which opens the record
                     inside the organization it LIVES in. */
                  onOpenRecord={(recordId, tableId) =>
                    router.push(
                      openPath(recordId, { fallback: `/data-v2/${tableId}?record=${recordId}` }),
                    )
                  }
                />
              }
            />
          </RecordsMount>
        )}
      </div>
    </>
  );
}
