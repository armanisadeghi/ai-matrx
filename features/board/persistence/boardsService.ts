// features/board/persistence/boardsService.ts
//
// The ONE client path for saved boards (`projects.boards`, entity
// token `board`). React → Supabase directly; RLS is the authority
// (owner reads/writes/soft-deletes their own rows).
//
// Rules this file keeps:
//   - Every INSERT carries an explicit `organization_id`, resolved through the
//     organization gate (`ensureOrganizationContext`) — never picked here.
//   - Every read of the stored document goes through `parseBoardDocument`, and
//     its `problems` travel with the board — never dropped.
//   - The document write is optimistic-concurrency guarded (`guardedUpdate`,
//     the `version` column). A version that moved for a column we do not edit
//     (a rename, `last_opened_at`) is a phantom and is rebased; a document the
//     other side changed is a `conflict`.
//   - The document is the board's CONTENT: tiles, groups, shapes, arrows
//     (`nodes`, `edges`). The camera is each viewer's own view
//     (`viewerCamera.ts`), never written here and never part of the guard:
//     when it was, panning in one tab made the other tab's next edit a
//     conflict and stopped its autosave. The `camera` column is still READ
//     (old rows) and copied by a duplicate; nothing writes it any more.
//   - A save selects back only `version`; the saved fingerprint is computed
//     from what was written (the whole board used to come back on every save).
//   - Every failure is a `BoardError`: a sentence for a person plus a remedy.
//   - Soft delete only (`deleted_at`). The table has no archive columns, so
//     the list's Archived filter maps onto `deleted_at` and Restore goes
//     through Trash's one door (`entity_undelete`, `restoreFromTrash`).
//   - ONE home board per person: the oldest live row with `settings.home`.
//     Every reader picks it the same way (`pickHomeId`), and a restore never
//     brings back a second one (`restoreBoard`).

import type { MaybeSingleResponse } from "@ai-matrx/data";
import { guardedUpdate, readAllRows } from "@ai-matrx/data/db";
import { supabase } from "@/utils/supabase/client";
import { projectsDb } from "@/utils/supabase/projectsDb";
import { writeOne } from "@/utils/supabase/writeOne";
import { requireUserId } from "@/utils/auth/getUserId";
import { ensureOrganizationContext } from "@/lib/organization/organization-gate";
import { whenOrgBootstrapResolved } from "@/lib/organizations/orgBootstrapGate";
import { isJsonObject, type JsonObject, type JsonValue } from "@/types/json";
import type { Database, Json } from "@/types/database.types";
import type { ArchiveFilterValue } from "@ai-matrx/design-system";
import { restoreFromTrash } from "@/features/trash/service";
import {
  parseBoardDocument,
  serializeBoardDocument,
  type BoardDocument,
} from "../board/document";
import { mergeBoardDocuments } from "../board/merge";

type BoardRow = Database["projects"]["Tables"]["boards"]["Row"];
/** What a save reads back: the version always; the content only when a CAS missed. */
type SaveRow = Pick<BoardRow, "version"> & Partial<Pick<BoardRow, "nodes" | "edges">>;

const TABLE = "boards";
const db = projectsDb(supabase);

/** The title a person's home board is created with. */
export const HOME_BOARD_TITLE = "My board";
export const DEFAULT_BOARD_TITLE = "Untitled board";

const BOARD_COLUMNS =
  "id, organization_id, title, description, camera, nodes, edges, settings, version, created_by, created_at, updated_at, last_opened_at" as const;
const LIST_COLUMNS =
  "id, organization_id, title, nodes, settings, created_at, updated_at, last_opened_at, deleted_at" as const;
/** The entity token Trash and `entity_undelete` know this table by. */
export const BOARD_TOKEN = "board";

// ── Errors ───────────────────────────────────────────────────────────────────

export type BoardErrorCode =
  | "not_found"
  | "conflict"
  | "home_protected"
  | "read_failed"
  | "write_failed"
  | "invalid_title";

