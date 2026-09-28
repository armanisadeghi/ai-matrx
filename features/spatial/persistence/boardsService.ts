// features/spatial/persistence/boardsService.ts
//
// The ONE client path for saved boards (`workspace.spatial_boards`, entity
// token `spatial_board`). React → Supabase directly; RLS is the authority
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
//   - Every failure is a `BoardError`: a sentence for a person plus a remedy.
//   - Soft delete only (`deleted_at`). The table has no archive columns.

import { guardedUpdate, readAllRows } from "@ai-matrx/data/db";
import { supabase } from "@/utils/supabase/client";
import { workspaceDb } from "@/utils/supabase/workspaceDb";
import { writeOne } from "@/utils/supabase/writeOne";
import { requireUserId } from "@/utils/auth/getUserId";
import { ensureOrganizationContext } from "@/lib/organization/organization-gate";
import { whenOrgBootstrapResolved } from "@/lib/organizations/orgBootstrapGate";
import { isJsonObject, type JsonObject, type JsonValue } from "@/types/json";
import type { Database, Json } from "@/types/database.types";
import {
  parseBoardDocument,
  serializeBoardDocument,
  type BoardDocument,
} from "../board/document";

type BoardRow = Database["workspace"]["Tables"]["spatial_boards"]["Row"];
type SaveRow = Pick<BoardRow, "id" | "camera" | "nodes" | "edges" | "version">;

const TABLE = "spatial_boards";
const db = workspaceDb(supabase);

/** The title a person's home board is created with. */
export const HOME_BOARD_TITLE = "My board";
export const DEFAULT_BOARD_TITLE = "Untitled board";

const BOARD_COLUMNS =
  "id, organization_id, title, description, camera, nodes, edges, settings, version, created_by, created_at, updated_at, last_opened_at" as const;
const LIST_COLUMNS =
  "id, organization_id, title, nodes, settings, created_at, updated_at, last_opened_at" as const;

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

/** The three stored columns of a document, as a comparable fingerprint. */
export function documentFingerprint(columns: { camera: unknown; nodes: unknown; edges: unknown }): string {
  return stableStringify({ camera: columns.camera, nodes: columns.nodes, edges: columns.edges });
}

/** The column values for a document, converted honestly to JSON. */
export function documentColumns(doc: BoardDocument): { camera: JsonValue; nodes: JsonValue; edges: JsonValue } {
  const s = serializeBoardDocument(doc);
  return { camera: toJson(s.camera, "camera"), nodes: toJson(s.nodes, "nodes"), edges: toJson(s.edges, "edges") };
}

export function isHomeSettings(settings: Json): boolean {
  return isJsonObject(settings) && settings.home === true;
}

/** Settings for a copy: everything except the home flag. */
export function settingsForCopy(settings: Json): JsonObject {
  if (!isJsonObject(settings)) return {};
  const out: JsonObject = {};
  for (const [k, v] of Object.entries(settings)) {
    if (k === "home" || v === undefined) continue;
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

/** Every board you made (VIEW LAW scope `mine`), newest edit first. Complete, or it throws. */
export async function listBoards(): Promise<BoardListRow[]> {
  const userId = requireUserId();
  let rows: Pick<BoardRow, "id" | "organization_id" | "title" | "nodes" | "settings" | "created_at" | "updated_at" | "last_opened_at">[];
  try {
    rows = await readAllRows(
      ({ from, to }) =>
        db
          .from(TABLE)
          .select(LIST_COLUMNS, { count: "exact" })
          .eq("created_by", userId)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to),
      { label: "workspace.spatial_boards" },
    );
  } catch (error) {
    throw readFailed("your boards", error);
  }
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    organization_id: r.organization_id,
    is_home: isHomeSettings(r.settings),
    tile_count: countTiles(r.nodes),
    created_at: r.created_at,
    updated_at: r.updated_at,
    last_opened_at: r.last_opened_at,
  }));
}

// One home creation per organization at a time: a double-mounted effect or two
// callers racing must not make two home boards.
const homeInFlight = new Map<string, Promise<LoadedBoard>>();

/**
 * Your HOME board in an organization: `settings.home === true`, made by you,
 * not deleted. Created ("My board") when there is none. `organizationId`
 * null → the organization gate asks the person, and this continues with
 * their answer (or rejects with `OrganizationSelectionCancelled`).
 */
export async function getHomeBoard(organizationId: string | null): Promise<LoadedBoard> {
  const orgId = await resolveOrganization(organizationId);
  const userId = requireUserId();
  const key = `${userId}:${orgId}`;
  const existing = homeInFlight.get(key);
  if (existing) return existing;
  const work = (async () => {
    const { data, error } = await db
      .from(TABLE)
      .select(BOARD_COLUMNS)
      .eq("created_by", userId)
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .contains("settings", { home: true })
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) throw readFailed("your board", error);
    const found = data?.[0];
    if (found) return toLoadedBoard(found);
    return insertBoard({ organizationId: orgId, userId, title: HOME_BOARD_TITLE, settings: { home: true } });
  })().finally(() => homeInFlight.delete(key));
  homeInFlight.set(key, work);
  return work;
}

// ── Writes ───────────────────────────────────────────────────────────────────

async function insertBoard(input: {
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
}

export interface SavedDocument {
  version: number;
  fingerprint: string;
}

/**
 * Write the document's camera, tiles and arrows, guarded by `version`.
 * A version that moved only because a column we do not write changed (rename,
 * last-opened) is rebased and saved; a document someone else changed throws
 * `BoardError("conflict")` — the caller offers a reload, never overwrites.
 */
export async function saveBoardDocument(
  id: string,
  doc: BoardDocument,
  guard: SaveGuard,
): Promise<SavedDocument> {
  const columns = documentColumns(doc);
  const SAVE_COLUMNS = "id, camera, nodes, edges, version" as const;
  let result;
  try {
    result = await guardedUpdate<SaveRow>({
      expectedVersion: guard.expectedVersion,
      applyUpdate: ({ expectedVersion, nextVersion }) =>
        db
          .from(TABLE)
          .update({ ...columns, version: nextVersion })
          .eq("id", id)
          .eq("version", expectedVersion)
          .is("deleted_at", null)
          .select(SAVE_COLUMNS)
          .maybeSingle(),
      fetchCurrent: () =>
        db.from(TABLE).select(SAVE_COLUMNS).eq("id", id).is("deleted_at", null).maybeSingle(),
      rebase: { isPhantom: (current) => documentFingerprint(current) === guard.baseFingerprint },
    });
  } catch (error) {
    throw writeFailed("save the board", error);
  }
  switch (result.status) {
    case "saved":
      return { version: result.row.version, fingerprint: documentFingerprint(result.row) };
    case "conflict":
      throw new BoardError(
        "conflict",
        "This board was changed in another tab or window, so your latest change was not saved.",
        "Reload the board to see the newer version.",
      );
    case "not_found":
      throw new BoardError(
        "not_found",
        "This board was deleted, so your change could not be saved.",
        "Open another board from your boards list.",
      );
  }
}
