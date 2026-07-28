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
    // Agent edited a db-authored kind component IN-SESSION (component-builder
    // flows). The row's `updated_at` bumped, but the FE's warm component
    // registry + compile cache only refetch on a mount-triggered
    // `refreshKindComponents` — so any already-rendered `__kind` block keeps
    // showing the STALE compiled component until a hard refresh. Force a
    // registry refetch: the compile cache is keyed on the row's `updated_at`,
    // so the edited row re-keys and recompiles, and the per-kind repaint
    // (`useContentIrKindVersion` → BlockRenderer) re-renders the live block.
    //
    // NOT throttled: an agent makes only a handful of edits per component, and
    // the LAST edit MUST leave the cache fresh — a leading throttle could drop
    // the final refresh and strand stale bytes on screen.
    //
    // NOT static-imported: the content-ir registry cluster has a documented
    // eager-init cycle (component-registry.ts CYCLE-ENTRY ANCHOR); a dynamic
    // import inside `run` keeps it out of the stream processor's init graph.
    id: "kind-components",
    tools: new Set([
      "kindcomp_create_component",
      "kindcomp_update_code",
      "kindcomp_patch_code",
      "kindcomp_update_settings",
    ]),
    run({ result }) {
      void (async () => {
        const { refreshKindComponents } = await import(
          "@/features/content-ir/registry/component-registry"
        );
        // `0` bypasses the 10s rate-limit — an in-session edit must show now.
        await refreshKindComponents(0);
        // Belt-and-suspenders hard-drop of the compile-cache key family, when
        // the tool told us WHICH kind (only `kindcomp_create_component` returns
        // `kind` today; the update/patch/settings tools return `component_id`
        // only, and `refreshKindComponents(0)` alone already re-keys those).
        const kind = asObject(result)?.kind;
        if (typeof kind === "string" && kind) {
          const { invalidateDbKindComponent } = await import(
            "@/features/content-ir/react/db-component/dbKindComponentCache"
          );
          invalidateDbKindComponent(kind);
        }
      })();
    },
  },
  {
    // Agent edited a db-authored TOOL RENDERER in-session (the `toolcomp_*`
    // component-builder tools writing `tool_ui` rows). SAME stale-cache class as
    // the kind-components effect above, DIFFERENT cache: `DbToolRendererImpl`
    // seeds its compiled renderer into local state on mount and never
    // re-fetches, so the warm `toolRendererCache` strands the OLD renderer on
    // screen until a hard refresh. Bust the cache for the edited tool + bump its
    // repaint version so mounted cards (the live chat card AND the admin
    // preview) re-resolve.
    //
    // The cache is keyed by the TARGET tool name (the tool the renderer renders
    // FOR) — which only `toolcomp_create_component` returns today. The
    // update/patch/settings tools return `component_id` only (aidream contract
    // gap), so with no `tool_name` we fall back to a blanket bust — correct, and
    // renderer edits are rare + human-driven. Dynamic import mirrors the
    // kind-components effect (stay out of the stream processor's init graph).
    id: "tool-renderers",
    tools: new Set([
      "toolcomp_create_component",
      "toolcomp_update_code",
      "toolcomp_patch_code",
      "toolcomp_update_settings",
    ]),
    run({ result }) {
      const toolName = asObject(result)?.tool_name;
      void (async () => {
        const cache = await import(
          "@/features/tool-call-visualization/db-renderer/toolRendererCache"
        );
        if (typeof toolName === "string" && toolName) {
          cache.invalidateToolRenderer(toolName);
        } else {
          cache.invalidateAllToolRenderers();
        }
      })();
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
