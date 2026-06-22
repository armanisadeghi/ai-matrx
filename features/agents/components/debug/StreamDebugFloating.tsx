"use client";

import React from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { StreamDebugPanel } from "./StreamDebugPanel";

export interface StreamDebugFloatingProps {
  conversationId: string;
  onClose: () => void;
  defaultPosition?: { x: number; y: number };
  /**
   * Optional: pin the debug view to a specific request (e.g. the request
   * that produced a particular assistant message). When omitted, the panel
   * defaults to the latest request on the conversation.
   */
  requestIdOverride?: string;
}

export function StreamDebugFloating({
  conversationId,
  onClose,
  defaultPosition = { x: 20, y: 60 },
  requestIdOverride,
}: StreamDebugFloatingProps) {
  return (
    <WindowPanel
      title="Stream Debug"
      id={`stream-debug-${conversationId}${
        requestIdOverride ? `-${requestIdOverride}` : ""
      }`}
      onClose={onClose}
      width={600}
      height={500}
      initialRect={{ x: defaultPosition.x, y: defaultPosition.y }}
      minWidth={300}
      minHeight={200}
      bodyClassName="flex min-h-0 flex-col overflow-hidden p-0"
      urlSyncKey="debug"
      urlSyncId={conversationId}
    >
      <StreamDebugPanel
        conversationId={conversationId}
        className="h-full"
        requestIdOverride={requestIdOverride}
      />
    </WindowPanel>
  );
}

export default StreamDebugFloating;
