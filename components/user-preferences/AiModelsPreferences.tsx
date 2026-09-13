"use client";

import React, { useState, useMemo } from "react";
import { useSelector } from "react-redux";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@ai-matrx/design-system";
import { Loader2, Search, Check, X, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { idMatchesQuery } from "@ai-matrx/kit/search-scoring";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { RootState } from "@/lib/redux/store";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  setPreference,
  UserPreferencesState,
} from "@/lib/redux/preferences/userPreferencesSlice";
import { useModels, type AIModel } from "@/features/ai-models/hooks/useModels";

type FilterView = "all" | "active" | "inactive";

const AiModelsPreferences = () => {
  const dispatch = useAppDispatch();
  const preferences = useSelector(
    (state: RootState) => state.userPreferences as UserPreferencesState,
  );
  const { aiModels } = preferences;
  const { models, isLoading: loading } = useModels();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterView, setFilterView] = useState<FilterView>("all");
  const [filterProvider, setFilterProvider] = useState<string | null>(null);

  const providers = useMemo(
    () =>
      [
        ...new Set(models.map((m) => m.maker).filter(Boolean) as string[]),
      ].sort(),
    [models],
  );

  const toggleModel = (modelId: string, currentlyActive: boolean) => {
    if (currentlyActive) {
      dispatch(
        setPreference({
          module: "aiModels",
          preference: "activeModels",
          value: aiModels.activeModels.filter((id) => id !== modelId),
        }),
      );
      dispatch(
        setPreference({
          module: "aiModels",
          preference: "inactiveModels",
          value: [...aiModels.inactiveModels, modelId],
        }),
      );
    } else {
      dispatch(
        setPreference({
          module: "aiModels",
          preference: "inactiveModels",
          value: aiModels.inactiveModels.filter((id) => id !== modelId),
        }),
      );
      dispatch(
        setPreference({
          module: "aiModels",
          preference: "activeModels",
          value: [...aiModels.activeModels, modelId],
        }),
      );
    }
  };

  const filteredModels = useMemo(() => {
    let result = models;

    if (filterView === "active") {
      result = result.filter((m) => aiModels.activeModels.includes(m.id));
    } else if (filterView === "inactive") {
      result = result.filter((m) => aiModels.inactiveModels.includes(m.id));
    }

    if (filterProvider) {
      result = result.filter((m) => m.maker === filterProvider);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          m.common_name?.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          m.maker?.toLowerCase().includes(q) ||
          idMatchesQuery(m, q),
      );
    }

    return result;
  }, [
    models,
    filterView,
    filterProvider,
    searchQuery,
    aiModels.activeModels,
    aiModels.inactiveModels,
  ]);

  const activeCount = models.filter((m) =>
    aiModels.activeModels.includes(m.id),
  ).length;
  const hasFilters = filterProvider !== null || filterView !== "all";

  const clearFilters = () => {
    setFilterProvider(null);
    setFilterView("all");
    setSearchQuery("");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header stats bar */}
      <div className="flex items-center justify-between border-b border-border/40 px-3 py-2 sm:px-4">
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {models.length} models
          </span>
          <span className="text-xs text-muted-foreground">
            <span className="text-green-600 dark:text-green-400 font-medium">
              {activeCount}
            </span>{" "}
            active
          </span>
        </div>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3 w-3" />
            Clear filters
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="space-y-2 border-b border-border/40 px-3 py-2 sm:px-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search models..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-sm sm:h-7 sm:text-xs"
          />
        </div>

        {/* Filter chips row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="h-3 w-3 text-muted-foreground shrink-0" />

          {/* View filter */}
          {(["all", "active", "inactive"] as FilterView[]).map((view) => (
            <button
              key={view}
              onClick={() => setFilterView(view)}
              className={cn(
                "min-h-11 rounded px-2 text-sm transition-colors sm:min-h-0 sm:py-0.5 sm:text-xs",
                filterView === view
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {view === "all"
                ? "All"
                : view === "active"
                  ? "Active"
                  : "Inactive"}
            </button>
          ))}

          <span className="w-px h-3.5 bg-border/60 mx-0.5" />

          {/* Provider filter */}
          <select
            value={filterProvider ?? ""}
            onChange={(e) => setFilterProvider(e.target.value || null)}
            className="h-11 cursor-pointer appearance-none rounded border-0 bg-muted/60 px-1.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground sm:h-6 sm:text-xs"
          >
            <option value="">All Providers</option>
            {providers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Model list */}
      <ScrollArea className="flex-1">
        <div>
          {filteredModels.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
              No models match the current filters.
            </div>
          ) : (
            filteredModels.map((model) => {
              const isActive = aiModels.activeModels.includes(model.id);
              return (
                <div
                  key={model.id}
                  className="group flex items-center gap-2.5 border-b border-border/30 px-3 py-2.5 transition-colors hover:bg-muted/40 sm:px-4 sm:py-1.5"
                >
                  <Switch
                    checked={isActive}
                    onCheckedChange={() => toggleModel(model.id, isActive)}
                    className="shrink-0 scale-90"
                  />
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <span
                      className={cn(
                        "text-xs truncate",
                        isActive
                          ? "text-foreground font-medium"
                          : "text-muted-foreground",
                      )}
                    >
                      {model.common_name || model.name}
                    </span>
                    {model.common_name && model.name !== model.common_name && (
                      <span className="text-[10px] text-muted-foreground/60 truncate hidden lg:inline">
                        {model.name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {model.maker && (
                      <span className="text-[10px] text-muted-foreground/70 w-16 text-right truncate">
                        {model.maker}
                      </span>
                    )}
                    {isActive && (
                      <Check className="h-3 w-3 text-green-500 shrink-0" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Results footer */}
      <div className="flex items-center justify-between border-t border-border/40 px-3 py-2 text-[11px] text-muted-foreground sm:px-4 sm:py-1.5 sm:text-[10px]">
        <span>
          Showing {filteredModels.length} of {models.length}
        </span>
        <span>Deprecated models are automatically excluded</span>
      </div>
    </div>
  );
};

export default AiModelsPreferences;
