/**
 * dispatchWarRoomTool — parallels `dispatchUiFirstTool`, but routes
 * `tool_delegated` events for the War Room write tools to their registry-bound
 * handler, GATED behind explicit human approval (HITL).
 *
 * Flow on every `tool_delegated` event with a war-room tool_name:
 *   1. Resolve the bound tile from the conversation (binding-registry). No
 *      binding ⇒ submit a `no_tile_bound` error (never guess a tile to edit).
 *   2. Look up the schema + handler from the registry.
 *   3. Validate args via Zod. On failure: submit a `schema` error result.
 *   4. Flip the instance to `paused` — the honest "waiting on the user" signal
 *      while the approval card is up (same as the ui-first dispatcher; the
 *      /tool_results POST → resume handoff flips it back to `running`).
 *   5. Request approval (a confirm AskCard in the panel's PendingAsksZone):
 *        - approved      → run the handler, submit its result.
 *        - rejected      → submit a non-error `declined` result (the agent
 *                          learns the user said no and can continue/ask).
 *        - instructions  → submit a non-error `declined_with_instructions`
 *                          result carrying the user's typed redirection.
 *        - cancelled     → submit a non-error `declined` (skipped) result.
 *   6. On handler throw: submit a `handler_threw` error result.
 *
 * Every result goes through the single `submitToolResult` funnel so the
 * suspended loop resumes exactly once (see CLIENT_TOOL_SUSPEND_RESUME.md). We
 * never throw — a wedged loop is worse than a surfaced failure.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { toast } from "sonner";
import type { RootState, AppDispatch } from "@/lib/redux/store";
import { extractErrorMessage } from "@/utils/errors";
import { submitToolResult } from "@/features/agents/api/submit-tool-results";
import { setInstanceStatus } from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import { upsertToolLifecycle } from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
import {
  setTileAutoApprove,
  clearTileAutoApprove,
} from "@/features/war-room/redux/slice";
import { selectIsTileAutoApproved } from "@/features/war-room/redux/selectors";
import type { ApprovalChange } from "@/features/agents/ui-first-tools/ui/approval-types";
import { getWarRoomToolEntry } from "../tools/registry";
import { isWarRoomToolName } from "../tools/names";
import { getTileForConversation } from "../binding-registry";
import { requestWarRoomApproval, cascadeAutoApprove } from "./approval";
import { buildApprovalChange } from "./summary";

export interface DispatchWarRoomToolPayload {
  conversationId: string;
  requestId: string;
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export const dispatchWarRoomTool = createAsyncThunk<
  void,
  DispatchWarRoomToolPayload,
  { state: RootState; dispatch: AppDispatch }
>(
  "warRoomTools/dispatch",
  async (
    { conversationId, requestId, callId, toolName, args },
    { dispatch, getState },
  ) => {
    const state = getState();
    const userId = state.userAuth?.id ?? null;

    // Small helpers so every exit goes through the funnel + closes the
    // lifecycle (so the LiveToolCallCard never shimmers waiting forever).
    const fail = (
      errorType: string,
      message: string,
      durationMs?: number,
    ): void => {
      dispatch(
        upsertToolLifecycle({
          requestId,
          callId,
          toolName,
          status: "error",
          isDelegated: true,
          errorType,
          errorMessage: message,
          result: { ok: false, reason: errorType, message },
        }),
      );
      dispatch(
        submitToolResult({
          conversationId,
          call_id: callId,
          tool_name: toolName,
          is_error: true,
          output: { ok: false, reason: errorType, message },
          error_message: message,
          ...(durationMs !== undefined ? { duration_ms: durationMs } : {}),
        }),
      );
    };

    const complete = (
      output: Record<string, unknown>,
      durationMs: number,
    ): void => {
      dispatch(
        upsertToolLifecycle({
          requestId,
          callId,
          toolName,
          status: "completed",
          isDelegated: true,
          result: output,
        }),
      );
      dispatch(
        submitToolResult({
          conversationId,
          call_id: callId,
          tool_name: toolName,
          is_error: false,
          output,
          duration_ms: durationMs,
        }),
      );
    };

    if (!userId) {
      fail("unauthenticated", "user not authenticated");
      return;
    }
    if (!isWarRoomToolName(toolName)) {
      fail("unknown_tool", `Unknown war-room tool: ${toolName}`);
      return;
    }

    const tileId = getTileForConversation(conversationId);
    if (!tileId) {
      // No live War Room panel is bound to this conversation. Refuse rather
      // than guess — editing the wrong tile is far worse than a no-op.
      fail(
        "no_tile_bound",
        "No War Room tile is bound to this conversation; open the tile's Agent panel to enable editing.",
      );
      return;
    }

    const entry = getWarRoomToolEntry(toolName);
    if (!entry) {
      fail("unknown_tool", `Unknown war-room tool: ${toolName}`);
      return;
    }

    const parsed = entry.schema.safeParse(args);
    if (!parsed.success) {
      fail(
        "schema",
        `args failed schema for ${toolName}: ${JSON.stringify(
          parsed.error.format(),
        )}`,
      );
      return;
    }

    // `toolName` is narrowed to WarRoomToolName by the isWarRoomToolName guard
    // above; `parsed.data` is `unknown` from the generic ZodTypeAny schema but
    // is a validated object here. Build the structured change + its diff now, so
    // the auto-approve check and the approval card share one descriptor.
    const change = buildApprovalChange(
      toolName,
      parsed.data as Record<string, unknown>,
      { tileId, getState },
    );
    const scope = change.autoApprove?.scope ?? null;

    // Run the bound writer once approval is settled. Returns true on success so
    // the auto-approve path fires its toast only when the write actually landed.
    const runApprovedHandler = async (): Promise<boolean> => {
      const startedAt = performance.now();
      try {
        const result = await entry.handler.run(parsed.data, {
          conversationId,
          callId,
          userId,
          tileId,
          dispatch,
          getState,
        });
        complete(
          result as Record<string, unknown>,
          Math.round(performance.now() - startedAt),
        );
        return true;
      } catch (cause) {
        fail(
          "handler_threw",
          extractErrorMessage(cause),
          Math.round(performance.now() - startedAt),
        );
        return false;
      }
    };

    // Auto-approve short-circuit: the user already granted "always approve" for
    // this class of edit on this tile. Run immediately — but LOUDLY: a toast
    // names the change and offers one-tap revoke (auto-approve is never silent).
    if (scope && selectIsTileAutoApproved(tileId, scope)(getState())) {
      const ok = await runApprovedHandler();
      if (ok) fireAutoApproveToast(dispatch, tileId, scope, change);
      return;
    }

    // Truthful "waiting on the user" status while the approval card is up.
    dispatch(setInstanceStatus({ conversationId, status: "paused" }));

    const decision = await requestWarRoomApproval({
      conversationId,
      callId,
      tileId,
      change,
      dispatch,
    });

    if (decision.kind === "rejected" || decision.kind === "cancelled") {
      // Non-error: the agent learns the user declined and keeps going.
      complete(
        {
          ok: false,
          declined: true,
          reason: "user_declined",
          message:
            decision.kind === "cancelled"
              ? "The user skipped this change."
              : "The user declined this change.",
        },
        0,
      );
      return;
    }

    if (decision.kind === "instructions") {
      complete(
        {
          ok: false,
          declined: true,
          reason: "user_declined_with_instructions",
          message:
            "The user declined the proposed change and gave instructions instead.",
          instructions: decision.text,
        },
        0,
      );
      return;
    }

    // Approved. If the user asked to stop being asked, persist the grant and
    // instantly clear any sibling cards stacked up for the same scope+tile.
    if (decision.remember && scope) {
      dispatch(setTileAutoApprove({ tileId, scope, value: true }));
      cascadeAutoApprove({
        conversationId,
        tileId,
        scope,
        excludeCallId: callId,
        getState,
      });
    }

    await runApprovedHandler();
  },
);

/** Past-tense verb for the auto-approved-write toast. */
const PAST_TENSE: Record<ApprovalChange["verb"], string> = {
  add: "Added",
  update: "Updated",
  rename: "Renamed",
  complete: "Completed",
  reopen: "Reopened",
  append: "Updated",
};

/**
 * Loud, revocable confirmation that an auto-approved write landed. Auto-approve
 * trades the blocking card for this — never silence.
 */
function fireAutoApproveToast(
  dispatch: AppDispatch,
  tileId: string,
  scope: string,
  change: ApprovalChange,
): void {
  const title = change.title?.trim()
    ? `${PAST_TENSE[change.verb]} ${change.entity}: ${change.title.trim()}`
    : `${PAST_TENSE[change.verb]} ${change.entity}`;
  toast.success(title, {
    description: "Auto-approved — the agent can make these edits on this tile.",
    action: {
      label: "Stop",
      onClick: () => dispatch(clearTileAutoApprove({ tileId, scope })),
    },
  });
}
