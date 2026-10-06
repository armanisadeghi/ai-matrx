"use client";

/**
 * useKindActionRunner — binds the host runtime into the app's ONE action
 * registry (`@ai-matrx/alchemy`, provider `content-ir.kind-actions`) and
 * returns the ONE function a kind component calls to trigger a capability:
 * `runAction(key, input) => Promise<KindActionResult>`.
 *
 * This is the safety choke point that makes "trigger anything" safe to hand to
 * imperfect, agent-authored component code:
 *
 *  - It NEVER throws. An unknown action key, a handler that rejects, a bad
 *    input — all resolve to a `{ ok:false, error }` envelope plus a toast and a
 *    captured error. A component that mis-calls it keeps rendering.
 *  - It binds ONLY the capability-scoped context (the launcher, the acting
 *    user). The component never receives supabase, redux, or fetch — the
 *    sandbox data-reach boundary is untouched. Side effects run here, in the
 *    host, gated by the host.
 *  - It guards duplicate in-flight calls per action key, so a double-click or a
 *    re-render storm can't fire an agent (spend) twice.
 *
 * The provider is registered on the registry from a layout effect (and again,
 * idempotently, at run time); `key` runs the programmatic registry Action
 * `kind.<key>` through alchemy's `invokeAction`.
 */

import { useCallback, useLayoutEffect, useRef } from "react";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  emitKindInteraction,
  type KindInteractionEvent,
} from "../kind-interaction";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useAgentLauncher } from "@ai-matrx/chat/agents/hooks/useAgentLauncher";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import type { KindActionContext, KindActionResult } from "./kind-action-context";
import { kindActionId, kindActionProvider } from "./kind-action-provider";
import { invokeAction } from "@ai-matrx/alchemy/actions";
import { useOptionalAlchemyActions } from "@ai-matrx/alchemy/react/host";
import { ensureInvokedProvider } from "./invoked-actions";

export type RunKindAction = (
  key: string,
  input: unknown,
) => Promise<KindActionResult>;

/**
 * The in-flight identity for the double-fire guard.
 *
 * Keying by action key ALONE turns one slow action into a global lock: an
 * `apply_surface_write` whose policy is `ask` holds the key for as long as the
 * user reads the dialog, and every OTHER write from every block on every
 * surface is refused meanwhile. So the guard keys by action + target when the
 * input names one. Still per-target-idempotent (a double-click can't fire an
 * agent or a write twice), without the cross-talk.
 */
function inFlightKey(key: string, input: unknown): string {
  if (input && typeof input === "object") {
    const target = (input as { target?: unknown }).target;
    if (typeof target === "string" && target) return `${key}::${target}`;
    const agentId = (input as { agentId?: unknown }).agentId;
    if (typeof agentId === "string" && agentId) return `${key}::${agentId}`;
  }
  return key;
}

/**
 * `origin` — the shape in a chat answer this runner acts for. When given, a
 * write the person applies to a surface (`apply_surface_write`) also rides
 * their next message as the shape's interaction chip (kind-interaction.ts).
 */
export type KindActionOrigin = Omit<KindInteractionEvent, "state" | "previous" | "data">;

export function useKindActionRunner(origin?: KindActionOrigin): RunKindAction {
  const dispatch = useAppDispatch();
  const originRef = useRef(origin);
  originRef.current = origin;
  const { launchAgent } = useAgentLauncher();
  const userId = useAppSelector(selectUserId);
  const inFlight = useRef<Set<string>>(new Set());
  const actions = useOptionalAlchemyActions();
  const registry = actions?.registry ?? null;
  const ports = actions?.ports ?? null;
  useLayoutEffect(() => {
    if (registry) ensureInvokedProvider(registry, kindActionProvider);
  }, [registry]);

  return useCallback<RunKindAction>(
    async (key, input) => {
      if (!registry || !ports) {
        // Rendered outside the app's action host: honest, never a crash.
        const error = `"${key}" can't run here: actions aren't available on this page.`;
        toast.error(error);
        captureError({
          source: "content-ir",
          message: `[kind-action] "${key}" invoked outside <AlchemyActionsProvider>`,
          raw: { key },
        });
        return { ok: false, error };
      }
      ensureInvokedProvider(registry, kindActionProvider);
      const guardKey = inFlightKey(key, input);
      if (inFlight.current.has(guardKey)) {
        return { ok: false, error: `"${key}" is already running.` };
      }
      inFlight.current.add(guardKey);

      try {
        const context: KindActionContext = { launchAgent, userId };
        const outcome = await invokeAction<KindActionResult>(
          registry,
          kindActionId(key),
          input,
          { ports, context },
        );
        if (!outcome.ok && outcome.error.code === "not_registered") {
          const error = `No action registered for "${key}".`;
          toast.error(error);
          captureError({
            source: "content-ir",
            message: `[kind-action] component invoked unknown action "${key}"`,
            raw: { key },
          });
          return { ok: false, error };
        }
        if (!outcome.ok) {
          const message = outcome.error.message || `Action "${key}" failed.`;
          // `action_failed` is already captured + announced once by alchemy's
          // invokeAction (ports.notify); announce here only otherwise.
          if (outcome.error.code !== "action_failed" || !ports.notify) toast.error(message);
          captureError({
            source: "content-ir",
            message: `[kind-action] action "${key}" failed (${outcome.error.code}): ${message}`,
            raw: { key, error: outcome.error },
          });
          return { ok: false, error: message };
        }
        const result = outcome.data;
        const at = originRef.current;
        if (result.ok && key === "apply_surface_write" && at) {
          const written = result.result as { surfaceName?: string } | undefined;
          const target = (input as { target?: unknown } | null)?.target;
          void dispatch(
            emitKindInteraction({
              ...at,
              kind: "surface_write",
              state: {
                written: [typeof target === "string" ? target : null, written?.surfaceName ? `on ${written.surfaceName}` : null]
                  .filter(Boolean)
                  .join(" "),
              },
            }),
          );
        }
        return result;
      } catch (err) {
        // invokeAction never throws; this guards the guard.
        const message =
          err instanceof Error ? err.message : `Action "${key}" failed.`;
        toast.error(message);
        captureError({
          source: "content-ir",
          message: `[kind-action] action "${key}" threw: ${message}`,
          raw: { key, error: err },
        });
        return { ok: false, error: message };
      } finally {
        inFlight.current.delete(guardKey);
      }
    },
    [launchAgent, userId, dispatch, registry, ports],
  );
}
