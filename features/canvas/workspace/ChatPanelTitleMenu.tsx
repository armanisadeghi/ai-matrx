"use client";

/**
 * The title ▾ of a chat that lives in a panel (the canvas workspace's chat,
 * the shell's chat dock): the conversation's name, and New chat · Rename ·
 * Open in full chat. One menu for every chat panel.
 */

import { ChevronDown, ExternalLink, PencilLine, Plus } from "lucide-react";
import AppLink from "@/components/navigation/AppLink";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectConversationTitle } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { selectConversationListItemById } from "@/features/agents/redux/conversation-list/conversation-list.selectors";
import { conversationRenameOpener } from "@/features/agents/components/conversation-actions/rename/conversationRenameOpener";

/** The chat's real title (null until it has one) — the conversation's, else its list row's. */
function useChatRealTitle(conversationId: string | null): string | null {
  const conversationTitle = useAppSelector((state) =>
    conversationId ? selectConversationTitle(conversationId)(state) : null,
  );
  // The server names a chat after its first turn; that name lands on the
  // conversation LIST row before the open conversation record hears of it.
  const listTitle = useAppSelector((state) =>
    conversationId ? (selectConversationListItemById(conversationId)(state)?.title ?? null) : null,
  );
  return conversationTitle?.trim() || listTitle?.trim() || null;
}

/** The panel's chat name: its real title, else "New chat". */
export function useChatPanelTitle(conversationId: string | null): string {
  return useChatRealTitle(conversationId) ?? "New chat";
}

export function ChatPanelTitleMenu({
  conversationId,
  onNewChat,
}: {
  conversationId: string | null;
  onNewChat: () => void;
}) {
  const realTitle = useChatRealTitle(conversationId);
  const title = realTitle ?? "New chat";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-7 min-w-0 items-center gap-1 rounded-md px-1.5 text-sm font-medium text-foreground hover:bg-accent"
        >
          <span className="min-w-0 truncate">{title}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem onSelect={onNewChat}>
          <Plus className="mr-2 h-4 w-4" />
          New chat
        </DropdownMenuItem>
        {conversationId ? (
          <>
            <DropdownMenuItem
              onSelect={() => void conversationRenameOpener.open({ conversationId, title: realTitle })}
            >
              <PencilLine className="mr-2 h-4 w-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <AppLink href={`/chat/${conversationId}`}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Open in full chat
              </AppLink>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
