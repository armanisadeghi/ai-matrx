"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { MatrxUuidCell } from "@ai-matrx/design-system/data-table/uuid-cell";
import { EngagementPicker } from "@/features/scopes/components/active-context/engagement/EngagementPicker";
import { BindingTargetPicker } from "@/features/scopes/components/active-context/binding-target/BindingTargetPicker";
import {
  EMPTY_ENGAGEMENT_SELECTION,
  type EngagementSelection,
} from "@/features/scopes/components/active-context/quick-pick/engine";

// ─── Shared debug widget ──────────────────────────────────────────────────

function SelectionDebug({
  label,
  value,
}: {
  label: string;
  value: EngagementSelection;
}) {
  const scopeIds = value.scopeIds;

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

type TargetRung = "global" | "user" | "organization" | "project" | "task";

export default function HierarchySelectionDemoPage() {
  const [inlineVal, setInlineVal] = useState<EngagementSelection>(
    EMPTY_ENGAGEMENT_SELECTION,
  );
  const [fieldVal, setFieldVal] = useState<EngagementSelection>(
    EMPTY_ENGAGEMENT_SELECTION,
  );
  const [target, setTarget] = useState<{ rung: TargetRung; id?: string }>({
    rung: "user",
  });

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-bold">Hierarchy Selection System</h1>
        <p className="text-sm text-muted-foreground mt-1">
          The canonical scope selection family in its two host modes:
          organization → project → task with scopes as tags (Miller Columns,
          engagement rungs), and one binding target of any rung (DrillDeck,
          single node). Scopes are MULTI-SELECT tags — any number, any type.
        </p>
      </div>

      <Separator />

      <section className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              EngagementPicker
              <Badge variant="secondary" className="text-[9px] h-4">
                inline
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EngagementPicker
              presentation="inline"
              value={inlineVal}
              onChange={setInlineVal}
            />
            <SelectionDebug label="inline" value={inlineVal} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                EngagementPicker
                <Badge variant="secondary" className="text-[9px] h-4">
                  field
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EngagementPicker value={fieldVal} onChange={setFieldVal} />
              <SelectionDebug label="field" value={fieldVal} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                BindingTargetPicker
                <Badge variant="secondary" className="text-[9px] h-4">
                  single node
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BindingTargetPicker<TargetRung>
                scope={target.rung}
                scopeId={target.id}
                onScopeChange={(rung, id) => setTarget({ rung, id })}
              />
              <p className="mt-2 text-[10px] font-mono text-muted-foreground">
                {target.rung}
                {target.id ? ` · ${target.id}` : ""}
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
