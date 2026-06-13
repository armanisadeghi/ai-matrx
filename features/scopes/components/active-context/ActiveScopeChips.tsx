// features/scopes/components/active-context/ActiveScopeChips.tsx
//
// Compact display of the user's currently-active scope selections plus
// active org / project / task. Each chip has a small `X` to clear that
// dimension. Writes go through appContextSlice action creators (Surface A).
//
// Used in headers, footers, command-bar status strips — anywhere a tight
// 1-line summary of "what context am I working in" is needed without the
// full picker. For the full picker, use <ActiveContextButton /> or
// <ContextAssignmentField mode="active" />.

"use client";

import { useMemo } from "react";
import { Building, FolderKanban, ListCheck, X } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectOrganizationName,
  selectProjectName,
  selectTaskName,
  setOrganization,
  setProject,
  setScopeSelections,
  setTask,
} from "@/lib/redux/slices/appContextSlice";
import {
  selectActiveOrganizationId,
  selectActiveProjectId,
  selectActiveScopeSelections,
  selectActiveTaskId,
} from "@/features/scopes/redux/selectors/active-context";
import {
  makeSelectScope,
  makeSelectScopeType,
} from "@/features/scopes/redux/selectors/tree";
import { DynamicIcon } from "@/components/official/icons/IconResolver";
import { cn } from "@/utils/cn";

interface ActiveScopeChipsProps {
  className?: string;
  /** Hide the org chip (e.g., when org is shown elsewhere). Default false. */
  hideOrg?: boolean;
  /** When set, clicking a chip calls this instead of clearing. */
  onClickChip?: (
    kind: "org" | "scope" | "project" | "task",
    id: string,
  ) => void;
}

export function ActiveScopeChips({
  className,
  hideOrg = false,
  onClickChip,
}: ActiveScopeChipsProps) {
  const dispatch = useAppDispatch();
  const orgId = useAppSelector(selectActiveOrganizationId);
  const orgName = useAppSelector(selectOrganizationName);
  const projectId = useAppSelector(selectActiveProjectId);
  const projectName = useAppSelector(selectProjectName);
  const taskId = useAppSelector(selectActiveTaskId);
  const taskName = useAppSelector(selectTaskName);
  const scopeSelections = useAppSelector(selectActiveScopeSelections);

  const scopeEntries = useMemo(
    () => Object.entries(scopeSelections),
    [scopeSelections],
  );

  const hasAnything =
    !!orgId || !!projectId || !!taskId || scopeEntries.length > 0;

  if (!hasAnything) return null;

  return (
    <div
      className={cn("flex flex-wrap items-center gap-1 text-[11px]", className)}
    >
      {!hideOrg && orgId && (
        <Chip
          icon={<Building className="h-3 w-3" />}
          label={orgName ?? orgId}
          onClear={() => {
            if (onClickChip) onClickChip("org", orgId);
            else dispatch(setOrganization({ id: null }));
          }}
          colorClass="bg-violet-500/10 text-violet-700 dark:text-violet-300"
        />
      )}

      {/* Multi-select (2026-06-12): scope_selections is keyed by scope id. */}
      {scopeEntries.map(([key, scopeId]) => (
        <ScopeChip
          key={key}
          scopeId={scopeId}
          onClear={() => {
            if (onClickChip) {
              onClickChip("scope", scopeId);
              return;
            }
            const next: Record<string, string | null> = { ...scopeSelections };
            delete next[key];
            dispatch(setScopeSelections(next));
          }}
        />
      ))}

      {projectId && (
        <Chip
          icon={<FolderKanban className="h-3 w-3" />}
          label={projectName ?? projectId}
          onClear={() => {
            if (onClickChip) onClickChip("project", projectId);
            else dispatch(setProject({ id: null }));
          }}
          colorClass="bg-amber-500/10 text-amber-700 dark:text-amber-300"
        />
      )}

      {taskId && (
        <Chip
          icon={<ListCheck className="h-3 w-3" />}
          label={taskName ?? taskId}
          onClear={() => {
            if (onClickChip) onClickChip("task", taskId);
            else dispatch(setTask({ id: null }));
          }}
          colorClass="bg-sky-500/10 text-sky-700 dark:text-sky-300"
        />
      )}
    </div>
  );
}

function Chip({
  icon,
  label,
  onClear,
  colorClass,
}: {
  icon: React.ReactNode;
  label: string;
  onClear: () => void;
  colorClass: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 leading-none",
        colorClass,
      )}
    >
      {icon}
      <span className="truncate max-w-[120px]">{label}</span>
      <button
        onClick={onClear}
        aria-label={`Clear ${label}`}
        className="hover:opacity-70 transition-opacity"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

function ScopeChip({
  scopeId,
  onClear,
}: {
  scopeId: string;
  onClear: () => void;
}) {
  // The type is resolved FROM the scope (multi-select keys are scope ids,
  // so the map key no longer carries the type).
  const selectScopeType = useMemo(() => makeSelectScopeType(), []);
  const selectScope = useMemo(() => makeSelectScope(), []);
  const scope = useAppSelector((s) => selectScope(s, scopeId));
  const scopeType = useAppSelector((s) =>
    selectScopeType(s, scope?.scope_type_id ?? ""),
  );
  const label = scope?.name ?? scopeId;
  const iconName = scopeType?.icon ?? "Circle";

  return (
    <Chip
      icon={<DynamicIcon name={iconName} className="h-3 w-3" />}
      label={label}
      onClear={onClear}
      colorClass="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    />
  );
}
