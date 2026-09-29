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
import type { VisibilityLane } from "@ai-matrx/records-ui";

import * as doors from "./doors";
import type { ChangedByKind, DataHomeItemKind, DataHomeItemRow, DataHomeTableRow, DoorFailure, TableFactRow } from "./doors";
import type { ScopeFacts } from "./dataHomeScope";
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
  /**
   * THE ORGANIZATION IT LIVES IN, said on the row (lane DATA-HOME-1): the data home lists every
   * organization at once, so every row names its own.
   */
  organizationName?: string | null | undefined;
  /** And its id — who-changed-it is asked of the organization each row lives in (DATA-HOME-2). */
  organizationId?: string | null | undefined;
  /** The four facts the data home's filters read (`dataHomeScope.ts`). Set by the hub. */
  scope?: ScopeFacts | undefined;
  /** What it is, in the store's one word (`custom.data_home_tables().kind`, or the listing's own). */
  kind?: string | undefined;
}

export interface HubReadContext {
  client: RecordsClient;
  dataSource: RecordsDataSource;
  organizationId: string;
  /** This organization's Tables, read once through `tableList()` and shared by every capability. */
  tables: readonly Table[];
  tableKernelId: string | null;
  /**
   * EVERY TABLE THE PERSON CAN OPEN, IN EVERY ORGANIZATION (`custom.data_home_tables()`, lane
   * DATA-HOME-1). When the hub hands it, the Tables listing is these rows — the data home's
   * default is everything, never one organization's. A failed read is the listing's refusal.
   */
  everywhere?: { ok: true; rows: readonly DataHomeTableRow[] } | { ok: false; error: DoorFailure } | undefined;
  /**
   * EVERYTHING ELSE THE HOME LISTS, IN EVERY ORGANIZATION (`custom.data_home_items`, lane
   * DATA-HOME-2) — or the one organization the dropdown names. Every listing but Tables and Shared
   * with me is these rows.
   */
  items?: { ok: true; rows: readonly DataHomeItemRow[] } | { ok: false; error: DoorFailure } | undefined;
  /**
   * WHO CHANGED EACH ROW, ALREADY READ with the rest of the home (`custom.data_home`, DATA-HOME-2),
   * keyed `${organizationId}:${id}`. When present, attachChangedBy reads it and asks no door.
   */
  changedBy?: ReadonlyMap<string, { at: string | null; who: string | null }> | undefined;
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
  /**
   * The heading sentence instead, for that same member. The count beside the title is what SHE
   * can open, so "everything this organization keeps" beside it is false (VERIFIER-17 H3: "Tables
   * 1 — Everything this organization keeps records in" over an organization keeping 26).
   */
  whatWhenSharedOnly?: string | undefined;
  /**
   * The heading sentence when the data home's organization dropdown names ONE organization
   * (DATA-HOME-2): "in every organization you belong to" beside that organization's own count is
   * false.
   */
  whatInOrganization?: ((organizationName: string) => string) | undefined;
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

/**
 * THE STORE'S TABLE FACTS, FOLDED ONTO THE TABLE LIST — `custom.table_facts`' columns the lane
 * decision reads (`visibilityLaneFor`): `visibility`, whether the caller made it, and whether
 * the store keeps it for itself (`kept_by_the_app`). The list is built from each Table's
 * DOCUMENT, which carries none of the three, so without the last one a column's pick list
 * ("Status choices") was listed under Tables beside the organization's own tables instead of
 * under "Kept by the app", behind Show everything (lane POST-PUBLISH-FE).
 */
export function withHubTableFacts(
  listed: readonly Table[],
  facts: ReadonlyMap<string, TableFactRow>,
  userId: string | null,
): Table[] {
  return listed.map((t) => {
    const f = facts.get(t.id);
    if (!f) return t;
    return {
      ...t,
      visibility: f.visibility,
      created_by: f.mine ? (userId ?? t.created_by) : t.created_by,
      ...(f.kept_by_the_app === true ? { kept_by_the_app: true } : {}),
      ...(typeof f.keeper_says === "string" && f.keeper_says.trim() ? { keeper_says: f.keeper_says } : {}),
    } as Table;
  });
}

/** Another organization's table: in none of this organization's lanes. */
const OUTSIDE_LANE: VisibilityLane | null = null;

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The store's refusal, carried as-is. A client that rewrote it would be inventing. */
/** The data home's rows of one kind (DATA-HOME-2), or the listing's refusal. */
function itemsOf(
  ctx: HubReadContext,
  kind: DataHomeItemKind,
): { ok: true; rows: Array<{ row: DataHomeItemRow; item: Record<string, unknown> }> } | { ok: false; error: DoorFailure } {
  if (!ctx.items) {
    return { ok: false, error: { message: "The listings across your organizations were not read, so none is listed." } };
  }
  if (!ctx.items.ok) return { ok: false, error: ctx.items.error };
  return {
    ok: true,
    rows: ctx.items.rows.filter((r) => r.kind === kind).map((row) => ({ row, item: row.item_row })),
  };
}

/**
 * WHAT EVERY ROW CARRIES FROM ITS TABLE AND ORGANIZATION: the table, its organization, and the four
 * facts the five lanes read — the Table's own, from `custom.data_home_tables` (a dashboard is Mine
 * when its Table is, Shared when its Table was shared with her …). A row with no Table, or one the
 * tables door did not list, keeps the organization's member facts and nothing else.
 */
function rowFacts(
  ctx: HubReadContext,
  row: DataHomeItemRow,
): Pick<HubItem, "tableId" | "tableName" | "lane" | "organizationName" | "organizationId" | "scope"> {
  const table =
    row.table_id && ctx.everywhere && ctx.everywhere.ok
      ? ctx.everywhere.rows.find((t) => t.table_id === row.table_id)
      : undefined;
  return {
    tableId: row.table_id,
    tableName: row.table_name || null,
    lane: null,
    organizationName: row.organization_name,
    organizationId: row.organization_id,
    scope: table
      ? { mine: table.mine, member: table.member, sharedWithMe: table.shared_with_me, visibility: table.visibility }
      : { mine: false, member: true, sharedWithMe: false, visibility: null },
  };
}

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
 * DOES THE SHARED-ONLY SENTENCE SPEAK TO THIS PERSON? (UI-FIX-19, VERIFIER-19 #8)
 *
 * `shared_only` closes the organization-member lane only (`iam.member_lane_open`): the owner's and
 * the admins' own lanes still reach every table, so the owner of admin's Workspace was told
 * "This organization shows each member only what is shared with them" beside a count that was
 * every table. The sentence is for a member who is not an owner or admin. An owner or admin — and
 * anyone whose role is not known yet — reads the ordinary sentence, "The tables you can open in
 * this organization", which is true of every seat.
 */
export function seesOnlyWhatIsShared(
  memberVisibility: unknown,
  role: string | null | undefined,
): boolean {
  if (memberVisibility !== "shared_only") return false;
  if (!role) return false;
  return role !== "owner" && role !== "admin";
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
    // THE COUNT BESIDE IT IS WHAT THIS PERSON CAN OPEN, so the sentence says exactly that.
    what: "Every table you can open, in every organization you belong to — yours and the ones the app keeps.",
    whatInOrganization: (organizationName) =>
      `Every table you can open in ${organizationName} — yours and the ones the app keeps.`,
    whatWhenSharedOnly:
      "The tables shared with you here. This organization shows each member only what is shared with them.",
    empty: "No tables yet. Press New table above, or start from an example.",
    emptyWhenSharedOnly: SHARED_ONLY_EMPTY,
    door: "custom.read_records over the Table kernel",
    changedByKind: "structure",
    async read(ctx) {
      // THE DATA HOME'S TABLES ARE EVERY ORGANIZATION'S, AND EVERY KIND (lane DATA-HOME-1, Arman
      // 2026-09-27 21:20 and 21:40 PT): one row per table she can open — hers and the ones the app
      // keeps for itself — each naming its organization and its kind, and carrying the facts the
      // five filters read. It is ONE door (`custom.data_home_tables()`); there is no second list.
      if (!ctx.everywhere) {
        return {
          ok: false,
          error: { message: "The tables across your organizations were not read, so none is listed." },
        };
      }
      if (!ctx.everywhere.ok) return { ok: false, error: ctx.everywhere.error };
      return {
        ok: true,
        items: ctx.everywhere.rows.map((row) => ({
          id: row.table_id,
          title: row.table_name || "(unnamed table)",
          tableId: row.table_id,
          tableName: row.table_name || null,
          lane: null,
          organizationName: row.organization_name,
          organizationId: row.organization_id,
          kind: row.kind,
          scope: {
            mine: row.mine,
            member: row.member,
            sharedWithMe: row.shared_with_me,
            visibility: row.visibility,
          },
          facts: row.member ? [] : ["shared with you"],
          href: row.member ? `/data-v2/${row.table_id}` : `/data-v2/${row.table_id}?org=${row.organization_id}`,
          changedAt: row.updated_at,
        })),
      };
    },
  },

  {
    id: "forms",
    title: "Forms",
    what: "Questions a stranger answers with no account — the answer lands as a record.",
    empty: "No forms yet. Open a table, press Forms, write the questions and publish it.",
    door: "custom.data_home_items (custom.forms, every organization)",
    changedByKind: "form",
    whatInOrganization: (organizationName) =>
      `Questions a stranger answers with no account, in ${organizationName} — the answer lands as a record.`,
    async read(ctx) {
      const found = itemsOf(ctx, "form");
      if (!found.ok) return found;
      return {
        ok: true,
        items: found.rows.map(({ row, item: page }) => {
          const form = page as {
            form_id: string;
            table_id: string;
            title: string | null;
            state: string;
            responses: number | null;
            held: number | null;
            published_at: string | null;
          };
          return {
            ...rowFacts(ctx, row),
            id: form.form_id,
            title: form.title || "(untitled form)",
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
          };
        }),
      };
    },
  },

  {
    id: "bookings",
    title: "Bookings",
    what: "A page that offers only the times you are free, and writes the appointment into a table.",
    empty: "No booking pages yet. Open a table, press Bookings, and say how long a slot is.",
    door: "custom.data_home_items (custom.bookings, every organization)",
    changedByKind: "form",
    whatInOrganization: (organizationName) =>
      `Pages in ${organizationName} that offer only the times you are free, and write the appointment into a table.`,
    async read(ctx) {
      const found = itemsOf(ctx, "booking");
      if (!found.ok) return found;
      return {
        ok: true,
        items: found.rows.map(({ row, item: page }) => {
          const booking = page as {
            form_id: string;
            table_id: string;
            title: string | null;
            state: string;
            slot_minutes: number | null;
            booked: number | null;
            upcoming: number | null;
            published_at: string | null;
          };
          return {
            ...rowFacts(ctx, row),
            id: booking.form_id,
            title: booking.title || "(untitled booking page)",
            facts: [
              booking.state,
              booking.slot_minutes ? `${booking.slot_minutes} minutes` : "",
              plural(Number(booking.booked ?? 0), "booking"),
              Number(booking.upcoming ?? 0) > 0 ? `${Number(booking.upcoming)} still to come` : "",
            ].filter(Boolean) as string[],
            // THE BOOKING PAGE ITSELF, marked in the table's Bookings rail
            // (VERIFIER-16 M4) — never the bare grid.
            href: `/data-v2/${booking.table_id}?rail=bookings&item=${booking.form_id}`,
            publicHref: booking.published_at ? `/b/${booking.form_id}` : undefined,
            publicLabel: booking.published_at ? "The page somebody books on" : undefined,
          };
        }),
      };
    },
  },

  {
    id: "portals",
    title: "Portals",
    what: "A door for people outside this organization — each one sees only their own rows.",
    empty: "No portals yet. A portal names the table whose records ARE your clients, and invites them.",
    door: "custom.data_home_items (custom.list_portals + custom.portal_tables, every organization)",
    changedByKind: "portal",
    async read(ctx) {
      const found = itemsOf(ctx, "portal");
      if (!found.ok) return found;
      return {
        ok: true,
        items: found.rows.map(({ row, item }) => {
          const portal = item as {
            portal_id: string;
            title: string | null;
            client_table_id: string;
            is_active: boolean;
            tables: number | null;
            invited: number | null;
            signed_in: number | null;
            shows: Array<{ table_id: string; name: string }> | null;
          };
          // WHICH TABLES EACH PORTAL SHOWS, from the store's own custom.portal_tables. The row
          // opens on a table the portal SHOWS: the clients table is only who signs in, and its own
          // Portals rail truthfully says the portal is not part of it (VERIFIER-15 H5).
          const firstShown = portal.shows?.[0]?.table_id;
          return {
            ...rowFacts(ctx, row),
            id: portal.portal_id,
            title: portal.title || "(untitled portal)",
            facts: [
              portal.is_active ? "open" : "closed",
              plural(portal.tables ?? 0, "table"),
              `${portal.invited ?? 0} invited, ${portal.signed_in ?? 0} signed in`,
            ],
            href: `/data-v2/${firstShown ?? portal.client_table_id}?rail=portals&item=${portal.portal_id}`,
            trouble: firstShown
              ? undefined
              : "This portal shows no table yet, so there is nothing for a client to see. Open its clients table, press Portals, and add the table they should see.",
            publicHref: `/portal/${row.organization_id}`,
            publicLabel: "Where an outsider signs in",
          };
        }),
      };
    },
  },

  {
    id: "dashboards",
    title: "Dashboards",
    what: "Charts over your own records — every number is counted under the reader's own eyes.",
    empty: "No dashboards yet. Open a table, press Dashboards, and add a block.",
    door: "custom.data_home_items (custom.dashboards, every organization)",
    changedByKind: "structure",
    async read(ctx) {
      const found = itemsOf(ctx, "dashboard");
      if (!found.ok) return found;
      return {
        ok: true,
        items: found.rows.map(({ row, item }) => {
          const dash = item as { dashboard_id: string; table_id: string | null; name: string | null; block_count: number | null };
          return {
            ...rowFacts(ctx, row),
            id: dash.dashboard_id,
            title: dash.name || "(untitled dashboard)",
            facts: [plural(dash.block_count ?? 0, "block")],
            href: dash.table_id ? `/data-v2/${dash.table_id}?dashboard=${dash.dashboard_id}` : "/data-v2",
            trouble: dash.table_id
              ? undefined
              : "This dashboard names no table, so there is nothing for it to count. Open it from the table it was meant for, or make it again.",
          };
        }),
      };
    },
  },

  {
    id: "digests",
    title: "Digests and notifications",
    what: "A rule over a saved view, in English: what gets sent, to whom, how often.",
    empty: "No subscriptions yet. Save a view on a table, then say when it should tell you.",
    door: "custom.data_home_items (custom.subscriptions, every organization)",
    changedByKind: "structure",
    async read(ctx) {
      const found = itemsOf(ctx, "digest");
      if (!found.ok) return found;
      return {
        ok: true,
        items: found.rows.map(({ row, item }) => {
          const sub = item as {
            rule_id: string;
            name: string | null;
            table_id: string | null;
            muted: boolean | null;
            cadence: string | null;
            channel: string | null;
            mine: boolean | null;
          };
          return {
            ...rowFacts(ctx, row),
            id: sub.rule_id,
            title: sub.name || "(unnamed subscription)",
            facts: [
              sub.muted ? "muted" : "on",
              sub.cadence ?? "",
              sub.channel ?? "",
              sub.mine ? "yours" : "someone else's",
            ].filter(Boolean) as string[],
            // THE RULE ITSELF, through the one address (lane ROUTE-RESOLVER): `/o/<rule>` opens the
            // table's notifications rail on this rule inside the organization the rule LIVES in.
            href: sub.table_id
              ? openPath(sub.rule_id, {
                  fallback: `/data-v2/${sub.table_id}?rail=notifications&item=${sub.rule_id}`,
                })
              : "/data-v2",
            trouble: sub.table_id
              ? undefined
              : "This subscription names no table any more, so nothing can send it. Open the table it watched and write it again.",
          };
        }),
      };
    },
  },

  {
    id: "checklists",
    title: "Checklists and runs",
    what: "A process written down once: its steps, who does each one, and what each step waits for.",
    empty: "No checklists yet. Write the steps once and every run follows them.",
    door: "custom.data_home_items (custom.checklist_templates, every organization)",
    changedByKind: "structure",
    async read(ctx) {
      const found = itemsOf(ctx, "checklist");
      if (!found.ok) return found;
      return {
        ok: true,
        items: found.rows.map(({ row, item }) => {
          const template = item as {
            template_id: string;
            name: string | null;
            about_table_id: string | null;
            about_table: string | null;
            steps: number | null;
            open_runs: number | null;
            total_runs: number | null;
            updated_at: string | null;
          };
          return {
            ...rowFacts(ctx, row),
            tableName: row.table_name || template.about_table || null,
            id: template.template_id,
            title: template.name || "(unnamed checklist)",
            facts: [
              plural(template.steps ?? 0, "step"),
              `${template.open_runs ?? 0} open of ${template.total_runs ?? 0} runs`,
            ],
            href: template.about_table_id ? `/data-v2/${template.about_table_id}` : "/data-v2",
            trouble: template.about_table_id
              ? undefined
              : "This checklist is not about a table, so a run has nothing to attach to. Point it at one before starting it.",
            changedAt: template.updated_at,
          };
        }),
      };
    },
  },

  {
    id: "automations",
    title: "Automations",
    what: "Boards whose records move through stages, and the rules checked on every move.",
    empty:
      "No boards yet. Give a table a column of choices and call it the stage — the board and its rules follow.",
    door: "custom.data_home_items (custom.pipelines, every organization)",
    changedByKind: "structure",
    async read(ctx) {
      const found = itemsOf(ctx, "automation");
      if (!found.ok) return found;
      return {
        ok: true,
        items: found.rows.map(({ row, item }) => {
          const board = item as {
            table_id: string;
            table_name: string;
            stage_label: string | null;
            stages: number;
            rules: number;
            broken: string | null;
            updated_at: string | null;
          };
          return {
            ...rowFacts(ctx, row),
            id: board.table_id,
            title: board.table_name,
            tableName: board.table_name,
            facts: board.broken
              ? []
              : [`${board.stage_label ?? "Stage"}: ${plural(board.stages, "stage")}`, plural(board.rules, "rule")],
            href: `/data-v2/${board.table_id}?view=kanban`,
            trouble: board.broken ?? undefined,
            changedAt: board.updated_at,
          };
        }),
      };
    },
  },

  {
    id: "shared-outside",
    title: "Shared outside",
    what: "Everyone outside the organization who has been given one of its tables, and what they hold.",
    empty:
      "Nothing is shared outside. Open a table, press Share, and invite somebody by email.",
    door: "custom.data_home_items (custom.shares_outside, every organization)",
    changedByKind: null,
    async read(ctx) {
      const found = itemsOf(ctx, "share");
      if (!found.ok) return found;
      return {
        ok: true,
        items: found.rows.map(({ row, item }) => {
          const share = item as {
            invitation_id: string;
            table_id: string;
            table_name: string | null;
            email: string;
            level_label: string;
            joined: boolean;
            expired: boolean;
            invited_at: string | null;
            say: string | null;
          };
          return {
            ...rowFacts(ctx, row),
            tableName: row.table_name || share.table_name || null,
            id: share.invitation_id,
            title: share.email,
            facts: [share.level_label, share.joined ? "joined" : share.expired ? "run out" : "invited"],
            // THE SHARE DIALOG over that table — where the invitation is resent, changed or taken
            // back — not the table's grid.
            href: `/data-v2/${share.table_id}?rail=share`,
            trouble: share.expired ? (share.say ?? undefined) : undefined,
            changedAt: share.invited_at,
          };
        }),
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
  // EVERY ORGANIZATION SHOWN, IN ONE CALL (DATA-HOME-2): each row is asked of the organization it
  // lives in, never of the one being worked in.
  const byOrganization = new Map<string, string[]>();
  for (const item of items) {
    const organization = item.organizationId ?? ctx.organizationId;
    const ids = byOrganization.get(organization) ?? [];
    ids.push(item.id);
    byOrganization.set(organization, ids);
  }
  // READ ALREADY, in the home's one call (custom.data_home): no second round trip.
  if (ctx.changedBy) {
    for (const item of items) {
      const row = ctx.changedBy.get(`${item.organizationId ?? ctx.organizationId}:${item.id}`);
      if (!row) continue;
      item.changedAt = row.at ?? item.changedAt ?? null;
      item.changedBy = row.who ?? null;
    }
    return;
  }
  const kind = capability.changedByKind;
  const answered = await doors.dataHomeChangedBy(
    ctx.dataSource,
    [...byOrganization.entries()].map(([organization_id, ids]) => ({ organization_id, kind, ids })),
  );
  if (!answered.ok) return;
  const found = new Map(answered.data.map((row) => [`${row.organization_id}:${row.id}`, row]));
  for (const item of items) {
    const row = found.get(`${item.organizationId ?? ctx.organizationId}:${item.id}`);
    if (!row) continue;
    item.changedAt = row.at ?? item.changedAt ?? null;
    item.changedBy = row.who ?? null;
  }
}
