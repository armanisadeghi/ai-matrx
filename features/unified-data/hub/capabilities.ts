// features/unified-data/hub/capabilities.ts — LANE DATA-HUB
//
// THE DECLARATION. Every capability the record store has is ONE row in this
// file, and `HubListing` draws all of them with the same component.
//
// Why a declaration and not ten components: on 20 September /data-v2 listed an
// organization's TABLES and nothing else, while forms, bookings, portals,
// dashboards, digests, checklists, automations, sharing and the archive lived
// only as rails INSIDE one table's page. A person with forty tables had no way
// to answer "what forms do we have?" short of opening forty tables. Ten bespoke
// screens would have answered it and then drifted — ten empty states, ten ideas
// of what a row looks like, ten places to forget the lane filter. One
// declaration plus one listing component cannot drift, and the eleventh
// capability is a row here rather than a screen.
//
// 🚨 EVERY `read` GOES THROUGH THE ONE STORE DOOR FOR ITS CAPABILITY, AND THAT
// DOOR ANSWERS THE WHOLE ORGANIZATION. Not one call per table — a screen that
// asked per table would be N round trips, N chances to disagree with itself,
// and a list assembled in a browser rather than decided by the store. Where no
// such door existed (automations, sharing outside, who-changed-it) this lane
// built it in `custom.*` and it is granted to `authenticated` like every other:
// `migrations/campaign/hub_the_organization_has_one_front_door.sql`.

import type { RecordsClient } from "@ai-matrx/records/core";
import type { RecordsDataSource, Table } from "@ai-matrx/records";
import { VISIBILITY_LANE_TITLE, visibilityLaneFor, type VisibilityLane } from "@ai-matrx/records-ui";

import * as doors from "./doors";
import type { ChangedByKind, DoorFailure } from "./doors";
import { openPath } from "@/lib/deep-link/openPath";

/** One thing a person can open, whatever capability it came from. */
export interface HubItem {
  id: string;
  title: string;
  /** The table it belongs to. `null` for the things that belong to none. */
  tableId: string | null;
  tableName: string | null;
  /**
   * Which lane of THIS organization the thing sits in, or `null` when it sits in
   * none — a table another organization shared with you is theirs, not a lane of
   * yours. A `null` row shows under Everything and under no lane filter.
   */
  lane: VisibilityLane | null;
  /** The short facts that go on the row — "4 stages", "12 answers". Never a count nobody read. */
  facts: string[];
  /** Where it opens. THE DOOR LAW: every named thing opens. */
  href: string;
  /** A second, PUBLIC address when the thing has one — the link a stranger follows. */
  publicHref?: string | undefined;
  publicLabel?: string | undefined;
  /** The store's own sentence when something is wrong with this row. Never hidden. */
  trouble?: string | undefined;
  changedAt?: string | null;
  changedBy?: string | null;
}

export interface HubReadContext {
  client: RecordsClient;
  dataSource: RecordsDataSource;
  organizationId: string;
  /** This organization's Tables, read once through `tableList()` and shared by every capability. */
  tables: readonly Table[];
  tableKernelId: string | null;
}

export type HubRead =
  | { ok: true; items: HubItem[] }
  | { ok: false; error: DoorFailure };

export interface HubCapability {
  id: string;
  /** What it is called on screen. The product's word, never a table name. */
  title: string;
  /** One sentence saying what these are. A heading that does not teach is chrome. */
  what: string;
  /** What a person DOES when there are none. An empty list that says nothing reads as broken. */
  empty: string;
  /**
   * The sentence instead, when this organization shows a member only what is
   * shared with them (`custom/member_default_visibility = shared_only`). "No
   * tables yet. Make one below" is false there: the tables exist, and none has
   * been shared with this person (VERIFIER-16, the member in admin's Workspace).
   */
  emptyWhenSharedOnly?: string | undefined;
  /** The store door this listing reads, named on screen so nobody has to guess. */
  door: string;
  /** Which kind `custom.hub_changed_by` answers for these, or null when the store cannot say. */
  changedByKind: ChangedByKind | null;
  /**
   * These items are the store's own — one per (table, column) that needs one,
   * so a field named "Crew" on thirteen tables makes thirteen rows all titled
   * "Crew choices". Naming the same thing thirteen times teaches nothing; the
   * listing collapses same-titled rows into one, with the count on it.
   */
  groupDuplicateTitles?: boolean | undefined;
  read: (ctx: HubReadContext) => Promise<HubRead>;
}

