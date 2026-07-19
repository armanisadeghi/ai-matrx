"use client";

import React, { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Eye,
  FileText,
  Folder,
  Loader2,
  RefreshCw,
  Shield,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useAgentShortcuts } from "@/features/agent-shortcuts/hooks/useAgentShortcuts";
import { useOrgShortcutsContext } from "./OrgShortcutsContext";
import PageHeaderRightPortal from "@/features/shell/components/header/PageHeaderRightPortal";
import { TapTargetButton } from "@/components/icons/TapTargetButton";

const SCOPE = "organization" as const;

type Tile = {
  slugSegment: string;
  label: string;
  description: string;
  icon: typeof Folder;
  count: (counts: {
    shortcuts: number;
    categories: number;
    contentBlocks: number;
  }) => number;
};

const TILES: Tile[] = [
  {
    slugSegment: "shortcuts",
    label: "Shortcuts",
    description:
      "Agent-backed triggers surfaced in menus, buttons, and keyboard hotkeys for everyone in the organization.",
    icon: Zap,
    count: (c) => c.shortcuts,
  },
  {
    slugSegment: "categories",
    label: "Categories",
    description:
      "Organise organization shortcuts and content blocks by placement and hierarchy.",
    icon: Folder,
    count: (c) => c.categories,
  },
  {
    slugSegment: "content-blocks",
    label: "Content Blocks",
    description:
      "Reusable text/template blocks your members can insert from the agent context menu.",
    icon: FileText,
    count: (c) => c.contentBlocks,
  },
];

export default function OrgShortcutsDashboardPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = React.useState<string | null>(null);

  const { orgId, organizationId, organizationName, role, canWrite } =
    useOrgShortcutsContext();

  const { shortcuts, categories, contentBlocks, isLoading, refetch } =
    useAgentShortcuts({ scope: SCOPE, scopeId: organizationId });

  const counts = {
    shortcuts: shortcuts.length,
    categories: categories.length,
    contentBlocks: contentBlocks.length,
  };

  const activeShortcuts = shortcuts.filter((s) => s.isActive).length;
  const wiredShortcuts = shortcuts.filter((s) => s.agentId).length;

  const handleNavigate = (slugSegment: string) => {
    if (isPending) return;
    const href = `/organizations/${orgId}/shortcuts/${slugSegment}`;
    setPendingHref(href);
    startTransition(() => {
      router.push(href);
    });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <PageHeaderRightPortal>
        <TapTargetButton
          icon={
            <RefreshCw
              className={isLoading ? "animate-spin" : undefined}
            />
          }
          onClick={() => refetch()}
          disabled={isLoading}
          ariaLabel="Refresh"
          tooltip="Refresh"
        />
      </PageHeaderRightPortal>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 pt-[calc(var(--shell-header-h)+1rem)] pb-4 space-y-4">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
            <span className="whitespace-nowrap">Managing</span>
            <Badge variant="outline" className="text-[11px]">
              organization
            </Badge>
            <span className="whitespace-nowrap">scope for</span>
            <span className="font-medium text-foreground">
              {organizationName}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-3">
                <div className="text-2xl font-bold">{counts.shortcuts}</div>
                <div className="text-xs text-muted-foreground">Shortcuts</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-2xl font-bold text-primary">
                  {activeShortcuts}
                </div>
                <div className="text-xs text-muted-foreground">Active</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-2xl font-bold text-success">
                  {wiredShortcuts}
                </div>
                <div className="text-xs text-muted-foreground">
                  Wired to agent
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-2xl font-bold">
                  {counts.categories + counts.contentBlocks}
                </div>
                <div className="text-xs text-muted-foreground">
                  Categories + Blocks
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {TILES.map((tile) => {
              const Icon = tile.icon;
              const href = `/organizations/${orgId}/shortcuts/${tile.slugSegment}`;
              const navigating = isPending && pendingHref === href;
              return (
                <button
                  key={tile.slugSegment}
                  type="button"
                  onClick={() => handleNavigate(tile.slugSegment)}
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
                        <Badge variant="secondary" className="text-xs">
                          {tile.count(counts)}
                        </Badge>
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
              <div className="flex items-center gap-2 font-medium text-foreground">
                {canWrite ? (
                  <Shield className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
                About organization-scope management
              </div>
              {canWrite ? (
                <p>
                  As an organization{" "}
                  <span className="capitalize font-medium text-foreground">
                    {role}
                  </span>
                  , you can create, edit, and delete shortcuts, categories, and
                  content blocks on behalf of{" "}
                  <span className="font-medium text-foreground">
                    {organizationName}
                  </span>
                  . Changes are visible to every member immediately.
                </p>
              ) : (
                <p>
                  You are viewing organization shortcuts in read-only mode. Only
                  organization admins and owners can create, edit, or delete
                  organization-scoped rows. Ask an admin to request changes.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
