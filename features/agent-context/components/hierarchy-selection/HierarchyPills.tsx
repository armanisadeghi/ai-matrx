"use client";

import { useState, useEffect } from "react";
import {
  Building2,
  FolderKanban,
  ListTodo,
  X,
  ChevronDown,
  Loader2,
  Folder,
} from "lucide-react";
import { ScopeIcon } from "@/features/scopes/components/ScopeIcon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/utils/cn";
import {
  useHierarchySelection,
  FULL_HIERARCHY_LEVELS,
} from "./useHierarchySelection";
import type {
  HierarchySelectionProps,
  HierarchyLevel,
  HierarchyOption,
} from "./types";

const LEVEL_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  organization: Building2,
  project: FolderKanban,
  task: ListTodo,
};

const PILL_COLORS: Record<string, { active: string; idle: string }> = {
  organization: {
    active:
      "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20",
    idle: "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
  },
  project: {
    active:
      "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
    idle: "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
  },
  task: {
    active: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20",
    idle: "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
  },
};

interface HierarchyPillsProps extends HierarchySelectionProps {
  size?: "sm" | "md";
}

export function HierarchyPills({
  levels = FULL_HIERARCHY_LEVELS,
  value,
  onChange,
  disabled,
  className,
  size = "sm",
}: HierarchyPillsProps) {
  const [mounted, setMounted] = useState(false);
  const ctx = useHierarchySelection({
    levels,
    controlled: { value, onChange },
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const includesScopes = levels.includes("scope");
  const scopeSelections = value.scopeSelections ?? {};

  if (!mounted || ctx.isLoading) {
    return (
      <div className={cn("flex items-center gap-1.5 flex-wrap", className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Loading...</span>
      </div>
    );
  }

  const pillConfig: {
    key: string;
    level: HierarchyLevel | "scope";
    options: HierarchyOption[];
    selectedId: string | null;
    selectedName: string | null;
    onSelect: (id: string | null) => void;
    show: boolean;
    icon?: React.ComponentType<{
      className?: string;
      style?: React.CSSProperties;
    }>;
    scopeIconName?: string;
    inlineColor?: string;
    pillActive?: string;
    pillIdle?: string;
    emptyLabel?: string;
  }[] = [];

  if (levels.includes("organization")) {
    pillConfig.push({
      key: "organization",
      level: "organization",
      options: ctx.orgs,
      selectedId: value.organizationId,
      selectedName: value.organizationName,
      onSelect: ctx.setOrg,
      show: true,
      icon: Building2,
      pillActive: PILL_COLORS.organization.active,
      pillIdle: PILL_COLORS.organization.idle,
      emptyLabel: "All Orgs",
    });
  }

  if (includesScopes) {
    for (const scopeLevel of ctx.scopeLevels) {
      const selectedScopeId = scopeSelections[scopeLevel.typeId] ?? null;
      const selectedOption = scopeLevel.options.find(
        (o) => o.id === selectedScopeId,
      );
      pillConfig.push({
        key: `scope-${scopeLevel.typeId}`,
        level: "scope",
        options: scopeLevel.options,
        selectedId: selectedScopeId,
        selectedName: selectedOption?.name ?? null,
        onSelect: (id) => ctx.setScopeValue(scopeLevel.typeId, id),
        show: true,
        scopeIconName: scopeLevel.icon,
        inlineColor: scopeLevel.color,
        pillActive: `bg-opacity-10 border-opacity-20`,
        pillIdle:
          "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
        emptyLabel: `All ${scopeLevel.pluralLabel}`,
      });
    }
  }

  if (levels.includes("project")) {
    pillConfig.push({
      key: "project",
      level: "project",
      options: ctx.projects,
      selectedId: value.projectId,
      selectedName: value.projectName,
      onSelect: ctx.setProject,
      show: true,
      icon: FolderKanban,
      pillActive: PILL_COLORS.project.active,
      pillIdle: PILL_COLORS.project.idle,
      emptyLabel: "All Projects",
    });
  }

  if (levels.includes("task")) {
    pillConfig.push({
      key: "task",
      level: "task",
      options: ctx.tasks,
      selectedId: value.taskId,
      selectedName: value.taskName,
      onSelect: ctx.setTask,
      show: true,
      icon: ListTodo,
      pillActive: PILL_COLORS.task.active,
      pillIdle: PILL_COLORS.task.idle,
      emptyLabel: "All Tasks",
    });
  }

  const h = size === "sm" ? "h-6" : "h-7";
  const textSize = size === "sm" ? "text-[10px]" : "text-xs";

  const hasAnySelection =
    value.organizationId ||
    value.projectId ||
    value.taskId ||
    Object.values(scopeSelections).some(Boolean);

  return (
    <div className={cn("flex items-center gap-1.5 flex-wrap", className)}>
      {pillConfig.map((pill) => {
        if (!pill.show) return null;
        const Icon = pill.icon ?? Folder;
        const isScope = pill.level === "scope";

        const colors = pill.selectedId
          ? isScope
            ? "border border-current/20 bg-current/10"
            : pill.pillActive
          : pill.pillIdle;

        return (
          <DropdownMenu key={pill.key}>
            <DropdownMenuTrigger asChild disabled={disabled}>
              <button
                className={cn(
                  "flex items-center gap-1 px-2 rounded-full border transition-colors cursor-pointer",
                  h,
                  textSize,
                  !isScope && colors,
                )}
                style={
                  isScope && pill.inlineColor
                    ? {
                        color: pill.selectedId ? pill.inlineColor : undefined,
                        borderColor: pill.selectedId
                          ? `${pill.inlineColor}33`
                          : undefined,
                        backgroundColor: pill.selectedId
                          ? `${pill.inlineColor}1a`
                          : undefined,
                      }
                    : undefined
                }
              >
                {isScope && pill.scopeIconName ? (
                  <ScopeIcon
                    name={pill.scopeIconName}
                    color={pill.inlineColor ?? undefined}
                    className="h-3 w-3 shrink-0"
                  />
                ) : (
                  <Icon className="h-3 w-3 shrink-0" />
                )}
                <span className="truncate max-w-[120px]">
                  {pill.selectedName ?? pill.emptyLabel}
                </span>
                <ChevronDown className="h-2.5 w-2.5 shrink-0 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem
                className={cn(textSize, !pill.selectedId && "font-semibold")}
                onClick={() => pill.onSelect(null)}
              >
                All
              </DropdownMenuItem>
              {pill.options.map((opt) => (
                <DropdownMenuItem
                  key={opt.id}
                  className={cn(
                    textSize,
                    pill.selectedId === opt.id && "font-semibold text-primary",
                  )}
                  onClick={() => pill.onSelect(opt.id)}
                >
                  {opt.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}

      {hasAnySelection && (
        <button
          className={cn(
            "flex items-center justify-center rounded-full border border-border bg-muted/50 text-muted-foreground hover:text-destructive hover:bg-destructive/10 hover:border-destructive/20 transition-colors",
            size === "sm" ? "h-5 w-5" : "h-6 w-6",
          )}
          onClick={() => ctx.clear()}
          title="Clear filters"
          disabled={disabled}
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}
