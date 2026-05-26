"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Credenza,
  CredenzaTrigger,
  CredenzaContent,
  CredenzaHeader,
  CredenzaTitle,
  CredenzaBody,
  CredenzaFooter,
  CredenzaClose,
} from "@/components/ui/credenza-modal/credenza";
import { Settings2, X } from "lucide-react";
import { HierarchyCascade } from "@/features/agent-context/components/hierarchy-selection/HierarchyCascade";
import {
  EMPTY_SELECTION,
  type HierarchySelection,
} from "@/features/agent-context/components/hierarchy-selection/types";

interface ScopeOverride {
  organization_id?: string;
  project_id?: string;
  task_id?: string;
}

interface ContextScopeModalProps {
  scopeOverride: ScopeOverride;
  onScopeChange: (scope: ScopeOverride) => void;
}

export function ContextScopeModal({
  scopeOverride,
  onScopeChange,
}: ContextScopeModalProps) {
  const [open, setOpen] = useState(false);

  const [draft, setDraft] = useState<HierarchySelection>({
    ...EMPTY_SELECTION,
    organizationId: scopeOverride.organization_id ?? null,
    projectId: scopeOverride.project_id ?? null,
    taskId: scopeOverride.task_id ?? null,
  });

  useEffect(() => {
    setDraft({
      ...EMPTY_SELECTION,
      organizationId: scopeOverride.organization_id ?? null,
      projectId: scopeOverride.project_id ?? null,
      taskId: scopeOverride.task_id ?? null,
    });
  }, [scopeOverride]);

  const activeScopeCount = [
    scopeOverride.organization_id,
    scopeOverride.project_id,
    scopeOverride.task_id,
  ].filter(Boolean).length;

  const handleApply = () => {
    const newScope: ScopeOverride = {};
    if (draft.organizationId) newScope.organization_id = draft.organizationId;
    if (draft.projectId) newScope.project_id = draft.projectId;
    if (draft.taskId) newScope.task_id = draft.taskId;
    onScopeChange(newScope);
    setOpen(false);
  };

  const handleClear = () => {
    setDraft(EMPTY_SELECTION);
    onScopeChange({});
    setOpen(false);
  };

  return (
    <Credenza open={open} onOpenChange={setOpen}>
      <CredenzaTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="relative h-7 text-[10px] gap-1.5 px-2"
        >
          <Settings2 className="h-3 w-3" />
          Scope
          {activeScopeCount > 0 && (
            <Badge
              variant="default"
              className="h-4 w-4 p-0 text-[9px] absolute -top-1 -right-1 flex items-center justify-center"
            >
              {activeScopeCount}
            </Badge>
          )}
        </Button>
      </CredenzaTrigger>

      <CredenzaContent className="sm:max-w-md">
        <CredenzaHeader>
          <CredenzaTitle>Test Context Scope</CredenzaTitle>
        </CredenzaHeader>

        <CredenzaBody className="space-y-4 py-4">
          <p className="text-xs text-muted-foreground">
            Optionally scope tool execution to a real org, project, or task. All
            data is fetched live using your authenticated session.
          </p>

          <HierarchyCascade
            levels={["organization", "scope", "project", "task"]}
            value={draft}
            onChange={setDraft}
            layout="vertical"
          />

          {activeScopeCount > 0 && (
            <div className="rounded-md border border-border bg-muted/40 p-2 space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Applied scope
              </p>
              {scopeOverride.organization_id && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground w-14 shrink-0">
                    Org:
                  </span>
                  <span className="text-[10px] font-medium text-foreground truncate">
                    {draft.organizationName ?? scopeOverride.organization_id}
                  </span>
                </div>
              )}
              {scopeOverride.project_id && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground w-14 shrink-0">
                    Project:
                  </span>
                  <span className="text-[10px] font-medium text-foreground truncate">
                    {draft.projectName ?? scopeOverride.project_id}
                  </span>
                </div>
              )}
              {scopeOverride.task_id && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground w-14 shrink-0">
                    Task:
                  </span>
                  <span className="text-[10px] font-medium text-foreground truncate">
                    {draft.taskName ?? scopeOverride.task_id}
                  </span>
                </div>
              )}
            </div>
          )}
        </CredenzaBody>

        <CredenzaFooter className="flex items-center gap-2 sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs gap-1"
            onClick={handleClear}
          >
            <X className="h-3 w-3" /> Clear All
          </Button>
          <div className="flex items-center gap-2">
            <CredenzaClose asChild>
              <Button variant="outline" size="sm" className="text-xs">
                Cancel
              </Button>
            </CredenzaClose>
            <Button size="sm" className="text-xs" onClick={handleApply}>
              Apply Scope
            </Button>
          </div>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  );
}
