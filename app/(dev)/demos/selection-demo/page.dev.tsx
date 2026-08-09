"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { MatrxUuidCell } from "@/components/official/matrx-data-table/MatrxUuidCell";
import { HierarchyTree } from "@/features/agent-context/components/hierarchy-selection/HierarchyTree";
import { HierarchyCascade } from "@/features/agent-context/components/hierarchy-selection/HierarchyCascade";
import { HierarchyPills } from "@/features/agent-context/components/hierarchy-selection/HierarchyPills";
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
  const scopeIds = Object.values(value.scopeSelections ?? {}).filter(
    (v): v is string => !!v,
  );

  const isEmpty =
    !value.organizationId &&
    !value.projectId &&
    !value.taskId &&
    scopeIds.length === 0;

  return (
    <div className="mt-2 p-2 bg-muted/30 rounded-md border border-border/50">
      <p className="text-[9px] font-mono text-muted-foreground mb-1">
        {label}:
      </p>
      {/* These come from `get_user_full_context` (real rows, cached in Redux)
          and every id is destructured above — so each badge carries the
          record's doors instead of a name you cannot act on. The scope badges
          used to show a truncated id and nothing else. */}
      <div className="group flex flex-wrap items-center gap-1">
        {value.organizationId && (
          <Badge
            variant="outline"
            className="text-[9px] h-auto py-0.5 px-1 border-violet-500/30 text-violet-600 dark:text-violet-400"
          >
            org:{" "}
            <EntityRef
              token="organization"
              id={value.organizationId}
              name={value.organizationName}
              showIcon={false}
            />
          </Badge>
        )}
        {scopeIds.map((scopeId) => (
          <Badge
            key={scopeId}
            variant="outline"
            className="text-[9px] h-auto py-0.5 px-1 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
          >
            scope: <MatrxUuidCell value={scopeId} token="scope" label="Scope" />
          </Badge>
        ))}
        {value.projectId && (
          <Badge
            variant="outline"
            className="text-[9px] h-auto py-0.5 px-1 border-amber-500/30 text-amber-600 dark:text-amber-400"
          >
            proj:{" "}
            <EntityRef
              token="project"
              id={value.projectId}
              name={value.projectName}
              showIcon={false}
            />
          </Badge>
        )}
        {value.taskId && (
          <Badge
            variant="outline"
            className="text-[9px] h-auto py-0.5 px-1 border-sky-500/30 text-sky-600 dark:text-sky-400"
          >
            task:{" "}
            <EntityRef
              token="task"
              id={value.taskId}
              name={value.taskName}
              showIcon={false}
            />
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
  const [treeVal, setTreeVal] = useState<HierarchySelection>(EMPTY_SELECTION);
  const [cascadeHVal, setCascadeHVal] =
    useState<HierarchySelection>(EMPTY_SELECTION);
  const [cascadeVVal, setCascadeVVal] =
    useState<HierarchySelection>(EMPTY_SELECTION);
  const [pillsVal, setPillsVal] = useState<HierarchySelection>(EMPTY_SELECTION);

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-bold">Hierarchy Selection System</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Variants of the org / scope / project / task picker. All share one
          data hook backed by a single{" "}
          <code className="text-[11px] bg-muted px-1 rounded">
            get_user_full_context
          </code>{" "}
          RPC call cached in Redux. Scopes are MULTI-SELECT — any number of
          scopes across any types (checkbox semantics, never radio).
        </p>
      </div>

      <Separator />

      <section>
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
