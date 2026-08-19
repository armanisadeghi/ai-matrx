/**
 * `war_room_message_thread` handler — message one thread's agent, then open a
 * LIVE-WATCH window + toast so the user sees it happen and can step in.
 *
 * Two modes (the user's design — NOTIFY-AND-WATCH, never approve-each):
 *
 *   • "fresh" (default) — start a NEW conversation for the thread's agent,
 *     seeded with the thread's OWN read-only context (its task / notes / files
 *     via `buildThreadAgentContextEntries`) plus the master's message. No prior
 *     chat history. Recipe = the spec's FRESH INSTANCE path:
 *       createManualInstance({ agentId: <war_room.thread mandate>,
 *         apiEndpointMode:"agent", allowChat:true })
 *       → setContextEntries(tile entries) → setUserInputText → executeInstance.
 *
 *   • "fork" — branch the thread's EXISTING conversation (full history) via
 *     `forkConversationServer`, then send the message on the fork. Recipe = the
 *     spec's FORK path. Requires the thread to already have a conversation.
 *
 * After firing EITHER path: dispatch `openWatch(newConversationId)` and a toast
 * carrying a "Watch" action (which also opens the watch window). `executeInstance`
 * awaits the full stream (it returns at stream end via runAiStream), so by the
 * time it resolves the agent's reply is already in Redux — we read it back for a
 * concise tool result. We never throw: a failed thread run becomes an `ok:false`
 * result the master can reason about.
 *
 * AGENT: the thread agent resolves from the `war_room.thread` AGENT MANDATE — the
 * dedicated Thread persona that every tile "Agent+" panel defaults to (knows
 * its thread role and can list/read the user's data via the `data` tool), or
 * whatever the admin/user has bound in its place. When the master/room
 * delegates a message into a thread, the thread answers as that same persona.
 * A mandate that will not resolve returns `ok:false` to the master — it never
 * falls back to a hardcoded id.
 */

import { toast } from "@/lib/toast";
import type { WarRoomMasterToolHandler } from "./types";
import type {
  WarRoomMessageThreadArgs,
  WarRoomMessageThreadResult,
} from "../tools/schemas";
import { resolveThread } from "../service/threadResolver";
import { messageRecordToText } from "../service/messageText";
import { openWatch } from "@/features/war-room/redux/watchSlice";
import { loadWarRoomSession } from "@/features/war-room/redux/thunks";
import { listRoomIdsForThread } from "@/features/war-room/service/associations";
import { buildThreadAgentContextEntries } from "@/features/war-room/service/warRoomAgentContext";
import { selectThreadById } from "@/features/war-room/redux/selectors";
import { WAR_ROOM_THREAD_AGENT_MANDATE } from "@/features/war-room/constants";
import { resolveMandate } from "@/features/agents/mandates/service";
import { createManualInstance } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { executeInstance } from "@/features/agents/redux/execution-system/thunks/execute-instance.thunk";
import { forkConversationServer } from "@/features/agents/redux/execution-system/message-crud/server/fork-conversation-server.thunk";
import { setContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import { setUserVariableValues } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { selectConversationMessages } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import type { ThunkDispatch } from "redux-thunk";
import type { UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";

type Dispatch = ThunkDispatch<RootState, unknown, UnknownAction>;

/** The most recent assistant reply text on a conversation, or undefined. */
function latestAssistantReply(
  getState: () => RootState,
  conversationId: string,
): string | undefined {
  const msgs = selectConversationMessages(conversationId)(getState());
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "assistant") {
      const text = messageRecordToText(msgs[i]);
      if (text) return text;
    }
  }
  return undefined;
}

/** Open the watch window + notify, with a "Watch" action that re-opens it. */
function notifyAndWatch(
  dispatch: Dispatch,
  conversationId: string,
  threadLabel: string,
): void {
  dispatch(openWatch(conversationId));
  toast.success(`Master agent is messaging "${threadLabel}"`, {
    description: "Watch the thread agent respond, and step in anytime.",
    action: {
      label: "Watch",
      onClick: () => dispatch(openWatch(conversationId)),
    },
  });
}

export const messageThreadHandler: WarRoomMasterToolHandler<
  WarRoomMessageThreadArgs,
  WarRoomMessageThreadResult
