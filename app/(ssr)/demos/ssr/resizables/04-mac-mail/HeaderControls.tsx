"use client";

import {
  ChevronLeftTapButton,
  PanelLeftTapButton,
  PanelRightTapButton,
  MenuTapButton,
  HistoryTapButton,
} from "@/components/icons/tap-buttons";
import { usePanelControls } from "../_lib/PanelControlProvider";
import { DemoTitle } from "../_lib/DemoTitle";

export function MailHeaderControls() {
  const { toggle, isCollapsed } = usePanelControls();
  const foldersCollapsed = isCollapsed("folders");
  const messagesCollapsed = isCollapsed("messages");
  const inspectorCollapsed = isCollapsed("inspector");
  const historyCollapsed = isCollapsed("chat-history");

  const isLeftSideCollapsed = foldersCollapsed && messagesCollapsed;
  const isRightSideCollapsed = inspectorCollapsed && historyCollapsed;

  return (
    <div className="flex items-center justify-between w-full min-w-0 gap-0 p-0 space-x-0 space-y-0">
      <div className="flex items-center gap-0 p-0 space-x-0 space-y-0">
        <ChevronLeftTapButton
          href="/demos/ssr/resizables"
          variant="transparent"
          ariaLabel="Back"
        />
        <PanelLeftTapButton
          onClick={() => toggle("folders")}
          variant={isLeftSideCollapsed ? "transparent" : "glass"}
          ariaLabel={foldersCollapsed ? "Show folders" : "Hide folders"}
          tooltip={foldersCollapsed ? "Show folders" : "Hide folders"}
        />
        <MenuTapButton
          onClick={() => toggle("messages")}
          variant={isLeftSideCollapsed ? "transparent" : "glass"}
          ariaLabel={
            messagesCollapsed ? "Show messages list" : "Hide messages list"
          }
          tooltip={
            messagesCollapsed ? "Show messages list" : "Hide messages list"
          }
        />
      </div>
      <DemoTitle
        title="Demo 04 — Mail"
        subtitle="multi-sidebar · 4 independent collapsibles"
      />
      <div className="flex items-center gap-0 p-0 space-x-0 space-y-0">
        <PanelRightTapButton
          onClick={() => toggle("inspector")}
          variant={isRightSideCollapsed ? "transparent" : "glass"}
          ariaLabel={inspectorCollapsed ? "Show inspector" : "Hide inspector"}
          tooltip={inspectorCollapsed ? "Show inspector" : "Hide inspector"}
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
