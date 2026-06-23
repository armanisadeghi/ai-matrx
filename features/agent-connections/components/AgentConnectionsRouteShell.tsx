"use client";

import React from "react";
import { Panel, type Layout } from "react-resizable-panels";
import { ClientGroup } from "@/app/(dev)/demos/resizables/_lib/ClientGroup";
import { Handle } from "@/app/(dev)/demos/resizables/_lib/Handle";
import { RegisteredPanel } from "@/app/(dev)/demos/resizables/_lib/RegisteredPanel";
import { PanelControlProvider } from "@/app/(dev)/demos/resizables/_lib/PanelControlProvider";
import { AgentConnectionsSidebar } from "./AgentConnectionsSidebar";
import { AgentConnectionsNavProvider } from "./AgentConnectionsNavContext";
import { AGENT_CONNECTIONS_BASE } from "../routing";

const GROUP_ID = "agent-connections";
const GROUP_KEY = "root";

interface Props {
  defaultLayout?: Layout;
  cookieName: string;
  children: React.ReactNode;
}

/**
 * Two-pane resizable shell for the /agent-connections route family. Mirrors
 * the pattern in `features/tasks/components/TasksDesktopShell.tsx`:
 *   ┌──────────────┬──────────────────────────────────────┐
 *   │ Sidebar      │ Main (children = section page)       │
 *   │ (collapsible)│                                      │
 *   └──────────────┴──────────────────────────────────────┘
 *
 * The cookie is read on the server in `layout.tsx` so first paint already has
 * the saved width baked in.
 */
export function AgentConnectionsRouteShell({
  defaultLayout,
  cookieName,
  children,
}: Props) {
  return (
    <PanelControlProvider>
      <AgentConnectionsNavProvider mode="route">
        <ClientGroup
          id={GROUP_ID}
          groupKey={GROUP_KEY}
          cookieName={cookieName}
          orientation="horizontal"
          defaultLayout={defaultLayout}
          className="h-full w-full"
        >
          <RegisteredPanel
            registerAs="sidebar"
            groupKey={GROUP_KEY}
            id="sidebar"
            collapsible
            collapsedSize="0%"
            defaultSize="18%"
            minSize="10%"
          >
            <div className="h-full overflow-hidden pt-[var(--shell-header-h)] bg-muted/10 border-r border-border flex flex-col">
              <AgentConnectionsSidebar basePath={AGENT_CONNECTIONS_BASE} />
            </div>
          </RegisteredPanel>
          <Handle hideWhenCollapsed={["sidebar"]} />
          <Panel id="main" minSize="40%">
            <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
              {children}
            </div>
          </Panel>
        </ClientGroup>
      </AgentConnectionsNavProvider>
    </PanelControlProvider>
  );
}
