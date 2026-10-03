"use client";

/**
 * Messages Layout Client
 *
 * Desktop: a persistent sidebar carrying the conversation list. Mobile: the
 * sidebar is hidden and each route is full-screen.
 *
 * The list is `@ai-matrx/messaging`'s, wrapped in this app's right-click menu
 * by `<ConversationListPane>`. Its data comes from the ONE messaging engine
 * mounted app-wide in `providers/MessagingHost.tsx` — there is no per-route
 * initializer and no Redux mirror of the conversation list any more.
 *
 * Each page injects its own shell header via `<PageHeader>` (see
 * `features/messaging/components/shell/`); the sidebar carries no title of its
 * own and gets `pt-[var(--shell-header-h)]` so its toolbar clears the glass
 * header.
 */

import React from "react";
import { useRouter } from "next/navigation";
import { ConversationListPane } from "@/features/messaging/components/ConversationListPane";
import { useMessagesSurfaceScope } from "@/features/messaging/lib/useMessagesSurfaceScope";

export default function MessagesLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const getScope = useMessagesSurfaceScope();

  return (
    // A size container: the list sits beside the thread when the MAIN COLUMN
    // has room (42rem), not the window — the canvas narrows the column on a
    // desktop. The thread's Back follows the same container (messages-native.css).
    <div className="@container/messages flex h-full min-h-0 overflow-y-auto overflow-x-hidden bg-background">
      {/* Persistent conversation list beside the thread */}
      <div className="hidden min-h-0 w-80 shrink-0 flex-col border-r border-border pt-[var(--shell-header-h)] @2xl/messages:flex">
        <ConversationListPane
          className="min-h-0 flex-1"
          onSelect={(conversationId) => router.push(`/messages/${conversationId}`)}
          getApplicationScope={getScope}
        />
      </div>

      {/* Main Content Area - Route Outlet */}
      <div className="min-h-0 min-w-0 flex-1">{children}</div>
    </div>
  );
}
