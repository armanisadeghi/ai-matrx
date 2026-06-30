"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  RefreshCcw,
  ArrowRightLeft,
  AlertTriangle,
  Settings,
  CheckCircle2,
  Loader2,
  X,
  Search,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  FilterX,
} from "lucide-react";
import { aiModelService } from "../service";
import type { AiModel, ModelUsageResult } from "../types";
// TODO(prompts-deletion): ModelSettingsDialog was removed with features/prompts.
// The "Review Settings" step is temporarily disabled. Re-implement using
// features/agents/components/settings-management/AgentSettingsModal (needs agentId wiring).
import type { LLMParams } from "@/features/agents/types/agent-api-types";

interface DeprecatedModelsAuditProps {
  allModels: AiModel[];
  onClose: () => void;
  onModelsChanged: () => void;
}

interface DeprecatedEntry {
  model: AiModel;
  usage: ModelUsageResult | null;
  loading: boolean;
  error: string | null;
  replacementId: string;
  replacing: boolean;
  replaced: boolean;
}

interface SettingsReviewTarget {
  entry: DeprecatedEntry;
  settings: LLMParams;
}

type SortField =
  "model" | "provider" | "model_class" | "prompts" | "builtins" | "total";
type SortDir = "asc" | "desc";

function SortIcon({
  field,
  sortBy,
  dir,
}: {
  field: SortField;
  sortBy: SortField;
  dir: SortDir;
}) {
  if (field !== sortBy)
    return <ArrowUpDown className="h-3 w-3 ml-1 opacity-30" />;
  return dir === "asc" ? (
    <ArrowUp className="h-3 w-3 ml-1 text-primary" />
  ) : (
    <ArrowDown className="h-3 w-3 ml-1 text-primary" />
  );
}

