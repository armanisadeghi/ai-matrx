"use client";

/**
 * THE BRIDGE — an agent reaches EVERY item on a board in two requests.
 *
 * Only the LIVE tile (selected, worked in or focused) registers its feature's
 * surface globally; every other tile is dormant (`SurfaceActivity`), so the
 * one-live-registration law holds. But each tile ALSO registers into its own
 * CAPTURE (`createSurfaceCapture`), live or dormant, which the board keeps in
 * an `ItemSurfaceIndex`. From it:
 *
 *   request one — `boardItemsOverview`: the board's `board_items` value names
 *     every item (id, title, kind, surface, live) with a few BASICS from the
 *     item's own surface (`surfaceBrief`), bounded and with the caps stated;
 *     the live item carries none, because its FULL surface already arrives as
 *     a level of the surface chain;
 *   request two — `openItemSurface` (`board_open_item`): that item's declared
 *     values with their descriptions and its controls — the write targets and
 *     client tools its manifest declares, offered exactly as on the feature's
 *     page — and `actOnItem` (`board_item_act`), which applies one of them
 *     through the platform's ONE writeback and client-tool runtimes with the
 *     capture as `source`: same value checks, anchored patches, apply policy,
 *     approval card and result envelope as acting on the page.
 */

import { getManifest } from "@/features/surfaces/manifests/registry";
import {
  waitForCapturedRuntime,
  type SurfaceRegistry,
  type SurfaceRuntimeValue,
  type SurfaceToolCall,
} from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { describeAgentWritableTargets } from "@ai-matrx/chat/surfaces/runtime/agent-offer";
import {
  SURFACE_BRIEF_MAX_VALUES,
  SURFACE_BRIEF_TEXT_CHARS,
  surfaceBrief,
  type SurfaceBrief,
} from "@ai-matrx/chat/surfaces/runtime/surface-brief";
import {
  executeSurfaceClientTool,
  listLiveSurfaceClientTools,
} from "@ai-matrx/chat/surfaces/runtime/surface-client-tools";
import { surfacePatchContractLine } from "@ai-matrx/chat/surfaces/runtime/surface-write-patch";
import { surfaceWriteToolOutput } from "@ai-matrx/chat/surfaces/runtime/surface-write-tool-output";
import { listAgentWritableTargets } from "@ai-matrx/chat/surfaces/runtime/surface-writeback";
import { writeToPageThroughDoor } from "@/components/agent-copy/alchemy-door";
import type { SurfaceScopePayload } from "@ai-matrx/chat/surfaces/types";

/**
 * A surface whose content has not loaded sets this to `true` in its scope instead of publishing zeros
 * and defaults (0 rows, read-only): the bridge then says "not loaded yet" in plain words.
 */
export const SURFACE_NOT_LOADED_KEY = "not_loaded_yet";

/** Items listed in full (id, title, kind, surface, basics) in `board_items`; the rest are a compact id + title tail. */
export const BOARD_ITEMS_MAX = 80;
/** The compact tail (id + title only) lists at most this many more items; the rest are counted in `omitted_count`. */
export const BOARD_ITEMS_TAIL_MAX = 300;
/** All item basics together stay under this many characters (JSON). Every item gets a fair share of it. */
export const BOARD_ITEMS_BRIEF_BUDGET_CHARS = 8000;
/**
 * One item's share is `budget / items-with-basics`, between these two. The floor holds for every listed
 * item (`BOARD_ITEMS_MAX × floor` stays under the budget): its name plus one more fact, always.
 * The ceiling is what a nearly empty board shows per item.
 */
export const ITEM_BASICS_FLOOR_CHARS = 70;
export const ITEM_BASICS_CEILING_CHARS = 1200;
/** The selected tile, when it is not the live one, carries its full values up to this many characters. */
export const SELECTED_FULL_MAX_CHARS = 12_000;
/**
 * The whole `board_items` value (JSON) never outgrows this, and the Board manifest declares it as the
 * value's `inlineUpTo`, so the server always inlines it in the agent's first request (its default
 * inlines only values under 200 chars; anything bigger was DEFERRED behind a lookup). Room for the
 * basics budget, a non-live selected tile's full values and every listed item's identity; a board too
 * big for it sheds the tail first, then detail (`boardItemsOverview`).
 */
