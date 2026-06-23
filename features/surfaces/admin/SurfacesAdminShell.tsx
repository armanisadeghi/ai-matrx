"use client";

import { Panel, type Layout } from "react-resizable-panels";
import { ClientGroup } from "@/app/(dev)/demos/resizables/_lib/ClientGroup";
import { Handle } from "@/app/(dev)/demos/resizables/_lib/Handle";
import { PanelControlProvider } from "@/app/(dev)/demos/resizables/_lib/PanelControlProvider";
import { RegisteredPanel } from "@/app/(dev)/demos/resizables/_lib/RegisteredPanel";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { useIsMobile } from "@/hooks/use-mobile";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import { SurfacesAdminHeader } from "./SurfacesAdminHeader";
import { SurfacesListColumn } from "./columns/SurfacesListColumn";
import { AgentColumn } from "./columns/AgentColumn";
import { BindingColumn } from "./columns/BindingColumn";
import { SurfaceDetailsColumn } from "./columns/SurfaceDetailsColumn";
import { PlaygroundColumn } from "./columns/PlaygroundColumn";

export const SURFACES_ADMIN_COOKIE = "panels:agent-surfaces";

const GROUP_KEY = "surfaces-admin";

/**
 * 5-panel admin shell:
 *   surfaces-list  |  agent  |  binding (filler)  |  surface-details  |  playground
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
}: {
  agent: AgentDefinition;
  backHref: string;
  defaultLayout: Layout | undefined;
}) {
  const isMobile = useIsMobile();

  return (
    <PanelControlProvider>
      <PageHeader>
        <SurfacesAdminHeader agentName={agent.name} backHref={backHref} />
      </PageHeader>

      {isMobile ? (
        <MobileStack agent={agent} />
      ) : (
        <DesktopResizable agent={agent} defaultLayout={defaultLayout} />
      )}
    </PanelControlProvider>
  );
}

function DesktopResizable({
  agent,
  defaultLayout,
}: {
  agent: AgentDefinition;
  defaultLayout: Layout | undefined;
}) {
  return (
    <div className="h-full overflow-hidden">
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
          <SurfacesListColumn agentId={agent.id} />
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
        <Handle hideWhenCollapsed={["surface-details", "playground"]} />

        <RegisteredPanel
          registerAs="playground"
          groupKey={GROUP_KEY}
          id="playground"
          collapsible
          collapsedSize="0%"
          defaultSize="16%"
          minSize="4%"
        >
          <PlaygroundColumn />
        </RegisteredPanel>
      </ClientGroup>
    </div>
  );
}

function MobileStack({ agent }: { agent: AgentDefinition }) {
  // Simple vertical stack. Each section gets a min-height so it's
  // recognisable but doesn't dominate the screen. The page is not
  // designed FOR mobile — just functional ON it.
  return (
    <div className="h-full overflow-auto">
      <div className="min-h-[320px] border-b border-border">
        <SurfacesListColumn agentId={agent.id} />
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
        <PlaygroundColumn />
      </div>
    </div>
  );
}
