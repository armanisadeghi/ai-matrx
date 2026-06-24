"use client";

import {
  Building2,
  FolderKanban,
  ListTodo,
  ChevronRight,
  X,
  User,
  Folder,
} from "lucide-react";
import { ScopeIcon } from "@/features/scopes/components/ScopeIcon";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import {
  useHierarchySelection,
  FULL_HIERARCHY_LEVELS,
} from "./useHierarchySelection";
import type { HierarchySelectionProps, HierarchyLevel } from "./types";
import { EMPTY_SELECTION } from "./types";

const LEVEL_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  organization: Building2,
  project: FolderKanban,
  task: ListTodo,
};

const LEVEL_ACCENT: Record<string, string> = {
  organization: "text-violet-500",
  project: "text-amber-500",
  task: "text-sky-500",
};

interface CrumbData {
  key: string;
  level: HierarchyLevel | "scope";
  id: string;
  name: string;
  accent?: string;
  color?: string;
  iconName?: string;
  scopeTypeId?: string;
}

interface HierarchyBreadcrumbProps extends HierarchySelectionProps {
  rootLabel?: string;
  showClear?: boolean;
  onCrumbClick?: (level: HierarchyLevel) => void;
}

export function HierarchyBreadcrumb({
  levels = FULL_HIERARCHY_LEVELS,
  value,
  onChange,
  className,
  rootLabel = "Context",
  showClear = true,
  onCrumbClick,
}: HierarchyBreadcrumbProps) {
  const ctx = useHierarchySelection({
    levels,
    controlled: { value, onChange },
  });

  const scopeSelections = value.scopeSelections ?? {};
  const includesScopes = levels.includes("scope");

  const crumbs: CrumbData[] = [];

  if (
    levels.includes("organization") &&
    value.organizationId &&
    value.organizationName
  ) {
    crumbs.push({
      key: `org-${value.organizationId}`,
      level: "organization",
      id: value.organizationId,
      name: value.organizationName,
      accent: LEVEL_ACCENT.organization,
    });
  }

  if (includesScopes) {
    for (const scopeLevel of ctx.scopeLevels) {
      const selectedScopeId = scopeSelections[scopeLevel.typeId];
      if (!selectedScopeId) continue;
      const selectedOption = scopeLevel.options.find(
        (o) => o.id === selectedScopeId,
      );
      if (!selectedOption) continue;
      crumbs.push({
        key: `scope-${scopeLevel.typeId}-${selectedScopeId}`,
        level: "scope",
        id: selectedScopeId,
        name: selectedOption.name,
        color: scopeLevel.color,
        iconName: scopeLevel.icon,
        scopeTypeId: scopeLevel.typeId,
      });
    }
  }

  if (levels.includes("project") && value.projectId && value.projectName) {
    crumbs.push({
      key: `proj-${value.projectId}`,
      level: "project",
      id: value.projectId,
      name: value.projectName,
      accent: LEVEL_ACCENT.project,
    });
  }
  if (levels.includes("task") && value.taskId && value.taskName) {
    crumbs.push({
      key: `task-${value.taskId}`,
      level: "task",
      id: value.taskId,
      name: value.taskName,
      accent: LEVEL_ACCENT.task,
    });
  }

  const handleCrumbClick = (crumb: CrumbData) => {
    if (crumb.level === "scope" && crumb.scopeTypeId) {
      ctx.setScopeValue(crumb.scopeTypeId, null);
      return;
    }
    if (onCrumbClick && crumb.level !== "scope") {
      onCrumbClick(crumb.level as HierarchyLevel);
      return;
    }
    if (crumb.level === "organization") {
      onChange({
        ...value,
        projectId: null,
        projectName: null,
        taskId: null,
        taskName: null,
      });
    } else if (crumb.level === "project") {
      onChange({ ...value, taskId: null, taskName: null });
    }
  };

  const hasContext = crumbs.length > 0;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <button
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              onClick={() => {
                ctx.clear();
              }}
            >
              <User className="h-3 w-3" />
              {rootLabel}
            </button>
          </BreadcrumbItem>

          {crumbs.map((crumb, idx) => {
            const isLast = idx === crumbs.length - 1;

            const isDbScopeIcon = crumb.level === "scope" && !!crumb.iconName;
            const HardCrumbIcon = LEVEL_ICONS[crumb.level] ?? Folder;
            const accentClass = isDbScopeIcon ? undefined : crumb.accent;
            const iconEl = isDbScopeIcon ? (
              <ScopeIcon
                name={crumb.iconName}
                color={crumb.color ?? undefined}
                className="h-3 w-3"
              />
            ) : (
              <HardCrumbIcon className={cn("h-3 w-3", accentClass)} />
            );

            return (
              <span key={crumb.key} className="contents">
                <BreadcrumbSeparator>
                  <ChevronRight className="h-3 w-3" />
                </BreadcrumbSeparator>
                <BreadcrumbItem>
                  {isLast ? (
                    <BreadcrumbPage className="text-xs flex items-center gap-1">
                      {iconEl}
                      <span className="font-medium">{crumb.name}</span>
                    </BreadcrumbPage>
                  ) : (
                    <button
                      className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => handleCrumbClick(crumb)}
                    >
                      {iconEl}
                      {crumb.name}
                    </button>
                  )}
                </BreadcrumbItem>
              </span>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      {showClear && hasContext && (
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0"
          onClick={() => ctx.clear()}
          title="Clear context"
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </Button>
      )}
    </div>
  );
}
