"use client";

/**
 * ChatSidebar — thin front door (MarkdownStream pattern). ONE
 * dynamic({ssr:false}) edge; the sidebar (header + agents + chats + footer)
 * is a single statically-imported piece in ChatSidebarImpl, built once.
 * Loading fallback mirrors the old per-part skeletons as one column.
 */

import dynamic from "next/dynamic";
import type { ChatSidebarProps } from "./ChatSidebarImpl";

const ChatSidebarLazy = dynamic(
  () => import("./ChatSidebarImpl").then((m) => ({ default: m.ChatSidebarImpl })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full flex-col">
        <div className="h-9 border-b border-border" />
        <div className="h-20 border-b border-border" />
        <div className="min-h-[80px] flex-1" />
        <div className="h-11 border-t border-border" />
      </div>
    ),
  },
);

export type { ChatSidebarProps };

export function ChatSidebar(props: ChatSidebarProps) {
  return <ChatSidebarLazy {...props} />;
}
