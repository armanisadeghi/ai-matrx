"use client";

import { useState, useEffect } from "react";
import {
  Building2,
  Check,
  FolderKanban,
  ListTodo,
  X,
  ChevronDown,
  Loader2,
  Folder,
} from "lucide-react";
import * as icons from "lucide-react";
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

type LucideIcon = React.ComponentType<{
  className?: string;
  style?: React.CSSProperties;
}>;

function resolveIcon(name: string): LucideIcon {
  const pascalName = name
    .split(/[-_\s]+/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
  const Icon = (icons as unknown as Record<string, LucideIcon>)[pascalName];
  return Icon ?? Folder;
}

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
    /** Single-select dimensions: at most one entry. Scope pills: any number. */
    selectedIds: string[];
    selectedLabel: string | null;
    /** Single-select toggle (org/project/task). */
    onSelect?: (id: string | null) => void;
    /** MULTI-SCOPE toggle (scope pills only). */
    onToggle?: (id: string) => void;
    onClear: () => void;
    show: boolean;
    icon?: React.ComponentType<{
      className?: string;
      style?: React.CSSProperties;
    }>;
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
      selectedIds: value.organizationId ? [value.organizationId] : [],
      selectedLabel: value.organizationName,
      onSelect: ctx.setOrg,
      onClear: () => ctx.setOrg(null),
      show: true,
      icon: Building2,
      pillActive: PILL_COLORS.organization.active,
      pillIdle: PILL_COLORS.organization.idle,
      emptyLabel: "All Orgs",
    });
  }

  if (includesScopes) {
    for (const scopeLevel of ctx.scopeLevels) {
      // MULTI-SCOPE: every selected scope of this type shows on the pill.
      const selectedOfType = scopeLevel.options.filter(
        (o) => !!scopeSelections[o.id],
      );
      const label =
        selectedOfType.length === 0
          ? null
          : selectedOfType.length === 1
            ? selectedOfType[0].name
            : `${selectedOfType[0].name} +${selectedOfType.length - 1}`;
      pillConfig.push({
        key: `scope-${scopeLevel.typeId}`,
        level: "scope",
        options: scopeLevel.options,
        selectedIds: selectedOfType.map((o) => o.id),
        selectedLabel: label,
        onToggle: (id) => ctx.toggleScope(id),
        onClear: () => ctx.clearScopeType(scopeLevel.typeId),
        show: true,
        icon: resolveIcon(scopeLevel.icon),
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
      selectedIds: value.projectId ? [value.projectId] : [],
      selectedLabel: value.projectName,
      onSelect: ctx.setProject,
      onClear: () => ctx.setProject(null),
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
      selectedIds: value.taskId ? [value.taskId] : [],
      selectedLabel: value.taskName,
      onSelect: ctx.setTask,
      onClear: () => ctx.setTask(null),
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
        const hasSelection = pill.selectedIds.length > 0;
        const selectedSet = new Set(pill.selectedIds);

        const colors = hasSelection
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
                        color: hasSelection ? pill.inlineColor : undefined,
                        borderColor: hasSelection
                          ? `${pill.inlineColor}33`
                          : undefined,
                        backgroundColor: hasSelection
                          ? `${pill.inlineColor}1a`
                          : undefined,
                      }
                    : undefined
                }
              >
                <Icon
                  className="h-3 w-3 shrink-0"
                  style={
                    isScope && pill.inlineColor
                      ? { color: pill.inlineColor }
                      : undefined
                  }
                />
                <span className="truncate max-w-[120px]">
                  {pill.selectedLabel ?? pill.emptyLabel}
                </span>
                <ChevronDown className="h-2.5 w-2.5 shrink-0 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem
                className={cn(textSize, !hasSelection && "font-semibold")}
                onClick={() => pill.onClear()}
              >
                All
              </DropdownMenuItem>
              {pill.options.map((opt) => (
                <DropdownMenuItem
                  key={opt.id}
                  className={cn(
                    textSize,
                    selectedSet.has(opt.id) && "font-semibold text-primary",
                  )}
                  onClick={(e) => {
                    if (isScope) {
                      // MULTI-SCOPE: toggle, keep the menu open for more picks.
                      e.preventDefault();
                      pill.onToggle?.(opt.id);
                    } else {
                      pill.onSelect?.(opt.id);
                    }
                  }}
                >
                  {isScope && (
                    <span
                      className={cn(
                        "mr-1.5 flex h-3 w-3 shrink-0 items-center justify-center rounded-sm border",
                        selectedSet.has(opt.id)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/30",
                      )}
                    >
                      {selectedSet.has(opt.id) && (
                        <Check className="h-2 w-2" />
                      )}
                    </span>
                  )}
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