// ── the small shared helpers ────────────────────────────────────────────────

function byId(tables: readonly Table[]): Map<string, Table> {
  return new Map(tables.map((t) => [t.id, t]));
}

/**
 * THE LANE OF A TABLE IS ITS VISIBILITY — my organization, community or world
 * (Mine is ownership, and is decided on the hub from the Table's own
 * `created_by`; see `OrganizationHub`'s `inLane`) — decided ONCE, by
 * `@ai-matrx/records-ui`'s `visibilityLaneFor`
 * (records-ui 0.83.0, VERIFIER-15). A kernel table, the app's bookkeeping and a
 * store-kept choice list answer `null`: nobody chose a visibility for them, so
 * they show under Everything and under no lane. The store's own marker for the
 * last of those is the record's own `kept_by_the_app`, read by that function.
 */
function laneOfTable(table: Table): VisibilityLane | null {
  return visibilityLaneFor(table);
}

/** Another organization's table: in none of this organization's lanes. */
const OUTSIDE_LANE: VisibilityLane | null = null;

/** The lane of a thing is the lane of the table it belongs to (the ONE `laneFor`). */
function laneOf(
  index: Map<string, Table>,
  tableId: string | null | undefined,
): VisibilityLane | null {
  const table = tableId ? index.get(tableId) : undefined;
  return table ? laneOfTable(table) : null;
}

