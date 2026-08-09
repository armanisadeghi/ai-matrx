"use client";

/**
 * toolStateEffects — tool completion → global-state refresh.
 *
 * THE PROBLEM THIS KILLS: an agent tool call mutates an entity the user is
 * looking at RIGHT NOW (a note open in the editor, the tasks board), but the
 * entity's Redux state never hears about it — the user had to hard-refresh
 * the page to see the agent's change.
 *
 * THE MODEL: when a tool completes, the stream processor (`process-stream.ts`,
 * the ONE place every `tool_completed` event flows through) calls
 * `runToolStateEffects`. A small registry maps tool names → an invalidation
 * effect that dispatches the entity's OWN canonical refetch thunk. Effects run
 * at the Redux layer, NOT in tool-card components — a card may be collapsed,
 * batched, pruned, or never mounted (`hideToolResults`), and the state must
 * refresh regardless.
 *
 * RULES for effects:
 *  - Dispatch the entity's existing canonical refetch thunk — never write
 *    entity state directly from here, and never fork a parallel fetch path.
 *  - Refetches must be safe against user edits (e.g. `refreshNoteContent`
 *    skips dirty notes). If the entity's thunk isn't safe, fix the thunk.
 *  - List-level refetches are throttled (an agent firing 10 note edits in a
 *    turn must not trigger 10 list fetches).
 *  - NEVER throw — a failed effect logs loudly and the stream keeps flowing.
 *
 * ADDING AN ENTITY: one entry in `TOOL_STATE_EFFECTS` — tool names + a `run`
 * that dispatches the feature's refetch thunk(s). Known not-yet-covered
 * writers (no canonical Redux refetch today, or their state is hook-local):
 * picklist (session-cached `usePicklistDetail`), dictionary, workbook,
 * dataset/usertable, document. The working document is already reconciled by
 * its own `context_changed` re-read; the scratchpad is agent-readonly.
 */

import type { RootState } from "@/lib/redux/store";
import {
  refreshNoteContent,
  fetchNotesList,
} from "@/features/notes/redux/thunks";
import { loadProjectsWithTasks } from "@/features/tasks/redux/thunks";
import {
  INVALIDATION_KEYS,
  fireInvalidation,
} from "@/lib/invalidation/invalidation-registry";

/** The stream processor's dispatch is intentionally loose — it forwards
 *  actions AND thunks. This structural type matches what it actually is. */
type LooseDispatch = (action: unknown) => unknown;

export interface ToolEffectContext {
  toolName: string;
  /** The agent's call arguments (may be {} when they never streamed). */
  args: Record<string, unknown>;
  /** The completed tool's result, verbatim. */
  result: unknown;
  dispatch: LooseDispatch;
  getState: () => RootState;
}