export const BOARD_ITEMS_INLINE_CHARS = 24_000;
/**
 * CONNECTED SOURCES (a chat tile's lines): every tile joined to a chat tile by a line carries its FULL
 * declared values in that chat's own context — one fair share of this total, between the floor and
 * `ITEM_VALUE_MAX_CHARS`. It rides outside the basics budget and the inline cap above, which keep
 * governing everything else.
 */
export const CONNECTED_FULL_TOTAL_CHARS = 60_000;
export const CONNECTED_FULL_FLOOR_CHARS = 2_000;
/** An item whose scope cannot be read in this long is listed without basics. */
export const ITEM_SCOPE_READ_TIMEOUT_MS = 1500;
/** How long `board_open_item` waits for a tile brought back onto the board to mount its surface. */
export const ITEM_MOUNT_TIMEOUT_MS = 4000;
/** One value in `board_open_item` is cut to this many characters (JSON). */
export const ITEM_VALUE_MAX_CHARS = 20_000;
/** All values in one `board_open_item` answer stay under this many characters. */
export const ITEM_VALUES_TOTAL_CHARS = 60_000;

// ── the index: one capture per tile ─────────────────────────────────────────

/**
 * The board's tile → capture index. A tile creates its capture and puts it
 * here from an effect; the agent tools read it. Never read during render.
 */
export interface ItemSurfaceIndex {
  /** Put a tile's capture in the index; returns the removal. */
  set: (tileId: string, capture: SurfaceRegistry) => () => void;
  get: (tileId: string) => SurfaceRegistry | null;
  /** The tile's capture once its tile has mounted, or null after `timeoutMs`. */
  wait: (tileId: string, timeoutMs: number) => Promise<SurfaceRegistry | null>;
}

export function createItemSurfaceIndex(): ItemSurfaceIndex {
  const captures = new Map<string, SurfaceRegistry>();
  const waiters = new Map<string, Set<(capture: SurfaceRegistry) => void>>();
  return {
    set(tileId, capture) {
      captures.set(tileId, capture);
      for (const resolve of waiters.get(tileId) ?? []) resolve(capture);
      waiters.delete(tileId);
      return () => {
        if (captures.get(tileId) === capture) captures.delete(tileId);
      };
    },
    get: (tileId) => captures.get(tileId) ?? null,
    wait(tileId, timeoutMs) {
      const now = captures.get(tileId);
      if (now) return Promise.resolve(now);
      return new Promise((resolve) => {
        const set = waiters.get(tileId) ?? new Set();
        const done = (capture: SurfaceRegistry | null) => {
          clearTimeout(timer);
          set.delete(done);
          if (set.size === 0) waiters.delete(tileId);
          resolve(capture);
        };
        const timer = setTimeout(() => done(null), timeoutMs);
        set.add(done);
        waiters.set(tileId, set);
      });
    },
  };
}

