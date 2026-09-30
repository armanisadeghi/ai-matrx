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
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  selectDataHomeOrganizationPick,
  selectPreferencesLoadStatus,
} from "@/lib/redux/preferences/userPreferenceSelectors";
import { setModulePreferences } from "@/lib/redux/preferences/userPreferencesSlice";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import {
  ALL_ORGANIZATIONS,
  DATA_HOME_DEFAULT_ORGANIZATION_KNOB,
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

export default function UnifiedDataPage() {
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  const active = useOrganizationRequired();
  /**
   * THE ORGANIZATION THE HOME SHOWS — the dropdown at the end of the hub's bar (lane DATA-HOME-2,
   * Arman 2026-09-28: "with titanium selected the home still lists every organization").
   *
   * `?org=<id>|all` is what the person chose this visit (and the way back from a table that was
   * just archived names its organization the same way, lane ACCESS-FIX-18); without it, their
   * SAVED pick (userPreferences.lists.dataHomeOrganizationId — their account, every device); then
   * the Feature Knob `custom.data_home_default_organization` (platform default All Orgs). Only an
   * organization the person belongs to is honoured. One organization chosen, the mount — and so
   * every listing — is bound to it and the door lists only its tables; All Orgs, the tables are
   * every organization's and the forms and pages are the active organization's, said on the bar.
   *
   * 🚨 SWITCHING THE ACTIVE ORGANIZATION ELSEWHERE NEVER CHANGES THIS FILTER. The old "CHANGE MEANS
   * CHANGE" effect dropped `?org=` whenever the active organization moved; it is gone, because the
   * filter is the person's own choice on this page and nothing else may move it silently.
   */
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();
  const { organizations: myOrganizations, loading: myOrganizationsLoading } = useUserOrganizations();
  const savedPick = useAppSelector(selectDataHomeOrganizationPick);
  const preferencesLoad = useAppSelector(selectPreferencesLoadStatus);
  const defaultOrganizationKnob = useEffectiveKnob(active.organizationId, userId, DATA_HOME_DEFAULT_ORGANIZATION_KNOB);
  const addressPick = searchParams.get("org");
  const organizationFilter = resolveDataHomeOrganization(
    addressPick,
    savedPick,
    defaultOrganizationKnob,
    myOrganizationsLoading ? null : myOrganizations.map((org) => org.id),
  );
  const namedOrganization =
    organizationFilter === ALL_ORGANIZATIONS ? undefined : myOrganizations.find((org) => org.id === organizationFilter);
  // ALL ORGS (the default) MOUNTS WITH NO ORGANIZATION AT ALL (Arman, 2026-09-25: access belongs to
  // the person, not the header's selected organization). The home's doors answer for the person
  // (`custom.data_home*`, NULL), so nothing here waits on, or is narrowed by, the selected
  // organization; only the ONE organization the person chose in the on-page dropdown binds the mount.
  const acrossAll = organizationFilter === ALL_ORGANIZATIONS;
  const organizationId: string | null = namedOrganization ? namedOrganization.id : null;
  // HELD, never guessed: until the person's memberships and saved pick are read, which
  // organization the home shows is not known, and showing All Orgs for a moment would be a lie.
  const pickUnread = !addressPick && preferencesLoad === "loading";
  const organizationState: OrganizationState = namedOrganization
    ? "ready"
    : (!acrossAll && myOrganizationsLoading) || pickUnread
      ? "resolving"
      : acrossAll
        ? "ready"
        : active.organizationState;
  const organizationChoices = [...myOrganizations]
    .map((org) => ({ id: org.id, name: org.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const chooseOrganization = useCallback(
    (next: string) => {
      // SAVED TO THE PERSON'S ACCOUNT (the synced preferences record), so the next visit lands here.
      dispatch(setModulePreferences({ module: "lists", preferences: { dataHomeOrganizationId: next } }));
      const href = dataHomeOrganizationHref("/data-v2", new URLSearchParams(searchParams.toString()), next);
      router.push(href, { scroll: false });
    },
    [dispatch, router, searchParams],
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
        <HeaderStructured
          back={goBack}
          {...(organizationState === "ready" && storeOn
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
              dataSource={dataSource}
              organizationName={namedOrganization?.name ?? null}
              makeAsked={makeAsked}
              organizationFilter={organizationFilter}
              organizationChoices={organizationChoices}
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
