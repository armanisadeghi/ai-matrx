"use client";

// features/unified-data/home/DataHomeShellPage.tsx — LANE DATA-HOME-3A
//
// /data ON THE LIST SHELL — the data home: header, the per-organization store switch,
// `RecordsMount` with its realtime, chat, share and members ports, and the list shell. (The old hub
// it replaced, and the knob `custom.data_home_shell` that chose between them, left after the
// switch's soak — lane ONE-HOME wave 4.)
//
// The census (DATA-HOME-3-SPEC §3) items this file keeps: 1 header (Back, no "Data" word, New
// table / Start from an example always, opening the one New table dialog — G5 b), 12 the store
// switch and its notices, 13 making a table in the ACTIVE organization, 15 the inbox (a header
// action opening the one inbox window, in place), 16 the mount ports. The list, lanes, organization filter, kinds and row facts are DataHomeList's.

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { RecordsMount } from "@ai-matrx/records-ui";

import { recordStoreShare } from "@/features/sharing/components/RecordStoreShareSurface";
import { RecordScopedChat } from "@/features/unified-data/record-chat/RecordScopedChat";
import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { ORG_FILTER_PARAM } from "@/features/unified-data/hub/dataHomeScope";
import type { OrganizationState } from "@/features/organizations/useOrganizationRequired";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { getOrganizationMembers } from "@/features/organizations/service";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { RECORDS_NOTIFY } from "@/features/unified-data/recordsNotify";

import { DataHomeList } from "./DataHomeList";
import { DataHomeMap } from "@/features/unified-data/map/DataHomeMap";
import { useDataHomeShowPlatformTables } from "./useDataHomeMarks";
import type { DataHomeMaking } from "./DataHomeRoute";
import { TEMPLATE_GALLERY_HREF } from "@/features/make/gallery/galleryHref";
import { useAppRecordsConfig } from "@/features/data-tables/records-ui-host/recordsUiHost";

export const MAP_PARAM = "map";

/** `making` is the route's: the header's presses open the route's one New table dialog. */
export function DataHomeShellPage({ making }: { making: DataHomeMaking }) {
  const router = useRouter();
  const dispatch = useAppDispatch();
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

  const recordsConfig = useAppRecordsConfig(organizationId);
  const dataSource = recordsConfig.dataSource;


  // THE MAP (lane TABLE-MAP): the same tables as cards and lines. `?map=1` keeps it linkable and
  // leaves the list's own filters alone; it follows the organization filter and the platform switch.
  const mapOn = searchParams.get(MAP_PARAM) === "1";
  const [showPlatformTables] = useDataHomeShowPlatformTables();
  const toggleMap = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    if (mapOn) next.delete(MAP_PARAM);
    else next.set(MAP_PARAM, "1");
    const query = next.toString();
    router.replace(query ? `/data?${query}` : "/data");
  }, [mapOn, router, searchParams]);

  const goBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.replace("/data");
  }, [router]);

  return (
    <>
      <PageHeader>
        {/* A NEW TABLE LANDS IN THE ACTIVE ORGANIZATION (the law's rule 4) — never the filter's. */}
        <HeaderStructured
          back={goBack}
          {...(organizationState === "ready"
            ? {
                actions: [
                  { icon: "Plus", label: "New table", onPress: () => making.ask("create") },
                  { icon: "FileInput", label: "Import from Notion", onPress: making.importFromNotion },
                  { icon: mapOn ? "List" : "Network", label: mapOn ? "List" : "Map", onPress: toggleMap },
                  {
                    icon: "LayoutTemplate",
                    label: "Start from a template",
                    onPress: () => router.push(TEMPLATE_GALLERY_HREF),
                  },
                  // THE INBOX OPENS IN PLACE (2026-10-05): the one inbox window the bell opens.
                  // Mounted under the list it made /data scroll twice — the page and the table.
                  {
                    icon: "Inbox",
                    label: "Inbox",
                    onPress: () => dispatch(openOverlay({ overlayId: "workInboxWindow" })),
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
        ) : (
          <RecordsMount
            letTheStoreDecideRights
            config={recordsConfig}
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
              {mapOn ? (
                <DataHomeMap dataSource={dataSource} organizationFilter={organizationId} showPlatformTables={showPlatformTables} />
              ) : (
                <DataHomeList dataSource={dataSource} />
              )}
            </div>
          </RecordsMount>
        )}
      </div>
    </>
  );
}
