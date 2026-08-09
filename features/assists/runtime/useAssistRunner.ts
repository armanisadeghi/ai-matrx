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
import type { Json } from "@/types/database.types";
import { decideAssist } from "../service";
import { assistDecided } from "../redux/assistsSlice";
import {
  getAssistAction,
  type AssistActionContext,
  type AssistActionResult,
} from "./assist-action-registry";
import type { Assist } from "../types";

// Built-in capabilities register by side-effect import. New handlers are
// added by importing them here.
import "./handlers/launch-agent";
import "./handlers/navigate";
import "./handlers/surface-write";

export interface AssistRunnerApi {
  /** Execute the assist's action; on success, mark it accepted. */
  acceptAssist: (assist: Assist) => Promise<AssistActionResult>;
  /** Dismiss without running — durable (the producer will not re-emit). */
  dismissAssist: (assist: Assist) => Promise<void>;
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
    }),
    [userId, openAgentRun, router],
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
    async (assist: Assist): Promise<void> => {
      if (!assist.id) return;
      try {
        await decideAssist(assist.id, "dismissed");
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

  return { acceptAssist, dismissAssist };
}
