/**
 * `update_plan` handler — persists a proposed plan, awaits approval via a
 * dedicated PendingAsk (kind='plan_approval'), then patches status to
 * approved/rejected. On approval, auto-populates cx_agent_task with one
 * task per step linked back to the plan via `plan_id`.
 */

import type { ToolHandler } from "./types";
import type { UpdatePlanArgs } from "../tools/schemas";
import { EMPTY_ASK_RESPONSE, type AskUserResponse } from "../tools/schemas";
import type { PlanResultEnvelope } from "../tools/types";
import { createPlan, setPlanStatus } from "../service/agent-plan.service";
import { addTasks } from "../service/agent-task.service";
import {
  enqueuePendingAsk,
  resolvePendingAsk,
  sweepPendingAsks,
} from "../redux/pending-asks.slice";
import {
  registerAskResolver,
  expireAskByCallId,
} from "../redux/ask-resolver-registry";
import { upsertPlan } from "../redux/agent-lists.slice";

export const updatePlanHandler: ToolHandler<
  UpdatePlanArgs,
  PlanResultEnvelope
> = {
  name: "update_plan",
  async run(args, ctx) {
    const { callId, conversationId, userId, dispatch } = ctx;

    const steps = args.steps ?? args.approach ?? [];
    const title = args.title ?? "Plan";

    // Persist as proposed up front so the panel can render the plan even
    // before approval. If persistence fails we still try to render the card,
    // but emit ok:false in the result envelope so the model sees the failure.
    let planRow: Awaited<ReturnType<typeof createPlan>> | null = null;
    try {
      planRow = await createPlan({
        conversation_id: conversationId,
        user_id: userId,
        title,
        steps,
        reasoning: args.reasoning ?? null,
        domains: args.domains ?? null,
        estimated_minutes: args.estimated_minutes ?? null,
      });
      dispatch(upsertPlan(planRow));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[update_plan] failed to persist proposed plan", e);
    }

    const expiresAtMs =
      typeof args.timeout_seconds === "number"
        ? Date.now() + args.timeout_seconds * 1000
        : undefined;

    dispatch(
      enqueuePendingAsk({
        callId,
        conversationId,
        toolName: "update_plan",
        kind: "plan_approval",
        question: "Approve this plan?",
        options: [{ label: "Approve" }, { label: "Reject" }],
        plan: {
          title,
          steps,
          reasoning: args.reasoning,
          estimated_minutes: args.estimated_minutes,
        },
        expiresAtMs,
        status: "pending",
        createdAtMs: Date.now(),
      }),
    );

    const response: AskUserResponse = await new Promise<AskUserResponse>(
      (resolve) => {
        registerAskResolver(callId, resolve);
        if (expiresAtMs) {
          const ms = expiresAtMs - Date.now();
          if (ms > 0) {
            setTimeout(() => expireAskByCallId(callId), ms);
          } else {
            resolve({ ...EMPTY_ASK_RESPONSE, timed_out: true });
          }
        }
      },
    );

    dispatch(resolvePendingAsk({ callId, conversationId }));
    queueMicrotask(() => {
      setTimeout(() => dispatch(sweepPendingAsks(conversationId)), 250);
    });

    if (response.cancelled || response.timed_out) {
      return {
        ok: true,
        plan: planRow
          ? {
              id: planRow.id,
              title: planRow.title,
              steps: planRow.steps,
              status: planRow.status,
              reasoning: planRow.reasoning,
            }
          : null,
        status: planRow?.status ?? null,
        cancelled: response.cancelled,
        timed_out: response.timed_out,
      };
    }

    const approved =
      response.confirmed === true ||
      response.selected?.[0] === "Approve" ||
      response.action === "Approve";

    if (!planRow) {
      return {
        ok: false,
        plan: null,
        status: null,
        cancelled: false,
        timed_out: false,
      };
    }

    const nextStatus = approved ? "approved" : "rejected";
    let finalRow = planRow;
    try {
      finalRow = await setPlanStatus(planRow.id, nextStatus);
      dispatch(upsertPlan(finalRow));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[update_plan] setPlanStatus failed", e);
    }

    if (approved && steps.length > 0) {
      try {
        await addTasks(
          steps.map((title) => ({
            conversation_id: conversationId,
            user_id: userId,
            title,
            status: "pending",
            created_by: "agent",
            plan_id: planRow!.id,
          })),
        );
        // Realtime broadcast will refresh the tasks slice — no manual dispatch.
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(
          "[update_plan] failed to auto-populate tasks from plan steps",
          e,
        );
      }
    }

    return {
      ok: true,
      plan: {
        id: finalRow.id,
        title: finalRow.title,
        steps: finalRow.steps,
        status: finalRow.status,
        reasoning: finalRow.reasoning,
      },
      status: finalRow.status,
      cancelled: false,
      timed_out: false,
    };
  },
};