/** A failure a person can read, with what to do about it. */
export class BoardError extends Error {
  override name = "BoardError" as const;
  readonly code: BoardErrorCode;
  /** One sentence: what the person can do next. */
  readonly remedy: string;
  override readonly cause?: unknown;

  constructor(code: BoardErrorCode, message: string, remedy: string, cause?: unknown) {
    super(`${message} ${remedy}`);
    this.code = code;
    this.remedy = remedy;
    this.cause = cause;
  }
}

export function isBoardError(error: unknown): error is BoardError {
  return error instanceof BoardError;
}

function describeCause(cause: unknown): string {
  if (cause instanceof Error && cause.message) return cause.message;
  if (isJsonObject(cause) && typeof cause.message === "string") return cause.message;
  return String(cause);
}

function readFailed(what: string, cause: unknown): BoardError {
  return new BoardError(
    "read_failed",
    `Could not load ${what} (${describeCause(cause)}).`,
    "Check your connection and try again.",
    cause,
  );
}

function writeFailed(what: string, cause: unknown): BoardError {
  if (cause instanceof BoardError) return cause;
  return new BoardError(
    "write_failed",
    `Could not ${what} (${describeCause(cause)}).`,
    "Nothing was changed. Try again; if it keeps failing, reload the page.",
    cause,
  );
}

// ── Pure parts (exported for tests) ──────────────────────────────────────────

/**
 * An honest `unknown → Json` conversion for values we built ourselves: object
 * keys whose value is `undefined` are omitted (as JSON does), and anything
 * JSON cannot hold (a function, NaN, Infinity, a class instance's methods)
 * THROWS instead of being written as something else.
 */
export function toJson(value: unknown, path = "$"): JsonValue {
  if (value === null) return null;
  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number":
      if (!Number.isFinite(value)) throw new TypeError(`${path} is not a finite number`);
      return value;
    case "object": {
      if (Array.isArray(value)) return value.map((v: unknown, i) => toJson(v, `${path}[${i}]`));
      const out: JsonObject = {};
      for (const [k, v] of Object.entries(value)) {
        if (v === undefined) continue;
        out[k] = toJson(v, `${path}.${k}`);
      }
      return out;
    }
    default:
      throw new TypeError(`${path} is a ${typeof value}, which JSON cannot store`);
  }
}

/**
 * JSON with object keys sorted — Postgres `jsonb` re-orders keys, so two
 * equal documents only compare equal after canonicalising. Takes `unknown`
 * because stored jsonb columns are `unknown` in the generated types.
 */
