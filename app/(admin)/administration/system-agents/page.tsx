"use client";

import React, { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AppWindow,
  ArrowRight,
  Brain,
  FileText,
  Folder,
  GitBranch,
  Globe,
  Loader2,
  RefreshCw,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { fetchAgentsListFull } from "@/features/agents/redux/agent-definition/thunks";
import { selectBuiltinAgents } from "@/features/agents/redux/agent-definition/selectors";
import { useAgentShortcuts } from "@/features/agent-shortcuts/hooks/useAgentShortcuts";
import { fetchAgentAppsAdmin } from "@/lib/services/agent-apps-admin-service";

const SCOPE = "global" as const;

type TileCounts = {
  agents: number;
  shortcuts: number;
  categories: number;
  contentBlocks: number;
  apps: number;
};

type Tile = {
  href: string;
  label: string;
  description: string;
  icon: typeof Folder;
  count?: (counts: TileCounts) => number;
};

const TILES: Tile[] = [
  {
    href: "/administration/system-agents/agents",
    label: "Agents",
    description:
      "Browse, build, and run system (builtin) agents shipped to every user.",
    icon: Brain,
    count: (c) => c.agents,
  },
  {
    href: "/administration/system-agents/lineage",
    label: "Lineage",
    description:
      "See what each system agent gives rise to — derived agents, shortcuts, and apps — in one place.",
    icon: GitBranch,
  },
  {
    href: "/administration/system-agents/shortcuts",
    label: "Shortcuts",
    description:
      "Agent-backed triggers surfaced in menus, buttons, and keyboard hotkeys.",
    icon: Zap,
    count: (c) => c.shortcuts,
  },
  {
    href: "/administration/system-agents/categories",
    label: "Categories",
    description:
      "Organise shortcuts and content blocks by placement and hierarchy.",
    icon: Folder,
    count: (c) => c.categories,
  },
  {
    href: "/administration/system-agents/content-blocks",
    label: "Content Blocks",
    description:
      "Reusable text/template blocks insertable from the agent context menu.",
    icon: FileText,
    count: (c) => c.contentBlocks,
  },
  {
    href: "/administration/system-agents/apps",
    label: "Apps",
    description:
      "Global agent apps published to all users. Distinct from user-published apps.",
    icon: AppWindow,
    count: (c) => c.apps,
  },
];

export default function SystemAgentsDashboardPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = React.useState<string | null>(null);

  const { shortcuts, categories, contentBlocks, isLoading, refetch } =
    useAgentShortcuts({ scope: SCOPE });

  const builtinAgents = useAppSelector(selectBuiltinAgents);
  const [appCount, setAppCount] = useState<number | null>(null);
  const [appsLoading, setAppsLoading] = useState(false);

  const loadAppCount = React.useCallback(async () => {
    setAppsLoading(true);
    try {
      const rows = await fetchAgentAppsAdmin({ scope: "global", limit: 500 });
      setAppCount(rows.length);
    } catch {
      setAppCount(null);
    } finally {
      setAppsLoading(false);
    }
  }, []);

  useEffect(() => {
    dispatch(fetchAgentsListFull());
    void loadAppCount();
  }, [dispatch, loadAppCount]);

  const counts: TileCounts = {
    agents: builtinAgents.length,
    shortcuts: shortcuts.length,
    categories: categories.length,
    contentBlocks: contentBlocks.length,
    apps: appCount ?? 0,
  };

  const wiredShortcuts = shortcuts.filter((s) => s.agentId).length;

  const handleRefresh = () => {
    refetch();
    dispatch(fetchAgentsListFull());
    void loadAppCount();
  };

  const handleNavigate = (href: string) => {
    if (isPending) return;
    setPendingHref(href);
    startTransition(() => {
      router.push(href);
    });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 p-4 border-b border-border bg-card">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                System Agents Admin
              </h1>
              <p className="text-sm text-muted-foreground">
                Managing{" "}
                <Badge variant="outline" className="ml-0.5 text-[11px]">
                  global
                </Badge>{" "}
                scope. Changes apply to every user on the platform.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading || appsLoading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${
                isLoading || appsLoading ? "animate-spin" : ""
              }`}
            />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4 max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card>
              <CardContent className="p-3">
                <div className="text-2xl font-bold">{counts.agents}</div>
                <div className="text-xs text-muted-foreground">
                  System agents
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-2xl font-bold">{counts.shortcuts}</div>
                <div className="text-xs text-muted-foreground">Shortcuts</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-2xl font-bold text-success">
                  {wiredShortcuts}
                </div>
                <div className="text-xs text-muted-foreground">
                  Wired shortcuts
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-2xl font-bold">
                  {counts.categories + counts.contentBlocks}
                </div>
                <div className="text-xs text-muted-foreground">
                  Cats + Blocks
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-2xl font-bold">
                  {appsLoading && appCount === null ? "—" : counts.apps}
                </div>
                <div className="text-xs text-muted-foreground">System apps</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {TILES.map((tile) => {
              const Icon = tile.icon;
              const navigating = isPending && pendingHref === tile.href;
              const countValue = tile.count ? tile.count(counts) : null;
              return (
                <button
                  key={tile.href}
                  type="button"
                  onClick={() => handleNavigate(tile.href)}
                  disabled={isPending}
                  className="text-left group focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Card className="h-full hover:border-primary/50 transition-colors">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                          {navigating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Icon className="h-4 w-4" />
                          )}
                        </div>
                        {countValue !== null && (
                          <Badge variant="secondary" className="text-xs">
                            {countValue}
                          </Badge>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 text-foreground font-medium group-hover:text-primary transition-colors">
                          {tile.label}
                          <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          {tile.description}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </button>
              );
            })}
          </div>

          <Card className="border-dashed">
            <CardContent className="p-4 text-sm text-muted-foreground space-y-1.5">
              <div className="font-medium text-foreground">
                About global-scope management
              </div>
              <p>
                Everything you create here is available to every user on the
                platform unless overridden by a user- or organization-scope
                entry. User and organization scopes are managed in separate
                routes — this page only writes global rows.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
