"use client";

import { Panel, type Layout } from "react-resizable-panels";
import { ClientGroup } from "@/features/resizable-panels/ClientGroup";
import { Handle } from "@/features/resizable-panels/Handle";
import { PanelControlProvider } from "@/features/resizable-panels/PanelControlProvider";
import { RegisteredPanel } from "@/features/resizable-panels/RegisteredPanel";
import { PageSpecificHeader } from "@/components/layout/new-layout/PageSpecificHeaderPortal";
import { useIsMobile } from "@/hooks/use-mobile";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import { SurfacesAgentHeaderControls } from "./SurfacesAgentHeaderControls";
import { SurfacesListColumn } from "./columns/SurfacesListColumn";
import { AgentColumn } from "./columns/AgentColumn";
import { BindingColumn } from "./columns/BindingColumn";
import { SurfaceDetailsColumn } from "./columns/SurfaceDetailsColumn";
import { AgentAccessColumn } from "./columns/AgentAccessColumn";

export const SURFACES_ADMIN_COOKIE = "panels:agent-surfaces";

const GROUP_KEY = "surfaces-admin";

/**
 * 5-panel admin shell:
 *   surfaces-list  |  agent  |  binding (filler)  |  surface-details  |  agent-access
 *
 * The center "binding" panel is non-collapsible so it always absorbs
 * delta when other panels collapse. This mirrors the mac-mail reference
 * (`/demos/resizables/04-mac-mail`).
 *
 * Mobile fallback: the resizable layout drops out below the `md` breakpoint
 * and the columns stack vertically.
 */
export function SurfacesAdminShell({
  agent,
  backHref,
  defaultLayout,
  basePath = "/agents",
}: {
  agent: AgentDefinition;
  backHref: string;
  defaultLayout: Layout | undefined;
  /** Base path for the shared agent header's mode tabs. `/agents` for the core
   *  surface; the admin route passes its system-agents base. */
  basePath?: string;
}) {
  const isMobile = useIsMobile();

  return (
    <PanelControlProvider>
      <PageSpecificHeader>
        <SurfacesAgentHeaderControls
          agentId={agent.id}
          agentName={agent.name}
          backHref={backHref}
          basePath={basePath}
        />
      </PageSpecificHeader>

      <div className="h-full overflow-hidden">
        {isMobile ? (
          <MobileStack agent={agent} basePath={basePath} />
        ) : (
          <DesktopResizable
            agent={agent}
            defaultLayout={defaultLayout}
            basePath={basePath}
          />
        )}
      </div>
    </PanelControlProvider>
  );
}

function DesktopResizable({
  agent,
  defaultLayout,
  basePath,
}: {
  agent: AgentDefinition;
  defaultLayout: Layout | undefined;
  basePath: string;
}) {
  return (
    <ClientGroup
      id="surfaces-admin-root"
      groupKey={GROUP_KEY}
      cookieName={SURFACES_ADMIN_COOKIE}
      orientation="horizontal"
      defaultLayout={defaultLayout}
      className="h-full w-full"
    >
      <RegisteredPanel
        registerAs="surfaces-list"
        groupKey={GROUP_KEY}
        id="surfaces-list"
        collapsible
        collapsedSize="0%"
        defaultSize="12%"
        minSize="4%"
      >
        <SurfacesListColumn agentId={agent.id} basePath={basePath} />
      </RegisteredPanel>
      <Handle hideWhenCollapsed={["surfaces-list", "agent"]} />

      <RegisteredPanel
        registerAs="agent"
        groupKey={GROUP_KEY}
        id="agent"
        collapsible
        collapsedSize="0%"
        defaultSize="11%"
        minSize="4%"
      >
        <AgentColumn agent={agent} />
      </RegisteredPanel>
      <Handle hideWhenCollapsed={["agent"]} />

      <Panel id="binding" minSize="10%">
        <BindingColumn agent={agent} />
      </Panel>
      <Handle hideWhenCollapsed={["surface-details"]} />

      <RegisteredPanel
        registerAs="surface-details"
        groupKey={GROUP_KEY}
        id="surface-details"
        collapsible
        collapsedSize="0%"
        defaultSize="18%"
        minSize="4%"
      >
        <SurfaceDetailsColumn agent={agent} />
      </RegisteredPanel>
      <Handle hideWhenCollapsed={["surface-details", "agent-access"]} />

      <RegisteredPanel
        registerAs="agent-access"
        groupKey={GROUP_KEY}
        id="agent-access"
        collapsible
        collapsedSize="0%"
        defaultSize="16%"
        minSize="4%"
      >
        <AgentAccessColumn agent={agent} />
      </RegisteredPanel>
    </ClientGroup>
  );
}

function MobileStack({
  agent,
  basePath,
}: {
  agent: AgentDefinition;
  basePath: string;
}) {
  // Simple vertical stack. Each section gets a min-height so it's
  // recognisable but doesn't dominate the screen. The page is not
  // designed FOR mobile — just functional ON it.
  return (
    <div className="h-full overflow-auto">
      <div className="min-h-[320px] border-b border-border">
        <SurfacesListColumn agentId={agent.id} basePath={basePath} />
      </div>
      <div className="min-h-[280px] border-b border-border">
        <AgentColumn agent={agent} />
      </div>
      <div className="min-h-[480px] border-b border-border">
        <BindingColumn agent={agent} />
      </div>
      <div className="min-h-[280px] border-b border-border">
        <SurfaceDetailsColumn agent={agent} />
      </div>
      <div className="min-h-[200px]">
        <AgentAccessColumn agent={agent} />
      </div>
    </div>
  );
}
