"use client";

import { useState } from "react";
import {
  Building2,
  FolderKanban,
  ListTodo,
  Check,
  ChevronsUpDown,
  Plus,
  Loader2,
  X,
} from "lucide-react";
import { ScopeIcon as ScopeIconBase } from "@/features/scopes/components/ScopeIcon";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  useHierarchySelection,
  FULL_HIERARCHY_LEVELS,
} from "./useHierarchySelection";
import { useCreateProject, useCreateTask } from "../../hooks/useHierarchy";
import { createScope } from "../../redux/scope/scopesSlice";
import type { HierarchySelectionProps, HierarchyOption } from "./types";

const ROW_HEIGHT = 32;
const MIN_TOTAL_ROWS = 6;

interface HierarchyCascadeProps extends HierarchySelectionProps {
  layout?: "horizontal" | "vertical";
  showSeparators?: boolean;
  requireProject?: boolean;
  minRows?: number;
}

export function HierarchyCascade({
  levels = FULL_HIERARCHY_LEVELS,
  value,
  onChange,
  disabled,
  className,
  layout = "horizontal",
  showSeparators = true,
  requireProject = false,
  minRows = MIN_TOTAL_ROWS,
}: HierarchyCascadeProps) {
  const ctx = useHierarchySelection({
    levels,
    controlled: { value, onChange },
  });

  const isVertical = layout === "vertical";
  const missingProject =
    requireProject && levels.includes("project") && !value.projectId;
  const scopeSelections = value.scopeSelections ?? {};
  const includesScopes = levels.includes("scope");

  const fixedRowCount =
    (levels.includes("organization") ? 1 : 0) +
    (levels.includes("project") ? 1 : 0) +
    (levels.includes("task") ? 1 : 0);
  const scopeCount = ctx.scopeLevels.length;
  const totalRows = fixedRowCount + scopeCount;
  const effectiveRows = Math.max(
    totalRows,
    includesScopes ? minRows : fixedRowCount,
  );

  if (ctx.isLoading) {
    return (
      <div
        className={cn("flex items-center gap-2 py-2", className)}
        style={
          isVertical ? { minHeight: `${minRows * ROW_HEIGHT}px` } : undefined
        }
      >
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          Loading hierarchy...
        </span>
      </div>
    );
  }

  if (!isVertical) {
    return (
      <div className={cn("flex items-center gap-2 flex-wrap", className)}>
        {levels.includes("organization") && (
          <LevelCombobox
            label="Organization"
            icon={<Building2 className="h-3.5 w-3.5 text-violet-500" />}
            options={ctx.orgs}
            selectedId={value.organizationId}
            onSelect={ctx.setOrg}
            disabled={disabled}
            placeholder="All organizations"
            accentClass="text-violet-500"
          />
        )}
        {includesScopes &&
          ctx.scopeLevels.map((scopeLevel) => (
            <ScopeLevelCombobox
              key={scopeLevel.typeId}
              scopeLevel={scopeLevel}
              selectedId={scopeSelections[scopeLevel.typeId] ?? null}
              onSelect={(id) => ctx.setScopeValue(scopeLevel.typeId, id)}
              disabled={disabled || !value.organizationId}
              organizationId={value.organizationId}
            />
          ))}
        {levels.includes("project") && (
          <LevelCombobox
            label="Project"
            icon={<FolderKanban className="h-3.5 w-3.5 text-amber-500" />}
            options={ctx.projects}
            selectedId={value.projectId}
            onSelect={ctx.setProject}
            disabled={disabled}
            placeholder="All projects"
            accentClass="text-amber-500"
            error={missingProject}
            canCreate
            createLabel="New project"
            onCreateSubmit={(name) => ({
              name,
              organization_id: value.organizationId ?? undefined,
            })}
            createType="project"
          />
        )}
        {levels.includes("task") && (
          <LevelCombobox
            label="Task"
            icon={<ListTodo className="h-3.5 w-3.5 text-sky-500" />}
            options={ctx.tasks}
            selectedId={value.taskId}
            onSelect={ctx.setTask}
            disabled={disabled}
            placeholder="All tasks"
            accentClass="text-sky-500"
            canCreate={!!value.projectId}
            createLabel="New task"
            onCreateSubmit={(name) => ({
              title: name,
              project_id: value.projectId!,
            })}
            createType="task"
          />
        )}
      </div>
    );
  }

  let slotIndex = 0;

  return (
    <div
      className={cn("relative", className)}
      style={{ minHeight: `${effectiveRows * ROW_HEIGHT}px` }}
    >
      {levels.includes("organization") && (
        <AnimatedRow index={slotIndex++} key="__org">
          <LevelCombobox
            label="Organization"
            icon={<Building2 className="h-3.5 w-3.5 text-violet-500" />}
            options={ctx.orgs}
            selectedId={value.organizationId}
            onSelect={ctx.setOrg}
            disabled={disabled}
            placeholder="All organizations"
            accentClass="text-violet-500"
          />
        </AnimatedRow>
      )}

      {includesScopes &&
        ctx.scopeLevels.map((scopeLevel) => (
          <AnimatedRow index={slotIndex++} key={scopeLevel.typeId}>
            <ScopeLevelCombobox
              scopeLevel={scopeLevel}
              selectedId={scopeSelections[scopeLevel.typeId] ?? null}
              onSelect={(id) => ctx.setScopeValue(scopeLevel.typeId, id)}
              disabled={disabled || !value.organizationId}
              organizationId={value.organizationId}
            />
          </AnimatedRow>
        ))}

      {levels.includes("project") && (
        <AnimatedRow index={slotIndex++} key="__proj">
          <LevelCombobox
            label="Project"
            icon={<FolderKanban className="h-3.5 w-3.5 text-amber-500" />}
            options={ctx.projects}
            selectedId={value.projectId}
            onSelect={ctx.setProject}
            disabled={disabled}
            placeholder="All projects"
            accentClass="text-amber-500"
            error={missingProject}
            canCreate
            createLabel="New project"
            onCreateSubmit={(name) => ({
              name,
              organization_id: value.organizationId ?? undefined,
            })}
            createType="project"
          />
        </AnimatedRow>
      )}

      {levels.includes("task") && (
        <AnimatedRow index={slotIndex++} key="__task">
          <LevelCombobox
            label="Task"
            icon={<ListTodo className="h-3.5 w-3.5 text-sky-500" />}
            options={ctx.tasks}
            selectedId={value.taskId}
            onSelect={ctx.setTask}
            disabled={disabled}
            placeholder="All tasks"
            accentClass="text-sky-500"
            canCreate={!!value.projectId}
            createLabel="New task"
            onCreateSubmit={(name) => ({
              title: name,
              project_id: value.projectId!,
            })}
            createType="task"
          />
        </AnimatedRow>
      )}
    </div>
  );
}

