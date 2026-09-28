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
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { describeAgentWritableTargets } from "@/features/surfaces/runtime/agent-offer";
import {
  SURFACE_BRIEF_MAX_VALUES,
  SURFACE_BRIEF_TEXT_CHARS,
  surfaceBrief,
} from "@/features/surfaces/runtime/surface-brief";
import {
  executeSurfaceClientTool,
  listLiveSurfaceClientTools,
} from "@/features/surfaces/runtime/surface-client-tools";
import { surfacePatchContractLine } from "@/features/surfaces/runtime/surface-write-patch";
import { surfaceWriteToolOutput } from "@/features/surfaces/runtime/surface-write-tool-output";
import {
  applySurfaceWrite,
  listAgentWritableTargets,
} from "@/features/surfaces/runtime/surface-writeback";
import type { SurfaceScopePayload } from "@/features/surfaces/types";

/** Items listed in `board_items`; the rest are counted in `omitted_count`. */
export const BOARD_ITEMS_MAX = 60;
/** All item briefs together stay under this many characters (JSON). */
export const BOARD_ITEMS_BRIEF_BUDGET_CHARS = 6000;
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
  live: boolean;
  parked?: boolean;
  removed?: boolean;
}

export interface BoardItemsOverview {
  live_item_ids: string[];
  item_count: number;
  omitted_count: number;
  items: Array<{
    id: string;
    title: string;
    kind: string;
    surface: string | null;
    live: boolean;
    parked?: true;
    removed?: true;
    basics?: Record<string, unknown>;
    /** Why this item carries no basics. */
    basics_note?: string;
  }>;
  limits: {
    max_items: number;
    basics_values_per_item: number;
    basics_text_chars: number;
    basics_total_chars: number;
  };
}

/** `board_items` — every item, with the basics of every dormant one. */
export async function boardItemsOverview(
  rows: readonly BoardItemRow[],
  index: ItemSurfaceIndex | null,
): Promise<BoardItemsOverview> {
  const listed = rows.slice(0, BOARD_ITEMS_MAX);
  const briefs = await Promise.all(
    listed.map(async (row) => {
      if (row.live || row.parked || row.removed || !row.surface) return null;
      const runtime = index?.get(row.id)?.primary() ?? null;
      if (!runtime) return null;
      const scope = await readScope(runtime, ITEM_SCOPE_READ_TIMEOUT_MS);
      return scope ? surfaceBrief(getManifest(runtime.surfaceName), scope).values : null;
    }),
  );
  let budget = BOARD_ITEMS_BRIEF_BUDGET_CHARS;
  const items = listed.map((row, i) => {
    const base = {
      id: row.id,
      title: row.title,
      kind: row.kind,
      surface: row.surface,
      live: row.live,
      ...(row.parked ? { parked: true as const } : {}),
      ...(row.removed ? { removed: true as const } : {}),
    };
    // A board that keeps no captures (its tiles open nothing) lists identity only.
    if (!row.surface || !index) return base;
    if (row.live) {
      return { ...base, basics_note: "Live: its full surface is in your context as that surface." };
    }
    if (row.parked || row.removed) {
      return { ...base, basics_note: "Off the board: board_open_item brings it back and opens it." };
    }
    const brief = briefs[i];
    if (!brief || Object.keys(brief).length === 0) {
      return { ...base, basics_note: "Not loaded yet: board_open_item reads it." };
    }
    const size = JSON.stringify(brief).length;
    if (size > budget) {
      budget = 0;
      return { ...base, basics_note: "Basics left out (the list's size cap): board_open_item reads it." };
    }
    budget -= size;
    return { ...base, basics: brief };
  });
  return {
    live_item_ids: rows.filter((row) => row.live).map((row) => row.id),
    item_count: rows.length,
    omitted_count: Math.max(0, rows.length - listed.length),
    items,
    limits: {
      max_items: BOARD_ITEMS_MAX,
      basics_values_per_item: SURFACE_BRIEF_MAX_VALUES,
      basics_text_chars: SURFACE_BRIEF_TEXT_CHARS,
      basics_total_chars: BOARD_ITEMS_BRIEF_BUDGET_CHARS,
    },
  };
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
    const result = await applySurfaceWrite(target, action.value, {
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
