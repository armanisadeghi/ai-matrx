"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { HierarchyTree } from "@/features/agent-context/components/hierarchy-selection/HierarchyTree";
import { HierarchyCascade } from "@/features/agent-context/components/hierarchy-selection/HierarchyCascade";
import { HierarchyBreadcrumb } from "@/features/agent-context/components/hierarchy-selection/HierarchyBreadcrumb";
import { HierarchyCommand } from "@/features/agent-context/components/hierarchy-selection/HierarchyCommand";
import { HierarchyPills } from "@/features/agent-context/components/hierarchy-selection/HierarchyPills";
import { HierarchyHoverMenu } from "@/features/agent-context/components/hierarchy-selection/HierarchyHoverMenu";
import {
  EMPTY_SELECTION,
  type HierarchySelection,
} from "@/features/agent-context/components/hierarchy-selection/types";

// ─── Shared debug widget ──────────────────────────────────────────────────

function SelectionDebug({
  label,
  value,
}: {
  label: string;
  value: HierarchySelection;
}) {
  const scopeEntries = Object.entries(value.scopeSelections ?? {}).filter(
    ([, v]) => v,
  );

  const isEmpty =
    !value.organizationId &&
    !value.projectId &&
    !value.taskId &&
    scopeEntries.length === 0;

  return (
    <div className="mt-2 p-2 bg-muted/30 rounded-md border border-border/50">
      <p className="text-[9px] font-mono text-muted-foreground mb-1">
        {label}:
      </p>
      <div className="flex flex-wrap gap-1">
        {value.organizationName && (
          <Badge
            variant="outline"
            className="text-[9px] h-4 px-1 border-violet-500/30 text-violet-600 dark:text-violet-400"
          >
            org: {value.organizationName}
          </Badge>
        )}
        {scopeEntries.map(([typeId, scopeId]) => (
          <Badge
            key={typeId}
            variant="outline"
            className="text-[9px] h-4 px-1 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
          >
            scope: {scopeId?.slice(0, 8)}…
          </Badge>
        ))}
        {value.projectName && (
          <Badge
            variant="outline"
            className="text-[9px] h-4 px-1 border-amber-500/30 text-amber-600 dark:text-amber-400"
          >
            proj: {value.projectName}
          </Badge>
        )}
        {value.taskName && (
          <Badge
            variant="outline"
            className="text-[9px] h-4 px-1 border-sky-500/30 text-sky-600 dark:text-sky-400"
          >
            task: {value.taskName}
          </Badge>
        )}
        {isEmpty && (
          <span className="text-[9px] text-muted-foreground italic">
            nothing selected
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function HierarchySelectionDemoPage() {
  const [hoverFlatVal, setHoverFlatVal] =
    useState<HierarchySelection>(EMPTY_SELECTION);
  const [hoverGroupedVal, setHoverGroupedVal] =
    useState<HierarchySelection>(EMPTY_SELECTION);
  const [hoverOrgsVal, setHoverOrgsVal] =
    useState<HierarchySelection>(EMPTY_SELECTION);
  const [treeVal, setTreeVal] = useState<HierarchySelection>(EMPTY_SELECTION);
  const [cascadeHVal, setCascadeHVal] =
    useState<HierarchySelection>(EMPTY_SELECTION);
  const [cascadeVVal, setCascadeVVal] =
    useState<HierarchySelection>(EMPTY_SELECTION);
  const [breadcrumbVal, setBreadcrumbVal] =
    useState<HierarchySelection>(EMPTY_SELECTION);
  const [commandVal, setCommandVal] =
    useState<HierarchySelection>(EMPTY_SELECTION);
  const [pillsVal, setPillsVal] = useState<HierarchySelection>(EMPTY_SELECTION);

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-bold">Hierarchy Selection System</h1>
        <p className="text-sm text-muted-foreground mt-1">
          6 variants of the org / scope / project / task picker. All share one
          data hook backed by a single{" "}
          <code className="text-[11px] bg-muted px-1 rounded">
            get_user_full_context
          </code>{" "}
          RPC call cached in Redux.
        </p>
      </div>

      <Separator />

      {/* ── NEW: HierarchyHoverMenu ─────────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            HierarchyHoverMenu
            <Badge className="text-[9px] h-4">NEW</Badge>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Hover to open. Flat view — all scopes and projects visible
            immediately without clicking through an org first. Selecting any
            item auto-fills the full path (org → scopes → project → task).
            Refresh and add-new built in.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Flat (default) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                Flat view
                <Badge variant="secondary" className="text-[9px] h-4">
                  default
                </Badge>
              </CardTitle>
              <p className="text-[10px] text-muted-foreground">
                All items across all orgs — no grouping. Fastest path to
                anything.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              <HierarchyHoverMenu
                levels={["organization", "scope", "project", "task"]}
                value={hoverFlatVal}
                onChange={setHoverFlatVal}
                viewMode="flat"
                placeholder="Hover to select..."
              />
              <SelectionDebug label="flat" value={hoverFlatVal} />
            </CardContent>
          </Card>

          {/* Grouped */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                Grouped view
                <Badge variant="secondary" className="text-[9px] h-4">
                  grouped
                </Badge>
              </CardTitle>
              <p className="text-[10px] text-muted-foreground">
                Same flat list but divided into org sections for clarity.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              <HierarchyHoverMenu
                levels={["organization", "scope", "project", "task"]}
                value={hoverGroupedVal}
                onChange={setHoverGroupedVal}
                viewMode="grouped"
                placeholder="Hover to select..."
              />
              <SelectionDebug label="grouped" value={hoverGroupedVal} />
            </CardContent>
          </Card>

          {/* With org items visible */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                Show orgs
                <Badge variant="secondary" className="text-[9px] h-4">
                  showOrgs
                </Badge>
              </CardTitle>
              <p className="text-[10px] text-muted-foreground">
                Orgs appear as selectable top-level items.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              <HierarchyHoverMenu
                levels={["organization", "scope", "project"]}
                value={hoverOrgsVal}
                onChange={setHoverOrgsVal}
                viewMode="flat"
                placeholder="Hover to select..."
              />
              <SelectionDebug label="with orgs" value={hoverOrgsVal} />
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator />

      {/* ── Existing variants ──────────────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold mb-4">Other variants</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Tree */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                HierarchyTree
                <Badge variant="secondary" className="text-[9px] h-4">
                  sidebar / explorer
                </Badge>
              </CardTitle>
              <p className="text-[10px] text-muted-foreground">
                Expandable tree with search. Best for full-page sidebars.
              </p>
            </CardHeader>
            <CardContent>
              <div className="h-[280px] border border-border rounded-lg overflow-hidden">
                <HierarchyTree
                  levels={["organization", "scope", "project", "task"]}
                  value={treeVal}
                  onChange={setTreeVal}
                />
              </div>
              <SelectionDebug label="tree" value={treeVal} />
            </CardContent>
          </Card>

          {/* Cascade horizontal */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                HierarchyCascade
                <Badge variant="secondary" className="text-[9px] h-4">
                  horizontal
                </Badge>
              </CardTitle>
              <p className="text-[10px] text-muted-foreground">
                Cascading dependent dropdowns. Best for top-of-page context
                bars.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 border border-border rounded-lg bg-card">
                <HierarchyCascade
                  levels={["organization", "scope", "project"]}
                  value={cascadeHVal}
                  onChange={setCascadeHVal}
                  layout="horizontal"
                />
              </div>
              <SelectionDebug label="cascade h" value={cascadeHVal} />
            </CardContent>
          </Card>

          {/* Cascade vertical */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                HierarchyCascade
                <Badge variant="secondary" className="text-[9px] h-4">
                  vertical
                </Badge>
              </CardTitle>
              <p className="text-[10px] text-muted-foreground">
                Stacked dropdowns. Best for narrow sidebars and settings panels.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 border border-border rounded-lg bg-card w-64">
                <HierarchyCascade
                  levels={["organization", "scope", "project", "task"]}
                  value={cascadeVVal}
                  onChange={setCascadeVVal}
                  layout="vertical"
                />
              </div>
              <SelectionDebug label="cascade v" value={cascadeVVal} />
            </CardContent>
          </Card>

          {/* Breadcrumb */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                HierarchyBreadcrumb
                <Badge variant="secondary" className="text-[9px] h-4">
                  breadcrumb trail
                </Badge>
              </CardTitle>
              <p className="text-[10px] text-muted-foreground">
                Clickable breadcrumb trail. Best for header display +
                navigation.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 border border-border rounded-lg bg-card">
                <HierarchyBreadcrumb
                  levels={["organization", "scope", "project", "task"]}
                  value={breadcrumbVal}
                  onChange={setBreadcrumbVal}
                />
              </div>
              <div className="p-3 border border-border rounded-lg bg-card w-64">
                <HierarchyCascade
                  levels={["organization", "scope", "project", "task"]}
                  value={breadcrumbVal}
                  onChange={setBreadcrumbVal}
                  layout="vertical"
                  showSeparators={false}
                />
              </div>
              <SelectionDebug label="breadcrumb" value={breadcrumbVal} />
            </CardContent>
          </Card>

          {/* Command */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                HierarchyCommand
                <Badge variant="secondary" className="text-[9px] h-4">
                  command palette
                </Badge>
              </CardTitle>
              <p className="text-[10px] text-muted-foreground">
                Searchable popover. Best for compact forms and inline selection.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 border border-border rounded-lg bg-card">
                <HierarchyCommand
                  levels={["organization", "scope", "project", "task"]}
                  value={commandVal}
                  onChange={setCommandVal}
                />
              </div>
              <SelectionDebug label="command" value={commandVal} />
            </CardContent>
          </Card>

          {/* Pills */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                HierarchyPills
                <Badge variant="secondary" className="text-[9px] h-4">
                  filter pills
                </Badge>
              </CardTitle>
              <p className="text-[10px] text-muted-foreground">
                Compact pill filters. Best for list pages, tables, and filter
                bars.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 border border-border rounded-lg bg-card">
                <HierarchyPills
                  levels={["organization", "scope", "project"]}
                  value={pillsVal}
                  onChange={setPillsVal}
                />
              </div>
              <div className="p-3 border border-border rounded-lg bg-card">
                <HierarchyPills
                  levels={["organization", "scope", "project", "task"]}
                  value={pillsVal}
                  onChange={setPillsVal}
                  size="md"
                />
              </div>
              <SelectionDebug label="pills" value={pillsVal} />
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
