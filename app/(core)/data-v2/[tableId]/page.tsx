"use client";

// app/(core)/data-v2/[tableId]/page.tsx — THE MOUNT, AND NOTHING MORE.
//
// `TablePage` from `@ai-matrx/records-ui` is the whole screen: the view bar and
// the four layouts, the record peek with its own versioned history and comment
// thread, the settings panel, the action inbox, import and export. None of it
// is assembled here, because a table opened from a portal or from an agent's
// link must be the same screen.

import { use, useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RecordsMount, TablePage, personActor, recordsDataSource } from "@ai-matrx/records-ui";
import type { AgentBuildAsk, OpenRecordsAsk, PageView } from "@ai-matrx/records-ui";
import type { RecordFilter } from "@ai-matrx/records";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";

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
import { useSharedTable } from "@/features/unified-data/hub/useSharedTable";
import { createRecordsRealtimePort } from "@/features/unified-data/realtime/recordsRealtimePort";
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";
import { useUnifiedDataCampaign } from "@/lib/knobs/useUnifiedDataCampaignGate";
import { UnifiedDataSwitchNotice } from "@/features/unified-data/components/UnifiedDataSwitchNotice";

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
  const searchParams = useSearchParams();
  const activeDashboardId = searchParams.get("dashboard");
  // THE INBOX'S OWN LINK. `ActionInbox` routes every Open to
  // `/data-v2/<table>?record=<record>` — an approval, an assignment, an agent's proposal, a
  // checklist step — and until records-ui 0.44.0 nothing read it, so pressing Open landed
  // here with the record still shut. Same shape as `?dashboard=`: a link a queue produced has
  // to finish the sentence it started.
  const activeRecordId = searchParams.get("record");
  /**
   * WHICH VIEW THE ADDRESS NAMES — grid, kanban, calendar, gallery, dashboards.
   *
   * 🚨 THE THIRD DEAD LINK OF THE SAME SHAPE (VERIFIER-8 HIGH-2, 2026-09-21).
   * `?view=kanban` returned 200 and rendered the grid, because — exactly like
   * `?dashboard=` and `?record=` before it — the parameter was in the address
   * and nothing read it. A person who bookmarks a board or sends one to a
   * colleague got a grid, silently.
   *
   * It is passed RAW: a word this build has no view for is something the person
   * must be told about, and `TablePage` says it. The route does not parse and
   * it does not substitute.
  */
  const activeView = searchParams.get("view");
  /** Which field the board's columns are, when a dashboard number sent them here. */
  const activeGroupField = searchParams.get("group");
  /** The number they clicked, so the board can say where they came from. */
  const cameFrom = searchParams.get("from");
  /**
   * WHICH RECORDS THE NUMBER WAS COUNTED OVER — the store's one filter shape,
   * carried in the address as JSON so the link can be bookmarked and sent.
   *
   * 🚨 THIS IS THE HALF THAT DID NOT EXIST YESTERDAY (lane DRILL, 2026-09-22).
   * TAILS-6 wired the click and had to throw the filter away, because
   * `custom.read_records` took no filter: the address kept only `group` and
   * `from`, so a bar saying 27 opened all 41 records with a sentence
   * apologising for it. `custom.read_records_matching` takes the filter now, so
   * the address carries it and `TablePage` narrows the grid AND the board with
   * it.
   *
   * A parameter that is not JSON, or is JSON that is not an object, is DROPPED
   * rather than half-applied: a filter half-read is a screen quietly showing a
   * different set of records than its own sentence claims. The board still says
   * where the person came from, and the whole table is what they see — which is
   * exactly the honest fallback, and it is the same one an old TAILS-6 link
   * (which carries no `filter` at all) lands on.
   */
  const rawFilter = searchParams.get("filter");
  const filter = useMemo<RecordFilter | null>(() => {
    if (!rawFilter) return null;
    try {
      const parsed: unknown = JSON.parse(rawFilter);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      const entries = Object.entries(parsed as Record<string, unknown>);
      if (entries.length === 0) return null;
      return Object.fromEntries(entries) as RecordFilter;
    } catch {
      return null;
    }
  }, [rawFilter]);
  const pathname = usePathname();
  /**
   * AND THE ADDRESS FOLLOWS THEM. Half a deep link is a link that works when
   * you arrive and lies when you copy it out of the bar afterwards. `replace`
   * rather than `push`, because which view you are looking at is not a place
   * you want the Back button to walk you through one layout at a time.
   */
  const onViewChanged = useCallback(
    (view: PageView) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("view", view);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );
  const userId = useAppSelector(selectUserId);
  const { organizationId, organizationState } = useOrganizationRequired();
  /**
   * THE ONE DATA SEAM, built once. It was built inline in `config` before,
   * which made a new client on every render and gave this route no way to ask
   * the store anything of its own.
   */
  const dataSource = useMemo(() => recordsDataSource(createClient()), []);
  /**
   * WHOSE TABLE THIS IS — `?org=`, the platform's own way of making a link name
   * its organization (`platform.link_carries_its_organization`).
   *
   * 🚨 THE DEAD ROW THIS CLOSES (VERIFIER-14 item 2). The hub's "Shared with me"
   * listing shows tables ANOTHER organization gave the person signed in, and
   * every one of its rows opened here and hit "This table is not here. This
   * table is not in the organization you are working in" — because this route
   * mounted the store for whichever organization the person had picked, which
   * by definition is not the one that owns a shared-in table. The address now
   * says whose it is; `useSharedTable` asks the store's own door whether the
   * share is real before a single byte is read as that organization; and the
   * person's own organization selection is never touched.
   */
  const askedOrganizationId = searchParams.get("org");
  const shared = useSharedTable(dataSource, tableId, askedOrganizationId, organizationId);
  /** The organization this page reads as: the owner's when the share is real, else the person's own. */
  const readingOrganizationId =
    shared.state === "shared" ? shared.organizationId : organizationId;
  // ONE SWITCH: does THIS organization keep its data in the record store? Set
  // once, for everybody, on the unified data ramp screen. There is no second,
  // per-person switch any more (lane NAV-FIX, 19 September).
  const campaign = useUnifiedDataCampaign({
    // The switch is asked of the organization whose store this page reads.
    // `platform.unified_data_store_on` already admits somebody a table was
    // shared with (its own body checks `custom.portal_admits` beside
    // `iam.has_org_access`), so a shared table asks the OWNER's switch and gets
    // a real answer rather than "you are not in that organization".
    organizationId: readingOrganizationId,
    organizationState,
    storeSwitch: (organization) => UNIFIED_DATA_CAMPAIGN.check(organization),
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
    // Somebody else's organization's roster is not this person's to read, and
    // the package's own "no members" sentence is the honest answer on a shared
    // table. Their own organization answers normally.
    if (shared.state === "shared") return [];
    if (!organizationId) return [];
    const roster = await getOrganizationMembers(organizationId);
    return roster.map((member) => ({
      userId: member.userId,
      name: member.user?.displayName ?? null,
      email: member.user?.email ?? null,
      avatarUrl: member.user?.avatarUrl ?? null,
    }));
  }, [organizationId, shared.state]);

  /**
   * A NUMBER ON THE CANVAS CLICKS THROUGH — `@ai-matrx/records-ui`'s
   * `openRecords` port.
   *
   * 🚨 WHAT WAS ON THE SCREEN BEFORE THIS (lane TAILS-6, 2026-09-22; found by
   * the GUIDE lane on the live seat the day before). The Dashboards tab of every
   * table printed this to the owner of the business:
   *
   *     "…bind `openRecords` on <RecordsUiProvider>…"
   *
   * — a developer's instruction on a customer's screen. The package was right to
   * say the port was unbound (nothing fails silently); this route was wrong to
   * leave it unbound, because the package cannot know where THIS app puts its
   * grid and deliberately refuses to guess an address.
   *
   * 🚨 AND WHAT IT NOW DOES, WHICH IS THE WHOLE THING (lane DRILL, 2026-09-22).
   * Until hours ago the record store had no door that returned the rows behind
   * an aggregate filter, so this callback kept the chart's grouping and threw
   * its FILTER away: the click opened every record of the table, grouped the
   * right way, with a sentence underneath admitting it. `custom.read_records_matching`
   * takes that filter and evaluates it through the very same
   * `custom.record_filter_sql` the number was counted with, so the address now
   * carries the question too and the screen it opens holds exactly the records
   * the number counted.
   */
  const onOpenRecordsFromANumber = useCallback(
    (ask: OpenRecordsAsk) => {
      const BUCKETS = /_(day|week|month|quarter|year)$/;
      const groupable = Object.keys(ask.filter ?? {}).filter((key) => !BUCKETS.test(key));
      const next = new URLSearchParams();
      next.set("view", groupable.length > 0 ? "kanban" : "grid");
      const field = groupable[groupable.length - 1];
      if (field) next.set("group", field);
      if (ask.label) next.set("from", ask.label);
      // THE QUESTION ITSELF, not a summary of it. What goes in the address is
      // the same object the chart handed `recordAggregate`, so the page can ask
      // the store the identical question rather than reconstruct one.
      if (ask.filter && Object.keys(ask.filter).length > 0) {
        next.set("filter", JSON.stringify(ask.filter));
      }
      router.push(`/data-v2/${ask.tableId}?${next.toString()}`);
    },
    [router],
  );

  const { launchMandate } = useAgentLauncher();
  /**
   * ASK AN AGENT FOR A WHOLE FORM, BOOKING PAGE, PORTAL OR DIGEST —
   * `@ai-matrx/records-ui`'s `onAskForOne` port (0.52.0).
   *
   * Every builder's empty state offers two ways in: build it here, or say what
   * you want. The second is a PORT because only the server can honestly speak
   * as an agent, and until this line existed the package drew no button at all
   * and said so — which was right, and was also half a product.
   *
   * 🚨 IT LAUNCHES A MANDATE, NEVER AN AGENT ID. `data.page_guidance` is the
   * job this surface already declares ("Data Page Guide"); which agent answers
   * it is a binding in the database, so Arman rebinding it to something that
   * can actually call the `records` tool improves this button with no deploy
   * here. A hardcoded agent UUID in this file is the thing the mandate system
   * exists to prevent.
   *
   * 🚨 THE SENTENCE IS CONTEXT, NOT `user_input`. Nothing structured rides
   * `user_input` — it carries only what a human typed, and this sentence is one
   * the package composed. The table, the thing being asked for and the
   * suggested wording go in as named context entries, which is also what lets
   * the agent see WHICH table without the person retyping its name.
   */
  const onAskForOne = useCallback(
    (ask: AgentBuildAsk) => {
      void launchMandate(MANDATE_KEYS.data__page_guidance, {
        surfaceKey: `data-v2:${ask.tableId}`,
        // The declared source feature for the unified data tables surface.
        sourceFeature: "udt",
        /**
         * 🚨 A LAUNCH WITH NO DISPLAY MODE OPENS NOTHING. Measured headless on
         * 2026-09-21 (lane AGENT-BUILDS): pressing "Ask an agent" on Ironline
         * Fitness's `classes` table dispatched this launch and the screen did
         * not change — no window, no composer, no dialog, nothing in
         * `[role=dialog]` three, nine and nineteen seconds later. The execution
         * was created in Redux and had no surface, so the person could never
         * say the sentence the agent exists to answer, and the button was a
         * dead control wearing a live label.
         *
         * `displayMode: "floating-chat"` is what every other mandate launcher
         * that expects a conversation passes (the dictionary assistant is the
         * worked example). `autoRun: false` because the person has not said
         * anything yet — the suggestion is a prompt to THEM, not an
         * instruction to the agent; `allowChat: true` because their sentence,
         * and the agent's one clarifying question, are the whole interaction.
         */
        config: {
          displayMode: "floating-chat",
          autoRun: false,
          allowChat: true,
        },
        runtime: {
          context: {
            records_table_id: ask.tableId,
            records_wanted: ask.kind,
            records_suggested_wording: ask.suggestion,
          },
        },
      });
    },
    [launchMandate],
  );

  return (
    <>
      <PageHeader>
        <HeaderStructured title="Data" />
      </PageHeader>
      <div className="h-full overflow-y-auto pt-[var(--shell-header-h)] p-4">
        {organizationState !== "ready" ? (
          <OrganizationContextNotice state={organizationState} what="Data records" />
        ) : shared.state === "checking" ? (
          /* The address says this table belongs to another organization. Until
             the store has said whether that share is real, nothing is mounted —
             mounting the person's own organization meanwhile is exactly the
             "This table is not here" flash this whole change removes. */
          <p className="text-sm text-muted-foreground">
            Checking whether this table was shared with you&hellip;
          </p>
        ) : shared.state === "not-shared" ? (
          <div className="flex flex-col items-start gap-2 rounded-md border border-dashed p-6">
            <p className="text-sm font-medium">This table was not shared with you</p>
            <p className="max-w-prose text-xs text-muted-foreground">{shared.why}</p>
            <Button size="sm" variant="outline" onClick={() => router.push("/data-v2")}>
              Back to your tables
            </Button>
          </div>
        ) : campaign.state !== "on" ? (
          /* THE ONE NOTICE — resolving, could-not-check and off are three
             different things (lane SHARE-OUT, item 3). */
          <UnifiedDataSwitchNotice gate={campaign} what="Data records" />
        ) : (
          <RecordsMount
            letTheStoreDecideRights
            config={{
              dataSource,
              actor: personActor(userId),
              organizationId: readingOrganizationId!,
              // LIVE UPDATES. The grid's "Not live: this host bound no realtime port" banner
              // was naming exactly this seam. The port joins the private topic the database
              // broadcasts a NOTICE on and re-reads through the read door; `undefined` when
              // the store's switch is off, and the honest banner comes back.
              realtime: createRecordsRealtimePort(readingOrganizationId!),
            }}
            host={{
              Link,
              density: "condensed",
              members,
              onAskForOne,
              openRecords: onOpenRecordsFromANumber,
              share: recordStoreShare,
              // AGT-N-9 / PRODUCTS row 11. The package builds the record SCOPE and
              // hands it here; this returns the platform's ONE chat column bound to
              // that record. Never a second chat (the canvas ruling).
              chat: (ctx) => <RecordScopedChat ctx={ctx} organizationId={readingOrganizationId} />,
            }}
          >
            {/* WHOSE TABLE THIS IS, SAID OUT LOUD AND ONCE. A person reading
                somebody else's table must never be left to work out why their
                own organization's things are not around it. One row, the
                organization's name, and what they hold. */}
            {shared.state === "shared" ? (
              <p className="mb-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Shared with you by <span className="text-foreground">{shared.organizationName}</span>{" "}
                &middot; {shared.levelLabel}. It stays in their organization; yours is unchanged.
              </p>
            ) : null}
            {/* A table this organization cannot see says so and offers the way
                back — never the blank frame the 19 September verdict found. */}
            {/* `activeDashboardId` is a DECLARED prop of TablePage from
                records-ui 0.38.0 onwards. It used to ride through a spread
                because 0.16.1 did not declare it and the excess-property check
                does not judge a spread — which meant the compiler could not
                tell us if the prop was ever renamed. It is passed by name now,
                so a rename is a build failure instead of a dashboard that
                silently stops opening. */}
            <TablePage
              tableId={tableId}
              onLeave={() => router.push("/data-v2")}
              activeDashboardId={activeDashboardId}
              activeRecordId={activeRecordId}
              activeView={activeView}
              activeGroupField={activeGroupField}
              cameFrom={cameFrom}
              filter={filter}
              onViewChanged={onViewChanged}
            />
          </RecordsMount>
        )}
      </div>
    </>
  );
}