async function readScope(
  runtime: SurfaceRuntimeValue,
  timeoutMs: number,
): Promise<SurfaceScopePayload | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(runtime.getScope()),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } catch (error) {
    console.error(
      `[board] the "${runtime.surfaceName}" item's values could not be read — it is listed without them`,
      error,
    );
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── request one: what every item is ─────────────────────────────────────────

export interface BoardItemRow {
  id: string;
  title: string;
  kind: string;
  /** The item's feature surface, or null for board-only content. */
  surface: string | null;
  /** The ONE tile whose surface is registered globally (focused, else worked in, else selected). */
  live: boolean;
  /** The tile the person has selected (may differ from the live one while they work in another). */
  selected?: boolean;
  parked?: boolean;
  removed?: boolean;
  /** The item's last-known basics from the saved board, for when its tile is asleep or never woke. */
  stored_basics?: StoredBasics | null;
  /** Joined to the asking chat tile by a line: carries its full values, live or not (`CONNECTED_FULL_TOTAL_CHARS`). */
  connected?: boolean;
}

/**
 * An item's basics as the saved board keeps them (`BoardNode.basics`): sampled while its tile is awake
 * (`sampleItemBasics`), or — for a tile that has never been awake — what the add knew (type and name),
 * marked `stale`. `at` is when they were taken.
 */
export interface StoredBasics {
  values: Record<string, unknown>;
  at: string;
  stale?: boolean;
}

export interface BoardItemsOverview {
  live_item_ids: string[];
  item_count: number;
  /** Items beyond the compact tail: not listed at all. */
  omitted_count: number;
  /** One line that holds for every item below. */
  read_in_full: string;
  items: Array<{
    id: string;
    title: string;
    kind: string;
    surface: string | null;
    live: boolean;
    selected?: true;
    parked?: true;
    removed?: true;
    basics?: Record<string, unknown>;
    /** When `basics` were taken, for an item whose tile is not awake (its last-known basics). */
    basics_at?: string;
    /** The basics are only what the add knew (type and name): the tile has not been awake since. */
    basics_stale?: true;
    /** The selected tile's declared values in full, when its surface is not the live one; a connected source's, always. */
    full_values?: Record<string, unknown>;
    /** A line joins this item to the chat asking: `full_values` are its whole surface. */
    connected?: true;
    /** Why this item carries no basics. */
    basics_note?: string;
  }>;
  /** Items past `max_items`: id and title only, so nothing on the board is invisible. */
  more_items?: Array<{ id: string; title: string }>;
  limits: {
    max_items: number;
    tail_max: number;
    /** Each item's share of the basics budget, in characters. */
    basics_chars_per_item: number;
    basics_floor_chars: number;
    basics_values_per_item: number;
    basics_text_chars: number;
    basics_total_chars: number;
  };
}

/** Values and text length one item's share allows: fewer and shorter as the board grows. */
export function basicsShape(allowance: number): { maxValues: number; textChars: number } {
  if (allowance >= 600) return { maxValues: SURFACE_BRIEF_MAX_VALUES, textChars: SURFACE_BRIEF_TEXT_CHARS };
  if (allowance >= 300) return { maxValues: 3, textChars: 100 };
  if (allowance >= 150) return { maxValues: 2, textChars: 60 };
  return { maxValues: 2, textChars: 30 };
}

/** One item's basics, fitted to its allowance: drop trailing values (never below two), then shorten text. */
export function fitBasics(
  manifest: Parameters<typeof surfaceBrief>[0],
  scope: SurfaceScopePayload,
  allowance: number,
): SurfaceBrief["values"] {
  const shape = basicsShape(allowance);
  let { maxValues, textChars } = shape;
  let values = surfaceBrief(manifest, scope, { maxValues, textChars }).values;
  const size = () => JSON.stringify(values).length;
  while (size() > allowance) {
    if (Object.keys(values).length > 2) maxValues = Object.keys(values).length - 1;
    else if (textChars > 8) textChars = Math.max(8, Math.floor(textChars / 2));
    else break;
    values = surfaceBrief(manifest, scope, { maxValues, textChars }).values;
  }
  return values;
}

function declaredValues(
  manifest: ReturnType<typeof getManifest>,
  scope: SurfaceScopePayload,
  maxChars: number,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let remaining = maxChars;
  for (const declared of manifest?.values ?? []) {
    const value = scope[declared.name];
    if (isEmpty(value) || declared.autoContext === false) continue;
    const capped = capValue(value, remaining);
    remaining -= capped.chars;
    out[declared.name] = capped.value;
    if (remaining <= 0) break;
  }
  return out;
}

/**
 * `board_items` — every item, each with a fair share of the basics budget:
 * allowance = budget / (items carrying basics), between a floor and a ceiling.
 * The selected tile carries its full values (when it is not the live one, whose
 * full surface already travels as a surface-chain level). An item whose tile is
 * asleep or has never been awake carries its last-known basics (`stored_basics`,
 * kept in the saved board) with when they were taken.
 */
export async function boardItemsOverview(
  rows: readonly BoardItemRow[],
  index: ItemSurfaceIndex | null,
): Promise<BoardItemsOverview> {
  const listedAll = rows.slice(0, BOARD_ITEMS_MAX);
  const connectedCount = listedAll.filter((row) => row.connected).length;
  const connectedChars = Math.min(
    ITEM_VALUE_MAX_CHARS,
    Math.max(CONNECTED_FULL_FLOOR_CHARS, Math.floor(CONNECTED_FULL_TOTAL_CHARS / Math.max(1, connectedCount))),
  );
  const reads = await Promise.all(
    listedAll.map(async (row) => {
      if ((row.live && !row.connected) || row.parked || row.removed || !row.surface) return null;
      const runtime = index?.get(row.id)?.primary() ?? null;
      if (!runtime) return null;
      const scope = await readScope(runtime, ITEM_SCOPE_READ_TIMEOUT_MS);
      return scope ? { manifest: getManifest(runtime.surfaceName), scope } : null;
    }),
  );
  // The value always fits its inline allowance: a board too big sheds the compact tail first, then the
  // selected tile's full values shrink, then every item's share, then the listed items.
  const steps: OverviewLimits[] = [
    { listed: BOARD_ITEMS_MAX, tail: BOARD_ITEMS_TAIL_MAX, full: SELECTED_FULL_MAX_CHARS, budget: BOARD_ITEMS_BRIEF_BUDGET_CHARS },
    { listed: BOARD_ITEMS_MAX, tail: 100, full: SELECTED_FULL_MAX_CHARS, budget: BOARD_ITEMS_BRIEF_BUDGET_CHARS },
    { listed: BOARD_ITEMS_MAX, tail: 0, full: SELECTED_FULL_MAX_CHARS, budget: BOARD_ITEMS_BRIEF_BUDGET_CHARS },
    { listed: BOARD_ITEMS_MAX, tail: 0, full: 6000, budget: BOARD_ITEMS_BRIEF_BUDGET_CHARS },
    { listed: BOARD_ITEMS_MAX, tail: 0, full: 3000, budget: 4000 },
    { listed: 40, tail: 0, full: 3000, budget: 3000 },
    { listed: 20, tail: 0, full: 2000, budget: 2000 },
  ];
  // Connected sources ride outside the inline cap: only the rest of the board is measured against it.
  const restChars = (o: BoardItemsOverview) =>
    JSON.stringify(o).length -
    o.items.reduce((sum, item) => sum + (item.connected ? JSON.stringify(item.full_values ?? {}).length : 0), 0);
  let overview = buildOverview(rows, index, reads, steps[0], connectedChars);
  for (const step of steps.slice(1)) {
    if (restChars(overview) <= BOARD_ITEMS_INLINE_CHARS) break;
    overview = buildOverview(rows, index, reads, step, connectedChars);
  }
  return overview;
}

interface OverviewLimits {
  listed: number;
  tail: number;
  full: number;
  budget: number;
}

type ScopeRead = { manifest: ReturnType<typeof getManifest>; scope: SurfaceScopePayload } | null;

/** What the add knew about an item whose tile has never been awake: its type and name. */
export function addTimeBasics(kind: string, title: string, at: string = new Date().toISOString()): StoredBasics {
  return { values: { type: kind, name: title }, at, stale: true };
}

function buildOverview(
  rows: readonly BoardItemRow[],
  index: ItemSurfaceIndex | null,
  reads: readonly ScopeRead[],
  limits: OverviewLimits,
  connectedChars: number,
): BoardItemsOverview {
  const listed = rows.slice(0, limits.listed);
  const tail = rows.slice(limits.listed, limits.listed + limits.tail);
  // Selected but not live: its FULL values travel here (its surface is dormant, so nothing else carries them).
  // Only a LONE selection: with several selected each is just marked `selected` and keeps its basics.
  const fullFor = (row: BoardItemRow) => !!row.selected && rows.filter((r) => r.selected).length === 1;
  const hasFull = (row: BoardItemRow, i: number) => !!reads[i] && (!!row.connected || fullFor(row));
  const sharing = listed.filter((row, i) => !row.live && row.surface && index && !hasFull(row, i)).length;
  const allowance = Math.max(
    ITEM_BASICS_FLOOR_CHARS,
    Math.min(ITEM_BASICS_CEILING_CHARS, Math.floor(limits.budget / Math.max(1, sharing))),
  );
  // Last-known basics: what the saved board kept while the tile was awake, else what the add knew.
  const lastKnown = (row: BoardItemRow) => {
    const kept = row.stored_basics ?? addTimeBasics(row.kind, row.title);
    return {
      basics: fitStoredBasics(kept.values, allowance),
      basics_at: kept.at,
      ...(kept.stale ? { basics_stale: true as const } : {}),
    };
  };
  const items = listed.map((row, i) => {
    const base = {
      id: row.id,
      title: row.title,
      kind: row.kind,
      surface: row.surface,
      live: row.live,
      ...(row.selected ? { selected: true as const } : {}),
      ...(row.parked ? { parked: true as const } : {}),
      ...(row.removed ? { removed: true as const } : {}),
      ...(row.connected ? { connected: true as const } : {}),
    };
    // A board that keeps no captures (its tiles open nothing) lists identity only.
    if (!row.surface || !index) return base;
    // A connected source: its WHOLE surface, even when it is the live tile (this chat's context is its own).
    const connectedRead = row.connected ? reads[i] : null;
    if (connectedRead) {
      const full = declaredValues(connectedRead.manifest, connectedRead.scope, connectedChars);
      if (Object.keys(full).length > 0) {
        return {
          ...base,
          connected: true as const,
          full_values: full,
          ...(connectedRead.scope[SURFACE_NOT_LOADED_KEY] === true
            ? { basics_note: "Connected, but not loaded yet: what it holds (counts, rows) is unknown, not zero." }
            : {}),
        };
      }
    }
    if (row.live) {
      return { ...base, basics_note: "Live: its full surface is in your context as that surface." };
    }
    if (row.parked || row.removed) {
      return {
        ...base,
        ...(row.stored_basics ? lastKnown(row) : {}),
        basics_note: "Off the board: board_open_item brings it back and opens it.",
      };
    }
    const read = reads[i];
    if (read && fullFor(row)) {
      const full = declaredValues(read.manifest, read.scope, limits.full);
      if (Object.keys(full).length > 0) return { ...base, full_values: full };
    }
    if (read && read.scope[SURFACE_NOT_LOADED_KEY] !== true) {
      const basics = fitBasics(read.manifest, read.scope, allowance);
      if (Object.keys(basics).length > 0) return { ...base, basics };
    }
    // Mounted but not loaded: what it cheaply knows (a table's name and columns) beats what the add knew,
    // but a fuller last-known brief from when it WAS loaded beats both.
    if (read && !(row.stored_basics && !row.stored_basics.stale)) {
      const basics = fitBasics(read.manifest, read.scope, allowance);
      if (Object.keys(basics).length > 0) return { ...base, basics, basics_stale: true as const };
    }
    // Asleep, never woken, or not loaded yet: the last-known basics, with when they were taken.
    return { ...base, ...lastKnown(row) };
  });
  const shape = basicsShape(allowance);
  return {
    live_item_ids: rows.filter((row) => row.live).map((row) => row.id),
    item_count: rows.length,
    omitted_count: Math.max(0, rows.length - listed.length - tail.length),
    read_in_full: "board_open_item(id) reads any item in full: every value, its write targets and tools.",
    items,
    ...(tail.length > 0 ? { more_items: tail.map((row) => ({ id: row.id, title: row.title })) } : {}),
    limits: {
      max_items: limits.listed,
      tail_max: limits.tail,
      basics_chars_per_item: allowance,
      basics_floor_chars: ITEM_BASICS_FLOOR_CHARS,
      basics_values_per_item: shape.maxValues,
      basics_text_chars: shape.textChars,
      basics_total_chars: limits.budget,
    },
  };
}

function cutText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** One brief value (already projected by `surfaceBrief`) shortened again: its strings cut to `textChars`. */
function shortenBriefValue(value: unknown, textChars: number): unknown {
  if (typeof value === "string") return cutText(value, textChars);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, typeof v === "string" ? cutText(v, textChars) : v]),
    );
  }
  return value;
}

