"use client";

import { useState } from "react";
import {
  Building2,
  FolderKanban,
  ListTodo,
  Search,
  Check,
  Globe,
} from "lucide-react";
import { ScopeIcon } from "@/features/scopes/components/ScopeIcon";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import {
  useHierarchySelection,
  FULL_HIERARCHY_LEVELS,
} from "./useHierarchySelection";
import type { HierarchyLevel, HierarchySelectionProps } from "./types";

interface HierarchyCommandContentProps {
  levels: HierarchyLevel[];
  value: HierarchySelectionProps["value"];
  onChange: HierarchySelectionProps["onChange"];
  onClose: () => void;
  className?: string;
}

export function HierarchyCommandContent({
  levels,
  value,
  onChange,
  onClose,
  className,
}: HierarchyCommandContentProps) {
  const ctx = useHierarchySelection({
    levels,
    controlled: { value, onChange },
  });
  const scopeSelections = value.scopeSelections ?? {};

  return (
    <Command className={className}>
      <CommandInput placeholder="Search context..." className="h-8 text-xs" />
      <CommandList>
        <CommandEmpty>
          <span className="text-xs">No results found.</span>
        </CommandEmpty>

        {levels.includes("organization") && (
          <CommandGroup heading="Organizations">
            {ctx.orgs.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                No organizations
              </div>
            ) : (
              ctx.orgs.map((org) => (
                <CommandItem
                  key={org.id}
                  value={`org-${org.name}`}
                  onSelect={() => {
                    ctx.setOrg(org.id === value.organizationId ? null : org.id);
                    if (
                      !levels.includes("project") &&
                      !levels.includes("scope")
                    )
                      onClose();
                  }}
                  className="text-xs flex items-center gap-2"
                >
                  <div
                    className={cn(
                      "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border",
                      value.organizationId === org.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/30",
                    )}
                  >
                    {value.organizationId === org.id && (
                      <Check className="h-2.5 w-2.5" />
                    )}
                  </div>
                  <Building2
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      value.organizationId === org.id
                        ? "text-primary"
                        : "text-violet-500",
                    )}
                  />
                  <span
                    className={cn(
                      "flex-1 truncate",
                      value.organizationId === org.id &&
                        "font-semibold text-primary",
                    )}
                  >
                    {org.name}
                  </span>
                  {org.isPersonal && (
                    <span className="text-[9px] text-muted-foreground">
                      (personal)
                    </span>
                  )}
                </CommandItem>
              ))
            )}
          </CommandGroup>
        )}

        {levels.includes("scope") &&
          ctx.scopeLevels.map((scopeLevel) => {
            const selectedScopeId = scopeSelections[scopeLevel.typeId] ?? null;
            return (
              <div key={scopeLevel.typeId}>
                <CommandSeparator />
                <CommandGroup
                  heading={
                    <span className="flex items-center gap-1.5">
                      <ScopeIcon
                        name={scopeLevel.icon}
                        color={scopeLevel.color}
                        className="h-3 w-3"
                      />
                      {scopeLevel.pluralLabel}
                    </span>
                  }
                >
                  {scopeLevel.options.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      {value.organizationId
                        ? `No ${scopeLevel.pluralLabel.toLowerCase()}`
                        : "Select an organization first"}
                    </div>
                  ) : (
                    scopeLevel.options.map((scope) => (
                      <CommandItem
                        key={scope.id}
                        value={`scope-${scope.name}`}
                        onSelect={() => {
                          ctx.setScopeValue(
                            scopeLevel.typeId,
                            scope.id === selectedScopeId ? null : scope.id,
                          );
                        }}
                        className="text-xs flex items-center gap-2"
                      >
                        <div
                          className={cn(
                            "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border",
                            scope.id === selectedScopeId
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/30",
                          )}
                        >
                          {scope.id === selectedScopeId && (
                            <Check className="h-2.5 w-2.5" />
                          )}
                        </div>
                        <span className="flex-1 truncate">{scope.name}</span>
                      </CommandItem>
                    ))
                  )}
                </CommandGroup>
              </div>
            );
          })}

        {levels.includes("project") && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Projects">
              {ctx.projects.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  No projects
                </div>
              ) : (
                ctx.projects.map((proj) => (
                  <CommandItem
                    key={proj.id}
                    value={`proj-${proj.name}`}
                    onSelect={() => {
                      ctx.setProject(
                        proj.id === value.projectId ? null : proj.id,
                      );
                      if (!levels.includes("task")) onClose();
                    }}
                    className="text-xs flex items-center gap-2"
                  >
                    <div
                      className={cn(
                        "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border",
                        value.projectId === proj.id
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/30",
                      )}
                    >
                      {value.projectId === proj.id && (
                        <Check className="h-2.5 w-2.5" />
                      )}
                    </div>
                    <FolderKanban
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        value.projectId === proj.id
                          ? "text-primary"
                          : "text-amber-500",
                      )}
                    />
                    <span
                      className={cn(
                        "flex-1 truncate",
                        value.projectId === proj.id &&
                          "font-semibold text-primary",
                      )}
                    >
                      {proj.name}
                    </span>
                  </CommandItem>
                ))
              )}
            </CommandGroup>
          </>
        )}

        {levels.includes("task") && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Tasks">
              {ctx.tasks.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  {value.projectId
                    ? "No tasks"
                    : "Select a project to see tasks"}
                </div>
              ) : (
                ctx.tasks.map((task) => (
                  <CommandItem
                    key={task.id}
                    value={`task-${task.name}`}
                    onSelect={() => {
                      ctx.setTask(task.id === value.taskId ? null : task.id);
                      onClose();
                    }}
                    className="text-xs flex items-center gap-2"
                  >
                    <div
                      className={cn(
                        "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border",
                        value.taskId === task.id
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/30",
                      )}
                    >
                      {value.taskId === task.id && (
                        <Check className="h-2.5 w-2.5" />
                      )}
                    </div>
                    <ListTodo
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        value.taskId === task.id
                          ? "text-primary"
                          : "text-sky-500",
                      )}
                    />
                    <span
                      className={cn(
                        "flex-1 truncate",
                        value.taskId === task.id &&
                          "font-semibold text-primary",
                      )}
                    >
                      {task.name}
                    </span>
                  </CommandItem>
                ))
              )}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </Command>
  );
}

