"use client";

import React from "react";
import { Panel, type Layout } from "react-resizable-panels";
import { ClientGroup } from "@/app/(dev)/demos/resizables/_lib/ClientGroup";
import { Handle } from "@/app/(dev)/demos/resizables/_lib/Handle";
import { RegisteredPanel } from "@/app/(dev)/demos/resizables/_lib/RegisteredPanel";
import { PanelControlProvider } from "@/app/(dev)/demos/resizables/_lib/PanelControlProvider";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { useIsMobile } from "@/hooks/use-mobile";
import { AgentConnectionsSidebar } from "./AgentConnectionsSidebar";
import { AgentConnectionsHeaderControls } from "./AgentConnectionsHeaderControls";
import { AgentConnectionsNavProvider } from "./AgentConnectionsNavContext";
import { AGENT_CONNECTIONS_BASE } from "../routing";

/** Runtime-only default: mobile always starts with the section list
 * collapsed so the main content doesn't get squeezed into a ~280px sliver
 * on first paint. The toggle in the header still opens it on tap. */
const MOBILE_DEFAULT_LAYOUT: Layout = { sidebar: 0, main: 100 };

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
  const isMobile = useIsMobile();
  // Mobile gets its own cookie namespace + always-collapsed default so its
  // runtime layout never overwrites the desktop-authored saved width — and
  // a `key` swap forces a clean remount (fresh defaultLayout) at the
  // breakpoint boundary instead of carrying over stale panel-library state.
  const effectiveCookieName = isMobile ? `${cookieName}:mobile` : cookieName;
  const effectiveDefaultLayout = isMobile ? MOBILE_DEFAULT_LAYOUT : defaultLayout;

  return (
    <PanelControlProvider>
      <PageHeader>
        <AgentConnectionsHeaderControls />
      </PageHeader>
      <AgentConnectionsNavProvider mode="route">
        <ClientGroup
          key={isMobile ? "mobile" : "desktop"}
          id={GROUP_ID}
          groupKey={GROUP_KEY}
          cookieName={effectiveCookieName}
          orientation="horizontal"
          defaultLayout={effectiveDefaultLayout}
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
