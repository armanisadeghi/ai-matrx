"use client";

import React, { useState, useEffect } from "react";
import { FileText, Link2 } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { fetchFullAgent } from "@/features/agents/redux/agent-definition/thunks";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { AgentSettingsForm } from "@/features/agents/components/settings/AgentSettingsForm";
import {
  AgentSidebar,
  AgentTabs,
} from "@/features/agents/components/settings/AgentSettingsWorkspace";
import { SurfaceAgentBindPanel } from "@/features/surfaces/components/bind/SurfaceAgentBindPanel";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { AGENT_SETTINGS_SURFACE_NAME } from "@/features/agents/constants/agent-settings-surface";
import { useAgentSettingsSurface } from "./useAgentSettingsSurface";
import { cn } from "@/lib/utils";

type PanelView = "info" | "surface";

interface AgentSettingsWindowProps {
  initialAgentId?: string;
  /**
   * When set, the window gains a Surface tab that edits this agent's
   * binding/mappings for that surface (surface-context openers pass this).
   */
  surfaceName?: string;
  /**
   * Which pane to open first when `surfaceName` is present.
   * Defaults to `"surface"` so surface-context openers land on bindings.
   */
  initialView?: PanelView;
  isOpen?: boolean;
  onClose?: () => void;
}

export default function AgentSettingsWindow({
  initialAgentId,
  surfaceName,
  initialView,
  isOpen,
  onClose,
}: AgentSettingsWindowProps) {
  const dispatch = useAppDispatch();
  const [openedTabIds, setOpenedTabIds] = useState<string[]>(
    initialAgentId ? [initialAgentId] : [],
  );
  const [activeTabId, setActiveTabId] = useState<string | null>(
    initialAgentId || null,
  );
  const hasSurfaceContext = !!surfaceName?.trim();
  const [panelView, setPanelView] = useState<PanelView>(() => {
    if (!hasSurfaceContext) return "info";
    return initialView === "info" ? "info" : "surface";
  });

  useEffect(() => {
    if (initialAgentId) {
      dispatch(fetchFullAgent(initialAgentId));
    }
  }, [initialAgentId, dispatch]);

  // If surface context arrives after mount (URL restore), ensure the Surface
  // tab is available and prefer it when the opener asked for surface-first.
  useEffect(() => {
    if (!hasSurfaceContext) {
      setPanelView("info");
      return;
    }
    if (initialView === "info") return;
    setPanelView("surface");
  }, [hasSurfaceContext, initialView]);

  const openAgent = (agentId: string) => {
    if (!openedTabIds.includes(agentId)) {
      setOpenedTabIds((prev) => [...prev, agentId]);
    }
    setActiveTabId(agentId);
    dispatch(fetchFullAgent(agentId));
  };

  // Surface runtime — this window is the ONLY mount of
  // `matrx-user/agent-settings`. It publishes the read half (which agents are
  // open, which pane is showing, and the open agent's own fields); the WRITE
  // half is registered by `AgentSettingsForm` below, which owns the draft state
  // `settings_catalog_profile` stages into.
  const { getScope } = useAgentSettingsSurface({
    activeTabId,
    openedTabIds,
    panelView,
    boundSurfaceName: surfaceName,
  });

  const closeTab = (e: React.MouseEvent, agentId: string) => {
    e.stopPropagation();
    const newTabs = openedTabIds.filter((id) => id !== agentId);
    setOpenedTabIds(newTabs);
    if (activeTabId === agentId) {
      setActiveTabId(newTabs.length > 0 ? newTabs[newTabs.length - 1] : null);
    }
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName={AGENT_SETTINGS_SURFACE_NAME}
      getScope={getScope}
      isEditable
    >
      <WindowPanel
        id="agent-settings-window"
        title={hasSurfaceContext ? "Agent Settings" : "Agent Info Editor"}
        onClose={onClose}
        width={900}
        height={700}
        minWidth={600}
        minHeight={400}
        overlayId="agentSettingsWindow"
        onCollectData={() => ({
          initialAgentId,
          surfaceName: surfaceName ?? null,
          initialView: panelView,
          openedTabIds,
          activeTabId,
        })}
        sidebar={
          <AgentSidebar
            openedTabIds={openedTabIds}
            activeTabId={activeTabId}
            onOpenAgent={openAgent}
          />
        }
        sidebarDefaultSize={260}
        sidebarMinSize={200}
        urlSyncKey="agent-settings"
        urlSyncId="agent-settings-window"
        urlSyncArgs={{ m: "as" }}
      >
        <div className="flex-1 flex flex-col h-full bg-background min-w-0">
          <AgentTabs
            openedTabIds={openedTabIds}
            activeTabId={activeTabId}
            onSetActive={setActiveTabId}
            onCloseTab={closeTab}
          />

          {hasSurfaceContext && activeTabId && (
            <div className="flex shrink-0 border-b border-border px-3">
              <button
                type="button"
                onClick={() => setPanelView("info")}
                className={cn(
                  "relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors select-none",
                  panelView === "info"
                    ? "text-foreground border-b-2 border-primary -mb-px"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <FileText className="h-3 w-3" />
                Info
              </button>
              <button
                type="button"
                onClick={() => setPanelView("surface")}
                className={cn(
                  "relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors select-none",
                  panelView === "surface"
                    ? "text-foreground border-b-2 border-primary -mb-px"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Link2 className="h-3 w-3" />
                Surface
              </button>
            </div>
          )}

          <div className="flex-1 overflow-hidden w-full relative min-h-0">
            {activeTabId ? (
              hasSurfaceContext && panelView === "surface" && surfaceName ? (
                <SurfaceAgentBindPanel
                  key={`${activeTabId}:${surfaceName}`}
                  surfaceName={surfaceName}
                  initialAgentId={activeTabId}
                  lockAgent
                  className="h-full"
                />
              ) : (
                <div className="h-full overflow-y-auto">
                  <AgentSettingsForm
                    key={activeTabId}
                    agentId={activeTabId}
                    writeSurfaceName={AGENT_SETTINGS_SURFACE_NAME}
                  />
                </div>
              )
            ) : (
              <div className="flex flex-col items-center justify-center p-8 text-center h-[300px] text-muted-foreground">
                <p className="text-sm font-medium">
                  Select an agent to edit info
                </p>
                <p className="text-xs opacity-70 mt-1">
                  Open the sidebar to browse agents
                </p>
              </div>
            )}
          </div>
        </div>
      </WindowPanel>
    </SurfaceRuntimeProvider>
  );
}