interface ToolStateEffect {
  /** Stable id — used for logging + throttle keys. */
  id: string;
  /** Tool names (as-called) this effect reacts to. */
  tools: ReadonlySet<string>;
  run: (ctx: ToolEffectContext) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Pure-read actions — a tool call that only READ the entity changes nothing,
 *  so don't burn a refetch on it. Matched against `args.action` / `args.mode`. */
const READ_ACTIONS = new Set(["get", "read", "list", "search", "batch"]);

function isReadOnlyCall(args: Record<string, unknown>): boolean {
  const action = args.action ?? args.mode;
  return typeof action === "string" && READ_ACTIONS.has(action.toLowerCase());
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Trailing throttle for list-level refetches — at most one per `ms` per key. */
const lastRunAt = new Map<string, number>();
function throttled(key: string, ms: number, fn: () => void): void {
  const now = Date.now();
  const last = lastRunAt.get(key) ?? 0;
  if (now - last < ms) return;
  lastRunAt.set(key, now);
  fn();
}

const LIST_REFETCH_THROTTLE_MS = 2_000;

// ─── The registry ────────────────────────────────────────────────────────────

const TOOL_STATE_EFFECTS: ToolStateEffect[] = [
  {
    // Agent saved/edited a note → refresh the open note (dirty-guarded — a
    // user's unsaved edits are never clobbered) + the list (labels, ordering,
    // creations, deletions). Result shapes (per `toolArtifact.ts`):
    // `note` → { id, label } · `war_room_update_note` → { note: { id, label } }.
    id: "notes",
    tools: new Set(["note", "war_room_update_note"]),
    run({ result, dispatch }) {
      const obj = asObject(result);
      const noteObj = asObject(obj?.note) ?? obj;
      const id = typeof noteObj?.id === "string" ? noteObj.id : null;
      if (id) void dispatch(refreshNoteContent(id));
      throttled(`notes-list`, LIST_REFETCH_THROTTLE_MS, () => {
        void dispatch(fetchNotesList());
      });
    },
  },
  {
    // Agent created/updated a real task (ctx_tasks) → invalidate + refetch the
    // full projects/tasks context (the canonical tasks reload).
    id: "tasks",
    tools: new Set(["task"]),
    run({ dispatch }) {
      throttled(`tasks-context`, LIST_REFETCH_THROTTLE_MS, () => {
        void dispatch(loadProjectsWithTasks({ force: true }));
      });
    },
  },
  {
    // Agent authored/edited a DB tool renderer (`tool_ui` row via toolcomp_*)
    // → drop the tool's compiled renderer + meta so mounted cards repaint with
    // the new code (D115). NO import edge into the db-renderer chunk: the fire
    // goes through the tiny invalidation registry; the chunk registered its
    // callback at its own init (not loaded ⇒ nothing stale ⇒ no-op by design).
    // Targeting: `tool_name` when the call/result names it; several writes
    // return only a `component_id` — then the callback invalidates ALL cached
    // renderers (cheap session cache, refetch is per-tool on view).
    id: "db-tool-renderers",
    tools: new Set([
      "toolcomp_create_component",
      "toolcomp_update_code",
      "toolcomp_patch_code",
      "toolcomp_update_settings",
      "toolcomp_resolve_incident",
    ]),
    run({ args, result }) {
      const obj = asObject(result);
      const candidate =
        obj?.tool_name ?? asObject(obj?.component)?.tool_name ?? args.tool_name;
      const toolName = typeof candidate === "string" ? candidate : null;
      fireInvalidation(
        INVALIDATION_KEYS.dbToolRenderers,
        toolName ? { toolName } : undefined,
      );
    },
  },
  {
    // Agent authored/edited a DB kind component (`content_ir.kind_component`
    // via kindcomp_*) → force-refresh the content-ir component resolver so
    // mounted `__kind` blocks recompile + repaint (D115). Same inversion:
    // fired by name; content-ir's registry cluster registered the callback at
    // its own init. Kind targeting is unnecessary — the refresh replaces the
    // db tier wholesale and downstream repaint is per-kind granular.
    id: "kind-components",
    tools: new Set([
      "kindcomp_create_component",
      "kindcomp_update_code",
      "kindcomp_patch_code",
      "kindcomp_update_settings",
      "kindcomp_resolve_incident",
    ]),
    run() {
      fireInvalidation(INVALIDATION_KEYS.kindComponents);
    },
  },
];

// ─── The runner ──────────────────────────────────────────────────────────────

/**
 * Run every matching state effect for a COMPLETED tool call. Called from the
 * stream processor's `tool_completed` branch. Never throws.
 */
export function runToolStateEffects(ctx: ToolEffectContext): void {
  for (const effect of TOOL_STATE_EFFECTS) {
    if (!effect.tools.has(ctx.toolName)) continue;
    if (isReadOnlyCall(ctx.args)) continue;
    try {
      effect.run(ctx);
    } catch (error) {
      // Loud, but never let a refresh effect break stream processing.
      console.error(
        `[toolStateEffects] effect "${effect.id}" failed for tool "${ctx.toolName}"`,
        error,
      );
    }
  }
}
