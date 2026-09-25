"use client";

// app/(core)/data-v2/[tableId]/page.tsx — THE MOUNT, AND NOTHING MORE.
//
// `TablePage` from `@ai-matrx/records-ui` is the whole screen: the view bar and
// the four layouts, the record peek with its own versioned history and comment
// thread, the settings panel, the action inbox, import and export. None of it
// is assembled here, because a table opened from a portal or from an agent's
// link must be the same screen.

import { use, useCallback, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { RecordsMount, TablePage, WhereItLives, personActor, recordsDataSource } from "@ai-matrx/records-ui";
import { useTable } from "@ai-matrx/records/react";
import type { AgentBuildAsk, OpenRecordsAsk, PageView } from "@ai-matrx/records-ui";
import type { RecordFilter } from "@ai-matrx/records";
import { Button } from "@ai-matrx/design-system";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";

import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { TableTransferOffer } from "@/features/sharing/components/TableTransferOffer";
import { recordStoreShare } from "@/features/sharing/components/RecordStoreShareSurface";
import {
  PendingTableInvitation,
  usePendingTableInvitation,
} from "@/features/sharing/outside/PendingTableInvitation";
import { RecordScopedChat } from "@/features/unified-data/record-chat/RecordScopedChat";
import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";
import type { HeaderAction } from "@/features/shell/components/header/variants/types";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { getOrganizationMembers } from "@/features/organizations/service";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { RecordOrganizationSwitchOffer } from "@/features/organizations/components/RecordOrganizationSwitchOffer";
import { createClient } from "@/utils/supabase/client";
import { useSharedTable } from "@/features/unified-data/hub/useSharedTable";
import { useObjectOrganization } from "@/features/unified-data/objectOrganization";
import { useDeclarePageObjectOrganization } from "@/features/shell/pageObjectOrganization";
import { useUserOrganizations } from "@/features/organizations/hooks";
import type { OrganizationState } from "@/features/organizations/useOrganizationRequired";
import { createRecordsRealtimePort } from "@/features/unified-data/realtime/recordsRealtimePort";
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";
import { useUnifiedDataCampaign } from "@/lib/knobs/useUnifiedDataCampaignGate";
import { UnifiedDataSwitchNotice } from "@/features/unified-data/components/UnifiedDataSwitchNotice";
import { SheetLayout } from "@/features/data-tables/components/SheetLayout";
import { runRowAgentAction, type RowAgentActionTarget } from "@/features/unified-data/row-agent-action/rowAgentAction";
import { toast } from "@/lib/toast";
import {
  ROW_CHANGE_AGENT_LABEL,
  useRowChangeAgentOffer,
} from "@/features/unified-data/row-change-agent/RowChangeAgentLink";
import { RECORDS_NOTIFY } from "@/features/unified-data/recordsNotify";
import { replaceAddressWithoutNavigating, currentPathWithSearch } from "@/lib/url-state/addressWithoutNavigating";
import { RECORDS_FILES } from "@/features/unified-data/recordsFiles";
import { usePageCapture } from "@/components/agent-copy/page-capture/usePageCapture";
import { tablePageCapture } from "@/components/agent-copy/page-capture/pageCapture";
import { PageCaptureButton } from "@/components/agent-copy/page-capture/PageCaptureButton";
import { useTableCaptureContribution } from "@/features/unified-data/page-capture/useTableCaptureContribution";
import { shownViewSelection, type ShownViewLike } from "@/features/unified-data/page-capture/shownViewCapture";

/**
 * THE PAGE'S TITLE IS THE TABLE'S OWN NAME (owner, 2026-09-24: a table he knows must look like
 * the thing he knows, not like "Data"). Read inside the mount, through the same `useTable` every
 * package screen reads, and set through the shell's one header primitive.
 */
function TableTitle({
  tableId,
  context,
  actions,
  filter,
  recordId,
}: {
  tableId: string;
  context?: ReactNode;
  actions?: HeaderAction[];
  filter?: RecordFilter | null;
  recordId?: string | null;
}) {
  const table = useTable(tableId);
  const name = table.data?.name?.trim();
  // The alchemy capture's record-store half: the table's name and declaration, and its records
  // and open record read at copy time through the grid's own door (lane ALCHEMY-BUTTON).
  useTableCaptureContribution({
    tableId,
    table: table.data,
    tableError: table.error ? String((table.error as { message?: string }).message ?? table.error) : null,
    filter,
    recordId,
  });
  return (
    <PageHeader>
      {/* ONE ROW (lane DATA-V2-FACE-2): the table's whole name, and beside it, quiet, the
          organization it lives in — Linear's team beside the issue title. On a phone the
          organization sits under the name so the name keeps the width. */}
      <HeaderStructured
        title={name && name !== "" ? name : "Data"}
        context={
          <span className="inline-flex min-w-0 items-center gap-1.5">
            {context}
            <PageCaptureButton size="xs" />
          </span>
        }
        {...(actions && actions.length > 0 ? { actions } : {})}
      />
    </PageHeader>
  );
}

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
  /**
   * WHICH RAIL, AND WHICH THING IN IT — `?rail=forms&item=<form>`, and the same
   * for notifications, portals and share (records-ui 0.82.0).
   *
   * 🚨 THE FOURTH DEAD LINK OF THE SAME SHAPE (VERIFIER-14 item 2, 2026-09-23).
   * The organization hub's Forms, Digests, Portals and Shared-outside rows all
   * opened this page on the GRID, because nothing below the layout could be
   * addressed. Passed RAW, like `?view=`: a word the page has no rail for is
   * said on the screen by `TablePage`, never parsed away here.
   */
  const activeRail = searchParams.get("rail");
  const activeItemId = searchParams.get("item");
  /** Which field the board's columns are, when a dashboard number sent them here. */
  const activeGroupField = searchParams.get("group");
  /**
   * THE VIEW AS DRAWN (V24-TAILS): TablePage reports the saved view with the person's look laid
   * over it, so the capture names "grouped by Trade (your own look)" and never "not chosen".
   */
  const [shownView, setShownView] = useState<ShownViewLike | null>(null);
  // Passed as a named object: `onShownViewChange` is records-ui Unreleased (aidream e7d629b1bb);
  // a build without it ignores the key and the capture says the grouping is not known yet.
  // TODO(V24-TAILS): pass it by name once the lockfile carries the published records-ui.
  const shownViewReport: { onShownViewChange?: (shown: ShownViewLike) => void } = {
    onShownViewChange: setShownView,
  };
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
  /**
   * AND THE ADDRESS FOLLOWS THEM. Half a deep link is a link that works when
   * you arrive and lies when you copy it out of the bar afterwards. `replace`
   * rather than `push`, because which view you are looking at is not a place
   * you want the Back button to walk you through one layout at a time. And a
   * history write, not `router.replace`: switching a layout is bookkeeping on
   * this page, never a server round trip (lane URL-STATE).
   */
  const onViewChanged = useCallback(
    (view: PageView | string) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("view", view);
      replaceAddressWithoutNavigating(currentPathWithSearch(next));
    },
    [searchParams],
  );
  const userId = useAppSelector(selectUserId);
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
  /**
   * WHOSE TABLE THIS IS, ASKED OF THE TABLE — ACCESS IS PERSONAL (owner, 2026-09-23).
   *
   * 🚨 THE DEFECT THIS CLOSES (VERIFIER-15 M8, VERIFIER-16 verdict 2). This page mounted the
   * store for the organization the person had PICKED, and every door decides the organization
   * wall first — so a member of Rincon Plumbing Co, working in another of her organizations,
   * opened a Rincon table and read "This table is not in the organization you are working in …
   * or it may have been deleted". The access was hers; the page handed the door the wrong
   * organization. "The permission is to the person, not the org. ALWAYS … For any RECORD I try
   * to see, the active org is meaningless."
   *
   * So the page asks `custom.where_id_opens(<table>)` — the organization the table lives
   * in, answered only when this person may open it — and reads as THAT. Switching
   * organization never re-decides whether this opens; the active organization is not read here
   * at all (`pnpm check:object-pages-read-the-objects-organization`). `?org=` is no longer
   * trusted or needed: the table names its own organization.
   */
  const object = useObjectOrganization(dataSource, tableId);
  /**
   * The NAME of the table's organization while `custom.table_home` has not answered (or is not
   * on this database): the person's own organization list matched by the id the TABLE named,
   * else — for a table shared with her from outside — the owner organization the share door
   * names. Never the active organization.
   */
  const { organizations: myOrganizations, loading: myOrganizationsLoading } = useUserOrganizations();
  /**
   * A TABLE ANOTHER ORGANIZATION GAVE THIS PERSON. The store already admitted her (the door
   * above answered); `useSharedTable` asks `custom.tables_shared_with_me`, which lists only
   * organizations she is NOT a member of — so "shared" here means "an outsider, let in by a
   * share", and it adds whose it is and at what level for the one line that says so. Only
   * while the door is absent from a database (the stand-in) does `?org=` still carry a share,
   * exactly as it did before this lane.
   */
  const shareHint =
    object.state === "found"
      ? object.organizationId
      : object.state === "stand-in"
        ? askedOrganizationId
        : null;
  const shared = useSharedTable(
    dataSource,
    tableId,
    shareHint,
    object.state === "stand-in" ? object.activeOrganizationId : null,
  );
  /** A table shared with her from outside and not yet opened says so, rather than "not given". */
  const pendingInvitation = usePendingTableInvitation(tableId, object.state === "not-given");
  const knownOrganizationName =
    object.state === "found"
      ? (myOrganizations.find((o) => o.id === object.organizationId)?.name ??
        (shared.state === "shared" ? shared.organizationName : null))
      : null;
  /**
   * THE SHELL HEADER BELIEVES THE TABLE (GATES-TAIL, VERIFIER-21 #7). The table named its own
   * organization and the title row shows it, so the header's red "Choose org" would be a lie:
   * nothing here waits for a choice. The declaration silences it for as long as this page is up.
   */
  useDeclarePageObjectOrganization(
    object.state === "found"
      ? { organizationId: object.organizationId, name: knownOrganizationName, shownByPage: true }
      : null,
  );
  /** The organization this page reads as: the TABLE'S. */
  const readingOrganizationId: string | null =
    object.state === "found"
      ? object.organizationId
      : object.state === "stand-in"
        ? shared.state === "shared"
          ? shared.organizationId
          : object.activeOrganizationId
        : null;
  const readingState: OrganizationState =
    object.state === "stand-in" ? object.organizationState : readingOrganizationId ? "ready" : "resolving";
  /**
   * She reads it as a member of its organization (her roster is hers to read) — known only
   * once the share door has said this is NOT a share of an outsider's.
   */
  const readsAsMember = shared.state === "none";
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
    organizationState: readingState,
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
    // A person given this table by a share (not a member of its organization) has no roster to
    // read: `get_organization_members_with_users` refuses her with 403 on every open (VERIFIER-21
    // #7, two console errors). Membership is read from HER organization list, not inferred from
    // the share door, which only lists organizations she is not in when the share is org-shaped.
    if (!readsAsMember || !readingOrganizationId) return [];
    // While her list loads, answer empty; the port's identity changes when it lands, so the
    // package asks again.
    if (myOrganizationsLoading || !myOrganizations.some((o) => o.id === readingOrganizationId)) return [];
    const roster = await getOrganizationMembers(readingOrganizationId);
    return roster.map((member) => ({
      userId: member.userId,
      name: member.user?.displayName ?? null,
      email: member.user?.email ?? null,
      avatarUrl: member.user?.avatarUrl ?? null,
    }));
  }, [readingOrganizationId, readsAsMember, myOrganizations, myOrganizationsLoading]);

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
        // THE TABLE'S ORGANIZATION (ACCESS-FIX-18): the page already knows it, so the agent's
        // run is filed there and nothing asks "Which workspace is this for?".
        organizationId: readingOrganizationId,
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
    [launchMandate, readingOrganizationId],
  );

  /**
   * A TABLE'S AGENT BUTTON — `@ai-matrx/records-ui`'s `runAgentAction` port (TABLE-PARITY M3,
   * lane GRID-TAILS). Unbound, the default grid draws no agent button at all; bound, a
   * `kind: "agent"` row action ("Draft reminder") on a row starts the SAME job the older grid
   * starts — `data.row_action`, the row as its offer, the author's prompt as the only user
   * input — read as the person, through the table's own organization.
   */
  const onRunAgentAction = useCallback(
    (target: RowAgentActionTarget) => {
      if (!readingOrganizationId) return;
      void runRowAgentAction({
        target,
        dataSource,
        actor: personActor(userId),
        organizationId: readingOrganizationId,
        actingPersonId: userId ?? null,
        launchMandate,
        onRefused: (title, why) => toast.error(title, { description: why }),
      });
    },
    [dataSource, launchMandate, readingOrganizationId, userId],
  );

  /** TABLE-PARITY N2, in the table's one menu: absent until the store says a row change reaches a schedule. */
  const rowChangeOffer = useRowChangeAgentOffer({
    tableId,
    tableName: null,
    organizationId: campaign.state === "on" && object.state === "found" ? object.organizationId : null,
    userId: userId ?? null,
  });
  /**
   * WHICH ORGANIZATION THIS TABLE LIVES IN, NAMED QUIETLY ON THE TABLE'S OWN ROW (owner,
   * 2026-09-23: "I am not seeing how I can see what org this data is in"; 2026-09-24: no rows of
   * chrome above the table). The one builder every object page and list row renders, and, for a
   * table another organization shared in, the level it was shared at — one fact, not a banner.
   */
  const whereItLives =
    object.state === "found" ? (
      <span className="inline-flex min-w-0 items-center gap-1.5" data-table-lives-in="">
        {/* records-ui's own chip (0.85.6), inside the page's RecordsMount (TableTitle is). */}
        <WhereItLives
          tableId={tableId}
          knownOrganizationName={knownOrganizationName}
          onMoved={() => object.retry()}
          variant="title"
        />
        {shared.state === "shared" ? (
          <span className="shrink-0 text-muted-foreground">Shared with you &middot; {shared.levelLabel}</span>
        ) : null}
      </span>
    ) : null;
  /**
   * THE TABLE MENU'S EXTRA ITEM: "When a row changes, run an agent" — absent unless the store
   * offers it; a refusal says why. The organization rides the page header beside the name, so the
   * table's own row takes no `leading` (lane DATA-V2-FACE-2).
   */
  const menuExtras =
      rowChangeOffer.state === "offered"
        ? [
            {
              key: "row-change-agent",
              label: ROW_CHANGE_AGENT_LABEL,
              onSelect: () => router.push((rowChangeOffer as { href: string }).href),
            },
          ]
        : rowChangeOffer.state === "refused"
          ? [
              {
                key: "row-change-agent",
                label: ROW_CHANGE_AGENT_LABEL,
                onSelect: () =>
                  toast.error("Running an agent when a row changes is not available", {
                    description: (rowChangeOffer as { why: string }).why,
                  }),
              },
            ]
          : [];

  // ── The alchemy capture: this table page, what the address chose (view, rail, record,
  //    dashboard, filter), whose table it is, and why it did not open when it did not. ──
  const pageSays: string | null =
    object.state === "resolving" || (object.state === "not-given" && pendingInvitation === undefined)
      ? "Opening the table…"
      : object.state === "not-given" && pendingInvitation
        ? "A pending invitation to this table is shown."
        : object.state === "not-given"
          ? "You have not been given this table."
          : object.state === "unavailable"
            ? `We could not find out where this table is. ${object.why}`
            : object.state === "stand-in" && shared.state === "not-shared"
              ? `This shared table cannot open right now. ${shared.why}`
              : campaign.state !== "on"
                ? `The record store is not on for this organization (${campaign.state}).`
                : null;
  usePageCapture(() =>
    tablePageCapture({
      title: "Data table",
      route: `/data-v2/${tableId}`,
      table: { id: tableId, name: null },
      view: activeView ?? "the table's default view (none named in the address)",
      selection: {
        Organization: { id: readingOrganizationId, name: knownOrganizationName },
        "Shared with you": shared.state === "shared" ? shared.levelLabel : null,
        Rail: activeRail,
        "Rail item": activeItemId,
        "Open record": activeRecordId,
        Dashboard: activeDashboardId,
        ...shownViewSelection(shownView, activeGroupField),
        "Came from": cameFrom,
        Filter: filter ? JSON.stringify(filter) : rawFilter ? `ignored (not a JSON object): ${rawFilter}` : null,
      },
      errors: [
        object.state === "not-given" && !pendingInvitation ? pageSays : null,
        object.state === "unavailable" || (object.state === "stand-in" && shared.state === "not-shared") ? pageSays : null,
      ],
      sections: [
        {
          id: "page-state",
          title: "Page state",
          role: "data",
          value: {
            table_opens: object.state,
            record_store_switch: campaign.state,
            says: pageSays ?? "The table is open.",
          },
        },
      ],
    }),
  );

  return (
    <>
      {/* "Data" only until the table is open; the open table's own name replaces it. */}
      <PageHeader fallback>
        <HeaderStructured title="Data" />
      </PageHeader>
      <div className="h-full overflow-y-auto pt-[var(--shell-header-h)] p-4">
        {object.state === "resolving" ? (
          <p className="text-sm text-muted-foreground">Opening the table&hellip;</p>
        ) : object.state === "not-given" && pendingInvitation === undefined ? (
          <p className="text-sm text-muted-foreground">Opening the table&hellip;</p>
        ) : object.state === "not-given" && pendingInvitation ? (
          <PendingTableInvitation invitation={pendingInvitation} />
        ) : object.state === "not-given" ? (
          /* THE CANONICAL NO ACCESS PAGE. A Table is a record of the store (token `record`,
             custom.record), so `access_denied_context` answers which of the four it really is —
             not shared with you, deleted, never there, or signed out — and offers the ask to
             whoever can grant it (the table's creator; the organization's admins for a shared
             one). Grants land on the same ladder `custom.where_id_opens` reads. */
          <AccessGate
            token="record"
            id={tableId}
            onRetry={object.retry}
            fallbackHref="/data-v2"
            fallbackLabel="Back to your tables"
            // SHARE-LANE-2: an organization owner or admin who is not named gets the one thing
            // the role allows — an audited transfer — and never a silent read.
            footer={<TableTransferOffer tableId={tableId} onTransferred={object.retry} />}
          />
        ) : object.state === "unavailable" ? (
          <div className="flex flex-col items-start gap-2 rounded-md border border-dashed p-6">
            <p className="text-sm font-medium">We could not find out where this table is</p>
            <p className="max-w-prose text-xs text-muted-foreground">
              The record store did not answer, so nothing was opened. This is not an answer about
              your access. {object.why}
            </p>
            <Button size="sm" variant="outline" onClick={object.retry}>
              Try again
            </Button>
          </div>
        ) : object.state === "stand-in" && object.organizationState !== "ready" ? (
          <OrganizationContextNotice state={object.organizationState} what="Data records" />
        ) : object.state === "stand-in" && shared.state === "checking" ? (
          /* The address says this table belongs to another organization. Until
             the store has said whether that share is real, nothing is mounted —
             mounting the person's own organization meanwhile is exactly the
             "This table is not here" flash this whole change removes. */
          <p className="text-sm text-muted-foreground">
            Opening the table&hellip;
          </p>
        ) : object.state === "stand-in" && shared.state === "not-shared" ? (
          <div className="flex flex-col items-start gap-2 rounded-md border border-dashed p-6">
            <p className="text-sm font-medium">This shared table cannot open right now</p>
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
              // The page's toasts: the where-it-lives chip's "now lives in …" outlives the
              // re-read that re-mounts the header (UI-FIX-19).
              notify: RECORDS_NOTIFY,
              // A VALUE KEPT AS A FILE (BIG-VALUES-TAILS): the cell's "Open the whole text"
              // opens /files/f/<id> and the export reads the whole text as the person.
              // records-ui 0.85.12+ reads these two ports; an older build ignores them.
              ...RECORDS_FILES,
              members,
              onAskForOne,
              openRecords: onOpenRecordsFromANumber,
              runAgentAction: onRunAgentAction,
              share: recordStoreShare,
              // AGT-N-9 / PRODUCTS row 11. The package builds the record SCOPE and
              // hands it here; this returns the platform's ONE chat column bound to
              // that record. Never a second chat (the canvas ruling).
              chat: (ctx) => <RecordScopedChat ctx={ctx} organizationId={readingOrganizationId} />,
              // THE SHEET. The classic /data grid, ported onto the one data seam, is the
              // fifth layout of this one table page (owner's ruling 2026-09-23: no switch
              // on /data, no new route). It reads and writes the record store only.
              layouts: [
                {
                  id: "sheet",
                  label: "Sheet",
                  render: (args) => (
                    <SheetLayout
                      tableId={args.tableId}
                      organizationId={readingOrganizationId!}
                      userId={userId ?? null}
                      // The page's own export, handed over by records-ui 0.85+ (absent before it).
                      openExport={(args as { openExport?: () => void }).openExport}
                    />
                  ),
                },
              ],
            }}
          >
            {/* WHOSE TABLE THIS IS, SAID OUT LOUD AND ONCE. A person reading
                somebody else's table must never be left to work out why their
                own organization's things are not around it. One row, the
                organization's name, and what they hold. */}
            <TableTitle
              tableId={tableId}
              context={whereItLives}
              filter={filter}
              recordId={activeRecordId}
            />
            {/* A new record lands in the TABLE'S organization. The table always
                opens; when it lives somewhere other than the selected
                organization (or none is selected), the one offer names the
                table's own organization and switches on one click. A table
                shared from outside gets no offer — nothing to switch to. */}
            {object.state === "found" ? (
              <RecordOrganizationSwitchOffer
                organizationId={object.organizationId}
                organizationName={knownOrganizationName}
                isMember={shared.state === "shared" ? false : undefined}
                what="table"
                className="mb-3"
              />
            ) : null}
            {/* SIDE BY SIDE IS A FACT, NOT A BANNER (owner, 2026-09-24): no notice that this table
                also lives in the older system, and no "shared with you" paragraph — the table's
                row names its organization and the level it was shared at. */}
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
              /* THE WAY BACK NAMES THE TABLE'S ORGANIZATION (ACCESS-FIX-18, VERIFIER-18 H4).
                 Archiving calls this; it used to land on the bare list, which reads the ACTIVE
                 organization and, with none picked, said "An organization is needed for data
                 records" about a table that had just named its own. */
              onLeave={() =>
                router.push(
                  readingOrganizationId
                    ? `/data-v2?org=${encodeURIComponent(readingOrganizationId)}`
                    : "/data-v2",
                )
              }
              activeDashboardId={activeDashboardId}
              activeRecordId={activeRecordId}
              activeView={activeView}
              activeGroupField={activeGroupField}
              {...shownViewReport}
              cameFrom={cameFrom}
              filter={filter}
              onViewChanged={onViewChanged}
              activeRail={activeRail}
              activeItemId={activeItemId}
              menuExtras={menuExtras}
            />
          </RecordsMount>
        )}
      </div>
    </>
  );
}
