"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Check,
  ChevronsUpDown,
  FolderKanban,
  ListTodo,
  Loader2,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getIconComponent } from "@/components/official/icons/IconResolver";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import { selectAllTasks } from "@/features/agent-context/redux/tasksSlice";
import { cn } from "@/lib/utils";
import { AGENT_SCOPES, SCOPE_OPTIONS } from "../constants";
import type { AgentScope } from "../constants";

export interface ShortcutScopePickerProps {
  scope: AgentScope;
  scopeId?: string;
  onScopeChange: (scope: AgentScope, scopeId?: string) => void;
  disabled?: boolean;
  allowGlobal?: boolean;
  className?: string;
}

type NamedOption = {
  id: string;
  name: string;
  subtitle?: string;
};

export function ShortcutScopePicker({
  scope,
  scopeId,
  onScopeChange,
  disabled = false,
  allowGlobal = true,
  className,
}: ShortcutScopePickerProps) {
  const dispatch = useAppDispatch();
  const { organizations, status: treeStatus } = useScopeTree();
  const tasks = useAppSelector(selectAllTasks);

  useEffect(() => {
    if (treeStatus === "idle") {
      void dispatch(ensureScopeTree({}));
    }
  }, [dispatch, treeStatus]);

  const selectedOption =
    SCOPE_OPTIONS.find((opt) => opt.value === scope) ?? SCOPE_OPTIONS[0];
  const SelectedIcon = getIconComponent(selectedOption.icon);

  const visibleOptions = allowGlobal
    ? SCOPE_OPTIONS
    : SCOPE_OPTIONS.filter((o) => o.value !== AGENT_SCOPES.GLOBAL);

  const handleScopeChange = (next: AgentScope) => {
    const option = SCOPE_OPTIONS.find((o) => o.value === next);
    if (!option) return;
    onScopeChange(next, option.requiresId ? (scopeId ?? "") : undefined);
  };

  const handleScopeIdChange = (value: string) => {
    onScopeChange(scope, value);
  };

  const organizationOptions = useMemo<NamedOption[]>(
    () =>
      organizations.map((org) => ({
        id: org.id,
        name: org.name,
        subtitle: org.is_personal ? "Personal" : undefined,
      })),
    [organizations],
  );

  const projectOptions = useMemo<NamedOption[]>(() => {
    const out: NamedOption[] = [];
    for (const org of organizations) {
      for (const project of org.projects) {
        out.push({
          id: project.id,
          name: project.name,
          subtitle: org.name,
        });
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [organizations]);

  const taskOptions = useMemo<NamedOption[]>(
    () =>
      tasks
        .map((task) => ({
          id: task.id,
          name: task.title,
          subtitle: task.project_id ? "Project task" : "Unassigned",
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [tasks],
  );

  const entityOptions =
    scope === AGENT_SCOPES.ORGANIZATION
      ? organizationOptions
      : scope === AGENT_SCOPES.PROJECT
        ? projectOptions
        : scope === AGENT_SCOPES.TASK
          ? taskOptions
          : [];

  const treeLoading = treeStatus === "loading" || treeStatus === "idle";

  return (
    <div className={cn("space-y-2", className)}>
      <div className="space-y-1.5">
        <Label className="text-sm">Scope</Label>
        <Select
          value={scope}
          onValueChange={(v) => handleScopeChange(v as AgentScope)}
          disabled={disabled}
        >
          <SelectTrigger className="h-9">
            <SelectValue>
              <div className="flex items-center gap-2">
                <SelectedIcon className="h-4 w-4" />
                <span>{selectedOption.label}</span>
              </div>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {visibleOptions.map((option) => {
              const Icon = getIconComponent(option.icon);
              return (
                <SelectItem key={option.value} value={option.value}>
                  <div className="flex items-start gap-2">
                    <Icon className="h-4 w-4 mt-0.5" />
                    <div>
                      <div className="font-medium">{option.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {option.description}
                      </div>
                    </div>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {selectedOption.requiresId && (
        <div className="space-y-1.5">
          <Label className="text-sm">
            {selectedOption.label}
            <span className="text-destructive ml-1">*</span>
          </Label>
          {scope === AGENT_SCOPES.TASK ? (
            <SearchableEntityPicker
              icon={<ListTodo className="h-4 w-4 text-sky-500" />}
              placeholder="Search tasks…"
              emptyText="No tasks found"
              options={entityOptions}
              value={scopeId}
              onChange={handleScopeIdChange}
              disabled={disabled}
            />
          ) : (
            <NamedEntitySelect
              icon={
                scope === AGENT_SCOPES.ORGANIZATION ? (
                  <Building2 className="h-4 w-4 text-violet-500" />
                ) : (
                  <FolderKanban className="h-4 w-4 text-amber-500" />
                )
              }
              placeholder={
                scope === AGENT_SCOPES.ORGANIZATION
                  ? "Select organization…"
                  : "Select project…"
              }
              emptyText={
                scope === AGENT_SCOPES.ORGANIZATION
                  ? "No organizations found"
                  : "No projects found"
              }
              options={entityOptions}
              value={scopeId}
              onChange={handleScopeIdChange}
              disabled={disabled}
              loading={treeLoading}
            />
          )}
          <p className="text-xs text-muted-foreground">
            {selectedOption.description}
          </p>
        </div>
      )}
    </div>
  );
}

function NamedEntitySelect({
  icon,
  placeholder,
  emptyText,
  options,
  value,
  onChange,
  disabled,
  loading,
}: {
  icon: React.ReactNode;
  placeholder: string;
  emptyText: string;
  options: NamedOption[];
  value?: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Select
      value={value ?? ""}
      onValueChange={onChange}
      disabled={disabled || loading}
    >
      <SelectTrigger className="h-9">
        {/* div (not span): trigger line-clamp would break this flex row */}
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          {loading ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            icon
          )}
          <span className="min-w-0 flex-1 truncate text-left">
            <SelectValue placeholder={loading ? "Loading…" : placeholder} />
          </span>
        </div>
      </SelectTrigger>
      <SelectContent>
        {options.length === 0 ? (
          <div className="px-2 py-3 text-xs text-muted-foreground">
            {loading ? "Loading…" : emptyText}
          </div>
        ) : (
          options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              <div className="flex min-w-0 flex-col">
                <span className="truncate">{option.name}</span>
                {option.subtitle ? (
                  <span className="text-[11px] text-muted-foreground truncate">
                    {option.subtitle}
                  </span>
                ) : null}
              </div>
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}

function SearchableEntityPicker({
  icon,
  placeholder,
  emptyText,
  options,
  value,
  onChange,
  disabled,
}: {
  icon: React.ReactNode;
  placeholder: string;
  emptyText: string;
  options: NamedOption[];
  value?: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-9 w-full justify-between gap-2 px-3 font-normal",
            !selected && "text-muted-foreground",
          )}
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            {icon}
            <span className="truncate">
              {selected ? (
                <>
                  {selected.name}
                  {selected.subtitle ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · {selected.subtitle}
                    </span>
                  ) : null}
                </>
              ) : (
                placeholder
              )}
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder={placeholder} className="h-9" />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={`${option.name} ${option.subtitle ?? ""} ${option.id}`}
                  onSelect={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="min-w-0">
                    <div className="truncate">{option.name}</div>
                    {option.subtitle ? (
                      <div className="text-[11px] text-muted-foreground truncate">
                        {option.subtitle}
                      </div>
                    ) : null}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
