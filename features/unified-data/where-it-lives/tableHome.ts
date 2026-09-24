// features/unified-data/where-it-lives/tableHome.ts — LANE SC-1' (owner, 2026-09-23 ~22:40 PT)
//
// WHICH ORGANIZATION A TABLE LIVES IN, BY NAME, AND MOVING IT — THE ONE CLIENT METHOD PAIR.
//
// THE OWNER'S WORDS: "I am not seeing how I can see what org this data is in. Is there an easy
// way to see that or do we need to add something that makes it easy to see and set the org for
// something?" Every object page and every list row answers the first half from the TABLE, never
// from the organization the person is working in; the owner of a table answers the second half
// from the same place. The store decides both — `custom.table_home` says where it lives, whether
// this person may move it and where to, and what holds it in place; `custom.table_move` moves it
// or refuses with one sentence. Nothing here decides access or guesses an organization.
//
// Every caller in the app goes through these two functions (and `WhereItLives`, the one UI
// builder, is the only component that renders the answer), so a second "which org is this in"
// code path is a defect by construction.

import type { RecordsDataSource } from "@ai-matrx/records";

export interface TableHomeDestination {
  id: string;
  name: string;
  /** The person's role there: owner · admin · member. */
  role: string;
  /** False when the store says the table cannot go there; `why` says why, in its words. */
  ok: boolean;
  why: string | null;
}

export interface TableHome {
  table: { id: string; name: string; version: number };
  /** Where it lives, from the table itself. */
  organization: { id: string; name: string };
  /** The table's maker, or an owner/admin of its organization. */
  mayMove: boolean;
  /** When `mayMove` is false: the sentence that says who can. */
  whyNot: string | null;
  /** Sentences for what holds it where it is. Empty when nothing does. */
  heldBy: string[];
  /** Every other organization this person belongs to. */
  destinations: TableHomeDestination[];
  carries: { fields: number; records: number; inTrash: number; choiceLists: number; withIt: number };
}

export type TableHomeAnswer =
  | { state: "found"; home: TableHome }
  /** Not given to this person — or not there. The store says the same for both, on purpose. */
  | { state: "not-given" }
  /** The door is not on this database yet. Say so; never pretend there is no organization. */
  | { state: "door-absent"; why: string }
  /** We could not ask. NOT an answer about the person's access. */
  | { state: "unavailable"; why: string };

export type MoveAnswer =
  | { ok: true; to: { id: string; name: string }; from: { id: string; name: string }; tableName: string }
  | { ok: false; sentence: string; hint: string | null };

const DOOR_ABSENT_WHY =
  "custom.table_home is not on this database yet, so the organization is named from the page's own " +
  "reading and moving a table is not offered. Remedy: the chair applies " +
  "migrations/campaign/sc1p_a_table_says_where_it_lives_and_its_owner_can_move_it.sql and " +
  "sc1p_a_table_says_where_it_lives_doors_can_be_reached.sql.";

let absentAnnounced = false;

function doorIsAbsent(error: { code?: string | null; message?: string | null }): boolean {
  if (error.code === "PGRST202" || error.code === "42883") return true;
  return /could not find the function/i.test(error.message ?? "");
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Read the store's answer strictly: an answer this cannot read is "could not ask", never a guess. */
export function parseTableHome(raw: unknown): TableHome | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const table = row.table as Record<string, unknown> | undefined;
  const org = row.organization as Record<string, unknown> | undefined;
  if (!table || !org || !str(table.id) || !str(org.id) || !str(org.name)) return null;
  const carries = (row.carries ?? {}) as Record<string, unknown>;
  const destinations = Array.isArray(row.destinations) ? row.destinations : [];
  return {
    table: { id: String(table.id), name: str(table.name) ?? "This table", version: num(table.version) },
    organization: { id: String(org.id), name: String(org.name) },
    mayMove: row.may_move === true,
    whyNot: str(row.why_not),
    heldBy: Array.isArray(row.held_by) ? row.held_by.filter((s): s is string => typeof s === "string") : [],
    destinations: destinations
      .filter((d): d is Record<string, unknown> => !!d && typeof d === "object" && !!str((d as Record<string, unknown>).id))
      .map((d) => ({
        id: String(d.id),
        name: str(d.name) ?? "An organization",
        role: str(d.role) ?? "member",
        ok: d.ok === true,
        why: str(d.why),
      })),
    carries: {
      fields: num(carries.fields),
      records: num(carries.records),
      inTrash: num(carries.in_trash),
      choiceLists: num(carries.choice_lists),
      withIt: num(carries.with_it),
    },
  };
}

