"use client";

/**
 * Opener for the `impactBatchWindow` overlay — Agent Change Impact's batch
 * panel (I5): a dry run of a proposed change BEFORE a write, or the three-pile
 * census of the agents a write touched AFTER it.
 *
 * - `useOpenImpactBatchWindow()` — imperative hook; returns a `close()` handle.
 * - `<ImpactBatchWindowController />` — declarative; opens on mount, closes on
 *   unmount.
 *
 * Hand-maintained opener — see features/overlays/FEATURE.md. The window
 * module is never imported here (bundle splitting), so the mode/delta shapes
 * are declared on the opener and the window imports them.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "impactBatchWindow" as const;

export type ImpactBatchWindowMode = "dry_run" | "post_batch";

/** Which door the read goes through: the super-admin console door or the
 * per-person `/mandates/impact/mine` door (`ImpactPosture` in impact.ts). */
export type ImpactBatchWindowPosture = "admin" | "mine";

/** The dry run's hypothetical change (CONTRACT `ImpactDelta`, R23). */
export interface ImpactBatchWindowDelta {
  model_id?: string | null;
  settings?: Record<string, unknown> | null;
}

export interface OpenImpactBatchWindowOptions {
  /** The agents the change touches (dry run) or touched (post batch). */
  agentIds: string[];
  mode: ImpactBatchWindowMode;
  /** Dry run only: grade as if this patch were applied. */
  delta?: ImpactBatchWindowDelta | null;
  /** Stamped on every batch written from the window. */
  batchLabel?: string;
  /** One sentence naming the change, for a person. */
  sourceSentence?: string;
  /** Post batch: rung identities (`holder_kind:row_id`) chosen during the dry run. */
  preselectedRungIds?: string[];
  /** Where it was opened from. */
  surfaceName?: string;
  /** Read door. Default `admin`; the post-edit badge (I6) passes `mine`. */
  posture?: ImpactBatchWindowPosture;
  /**
   * Single-agent case (I6): the agent whose edit this panel is about. The
   * panel then also carries its version history and the quick test.
   */
  focusAgentId?: string | null;
}

export interface ImpactBatchWindowHandle {
  close: () => void;
}

export function useOpenImpactBatchWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenImpactBatchWindowOptions): ImpactBatchWindowHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            agentIds: opts.agentIds,
            mode: opts.mode,
            delta: opts.delta ?? null,
            batchLabel: opts.batchLabel,
            sourceSentence: opts.sourceSentence,
            preselectedRungIds: opts.preselectedRungIds,
            surfaceName: opts.surfaceName,
            posture: opts.posture ?? "admin",
            focusAgentId: opts.focusAgentId ?? null,
          },
        }),
      );
      return {
        close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
      };
    },
    [dispatch],
  );
}

/** Declarative form — opens on mount, closes on unmount. */
export function ImpactBatchWindowController(
  props: OpenImpactBatchWindowOptions,
): null {
  const open = useOpenImpactBatchWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
    // Key on the identity fields that change the panel, not on props identity.
  }, [
    open,
    props.mode,
    props.batchLabel,
    props.sourceSentence,
    props.surfaceName,
    props.posture,
    props.focusAgentId,
    props.agentIds.join("|"),
    (props.preselectedRungIds ?? []).join("|"),
    JSON.stringify(props.delta ?? null),
  ]);
  return null;
}
