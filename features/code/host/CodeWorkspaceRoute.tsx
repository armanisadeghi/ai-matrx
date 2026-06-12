"use client";

import React from "react";
import { CodeWorkspace, type CodeWorkspaceProps } from "../CodeWorkspace";
import { ChatPanelSlot } from "../chat/ChatPanelSlot";
import { ChatHistorySlot } from "../chat/ChatHistorySlot";

export interface CodeWorkspaceRouteProps extends CodeWorkspaceProps {
  /** Disable the chat column (default: enabled). */
  hideChat?: boolean;
  /** Disable the chat history column (default: enabled). */
  hideHistory?: boolean;
}

/**
 * Full-viewport host — mounted at `/code`. By default the chat and history
 * columns are wired up using the URL-driven `?agentId=` / `?conversationId=`
 * pattern. Pass `hideChat` / `hideHistory` to suppress either column, or
 * override `rightSlot` / `farRightSlot` explicitly to inject your own.
 */
export const CodeWorkspaceRoute: React.FC<CodeWorkspaceRouteProps> = ({
  hideChat,
  hideHistory,
  rightSlot,
  farRightSlot,
  ...props
}) => {
  const resolvedRight =
    rightSlot ?? (hideChat ? undefined : <ChatPanelSlot basePath="/code" />);
  const resolvedFarRight =
    farRightSlot ?? (hideHistory ? undefined : <ChatHistorySlot />);

  return (
    <div className="h-[calc(100dvh-var(--shell-offset,0px))] w-full">
      <CodeWorkspace
        {...props}
        rightSlot={resolvedRight}
        farRightSlot={resolvedFarRight}
      />
    </div>
  );
};

export default CodeWorkspaceRoute;
