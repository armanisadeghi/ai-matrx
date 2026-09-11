"use client";

import React from "react";
import {
  ChevronsDown,
  ChevronsLeft,
  ChevronsRight,
  FolderOpen,
  Layers,
  MessageSquare,
  PanelRightOpen,
  Terminal as TerminalIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useCodeWorkspace } from "../CodeWorkspaceProvider";
import type { RootState } from "@/lib/redux/store";
import { resolveEnvironmentForTab } from "../editor/monaco-environments";
import { selectActiveTab } from "../redux/tabsSlice";
import {
  selectFarRightOpen,
  selectRightOpen,
  selectSideOpen,
  setFarRightOpen,
  setRightOpen,
  setSideOpen,
} from "../redux/codeWorkspaceSlice";
import {
  selectTerminalOpen,
  setOpen as setTerminalOpen,
} from "../redux/terminalSlice";

interface StatusBarProps {
  rightSlotAvailable?: boolean;
  farRightSlotAvailable?: boolean;
  className?: string;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  rightSlotAvailable = true,
  farRightSlotAvailable = true,
  className,
}) => {
  const dispatch = useAppDispatch();
  const { filesystem, process } = useCodeWorkspace();
  const activeTab = useAppSelector(selectActiveTab);
  const sideOpen = useAppSelector(selectSideOpen);
  const rightOpen = useAppSelector(selectRightOpen);
  const farRightOpen = useAppSelector(selectFarRightOpen);
  const terminalOpen = useAppSelector(selectTerminalOpen);
  const monacoEnvironmentsEnabled = useAppSelector(
    (state: RootState) =>
      state.userPreferences.coding.monacoEnvironmentsEnabled ?? true,
  );
  const activeEnvironment =
    monacoEnvironmentsEnabled && activeTab
      ? resolveEnvironmentForTab(activeTab)
      : null;

  return (
    <div
      className={cn(
        "flex h-7 min-w-0 shrink-0 items-center justify-between gap-3 border-t border-border bg-muted/40 px-2 text-[11px] text-muted-foreground",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={() => dispatch(setSideOpen(!sideOpen))}
          className="flex shrink-0 items-center gap-1 rounded px-1 hover:bg-accent hover:text-foreground"
          aria-label="Toggle sidebar"
        >
          {sideOpen ? <ChevronsLeft size={12} /> : <ChevronsRight size={12} />}
          <span>Sidebar</span>
        </button>
        <div
          className="flex min-w-0 items-center gap-1"
          title={
            filesystem.id.startsWith("sandbox:")
              ? process.cwd
              : "Cloud files and saved code"
          }
        >
          <FolderOpen size={12} className="shrink-0" />
          <span className="truncate">
            {filesystem.id.startsWith("sandbox:") ? process.cwd : "Cloud files"}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {activeTab && (
          <>
            <span>{activeTab.language}</span>
            {activeEnvironment ? (
              <span
                className="flex items-center gap-1"
                title={
                  activeEnvironment.description ??
                  `Monaco type environment: ${activeEnvironment.label}`
                }
              >
                <Layers size={12} />
                <span>{activeEnvironment.label}</span>
              </span>
            ) : monacoEnvironmentsEnabled ? null : (
              <span
                className="flex items-center gap-1 opacity-70"
                title="Type environments are disabled in Code Workspace settings"
              >
                <Layers size={12} />
                <span>env: off</span>
              </span>
            )}
          </>
        )}
        <button
          type="button"
          onClick={() => dispatch(setTerminalOpen(!terminalOpen))}
          className="flex items-center gap-1 rounded px-1 hover:bg-accent hover:text-foreground"
          aria-label="Toggle bottom panel"
        >
          <ChevronsDown size={12} />
          <span>{terminalOpen ? "Hide Panel" : "Show Panel"}</span>
        </button>
        {rightSlotAvailable && (
          <button
            type="button"
            onClick={() => dispatch(setRightOpen(!rightOpen))}
            className="flex items-center gap-1 rounded px-1 hover:bg-accent hover:text-foreground"
            aria-label="Toggle chat panel"
          >
            <MessageSquare size={12} />
            <span>{rightOpen ? "Hide Chat" : "Show Chat"}</span>
          </button>
        )}
        {farRightSlotAvailable && (
          <button
            type="button"
            onClick={() => dispatch(setFarRightOpen(!farRightOpen))}
            className="flex items-center gap-1 rounded px-1 hover:bg-accent hover:text-foreground"
            aria-label="Toggle chat history"
          >
            <PanelRightOpen size={12} />
            <span>{farRightOpen ? "Hide History" : "Show History"}</span>
          </button>
        )}
      </div>
    </div>
  );
};
