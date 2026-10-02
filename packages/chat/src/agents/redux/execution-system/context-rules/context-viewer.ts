/**
 * THE CONTEXT VIEWER DOOR (common-docs context-delivery RULES.md §5b; owner law
 * 2026-10-01, policies/server-shaped-values-are-viewable.md): the exact text the
 * model received for one value or block, fetched ONLY when a person opens it.
 *
 *   - A sent turn → `GET /ai/context/delivered` (the turn's person message):
 *     the server re-finds the text in what it recorded for that turn and
 *     returns it only when its length and hash match the receipt.
 *   - The next turn → `POST /ai/context/preview` with `view`: the same door
 *     fields a send makes, rendered by the run path's own gate.
 *
 * The receipt carries `{chars, sha256}` only; nothing here runs by default.
 */

import type { ChatDispatch, ChatRootState } from "../../../../store/root-state";
import { callApi } from "@host/lib/api/call-api";
import { extractErrorMessage } from "@ai-matrx/data/net";
import { buildPreviewRequestContext } from "./request-context";
import { sentWithRequest } from "../messages/messages.slice";
import type { ContextReceiptData } from "@host/types/python-generated/stream-events";

/**
 * `fetchable` — what the agent gets if it asks a tool now (the Organization:
 * its selected scopes' values via `scope_system`). Rendered when opened, never
 * on the receipt; `source: "fetched_now"`.
 */
export type ContextViewKind = "delivered" | "on_request" | "block" | "fetchable";

export interface ContextViewTarget {
  kind: ContextViewKind;
  /** The value's key, or the block's id. */
  key: string;
}

export interface ContextViewedText {
  kind: ContextViewKind;
  key: string;
  text: string;
  chars: number;
  sha256: string;
  source: "preview" | "wire" | "conversation_prompt" | "turn_record" | "fetched_now";
}

export type ContextViewLoader = (target: ContextViewTarget) => Promise<ContextViewedText>;

/** Which turn a view reads: a sent person message, or the next turn (`messageId: null`). */
export interface ContextViewTurn {
  conversationId: string;
  messageId: string | null;
  agentId?: string | null;
}

function errorText(error: { serverDetail?: unknown; message?: string }): string {
  const detail = error.serverDetail ? extractErrorMessage(error.serverDetail) : "";
  return detail || error.message || "Couldn't load";
}

/** Fetch one viewed text for `turn`. Rejects with the server's own sentence. */
export const loadContextView =
  (turn: ContextViewTurn, target: ContextViewTarget) =>
  async (dispatch: ChatDispatch, getState: () => ChatRootState): Promise<ContextViewedText> => {
    if (turn.messageId) {
      const result = await dispatch(
        callApi({
          path: "/ai/context/delivered",
          method: "GET",
          interactiveOrganization: false,
          queryParams: {
            conversation_id: turn.conversationId,
            message_id: turn.messageId,
            kind: target.kind,
            key: target.key,
          },
        }),
      );
      if (result.error) throw new Error(errorText(result.error));
      return result.data as ContextViewedText;
    }
    const result = await dispatch(
      callApi({
        path: "/ai/context/preview",
        method: "POST",
        interactiveOrganization: false,
        body: {
          conversation_id: turn.conversationId,
          agent_id: turn.agentId ?? null,
          ...buildPreviewRequestContext(getState(), turn.conversationId),
          view: target,
        },
      }),
    );
    if (result.error) throw new Error(errorText(result.error));
    const viewed = (result.data as { viewed?: ContextViewedText | null } | undefined)?.viewed;
    if (!viewed) throw new Error("Not in the next turn");
    return viewed;
  };

/**
 * The person message whose receipt the full view shows: the live receipt's
 * request (this session's latest turn), else the last message with a persisted
 * receipt — the same choice `selectDisplayContextRows` makes. `null` = no
 * receipt yet (the view reads the next turn).
 */
export function selectDisplayReceiptMessageId(
  state: ChatRootState,
  conversationId: string,
): string | null {
  const entry = state.messages?.byConversationId?.[conversationId];
  const ids = entry?.orderedIds ?? [];
  const live = state.instanceContext?.receiptByConversationId?.[conversationId];
  const users = ids
    .map((id) => entry?.byId?.[id])
    .filter((record): record is NonNullable<typeof record> => record?.role === "user")
    .reverse();
  if (live) {
    const sent = users.find((record) => sentWithRequest(record, live.requestId));
    if (sent) return sent.id;
  }
  return users.find((record) => record.modelContext?.delivery?.receipt)?.id ?? null;
}

/** The blocks of the receipt the full view shows (live, else last persisted). */
export function selectDisplayReceiptBlocks(
  state: ChatRootState,
  conversationId: string,
): NonNullable<ContextReceiptData["blocks"]> {
  const live = state.instanceContext?.receiptByConversationId?.[conversationId]?.receipt;
  if (live) return live.blocks ?? EMPTY_BLOCKS;
  const entry = state.messages?.byConversationId?.[conversationId];
  const ids = entry?.orderedIds ?? [];
  for (let i = ids.length - 1; i >= 0; i--) {
    const receipt = entry?.byId?.[ids[i]]?.modelContext?.delivery?.receipt;
    if (receipt) return receipt.blocks ?? EMPTY_BLOCKS;
  }
  return EMPTY_BLOCKS;
}

const EMPTY_BLOCKS: NonNullable<ContextReceiptData["blocks"]> = [];
