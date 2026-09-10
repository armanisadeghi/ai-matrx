"use client";

/**
 * Opener for the `agentRunWindow` overlay.
 *
 * - `useOpenAgentRunWindow()` — imperative hook. Call to open with typed options;
 *   returns a handle with a `close()` method.
 * - `<AgentRunWindowController />` — declarative wrapper. Mount to open,
 *   unmount to close. Equivalent ergonomics to rendering a normal component.
 *
 * Hand-maintained opener — see features/overlays/FEATURE.md.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "agentRunWindow" as const;

export interface OpenAgentRunWindowOptions {
  /** Optional stable instance id. Omit to open an independent chat window. */
  instanceId?: string;
  initialAgentId?: string | null;
  initialSelectedConversationId?: string | null;
  /**
   * Known agent name, if the caller already has it. Shown in the title bar
   * instantly so the user doesn't see a generic "Agent" placeholder while the
   * agent definition (and the full agent list) lazy-loads.
   */
  initialAgentName?: string | null;
  /**
   * Composed intent to pre-fill into the composer. When set, the window opens
   * a FRESH conversation with the agent and seeds this text once (pre-fill
   * only — the user reviews and sends). This is how the Shape studio hands a
   * kind-build brief to the creator agent in-place instead of navigating to
   * `/chat/a/[agentId]`.
   *
   * MUST carry only what the human actually typed — never structured data
   * (a JSON schema, a data sample, an instance payload). Structured content
   * belongs on `initialVariableValues` instead. THE USER-INPUT LAW:
   * common-docs/systems/agent-variable-binding/FEATURE.md.
   */
  initialDraftText?: string | null;
  /**
   * Declared-variable values to seed onto the fresh conversation alongside
   * (or instead of) `initialDraftText` — the structured-content channel for
   * this opener. Filled once, same lifecycle as `initialDraftText`. Keyed by
   * the AGENT's own variable name (verify it's actually declared before
   * passing a value here — an undeclared name is silently dropped).
   */
  initialVariableValues?: Record<string, string> | null;
  /** Start the seeded run immediately after the window opens. */
  initialAutoRun?: boolean;
  /**
   * THE MANDATE DOOR for a chat window. When set, every run in the fresh
   * conversation goes to `/ai/mandates/{key}` and the SERVER resolves the
   * Holder and applies the binding's `config_overrides`; `initialAgentId` then
   * only paints the window (name, avatar, variable panel) and must be the
   * mandate's resolved holder (`useMandate(key).mandate.agentId`). This is how
   * a surface opens a back-and-forth conversation with a fixed job WITHOUT
   * a raw agent UUID in code and without flattening the job's structured
   * `__kind` output into a string — the transcript renders through the ONE
   * canonical pipeline and the person can keep talking.
   */
  mandateKey?: string | null;
  /**
   * Adopt a MOUNTED surface by name for this window's runs — the run reads
   * that surface's live scope and is offered its agent-writable targets
   * (`apply_surface_write`). Omit for the default: a floating chat adopts
   * nothing, because the page underneath is not the subject. Pass it when the
   * conversation IS about the page (a job refining a field the page owns).
   */
  surfaceName?: string | null;
}

export interface AgentRunWindowHandle {
  instanceId: string;
  close: () => void;
}

export function useOpenAgentRunWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenAgentRunWindowOptions = {}): AgentRunWindowHandle => {
      const instanceId =
        opts.instanceId ??
        `${OVERLAY_ID}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          instanceId,
          data: {
            initialAgentId: opts.initialAgentId,
            initialSelectedConversationId: opts.initialSelectedConversationId,
            initialAgentName: opts.initialAgentName,
            initialDraftText: opts.initialDraftText,
            initialVariableValues: opts.initialVariableValues,
            initialAutoRun: opts.initialAutoRun,
            mandateKey: opts.mandateKey ?? undefined,
            surfaceName: opts.surfaceName ?? undefined,
            // ONE PRESS, ONE RUN. A seeded window (draft / variables / auto-run)
            // consumes its seed exactly once per open; a remount of the same
            // instance (HMR, tray restore, a host re-render) must NOT mint a
            // fresh conversation and re-fire the run. A new press mints a new
            // nonce, which is what makes "refine again" a deliberate act.
            seedNonce:
              opts.initialAutoRun ||
              opts.initialDraftText ||
              (opts.initialVariableValues &&
                Object.keys(opts.initialVariableValues).length > 0)
                ? Date.now()
                : undefined,
          },
        }),
      );
      return {
        instanceId,
        close: () =>
          dispatch(closeOverlay({ overlayId: OVERLAY_ID, instanceId })),
      };
    },
    [dispatch],
  );
}

/**
 * Declarative form. Renders nothing visible; opens the overlay on mount,
 * closes it on unmount. Use this when a caller wants to express overlay
 * state declaratively (the way they'd render a normal component).
 */
export function AgentRunWindowController(
  props: OpenAgentRunWindowOptions,
): null {
  const open = useOpenAgentRunWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [
    open,
    props.instanceId,
    props.initialAgentId,
    props.initialSelectedConversationId,
    props.initialAgentName,
    props.initialDraftText,
    props.initialVariableValues,
    props.initialAutoRun,
    props.mandateKey,
    props.surfaceName,
  ]);
  return null;
}
