"use client";

import {
  ChevronLeftTapButton,
  PanelLeftTapButton,
  TerminalTapButton,
  MessageTapButton,
  HistoryTapButton,
} from "@/components/icons/tap-buttons";
import { usePanelControls } from "../_lib/PanelControlProvider";
import { DemoTitle } from "../_lib/DemoTitle";

// All tap targets are 44pt — they own their own visual breathing room.
// Container is gap-0 / p-0 / space-0 — never add any spacing around them.
export function VSCodeHeaderControls() {
  const { toggle, isCollapsed } = usePanelControls();
  const sidebarCollapsed = isCollapsed("sidebar");
  const terminalCollapsed = isCollapsed("terminal");
  const chatCollapsed = isCollapsed("chat");
  const historyCollapsed = isCollapsed("chat-history");

  const isLeftSideCollapsed = sidebarCollapsed;
  const isRightSideCollapsed = chatCollapsed && historyCollapsed;

  return (
    <div className="flex items-center justify-between w-full min-w-0 gap-0 p-0 space-x-0 space-y-0">
      <div className="flex items-center gap-0 p-0 space-x-0 space-y-0">
        <ChevronLeftTapButton
          href="/demos/ssr/resizables"
          variant="transparent"
          ariaLabel="Back"
        />
        <PanelLeftTapButton
          onClick={() => toggle("sidebar")}
          variant={isLeftSideCollapsed ? "transparent" : "glass"}
          ariaLabel={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
          tooltip={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
        />
        <TerminalTapButton
          onClick={() => toggle("terminal")}
          variant={isLeftSideCollapsed ? "transparent" : "glass"}
          ariaLabel={terminalCollapsed ? "Show terminal" : "Hide terminal"}
          tooltip={terminalCollapsed ? "Show terminal" : "Hide terminal"}
        />
      </div>
      <DemoTitle
        title="Demo 03 — Workspace"
        subtitle="VSCode-style · 3 nested groups · 4 collapsibles"
      />
      <div className="flex items-center gap-0 p-0 space-x-0 space-y-0">
        <MessageTapButton
          onClick={() => toggle("chat")}
          variant={isRightSideCollapsed ? "transparent" : "glass"}
          ariaLabel={chatCollapsed ? "Show chat" : "Hide chat"}
          tooltip={chatCollapsed ? "Show chat" : "Hide chat"}
        />
        <HistoryTapButton
          onClick={() => toggle("chat-history")}
          variant={isRightSideCollapsed ? "transparent" : "glass"}
          ariaLabel={
            historyCollapsed ? "Show chat history" : "Hide chat history"
          }
          tooltip={historyCollapsed ? "Show chat history" : "Hide chat history"}
        />
      </div>
    </div>
  );
}
