"use client";

/**
 * ChatConversationSurface — the `matrx-user/chat` surface for ONE
 * conversation: its live scope (the conversation record, the transcript, the
 * composer, the run configuration) and every write target the manifest
 * declares (`features/surfaces/manifests/chat.manifest.ts`), each saving
 * through the SAME function the chat's own control calls.
 *
 * ONE component, two consumers: `ChatRoomClient` (every `/chat` room) and the
 * Board's chat tile (`features/spatial/items/work-items.tsx`). The conversation
 * it shows is the host's OWN (`ownConversationId`): it never receives this
 * surface as context nor its tools — only OUTSIDE agents (a window, a
 * sidebar, the chat beside the board) read and write it. On a board only the
 * LIVE tile registers (`SurfaceActivity`), so two chat tiles never collide.
 */

import type { ReactNode } from "react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { waitForConversationPersisted } from "@/features/agents/redux/execution-system/conversations/conversation-persistence";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import {
  buildChatContextData,
  CHAT_CONTEXT_MENU_PROPS,
} from "./agent-context/buildChatContextData";
import { buildChatRunConfiguration } from "./agent-context/buildChatRunConfiguration";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import {
  SurfaceRuntimeProvider,
  type SurfaceWriteHandlers,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { CHAT_CONVERSATION_TITLE_MAX } from "@/features/surfaces/manifests/chat.manifest";
import {
  buildChatConversationRecord,
  buildChatTranscript,
  isStreamingRow,
} from "./agent-context/chatTranscriptScope";
import {
  parseDeleteMessagesValue,
  parseMessageIdValue,
  parseUpdateMessagesValue,
  planInputDraftWrite,
  requireConfirmTrue,
  resolveEditAgainst,
  type ChatMessageEditPlan,
  type ChatMessageSnapshot,
} from "./agent-context/chatAgentWrites";
import { collectionWriteHandlers } from "@/features/surfaces/runtime/collection-write-targets";
import { refuseSurfaceWrite } from "@/features/surfaces/runtime/surface-writeback";
import { editMessageText } from "@/features/agents/redux/execution-system/message-crud/edit-message-text.thunk";
import {
  fetchStoredAnswer,
  saveAnswerEdit,
} from "@/features/agents/redux/execution-system/message-crud/save-answer-edit.thunk";
import { deleteMessage } from "@/features/agents/redux/execution-system/message-crud/delete-message.thunk";
import { regenerateAnswer } from "@/features/agents/redux/execution-system/message-crud/regenerate-answer";
import { selectRegenerateAnchor } from "@/features/agents/redux/execution-system/message-crud/regenerate-anchor";
import { forkConversation } from "@/features/agents/redux/execution-system/message-crud/fork-conversation.thunk";
import {
  cancelExecution,
  smartExecute,
} from "@/features/agents/redux/execution-system/thunks/smart-execute.thunk";
import { renameConversation } from "@/features/agents/redux/conversation-list/conversation-row-actions.thunks";
import { selectUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import {
  extractFlatText,
  selectConversationMessages,
  selectHasMoreOlderMessages,
  selectMessagesHydrationFailure,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { selectConversationTitle } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { selectIsStreaming } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { selectAgentName } from "@/features/agents/redux/agent-definition/selectors";
import { selectCurrentSettings } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import { selectInstanceResources } from "@/features/agents/redux/execution-system/instance-resources/instance-resources.selectors";
import { selectResolvedVariables } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import {
  selectActiveScratchpadId,
  selectAttachedScratchpadIds,
  selectWorkingDocEntry,
} from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";

interface ChatConversationSurfaceProps {
  /** The conversation this host shows — and therefore owns. */
  conversationId: string;
  /** The agent it runs with (the display identity: name, record). */
  agentId: string;
  /** The host's focus key — sends and fork prompts run under it. */
  surfaceKey: string;
  children: ReactNode;
}

export function ChatConversationSurface({
  conversationId,
  agentId,
  surfaceKey,
  children,
}: ChatConversationSurfaceProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  // Header Agents chrome — live Run scope from Redux at click time (draft +
  // transcript + agent). Plain fn; React Compiler memoizes. DOM selection in
  // the composer is best-effort via activeElement when it's a textarea.
  const getChatScope = () => {
    const state = store.getState();
    const draft = selectUserInputText(conversationId)(state) ?? "";
    const records = selectConversationMessages(conversationId)(state);
    const messages = records.map((r) => ({
      id: r.id,
      role: r.role,
      text: extractFlatText(r),
      created_at: r.createdAt ?? undefined,
    }));
    // THE record — the open conversation and every loaded message with its
    // tool calls (joined from the observability slice by call id). Omitted
    // when the messages read failed: an empty transcript would be a lie.
    const hydrationFailed = Boolean(
      selectMessagesHydrationFailure(conversationId)(state),
    );
    const toolCallsByCallId = state.observability.toolCallsByCallId;
    const transcript = hydrationFailed
      ? null
      : buildChatTranscript(
          records.map((r, i) => ({
            id: r.id,
            role: String(r.role),
            text: messages[i].text,
            createdAt: r.createdAt ?? null,
            status: r.status,
            clientStatus: r._clientStatus ?? null,
            deletedAt: r.deletedAt,
            content: r.content,
          })),
          (callId) => {
            const uuid = toolCallsByCallId[callId];
            return uuid ? state.observability.toolCalls[uuid] : undefined;
          },
        );

    let lastUserMessage: string | null = null;
    let lastAssistantMessage: string | null = null;
    for (const m of messages) {
      if (m.role === "user" && m.text) lastUserMessage = m.text;
      if (m.role === "assistant" && m.text) lastAssistantMessage = m.text;
    }

    let selectionStart = 0;
    let selectionEnd = 0;
    const active = document.activeElement;
    if (
      active instanceof HTMLTextAreaElement &&
      (active.value === draft || draft.length === 0)
    ) {
      selectionStart = active.selectionStart ?? 0;
      selectionEnd = active.selectionEnd ?? 0;
    }

    // Composer attachments, resolved variables, effective model, and lean
    // context-document refs — all plain ref-reads off the store at trigger
    // time (no subscriptions; this fn only runs when a launch is assembled).
    const attachedResources = selectInstanceResources(conversationId)(
      state,
    ).map((r) => ({
      id: r.resourceId,
      block_type: r.blockType,
      status: r.status,
    }));
    const variableValues = selectResolvedVariables(conversationId)(state);
    const settings = selectCurrentSettings(conversationId)(state);
    const model = typeof settings?.model === "string" ? settings.model : null;

    const workingEntry = selectWorkingDocEntry(
      conversationId,
      "working",
    )(state);
    const workingDocument = workingEntry
      ? {
          enabled: workingEntry.enabled,
          title: workingEntry.title ?? "",
          materialized: workingEntry.materialized ?? false,
          version: workingEntry.version ?? 0,
          char_count: workingEntry.content?.length ?? 0,
        }
      : null;

    const scratchEntry = selectWorkingDocEntry(
      conversationId,
      "scratch",
    )(state);
    const activeScratchpadId = selectActiveScratchpadId(state);
    const attachedScratchpadIds =
      selectAttachedScratchpadIds(conversationId)(state);
    const scratchpad =
      scratchEntry || activeScratchpadId || attachedScratchpadIds.length
        ? {
            enabled: scratchEntry?.enabled ?? false,
            title: scratchEntry?.title ?? "",
            char_count: scratchEntry?.content?.length ?? 0,
            active_scratchpad_id: activeScratchpadId,
            attached_scratchpad_ids: attachedScratchpadIds,
          }
        : null;

    const conversationStatus =
      state.conversations?.byConversationId?.[conversationId]?.status ?? null;
    const isStreamingNow = selectIsStreaming(conversationId)(state);
    const agentName = selectAgentName(state, agentId) ?? null;
    const conversationTitle = selectConversationTitle(conversationId)(state);
    const conversation = transcript
      ? buildChatConversationRecord({
          id: conversationId,
          title: conversationTitle,
          agentId,
          agentName,
          model,
          status: conversationStatus,
          isStreaming: isStreamingNow,
          transcript,
          hasOlderMessages: selectHasMoreOlderMessages(conversationId)(state),
        })
      : null;

    const contextData = buildChatContextData({
      inputDraft: draft,
      selectionStart,
      selectionEnd,
      conversationId,
      conversationTitle,
      conversationStatus,
      isStreaming: isStreamingNow,
      agentId,
      agentName,
      conversation,
      transcript,
      lastUserMessage,
      lastAssistantMessage,
      messages,
      attachedResources,
      variableValues,
      model,
      workingDocument,
      scratchpad,
      runConfiguration: buildChatRunConfiguration(state, conversationId),
    });

    const selectedText =
      selectionEnd > selectionStart
        ? draft.slice(selectionStart, selectionEnd)
        : "";

    return buildApplicationScopeFromMenuContext({
      selectedText,
      selectionRange:
        active instanceof HTMLTextAreaElement
          ? {
              type: "editable",
              element: active,
              start: selectionStart,
              end: selectionEnd,
            }
          : null,
      contextData,
    });
  };

  // ── Surface write handlers (`matrx-user/chat`) ───────────────────────────
  // The write half of this surface, for OUTSIDE agents (the page's own
  // conversation is never offered them). Every handler closes over THIS
  // component's `conversationId` — the conversation actually on the page —
  // and saves through the SAME function the page's own control calls. Which
  // targets exist and why: `features/surfaces/manifests/chat.manifest.ts`;
  // the pure checks: `./agent-context/chatAgentWrites.ts`.
  //
  // Plain fn, rebuilt per render; the provider holds it and calls it at write
  // time, so every handler reads live state.
  const errorText = (error: unknown, fallback: string): string =>
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : fallback;

  /** The loaded messages as the checks see them (live, at call time). */
  const messageSnapshots = (): ChatMessageSnapshot[] =>
    selectConversationMessages(conversationId)(store.getState())
      .filter((r) => !r.deletedAt)
      .map((r) => ({
        id: r.id,
        role: String(r.role),
        text: extractFlatText(r),
        streaming: isStreamingRow({
          status: r.status,
          clientStatus: r._clientStatus ?? null,
        }),
      }));

  const isStreamingNow = () => selectIsStreaming(conversationId)(store.getState());

  /** Save one checked message edit through the page's own edit path. */
  const saveMessageEdit = async (plan: ChatMessageEditPlan) => {
    const name = `${plan.role} message ${plan.messageId}`;
    if (plan.role === "user") {
      // The user message menu's "Save only" (`routeUserEditAction`).
      const record =
        store.getState().messages.byConversationId[conversationId]?.byId?.[
          plan.messageId
        ];
      const next = resolveEditAgainst(plan, extractFlatText(record));
      await dispatch(
        editMessageText({
          conversationId,
          messageId: plan.messageId,
          newContent: next,
        }),
      ).unwrap();
      return { id: plan.messageId, name };
    }
    // The in-place answer editor's save: re-read the STORED answer, apply
    // the edit to it, and refuse if it moved underneath (`openedText`).
    const stored = await fetchStoredAnswer(plan.messageId);
    const next = resolveEditAgainst(plan, stored.text);
    const result = await dispatch(
      saveAnswerEdit({
        conversationId,
        messageId: plan.messageId,
        newText: next,
        openedText: stored.text,
      }),
    );
    if (saveAnswerEdit.rejected.match(result))
      throw new Error(
        result.payload?.message ?? result.error.message ?? "the answer was not saved",
      );
    return {
      id: plan.messageId,
      name: result.payload.written ? name : `${name} (already had this text)`,
    };
  };

  const messageWriteTargets = collectionWriteHandlers(
    {
      plural: "messages",
      singular: "message",
      update: {
        parse: (value) => parseUpdateMessagesValue(value, messageSnapshots()),
        run: saveMessageEdit,
        nameOf: (plan: ChatMessageEditPlan) => `${plan.role} message ${plan.messageId}`,
        changedOf: (plan: ChatMessageEditPlan) => [
          "text" in plan.edit ? "text replaced" : "patched",
        ],
      },
      delete: {
        parse: (value) => parseDeleteMessagesValue(value, messageSnapshots()),
        run: async (message: ChatMessageSnapshot) => {
          // The message menu's "Move to Trash".
          await dispatch(
            deleteMessage({ conversationId, messageId: message.id }),
          ).unwrap();
          return { id: message.id, name: `${message.role} message ${message.id}` };
        },
        nameOf: (message: ChatMessageSnapshot) => `${message.role} message ${message.id}`,
      },
    },
    refuseSurfaceWrite,
  );

  /** `regenerate_last_answer`: the id must be the latest answer. */
  const checkRegenerate = (value: unknown): string => {
    const id = parseMessageIdValue("regenerate_last_answer", value);
    if (isStreamingNow())
      throw new Error(
        "regenerate_last_answer refused: a response is streaming. Wait for it to finish or use stop_response first.",
      );
    const message = messageSnapshots().find((m) => m.id === id);
    if (!message)
      throw new Error(
        `regenerate_last_answer refused: "${id}" is not a message on this page. Use the latest assistant message id from transcript.`,
      );
    if (!selectRegenerateAnchor(store.getState(), conversationId, id))
      throw new Error(
        `regenerate_last_answer refused: message ${id} is not the latest answer. Only the last answer can be regenerated; use fork_conversation for an earlier one.`,
      );
    return id;
  };

  const checkFork = (value: unknown) => {
    const id = parseMessageIdValue("fork_conversation", value);
    const record =
      store.getState().messages.byConversationId[conversationId]?.byId?.[id];
    if (!record || record.deletedAt)
      throw new Error(
        `fork_conversation refused: "${id}" is not a message on this page. Use an id from transcript.`,
      );
    if (isStreamingRow({ status: record.status, clientStatus: record._clientStatus ?? null }))
      throw new Error(
        `fork_conversation refused: message ${id} is still being written.`,
      );
    return record;
  };

  const checkStop = (value: unknown) => {
    requireConfirmTrue("stop_response", value);
    if (!isStreamingNow())
      throw new Error(
        "stop_response refused: nothing is running in this conversation right now.",
      );
  };

  const checkSend = (value: unknown) => {
    requireConfirmTrue("send_draft", value);
    const draft = selectUserInputText(conversationId)(store.getState()) ?? "";
    if (!draft.trim())
      throw new Error(
        "send_draft refused: the composer is empty. Stage the message with input_draft first.",
      );
    if (isStreamingNow())
      throw new Error(
        "send_draft refused: a response is still streaming. Wait for it to finish (or use stop_response), then send.",
      );
    return draft;
  };

  const getSurfaceWriteHandlers = (): SurfaceWriteHandlers => ({
    ...messageWriteTargets,

    regenerate_last_answer: {
      validate: (value) => {
        checkRegenerate(value);
      },
      apply: async (value) => {
        const id = checkRegenerate(value);
        // The answer menu's Regenerate (`confirmAndRegenerate`).
        const result = await dispatch(
          regenerateAnswer({ conversationId, assistantMessageId: id }),
        );
        if (regenerateAnswer.rejected.match(result))
          throw new Error(
            `regenerate_last_answer failed: ${result.payload?.message ?? result.error.message ?? "the answer was not regenerated"}.`,
          );
        return {
          summary: `Archived answer ${id} and asked the agent to answer the last question again; the new answer is streaming into the page.`,
          data: { archived_message_id: id },
        };
      },
    },

    fork_conversation: {
      validate: (value) => {
        checkFork(value);
      },
      apply: async (value) => {
        const record = checkFork(value);
        // The message menu's "Fork here" (rich-document `fork-at-message`).
        const result = await dispatch(
          forkConversation({
            conversationId,
            atPosition: typeof record.position === "number" ? record.position : 0,
          }),
        );
        if (forkConversation.rejected.match(result))
          throw new Error(
            `fork_conversation failed: ${errorText(result.payload ?? result.error, "the conversation was not forked")}.`,
          );
        const newConversationId = result.payload.conversationId;
        // Ask the person whether to open the branch — not awaited, so the
        // agent gets its result while the person decides.
        void import(
          "@/features/agents/components/messages-display/message-options/promptForkOutcome"
        ).then(({ promptForkOutcome }) =>
          promptForkOutcome({ dispatch, surfaceKey, newConversationId }),
        );
        return {
          summary: `Forked at message ${record.id}: new conversation ${newConversationId} holds every message up to it. The person was asked whether to open it.`,
          data: { conversation_id: newConversationId, forked_at_message_id: record.id },
        };
      },
    },

    stop_response: {
      validate: checkStop,
      apply: async (value) => {
        checkStop(value);
        // The composer's Stop button.
        await dispatch(cancelExecution(conversationId));
        return { summary: "Stopped the running response. What it had already written stays." };
      },
    },

    send_draft: {
      validate: (value) => {
        checkSend(value);
      },
      apply: async (value) => {
        const draft = checkSend(value);
        // The composer's Send button — the one outward act on this page.
        await dispatch(smartExecute({ conversationId, surfaceKey }));
        return {
          summary: `Sent the composer's message (${draft.length} characters); the agent is answering it.`,
        };
      },
    },

    conversation_title: async (value: unknown) => {
      if (typeof value !== "string")
        throw new Error(
          `conversation_title expects a plain string, got ${Array.isArray(value) ? "an array" : `a ${typeof value}`}.`,
        );
      const title = value.trim();
      if (!title)
        throw new Error(
          "conversation_title expects a non-empty title — clearing a conversation's name back to Untitled is a human action.",
        );
      if (title.length > CHAT_CONVERSATION_TITLE_MAX)
        throw new Error(
          `conversation_title is ${title.length} characters; the maximum is ${CHAT_CONVERSATION_TITLE_MAX}.`,
        );
      // A fresh chat holds a CLIENT-MINTED id — the `chat.conversation` row is
      // written when the first turn commits. Renaming before that updates zero
      // rows without erroring, while every optimistic mirror happily shows the
      // new title: a rename that silently did not happen. Gate on the same
      // predicate URL promotion uses; `timeoutMs: 0` makes it a single probe
      // rather than that path's 3-minute poll.
      const persisted = await waitForConversationPersisted(conversationId, {
        timeoutMs: 0,
      });
      if (!persisted)
        throw new Error(
          "conversation_title refused — this conversation has not been saved yet, so there is no row to rename. Its row is created when the first turn completes.",
        );
      // The canonical rename thunk every conversation list dispatches (it owns
      // the optimistic mirrors and the revert) — never a raw supabase update.
      const result = await dispatch(
        renameConversation({ conversationId, title }),
      );
      if (renameConversation.rejected.match(result))
        throw new Error(
          `conversation_title failed to save — ${result.payload?.message ?? "the rename was rejected."}`,
        );
    },

    input_draft: {
      validate: (value) => {
        planInputDraftWrite(
          value,
          selectUserInputText(conversationId)(store.getState()) ?? "",
        );
      },
      apply: (value) => {
        const current =
          selectUserInputText(conversationId)(store.getState()) ?? "";
        const next = planInputDraftWrite(value, current);
        // The SAME action the person's own keystrokes dispatch (AgentTextarea
        // calls this) — never a parallel write
        // path, so undo, draft protection and the send flow all behave
        // identically. Nothing is sent.
        dispatch(setUserInputText({ conversationId, text: next }));
        return {
          summary: `The composer now holds ${next.length} characters (nothing was sent).`,
          data: { input_draft: next },
        };
      },
    },
  });
  return (
    <SurfaceRuntimeProvider
      surfaceName={CHAT_CONTEXT_MENU_PROPS.surfaceName}
      getScope={getChatScope}
      getWriteHandlers={getSurfaceWriteHandlers}
      // The conversation this host SHOWS is the host itself: it never gets
      // this surface as context nor any surface tool (write targets, client
      // tools, feedback) on any turn — only OUTSIDE agents (a window,
      // sidebar or overlay opened from the Agents menu, the chat beside a
      // board) do.
      ownConversationId={conversationId}
      isEditable
    >
      {children}
    </SurfaceRuntimeProvider>
  );
}