/** Kept basics fitted to an item's allowance: the same shape rule as `fitBasics`, on an already-projected brief. */
export function fitStoredBasics(values: Record<string, unknown>, allowance: number): Record<string, unknown> {
  let { maxValues, textChars } = basicsShape(allowance);
  const project = () =>
    Object.fromEntries(
      Object.entries(values)
        .slice(0, maxValues)
        .map(([k, v]) => [k, shortenBriefValue(v, textChars)]),
    );
  let out = project();
  while (JSON.stringify(out).length > allowance) {
    if (Object.keys(out).length > 2) maxValues = Object.keys(out).length - 1;
    else if (textChars > 8) textChars = Math.max(8, Math.floor(textChars / 2));
    else break;
    out = project();
  }
  return out;
}

// ── last-known basics: kept in the saved board while a tile is awake ────────

/** How often a board samples its awake tiles' basics (only changes are written, with the autosave). */
export const ITEM_BASICS_SAMPLE_MS = 10_000;

/**
 * The basics to keep for each tile whose kept basics are missing or out of date: an awake tile's brief
 * (the richest shape, so any later share can be cut from it), or — for a tile that has never been awake —
 * what the add knew (type and name), marked stale. Unchanged basics are never returned, so writing the
 * result never causes another write.
 */
export async function sampleItemBasics(
  tiles: ReadonlyArray<{ id: string; title: string; kind: string; surface: string | null; basics?: StoredBasics | null }>,
  index: ItemSurfaceIndex,
): Promise<Array<{ id: string; basics: StoredBasics }>> {
  const at = new Date().toISOString();
  const out = await Promise.all(
    tiles.map(async (tile): Promise<{ id: string; basics: StoredBasics } | null> => {
      if (!tile.surface) return null;
      const runtime = index.get(tile.id)?.primary() ?? null;
      const scope = runtime ? await readScope(runtime, ITEM_SCOPE_READ_TIMEOUT_MS) : null;
      if (runtime && scope && scope[SURFACE_NOT_LOADED_KEY] !== true) {
        const values = surfaceBrief(getManifest(runtime.surfaceName), scope).values;
        if (Object.keys(values).length === 0) return null;
        if (tile.basics && !tile.basics.stale && JSON.stringify(tile.basics.values) === JSON.stringify(values)) return null;
        return { id: tile.id, basics: { values, at } };
      }
      // Mounted but not loaded: the cheap facts it already has (a table's name and columns), kept as stale.
      if (runtime && scope && !(tile.basics && !tile.basics.stale)) {
        const cheap = surfaceBrief(getManifest(runtime.surfaceName), scope).values;
        if (Object.keys(cheap).length > 0) {
          if (tile.basics && JSON.stringify(tile.basics.values) === JSON.stringify(cheap)) return null;
          return { id: tile.id, basics: { values: cheap, at, stale: true } };
        }
      }
      if (tile.basics) return null;
      return { id: tile.id, basics: addTimeBasics(tile.kind, tile.title, at) };
    }),
  );
  return out.filter((u): u is { id: string; basics: StoredBasics } => u !== null);
}

