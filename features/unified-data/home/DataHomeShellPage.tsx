"use client";

// features/unified-data/home/DataHomeShellPage.tsx — LANE DATA-HOME-3A
//
// /data-v2 ON THE LIST SHELL: the same mount as the old page (`app/(core)/data-v2/page.tsx`'s
// UnifiedDataPage — header, the per-organization store switch, `RecordsMount` with its realtime,
// chat, share and members ports), with the list shell where the ten hand-drawn sections were.
// Shown when the knob `custom.data_home_shell` says so (see dataHomeKnobs.ts); the old page is
// untouched beside it until Arman's one flip.
//
// The census (DATA-HOME-3-SPEC §3) items this file keeps: 1 header (Back, no "Data" word, New
// table / Start from an example always, opening the one New table dialog — G5 b), 12 the store
// switch and its notices, 13 making a table in the ACTIVE organization, 15 the inbox, 16 the mount
// ports. The list, lanes, organization filter, kinds and row facts are DataHomeList's.

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ActionInbox, RecordsMount, personActor, recordsDataSource } from "@ai-matrx/records-ui";

import { recordStoreShare } from "@/features/sharing/components/RecordStoreShareSurface";
import { RecordScopedChat } from "@/features/unified-data/record-chat/RecordScopedChat";
import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { ORG_FILTER_PARAM } from "@/features/unified-data/hub/dataHomeScope";
import type { OrganizationState } from "@/features/organizations/useOrganizationRequired";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { getOrganizationMembers } from "@/features/organizations/service";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { createClient } from "@/utils/supabase/client";
import { createRecordsRealtimePort } from "@/features/unified-data/realtime/recordsRealtimePort";
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";
import { useUnifiedDataCampaign } from "@/lib/knobs/useUnifiedDataCampaignGate";
import { UnifiedDataSwitchNotice } from "@/features/unified-data/components/UnifiedDataSwitchNotice";
import { openPath } from "@/lib/deep-link/openPath";
import { RECORDS_NOTIFY } from "@/features/unified-data/recordsNotify";

import { DataHomeList } from "./DataHomeList";
import { DataHomeArchive } from "./DataHomeArchive";
import { MountWhenNear } from "./MountWhenNear";
import { foundHighlightOf } from "@ai-matrx/kit/reversible";
import { ARCHIVED_TABLES_SPOT } from "./archivedTablesPlace";
import type { DataHomeMaking } from "./DataHomeRoute";

/** `making` is the route's: a press made on the old home before the swap still opens here. */
export function DataHomeShellPage({ making }: { making: DataHomeMaking }) {
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  const searchParams = useSearchParams();
  const { organizations: myOrganizations, loading: myOrganizationsLoading } = useUserOrganizations();
  // THE ORGANIZATION FILTER is the shell's (`?org_filter=`). The mount is bound to it when it names
  // one of the person's organizations (so the store switch, realtime and members follow), exactly as
  // the old page; under All organizations the mount carries none and the doors answer for the person.
  const addressPick = searchParams.get(ORG_FILTER_PARAM);
  const namedOrganization = addressPick ? myOrganizations.find((org) => org.id === addressPick) : undefined;
  const organizationId: string | null = namedOrganization ? namedOrganization.id : null;
  const acrossAll = !addressPick || (!myOrganizationsLoading && !namedOrganization);
  const organizationState: OrganizationState =
    namedOrganization || acrossAll ? "ready" : myOrganizationsLoading ? "resolving" : "ready";

  const campaign = useUnifiedDataCampaign({
    organizationId,
    organizationState,
    storeSwitch: (organization) => UNIFIED_DATA_CAMPAIGN.check(organization),
  });
  const storeOn = acrossAll || campaign.state === "on";

  const members = useCallback(async () => {
    if (!organizationId) return [];
    // A failed roster read answers [] here WITH a log (same as the old page; RC-B12 r13).
    const roster = await getOrganizationMembers(organizationId).catch((err: unknown) => {
      console.error("[records members port] roster read failed:", err);
      return [];
    });
    return roster.map((member) => ({
      userId: member.userId,
      name: member.user?.displayName ?? null,
      email: member.user?.email ?? null,
      avatarUrl: member.user?.avatarUrl ?? null,
    }));
  }, [organizationId]);

  const dataSource = useMemo(() => recordsDataSource(createClient()), []);


  const goBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.replace("/data-v2");
  }, [router]);

  return (
    <>
      <PageHeader>
        {/* A NEW TABLE LANDS IN THE ACTIVE ORGANIZATION (the law's rule 4) — never the filter's. */}
        <HeaderStructured
          back={goBack}
          {...(organizationState === "ready" && storeOn
            ? {
                actions: [
                  { icon: "Plus", label: "New table", onPress: () => making.ask("create") },
                  {
                    icon: "LayoutTemplate",
                    label: "Start from an example",
                    onPress: () => making.ask("examples"),
                  },
                ],
              }
            : {})}
        />
      </PageHeader>
      <div className="flex h-full flex-col pt-[var(--shell-header-h)]" data-data-home-shell="">
        {/* No store door before a person (lane MONITOR-TRIAGE), as on the old home. */}
        {organizationState !== "ready" || !userId ? (
          <div className="p-4">
            <OrganizationContextNotice state={userId ? organizationState : "resolving"} what="Data records" />
          </div>
        ) : !storeOn ? (
          <div className="p-4">
            <UnifiedDataSwitchNotice gate={campaign} what="Data records" />
          </div>
        ) : (
          <RecordsMount
            letTheStoreDecideRights
            config={{
              dataSource,
              actor: personActor(userId),
              organizationId,
              realtime: organizationId ? createRecordsRealtimePort(organizationId) : undefined,
            }}
            host={{
              Link,
              density: "condensed",
              notify: RECORDS_NOTIFY,
              members,
              share: recordStoreShare,
              chat: (ctx) => <RecordScopedChat ctx={ctx} organizationId={organizationId} />,
            }}
          >
            <div className="min-h-0 flex-1">
              <DataHomeList
                dataSource={dataSource}
                footer={
                  <div className="space-y-4">
                    <MountWhenNear>
                      <ActionInbox
                        className="max-h-64"
                        onOpenRecord={(recordId, tableId) =>
                          router.push(openPath(recordId, { fallback: `/data-v2/${tableId}?record=${recordId}` }))
                        }
                      />
                    </MountWhenNear>
                    {/* Read when the person scrolls to it: the archive door is a second walk the first screen never needs. */}
                    <MountWhenNear eager={foundHighlightOf(searchParams) === ARCHIVED_TABLES_SPOT}>
                      <DataHomeArchive dataSource={dataSource} organizationFilter={organizationId} />
                    </MountWhenNear>
                  </div>
                }
              />
            </div>
          </RecordsMount>
        )}
      </div>
    </>
  );
}
