"use client";

import { useEffect, useRef } from "react";
import { ChevronDown, ChevronRight, PanelsTopLeft } from "lucide-react";
import {
  Group,
  Panel,
  Separator,
  type PanelImperativeHandle,
} from "react-resizable-panels";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectActiveSandbox,
  selectExplorerSandboxMode,
  setExplorerSandboxMode,
} from "../../redux/codeWorkspaceSlice";
import { sandboxDisplayName } from "@/lib/sandbox/format";
import {
  getEffectiveStatus,
  STATUS_LABELS,
  statusPillClasses,
} from "@/lib/sandbox/status";
import { useOpenSandboxManagementWindow } from "@/features/overlays/openers/sandboxManagementWindow";
import { SandboxVersionHealthCard } from "../sandboxes/SandboxVersionHealthCard";
import { ExplorerPanel } from "./ExplorerPanel";
import { cn } from "@/lib/utils";

/** A second view of the active sandbox, below the files; the library owns its live size. */
export function ExplorerSandboxSplit() {
  const dispatch = useAppDispatch();
  const sandbox = useAppSelector(selectActiveSandbox);
  const mode = useAppSelector(selectExplorerSandboxMode);
  const panel = useRef<PanelImperativeHandle | null>(null);
  const openControls = useOpenSandboxManagementWindow();
  const expanded = mode === "open";
  const hasExpanded = useRef(expanded);
  const initialPaneSize = useRef(
    expanded ? "35%" : mode === "hidden" ? "0px" : "44px",
  ).current;

  // URL Back/Forward also controls the same single collapsible panel.
  useEffect(() => {
    if (mode === "open") {
      if (hasExpanded.current) panel.current?.expand();
      else {
        panel.current?.resize("35%");
        hasExpanded.current = true;
      }
    } else {
      panel.current?.collapse();
      if (mode === "hidden") hasExpanded.current = false;
    }
  }, [mode]);

  const explorer = (
    <ExplorerPanel
      onShowSandbox={() =>
        dispatch(setExplorerSandboxMode(mode === "hidden" ? "open" : "hidden"))
      }
      sandboxPaneVisible={mode !== "hidden"}
    />
  );
  if (!sandbox) return explorer;
  const name = sandboxDisplayName(sandbox);
  const status = getEffectiveStatus(sandbox);
  return (
    <Group
      id="explorer-sandbox-split"
      orientation="vertical"
      className="h-full min-h-0"
      resizeTargetMinimumSize={{ coarse: 20, fine: 8 }}
    >
      <Panel id="explorer-files" minSize="25%">
        {explorer}
      </Panel>
      <Separator
        aria-label="Resize files and live sandbox"
        disabled={!expanded}
        className={cn(
          "shrink-0 bg-border focus:outline-none data-[separator=hover]:bg-primary/50 data-[separator=active]:bg-primary data-[separator=dragging]:bg-primary",
          mode === "hidden" ? "h-0" : "h-1",
        )}
      />
      <Panel
        id="explorer-live-sandbox"
        panelRef={panel}
        defaultSize={initialPaneSize}
        minSize="140px"
        collapsible
        collapsedSize={mode === "hidden" ? "0px" : "44px"}
        onResize={(next, _id, previous) => {
          if (!previous || mode === "hidden") return;
          const collapsed = next.inPixels <= 45;
          const wasCollapsed = previous.inPixels <= 45;
          if (collapsed !== wasCollapsed)
            dispatch(setExplorerSandboxMode(collapsed ? "collapsed" : "open"));
        }}
      >
        <section
          className="flex h-full min-h-0 flex-col bg-muted/20"
          aria-label="Live sandbox"
          aria-hidden={mode === "hidden"}
          inert={mode === "hidden"}
        >
          <div className="flex h-11 shrink-0 items-center gap-1 px-2">
            <button
              type="button"
              className="flex h-11 min-w-0 flex-1 items-center gap-1.5 text-left text-xs font-medium"
              aria-expanded={expanded}
              onClick={() =>
                dispatch(
                  setExplorerSandboxMode(expanded ? "collapsed" : "open"),
                )
              }
              title={name}
            >
              {expanded ? (
                <ChevronDown size={13} />
              ) : (
                <ChevronRight size={13} />
              )}
              <span className="truncate">Sandbox</span>
              <span
                className={cn(
                  "ml-auto rounded px-1.5 py-0.5 text-[10px]",
                  statusPillClasses(status),
                )}
              >
                {STATUS_LABELS[status]}
              </span>
            </button>
            <button
              type="button"
              aria-label="Open live sandbox controls"
              title="Open live sandbox controls"
              className="flex h-11 w-9 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() =>
                openControls({ sandboxId: sandbox.id, title: name })
              }
            >
              <PanelsTopLeft size={14} />
            </button>
          </div>
          <div
            className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3"
            hidden={!expanded}
          >
            <div className="space-y-1 text-xs">
              <div className="truncate font-medium" title={name}>
                {name}
              </div>
              <div
                className="truncate text-muted-foreground"
                title={sandbox.hot_path ?? "/home/agent"}
              >
                {sandbox.hot_path ?? "/home/agent"} ·{" "}
                {sandbox.tier ?? sandbox.config?.tier ?? "Sandbox"}
              </div>
            </div>
            {expanded && (
              <SandboxVersionHealthCard
                key={sandbox.id}
                sandboxId={sandbox.id}
              />
            )}
          </div>
        </section>
      </Panel>
    </Group>
  );
}