export function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v: unknown) => stableStringify(v)).join(",")}]`;
  const entries = Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

/**
 * The board's CONTENT as a comparable fingerprint: `nodes` and `edges` only.
 * The camera is a viewer's own view, so it never decides whether two tabs
 * changed the same board.
 */
export function documentFingerprint(columns: { nodes: unknown; edges: unknown; camera?: unknown }): string {
  return stableStringify({ nodes: columns.nodes, edges: columns.edges });
}

/** The column values for a document, converted honestly to JSON. */
export function documentColumns(doc: BoardDocument): { camera: JsonValue; nodes: JsonValue; edges: JsonValue } {
  const s = serializeBoardDocument(doc);
  return { camera: toJson(s.camera, "camera"), nodes: toJson(s.nodes, "nodes"), edges: toJson(s.edges, "edges") };
}

export function isHomeSettings(settings: Json): boolean {
  return isJsonObject(settings) && settings.home === true;
}

/** `settings.meeting_id`: the meeting this board is the person's board of (`getMeetingBoard`). */
export const MEETING_BOARD_SETTING = "meeting_id";

export function meetingIdOfSettings(settings: Json): string | null {
  if (!isJsonObject(settings)) return null;
  const id = settings[MEETING_BOARD_SETTING];
  return typeof id === "string" && id ? id : null;
}

/** Settings for a copy: everything except the home flag and the meeting link
 * (a copy is an ordinary board — never a second home, never the meeting's board). */
export function settingsForCopy(settings: Json): JsonObject {
  if (!isJsonObject(settings)) return {};
  const out: JsonObject = {};
  for (const [k, v] of Object.entries(settings)) {
    if (k === "home" || k === MEETING_BOARD_SETTING || v === undefined) continue;
    out[k] = v;
  }
  return out;
}

export function copyTitle(title: string): string {
  return `${title} (copy)`;
}

/** Tiles on the board: stored nodes that are not groups or drawn shapes. */
export function countTiles(nodes: Json): number {
  if (!Array.isArray(nodes)) return 0;
  return nodes.filter((n) => !(isJsonObject(n) && (n.group === true || n.shape === true))).length;
}

export function normalizeTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new BoardError("invalid_title", "A board needs a name.", "Type a name and try again.");
  }
  return trimmed;
}

// ── Shapes handed to callers ─────────────────────────────────────────────────

export interface LoadedBoard {
  id: string;
  title: string;
  organizationId: string;
  isHome: boolean;
  /** The revision token the next guarded save is based on. */
  version: number;
  doc: BoardDocument;
  /** Everything `parseBoardDocument` could not read, in words. Never dropped. */
  problems: string[];
  /** Fingerprint of the document as the server holds it (the rebase base). */
  fingerprint: string;
  updatedAt: string;
  lastOpenedAt: string | null;
}

export interface BoardListRow {
  id: string;
  title: string;
  organization_id: string;
  is_home: boolean;
  /** Deleted (`deleted_at` set): in Trash and the list's Archived filter, restorable. */
  archived: boolean;
  tile_count: number;
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
}

type LoadedRow = Pick<
  BoardRow,
  | "id"
  | "organization_id"
  | "title"
  | "description"
  | "camera"
  | "nodes"
  | "edges"
  | "settings"
  | "version"
  | "created_by"
  | "created_at"
  | "updated_at"
  | "last_opened_at"
>;

export function toLoadedBoard(row: LoadedRow): LoadedBoard {
  const { doc, problems } = parseBoardDocument({ camera: row.camera, nodes: row.nodes, edges: row.edges });
  return {
    id: row.id,
    title: row.title,
    organizationId: row.organization_id,
    isHome: isHomeSettings(row.settings),
    version: row.version,
    doc,
    problems,
    fingerprint: documentFingerprint(row),
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at,
  };
}

export function boardHref(board: { id: string; is_home?: boolean; isHome?: boolean }): string {
  return board.is_home === true || board.isHome === true ? "/board" : `/board/${board.id}`;
}

/** A list row's link: none while the board is deleted (it opens nowhere until restored). */
export function boardRowHref(row: Pick<BoardListRow, "id" | "is_home" | "archived">): string | undefined {
  return row.archived ? undefined : boardHref(row);
}

/**
 * The organization a board write acts in, through the gate. On a cold boot the
 * selection may not have landed yet, so we wait for the boot's own answer
 * before the gate would ask a question the person already answered.
 */
async function resolveOrganization(organizationId: string | null): Promise<string> {
  // Returns at once when boot has already answered (bounded otherwise).
  if (!organizationId) await whenOrgBootstrapResolved();
  return ensureOrganizationContext({ organizationId });
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** One board by id, or `null` when it does not exist, was deleted, or is not visible to you. */
export async function getBoard(id: string): Promise<LoadedBoard | null> {
  const { data, error } = await db
    .from(TABLE)
    .select(BOARD_COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw readFailed("this board", error);
  return data ? toLoadedBoard(data) : null;
}

/**
 * The ONE home among a person's rows: the oldest LIVE row whose settings say home — the same row
 * `getHomeBoard` opens. A second flagged row (one restored from /trash while a newer home was
 * made) is an ordinary board everywhere. Exported for tests.
 */
export function pickHomeId(
  rows: readonly { id: string; settings: Json; created_at: string; deleted_at: string | null }[],
): string | null {
  let home: { id: string; created_at: string } | null = null;
  for (const r of rows) {
    if (r.deleted_at !== null || !isHomeSettings(r.settings)) continue;
    if (!home || r.created_at < home.created_at || (r.created_at === home.created_at && r.id < home.id)) home = r;
  }
  return home?.id ?? null;
}

/**
 * Every board you made (VIEW LAW scope `mine`), newest edit first. Complete, or it throws.
 * `archived` is the list's Archived filter: `active` (default) live boards, `archived` deleted
 * ones, `all` both. The home flag is decided over ALL your live boards, whatever is listed.
 */
export async function listBoards(archived: ArchiveFilterValue = "active"): Promise<BoardListRow[]> {
  const userId = requireUserId();
  let rows: Pick<
    BoardRow,
    "id" | "organization_id" | "title" | "nodes" | "settings" | "created_at" | "updated_at" | "last_opened_at" | "deleted_at"
  >[];
  try {
    rows = await readAllRows(
      ({ from, to }) =>
        db
          .from(TABLE)
          .select(LIST_COLUMNS, { count: "exact" })
          .eq("created_by", userId)
          .order("updated_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to),
      { label: "projects.boards" },
    );
  } catch (error) {
    throw readFailed("your boards", error);
  }
  const homeId = pickHomeId(rows);
  return rows
    .filter((r) => (archived === "all" ? true : archived === "archived" ? r.deleted_at !== null : r.deleted_at === null))
    .map((r) => ({
      id: r.id,
      title: r.title,
      organization_id: r.organization_id,
      is_home: r.id === homeId,
      archived: r.deleted_at !== null,
      tile_count: countTiles(r.nodes),
      created_at: r.created_at,
      updated_at: r.updated_at,
      last_opened_at: r.last_opened_at,
    }));
}

// One home lookup/creation per person at a time: a double-mounted effect or two
// callers racing must not make two home boards.
const homeInFlight = new Map<string, Promise<LoadedBoard>>();

/**
 * Your HOME board: `settings.home === true`, made by you, not deleted — in ANY of your
 * organizations (the active organization never decides which board you open; law:
 * common-docs/policies/access-ladder.md). The oldest one wins. When there is
 * none, "My board" is created in `organizationId` — the organization new work is filed in
 * (a write target); null → the organization gate asks the person, and this continues with their
 * answer (or rejects with `OrganizationSelectionCancelled`).
 */
export async function getHomeBoard(organizationId: string | null): Promise<LoadedBoard> {
  const userId = requireUserId();
  const existing = homeInFlight.get(userId);
  if (existing) return existing;
  const work = (async () => {
    const { data, error } = await db
      .from(TABLE)
      .select(BOARD_COLUMNS)
      .eq("created_by", userId)
      .is("deleted_at", null)
      .contains("settings", { home: true })
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) throw readFailed("your board", error);
    const found = data?.[0];
    if (found) return toLoadedBoard(found);
    const orgId = await resolveOrganization(organizationId);
    return insertBoard({ organizationId: orgId, userId, title: HOME_BOARD_TITLE, settings: { home: true } });
  })().finally(() => homeInFlight.delete(userId));
  homeInFlight.set(userId, work);
  return work;
}

// One meeting-board lookup/creation per person per meeting at a time (the
// board view mounting twice must not make two boards for one meeting).
const meetingInFlight = new Map<string, Promise<LoadedBoard>>();

/**
 * Your board for ONE meeting: the row whose `settings.meeting_id` is that
 * meeting, made by you, not deleted — the oldest one wins. A meeting's board is
 * the viewer's own (like the home board), in whatever organization it was
 * made. When there is none it is created with `seed` (the meeting's notes) in
 * `organizationId` — the organization new work is filed in; null → the
 * organization gate asks the person.
 *
 * The link is a setting, not a column: `projects.boards` has no
 * meeting column and no association is registered for it (yet).
 */
export async function getMeetingBoard(input: {
  meetingId: string;
  title: string;
  organizationId: string | null;
  seed: BoardDocument;
}): Promise<LoadedBoard> {
  const userId = requireUserId();
  const flightKey = `${userId}|${input.meetingId}`;
  const existing = meetingInFlight.get(flightKey);
  if (existing) return existing;
  const work = (async () => {
    const { data, error } = await db
      .from(TABLE)
      .select(BOARD_COLUMNS)
      .eq("created_by", userId)
      .is("deleted_at", null)
      .contains("settings", { [MEETING_BOARD_SETTING]: input.meetingId })
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) throw readFailed("this meeting's board", error);
    const found = data?.[0];
    if (found) return toLoadedBoard(found);
    const orgId = await resolveOrganization(input.organizationId);
    return insertBoard({
      organizationId: orgId,
      userId,
      title: normalizeTitle(input.title || DEFAULT_BOARD_TITLE),
      settings: { [MEETING_BOARD_SETTING]: input.meetingId },
      columns: documentColumns(input.seed),
    });
  })().finally(() => meetingInFlight.delete(flightKey));
  meetingInFlight.set(flightKey, work);
  return work;
}

// ── Writes ───────────────────────────────────────────────────────────────────

async function insertBoard(input: {
  /** Mint the id here (the optimistic open): the page already knows it. */
  id?: string;
  organizationId: string;
  userId: string;
  title: string;
  settings?: Json;
  description?: string | null;
  columns?: { camera: Json; nodes: Json; edges: Json };
}): Promise<LoadedBoard> {
  const { data, error } = await db
    .from(TABLE)
    .insert({
      ...(input.id ? { id: input.id } : {}),
      organization_id: input.organizationId,
      created_by: input.userId,
      title: input.title,
      description: input.description ?? null,
      settings: input.settings ?? {},
      last_opened_at: new Date().toISOString(),
      ...(input.columns ?? {}),
    })
    .select(BOARD_COLUMNS)
    .single();
  if (error) throw writeFailed("create the board", error);
  return toLoadedBoard(data);
}

/** A new, empty board. `organizationId` null → the gate asks the person. */
export async function createBoard(input: {
  organizationId: string | null;
  title?: string;
}): Promise<LoadedBoard> {
  const orgId = await resolveOrganization(input.organizationId);
  const title = input.title === undefined ? DEFAULT_BOARD_TITLE : normalizeTitle(input.title);
  return insertBoard({ organizationId: orgId, userId: requireUserId(), title });
}

// ── Optimistic create ────────────────────────────────────────────────────────

/** A board whose id is minted in the browser and whose insert may still be in flight. */
export interface PendingCreate {
  /** The empty board the page shows at once (version 1, the id and organization the insert carries). */
  board: LoadedBoard;
  /** Settles when the row exists (resolves the stored row) or the insert failed (rejects). */
  promise: Promise<LoadedBoard>;
  /** Run the insert again (a prior attempt may have landed; that row is returned). */
  retry: () => Promise<LoadedBoard>;
}

const pendingCreates = new Map<string, PendingCreate>();

/** The in-flight (or failed, awaiting Retry) create for a board id, if this tab minted it. */
export function getPendingCreate(id: string): PendingCreate | undefined {
  return pendingCreates.get(id);
}

/** The create is done (the row landed and the page took it): forget it. */
export function settlePendingCreate(id: string): void {
  pendingCreates.delete(id);
}

/**
 * Start a new empty board and return its id AT ONCE: the id is minted here, the organization is
 * resolved through the gate (instant when one is selected; the gate asks otherwise), and the
 * insert goes out in the background carrying that organization explicitly. The page for
 * `/board/<id>` finds the entry with `getPendingCreate` and renders the empty board without
 * waiting; a failed insert is reported by the page with Retry, never a silent empty board.
 */
export async function beginBoardCreate(input: {
  organizationId: string | null;
  title?: string;
}): Promise<{ id: string }> {
  const orgId = await resolveOrganization(input.organizationId);
  const userId = requireUserId();
  const title = input.title === undefined ? DEFAULT_BOARD_TITLE : normalizeTitle(input.title);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const empty = documentColumns(parseBoardDocument({ camera: { x: 0, y: 0, z: 1 }, nodes: [], edges: [] }).doc);
  const board = toLoadedBoard({
    id,
    organization_id: orgId,
    title,
    description: null,
    camera: empty.camera,
    nodes: empty.nodes,
    edges: empty.edges,
    settings: {},
    version: 1,
    created_by: userId,
    created_at: now,
    updated_at: now,
    last_opened_at: now,
  });
  const insert = () => insertBoard({ id, organizationId: orgId, userId, title });
  const entry: PendingCreate = {
    board,
    promise: insert(),
    retry: async () => {
      const existing = await getBoard(id).catch(() => null);
      return existing ?? (await insert());
    },
  };
  // A failure is reported by whoever awaits `promise`; this only keeps it from being "unhandled".
  entry.promise.catch(() => undefined);
  pendingCreates.set(id, entry);
  return { id };
}

/** Rename. Returns the row's new `version` (the rename bumps it). */
export async function renameBoard(id: string, title: string): Promise<{ title: string; version: number }> {
  const next = normalizeTitle(title);
  try {
    const row = await writeOne(
      db.from(TABLE).update({ title: next }).eq("id", id).is("deleted_at", null).select("title, version"),
      { action: "rename", noun: "board" },
    );
    return { title: row.title, version: row.version };
  } catch (error) {
    throw writeFailed("rename the board", error);
  }
}

/** A copy of the board (camera, tiles, groups, arrows) in the same organization. Never a home board. */
export async function duplicateBoard(id: string): Promise<LoadedBoard> {
  const { data: source, error } = await db
    .from(TABLE)
    .select(BOARD_COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw readFailed("the board to copy", error);
  if (!source) {
    throw new BoardError("not_found", "That board no longer exists.", "Refresh the list to see your boards.");
  }
  // The copy lives where its original lives: the record's own organization is
  // the explicit answer, so the gate never has to ask.
  const orgId = await resolveOrganization(source.organization_id);
  return insertBoard({
    organizationId: orgId,
    userId: requireUserId(),
    title: copyTitle(source.title),
    description: source.description,
    settings: settingsForCopy(source.settings),
    columns: { camera: source.camera, nodes: source.nodes, edges: source.edges },
  });
}

/** Soft delete. Your home board cannot be deleted. */
export async function deleteBoard(id: string): Promise<void> {
  const { data: row, error } = await db
    .from(TABLE)
    .select("id, settings")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw readFailed("the board", error);
  if (!row) {
    throw new BoardError("not_found", "That board was already deleted.", "Refresh the list to see your boards.");
  }
  if (isHomeSettings(row.settings)) {
    throw new BoardError(
      "home_protected",
      "Your home board cannot be deleted — it is the board /board opens.",
      "Clear its tiles instead, or delete a different board.",
    );
  }
  try {
    await writeOne(
      db
        .from(TABLE)
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .is("deleted_at", null)
        // Belt and braces: a board that became home in between is never deleted.
        .not("settings", "cs", JSON.stringify({ home: true }))
        .select("id"),
      { action: "delete", noun: "board" },
    );
  } catch (error) {
    throw writeFailed("delete the board", error);
  }
}

/**
 * Bring a deleted board back, through Trash's one restore door (`entity_undelete`). A deleted
 * home board that comes back while you already have a live home loses its home flag FIRST, so
 * there is never a second home board — not even for an instant. Returns the restored row's
 * home state, for its link.
 */
export async function restoreBoard(id: string): Promise<{ id: string; is_home: boolean }> {
  const userId = requireUserId();
  const { data: row, error } = await db
    .from(TABLE)
    .select("id, settings, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw readFailed("the board", error);
  if (!row) {
    throw new BoardError("not_found", "That board no longer exists.", "Refresh the list to see your boards.");
  }
  if (row.deleted_at === null) return { id, is_home: false };
  let isHome = isHomeSettings(row.settings);
  if (isHome) {
    const { data: live, error: homeError } = await db
      .from(TABLE)
      .select("id")
      .eq("created_by", userId)
      .is("deleted_at", null)
      .contains("settings", { home: true })
      .neq("id", id)
      .limit(1);
    if (homeError) throw readFailed("your home board", homeError);
    if (live && live.length > 0) {
      try {
        await writeOne(
          db.from(TABLE).update({ settings: settingsForCopy(row.settings) }).eq("id", id).select("id"),
          { action: "update", noun: "board" },
        );
      } catch (writeError) {
        throw writeFailed("restore the board", writeError);
      }
      isHome = false;
    }
  }
  try {
    await restoreFromTrash(BOARD_TOKEN, id);
  } catch (restoreError) {
    throw new BoardError(
      "write_failed",
      restoreError instanceof Error ? restoreError.message : "The board could not be restored.",
      "Try again.",
      restoreError,
    );
  }
  return { id, is_home: isHome };
}

/** Stamp `last_opened_at`. Returns the row's new `version`. */
export async function touchOpened(id: string): Promise<{ version: number }> {
  try {
    const row = await writeOne(
      db
        .from(TABLE)
        .update({ last_opened_at: new Date().toISOString() })
        .eq("id", id)
        .is("deleted_at", null)
        .select("version"),
      { action: "update", noun: "board" },
    );
    return { version: row.version };
  } catch (error) {
    throw writeFailed("record that the board was opened", error);
  }
}

export interface SaveGuard {
  /** The `version` this edit was made against. */
  expectedVersion: number;
  /** Fingerprint of the document that version held (`LoadedBoard.fingerprint` or the last save's). */
  baseFingerprint: string;
  /**
   * The document this tab last knew the stored board to hold. With it, a board another tab
   * changed is MERGED per tile (`mergeBoardDocuments`) and saved, never refused; without it the
   * old behaviour stands (a conflict).
   */
  base?: BoardDocument;
}

export interface SavedDocument {
  version: number;
  fingerprint: string;
  /** Set when another tab's changes were merged in: tiles both tabs changed (ours kept). */
  merged?: { conflicts: number; doc: BoardDocument };
}

export interface SaveOptions {
  /**
   * Send the write as a `keepalive` request, so it completes even if the page
   * is closing (the tab hides, then unloads). The Supabase client cannot set
   * `keepalive`, so this one write goes to the same PostgREST endpoint
   * directly with the person's own access token — same row filter, same
   * version guard, same RLS.
   */
  keepalive?: { accessToken: string };
}

/** Browsers refuse a keepalive body over 64 KiB (shared by every keepalive request in flight). */
export const KEEPALIVE_BODY_LIMIT = 60_000;

/**
 * The guarded UPDATE as a raw PostgREST PATCH that survives page unload.
 * Exported for tests. A body over the keepalive limit goes as an ordinary
 * request — still sent at once, still guarded.
 */
export async function keepalivePatch(
  id: string,
  payload: Record<string, JsonValue>,
  expectedVersion: number,
  accessToken: string,
): Promise<MaybeSingleResponse<{ version: number }>> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key) {
    return { data: null, error: { message: "The database address is not configured in this build." } };
  }
  const body = JSON.stringify(payload);
  const url =
    `${base.replace(/\/$/, "")}/rest/v1/${TABLE}` +
    `?id=eq.${encodeURIComponent(id)}&version=eq.${expectedVersion}&deleted_at=is.null&select=version`;
  const response = await fetch(url, {
    method: "PATCH",
    keepalive: new TextEncoder().encode(body).length <= KEEPALIVE_BODY_LIMIT,
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Content-Profile": "workspace",
      "Accept-Profile": "workspace",
      Prefer: "return=representation",
    },
    body,
  });
  if (!response.ok) {
    let message = `The database answered ${response.status}.`;
    let code: string | null = null;
    try {
      const err: unknown = await response.json();
      if (isJsonObject(err)) {
        if (typeof err.message === "string") message = err.message;
        if (typeof err.code === "string") code = err.code;
      }
    } catch {
      // The status line is the message.
    }
    return { data: null, error: { message, code } };
  }
  const rows: unknown = await response.json();
  const row: unknown = Array.isArray(rows) ? rows[0] : null;
  return {
    data: isJsonObject(row) && typeof row.version === "number" ? { version: row.version } : null,
    error: null,
  };
}

/**
 * Write the board's content (tiles, groups, shapes, arrows), guarded by
 * `version`. The camera is not written: it is each viewer's own.
 * A version that moved only because something we do not write changed
 * (rename, last-opened, an old client's camera) is rebased and saved; content
 * someone else changed throws `BoardError("conflict")` — the caller offers a
 * reload, never overwrites.
 */
export async function saveBoardDocument(
  id: string,
  doc: BoardDocument,
  guard: SaveGuard,
  options: SaveOptions = {},
): Promise<SavedDocument> {
  let toWrite = doc;
  let expectedVersion = guard.expectedVersion;
  let baseFingerprint = guard.baseFingerprint;
  let merged: SavedDocument["merged"];
  // A merge can lose the race to a third write: take what is stored again, a few times.
  for (let attempt = 0; ; attempt += 1) {
    const { nodes, edges } = documentColumns(toWrite);
    const fingerprint = documentFingerprint({ nodes, edges });
    const keepalive = options.keepalive;
    let result;
    try {
      result = await guardedUpdate<SaveRow>({
        expectedVersion,
        applyUpdate: ({ expectedVersion: expected, nextVersion }) =>
          keepalive
            ? keepalivePatch(id, { nodes, edges, version: nextVersion }, expected, keepalive.accessToken)
            : db
                .from(TABLE)
                .update({ nodes, edges, version: nextVersion })
                .eq("id", id)
                .eq("version", expected)
                .is("deleted_at", null)
                .select("version")
                .maybeSingle(),
        fetchCurrent: () =>
          db.from(TABLE).select("version, nodes, edges").eq("id", id).is("deleted_at", null).maybeSingle(),
        rebase: {
          isPhantom: (current) =>
            documentFingerprint({ nodes: current.nodes, edges: current.edges }) === baseFingerprint,
        },
      });
    } catch (error) {
      throw writeFailed("save the board", error);
    }
    switch (result.status) {
      case "saved":
        return { version: result.row.version, fingerprint, ...(merged ? { merged } : {}) };
      case "conflict": {
        if (!guard.base || attempt >= MERGE_ATTEMPTS) {
          throw new BoardError(
            "conflict",
            "This board was changed in another tab or window, so your latest change was not saved.",
            "Reload the board to see the newer version.",
          );
        }
        // Another tab changed the board: apply its changes, put this tab's on top, per tile.
        const theirs = parseBoardDocument({
          camera: null,
          nodes: result.currentRow.nodes,
          edges: result.currentRow.edges,
        }).doc;
        const outcome = mergeBoardDocuments(guard.base, theirs, doc);
        toWrite = outcome.doc;
        expectedVersion = result.currentVersion;
        baseFingerprint = documentFingerprint({ nodes: result.currentRow.nodes, edges: result.currentRow.edges });
        merged = { conflicts: (merged?.conflicts ?? 0) + outcome.conflicts, doc: outcome.doc };
        break;
      }
      case "not_found":
        throw new BoardError(
          "not_found",
          "This board was deleted, so your change could not be saved.",
          "Open another board from your boards list.",
        );
    }
  }
}

/** Times a save re-merges against a board that moved again while it was merging. */
const MERGE_ATTEMPTS = 4;
