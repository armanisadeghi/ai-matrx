"use client";

// app/(core)/data-v2/[tableId]/page.tsx — THE MOUNT, AND NOTHING MORE.
//
// `TablePage` from `@ai-matrx/records-ui` is the whole screen: the view bar and
// the four layouts, the record peek with its own versioned history and comment
// thread, the settings panel, the action inbox, import and export. None of it
// is assembled here, because a table opened from a portal or from an agent's
// link must be the same screen.

import { use, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { RecordsMount, TablePage, personActor, recordsDataSource } from "@ai-matrx/records-ui";

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
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";
import { useUnifiedDataCampaign } from "@/lib/knobs/useUnifiedDataCampaignGate";

export default function UnifiedDataTableRoute({
  params,
}: {
  params: Promise<{ tableId: string }>;
}) {
  const { tableId } = use(params);
  const router = useRouter();
  // AN AGENT'S ANSWER ENDS IN A LINK, AND THE LINK HAS TO LAND. `dashboard_propose`
  // builds the whole canvas in one call and hands back `?dashboard=<id>`; without this
  // line the person arrives at the records, has to find the Dashboards button, and then
  // has to guess which of several dashboards the agent meant — which is the link not
  // finishing the sentence the agent started. Absent, the page opens exactly as before.
  const activeDashboardId = useSearchParams().get("dashboard");
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

  /**
   * WHO IS IN THIS ORGANIZATION — the package's `members` port (FLD-11).
   *
   * A person field must offer PEOPLE, and who the people are is the platform's
   * answer: `iam.organization_member` joined to the accounts, which this app
   * has always read through `getOrganizationMembers`. The record store has no
   * door onto membership and the package refuses to invent one, so the app
   * answers the question it already knows how to answer.
   */
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
            {/* A table this organization cannot see says so and offers the way
                back — never the blank frame the 19 September verdict found. */}
            <TablePage
              tableId={tableId}
              onLeave={() => router.push("/data-v2")}
              // records-ui 0.16.1's TablePage does not declare `activeDashboardId`
              // yet (its DashboardCanvas does); the prop rides through a spread,
              // which the excess-property check does not judge, so the page
              // compiles against the published package and the dashboard opens
              // the moment TablePage learns the prop.
              {...{ activeDashboardId }}
            />
          </RecordsMount>
        )}
      </div>
    </>
  );
}
