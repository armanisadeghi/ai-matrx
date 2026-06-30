"use client";

import React, { useState, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { fetchFullAgent } from "@/features/agents/redux/agent-definition/thunks";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { AgentSettingsForm } from "@/features/agents/components/settings/AgentSettingsForm";
import {
  AgentSidebar,
  AgentTabs,
} from "@/features/agents/components/settings/AgentSettingsWorkspace";

interface AgentSettingsWindowProps {
  initialAgentId?: string;
  isOpen?: boolean;
  onClose?: () => void;
}

export default function AgentSettingsWindow({
  initialAgentId,
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

  useEffect(() => {
    if (initialAgentId) {
      dispatch(fetchFullAgent(initialAgentId));
    }
  }, [initialAgentId, dispatch]);

  const openAgent = (agentId: string) => {
    if (!openedTabIds.includes(agentId)) {
      setOpenedTabIds((prev) => [...prev, agentId]);
    }
    setActiveTabId(agentId);
    dispatch(fetchFullAgent(agentId));
  };

  const closeTab = (e: React.MouseEvent, agentId: string) => {
    e.stopPropagation();
    const newTabs = openedTabIds.filter((id) => id !== agentId);
    setOpenedTabIds(newTabs);
    if (activeTabId === agentId) {
      setActiveTabId(newTabs.length > 0 ? newTabs[newTabs.length - 1] : null);
    }
  };

  return (
    <WindowPanel
      id="agent-settings-window"
      title="Agent Info Editor"
      onClose={onClose}
      width={900}
      height={700}
      minWidth={600}
      minHeight={400}
      overlayId="agentSettingsWindow"
      onCollectData={() => ({ initialAgentId, openedTabIds, activeTabId })}
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

        <div className="flex-1 overflow-y-auto w-full relative">
          {activeTabId ? (
            <AgentSettingsForm key={activeTabId} agentId={activeTabId} />
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
  );
}
