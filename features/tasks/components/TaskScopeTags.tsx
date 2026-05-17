"use client";

// TaskScopeTags — chip-style scope tagger for a single task. Renders the
// task's currently-assigned scopes as removable colored pills with a
// "+ Add tag" popover for new assignments. Persists via the canonical
// `useEntityScopes` hook (features/scopes), so this file never reads
// `ctx_scope_assignments` directly and never touches `appContextSlice`.

import { useMemo, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { useEntityScopes } from "@/features/scopes/hooks/useEntityScopes";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import {
  makeSelectScopeTypesForOrg,
  selectTreeStatus,
} from "@/features/scopes/redux/selectors/tree";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { DynamicIcon } from "@/components/official/icons/IconResolver";
import { cn } from "@/utils/cn";

interface TaskScopeTagsProps {
  taskId: string;
  orgId: string;
  className?: string;
}

/**
 * Tag-style scope assignment UI for tasks.
 *
 * Renders assigned scopes as removable colored pills with a "+ Add" chip that
 * opens a searchable popover grouped by scope type. Clicking a scope
 * immediately persists via `setScopes` from `useEntityScopes`.
 *
 * Respects `max_assignments_per_entity` per scope type (default: 1 per type).
 */
export default function TaskScopeTags({
  taskId,
  orgId,
  className,
}: TaskScopeTagsProps) {
  useScopeTree();
  const treeStatus = useAppSelector(selectTreeStatus);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { scopeIds, setScopes } = useEntityScopes({
    entityType: "task",
    entityId: taskId,
    organizationId: orgId,
  });

  const selectScopeTypesForOrg = useMemo(
    () => makeSelectScopeTypesForOrg(),
    [],
  );
  const scopeTypes = useAppSelector((s) => selectScopeTypesForOrg(s, orgId));

  const selectedSet = useMemo(() => new Set(scopeIds), [scopeIds]);

  // ─── Build assigned-tag list with type metadata ───────────────────────
  const assignedTags = useMemo(() => {
    const tags: Array<{
      scope_id: string;
      scope_name: string;
      type_id: string;
      type_color: string;
      type_icon: string;
    }> = [];
    for (const t of scopeTypes) {
      for (const s of t.scopes) {
        if (selectedSet.has(s.id)) {
          tags.push({
            scope_id: s.id,
            scope_name: s.name,
            type_id: t.id,
            type_color: t.color,
            type_icon: t.icon,
          });
        }
      }
    }
    return tags;
  }, [scopeTypes, selectedSet]);

  // ─── Filtered groups for the popover ──────────────────────────────────
  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopeTypes
      .map((t) => ({
        ...t,
        scopes: q
          ? t.scopes.filter((s) => s.name.toLowerCase().includes(q))
          : t.scopes,
      }))
      .filter((t) => t.scopes.length > 0);
  }, [scopeTypes, search]);

  // ─── Toggle handlers ──────────────────────────────────────────────────
  const toggle = (scopeId: string, type: (typeof scopeTypes)[number]) => {
    const next = new Set(selectedSet);
    if (next.has(scopeId)) {
      next.delete(scopeId);
    } else {
      const max = type.max_assignments_per_entity;
      if (max !== null && max !== undefined) {
        const inGroup = type.scopes.filter((s) => next.has(s.id)).length;
        if (inGroup >= max) {
          for (const s of type.scopes) next.delete(s.id);
        }
      }
      next.add(scopeId);
    }
    void setScopes(Array.from(next));
  };

  const removeTag = (scopeId: string) => {
    const next = new Set(selectedSet);
    next.delete(scopeId);
    void setScopes(Array.from(next));
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {assignedTags.map((tag) => (
        <span
          key={tag.scope_id}
          className="group inline-flex items-center gap-1 h-6 pl-1.5 pr-0.5 rounded-full border text-[11px] font-medium transition-colors"
          style={{
            borderColor: tag.type_color || undefined,
            color: tag.type_color || undefined,
            backgroundColor: tag.type_color ? `${tag.type_color}1a` : undefined,
          }}
        >
          <DynamicIcon name={tag.type_icon} className="w-3 h-3" />
          <span className="truncate max-w-[140px]">{tag.scope_name}</span>
          <button
            onClick={() => removeTag(tag.scope_id)}
            className="flex items-center justify-center w-4 h-4 rounded-full hover:bg-current/10 transition-colors"
            aria-label={`Remove ${tag.scope_name}`}
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 h-6 px-2 rounded-full border border-dashed text-[11px] font-medium transition-colors",
              "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 hover:bg-accent/50",
            )}
          >
            <Plus className="w-3 h-3" />
            <span>Add tag</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-72 p-0"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border/50">
            <Search className="w-3 h-3 text-muted-foreground shrink-0" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search scopes..."
              className="flex-1 min-w-0 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
              style={{ fontSize: "16px" }}
            />
          </div>
          <div className="max-h-80 overflow-y-auto py-1">
            {treeStatus === "loading" && filteredGroups.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-4">
                Loading scopes...
              </p>
            ) : filteredGroups.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-4">
                {search ? "No matches" : "No scopes defined"}
              </p>
            ) : (
              filteredGroups.map((group) => {
                const inGroup = group.scopes.filter((s) =>
                  selectedSet.has(s.id),
                ).length;
                return (
                  <div key={group.id} className="mb-0.5">
                    <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <DynamicIcon
                        name={group.icon}
                        color={group.color ?? undefined}
                        className="w-3 h-3"
                      />
                      <span>{group.label_plural}</span>
                      {group.max_assignments_per_entity !== null &&
                        group.max_assignments_per_entity !== undefined && (
                          <span className="ml-auto text-[9px] font-normal normal-case tracking-normal text-muted-foreground/70">
                            {inGroup}/{group.max_assignments_per_entity}
                          </span>
                        )}
                    </div>
                    {group.scopes.map((opt) => {
                      const isSelected = selectedSet.has(opt.id);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => toggle(opt.id, group)}
                          className={cn(
                            "w-full flex items-center gap-2 px-3 py-1 text-xs transition-colors",
                            isSelected
                              ? "bg-accent/60 text-foreground"
                              : "text-foreground/80 hover:bg-accent/40",
                          )}
                        >
                          <span
                            className={cn(
                              "flex items-center justify-center w-3.5 h-3.5 rounded border shrink-0",
                              isSelected
                                ? "border-transparent"
                                : "border-border/60",
                            )}
                            style={
                              isSelected && group.color
                                ? {
                                    backgroundColor: group.color,
                                    color: "#fff",
                                  }
                                : undefined
                            }
                          >
                            {isSelected && <Check className="w-2.5 h-2.5" />}
                          </span>
                          <span className="truncate text-left flex-1">
                            {opt.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
