"use client";

/**
 * useAssistRunner — the ONE hook a chip calls to accept or dismiss an assist.
 *
 * Safety posture (mirrors useKindActionRunner): never throws into UI code;
 * unknown action kind → toast + captureError + {ok:false}; handler rejection
 * caught. On success the ledger row is decided with a receipt; an assist with
 * no id (an inline, ephemeral chip) runs its action and skips persistence.
 */

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { useOpenAgentRunWindow } from "@/features/overlays/openers/agentRunWindow";
import { callApi } from "@/lib/api/call-api";
import type { Json } from "@/types/database.types";
import { decideAssist, snoozeAssist } from "../service";
import { snoozeUntilIso, type SnoozeWindowKey } from "../constants";
import { assistDecided } from "../redux/assistsSlice";
import {
  getAssistAction,
  type AssistActionContext,
  type AssistActionResult,
} from "./assist-action-registry";
import type { Assist } from "../types";

// Built-in capabilities register by side-effect import. New handlers are
// added by importing them here.
import "./handlers/apply-page-meta";
import "./handlers/launch-agent";
import "./handlers/navigate";
import "./handlers/server-action";
import "./handlers/surface-write";

export interface AssistRunnerApi {
  /** Execute the assist's action; on success, mark it accepted. */
  acceptAssist: (assist: Assist) => Promise<AssistActionResult>;
  /**
   * Dismiss without running — durable (the producer will not re-emit).
   * An optional `note` records WHY in the user's own words; it is written only
   * when supplied, so a later plain dismiss never erases one.
   */
  dismissAssist: (assist: Assist, note?: string) => Promise<void>;
  /**
   * "Not now, but ask me again" — goes quiet for a window WITHOUT deciding, so
   * the producer still treats the thing as un-answered and the chip returns on
   * its own. The middle rung kg-suggestions had (defer) and assists lacked:
   * without it, the only way to clear a chip you cannot act on today was to
   * kill it forever.
   */
  snoozeAssist: (assist: Assist, window?: SnoozeWindowKey) => Promise<void>;
}

export function useAssistRunner(): AssistRunnerApi {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  const openAgentRun = useOpenAgentRunWindow();

  const ctx: AssistActionContext = useMemo(
    () => ({
      userId: userId ?? null,
      openAgentRun,
      navigate: (href: string) => router.push(href),
      callServer: async (endpoint, body) => {
        const result = await dispatch(
          callApi({
            // The endpoint is allow-listed by the server_action handler before
            // it ever reaches here; the generated `paths` type cannot express
            // a runtime-chosen path, so this one cast is deliberate and is the
            // only place it happens.
            path: endpoint as never,
            method: "POST",
            body: (body ?? {}) as never,
          }),
        );
        if (result.error) {
          return {
            ok: false,
            error:
              result.error.message ||
              "The server could not complete that action.",
          };
        }
        return { ok: true, data: result.data };
      },
    }),
    [userId, openAgentRun, router, dispatch],
  );

  const acceptAssist = useCallback(
    async (assist: Assist): Promise<AssistActionResult> => {
      const def = getAssistAction(assist.action.kind);
      if (!def) {
        const message = `Assist action "${assist.action.kind}" is not registered`;
        toast.error(message);
        captureError({
          source: "assists",
          message,
          details: `assist=${assist.id} source=${assist.sourceKey}`,
        });
        return { ok: false, error: message };
      }
      let outcome: AssistActionResult;
      try {
        outcome = await def.handler(assist, ctx);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Assist action failed";
        outcome = { ok: false, error: message };
      }
      if (!outcome.ok) {
        toast.error(outcome.error);
        captureError({
          source: "assists",
          message: `Assist ${assist.sourceKey} failed: ${outcome.error}`,
          details: `assist=${assist.id}`,
        });
        return outcome;
      }
      if (assist.id) {
        try {
          await decideAssist(
            assist.id,
            "accepted",
            (outcome.result ?? null) as Json,
          );
          dispatch(assistDecided(assist.id));
        } catch (error) {
          // The action ran; a failed receipt write must not undo the UX.
          captureError({
            source: "assists",
            message: `Assist ${assist.id} accepted but receipt write failed`,
            details: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return outcome;
    },
    [ctx, dispatch],
  );

  const dismissAssist = useCallback(
    async (assist: Assist, note?: string): Promise<void> => {
      if (!assist.id) return;
      try {
        await decideAssist(assist.id, "dismissed", undefined, note);
        dispatch(assistDecided(assist.id));
      } catch (error) {
        toast.error("Could not dismiss — try again");
        captureError({
          source: "assists",
          message: `Assist ${assist.id} dismiss failed`,
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [dispatch],
  );

  const snooze = useCallback(
    async (assist: Assist, window: SnoozeWindowKey = "7d"): Promise<void> => {
      if (!assist.id) return;
      try {
        await snoozeAssist(assist.id, snoozeUntilIso(window));
        dispatch(assistDecided(assist.id));
      } catch (error) {
        toast.error("Could not snooze — try again");
        captureError({
          source: "assists",
          message: `Assist ${assist.id} snooze failed`,
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [dispatch],
  );

  return { acceptAssist, dismissAssist, snoozeAssist: snooze };
}