> = {
  name: "war_room_message_thread",
  async run(args, ctx) {
    const { dispatch, getState } = ctx;
    const mode = args.mode ?? "fresh";

    const resolved = await resolveThread(args.thread_id);
    if (!resolved) {
      return {
        ok: false,
        thread_id: args.thread_id,
        mode,
        message:
          "Unknown thread — no tile with that id is visible to you. Use a " +
          "thread_id from war_room.",
      };
    }

    const thread = resolved.thread;
    const threadLabel = thread.title?.trim() || "thread";

    // ── FORK ────────────────────────────────────────────────────────────
    if (mode === "fork") {
      if (!resolved.conversationId) {
        return {
          ok: false,
          thread_id: args.thread_id,
          mode,
          message:
            "This thread has no existing conversation to fork. Send with " +
            "mode='fresh' to start one.",
        };
      }
      try {
        const fork = await dispatch(
          forkConversationServer({
            conversationId: resolved.conversationId,
          }),
        ).unwrap();
        const forkId = fork.conversationId;

        // Watch + notify BEFORE the run so the window is up as the stream lands.
        notifyAndWatch(dispatch, forkId, threadLabel);

        // KNOWN PLATFORM GAP (THE USER-INPUT LAW, ledgered in FOUND_DEFECTS.md):
        // args.message is a tool-call argument, not human-typed text, so per
        // the law it should never ride as user_input. It still does HERE
        // because a fork is a CONTINUATION of an existing conversation, and
        // aidream's continuation path (`ConversationResolver.from_conversation_id`,
        // `services/ai_execution/agent_run.py` `_prepare_continue_run`) has no
        // per-turn variable/context channel — `request.variables` on a
        // continuation only stages picklist tokens, never becomes a new
        // visible turn, and omitting user_input entirely sends no new turn
        // at all (silently drops the master's message). Until aidream ships
        // a continuation-turn variable channel, user_input is the only way
        // to actually deliver this message. Do not "fix" this by switching
        // to variables — that silently breaks the fork feature rather than
        // fixing the law violation.
        dispatch(
          setUserInputText({ conversationId: forkId, text: args.message }),
        );
        // initiation:"auto" — this send is driven by an agent tool call, not
        // a person pressing send on this thread.
        await dispatch(
          executeInstance({ conversationId: forkId, initiation: "auto" }),
        ).unwrap();

        return {
          ok: true,
          thread_id: args.thread_id,
          mode,
          conversation_id: forkId,
          reply: latestAssistantReply(getState, forkId),
        };
      } catch (err) {
        return {
          ok: false,
          thread_id: args.thread_id,
          mode,
          message: `Couldn't fork and message the thread: ${
            err instanceof Error ? err.message : String(err)
          }`,
        };
      }
    }

    // ── FRESH ───────────────────────────────────────────────────────────
    try {
      // The tile's context lives in Redux only when its ROOM is loaded. The
      // master spans all rooms, so the target tile may be in a room that isn't
      // active — load it first (guarded: skip if the tile is already present).
      if (!selectThreadById(thread.id)(getState())) {
        const roomIds = await listRoomIdsForThread(thread.id);
        const roomId = roomIds[0] ?? null;
        if (roomId) {
          await dispatch(loadWarRoomSession(roomId));
        }
      }
      const contextEntries = buildThreadAgentContextEntries(
        getState(),
        thread.id,
      );

      const threadMandate = await resolveMandate(WAR_ROOM_THREAD_AGENT_MANDATE);
      const conversationId = await dispatch(
        createManualInstance({
          agentId: threadMandate.agentId,
          apiEndpointMode: "agent",
          sourceFeature: "agent-runner",
          allowChat: true,
          autoRun: false,
          displayMode: "chat-assistant",
        }),
      ).unwrap();

      // Seed the thread's own read-only context (task / notes / files), then the
      // message. Guard against an empty set (never push []).
      if (contextEntries.length > 0) {
        dispatch(
          setContextEntries({ conversationId, entries: contextEntries }),
        );
      }
      // THE USER-INPUT LAW: args.message is a TOOL-CALL ARGUMENT the master
      // agent decided, not something a human typed — it travels as the
      // declared `thread_message` variable on the `war_room.thread` agent
      // (verified live: variable_definitions + a `{{thread_message}}`
      // placeholder on its seed "user" turn), never as user_input. This is
      // safe only because this is a BRAND-NEW instance: variable
      // substitution runs once, at conversation creation.
      dispatch(
        setUserVariableValues({
          conversationId,
          values: { thread_message: args.message },
        }),
      );

      notifyAndWatch(dispatch, conversationId, threadLabel);

      // initiation:"auto" — agent-tool-driven send, not a human gesture.
      await dispatch(
        executeInstance({ conversationId, initiation: "auto" }),
      ).unwrap();

      return {
        ok: true,
        thread_id: args.thread_id,
        mode,
        conversation_id: conversationId,
        reply: latestAssistantReply(getState, conversationId),
      };
    } catch (err) {
      return {
        ok: false,
        thread_id: args.thread_id,
        mode,
        message: `Couldn't message the thread: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }
  },
};
