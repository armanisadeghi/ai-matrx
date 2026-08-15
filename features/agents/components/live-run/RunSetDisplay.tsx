"use client";

/**
 * RunSetDisplay — THE canonical surface for MANY live agent runs (plus
 * non-stream data payloads) displayed together, in order.
 *
 * Built ground-up for the multi-call surface: a pipeline that fires one
 * agent per phase, a batch that runs one agent per node, a research tab
 * whose run sits beside provider API results. Each entry renders through
 * the ONE canonical pipeline — `LiveRunDisplay` per run (retention, status,
 * kind components all included) and `MarkdownStream serverProcessedBlocks`
 * per data payload. No bespoke stream handling anywhere.
 *
 * State lives in the `runSets` slice keyed by the caller's stable `setKey`,
 * NOT in this component — a remount re-attaches to every run the surface was
 * displaying (the disappearing-run class this kills is documented in
 * features/agents/docs/LIVE_RUN_RETENTION.md § Multi-run surfaces). Register
 * runs with `addRunToSet` from the launcher hook's `onAdopted`, add API
 * payloads with `addDataToSet`, and `clearRunSet` ONLY when the user starts a
 * new logical session — never on unmount.
 *
 * FLOATING LAW note (features/window-panels/FEATURE.md): inline mounting of
 * live output must guarantee zero page shift. Mount this at the BOTTOM of a
 * surface (page grows downward only) or inside a fixed-size window body.
 */

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import MarkdownStream from "@/components/MarkdownStream";
import { cn } from "@/lib/utils";

import { LiveRunDisplay } from "./LiveRunDisplay";
import { selectRunSetEntries } from "@/features/agents/redux/execution-system/run-sets/run-sets.slice";
import {
  addDataToSet,
  addRunToSet,
  clearRunSet,
  removeRunSetEntry,
} from "@/features/agents/redux/execution-system/run-sets/run-sets.thunks";
import { useFloatingLiveRun } from "@/features/overlays/openers/liveRunWindow";

export interface RunSetDisplayProps {
  /** Stable identity of this surface's set ("keyword-research:brain:org123"). */
  setKey: string;
  className?: string;
  /** Per-entry frame. "card" (default) gives each run its own bordered
   * frame; "bare" for hosts that already draw chrome per entry. */
  variant?: "card" | "bare";
  /** Allow the user to dismiss individual entries (default true). */
  dismissible?: boolean;
}

/**
 * Renders nothing when the set is empty — safe to mount unconditionally at
 * the bottom of any surface.
 */
export function RunSetDisplay({
  setKey,
  className,
  variant = "card",
  dismissible = true,
}: RunSetDisplayProps) {
  const dispatch = useAppDispatch();
  const entries = useAppSelector((state) => selectRunSetEntries(state, setKey));

  if (entries.length === 0) return null;

  return (
    <div className={cn("grid gap-3", className)}>
      {entries.map((entry) =>
        entry.kind === "run" ? (
          <LiveRunDisplay
            key={entry.id}
            requestId={entry.requestId}
            label={entry.label}
            variant={variant}
            onDismiss={
              dismissible
                ? () => dispatch(removeRunSetEntry({ setKey, id: entry.id }))
                : undefined
            }
          />
        ) : (
          <div
            key={entry.id}
            className={
              variant === "card"
                ? "rounded-lg border border-border bg-card p-3"
                : undefined
            }
          >
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">
              {entry.label}
            </p>
            <MarkdownStream
              serverProcessedBlocks={[entry.block]}
              hideCopyButton
            />
          </div>
        ),
      )}
    </div>
  );
}

/**
 * Imperative controls for a surface's run set. Launcher hooks call
 * `addRun` from `adoptForeignStream`'s `onAdopted`; `clear` starts a new
 * logical session. Thin dispatch wrappers — state stays in Redux.
 */
export function useRunSet(setKey: string) {
  const dispatch = useAppDispatch();
  const entries = useAppSelector((state) => selectRunSetEntries(state, setKey));
  return {
    entries,
    addRun: (requestId: string, label: string) =>
      dispatch(addRunToSet({ setKey, requestId, label })),
    addData: (
      id: string,
      label: string,
      block: Parameters<typeof addDataToSet>[0]["block"],
    ) => dispatch(addDataToSet({ setKey, id, label, block })),
    remove: (id: string) => dispatch(removeRunSetEntry({ setKey, id })),
    clear: () => dispatch(clearRunSet(setKey)),
  };
}

export interface RunSetWindowControllerProps {
  /** Stable Redux identity for every run rendered in this window. */
  setKey: string;
  /** Stable overlay identity so host remounts re-bind one existing window. */
  instanceId: string;
  label: string;
  /** Opens before adoption while the first request id is still pending. */
  active?: boolean;
  width?: number | string;
  height?: number | string;
}

/**
 * Floating-law host for a run set. The window reads request ids from Redux,
 * so a remounted caller needs no component-local handle to re-show every run.
 */
export function RunSetWindowController({
  setKey,
  instanceId,
  label,
  active,
  width,
  height,
}: RunSetWindowControllerProps): null {
  const entries = useAppSelector((state) => selectRunSetEntries(state, setKey));
  useFloatingLiveRun({
    active: (active ?? false) || entries.length > 0,
    instanceId,
    runSetKey: setKey,
    label,
    width,
    height,
  });
  return null;
}
