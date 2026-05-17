"use client";

// TaskScopeFilter — Sidebar filter for scoping the task list to one or more
// scope ids. This is a *filter* (not an assignment): it writes to
// `taskUiSlice.filterScopeIds` only — never to `ctx_scope_assignments` and
// never to `appContextSlice`. It uses `EntityScopeTagger` in **controlled
// mode** so the picker chrome stays consistent with every other Surface B
// surface in the app.

import { useCallback, useMemo } from "react";
import { Filter as FilterIcon, X } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import {
  clearFilterScopes,
  selectFilterScopeIds,
  selectFilterScopeMatchAll,
  setFilterScopeIds,
  setFilterScopeMatchAll,
  toggleFilterScopeId,
} from "@/features/tasks/redux/taskUiSlice";
import { EntityScopeTagger } from "@/features/scopes/components/entity-context/EntityScopeTagger";
import { makeSelectScopeTypesForOrg } from "@/features/scopes/redux/selectors/tree";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/utils/cn";

interface TaskScopeFilterProps {
  className?: string;
  /** Display variant — "sidebar" (collapsible sections) or "compact" (flat chip row). */
  variant?: "sidebar" | "compact";
}

export default function TaskScopeFilter({
  className,
  variant = "sidebar",
}: TaskScopeFilterProps) {
  const dispatch = useAppDispatch();
  useScopeTree();
  const orgId = useAppSelector(selectActiveOrganizationId);
  const filterScopeIds = useAppSelector(selectFilterScopeIds);
  const matchAll = useAppSelector(selectFilterScopeMatchAll);

  const handleChange = useCallback(
    (next: string[]) => dispatch(setFilterScopeIds(next)),
    [dispatch],
  );

  if (!orgId) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between px-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
          <FilterIcon size={12} />
          <span>Scope Filter</span>
        </h2>
        {filterScopeIds.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => dispatch(clearFilterScopes())}
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

      <EntityScopeTagger
        value={filterScopeIds}
        onChange={handleChange}
        organizationId={orgId}
        variant={variant}
        showHeader={false}
        allowMultiPerType
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
  const orgId = useAppSelector(selectActiveOrganizationId);
  const filterScopeIds = useAppSelector(selectFilterScopeIds);
  const matchAll = useAppSelector(selectFilterScopeMatchAll);

  const selectScopeTypesForOrg = useMemo(makeSelectScopeTypesForOrg, []);
  const scopeTypes = useAppSelector((s) => selectScopeTypesForOrg(s, orgId));

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
        variant="ghost"
        size="sm"
        className="h-5 text-[11px] px-2 ml-auto"
        onClick={() => dispatch(clearFilterScopes())}
      >
        Clear all
      </Button>
    </div>
  );
}
