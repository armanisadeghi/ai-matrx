"use client";

import React, { useState } from "react";
import { CodeWorkspace, type CodeWorkspaceProps } from "../CodeWorkspace";
import { ChatPanelSlot } from "../chat/ChatPanelSlot";
import { ChatHistorySlot } from "../chat/ChatHistorySlot";

export interface CodeWorkspaceRouteProps extends CodeWorkspaceProps {
  /** Disable the chat column (default: enabled). */
  hideChat?: boolean;
  /** Disable the chat history column (default: enabled). */
  hideHistory?: boolean;
  sandboxLinkError?: string | null;
}

/**
 * Full-viewport host — mounted at `/code`. By default the chat and history
 * columns are wired up using the URL-driven `?agentId=` / `?conversationId=`
 * pattern. Pass `hideChat` / `hideHistory` to suppress either column, or
 * override `rightSlot` / `farRightSlot` explicitly to inject your own.
 *
 * Activity-view icons live in the app shell via `CodeSidebarMenu` +
 * `route-menu-registry` (same Large-Route pattern as `/chat`). The
 * resizable/collapsible file panel stays in the workspace. This host
 * therefore hides only the duplicate 48px ActivityBar rail.
 */
export const CodeWorkspaceRoute: React.FC<CodeWorkspaceRouteProps> = ({
  hideChat,
  hideHistory,
  rightSlot,
  farRightSlot,
  showActivityBar = false,
  sandboxLinkError = null,
  ...props
}) => {
  const [connectionError, setConnectionError] = useState(sandboxLinkError);
  const resolvedRight =
    rightSlot ?? (hideChat ? undefined : <ChatPanelSlot basePath="/code" />);
  const resolvedFarRight =
    farRightSlot ?? (hideHistory ? undefined : <ChatHistorySlot />);

  if (connectionError) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <div role="alert" className="max-w-md rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <p>{connectionError}</p>
          <a href="/code" className="mt-3 inline-block font-medium underline">
            Open Code and choose a sandbox
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <CodeWorkspace
        {...props}
        showActivityBar={showActivityBar}
        rightSlot={resolvedRight}
        farRightSlot={resolvedFarRight}
        onInitialSandboxError={setConnectionError}
      />
    </div>
  );
};

export default CodeWorkspaceRoute;
