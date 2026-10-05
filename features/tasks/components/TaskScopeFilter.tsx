"use client";

// TaskScopeFilter — Sidebar filter for scoping the task list. Writes to
// `taskUiSlice.filterScopeIds` only — never ctx_scope_assignments or
// appContextSlice. Uses the canonical ContextAssignmentField in filter mode.

import { useCallback, useMemo, useState } from "react";
import { Filter as FilterIcon, X } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  clearFilterScopes,
  selectFilterScopeIds,
  selectFilterScopeMatchAll,
  setFilterScopeIds,
  setFilterScopeMatchAll,
  toggleFilterScopeId,
} from "@/features/tasks/redux/taskUiSlice";
import { ContextAssignmentField } from "@/features/scopes/components/context-assignment/ContextAssignmentField";
import { selectAllScopeTypesFlat } from "@/features/scopes/redux/selectors/tree";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/utils/cn";

interface TaskScopeFilterProps {
  className?: string;
}

export default function TaskScopeFilter({ className }: TaskScopeFilterProps) {
  const dispatch = useAppDispatch();
  useScopeTree();
  const filterScopeIds = useAppSelector(selectFilterScopeIds);
  const matchAll = useAppSelector(selectFilterScopeMatchAll);
  const [filterResetKey, setFilterResetKey] = useState(0);

  const handleSelectionChange = useCallback(
    (selection: { scopeIds: string[] }) => {
      dispatch(setFilterScopeIds(selection.scopeIds));
    },
    [dispatch],
  );

  const handleClear = useCallback(() => {
    dispatch(clearFilterScopes());
    setFilterResetKey((k) => k + 1);
  }, [dispatch]);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between px-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
          <FilterIcon size={12} />
          <span>Scope Filter</span>
        </h2>
        {filterScopeIds.length > 0 && (
          <Button
            variant="quiet"
            onClick={handleClear}
          >
            Clear
          </Button>
        )}
      </div>

      {filterScopeIds.length >= 2 && (
        <div className="flex items-center gap-2 px-3">
          <span className="text-xs text-muted-foreground">
            {matchAll ? "Match all" : "Match any"}
          </span>
          <Switch
            checked={matchAll}
            onCheckedChange={(v) => dispatch(setFilterScopeMatchAll(!!v))}
          />
        </div>
      )}

      <ContextAssignmentField
        key={filterResetKey}
        mode="filter"
        writeMode="live"
        dimensions={["scopes"]}
        initialSelection={{ scopeIds: filterScopeIds }}
        onSelectionChange={handleSelectionChange}
        hideSubject
        sectionHeight={240}
        className="mx-3 border-0 shadow-none"
      />
    </div>
  );
}

/**
 * Compact chip row for rendering the *currently active* scope filter at the top
 * of a list view. Each chip removes itself on click; a "Clear all" button is
 * rendered on the right.
 */
export function ActiveScopeFilterChips({ className }: { className?: string }) {
  const dispatch = useAppDispatch();
  const filterScopeIds = useAppSelector(selectFilterScopeIds);
  const matchAll = useAppSelector(selectFilterScopeMatchAll);

  // Labels resolve across every organization the person belongs to — a chip for
  // a scope in any org must render (active-org-never-a-list-filter, AO-032).
  const scopeTypes = useAppSelector(selectAllScopeTypesFlat);

  const flat = useMemo(() => {
    const m = new Map<string, { label: string; color: string }>();
    for (const t of scopeTypes) {
      for (const s of t.scopes) {
        m.set(s.id, { label: s.name, color: t.color });
      }
    }
    return m;
  }, [scopeTypes]);

  if (filterScopeIds.length === 0) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 px-3 py-1.5 border-b border-border bg-muted/30",
        className,
      )}
    >
      <span className="text-[11px] text-muted-foreground">
        {matchAll ? "Match all:" : "Match any:"}
      </span>
      {filterScopeIds.map((id) => {
        const info = flat.get(id);
        if (!info) return null;
        return (
          <Badge
            key={id}
            variant="outline"
            className="gap-1 text-xs pl-2 pr-1 py-0.5"
            style={{ borderColor: info.color, color: info.color }}
          >
            <span>{info.label}</span>
            <button
              type="button"
              className="rounded hover:bg-accent p-0.5"
              onClick={() => dispatch(toggleFilterScopeId(id))}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        );
      })}
      <Button
        variant="quiet"
        className="ml-auto"
        onClick={() => dispatch(clearFilterScopes())}
      >
        Clear all
      </Button>
    </div>
  );
}
