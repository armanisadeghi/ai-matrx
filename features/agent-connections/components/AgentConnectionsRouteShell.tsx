"use client";

import React, { useRef } from "react";
import { usePathname } from "next/navigation";
import { Panel, type Layout } from "react-resizable-panels";
import { ListTree } from "lucide-react";
import { useAppStore } from "@/lib/redux/hooks";
import {
  selectOrganizationId,
  selectProjectId,
  selectTaskId,
} from "@/lib/redux/slices/appContextSlice";
import {
  AGENT_CONNECTIONS_SURFACE_NAME,
  createAgentConnectionsScope,
} from "@/features/surfaces/manifests/agent-connections.manifest";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { ClientGroup } from "@/app/(dev)/demos/resizables/_lib/ClientGroup";
import { Handle } from "@/app/(dev)/demos/resizables/_lib/Handle";
import { RegisteredPanel } from "@/app/(dev)/demos/resizables/_lib/RegisteredPanel";
import { PanelControlProvider } from "@/app/(dev)/demos/resizables/_lib/PanelControlProvider";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { MobilePanelShell } from "@/features/shell/components/header/templates/MobilePanelShell";
import { AgentConnectionsSidebar } from "./AgentConnectionsSidebar";
import { AgentConnectionsHeaderControls } from "./AgentConnectionsHeaderControls";
import { AgentConnectionsNavProvider } from "./AgentConnectionsNavContext";
import { AGENT_CONNECTIONS_BASE, segmentToSection } from "../routing";
import { SIDEBAR_SECTIONS } from "../constants";
import { selectSelectedItemId, selectViewScope } from "../redux/ui/slice";

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
 *
 * Mobile (<md): the desktop resizable layout is dropped entirely in favor of
 * `MobilePanelShell` — the section content fills the screen and the sidebar
 * list becomes a bottom drawer reachable from one tap target in the shell
 * header (see `MobilePanelShell.tsx`). Desktop rendering is byte-identical.
 */
const AVAILABLE_SECTIONS = SIDEBAR_SECTIONS.map((s) => ({
  value: s.value,
  slug: s.urlSegment ?? s.value,
}));

export function AgentConnectionsRouteShell({
  defaultLayout,
  cookieName,
  children,
}: Props) {
  // ── Surface Values: `matrx-user/agent-connections` ────────────────────
  // Scope is assembled at Run time from the live URL + Redux — never a stale
  // render snapshot. Verticals with their own child surface (e.g. Skills)
  // mount a nested provider that out-depths this one.
  const store = useAppStore();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const getScope = () => {
    const state = store.getState();
    const segments = (pathnameRef.current ?? "").split("/").filter(Boolean);
    // ["agent-connections", "<section-slug>?"]
    const activeSection = segmentToSection(segments[1]);
    const viewScope = selectViewScope(state);
    let viewScopeId: string | null = null;
    if (viewScope === "organization") viewScopeId = selectOrganizationId(state);
    else if (viewScope === "project") viewScopeId = selectProjectId(state);
    else if (viewScope === "task") viewScopeId = selectTaskId(state);
    return createAgentConnectionsScope({
      active_section: activeSection,
      view_scope: viewScope,
      available_sections: AVAILABLE_SECTIONS,
      view_scope_id: viewScopeId ?? undefined,
      selected_item_id: selectSelectedItemId(state) ?? undefined,
    });
  };

  const mainPane = (
    <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
      {children}
    </div>
  );

  return (
    <SurfaceRuntimeProvider
      surfaceName={AGENT_CONNECTIONS_SURFACE_NAME}
      getScope={getScope}
    >
    <PanelControlProvider>
      <PageHeader>
        <AgentConnectionsHeaderControls />
      </PageHeader>
      <AgentConnectionsNavProvider mode="route">
        <MobilePanelShell
          desktop={
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
                {mainPane}
              </Panel>
            </ClientGroup>
          }
          main={mainPane}
          panels={[
            {
              id: "sections",
              label: "Sections",
              icon: ListTree,
              content: <AgentConnectionsSidebar basePath={AGENT_CONNECTIONS_BASE} />,
            },
          ]}
        />
      </AgentConnectionsNavProvider>
    </PanelControlProvider>
    </SurfaceRuntimeProvider>
  );
}
