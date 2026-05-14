"use client";

import React, { useCallback, useEffect } from "react";
import { Settings } from "lucide-react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { AgentConnectionsSidebar } from "@/features/agent-connections/components/AgentConnectionsSidebar";
import { AgentConnectionsBody } from "@/features/agent-connections/components/AgentConnectionsBody";
import { AgentConnectionsNavProvider } from "@/features/agent-connections/components/AgentConnectionsNavContext";
import type { AgentConnectionsSection } from "@/features/agent-connections/types";
import { ScopePicker } from "@/features/agent-connections/components/ScopePicker";
import {
  hydrateAgentConnectionsUi,
  selectActiveSection,
  selectViewScope,
  selectSelectedItemId,
  setActiveSection,
} from "@/features/agent-connections/redux/ui/slice";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import type { Scope } from "@/features/agent-connections/types";

interface AgentConnectionsWindowProps {
  isOpen: boolean;
  onClose: () => void;
  initialSection?: AgentConnectionsSection;
  initialScope?: Scope;
  initialSelectedItemId?: string | null;
}

export default function AgentConnectionsWindow(
  props: AgentConnectionsWindowProps,
) {
  if (!props.isOpen) return null;
  return <AgentConnectionsWindowInner {...props} />;
}

function AgentConnectionsWindowInner({
  onClose,
  initialSection,
  initialScope,
  initialSelectedItemId,
}: AgentConnectionsWindowProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  const activeSection = useAppSelector(selectActiveSection);

  // Hydrate UI slice from overlayData on first mount. The slice holds the
  // session truth — persisted back out via onCollectData below.
  useEffect(() => {
    dispatch(
      hydrateAgentConnectionsUi({
        activeSection: initialSection ?? "overview",
        viewScope: initialScope ?? "user",
        selectedItemId: initialSelectedItemId ?? null,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const collectData = useCallback((): Record<string, unknown> => {
    // Read the current Redux state at save time — NEVER use stale closure values.
    const state = store.getState();
    return {
      activeSection: selectActiveSection(state),
      scope: selectViewScope(state),
      selectedItemId: selectSelectedItemId(state),
    };
  }, [store]);

  const sidebarContent = (
    <AgentConnectionsSidebar
      activeSection={activeSection}
      onSelect={(next) => dispatch(setActiveSection(next))}
    />
  );

  const titleNode = (
    <span className="inline-flex items-center gap-1.5">
      <Settings className="h-3.5 w-3.5 text-muted-foreground" />
      Agent Customizations
    </span>
  );

  return (
    <AgentConnectionsNavProvider mode="overlay">
      <WindowPanel
        id="agent-connections-window"
        titleNode={titleNode}
        title="Agent Customizations"
        width={1100}
        height={720}
        minWidth={640}
        minHeight={420}
        position="center"
        onClose={onClose}
        actionsRight={<ScopePicker />}
        sidebar={sidebarContent}
        sidebarDefaultSize={220}
        sidebarMinSize={180}
        sidebarClassName="bg-muted/10 border-r border-border"
        overlayId="agentConnectionsWindow"
        onCollectData={collectData}
        bodyClassName="bg-background"
      >
        <AgentConnectionsBody />
      </WindowPanel>
    </AgentConnectionsNavProvider>
  );
}
