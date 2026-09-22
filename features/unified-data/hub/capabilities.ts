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
import { laneFor, type TableLane } from "@ai-matrx/records-ui";

import * as doors from "./doors";
import type { ChangedByKind, DoorFailure } from "./doors";

/** One thing a person can open, whatever capability it came from. */
export interface HubItem {
  id: string;
  title: string;
  /** The table it belongs to. `null` for the things that belong to none. */
  tableId: string | null;
  tableName: string | null;
  lane: TableLane;
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
  /** The store door this listing reads, named on screen so nobody has to guess. */
  door: string;
  /** Which kind `custom.hub_changed_by` answers for these, or null when the store cannot say. */
  changedByKind: ChangedByKind | null;
  read: (ctx: HubReadContext) => Promise<HubRead>;
}

// ── the small shared helpers ────────────────────────────────────────────────

function byId(tables: readonly Table[]): Map<string, Table> {
  return new Map(tables.map((t) => [t.id, t]));
}

/**
 * WHETHER THE STORE ITSELF SAYS THIS TABLE IS MACHINERY.
 *
 * 🚨 MEASURED ON RINCON PLUMBING CO, 2026-09-22 (VERIFIER-14 §5). Thirteen
 * tables called "Crew choices" and fourteen called "Status choices" sat in the
 * person's own Tables list — one per choice field, made by the store when a
 * field of choices is declared. They are option-list machinery, and a hub that
 * lists twenty-seven of them beside Jobs, Customers and Invoices is a hub whose
 * front page is mostly not the business.
 *
 * The marker is the STORE'S OWN, not a guess from the name: the Table record
 * carries `kept_by_the_app: true` in its document (`custom.record`, the Table
 * kernel), and `tableList()` spreads the whole document onto the Table object.
 * It is not in `@ai-matrx/records`' `Table` interface yet, which is why it is
 * read through a narrow cast here and nowhere else — the day the package
 * declares it, this helper's body is one property access and nothing above it
 * changes. Sniffing the SLUG ("status_choices_<hex>") would have worked today
 * and broken the first time the store named one differently.
 */
export function keptByTheApp(table: Table): boolean {
  return (table as unknown as { kept_by_the_app?: unknown }).kept_by_the_app === true;
}

/**
 * The lane of a TABLE. `laneFor` is the package's ONE lane decision and this
 * does not second-guess it — it adds the one fact `laneFor` cannot see yet:
 * a table the store keeps for the app belongs in the app's lane, exactly like
 * the kernel tables `laneFor` already puts there.
 */
function laneOfTable(table: Table): TableLane {
  return keptByTheApp(table) ? "app" : laneFor(table);
}

/** The lane of a thing is the lane of the table it belongs to (the ONE `laneFor`). */
function laneOf(index: Map<string, Table>, tableId: string | null | undefined): TableLane {
  const table = tableId ? index.get(tableId) : undefined;
  return table ? laneOfTable(table) : "organization";
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

// ── the declarations ────────────────────────────────────────────────────────

export const HUB_CAPABILITIES: readonly HubCapability[] = [
  {
    id: "tables",
    title: "Tables",
    what: "Everything this organization keeps records in.",
    empty: "No tables yet. Make one below, or drop a spreadsheet on it and the store reads the columns.",
    door: "custom.read_records over the Table kernel",
    changedByKind: "structure",
    async read(ctx) {
      return {
        ok: true,
        // THE PERSON'S TABLES, AND ONLY THOSE. What the store keeps for itself
        // is listed below under "Kept by the app" — same doors, same rows, one
        // listing further down, so nothing is hidden and nothing is buried.
        items: ctx.tables.filter((table) => !keptByTheApp(table)).map((table) => ({
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
          href: `/data-v2/${form.table_id}`,
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
          href: `/data-v2/${booking.table_id}`,
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
          href: `/data-v2/${portal.client_table_id}`,
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
          href: sub.table_id ? `/data-v2/${sub.table_id}` : "/data-v2",
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
          href: `/data-v2/${share.table_id}`,
          trouble: share.expired ? share.say : undefined,
          changedAt: share.invited_at,
        })),
      };
    },
  },

  {
    id: "shared-with-me",
    title: "Shared with me",
    what: "Tables another organization has offered the person signed in — open one and it is yours to see.",
    empty: "Nobody outside has shared a table with you.",
    door: "custom.table_share_outside_for_me",
    changedByKind: null,
    async read(ctx) {
      const answered = await doors.sharedWithMe(ctx.dataSource);
      if (!answered.ok) return { ok: false, error: answered.error };
      return {
        ok: true,
        items: answered.data.map((share) => ({
          id: share.invitation_id,
          title: share.table_name || "(unnamed table)",
          tableId: share.table_id,
          tableName: share.organization,
          // It is not in any of THIS organization's lanes; it was shared to the person.
          lane: "community" as TableLane,
          facts: [share.level_label, `from ${share.organization}`, "not accepted yet"],
          // 🚨 THE ROW OPENS THE INVITATION, BECAUSE THAT IS WHAT THE ROW IS.
          // VERIFIER-14 item 2: every row here opened `/data-v2/<table>` and
          // landed on "This table is not here." Measured on the live store on
          // 2026-09-23, the deeper reason: `custom.table_share_outside_for_me`
          // answers `status = 'pending'` invitations ONLY, and the person had
          // ZERO active grants — `custom.portal_admits` was false, so every
          // door of that organization refused them and no address could have
          // opened the table. The thing that exists is the INVITATION, and it
          // already has its own screen: `/invitations/table/accept/<token>`
          // names the table, the organization, what they will be able to do and
          // who shared it, and the accept writes the grant and opens the table.
          // Sending the row anywhere else would be a link to a thing that is
          // not there yet.
          href: `/invitations/table/accept/${share.token}`,
        })),
      };
    },
  },

  {
    id: "kept-by-the-app",
    title: "Kept by the app",
    what: "Tables the store made for itself — the choice lists behind your dropdowns, and its own saved views.",
    empty: "The store keeps nothing of its own here yet.",
    door: "custom.read_records over the Table kernel",
    changedByKind: "structure",
    async read(ctx) {
      return {
        ok: true,
        items: ctx.tables.filter(keptByTheApp).map((table) => ({
          id: table.id,
          title: table.name ?? "(unnamed table)",
          tableId: table.id,
          tableName: table.name ?? null,
          lane: "app" as TableLane,
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
