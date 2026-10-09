"use client";

/**
 * The board's own conversations. A conversation belongs to a board through an
 * association edge (`conversation → board`, platform.associations — written and
 * read ONLY through `associationsService`, the one chokepoint). The chat tile's
 * list shows exactly these.
 *
 * Filed when: a chat tile's conversation exists on the server (started in the
 * tile, brought in, or added by an agent — all mount a tile), and the board's
 * own shell-chat conversation (`BoardHomeChatFiler`). Removing a tile keeps the
 * edge; only the list's "Remove from this board" deletes it (the conversation
 * itself is never touched).
 *
 * The read happens once per opened board and is kept for the page: a tile that
 * sleeps and wakes reads nothing.
 */

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { shellChatHome } from "@ai-matrx/chat/canvas/workspace/shell-chat-route";
import { selectFocusedConversation } from "@ai-matrx/chat/agents/redux/execution-system/conversation-focus/conversation-focus.selectors";
import { selectIsCacheOnly } from "@ai-matrx/chat/agents/redux/execution-system/conversations/conversations.selectors";
import { associationsService } from "@/features/scopes/service/associationsService";
import { useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { BOARD_CHAT_SOURCE, BOARD_TARGET, chatIdsFromEdges, withChat, withoutChat } from "./board-chats.logic";

export interface BoardChats {
  boardId: string;
  /** The board's conversations; null until the first read lands. */
  ids: string[] | null;
  /** Put a conversation (one the server has) on this board. Idempotent. */
  file: (conversationId: string) => void;
  /** Take a conversation off this board's list (the conversation is kept). */
  unfile: (conversationId: string) => void;
}

const BoardChatsContext = createContext<BoardChats | null>(null);

/** Null on a board with no saved record (a demo, a guest board): no list, nothing filed. */
export function useBoardChats(): BoardChats | null {
  return useContext(BoardChatsContext);
}

export function BoardChatsProvider({
  boardId,
  organizationId,
  children,
}: {
  boardId: string;
  organizationId: string | null;
  children: ReactNode;
}) {
  const [ids, setIds] = useState<string[] | null>(null);
  const filed = useRef(new Set<string>());

  useEffect(() => {
    let live = true;
    void associationsService.listForTargets(BOARD_TARGET, [boardId]).then((r) => {
      if (!live) return;
      if (!r.ok) {
        console.error("[board-chats] reading the board's conversations failed", r.error);
        toast.error("Couldn't load this board's conversations");
        setIds((cur) => cur ?? []);
        return;
      }
      const read = chatIdsFromEdges(r.data.edges);
      for (const id of read) filed.current.add(id);
      // A conversation filed while the read was in flight stays.
      setIds((cur) => (cur ? cur.reduce((all, id) => withChat(all, id), read) : read));
    });
    return () => {
      live = false;
    };
  }, [boardId]);

  const value: BoardChats = {
    boardId,
    ids,
    file: (conversationId) => {
      if (filed.current.has(conversationId)) return;
      filed.current.add(conversationId);
      setIds((cur) => withChat(cur ?? [], conversationId));
      void associationsService
        .add({
          sourceType: BOARD_CHAT_SOURCE,
          sourceId: conversationId,
          targetType: BOARD_TARGET,
          targetId: boardId,
          ...(organizationId ? { orgId: organizationId } : {}),
        })
        .then((r) => {
          if (r.ok) return;
          filed.current.delete(conversationId);
          setIds((cur) => withoutChat(cur ?? [], conversationId));
          console.error("[board-chats] filing a conversation on the board failed", r.error);
          toast.error("Couldn't add this conversation to the board's list");
        });
    },
    unfile: (conversationId) => {
      filed.current.delete(conversationId);
      setIds((cur) => withoutChat(cur ?? [], conversationId));
      void associationsService
        .remove({ sourceType: BOARD_CHAT_SOURCE, sourceId: conversationId, targetType: BOARD_TARGET, targetId: boardId })
        .then((r) => {
          if (r.ok) return;
          filed.current.add(conversationId);
          setIds((cur) => withChat(cur ?? [], conversationId));
          console.error("[board-chats] removing a conversation from the board failed", r.error);
          toast.error("Couldn't remove this conversation from the board");
        });
    },
  };
  return <BoardChatsContext.Provider value={value}>{children}</BoardChatsContext.Provider>;
}

/**
 * The board's own shell-chat conversation (the chat beside the board) belongs to
 * the board too: filed as soon as the server has it. Renders nothing.
 */
export function BoardHomeChatFiler() {
  const boardChats = useBoardChats();
  const pathname = usePathname();
  const surfaceKey = shellChatHome(pathname, true).surfaceKey;
  const conversationId = useAppSelector(selectFocusedConversation(surfaceKey));
  const serverHasIt = useAppSelector((s) => (conversationId ? !selectIsCacheOnly(conversationId)(s) : false));
  const file = boardChats?.file;
  useEffect(() => {
    if (conversationId && serverHasIt && file) file(conversationId);
  }, [conversationId, serverHasIt, file]);
  return null;
}
