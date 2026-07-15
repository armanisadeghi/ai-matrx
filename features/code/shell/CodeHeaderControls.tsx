"use client";

// CodeHeaderControls — shell glass-header content for `/code`, injected via
// <PageHeader> (features/shell/components/header/PageHeader.tsx).
//
// Layout: [side-panel toggle] [chat toggle] [chat-history toggle] [title "Code"]
// Mirrors the /tasks pattern (TasksHeaderControls) — toggles drive the same
// Redux-backed open/closed state the resizable panels in WorkspaceLayout
// already read (selectSideOpen/selectRightOpen/selectFarRightOpen), so the
// header stays in sync with manual panel drags/collapses.

import {
  PanelLeftTapButton,
  MessageTapButton,
  HistoryTapButton,
} from "@/components/icons/tap-buttons";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectSideOpen,
  selectRightOpen,
  selectFarRightOpen,
  setSideOpen,
  setRightOpen,
  setFarRightOpen,
} from "../redux/codeWorkspaceSlice";

export function CodeHeaderControls() {
  const dispatch = useAppDispatch();
  const sideOpen = useAppSelector(selectSideOpen);
  const rightOpen = useAppSelector(selectRightOpen);
  const farRightOpen = useAppSelector(selectFarRightOpen);

  return (
    <div className="flex items-center w-full min-w-0 gap-0 p-0 space-x-0 space-y-0">
      {/* Toggles only make sense once the resizable panel layout is mounted
          (desktop-class VSCode-style workspace) — hidden below md. */}
      <div className="hidden md:flex items-center gap-0 p-0 space-x-0 space-y-0">
        <PanelLeftTapButton
          onClick={() => dispatch(setSideOpen(!sideOpen))}
          variant={sideOpen ? "glass" : "transparent"}
          ariaLabel={sideOpen ? "Hide explorer" : "Show explorer"}
          tooltip={sideOpen ? "Hide explorer" : "Show explorer"}
        />
        <MessageTapButton
          onClick={() => dispatch(setRightOpen(!rightOpen))}
          variant={rightOpen ? "glass" : "transparent"}
          ariaLabel={rightOpen ? "Hide chat" : "Show chat"}
          tooltip={rightOpen ? "Hide chat" : "Show chat"}
        />
        <HistoryTapButton
          onClick={() => dispatch(setFarRightOpen(!farRightOpen))}
          variant={farRightOpen ? "glass" : "transparent"}
          ariaLabel={farRightOpen ? "Hide chat history" : "Show chat history"}
          tooltip={farRightOpen ? "Hide chat history" : "Show chat history"}
        />
      </div>
      <h1 className="ml-0 md:ml-2 text-sm font-medium text-foreground truncate">
        Code
      </h1>
    </div>
  );
}

export default CodeHeaderControls;