interface HierarchyCommandProps extends HierarchySelectionProps {
  triggerLabel?: string;
  triggerClassName?: string;
  align?: "start" | "center" | "end";
}

export function HierarchyCommand({
  levels = FULL_HIERARCHY_LEVELS,
  value,
  onChange,
  disabled,
  className,
  triggerLabel,
  triggerClassName,
  align = "start",
}: HierarchyCommandProps) {
  const [open, setOpen] = useState(false);

  const displayLabel = (() => {
    if (triggerLabel) return triggerLabel;
    const parts: string[] = [];
    if (value.organizationName) parts.push(value.organizationName);
    const scopeSelections = value.scopeSelections ?? {};
    const hasScopeValues = Object.values(scopeSelections).some(Boolean);
    if (hasScopeValues) parts.push("…");
    if (value.projectName) parts.push(value.projectName);
    if (value.taskName) parts.push(value.taskName);
    return parts.length > 0 ? parts.join(" / ") : "Select context...";
  })();

  const hasValue =
    value.organizationId ||
    value.projectId ||
    value.taskId ||
    Object.values(value.scopeSelections ?? {}).some(Boolean);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-8 justify-between text-xs font-normal min-w-[180px] max-w-[320px]",
            !hasValue && "text-muted-foreground",
            triggerClassName,
          )}
        >
          <div className="flex items-center gap-1.5 truncate">
            <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{displayLabel}</span>
          </div>
          <Search className="h-3 w-3 shrink-0 opacity-50 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-[300px] p-0", className)} align={align}>
        <HierarchyCommandContent
          levels={levels}
          value={value}
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
