"use client";

/**
 * useKindActionRunner — binds the host runtime into the pure action registry
 * and returns the ONE function a kind component calls to trigger a capability:
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
 * Importing this module also registers the built-in handlers (side-effect
 * imports below) — that is how the registry is populated on the client.
 */

import { useCallback, useRef } from "react";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import {
  getKindAction,
  type KindActionResult,
} from "./kind-action-registry";

// Side-effect: register the built-in capabilities. New handlers are added by
// importing them here — the seam and the component contract never change.
import "./handlers/trigger-agent";

export type RunKindAction = (
  key: string,
  input: unknown,
) => Promise<KindActionResult>;

export function useKindActionRunner(): RunKindAction {
  const { launchAgent } = useAgentLauncher();
  const userId = useAppSelector(selectUserId);
  const inFlight = useRef<Set<string>>(new Set());

  return useCallback<RunKindAction>(
    async (key, input) => {
      const def = getKindAction(key);
      if (!def) {
        const error = `No action registered for "${key}".`;
        toast.error(error);
        captureError({
          source: "content-ir",
          message: `[kind-action] component invoked unknown action "${key}"`,
          raw: { key },
        });
        return { ok: false, error };
      }

      if (inFlight.current.has(key)) {
        return { ok: false, error: `"${key}" is already running.` };
      }
      inFlight.current.add(key);

      try {
        return await def.handler(input, { launchAgent, userId });
      } catch (err) {
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
        inFlight.current.delete(key);
      }
    },
    [launchAgent, userId],
  );
}