/** Where `tableId` lives, for the signed-in person. The ONE read every surface makes. */
export async function readTableHome(
  dataSource: Pick<RecordsDataSource, "rpc">,
  tableId: string,
): Promise<TableHomeAnswer> {
  let answered: { data: unknown; error: { code?: string | null; message?: string | null } | null };
  try {
    answered = (await dataSource.rpc("table_home", { p_table_id: tableId }, { schema: "custom" })) as typeof answered;
  } catch (thrown) {
    return { state: "unavailable", why: thrown instanceof Error ? thrown.message : "The record store did not answer." };
  }
  if (answered.error) {
    if (doorIsAbsent(answered.error)) {
      if (!absentAnnounced) {
        absentAnnounced = true;
        console.warn(`[tableHome] STAND-IN: ${DOOR_ABSENT_WHY}`);
      }
      return { state: "door-absent", why: DOOR_ABSENT_WHY };
    }
    return { state: "unavailable", why: answered.error.message ?? "The record store refused to say where this lives." };
  }
  if (answered.data === null || answered.data === undefined) return { state: "not-given" };
  const home = parseTableHome(answered.data);
  if (!home) return { state: "unavailable", why: "The record store answered something this page cannot read." };
  return { state: "found", home };
}

/** Move it, or hand back the store's own sentence. Nothing moved when `ok` is false. */
export async function moveTable(
  dataSource: Pick<RecordsDataSource, "rpc">,
  tableId: string,
  toOrganizationId: string,
  expectedVersion: number | null,
): Promise<MoveAnswer> {
  let answered: {
    data: unknown;
    error: { code?: string | null; message?: string | null; hint?: string | null } | null;
  };
  try {
    answered = (await dataSource.rpc(
      "table_move",
      { p_table_id: tableId, p_to_organization_id: toOrganizationId, p_expected_version: expectedVersion },
      { schema: "custom" },
    )) as typeof answered;
  } catch (thrown) {
    return {
      ok: false,
      sentence: thrown instanceof Error ? thrown.message : "The record store did not answer, so nothing moved.",
      hint: null,
    };
  }
  if (answered.error) {
    return {
      ok: false,
      sentence: answered.error.message ?? "The record store refused the move, so nothing moved.",
      hint: answered.error.hint ?? null,
    };
  }
  const row = (answered.data ?? {}) as Record<string, unknown>;
  const to = (row.to ?? {}) as Record<string, unknown>;
  const from = (row.from ?? {}) as Record<string, unknown>;
  const table = (row.table ?? {}) as Record<string, unknown>;
  if (row.moved !== true || !str(to.id)) {
    return { ok: false, sentence: "The record store answered something this page cannot read.", hint: null };
  }
  return {
    ok: true,
    to: { id: String(to.id), name: str(to.name) ?? "the new organization" },
    from: { id: str(from.id) ?? "", name: str(from.name) ?? "its old organization" },
    tableName: str(table.name) ?? "The table",
  };
}

/** The consequence of a move, said before it happens (destructive-and-expensive-actions law). */
export function moveConsequence(home: TableHome, to: TableHomeDestination): string {
  const c = home.carries;
  const parts = [
    `${c.fields} ${c.fields === 1 ? "column" : "columns"}`,
    `${c.records} ${c.records === 1 ? "row" : "rows"}`,
  ];
  if (c.inTrash > 0) parts.push(`${c.inTrash} in the trash`);
  const extra = c.choiceLists + c.withIt;
  return (
    `${home.table.name} moves to ${to.name} with its ${parts.join(", ")}` +
    (extra > 0 ? `, and ${extra} ${extra === 1 ? "thing" : "things"} built only on it (choice lists, rules, dashboards, templates)` : "") +
    `, its comments, forms, saved views and history. People who see it only because they are in ` +
    `${home.organization.name} stop seeing it; people it was shared with by name keep it. ` +
    `You can move it back from the same place.`
  );
}
