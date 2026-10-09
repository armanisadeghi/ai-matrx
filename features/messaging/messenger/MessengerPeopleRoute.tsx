"use client";

/**
 * /messenger — `@ai-matrx/chat`'s messenger shell over the PEOPLE source.
 *
 * Everything is a package's: the layout, rail, list, header and menus are the
 * chat package's messenger; conversations, presence and the thread are
 * `@ai-matrx/messaging`'s (the app-wide engine in providers/MessagingHost.tsx).
 * This file only hands the app's own pieces in: durable pins, the new-chat
 * dialog, the profile, and the SAME `ConversationPane` /messages uses (its
 * right-click menu, composer field and AI demand) with the messenger look.
 */

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { MessengerShell } from "@ai-matrx/chat/messenger/MessengerShell";
import { usePeopleMessengerSource } from "@ai-matrx/chat/messenger/people/usePeopleMessengerSource";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectDisplayName, selectUserAvatarUrl } from "@/lib/redux/selectors/userSelectors";
import { ConversationPane } from "@/features/messaging/components/ConversationPane";
import { NewConversationDialog } from "@/features/messaging/components/NewConversationDialog";
import { useMessagePins } from "@/features/messaging/lib/useMessagePins";
import { useMessagesSurfaceScope } from "@/features/messaging/lib/useMessagesSurfaceScope";

export function MessengerPeopleRoute() {
  const router = useRouter();
  const getScope = useMessagesSurfaceScope();
  const { pins, toggle } = useMessagePins();
  const [newOpen, setNewOpen] = useState(false);
  const name = useAppSelector(selectDisplayName);
  const avatarUrl = useAppSelector(selectUserAvatarUrl);

  const renderConversation = useCallback(
    (conversationId: string) => (
      <ConversationPane
        conversationId={conversationId}
        showHeader={false}
        appearance="messenger"
        getApplicationScope={getScope}
        className="min-h-0 flex-1"
      />
    ),
    [getScope],
  );

  const profile = useMemo(
    () => ({
      name: name || "You",
      avatar: avatarUrl ? ({ kind: "image", src: avatarUrl } as const) : ({ kind: "monogram" } as const),
      onSelect: () => router.push("/settings/profile"),
    }),
    [name, avatarUrl, router],
  );

  const source = usePeopleMessengerSource({
    profile,
    onNewConversation: () => setNewOpen(true),
    pinnedConversationIds: pins,
    onTogglePin: (id) => void toggle(id),
    renderConversation,
    conversationMenuExtras: (summary) => [
      {
        id: "open-in-messages",
        label: "Open in Messages",
        icon: MessageSquare,
        onSelect: () => router.push(`/messages/${summary.conversation.id}`),
      },
    ],
  });

  return (
    <SurfaceRuntimeProvider surfaceName="matrx-user/messages" getScope={getScope} isEditable={false}>
      <MessengerShell source={source} />
      <NewConversationDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(id) => {
          setNewOpen(false);
          source.onSelectContact(id);
        }}
      />
    </SurfaceRuntimeProvider>
  );
}
