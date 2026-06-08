"use client";

import React, { useState, useMemo } from "react";
import { useSelector } from "react-redux";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Check, X, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { idMatchesQuery } from "@/utils/search-scoring";
import { Badge } from "@/components/ui/badge";
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
  const [filterClass, setFilterClass] = useState<string | null>(null);

  const providers = useMemo(
    () =>
      [
        ...new Set(models.map((m) => m.provider).filter(Boolean) as string[]),
      ].sort(),
    [models],
  );

  const modelClasses = useMemo(
    () =>
      [
        ...new Set(
          models.map((m) => m.model_class).filter(Boolean) as string[],
        ),
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
      result = result.filter((m) => m.provider === filterProvider);
    }

    if (filterClass) {
      result = result.filter((m) => m.model_class === filterClass);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          m.common_name?.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          m.provider?.toLowerCase().includes(q) ||
          idMatchesQuery(m, q),
      );
    }

    return result;
  }, [
    models,
    filterView,
    filterProvider,
    filterClass,
    searchQuery,
    aiModels.activeModels,
    aiModels.inactiveModels,
  ]);

  const activeCount = models.filter((m) =>
    aiModels.activeModels.includes(m.id),
  ).length;
  const hasFilters =
    filterProvider !== null || filterClass !== null || filterView !== "all";

  const clearFilters = () => {
    setFilterProvider(null);
    setFilterClass(null);
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
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/40">
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
      <div className="px-4 py-2 space-y-2 border-b border-border/40">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search models..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-7 text-xs"
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
                "px-2 py-0.5 rounded text-xs transition-colors",
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
            className="h-6 px-1.5 rounded text-xs bg-muted/60 text-muted-foreground border-0 outline-none hover:bg-muted hover:text-foreground transition-colors cursor-pointer appearance-none"
          >
            <option value="">All Providers</option>
            {providers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          {/* Model class filter */}
          {modelClasses.length > 1 && (
            <select
              value={filterClass ?? ""}
              onChange={(e) => setFilterClass(e.target.value || null)}
              className="h-6 px-1.5 rounded text-xs bg-muted/60 text-muted-foreground border-0 outline-none hover:bg-muted hover:text-foreground transition-colors cursor-pointer appearance-none"
            >
              <option value="">All Types</option>
              {modelClasses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
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
                  className="flex items-center gap-2.5 px-4 py-1.5 border-b border-border/30 hover:bg-muted/40 transition-colors group"
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
                    {model.model_class && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 h-4 font-normal hidden sm:inline-flex"
                      >
                        {model.model_class}
                      </Badge>
                    )}
                    {model.provider && (
                      <span className="text-[10px] text-muted-foreground/70 w-16 text-right truncate">
                        {model.provider}
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
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-border/40 text-[10px] text-muted-foreground">
        <span>
          Showing {filteredModels.length} of {models.length}
        </span>
        <span>Deprecated models are automatically excluded</span>
      </div>
    </div>
  );
};

export default AiModelsPreferences;
