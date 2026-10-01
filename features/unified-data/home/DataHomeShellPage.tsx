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
// table / Start from an example only with an active organization, bound to it), 12 the store
// switch and its notices, 13 making a table in the ACTIVE organization, 15 the inbox, 16 the mount
// ports. The list, lanes, organization filter, kinds and row facts are DataHomeList's.

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ActionInbox, RecordsMount, TablesHome, personActor, recordsDataSource } from "@ai-matrx/records-ui";
import { RecordsProvider, useRecordsClient } from "@ai-matrx/records/react";

import { recordStoreShare } from "@/features/sharing/components/RecordStoreShareSurface";
import { RecordScopedChat } from "@/features/unified-data/record-chat/RecordScopedChat";
import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { ORG_FILTER_PARAM } from "@/features/unified-data/hub/dataHomeScope";
import { seesOnlyWhatIsShared } from "@/features/unified-data/hub/capabilities";
import { useOrganizationRequired, type OrganizationState } from "@/features/organizations/useOrganizationRequired";
import { useUserOrganizations, useUserRole } from "@/features/organizations/hooks";
import { getOrganizationMembers } from "@/features/organizations/service";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { createClient } from "@/utils/supabase/client";
import { createRecordsRealtimePort } from "@/features/unified-data/realtime/recordsRealtimePort";
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";
import { useUnifiedDataCampaign } from "@/lib/knobs/useUnifiedDataCampaignGate";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs.client";
import { UnifiedDataSwitchNotice } from "@/features/unified-data/components/UnifiedDataSwitchNotice";
import { openPath } from "@/lib/deep-link/openPath";
import { RECORDS_NOTIFY } from "@/features/unified-data/recordsNotify";

import { DataHomeList } from "./DataHomeList";
import { DataHomeArchive } from "./DataHomeArchive";
import { MountWhenNear } from "./MountWhenNear";

const MEMBER_VISIBILITY = { feature: "custom", key: "member_default_visibility" } as const;

export function DataHomeShellPage() {
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  // org-filter: write-target — the active organization is where New table lands; no read narrows by it.
  const active = useOrganizationRequired();
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
  const [makeAsked, setMakeAsked] = useState({ create: 0, examples: 0 });

  // Shared-only: the sentence speaks to a member of the ONE organization the filter names, never
  // to its owner or admins (UI-FIX-19).
  const memberVisibility = useEffectiveKnob(organizationId, userId, MEMBER_VISIBILITY);
  const { role: myRole } = useUserRole(organizationId ?? undefined);
  const sharedOnlyHere = Boolean(organizationId) && seesOnlyWhatIsShared(memberVisibility, myRole);

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
          {...(organizationState === "ready" && storeOn && active.organizationId
            ? {
                actions: [
                  { icon: "Plus", label: "New table", onPress: () => setMakeAsked((n) => ({ ...n, create: n.create + 1 })) },
                  {
                    icon: "LayoutTemplate",
                    label: "Start from an example",
                    onPress: () => setMakeAsked((n) => ({ ...n, examples: n.examples + 1 })),
                  },
                ],
              }
            : {})}
        />
      </PageHeader>
      <div className="flex h-full flex-col pt-[var(--shell-header-h)]" data-data-home-shell="">
        {organizationState !== "ready" ? (
          <div className="p-4">
            <OrganizationContextNotice state={organizationState} what="Data records" />
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
                sharedOnlyHere={sharedOnlyHere}
                footer={
                  <div className="space-y-4">
                    <MakeInActiveOrganization
                      mountOrganizationId={organizationId}
                      activeOrganizationId={active.organizationId}
                      makeAsked={makeAsked}
                    />
                    <MountWhenNear>
                      <ActionInbox
                        className="max-h-64"
                        onOpenRecord={(recordId, tableId) =>
                          router.push(openPath(recordId, { fallback: `/data-v2/${tableId}?record=${recordId}` }))
                        }
                      />
                    </MountWhenNear>
                    {/* Read when the person scrolls to it: the archive door is a second walk the first screen never needs. */}
                    <MountWhenNear>
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

/**
 * MAKING A TABLE CARRIES THE ACTIVE ORGANIZATION (census 13). When the filter names that same
 * organization the mount is already bound to it; otherwise the making controls get their own
 * provider bound to the active organization. With none active the header offers no New table.
 */
function MakeInActiveOrganization({
  mountOrganizationId,
  activeOrganizationId,
  makeAsked,
}: {
  mountOrganizationId: string | null;
  activeOrganizationId: string | null;
  makeAsked: { create: number; examples: number };
}) {
  const router = useRouter();
  const client = useRecordsClient();
  const open = (tableId: string, dashboardId?: string | null) =>
    router.push(dashboardId ? `/data-v2/${tableId}?dashboard=${dashboardId}` : `/data-v2/${tableId}`);
  if (!activeOrganizationId) {
    return (
      <p className="text-xs text-muted-foreground" data-hub-make-needs-organization="">
        Choose an organization in the header to make a table.
      </p>
    );
  }
  if (mountOrganizationId === activeOrganizationId) return <TablesHome makingOnly askedBy={makeAsked} onOpenTable={open} />;
  return (
    // org-filter: write-target the making controls file a NEW table in the active organization; nothing is listed here
    <RecordsProvider config={{ ...client.config, organizationId: activeOrganizationId }}>
      <TablesHome makingOnly askedBy={makeAsked} onOpenTable={open} />
    </RecordsProvider>
  );
}
