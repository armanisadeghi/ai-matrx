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

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ActionInbox, RecordsMount, personActor, recordsDataSource } from "@ai-matrx/records-ui";

import { OrganizationHub } from "@/features/unified-data/hub/OrganizationHub";

import { recordStoreShare } from "@/features/sharing/components/RecordStoreShareSurface";
import { RecordScopedChat } from "@/features/unified-data/record-chat/RecordScopedChat";
import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  ALL_ORGANIZATIONS,
  ORG_FILTER_PARAM,
  dataHomeOrganizationHref,
  resolveDataHomeOrganization,
} from "@/features/unified-data/hub/dataHomeScope";
import { useOrganizationRequired, type OrganizationState } from "@/features/organizations/useOrganizationRequired";
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
import { DataHomeRoute } from "@/features/unified-data/home/DataHomeRoute";

// THE ONE SWITCH BETWEEN TWO DATA HOMES (lane DATA-HOME-3A): the knob `custom.data_home_shell`
// (default off = this page, unchanged) or `?home=new|old` for one visit. Copy mode until Arman's flip.
export default function DataHomeRoutePage() {
  return <DataHomeRoute old={<UnifiedDataPage />} />;
}

function UnifiedDataPage() {
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  // org-filter: write-target the active organization is where New table lands (and the settings rung for the home's knobs); no read here narrows by it
  const active = useOrganizationRequired();
  /**
   * TWO ORGANIZATION CONCEPTS THAT NEVER TOUCH (Arman, 2026-09-30,
   * common-docs/policies/active-org-is-never-a-list-filter.md).
   *
   * THE ORGANIZATION FILTER is the page's own control (the shell's `EntityOrgFilter`, right end of
   * the lane row). It lives only in the address — `?org_filter=<id>` — starts at All organizations
   * on every visit, is never remembered and never set from the active organization. Only an
   * organization the person belongs to is honoured; any other id reads as All organizations.
   * One organization chosen, every listing's door is told it (`p_organization_id`); All, the mount
   * carries no organization at all and the doors answer for the person.
   *
   * THE ACTIVE ORGANIZATION (the shell's switcher) is only where a NEW table is made: the header's
   * New table / Start from an example carry it (the hub binds its making controls to it), and with
   * none set they are held until the person picks one. It never narrows a read here.
   */
  const searchParams = useSearchParams();
  const { organizations: myOrganizations, loading: myOrganizationsLoading } = useUserOrganizations();
  const addressPick = searchParams.get(ORG_FILTER_PARAM);
  const organizationFilter = resolveDataHomeOrganization(
    addressPick,
    myOrganizationsLoading ? null : myOrganizations.map((org) => org.id),
  );
  const namedOrganization =
    organizationFilter === ALL_ORGANIZATIONS ? undefined : myOrganizations.find((org) => org.id === organizationFilter);
  const acrossAll = organizationFilter === ALL_ORGANIZATIONS;
  const organizationId: string | null = namedOrganization ? namedOrganization.id : null;
  // A named organization is held only until the person's memberships are read (then honoured or
  // dropped to All); All organizations needs nothing to be ready.
  const organizationState: OrganizationState =
    namedOrganization || acrossAll ? "ready" : myOrganizationsLoading ? "resolving" : "ready";
  const chooseOrganization = useCallback(
    (next: string | null) => {
      const href = dataHomeOrganizationHref(
        "/data-v2",
        new URLSearchParams(searchParams.toString()),
        next ?? ALL_ORGANIZATIONS,
      );
      router.push(href, { scroll: false });
    },
    [router, searchParams],
  );
  // ONE SWITCH: does THIS organization keep its data in the record store? Set
  // once, for everybody, on the unified data ramp screen. There is no second,
  // per-person switch any more (lane NAV-FIX, 19 September).
  const campaign = useUnifiedDataCampaign({
    organizationId,
    organizationState,
    storeSwitch: (organization) => UNIFIED_DATA_CAMPAIGN.check(organization),
  });

  /** ALL ORGS reads through the person's doors, not one organization's store switch (that switch is per organization). */
  const storeOn = acrossAll || campaign.state === "on";

  /** The same membership port the table page binds — see its comment. */
  const members = useCallback(async () => {
    if (!organizationId) return [];
    // OPEN (RC-B12 r13): records-ui's `host.members()` consumers do not handle a
    // rejection yet, so a failed roster read answers [] here WITH a log; the honest
    // failure state belongs in @ai-matrx/records-ui's people picker.
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

  /**
   * THE ONE DATA SEAM, built once and handed to BOTH the mount and the hub.
   * The hub reads three doors this installed client predates and so calls them
   * through this seam by name; building a second one here would mean two
   * supabase clients on one page and two ideas of who is signed in.
   */
  const dataSource = useMemo(() => recordsDataSource(createClient()), []);
  /** How many times the header's New table / Start from an example was pressed. */
  const [makeAsked, setMakeAsked] = useState({ create: 0, examples: 0 });

  const goBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.replace("/data-v2");
  }, [router]);

  return (
    <>
      {/* BACK, AND NO WORD IN THE MIDDLE (lane DATA-HOME-1, Arman 2026-09-27): "Data" at the top
          centre said nothing the page does not, and from `?scope=…` there was no way back. The
          filters are navigations now, so Back walks them; with no page behind this one, Back
          lands on the home's own first view rather than doing nothing. */}
      <PageHeader>
        {/* MAKING A TABLE IS THE HEADER'S ACTION (merged-grid review 2, J6: "New table" sat ~1,700 px
            down the page, then as a row of its own). Offered once the store can take one. */}
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
      <div className="h-full overflow-y-auto pt-[var(--shell-header-h)] p-4">
        {organizationState !== "ready" ? (
          <OrganizationContextNotice state={organizationState} what="Data records" />
        ) : !storeOn ? (
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
              organizationId,
              // LIVE UPDATES. The grid's "Not live: this host bound no realtime port" banner
              // was naming exactly this seam. The port joins the private topic the database
              // broadcasts a NOTICE on and re-reads through the read door; `undefined` when
              // the store's switch is off, and the honest banner comes back.
              realtime: organizationId ? createRecordsRealtimePort(organizationId) : undefined,
            }}
            host={{
              Link,
              density: "condensed",
              // The page's toasts: a landed move's sentence outlives the list's re-read (UI-FIX-19).
              notify: RECORDS_NOTIFY,
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
              organizationId={organizationId}
              knobOrganizationId={active.organizationId}
              dataSource={dataSource}
              organizationName={namedOrganization?.name ?? null}
              makeAsked={makeAsked}
              organizationFilter={organizationFilter}
              onChooseOrganization={chooseOrganization}
              /* WHAT IS WAITING ON THIS PERSON — one inbox for what they were
                 assigned, what needs their approval and what an agent has
                 proposed (PRODUCTS.md row 6), the store's own `custom.work_inbox`,
                 so an approval raised anywhere in the platform arrives here.
                 🚨 IT IS A SLOT ON THE HUB NOW, NOT A BLOCK ABOVE IT: rendered
                 here it filled the whole first screen of the organization's
                 front door with thirty-seven approval cards (VERIFIER-14 §3).
                 The hub puts it under the listings. */
              inbox={
                // `custom.work_inbox` takes NULL = every organization the person belongs to; rows carry no
                // organization column, so opening one goes through the `/o/<id>` resolver below.
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