function AnimatedRow({
  index,
  children,
}: {
  index: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute left-0 right-0 flex items-center transition-[top,opacity] duration-300 ease-in-out"
      style={{
        top: `${index * ROW_HEIGHT}px`,
        height: `${ROW_HEIGHT}px`,
        opacity: 1,
      }}
    >
      {children}
    </div>
  );
}

function ScopeIcon({ iconName, color }: { iconName: string; color: string }) {
  return <ScopeIconBase name={iconName} color={color} className="h-3.5 w-3.5" />;
}

interface ScopeLevelComboboxProps {
  scopeLevel: {
    typeId: string;
    label: string;
    pluralLabel: string;
    icon: string;
    color: string;
    options: HierarchyOption[];
  };
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  disabled?: boolean;
  organizationId: string | null;
}

function ScopeLevelCombobox({
  scopeLevel,
  selectedId,
  onSelect,
  disabled,
  organizationId,
}: ScopeLevelComboboxProps) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [isPending, setIsPending] = useState(false);

  const selectedName = scopeLevel.options.find(
    (o) => o.id === selectedId,
  )?.name;

  const handleCreate = async () => {
    if (!newName.trim() || !organizationId) return;
    setIsPending(true);
    try {
      await dispatch(
        createScope({
          org_id: organizationId,
          type_id: scopeLevel.typeId,
          name: newName.trim(),
        }),
      ).unwrap();
      setNewName("");
      setCreating(false);
    } catch {
      // Redux thunk rejected — error is in the slice
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "h-7 justify-between text-xs font-normal min-w-[220px] max-w-[220px] gap-1.5 px-2",
              !selectedId && "text-muted-foreground",
            )}
          >
            <span className="flex items-center gap-1.5 truncate">
              <ScopeIcon iconName={scopeLevel.icon} color={scopeLevel.color} />
              <span className="truncate">
                {selectedName ?? `All ${scopeLevel.pluralLabel.toLowerCase()}`}
              </span>
            </span>
            {selectedId ? (
              <X
                className="h-3 w-3 shrink-0 opacity-50 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(null);
                }}
              />
            ) : (
              <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[240px] p-0" align="start">
          <Command>
            <CommandInput
              placeholder={`Search ${scopeLevel.label.toLowerCase()}...`}
              className="h-8 text-xs"
            />
            <CommandList>
              <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">
                {scopeLevel.options.length === 0
                  ? `No ${scopeLevel.pluralLabel.toLowerCase()} yet`
                  : "No matches found"}
              </CommandEmpty>
              <CommandGroup>
                {scopeLevel.options.map((opt) => (
                  <CommandItem
                    key={opt.id}
                    value={opt.name}
                    onSelect={() => {
                      onSelect(opt.id === selectedId ? null : opt.id);
                      setOpen(false);
                    }}
                    className="text-xs flex items-center gap-2"
                  >
                    <div
                      className={cn(
                        "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border",
                        opt.id === selectedId
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/30",
                      )}
                    >
                      {opt.id === selectedId && (
                        <Check className="h-2.5 w-2.5" />
                      )}
                    </div>
                    <span className="flex-1 truncate">{opt.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>

          {organizationId && (
            <div className="border-t p-1.5">
              {creating ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={`${scopeLevel.label} name...`}
                    className="h-7 text-xs flex-1 text-base"
                    style={{ fontSize: "16px" }}
                    autoFocus
                    disabled={isPending}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate();
                      if (e.key === "Escape") {
                        setCreating(false);
                        setNewName("");
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={handleCreate}
                    disabled={isPending || !newName.trim()}
                  >
                    {isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      "Add"
                    )}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start h-7 text-xs gap-1.5"
                  style={{ color: scopeLevel.color }}
                  onClick={() => setCreating(true)}
                >
                  <Plus className="h-3 w-3" />
                  New {scopeLevel.label.toLowerCase()}
                </Button>
              )}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

interface LevelComboboxProps {
  label: string;
  icon: React.ReactNode;
  options: HierarchyOption[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  disabled?: boolean;
  placeholder: string;
  accentClass: string;
  accentColor?: string;
  error?: boolean;
  canCreate?: boolean;
  createLabel?: string;
  onCreateSubmit?: (name: string) => Record<string, unknown>;
  createType?: "project" | "task";
}

function LevelCombobox({
  label,
  icon,
  options,
  selectedId,
  onSelect,
  disabled,
  placeholder,
  accentClass,
  accentColor,
  error,
  canCreate,
  createLabel,
  onCreateSubmit,
  createType,
}: LevelComboboxProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const createProject = useCreateProject();
  const createTask = useCreateTask();

  const selectedName = options.find((o) => o.id === selectedId)?.name;

  const handleCreate = async () => {
    if (!newName.trim() || !onCreateSubmit) return;
    const payload = onCreateSubmit(newName.trim());

    try {
      if (createType === "project") {
        await createProject.mutateAsync(
          payload as Parameters<typeof createProject.mutateAsync>[0],
        );
      } else if (createType === "task") {
        await createTask.mutateAsync(
          payload as Parameters<typeof createTask.mutateAsync>[0],
        );
      }
      setNewName("");
      setCreating(false);
    } catch {
      // Error handled by the mutation's onError
    }
  };

  const isPending = createProject.isPending || createTask.isPending;

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "h-7 justify-between text-xs font-normal min-w-[220px] max-w-[220px] gap-1.5 px-2",
              error && "border-destructive text-destructive",
              !selectedId && "text-muted-foreground",
            )}
          >
            <span className="flex items-center gap-1.5 truncate">
              {icon}
              <span className="truncate">{selectedName ?? placeholder}</span>
            </span>
            {selectedId ? (
              <X
                className="h-3 w-3 shrink-0 opacity-50 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(null);
                }}
              />
            ) : (
              <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[240px] p-0" align="start">
          <Command>
            <CommandInput
              placeholder={`Search ${label.toLowerCase()}...`}
              className="h-8 text-xs"
            />
            <CommandList>
              <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">
                {options.length === 0
                  ? `No ${label.toLowerCase()}s yet`
                  : "No matches found"}
              </CommandEmpty>
              <CommandGroup>
                {options.map((opt) => (
                  <CommandItem
                    key={opt.id}
                    value={opt.name}
                    onSelect={() => {
                      onSelect(opt.id === selectedId ? null : opt.id);
                      setOpen(false);
                    }}
                    className="text-xs flex items-center gap-2"
                  >
                    <div
                      className={cn(
                        "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border",
                        opt.id === selectedId
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/30",
                      )}
                    >
                      {opt.id === selectedId && (
                        <Check className="h-2.5 w-2.5" />
                      )}
                    </div>
                    <span className="flex-1 truncate">{opt.name}</span>
                    {opt.isPersonal && (
                      <span className="text-[9px] text-muted-foreground">
                        (personal)
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>

          {canCreate && (
            <div className="border-t p-1.5">
              {creating ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={`${label} name...`}
                    className="h-7 text-xs flex-1 text-base"
                    style={{ fontSize: "16px" }}
                    autoFocus
                    disabled={isPending}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate();
                      if (e.key === "Escape") {
                        setCreating(false);
                        setNewName("");
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={handleCreate}
                    disabled={isPending || !newName.trim()}
                  >
                    {isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      "Add"
                    )}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "w-full justify-start h-7 text-xs gap-1.5",
                    accentColor ? "" : accentClass,
                  )}
                  style={accentColor ? { color: accentColor } : undefined}
                  onClick={() => setCreating(true)}
                >
                  <Plus className="h-3 w-3" />
                  {createLabel}
                </Button>
              )}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