export default function DeprecatedModelsAudit({
  allModels,
  onClose,
  onModelsChanged,
}: DeprecatedModelsAuditProps) {
  const [entries, setEntries] = useState<DeprecatedEntry[]>([]);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkReplacing, setBulkReplacing] = useState(false);
  const [settingsTarget, setSettingsTarget] =
    useState<SettingsReviewTarget | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // ── Filter / sort state ───────────────────────────────────────────────────
  const [q, setQ] = useState("");
  const [filterProvider, setFilterProvider] = useState("__all__");
  const [filterModelClass, setFilterModelClass] = useState("__all__");
  const [filterMinTotal, setFilterMinTotal] = useState<number | undefined>(
    undefined,
  );
  const [filterMaxTotal, setFilterMaxTotal] = useState<number | undefined>(
    undefined,
  );
  const [filterHasUsage, setFilterHasUsage] = useState<
    "all" | "with" | "without"
  >("all");
  const [sortBy, setSortBy] = useState<SortField>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const activeModels = allModels.filter((m) => !m.is_deprecated);

  const modelClasses = useMemo(
    () =>
      [
        ...new Set(
          allModels
            .filter((m) => m.is_deprecated)
            .map((m) => m.model_class)
            .filter(Boolean),
        ),
      ].sort(),
    [allModels],
  );

  const deprecatedProviders = useMemo(
    () =>
      [
        ...new Set(
          allModels
            .filter((m) => m.is_deprecated)
            .map((m) => m.provider)
            .filter((p): p is string => p != null),
        ),
      ].sort(),
    [allModels],
  );

  const initEntries = useCallback(() => {
    const deprecated = allModels.filter((m) => m.is_deprecated);
    setEntries(
      deprecated.map((model) => ({
        model,
        usage: null,
        loading: true,
        error: null,
        replacementId: "",
        replacing: false,
        replaced: false,
      })),
    );
    return deprecated;
  }, [allModels]);

  useEffect(() => {
    const deprecated = initEntries();
    deprecated.forEach((model) => {
      aiModelService
        .fetchUsage(model.id)
        .then((usage) => {
          setEntries((prev) =>
            prev.map((e) =>
              e.model.id === model.id ? { ...e, usage, loading: false } : e,
            ),
          );
        })
        .catch((err) => {
          setEntries((prev) =>
            prev.map((e) =>
              e.model.id === model.id
                ? {
                    ...e,
                    loading: false,
                    error:
                      err instanceof Error ? err.message : "Failed to load",
                  }
                : e,
            ),
          );
        });
    });
  }, [initEntries]);

  const totalUsage = (entry: DeprecatedEntry) =>
    (entry.usage?.prompts.length ?? 0) +
    (entry.usage?.promptBuiltins.length ?? 0);

  const updateEntry = (modelId: string, patch: Partial<DeprecatedEntry>) => {
    setEntries((prev) =>
      prev.map((e) => (e.model.id === modelId ? { ...e, ...patch } : e)),
    );
  };

  // ── Filtered + sorted view ────────────────────────────────────────────────
  const visibleEntries = useMemo(() => {
    let result = entries.filter((e) => !e.replaced);

    if (q) {
      const lq = q.toLowerCase();
      result = result.filter(
        (e) =>
          e.model.id.toLowerCase().includes(lq) ||
          (e.model.common_name ?? "").toLowerCase().includes(lq) ||
          e.model.name.toLowerCase().includes(lq) ||
          (e.model.provider ?? "").toLowerCase().includes(lq) ||
          (e.model.model_class ?? "").toLowerCase().includes(lq) ||
          (e.model.api_class ?? "").toLowerCase().includes(lq),
      );
    }

    if (filterProvider !== "__all__") {
      result = result.filter((e) => e.model.provider === filterProvider);
    }

    if (filterModelClass !== "__all__") {
      result = result.filter((e) => e.model.model_class === filterModelClass);
    }

    if (filterHasUsage === "with") {
      result = result.filter((e) => !e.loading && totalUsage(e) > 0);
    } else if (filterHasUsage === "without") {
      result = result.filter((e) => !e.loading && totalUsage(e) === 0);
    }

    if (filterMinTotal !== undefined) {
      result = result.filter(
        (e) => !e.loading && totalUsage(e) >= filterMinTotal,
      );
    }
    if (filterMaxTotal !== undefined) {
      result = result.filter(
        (e) => !e.loading && totalUsage(e) <= filterMaxTotal,
      );
    }

    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "model":
          cmp = (a.model.common_name || a.model.name).localeCompare(
            b.model.common_name || b.model.name,
          );
          break;
        case "provider":
          cmp = (a.model.provider ?? "").localeCompare(b.model.provider ?? "");
          break;
        case "model_class":
          cmp = (a.model.model_class ?? "").localeCompare(
            b.model.model_class ?? "",
          );
          break;
        case "prompts":
          cmp = (a.usage?.prompts.length ?? 0) - (b.usage?.prompts.length ?? 0);
          break;
        case "builtins":
          cmp =
            (a.usage?.promptBuiltins.length ?? 0) -
            (b.usage?.promptBuiltins.length ?? 0);
          break;
        case "total":
          cmp = totalUsage(a) - totalUsage(b);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [
    entries,
    q,
    filterProvider,
    filterModelClass,
    filterHasUsage,
    filterMinTotal,
    filterMaxTotal,
    sortBy,
    sortDir,
  ]);

  const replacedEntries = useMemo(
    () => entries.filter((e) => e.replaced),
    [entries],
  );
  const allLoaded = entries.every((e) => !e.loading);

  const entriesReadyForBulk = visibleEntries.filter(
    (e) => e.replacementId && !e.replaced,
  );

  const hasAnyFilter = !!(
    q ||
    filterProvider !== "__all__" ||
    filterModelClass !== "__all__" ||
    filterHasUsage !== "all" ||
    filterMinTotal !== undefined ||
    filterMaxTotal !== undefined
  );

  const handleToggleSort = (field: SortField) => {
    if (field === sortBy) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir(
        field === "total" || field === "prompts" || field === "builtins"
          ? "desc"
          : "asc",
      );
    }
  };

  const clearFilters = () => {
    setQ("");
    setFilterProvider("__all__");
    setFilterModelClass("__all__");
    setFilterHasUsage("all");
    setFilterMinTotal(undefined);
    setFilterMaxTotal(undefined);
  };

  const handleQuickReplace = async (entry: DeprecatedEntry) => {
    if (!entry.replacementId) return;
    updateEntry(entry.model.id, { replacing: true, error: null });
    try {
      await Promise.all([
        aiModelService.replaceModelInPrompts(
          entry.model.id,
          entry.replacementId,
        ),
        aiModelService.replaceModelInBuiltins(
          entry.model.id,
          entry.replacementId,
        ),
      ]);
      updateEntry(entry.model.id, { replacing: false, replaced: true });
      onModelsChanged();
    } catch (err) {
      updateEntry(entry.model.id, {
        replacing: false,
        error: err instanceof Error ? err.message : "Replace failed",
      });
    }
  };

  const handleOpenSettingsReview = (entry: DeprecatedEntry) => {
    setSettingsTarget({ entry, settings: {} });
  };

  const handleApplyWithSettings = async () => {
    if (!settingsTarget || !settingsTarget.entry.replacementId) return;
    const { entry, settings } = settingsTarget;
    updateEntry(entry.model.id, { replacing: true, error: null });
    setSettingsTarget(null);
    try {
      await Promise.all([
        aiModelService.replaceModelInPrompts(
          entry.model.id,
          entry.replacementId,
          settings,
        ),
        aiModelService.replaceModelInBuiltins(
          entry.model.id,
          entry.replacementId,
          settings,
        ),
      ]);
      updateEntry(entry.model.id, { replacing: false, replaced: true });
      onModelsChanged();
    } catch (err) {
      updateEntry(entry.model.id, {
        replacing: false,
        error: err instanceof Error ? err.message : "Replace failed",
      });
    }
  };

  const handleBulkReplace = async () => {
    setBulkConfirmOpen(false);
    setBulkReplacing(true);
    setGlobalError(null);
    try {
      await Promise.all(
        entriesReadyForBulk.map((entry) =>
          Promise.all([
            aiModelService.replaceModelInPrompts(
              entry.model.id,
              entry.replacementId,
            ),
            aiModelService.replaceModelInBuiltins(
              entry.model.id,
              entry.replacementId,
            ),
          ]).then(() => {
            updateEntry(entry.model.id, { replaced: true });
          }),
        ),
      );
      onModelsChanged();
    } catch (err) {
      setGlobalError(
        err instanceof Error ? err.message : "Bulk replace failed",
      );
    } finally {
      setBulkReplacing(false);
    }
  };

  // ── Column header helper ──────────────────────────────────────────────────
  const Th = ({
    field,
    label,
    className = "",
  }: {
    field: SortField;
    label: string;
    className?: string;
  }) => (
    <th
      className={`px-3 py-2 text-left font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap ${className}`}
      onClick={() => handleToggleSort(field)}
    >
      <span className="inline-flex items-center">
        {label}
        <SortIcon field={field} sortBy={sortBy} dir={sortDir} />
      </span>
    </th>
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0 bg-card">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold">Deprecated Models Audit</span>
          {allLoaded && (
            <>
              <Badge variant="outline" className="text-[10px] h-4 px-1">
                {entries.length} deprecated
              </Badge>
              {visibleEntries.filter((e) => totalUsage(e) > 0).length > 0 && (
                <Badge
                  variant="outline"
                  className="text-[10px] h-4 px-1 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-300"
                >
                  {visibleEntries.filter((e) => totalUsage(e) > 0).length} with
                  usage
                </Badge>
              )}
              {replacedEntries.length > 0 && (
                <Badge
                  variant="outline"
                  className="text-[10px] h-4 px-1 text-green-600"
                >
                  {replacedEntries.length} replaced
                </Badge>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {entriesReadyForBulk.length > 0 && (
            <Button
              size="sm"
              className="h-7 text-xs gap-1"
              disabled={bulkReplacing}
              onClick={() => setBulkConfirmOpen(true)}
            >
              {bulkReplacing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ArrowRightLeft className="h-3 w-3" />
              )}
              Replace All ({entriesReadyForBulk.length})
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onClose}
            title="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 py-2 border-b shrink-0 bg-muted/20">
        {/* Search */}
        <div className="relative shrink-0">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search model name, id…"
            className="h-7 pl-6 pr-6 text-xs w-48"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Provider */}
        <Select value={filterProvider} onValueChange={setFilterProvider}>
          <SelectTrigger className="h-7 text-xs w-32 shrink-0">
            <SelectValue placeholder="Provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Providers</SelectItem>
            {deprecatedProviders.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Model class */}
        {modelClasses.length > 0 && (
          <Select value={filterModelClass} onValueChange={setFilterModelClass}>
            <SelectTrigger className="h-7 text-xs w-32 shrink-0">
              <SelectValue placeholder="Model Class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Classes</SelectItem>
              {modelClasses.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Usage filter */}
        <Select
          value={filterHasUsage}
          onValueChange={(v) =>
            setFilterHasUsage(v as "all" | "with" | "without")
          }
        >
          <SelectTrigger className="h-7 text-xs w-36 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All (any usage)</SelectItem>
            <SelectItem value="with">Has references (&gt;0)</SelectItem>
            <SelectItem value="without">No references (0)</SelectItem>
          </SelectContent>
        </Select>

        {/* Total usage range */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-muted-foreground">Total refs</span>
          <Input
            value={filterMinTotal !== undefined ? String(filterMinTotal) : ""}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              setFilterMinTotal(isNaN(v) ? undefined : v);
            }}
            placeholder="min"
            className="h-7 text-xs w-14 font-mono"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <Input
            value={filterMaxTotal !== undefined ? String(filterMaxTotal) : ""}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              setFilterMaxTotal(isNaN(v) ? undefined : v);
            }}
            placeholder="max"
            className="h-7 text-xs w-14 font-mono"
          />
        </div>

        {/* Clear */}
        {hasAnyFilter && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
            onClick={clearFilters}
          >
            <FilterX className="h-3.5 w-3.5" />
            Clear
          </Button>
        )}

        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">
          {visibleEntries.length} shown
        </span>
      </div>

      {globalError && (
        <div className="px-4 py-2 bg-destructive/10 border-b text-destructive text-xs shrink-0">
          {globalError}
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto min-h-0">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 opacity-30" />
            <p className="text-sm">No deprecated models found</p>
          </div>
        ) : visibleEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <Search className="h-10 w-10 opacity-30" />
            <p className="text-sm">No models match the current filters</p>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-card border-b">
              <tr className="h-8">
                <Th field="model" label="Deprecated Model" />
                <Th field="provider" label="Provider" className="w-28" />
                <Th field="model_class" label="Class" className="w-24" />
                <Th
                  field="prompts"
                  label="Prompts"
                  className="w-20 text-center"
                />
                <Th
                  field="builtins"
                  label="Builtins"
                  className="w-20 text-center"
                />
                <Th field="total" label="Total" className="w-16 text-center" />
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                  Replace With
                </th>
                <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-48">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleEntries.map((entry, idx) => {
                const { model } = entry;
                const usageTotal = totalUsage(entry);
                const replacement = allModels.find(
                  (m) => m.id === entry.replacementId,
                );
                const promptCount = entry.usage?.prompts.length ?? 0;
                const builtinCount = entry.usage?.promptBuiltins.length ?? 0;

                return (
                  <tr
                    key={model.id}
                    className={`h-10 border-b border-border transition-colors ${
                      idx % 2 === 0 ? "" : "bg-muted/20"
                    }`}
                  >
                    {/* Model name */}
                    <td className="px-3 py-1.5">
                      <span
                        className="font-medium truncate max-w-[200px] block"
                        title={model.common_name || model.name}
                      >
                        {model.common_name || model.name}
                      </span>
                      <span className="text-muted-foreground font-mono text-[10px]">
                        {model.name}
                      </span>
                    </td>

                    {/* Provider */}
                    <td className="px-3 py-1.5 text-muted-foreground text-xs">
                      {model.provider ?? "—"}
                    </td>

                    {/* Model class */}
                    <td className="px-3 py-1.5 text-muted-foreground text-xs font-mono">
                      {model.model_class ?? "—"}
                    </td>

                    {/* Prompts count */}
                    <td className="px-3 py-1.5 text-center">
                      {entry.loading ? (
                        <RefreshCcw className="h-3 w-3 animate-spin mx-auto text-muted-foreground" />
                      ) : (
                        <Badge
                          variant="outline"
                          className={
                            promptCount > 0
                              ? "text-amber-700 dark:text-amber-300 border-amber-300"
                              : "text-muted-foreground"
                          }
                        >
                          {promptCount}
                        </Badge>
                      )}
                    </td>

                    {/* Builtins count */}
                    <td className="px-3 py-1.5 text-center">
                      {entry.loading ? (
                        <RefreshCcw className="h-3 w-3 animate-spin mx-auto text-muted-foreground" />
                      ) : (
                        <Badge
                          variant="outline"
                          className={
                            builtinCount > 0
                              ? "text-amber-700 dark:text-amber-300 border-amber-300"
                              : "text-muted-foreground"
                          }
                        >
                          {builtinCount}
                        </Badge>
                      )}
                    </td>

                    {/* Total */}
                    <td className="px-3 py-1.5 text-center">
                      {entry.loading ? (
                        <RefreshCcw className="h-3 w-3 animate-spin mx-auto text-muted-foreground" />
                      ) : (
                        <Badge
                          variant={usageTotal > 0 ? "default" : "outline"}
                          className={
                            usageTotal > 0
                              ? "bg-amber-500 hover:bg-amber-500 text-white"
                              : "text-muted-foreground"
                          }
                        >
                          {usageTotal}
                        </Badge>
                      )}
                    </td>

                    {/* Replacement selector */}
                    <td className="px-3 py-1.5">
                      {usageTotal === 0 && !entry.loading ? (
                        <span className="text-muted-foreground italic text-xs">
                          No active usage
                        </span>
                      ) : (
                        <Select
                          value={entry.replacementId || undefined}
                          onValueChange={(v) =>
                            updateEntry(model.id, { replacementId: v })
                          }
                          disabled={entry.replacing}
                        >
                          <SelectTrigger className="h-7 text-xs w-full max-w-[240px]">
                            <SelectValue placeholder="Select replacement..." />
                          </SelectTrigger>
                          <SelectContent>
                            {activeModels.map((m) => (
                              <SelectItem
                                key={m.id}
                                value={m.id}
                                className="text-xs"
                              >
                                {m.common_name || m.name}
                                {m.is_primary && (
                                  <span className="ml-1 text-green-600">
                                    (primary)
                                  </span>
                                )}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-1.5 text-right">
                      {usageTotal > 0 && (
                        <div className="flex items-center justify-end gap-1">
                          {entry.error && (
                            <span className="text-destructive text-[10px] mr-1">
                              {entry.error}
                            </span>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-[11px] gap-1"
                            disabled={
                              !entry.replacementId ||
                              entry.replacing ||
                              entry.loading
                            }
                            onClick={() => handleOpenSettingsReview(entry)}
                            title="Review and adjust settings before replacing"
                          >
                            <Settings className="h-3 w-3" />
                            Review
                          </Button>
                          <Button
                            size="sm"
                            className="h-6 px-2 text-[11px] gap-1"
                            disabled={
                              !entry.replacementId ||
                              entry.replacing ||
                              entry.loading
                            }
                            onClick={() => handleQuickReplace(entry)}
                            title="Replace immediately without settings review"
                          >
                            {entry.replacing ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <ArrowRightLeft className="h-3 w-3" />
                            )}
                            Quick
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Bulk replace confirm ────────────────────────────────────────── */}
      <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Bulk Replace {entriesReadyForBulk.length} Deprecated Models
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  This will immediately replace all references for the following
                  models:
                </p>
                <div className="border rounded-md divide-y text-xs max-h-48 overflow-y-auto">
                  {entriesReadyForBulk.map((entry) => {
                    const r = allModels.find(
                      (m) => m.id === entry.replacementId,
                    );
                    return (
                      <div
                        key={entry.model.id}
                        className="flex items-center justify-between px-3 py-1.5"
                      >
                        <span className="text-muted-foreground">
                          {entry.model.common_name || entry.model.name}
                        </span>
                        <span className="flex items-center gap-1">
                          <ArrowRightLeft className="h-3 w-3" />
                          <span className="font-medium">
                            {r?.common_name || r?.name}
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[10px] h-4 px-1"
                          >
                            {totalUsage(entry)} refs
                          </Badge>
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Settings will not be reviewed — only model IDs will be
                  updated. This cannot be undone.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary hover:bg-primary/90"
              onClick={handleBulkReplace}
            >
              Replace All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Settings review dialog ──────────────────────────────────────── */}
      {/* TODO(prompts-deletion): ModelSettingsDialog removed. Re-implement via AgentSettingsModal. */}
      {settingsTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-card rounded-lg shadow-xl max-w-sm w-full mx-4 p-6 space-y-4">
            <p className="text-sm font-medium">
              Apply replacement without settings review?
            </p>
            <p className="text-xs text-muted-foreground">
              Settings editor is temporarily unavailable. Click Apply to replace
              model IDs only.
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSettingsTarget(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={handleApplyWithSettings}
              >
                <ArrowRightLeft className="h-3 w-3" />
                Apply Replacement
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