function nameOf(
  index: Map<string, Table>,
  tableId: string | null | undefined,
  fallback?: string | null,
): string | null {
  const table = tableId ? index.get(tableId) : undefined;
  return table?.name ?? fallback ?? null;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The store's refusal, carried as-is. A client that rewrote it would be inventing. */
function failed(error: { message?: string; hint?: string } | undefined, door: string): HubRead {
  return {
    ok: false,
    error: {
      message: error?.message ?? `custom.${door} did not answer, and nothing was read.`,
      hint: error?.hint,
    },
  };
}

/**
 * WHAT AN EMPTY LANE SAYS. Each line is only what is true of that lane, and it
 * names no control this app does not have — no screen here changes a table's
 * visibility, so none of them tells a person to (VERIFIER-16 M6: every lane
 * used to say "Nothing has been made here yet. Make a table below").
 */
export const LANE_EMPTY_SENTENCE: Record<VisibilityLane, string> = {
  mine: "Nothing here was made by you yet. A table you make is yours, and shared with this organization from the start.",
  organization: "Nothing here is shared across this organization yet.",
  community:
    "Nothing here is open to every signed-in account. Tables cannot be shared that way yet; a link anyone can open is under World.",
  world: "Nothing here is open to anyone with its link.",
};

/** The empty sentence for one capability under one lane. */
export function emptyInLane(capabilityTitle: string, lane: VisibilityLane): string {
  return `No ${capabilityTitle.toLowerCase()} in ${VISIBILITY_LANE_TITLE[lane]}. ${LANE_EMPTY_SENTENCE[lane]}`;
}

/** The Tables sentence for a member who sees only what is shared with them. */
export const SHARED_ONLY_EMPTY =
  "In this organization you see only the tables someone has shared with you, and none has been " +
  "shared with you yet. Ask whoever keeps the table you need to share it with you — or make your own below.";

// ── the declarations ────────────────────────────────────────────────────────

export const HUB_CAPABILITIES: readonly HubCapability[] = [
  {
    id: "tables",
    title: "Tables",
    what: "Everything this organization keeps records in.",
    empty: "No tables yet. Make one below, or drop a spreadsheet on it and the store reads the columns.",
    emptyWhenSharedOnly: SHARED_ONLY_EMPTY,
    door: "custom.read_records over the Table kernel",
    changedByKind: "structure",
    async read(ctx) {
      return {
        ok: true,
        // THE PERSON'S TABLES, AND ONLY THOSE. What the store keeps for itself
        // is listed below under "Kept by the app" — same doors, same rows, one
        // listing further down, so nothing is hidden and nothing is buried.
        // A person's tables are exactly the ones in one of the four visibility
        // lanes, so Tables is the sum of the lanes and nothing else (VERIFIER-16
        // M6: "Saved views" was in Tables and in no lane, so Everything counted
        // one more than the lanes added up to).
        items: ctx.tables.filter((table) => laneOfTable(table) !== null).map((table) => ({
          id: table.id,
          title: table.name ?? "(unnamed table)",
          tableId: table.id,
          tableName: table.name ?? null,
          lane: laneOfTable(table),
          // A SCREEN NEVER PRINTS THE MACHINE'S WORD. `table.type` is the
            // store's own token ("entity", "options", …) and it read as jargon on
            // every row of Rincon's list; the column count is the fact a person
            // actually uses, and the type is on the table's own screen.
          facts: [plural(table.fields?.length ?? 0, "column")],
          href: `/data-v2/${table.id}`,
        })),
      };
    },
  },

  {
    id: "forms",
    title: "Forms",
    what: "Questions a stranger answers with no account — the answer lands as a record.",
    empty: "No forms yet. Open a table, press Forms, write the questions and publish it.",
    door: "custom.forms",
    changedByKind: "form",
    async read(ctx) {
      const answered = await ctx.client.forms();
      if (!answered.ok) return failed(answered.error, "forms");
      const index = byId(ctx.tables);
      return {
        ok: true,
        items: answered.data.map((form) => ({
          id: form.form_id,
          title: form.title || "(untitled form)",
          tableId: form.table_id,
          tableName: nameOf(index, form.table_id),
          lane: laneOf(index, form.table_id),
          facts: [
            form.state,
            plural(Number(form.responses ?? 0), "answer"),
            Number(form.held ?? 0) > 0 ? `${Number(form.held)} held` : "",
          ].filter(Boolean) as string[],
          // THE FORM'S OWN BUILDER, on the table it writes to — not that table's
          // grid (VERIFIER-14 item 2; records-ui 0.82.0's `?rail=` + `?item=`).
          href: `/data-v2/${form.table_id}?rail=forms&item=${form.form_id}`,
          publicHref: form.published_at ? `/f/${form.form_id}` : undefined,
          publicLabel: form.published_at ? "The link a stranger follows" : undefined,
        })),
      };
    },
  },

  {
    id: "bookings",
    title: "Bookings",
    what: "A page that offers only the times you are free, and writes the appointment into a table.",
    empty: "No booking pages yet. Open a table, press Bookings, and say how long a slot is.",
    door: "custom.bookings",
    changedByKind: "form",
    async read(ctx) {
      const answered = await ctx.client.bookings();
      if (!answered.ok) return failed(answered.error, "bookings");
      const index = byId(ctx.tables);
      return {
        ok: true,
        items: answered.data.map((booking) => ({
          id: booking.form_id,
          title: booking.title || "(untitled booking page)",
          tableId: booking.table_id,
          tableName: nameOf(index, booking.table_id),
          lane: laneOf(index, booking.table_id),
          facts: [
            booking.state,
            `${booking.slot_minutes} minutes`,
            plural(Number(booking.booked ?? 0), "booking"),
            Number(booking.upcoming ?? 0) > 0 ? `${Number(booking.upcoming)} still to come` : "",
          ].filter(Boolean) as string[],
          // THE BOOKING PAGE ITSELF, marked in the table's Bookings rail
          // (VERIFIER-16 M4) — never the bare grid.
          href: `/data-v2/${booking.table_id}?rail=bookings&item=${booking.form_id}`,
          publicHref: booking.published_at ? `/b/${booking.form_id}` : undefined,
          publicLabel: booking.published_at ? "The page somebody books on" : undefined,
        })),
      };
    },
  },

  {
    id: "portals",
    title: "Portals",
    what: "A door for people outside this organization — each one sees only their own rows.",
    empty: "No portals yet. A portal names the table whose records ARE your clients, and invites them.",
    door: "custom.list_portals",
    changedByKind: "portal",
    async read(ctx) {
      const answered = await ctx.client.listPortals({ archived: "active" });
      if (!answered.ok) return failed(answered.error, "list_portals");
      // WHICH TABLES EACH PORTAL SHOWS, in one call for the organization. The
      // row opens on a table the portal SHOWS: the clients table is only who
      // signs in, and its own Portals rail truthfully says the portal is not
      // part of it (VERIFIER-15 H5).
      const shown = await ctx.client.portalTables();
      const firstShown = new Map<string, string>();
      if (shown.ok) {
        for (const ref of [...shown.data].sort((a, b) => a.name.localeCompare(b.name))) {
          if (!firstShown.has(ref.portal_id)) firstShown.set(ref.portal_id, ref.table_id);
        }
      }
      const index = byId(ctx.tables);
      return {
        ok: true,
        items: answered.data.map((portal) => ({
          id: portal.portal_id,
          title: portal.title || "(untitled portal)",
          tableId: portal.client_table_id,
          tableName: nameOf(index, portal.client_table_id, portal.client_table),
          lane: laneOf(index, portal.client_table_id),
          facts: [
            portal.is_active ? "open" : "closed",
            plural(portal.tables ?? 0, "table"),
            `${portal.invited ?? 0} invited, ${portal.signed_in ?? 0} signed in`,
          ],
          // THE PORTAL'S OWN CARD, opened, on a table the portal SHOWS — the rail
          // lists a portal only on the tables it exposes. A portal that shows no
          // table yet opens its clients table and says so, never a dead card.
          href: `/data-v2/${firstShown.get(portal.portal_id) ?? portal.client_table_id}?rail=portals&item=${portal.portal_id}`,
          trouble: firstShown.has(portal.portal_id)
            ? undefined
            : shown.ok
              ? "This portal shows no table yet, so there is nothing for a client to see. Open its clients table, press Portals, and add the table they should see."
              : `The list of tables this portal shows did not answer, so the row opens its clients table instead. ${shown.error.message}`,
          publicHref: `/portal/${ctx.organizationId}`,
          publicLabel: "Where an outsider signs in",
        })),
      };
    },
  },

  {
    id: "dashboards",
    title: "Dashboards",
    what: "Charts over your own records — every number is counted under the reader's own eyes.",
    empty: "No dashboards yet. Open a table, press Dashboards, and add a block.",
    door: "custom.dashboards",
    changedByKind: "structure",
    async read(ctx) {
      const answered = await ctx.client.dashboards();
      if (!answered.ok) return failed(answered.error, "dashboards");
      const index = byId(ctx.tables);
      return {
        ok: true,
        items: answered.data.map((dash) => ({
          id: dash.dashboard_id,
          title: dash.name || "(untitled dashboard)",
          tableId: dash.table_id ?? null,
          tableName: nameOf(index, dash.table_id ?? null),
          lane: laneOf(index, dash.table_id ?? null),
          facts: [plural(dash.block_count ?? 0, "block")],
          href: dash.table_id
            ? `/data-v2/${dash.table_id}?dashboard=${dash.dashboard_id}`
            : "/data-v2",
          trouble: dash.table_id
            ? undefined
            : "This dashboard names no table, so there is nothing for it to count. Open it from the table it was meant for, or make it again.",
        })),
      };
    },
  },

  {
    id: "digests",
    title: "Digests and notifications",
    what: "A rule over a saved view, in English: what gets sent, to whom, how often.",
    empty: "No subscriptions yet. Save a view on a table, then say when it should tell you.",
    door: "custom.subscriptions",
    changedByKind: "structure",
    async read(ctx) {
      const answered = await ctx.client.subscriptions();
      if (!answered.ok) return failed(answered.error, "subscriptions");
      const index = byId(ctx.tables);
      return {
        ok: true,
        items: answered.data.map((sub) => ({
          id: sub.rule_id,
          title: sub.name || "(unnamed subscription)",
          tableId: sub.table_id ?? null,
          tableName: nameOf(index, sub.table_id ?? null),
          lane: laneOf(index, sub.table_id ?? null),
          facts: [
            sub.muted ? "muted" : "on",
            sub.cadence ?? "",
            sub.channel ?? "",
            sub.mine ? "yours" : "someone else's",
          ].filter(Boolean) as string[],
          // THE RULE ITSELF, through the one address (lane ROUTE-RESOLVER): `/o/<rule>`
          // asks `platform.resolve_id`, which opens the table's notifications rail on this
          // rule inside the organization the rule LIVES in. A rule that is somebody else's
          // is said so by the rail, never swapped.
          href: sub.table_id
            ? openPath(sub.rule_id, {
                fallback: `/data-v2/${sub.table_id}?rail=notifications&item=${sub.rule_id}`,
              })
            : "/data-v2",
          trouble: sub.table_id
            ? undefined
            : "This subscription names no table any more, so nothing can send it. Open the table it watched and write it again.",
        })),
      };
    },
  },

  {
    id: "checklists",
    title: "Checklists and runs",
    what: "A process written down once — the steps, whose each one is, and what it waits for.",
    empty: "No checklists yet. Write the steps once and every run follows them.",
    door: "custom.checklist_templates",
    changedByKind: "structure",
    async read(ctx) {
      const answered = await ctx.client.checklistTemplates({});
      if (!answered.ok) return failed(answered.error, "checklist_templates");
      const index = byId(ctx.tables);
      return {
        ok: true,
        items: answered.data.map((template) => ({
          id: template.template_id,
          title: template.name || "(unnamed checklist)",
          tableId: template.about_table_id ?? null,
          tableName: nameOf(index, template.about_table_id ?? null, template.about_table),
          lane: laneOf(index, template.about_table_id ?? null),
          facts: [
            plural(template.steps ?? 0, "step"),
            `${template.open_runs ?? 0} open of ${template.total_runs ?? 0} runs`,
          ],
          href: template.about_table_id ? `/data-v2/${template.about_table_id}` : "/data-v2",
          trouble: template.about_table_id
            ? undefined
            : "This checklist is not about a table, so a run has nothing to attach to. Point it at one before starting it.",
        })),
      };
    },
  },

  {
    id: "automations",
    title: "Automations",
    what: "The boards: stages records move through, and the rules the store checks on every move.",
    empty:
      "No boards yet. Give a table a column of choices and call it the stage — the board and its rules follow.",
    door: "custom.pipelines",
    changedByKind: "structure",
    async read(ctx) {
      const answered = await doors.pipelines(ctx.dataSource, ctx.organizationId);
      if (!answered.ok) return { ok: false, error: answered.error };
      const index = byId(ctx.tables);
      return {
        ok: true,
        items: answered.data.map((board) => ({
          id: board.table_id,
          title: board.table_name,
          tableId: board.table_id,
          tableName: board.table_name,
          lane: laneOf(index, board.table_id),
          facts: board.broken
            ? []
            : [
                `${board.stage_label ?? "Stage"}: ${plural(board.stages, "stage")}`,
                plural(board.rules, "rule"),
              ],
          href: `/data-v2/${board.table_id}?view=kanban`,
          trouble: board.broken ?? undefined,
          changedAt: board.updated_at,
        })),
      };
    },
  },

  {
    id: "shared-outside",
    title: "Shared outside this organization",
    what: "Everyone outside who has been given one of these tables, and what they hold.",
    empty:
      "Nothing is shared outside this organization. Open a table, press Share, and invite somebody by email.",
    door: "custom.shares_outside",
    changedByKind: null,
    async read(ctx) {
      const answered = await doors.sharesOutside(ctx.dataSource, ctx.organizationId);
      if (!answered.ok) return { ok: false, error: answered.error };
      const index = byId(ctx.tables);
      return {
        ok: true,
        items: answered.data.map((share) => ({
          id: share.invitation_id,
          title: share.email,
          tableId: share.table_id,
          tableName: nameOf(index, share.table_id, share.table_name),
          lane: laneOf(index, share.table_id),
          facts: [share.level_label, share.joined ? "joined" : share.expired ? "run out" : "invited"],
          // THE SHARE DIALOG over that table — where the invitation is resent,
          // changed or taken back — not the table's grid.
          href: `/data-v2/${share.table_id}?rail=share`,
          trouble: share.expired ? share.say : undefined,
          changedAt: share.invited_at,
        })),
      };
    },
  },

  {
    id: "shared-with-me",
    title: "Shared with me",
    what: "Tables another organization has shared with the person signed in — theirs, not this organization's.",
    empty: "Nobody outside has shared a table with you.",
    door: "custom.tables_shared_with_me + custom.table_share_outside_for_me",
    changedByKind: null,
    async read(ctx) {
      // TWO DOORS, BECAUSE A SHARE HAS TWO STATES, and a row must stay on this
      // list through both (VERIFIER-15 H6). Accepted: a live grant, and the row
      // opens the table in its owner's organization. Offered: a pending
      // invitation, and the row opens the invitation's own screen, where
      // accepting writes the grant.
      const [accepted, offered] = await Promise.all([
        doors.tablesSharedWithMe(ctx.dataSource),
        doors.sharedWithMe(ctx.dataSource),
      ]);
      if (!accepted.ok) return { ok: false, error: accepted.error };
      if (!offered.ok) return { ok: false, error: offered.error };
      const items: HubItem[] = [];
      const open = new Set<string>();
      for (const share of accepted.data) {
        open.add(share.table_id);
        items.push({
          id: `accepted:${share.table_id}`,
          title: share.table_name || "(unnamed table)",
          tableId: share.table_id,
          // The row prints "in <their organization>" once. The organization is
          // never repeated as a second fact (VERIFIER-15 LOW).
          tableName: share.organization,
          // Another organization's table sits in none of THIS organization's
          // lanes; it shows under Everything.
          lane: OUTSIDE_LANE,
          facts: [share.level_label],
          // `?org=` is the platform's own way for a link to name its
          // organization. The link judge knows a share admits
          // (`linkOrganizationAdmission.ts`), and the table route opens it as
          // that organization's guest and says whose table it is.
          href: `/data-v2/${share.table_id}?org=${share.organization_id}`,
          trouble: share.opens ? undefined : share.say,
          changedAt: share.shared_at,
        });
      }
      // ONE ROW PER OFFERED TABLE. The same table offered twice is one thing
      // to accept, not two identical rows; the newest invitation wins.
      const offeredOnce = new Set<string>();
      for (const share of offered.data) {
        if (open.has(share.table_id) || offeredOnce.has(share.table_id)) continue;
        offeredOnce.add(share.table_id);
        items.push({
          id: share.invitation_id,
          title: share.table_name || "(unnamed table)",
          tableId: share.table_id,
          tableName: share.organization,
          lane: OUTSIDE_LANE,
          facts: [share.level_label, "not accepted yet"],
          // 🚨 THE ROW OPENS THE INVITATION, BECAUSE THAT IS WHAT THE ROW IS
          // until it is accepted: no grant exists yet, so no address could open
          // the table. `/invitations/table/accept/<token>` names the table, the
          // organization and what they will be able to do.
          href: `/invitations/table/accept/${share.token}`,
        });
      }
      return { ok: true, items };
    },
  },

  {
    id: "kept-by-the-app",
    title: "Kept by the app",
    what: "Tables the store made for itself — the choice lists behind your dropdowns, and its own saved views.",
    empty: "The store keeps nothing of its own here yet.",
    door: "custom.read_records over the Table kernel",
    changedByKind: "structure",
    groupDuplicateTitles: true,
    async read(ctx) {
      return {
        ok: true,
        items: ctx.tables.filter((table) => laneOfTable(table) === null).map((table) => ({
          id: table.id,
          title: table.name ?? "(unnamed table)",
          tableId: table.id,
          tableName: table.name ?? null,
          lane: null,
          facts: [plural(table.fields?.length ?? 0, "column")],
          href: `/data-v2/${table.id}`,
        })),
      };
    },
  },
] as const;

/**
 * WHO LAST TOUCHED EACH ROW, in one call per capability rather than one per row.
 *
 * Mutates the items it is given, because the alternative is a second copy of a
 * list the screen is already holding. A capability the store cannot answer for
 * (`changedByKind: null` — an invitation is not a record of ours) is left
 * alone, and the row simply does not claim an author.
 */
export async function attachChangedBy(
  ctx: HubReadContext,
  capability: HubCapability,
  items: HubItem[],
): Promise<void> {
  if (!capability.changedByKind || items.length === 0) return;
  const answered = await doors.changedBy(
    ctx.dataSource,
    ctx.organizationId,
    capability.changedByKind,
    items.map((item) => item.id),
  );
  if (!answered.ok) return;
  const found = new Map(answered.data.map((row) => [row.id, row]));
  for (const item of items) {
    const row = found.get(item.id);
    if (!row) continue;
    item.changedAt = row.at ?? item.changedAt ?? null;
    item.changedBy = row.who ?? null;
  }
}