// ── request two: open an item, act on it ────────────────────────────────────

type Failure = { ok: false; error: string };

function capValue(value: unknown, remaining: number): { value: unknown; truncated?: true; chars: number } {
  const json = JSON.stringify(value) ?? "null";
  const max = Math.min(ITEM_VALUE_MAX_CHARS, Math.max(0, remaining));
  if (json.length <= max) return { value, chars: json.length };
  const text = typeof value === "string" ? value : json;
  return { value: `${text.slice(0, max)}…`, truncated: true, chars: max };
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

/**
 * An item's surface as the agent would get it on the feature's page: its
 * declared values (each with its manifest description) and its controls.
 */
export async function openItemSurface(capture: SurfaceRegistry): Promise<
  | {
      ok: true;
      surface: string;
      label: string;
      about: string;
      values: Record<string, { value: unknown; description: string; truncated?: true }>;
      on_demand_values?: string[];
      /** Present when the item has not loaded: its counts and permissions are unknown, never zero or false. */
      not_loaded_yet?: string;
      write_targets: string[];
      patch_contract?: string;
      client_tools: Array<{
        name: string;
        label: string;
        description: string;
        input_schema: unknown;
        mode: string;
      }>;
      limits: { value_chars: number; total_chars: number };
    }
  | Failure
> {
  const runtime = await waitForCapturedRuntime(capture, ITEM_MOUNT_TIMEOUT_MS);
  if (!runtime) {
    return { ok: false, error: "The item's surface did not mount, so it cannot be read. Try again in a moment." };
  }
  const manifest = getManifest(runtime.surfaceName);
  if (!manifest) {
    return { ok: false, error: `The item's surface "${runtime.surfaceName}" has no registered manifest.` };
  }
  const scope = await readScope(runtime, ITEM_MOUNT_TIMEOUT_MS);
  if (!scope) {
    return { ok: false, error: `The item's values (${runtime.surfaceName}) could not be read. Try again in a moment.` };
  }
  let remaining = ITEM_VALUES_TOTAL_CHARS;
  const values: Record<string, { value: unknown; description: string; truncated?: true }> = {};
  const onDemand: string[] = [];
  for (const declared of manifest.values) {
    const value = scope[declared.name];
    if (isEmpty(value)) continue;
    if (declared.autoContext === false) {
      onDemand.push(declared.name);
      continue;
    }
    const capped = capValue(value, remaining);
    remaining -= capped.chars;
    values[declared.name] = {
      value: capped.value,
      description: declared.description,
      ...(capped.truncated ? { truncated: true as const } : {}),
    };
  }
  const writable = listAgentWritableTargets(capture);
  const tools = listLiveSurfaceClientTools(capture).filter((entry) => entry.hasHandler);
  return {
    ok: true,
    surface: runtime.surfaceName,
    label: manifest.label,
    about: manifest.description,
    values,
    ...(onDemand.length > 0 ? { on_demand_values: onDemand } : {}),
    ...(scope[SURFACE_NOT_LOADED_KEY] === true
      ? {
          not_loaded_yet:
            "This item has not loaded its content yet, so what it holds (counts, columns, permissions) is UNKNOWN, not zero or read-only. Bring it into view or open it, then read it again.",
        }
      : {}),
    write_targets: await describeAgentWritableTargets(writable),
    ...(writable.some(({ target }) => target.patchable)
      ? { patch_contract: surfacePatchContractLine() }
      : {}),
    client_tools: tools.map(({ tool }) => ({
      name: tool.name,
      label: tool.label,
      description: tool.description,
      input_schema: tool.inputSchema,
      mode: tool.mode ?? "ui",
    })),
    limits: { value_chars: ITEM_VALUE_MAX_CHARS, total_chars: ITEM_VALUES_TOTAL_CHARS },
  };
}

export interface ItemAction {
  /** A write target the item declares (from board_open_item's write_targets). */
  target?: string;
  value?: unknown;
  /** Or a client tool the item declares. */
  tool?: string;
  input?: unknown;
}

/**
 * Apply one write target or run one client tool of an item, through the
 * canonical runtimes with the item's capture as `source`. The answer is the
 * same envelope the agent gets for the same action on the feature's page.
 */
export async function actOnItem(
  capture: SurfaceRegistry,
  action: ItemAction,
  call?: SurfaceToolCall,
): Promise<Record<string, unknown>> {
  const runtime = await waitForCapturedRuntime(capture, ITEM_MOUNT_TIMEOUT_MS);
  if (!runtime) {
    return { ok: false, error: "The item's surface did not mount, so nothing can act on it. Nothing was changed." };
  }
  const hasTarget = typeof action.target === "string" && action.target.trim() !== "";
  const hasTool = typeof action.tool === "string" && action.tool.trim() !== "";
  if (hasTarget === hasTool) {
    return { ok: false, error: "Pass exactly one of `target` (with `value`) or `tool` (with `input`). Nothing was changed." };
  }
  if (hasTarget) {
    const target = String(action.target).trim();
    const writable = listAgentWritableTargets(capture);
    if (!writable.some((entry) => entry.target.name === target)) {
      const names = writable.map((entry) => entry.target.name);
      return {
        ok: false,
        error:
          `This item (${runtime.surfaceName}) has no agent-writable target "${target}". ` +
          (names.length > 0 ? `Its targets: ${names.join(", ")}.` : "It has none.") +
          " Nothing was changed.",
      };
    }
    const result = await writeToPageThroughDoor(target, action.value, {
      ...(call?.agentWrite ?? { origin: "agent" as const }),
      source: capture,
    });
    return surfaceWriteToolOutput(target, result, call?.approvedByUser() ?? false).output;
  }
  const tool = String(action.tool).trim();
  const offered = listLiveSurfaceClientTools(capture).filter((entry) => entry.hasHandler);
  if (!offered.some((entry) => entry.tool.name === tool)) {
    const names = offered.map((entry) => entry.tool.name);
    return {
      ok: false,
      error:
        `This item (${runtime.surfaceName}) has no tool "${tool}". ` +
        (names.length > 0 ? `Its tools: ${names.join(", ")}.` : "It has none.") +
        " Nothing ran.",
    };
  }
  const result = await executeSurfaceClientTool(tool, action.input ?? {}, { source: capture, call });
  return result.ok
    ? { ok: true, surface_name: result.surfaceName, output: result.output ?? null }
    : { ok: false, reason: "surface_client_tool_failed", message: result.error };
}
