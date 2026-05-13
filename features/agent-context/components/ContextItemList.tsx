"use client";

import { useMemo, useState, useCallback } from "react";
import {
  Search,
  Plus,
  SlidersHorizontal,
  LayoutGrid,
  Table2,
  Columns3,
  Cpu,
  LayoutTemplate,
  X,
  CheckSquare,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { ContextItemCard } from "./ContextItemCard";
import { ContextItemTable } from "./ContextItemTable";
import { ContextKanban } from "./ContextKanban";
import { ContextEmptyState } from "./ContextEmptyState";
import { ContextStatusBadge } from "./ContextStatusBadge";
import { STATUS_PHASES, STATUS_CONFIG } from "../constants";
import {
  useContextManifest,
  useUpdateContextStatus,
  useDuplicateContextItem,
  useArchiveContextItem,
} from "../hooks/useContextItems";
import { useContextFilters } from "../hooks/useContextFilters";
import { useContextKeyboard } from "../hooks/useContextKeyboard";
import type { ContextItemManifest, ContextItemStatus } from "../types";
import type { ScopeState } from "../hooks/useContextScope";
import Link from "next/link";
import { matchesSearch } from "@/utils/search-scoring";

type Props = {
  scope: ScopeState;
};

export function ContextItemList({ scope }: Props) {
  const { data: items, isLoading } = useContextManifest(
    scope.scopeType,
    scope.scopeId,
  );
  const {
    filters,
    sort,
    view,
    setSearch,
    setStatuses,
    setView,
    clearFilters,
    hasActiveFilters,
  } = useContextFilters();
  const statusMutation = useUpdateContextStatus(scope.scopeType, scope.scopeId);
  const duplicateMutation = useDuplicateContextItem(
    scope.scopeType,
    scope.scopeId,
  );
  const archiveMutation = useArchiveContextItem(scope.scopeType, scope.scopeId);
  useContextKeyboard();

  // Dismissible bootstrap banner
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  const selectAll = useCallback(
    (ids: string[]) => setSelectedIds(new Set(ids)),
    [],
  );

  const filteredItems = useMemo(() => {
    if (!items) return [];
    let result = [...items];

    if (filters.search) {
      result = result.filter((i) =>
        matchesSearch(i, filters.search, [
          { get: (x) => x.display_name, weight: "title" },
          { get: (x) => x.key, weight: "subtitle" },
          { get: (x) => x.description, weight: "body" },
          { get: (x) => x.tags, weight: "tag" },
        ]),
      );
    }
    if (filters.statuses.length > 0) {
      result = result.filter((i) => filters.statuses.includes(i.status));
    }
    if (filters.categories.length > 0) {
      result = result.filter(
        (i) => i.category && filters.categories.includes(i.category),
      );
    }
    if (filters.fetchHints.length > 0) {
      result = result.filter((i) => filters.fetchHints.includes(i.fetch_hint));
    }
    if (filters.sensitivities.length > 0) {
      result = result.filter((i) =>
        filters.sensitivities.includes(i.sensitivity),
      );
    }
    if (filters.hasValue === "yes") {
      result = result.filter((i) => i.char_count != null && i.char_count > 0);
    } else if (filters.hasValue === "no") {
      result = result.filter((i) => !i.char_count);
    }

    result.sort((a, b) => {
      const dir = sort.direction === "asc" ? 1 : -1;
      switch (sort.field) {
        case "display_name":
          return dir * a.display_name.localeCompare(b.display_name);
        case "char_count":
          return dir * ((a.char_count ?? 0) - (b.char_count ?? 0));
        default:
          return 0;
      }
    });

    return result;
  }, [items, filters, sort]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const showBootstrap =
    items && items.length < 5 && items.length > 0 && !bannerDismissed;

  return (
    <div className="space-y-3">
      {/* Bootstrap banner — dismissible */}
      {showBootstrap && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <LayoutTemplate className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium">
              Start fast — apply an industry template
            </p>
            <p className="text-[11px] text-muted-foreground">
              Create a set of recommended context items for this scope
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 text-xs h-7"
            asChild
          >
            <Link href="/app-context/templates">Browse Templates</Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 shrink-0"
            onClick={() => setBannerDismissed(true)}
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </Button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            data-context-search
            placeholder="Search items... (press / to focus)"
            value={filters.search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>

        <StatusFilterPopover
          selected={filters.statuses}
          onSelect={setStatuses}
        />

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={clearFilters}
          >
            <X className="h-3 w-3" /> Clear
          </Button>
        )}

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1 text-muted-foreground"
        >
          <Cpu className="h-3.5 w-3.5" /> AI Health Check
          {/* TODO: Wire agent — scans all items in scope, flags quality issues, suggests which stale items to update or archive */}
        </Button>

        <div className="flex items-center border border-border rounded-md overflow-hidden">
          <ViewToggle
            icon={LayoutGrid}
            active={view === "cards"}
            onClick={() => setView("cards")}
            label="Cards"
          />
          <ViewToggle
            icon={Table2}
            active={view === "table"}
            onClick={() => setView("table")}
            label="Table"
          />
          <ViewToggle
            icon={Columns3}
            active={view === "kanban"}
            onClick={() => setView("kanban")}
            label="Kanban"
          />
        </div>

        <Button size="sm" className="h-8 text-xs gap-1" asChild>
          <Link href="/app-context/items/new">
            <Plus className="h-3.5 w-3.5" /> New Item
          </Link>
        </Button>
      </div>

      {/* Content */}
      {filteredItems.length === 0 ? (
        items && items.length === 0 ? (
          <ContextEmptyState variant="no-items" />
        ) : (
          <ContextEmptyState
            variant="no-results"
            onClearFilters={clearFilters}
          />
        )
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredItems.map((item) => (
            <div key={item.id} className="relative">
              {/* Selection checkbox */}
              <div
                className="absolute top-2 left-2 z-10"
                onClick={(e) => e.stopPropagation()}
              >
                <Checkbox
                  checked={selectedIds.has(item.id)}
                  onCheckedChange={() => toggleSelect(item.id)}
                  className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 data-[state=checked]:opacity-100 transition-opacity"
                />
              </div>
              <ContextItemCard
                item={item}
                onStatusChange={(id, s, n) =>
                  statusMutation.mutate({
                    itemId: id,
                    status: s,
                    statusNote: n,
                  })
                }
                onDuplicate={(id) => duplicateMutation.mutate(id)}
                onArchive={(id) => archiveMutation.mutate(id)}
              />
            </div>
          ))}
        </div>
      ) : view === "table" ? (
        <ContextItemTable
          items={filteredItems}
          onStatusChange={(id, s, n) =>
            statusMutation.mutate({ itemId: id, status: s, statusNote: n })
          }
        />
      ) : (
        <ContextKanban
          items={filteredItems}
          onStatusChange={(id, s) =>
            statusMutation.mutate({ itemId: id, status: s })
          }
        />
      )}

      {/* Bulk Status Update — floating action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl border border-border bg-card shadow-lg px-4 py-2.5">
          <CheckSquare className="h-4 w-4 text-primary shrink-0" />
          <span className="text-xs font-medium">
            {selectedIds.size} item{selectedIds.size > 1 ? "s" : ""} selected
          </span>
          <div onClick={(e) => e.stopPropagation()}>
            <BulkStatusPopover
              onStatusChange={(status, note) => {
                selectedIds.forEach((id) => {
                  statusMutation.mutate({
                    itemId: id,
                    status,
                    statusNote: note,
                  });
                });
                clearSelection();
              }}
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={clearSelection}
          >
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────

function ViewToggle({
  icon: Icon,
  active,
  onClick,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      className={`h-8 w-8 flex items-center justify-center transition-colors ${active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}
      onClick={onClick}
      title={label}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function StatusFilterPopover({
  selected,
  onSelect,
}: {
  selected: ContextItemStatus[];
  onSelect: (s: ContextItemStatus[]) => void;
}) {
  const toggle = (s: ContextItemStatus) => {
    onSelect(
      selected.includes(s) ? selected.filter((x) => x !== s) : [...selected, s],
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
          <SlidersHorizontal className="h-3 w-3" />
          Status
          {selected.length > 0 && (
            <Badge variant="secondary" className="h-4 text-[10px] px-1 ml-1">
              {selected.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        {STATUS_PHASES.map((phase) => (
          <div key={phase.key} className="mb-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              {phase.label}
            </p>
            <div className="flex flex-wrap gap-1">
              {phase.statuses.map((s) => {
                const config = STATUS_CONFIG[s];
                const isSelected = selected.includes(s);
                return (
                  <button
                    key={s}
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors border ${isSelected ? `${config.colorBg} ${config.colorText} border-current/20` : "border-transparent hover:bg-muted text-muted-foreground"}`}
                    onClick={() => toggle(s)}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${config.colorDot}`}
                    />
                    {config.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function BulkStatusPopover({
  onStatusChange,
}: {
  onStatusChange: (status: ContextItemStatus, note?: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
          Change Status
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="center">
        <p className="text-xs font-medium text-muted-foreground mb-2">
          Set status for all selected
        </p>
        {STATUS_PHASES.map((phase) => (
          <div key={phase.key} className="mb-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              {phase.label}
            </p>
            <div className="flex flex-wrap gap-1">
              {phase.statuses.map((s) => {
                const config = STATUS_CONFIG[s];
                return (
                  <button
                    key={s}
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] hover:bg-muted transition-colors ${config.colorText}`}
                    onClick={() => onStatusChange(s)}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${config.colorDot}`}
                    />
                    {config.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
