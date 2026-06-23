"use client";

import React from "react";

/**
 * ChatResultColumn — render children at the EXACT width + horizontal context a
 * tool call gets in the live chat.
 *
 * In the real conversation, a tool card sits inside `AgentConversationColumn`'s
 * centered content (`w-full max-w-3xl mx-auto px-2`) directly on the plain
 * conversation surface — NO surrounding card, border, padding, or background
 * change. Tools that look fine inside a decorative `bg-card` demo panel can
 * render badly in chat (stray borders, odd bg shifts). Previewing in anything
 * but this column lies about how the tool actually renders, so every gallery /
 * "in action" preview must wrap its `ToolCallVisualization` in this.
 *
 * Deliberately sets no background and no border — it must inherit the page
 * surface exactly as the chat column does.
 */
export function ChatResultColumn({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={"mx-auto w-full max-w-3xl px-2" + (className ? ` ${className}` : "")}>
      {children}
    </div>
  );
}
