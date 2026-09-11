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
  CopyTapButton,
  PanelLeftTapButton,
  MessageTapButton,
  HistoryTapButton,
} from "@ai-matrx/tap-target/buttons";
import { ExternalLink } from "lucide-react";
import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useClipboard } from "@/hooks/useClipboard";
import type { SandboxDetailResponse } from "@/types/sandbox";
import { sandboxDisplayName } from "@/lib/sandbox/format";
import {
  getEffectiveStatus,
  STATUS_LABELS,
  statusPillClasses,
} from "@/lib/sandbox/status";
import {
  selectSideOpen,
  selectRightOpen,
  selectFarRightOpen,
  selectActiveSandbox,
  setActiveSandbox,
  setSideOpen,
  setRightOpen,
  setFarRightOpen,
} from "../redux/codeWorkspaceSlice";

export function CodeHeaderControls() {
  const dispatch = useAppDispatch();
  const { copyText } = useClipboard();
  const sideOpen = useAppSelector(selectSideOpen);
  const rightOpen = useAppSelector(selectRightOpen);
  const farRightOpen = useAppSelector(selectFarRightOpen);
  const activeSandbox = useAppSelector(selectActiveSandbox);

  useEffect(() => {
    if (!activeSandbox) return undefined;
    let current = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/sandbox/${activeSandbox.id}`);
        if (!response.ok) {
          console.warn(
            "[CodeHeaderControls] active sandbox refresh failed:",
            response.status,
          );
          return;
        }
        const data: SandboxDetailResponse = await response.json();
        if (current) dispatch(setActiveSandbox(data.instance));
      } catch (error) {
        console.warn(
          "[CodeHeaderControls] active sandbox refresh failed:",
          error,
        );
      }
    };
    const interval = window.setInterval(() => void refresh(), 15_000);
    return () => {
      current = false;
      window.clearInterval(interval);
    };
  }, [activeSandbox?.id, dispatch]);

  const status = activeSandbox ? getEffectiveStatus(activeSandbox) : null;
  const resources = activeSandbox?.config?.resources;
  const resourceLabel = resources
    ? [
        resources.cpu ? `${resources.cpu} CPU` : null,
        resources.memory_mb ? `${resources.memory_mb} MB` : null,
        resources.disk_mb ? `${resources.disk_mb} MB disk` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <div className="flex items-center w-full min-w-0 gap-0 p-0 space-x-0 space-y-0">
      {/* Toggles only make sense once the resizable panel layout is mounted. */}
      <div className="hidden lg:flex items-center gap-0 p-0 space-x-0 space-y-0">
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
      <h1 className="ml-0 lg:ml-2 text-sm font-medium text-foreground truncate">
        Code
      </h1>
      {activeSandbox && status && (
        <div className="ml-2 flex min-w-0 flex-1 items-center gap-1.5 border-l border-border pl-2 lg:ml-3 lg:gap-2 lg:pl-3">
          <div
            className="min-w-0 flex-1 leading-tight"
            title={sandboxDisplayName(activeSandbox)}
          >
            <div className="truncate text-xs font-medium text-foreground">
              {sandboxDisplayName(activeSandbox)}
            </div>
            <div
              className="hidden truncate font-mono text-[10px] text-muted-foreground lg:block"
              title={activeSandbox.hot_path ?? undefined}
            >
              {activeSandbox.hot_path ?? "Root unavailable"}
            </div>
          </div>
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${statusPillClasses(status)}`}
          >
            {STATUS_LABELS[status]}
          </span>
          {(activeSandbox.tier || resourceLabel) && (
            <span
              className="hidden max-w-48 truncate text-[10px] text-muted-foreground lg:block"
              title={[activeSandbox.tier, resourceLabel]
                .filter(Boolean)
                .join(" · ")}
            >
              {[activeSandbox.tier, resourceLabel].filter(Boolean).join(" · ")}
            </span>
          )}
          <CopyTapButton
            variant="transparent"
            ariaLabel={`Copy sandbox ID ${activeSandbox.id}`}
            tooltip="Copy sandbox ID"
            onClick={() => void copyText(activeSandbox.id, "Sandbox ID copied")}
          />
          <a
            href={`/sandbox/${encodeURIComponent(activeSandbox.id)}`}
            aria-label={`Manage ${sandboxDisplayName(activeSandbox)}`}
            className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground"
            title="Open sandbox details"
          >
            <span className="hidden lg:inline">Manage</span>
            <ExternalLink className="size-3" aria-hidden />
          </a>
        </div>
      )}
    </div>
  );
}

export default CodeHeaderControls;
