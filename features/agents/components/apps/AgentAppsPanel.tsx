"use client";

/**
 * AgentAppsPanel — apps that run a specific agent.
 *
 * Backed by `aga_apps.agent_id` (direct FK to `agx_agent`). The panel just
 * renders whatever `getAppsForAgent` returns; filtering and ownership are
 * handled by RLS on the server side.
 */

import Link from "next/link";
import { ExternalLink, LayoutGrid, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AgentAppsGrid } from "@/features/agent-apps/components/layouts/AgentAppsGrid";
import type { AgentApp } from "@/features/agent-apps/types";
import { useCreatorOwnershipSync } from "@/features/agents/hooks/useCreatorOwnershipSync";

interface AgentAppsPanelProps {
  agentId: string;
  agentName: string;
  apps: AgentApp[];
}

export function AgentAppsPanel({
  agentId,
  agentName,
  apps,
}: AgentAppsPanelProps) {
  useCreatorOwnershipSync(agentId);

  const publishedCount = apps.filter((a) => a.status === "published").length;
  const draftCount = apps.filter((a) => a.status === "draft").length;
  const featuredCount = apps.filter((a) => a.is_featured).length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 space-y-6">
        <header className="flex items-start justify-between gap-3 pt-10">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Apps
            </div>
            <h1 className="text-2xl font-semibold text-foreground leading-tight">
              {agentName}
            </h1>
            <p className="text-sm text-muted-foreground">
              Custom apps that run this agent under the hood.
            </p>
          </div>
          <div className="shrink-0 flex gap-2">
            <Link href={`/agent-apps/new?agent_id=${agentId}`}>
              <Button size="sm">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                New app
              </Button>
            </Link>
          </div>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <CountCard label="Total" value={apps.length} icon={LayoutGrid} />
          <CountCard
            label="Published"
            value={publishedCount}
            icon={LayoutGrid}
          />
          <CountCard label="Featured" value={featuredCount} icon={LayoutGrid} />
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              {apps.length === 0
                ? "No apps yet"
                : `${apps.length} ${apps.length === 1 ? "app" : "apps"}`}
              {draftCount > 0 && (
                <span className="text-muted-foreground font-normal">
                  {" "}
                  ({draftCount} draft{draftCount === 1 ? "" : "s"})
                </span>
              )}
            </h2>
          </div>

          <AgentAppsGrid
            apps={apps}
            hrefFor={(app) => `/agent-apps/${app.id}`}
            emptyLabel="No apps run this agent yet. Create one to get started."
          />
        </section>

        <Card className="bg-muted/30">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="text-xs text-muted-foreground flex-1">
              Looking for the platform-wide admin view?
            </div>
            <Link href="/administration/agent-apps/apps">
              <Button size="sm" variant="outline">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Open admin
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CountCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof LayoutGrid;
}) {
  return (
    <Card className="p-4 flex items-start gap-3">
      <div className="shrink-0 rounded-md bg-primary/10 text-primary p-2">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground uppercase tracking-wider">
          {label}
        </div>
        <div className="text-2xl font-semibold text-foreground leading-none mt-1">
          {value}
        </div>
      </div>
    </Card>
  );
}
