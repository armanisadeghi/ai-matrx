"use client";

import React, { useEffect } from "react";
import { X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectTerminalActiveTab,
  setActiveTab as setTerminalActiveTab,
  setOpen as setTerminalOpen,
} from "../redux/terminalSlice";
import type { BottomTabId } from "../types";
import { BOTTOM_PANEL_BG, PANE_BORDER } from "../styles/tokens";
import { SessionsHost } from "./SessionsHost";
import { ProblemsTab } from "./ProblemsTab";
import { OutputTab } from "./OutputTab";
import { DebugConsoleTab } from "./DebugConsoleTab";
import { PortsTab } from "./PortsTab";
import { SandboxStatusTab } from "./SandboxStatusTab";
import { SandboxFilesTab } from "./SandboxFilesTab";
import { SandboxEnvTab } from "./SandboxEnvTab";
import { SandboxSshTab } from "./SandboxSshTab";
import { selectActiveSandboxId } from "../redux/codeWorkspaceSlice";

interface BottomPanelProps {
  onCollapse?: () => void;
  className?: string;
}

interface BottomTabDescriptor {
  id: BottomTabId;
  label: string;
}

interface BottomTabDescriptorEx extends BottomTabDescriptor {
  /** When true, the tab is only shown while a sandbox is connected. */
  requiresSandbox?: boolean;
}

const TABS: BottomTabDescriptorEx[] = [
  { id: "problems", label: "Problems" },
  { id: "output", label: "Output" },
  { id: "debug", label: "Debug Console" },
  { id: "terminal", label: "Terminal" },
  { id: "ports", label: "Ports" },
  // Sandbox-specific surfaces — only show when a sandbox is connected. Each
  // surface is a separate top-level tab now (decomposed from the previous
  // "Inspector" mega-tab) so the user can find env / files / status without
  // hunting through nested sub-tabs.
  { id: "sandbox-status", label: "Status", requiresSandbox: true },
  { id: "sandbox-files", label: "Sandbox FS", requiresSandbox: true },
  { id: "sandbox-env", label: "Env", requiresSandbox: true },
  { id: "sandbox-ssh", label: "SSH", requiresSandbox: true },
];

export const BottomPanel: React.FC<BottomPanelProps> = ({
  onCollapse,
  className,
}) => {
  const dispatch = useAppDispatch();
  const activeTab = useAppSelector(selectTerminalActiveTab);
  const activeSandboxId = useAppSelector(selectActiveSandboxId);
  const visibleTabs = TABS.filter(
    (t) => !t.requiresSandbox || !!activeSandboxId,
  );
  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      dispatch(setTerminalActiveTab("terminal"));
    }
  }, [activeTab, dispatch, visibleTabs]);

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col border-t",
        PANE_BORDER,
        BOTTOM_PANEL_BG,
        className,
      )}
    >
      <div
        className={cn(
          "flex min-h-11 lg:min-h-8 min-w-0 shrink-0 items-center justify-between gap-1 border-b px-1",
          PANE_BORDER,
        )}
      >
        <div className="min-w-0 flex-1 lg:hidden">
          <Select
            value={activeTab}
            onValueChange={(value) => {
              const tab = visibleTabs.find((item) => item.id === value);
              if (tab) dispatch(setTerminalActiveTab(tab.id));
            }}
          >
            <SelectTrigger
              aria-label="Workspace tool"
              className="h-11 border-0 bg-transparent text-base shadow-none"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {visibleTabs.map((tab) => (
                <SelectItem key={tab.id} value={tab.id}>
                  {tab.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div
          role="tablist"
          aria-label="Workspace tools"
          className="hidden min-w-0 flex-1 items-stretch overflow-x-auto scrollbar-thin lg:flex"
        >
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => dispatch(setTerminalActiveTab(tab.id))}
              className={cn(
                "relative h-8 shrink-0 whitespace-nowrap px-3 text-xs text-muted-foreground transition-colors hover:text-foreground",
                activeTab === tab.id && "text-foreground font-medium",
              )}
            >
              {tab.label}
              {activeTab === tab.id && (
                <span
                  aria-hidden
                  className="absolute inset-x-2 bottom-0 h-[2px] rounded-t bg-primary"
                />
              )}
            </button>
          ))}
        </div>
        <div className="hidden shrink-0 items-center pr-1 lg:flex">
          <button
            type="button"
            aria-label="Close panel"
            title="Close Panel"
            onClick={() => {
              dispatch(setTerminalOpen(false));
              onCollapse?.();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      {/* Terminal sessions stay always-mounted so xterm scrollback + log
       *  polling buffers survive tab switches. Other tabs render lazily;
       *  when one of them is active, the terminal host is hidden via
       *  `display:none`. */}
      <div className="relative flex-1 min-h-0">
        <div className={cn("h-full", activeTab === "terminal" && "hidden")}>
          {activeTab === "problems" && <ProblemsTab />}
          {activeTab === "output" && <OutputTab />}
          {activeTab === "debug" && <DebugConsoleTab />}
          {activeTab === "ports" && <PortsTab />}
          {activeTab === "sandbox-status" && activeSandboxId && (
            <SandboxStatusTab sandboxId={activeSandboxId} />
          )}
          {activeTab === "sandbox-files" && activeSandboxId && (
            <SandboxFilesTab sandboxId={activeSandboxId} />
          )}
          {activeTab === "sandbox-env" && activeSandboxId && (
            <SandboxEnvTab sandboxId={activeSandboxId} />
          )}
          {activeTab === "sandbox-ssh" && activeSandboxId && (
            <SandboxSshTab sandboxId={activeSandboxId} />
          )}
        </div>
        <div
          className={cn("h-full", activeTab !== "terminal" && "hidden")}
          aria-hidden={activeTab !== "terminal"}
        >
          <SessionsHost visible={activeTab === "terminal"} />
        </div>
      </div>
    </div>
  );
};
