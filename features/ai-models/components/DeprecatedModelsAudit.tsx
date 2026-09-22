"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@ai-matrx/design-system";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ai-matrx/design-system";
import { ModelListDropdown } from "@/features/ai-models/components/lab/ModelListDropdown";
import { hasCompatibleDecisionInteraction } from "@/features/ai-models/capabilities/types";
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
  SlidersHorizontal,
} from "lucide-react";
import { aiModelService } from "../service";
import type { AiModel, ModelUsageResult } from "../types";
import { ModelSettingsReviewDialog } from "./ModelSettingsReviewDialog";
import {
  ImpactBatchPanel,
  type ImpactBatchScope,
} from "@/features/mandates/admin/ImpactBatchPanel";
import { useOpenImpactBatchWindow } from "@/features/overlays/openers/impactBatchWindow";
import { toast } from "@/lib/toast";
import type { LLMParams } from "@/features/agents/types/agent-api-types";
import {
  MatrxDataTable,
  type MatrxColumnDef,
  type MatrxDataTableQueryState,
} from "@ai-matrx/design-system/data-table";

interface DeprecatedModelsAuditProps {
  allModels: AiModel[];
  onClose: () => void;
  onModelsChanged: () => void | Promise<void>;
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

/** The agent.definition ids a model's usage names — the dry-run scope (I5). */
function agentIdsOf(entry: DeprecatedEntry): string[] {
  const usage = entry.usage;
  if (!usage) return [];
  return Array.from(
    new Set([
      ...usage.promptBuiltins.map((item) => item.id),
      ...usage.agents.map((item) => item.id),
    ]),
  );
}

export default function DeprecatedModelsAudit({
  allModels,
  onClose,
  onModelsChanged,
}: DeprecatedModelsAuditProps) {
  const [entries, setEntries] = useState<DeprecatedEntry[]>([]);
  // ── Agent Change Impact (I5): every model swap ends in the batch panel ──
  // Before the write the confirm step shows a DRY RUN of the swap (graded as
  // if applied); the pins chosen there carry into the post-batch window,
  // which opens scoped to exactly the agents the writer touched.
  const openImpactBatchWindow = useOpenImpactBatchWindow();
  const [dryRunSelection, setDryRunSelection] = useState<string[]>([]);
  const modelLabel = (id: string): string => {
    const model = allModels.find((m) => m.id === id);
    return model?.common_name || model?.name || id;
  };
  const openPostBatch = (
    agentIds: string[],
    sentence: string,
    preselected: string[],
  ) => {
    if (agentIds.length === 0) {
      toast.info(
        `${sentence} — no agent definitions were rewritten, so there are no mandate pins to grade.`,
      );
      return;
    }
    openImpactBatchWindow({
      agentIds,
      mode: "post_batch",
      batchLabel: sentence,
      sourceSentence: sentence,
      preselectedRungIds: preselected,
      surfaceName: "deprecated-models-audit",
    });
  };
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkReplacing, setBulkReplacing] = useState(false);
  const [settingsTarget, setSettingsTarget] =
    useState<SettingsReviewTarget | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // ── Filter / sort state ───────────────────────────────────────────────────
  const [tableQuery, setTableQuery] = useState<MatrxDataTableQueryState>({
    page: 1,
    pageSize: 50,
    search: "",
    anyOf: "",
    columnFilters: {},
    sort: { id: "total", direction: "desc" },
  });
  const [filterProvider, setFilterProvider] = useState("__all__");
  const [filterMinTotal, setFilterMinTotal] = useState<number | undefined>(
    undefined,
  );
  const [filterMaxTotal, setFilterMaxTotal] = useState<number | undefined>(
    undefined,
  );
  const [filterHasUsage, setFilterHasUsage] = useState<
    "all" | "with" | "without"
  >("all");

  const activeModels = useMemo(
    () => allModels.filter((model) => !model.is_deprecated),
    [allModels],
  );

  const deprecatedProviders = useMemo(
    () =>
      [
        ...new Set(
          allModels
            .filter((m) => m.is_deprecated)
            .map((m) => m.maker)
            .filter((p): p is string => p != null),
        ),
      ].sort(),
    [allModels],
  );

  const initEntries = useCallback(() => {
    const deprecated = allModels.filter((m) => m.is_deprecated);
    return {
      deprecated,
      entries: deprecated.map((model) => ({
        model,
        usage: null,
        loading: true,
        error: null,
        replacementId: "",
        replacing: false,
        replaced: false,
      })),
    };
  }, [allModels]);

  useEffect(() => {
    const { deprecated, entries: initialEntries } = initEntries();
    const initialize = window.setTimeout(() => {
      setEntries(initialEntries);
      deprecated.forEach((model) => {
        aiModelService
          .fetchUsage(model.id)
          .then((usage) => {
            setEntries((prev) =>
              prev.map((entry) =>
                entry.model.id === model.id
                  ? { ...entry, usage, loading: false }
                  : entry,
              ),
            );
          })
          .catch((err) => {
            setEntries((prev) =>
              prev.map((entry) =>
                entry.model.id === model.id
                  ? {
                      ...entry,
                      loading: false,
                      error:
                        err instanceof Error ? err.message : "Failed to load",
                    }
                  : entry,
              ),
            );
          });
      });
    }, 0);
    return () => window.clearTimeout(initialize);
  }, [initEntries]);

  const totalUsage = (entry: DeprecatedEntry) =>
    (entry.usage?.prompts.length ?? 0) +
    (entry.usage?.promptBuiltins.length ?? 0) +
    (entry.usage?.agents.length ?? 0) +
    (entry.usage?.agentTemplates.length ?? 0);

  const updateEntry = (modelId: string, patch: Partial<DeprecatedEntry>) => {
    setEntries((prev) =>
      prev.map((e) => (e.model.id === modelId ? { ...e, ...patch } : e)),
    );
  };

  // ── Filtered + sorted view ────────────────────────────────────────────────
  const visibleEntries = useMemo(() => {
    let result = entries.filter((e) => !e.replaced);

    if (tableQuery.search) {
      const search = tableQuery.search.toLowerCase();
      result = result.filter(
        (e) =>
          e.model.id.toLowerCase().includes(search) ||
          (e.model.common_name ?? "").toLowerCase().includes(search) ||
          e.model.name.toLowerCase().includes(search) ||
          (e.model.maker ?? "").toLowerCase().includes(search),
      );
    }

    if (filterProvider !== "__all__") {
      result = result.filter((e) => e.model.maker === filterProvider);
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

    return result;
  }, [
    entries,
    tableQuery.search,
    filterProvider,
    filterHasUsage,
    filterMinTotal,
    filterMaxTotal,
  ]);

  const replacedEntries = useMemo(
    () => entries.filter((e) => e.replaced),
    [entries],
  );
  const allLoaded = entries.every((e) => !e.loading);

  const entriesReadyForBulk = visibleEntries.filter(
    (entry): entry is DeprecatedEntry & { replacementId: string } =>
      Boolean(entry.replacementId) && !entry.replaced,
  );

  const hasAnyDomainFilter = !!(
    filterProvider !== "__all__" ||
    filterHasUsage !== "all" ||
    filterMinTotal !== undefined ||
    filterMaxTotal !== undefined
  );
  const activeDomainFilterCount =
    Number(filterProvider !== "__all__") +
    Number(filterHasUsage !== "all") +
    Number(filterMinTotal !== undefined || filterMaxTotal !== undefined);


  const clearDomainFilters = () => {
    setFilterProvider("__all__");
    setFilterHasUsage("all");
    setFilterMinTotal(undefined);
    setFilterMaxTotal(undefined);
  };

  const handleQuickReplace = async (entry: DeprecatedEntry) => {
    if (!entry.replacementId) return;
    updateEntry(entry.model.id, { replacing: true, error: null });
    try {
      const result = await aiModelService.replaceModelReferences(
        entry.model.id,
        entry.replacementId,
      );
      updateEntry(entry.model.id, { replacing: false, replaced: true });
      onModelsChanged();
      openPostBatch(
        result.agent_ids,
        `Replaced ${modelLabel(entry.model.id)} with ${modelLabel(entry.replacementId)}`,
        [],
      );
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
      const result = await aiModelService.replaceModelReferences(
        entry.model.id,
        entry.replacementId,
        settings,
      );
      updateEntry(entry.model.id, { replacing: false, replaced: true });
      onModelsChanged();
      openPostBatch(
        result.agent_ids,
        `Replaced ${modelLabel(entry.model.id)} with ${modelLabel(entry.replacementId)} (settings reviewed)`,
        [],
      );
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
    const batch = entriesReadyForBulk;
    const preselected = dryRunSelection;
    try {
      // Per model, never all-or-nothing: a failed swap never hides the ones
      // that landed, and the panel opens for exactly the agents rewritten.
      const settled = await Promise.allSettled(
        batch.map((entry) =>
          aiModelService
            .replaceModelReferences(entry.model.id, entry.replacementId)
            .then((result) => {
              updateEntry(entry.model.id, { replaced: true });
              return result;
            }),
        ),
      );
      onModelsChanged();
      const touched = new Set<string>();
      const failures: string[] = [];
      settled.forEach((outcome, index) => {
        if (outcome.status === "fulfilled") {
          for (const id of outcome.value.agent_ids) touched.add(id);
        } else {
          const entry = batch[index];
          const message =
            outcome.reason instanceof Error
              ? outcome.reason.message
              : String(outcome.reason);
          updateEntry(entry.model.id, { error: message });
          failures.push(`${modelLabel(entry.model.id)}: ${message}`);
        }
      });
      if (failures.length > 0) {
        setGlobalError(
          `${failures.length} of ${batch.length} replacements failed. Open Review on a failed row for the reason.`,
        );
      }
      const landed = batch.length - failures.length;
      openPostBatch(
        Array.from(touched),
        `Replaced ${landed} deprecated model${landed === 1 ? "" : "s"} in ${touched.size} agent${touched.size === 1 ? "" : "s"}`,
        preselected,
      );
    } catch (err) {
      setGlobalError(
        err instanceof Error ? err.message : "Bulk replace failed",
      );
    } finally {
      setBulkReplacing(false);
    }
  };

  const dryRunScopes: ImpactBatchScope[] = entriesReadyForBulk.map((entry) => ({
    agentIds: agentIdsOf(entry),
    delta: { model_id: entry.replacementId },
  }));
  const dryRunAgentIds = Array.from(
    new Set(dryRunScopes.flatMap((scope) => scope.agentIds)),
  );
  const auditColumns = useMemo<MatrxColumnDef<DeprecatedEntry>[]>(
    () => [
      {
        id: "model",
        header: "Deprecated model",
        accessorFn: (entry) => entry.model.common_name || entry.model.name,
        searchText: (entry: DeprecatedEntry) =>
          [entry.model.id, entry.model.common_name, entry.model.name]
            .filter(Boolean)
            .join(" "),
        cell: (entry) => (
          <span
            className="block max-w-[180px] truncate whitespace-nowrap font-medium"
            title={entry.model.common_name || entry.model.name}
          >
            {entry.model.common_name || entry.model.name}
          </span>
        ),
      },
      {
        id: "identifier",
        header: "Identifier",
        accessorFn: (entry) => entry.model.name,
        cell: (entry) => (
          <span
            className="block max-w-[220px] truncate whitespace-nowrap font-mono text-[10px] text-muted-foreground"
            title={entry.model.name}
          >
            {entry.model.name}
          </span>
        ),
      },
      {
        id: "provider",
        header: "Provider",
        accessorFn: (entry) => entry.model.maker ?? "",
        cell: (entry) => entry.model.maker ?? "—",
      },
      {
        id: "prompts",
        header: "Prompts",
        accessorFn: (entry) => entry.usage?.prompts.length ?? 0,
        defaultSortDirection: "desc",
        align: "center",
        cell: (entry) =>
          entry.loading ? (
            <RefreshCcw className="mx-auto h-3 w-3 animate-spin text-muted-foreground" />
          ) : (
            <Badge variant="outline">{entry.usage?.prompts.length ?? 0}</Badge>
          ),
      },
      {
        id: "builtins",
        header: "Builtins",
        accessorFn: (entry) => entry.usage?.promptBuiltins.length ?? 0,
        defaultSortDirection: "desc",
        align: "center",
        cell: (entry) =>
          entry.loading ? (
            <RefreshCcw className="mx-auto h-3 w-3 animate-spin text-muted-foreground" />
          ) : (
            <Badge variant="outline">
              {entry.usage?.promptBuiltins.length ?? 0}
            </Badge>
          ),
      },
      {
        id: "agents",
        header: "Agents",
        accessorFn: (entry) => entry.usage?.agents.length ?? 0,
        defaultSortDirection: "desc",
        align: "center",
        cell: (entry) =>
          entry.loading ? (
            <RefreshCcw className="mx-auto h-3 w-3 animate-spin text-muted-foreground" />
          ) : (
            <Badge variant="outline">{entry.usage?.agents.length ?? 0}</Badge>
          ),
      },
      {
        id: "templates",
        header: "Templates",
        accessorFn: (entry) => entry.usage?.agentTemplates.length ?? 0,
        defaultSortDirection: "desc",
        align: "center",
        cell: (entry) =>
          entry.loading ? (
            <RefreshCcw className="mx-auto h-3 w-3 animate-spin text-muted-foreground" />
          ) : (
            <Badge variant="outline">
              {entry.usage?.agentTemplates.length ?? 0}
            </Badge>
          ),
      },
      {
        id: "total",
        header: "Total",
        accessorFn: totalUsage,
        defaultSortDirection: "desc",
        align: "center",
        cell: (entry) =>
          entry.loading ? (
            <RefreshCcw className="mx-auto h-3 w-3 animate-spin text-muted-foreground" />
          ) : (
            <Badge variant={totalUsage(entry) > 0 ? "default" : "outline"}>
              {totalUsage(entry)}
            </Badge>
          ),
      },
      {
        id: "replacement",
        header: "Replace with",
        accessorFn: (entry) => entry.replacementId,
        sortable: false,
        filter: false,
        cell: (entry) =>
          totalUsage(entry) === 0 && !entry.loading ? (
            <span className="text-xs italic text-muted-foreground">
              No active usage
            </span>
          ) : (
            <ModelListDropdown
              value={entry.replacementId || undefined}
              onValueChange={(replacementId) =>
                updateEntry(entry.model.id, { replacementId })
              }
              inputModalities={[]}
              allowedModelIds={activeModels
                .filter((candidate) =>
                  hasCompatibleDecisionInteraction(
                    entry.model.capabilities,
                    candidate.capabilities,
                  ),
                )
                .map((candidate) => candidate.id)}
              catalogVariant="admin"
              selectionPurpose="admin"
              placeholder="Select replacement..."
              className="h-7 w-full max-w-[240px] justify-between text-xs"
              disabled={entry.replacing}
            />
          ),
      },
    ],
    [activeModels],
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {globalError && (
        <div
          role="alert"
          className="flex shrink-0 items-center gap-2 border-b bg-destructive/10 px-4 py-2 text-sm text-destructive"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{globalError}</span>
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <MatrxDataTable<DeprecatedEntry>
          tableId="ai-models/deprecated-audit"
          data={visibleEntries}
          columns={auditColumns}
          getRowId={(entry) => entry.model.id}
          density="condensed"
          className="min-h-0 flex-1"
          query={{
            mode: "controlled-local",
            state: tableQuery,
            onStateChange: setTableQuery,
          }}
          isLoading={
            entries.length === 0 && allModels.some((model) => model.is_deprecated)
          }
          defaultSort={{ id: "total", direction: "desc" }}
          coverage={{ noun: "deprecated model", answeredBy: "client" }}
          copy={false}
          emptyState={{
            icon: entries.length === 0 ? (
              <CheckCircle2 className="h-10 w-10 opacity-30" />
            ) : (
              <Search className="h-10 w-10 opacity-30" />
            ),
            title:
              entries.length === 0
                ? "No deprecated models found"
                : "No models match the current filters",
          }}
          toolbar={{
            title: "Deprecated models",
            search: true,
            searchPlaceholder: "Search model name, identifier, or provider…",
            refresh: {
              onRefresh: async () => {
                await onModelsChanged();
              },
            },
            facets: [
              {
                type: "custom",
                id: "deprecated-model-filters",
                filter: {
                  active: hasAnyDomainFilter,
                  onReset: clearDomainFilters,
                },
                render: () => (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        Filters
                        {activeDomainFilterCount > 0 && (
                          <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                            {activeDomainFilterCount}
                          </Badge>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent sizing="content" align="start" className="space-y-3">
                      <div className="space-y-1">
                        <span className="text-xs font-medium">Provider</span>
                        <Select
                          value={filterProvider}
                          onValueChange={setFilterProvider}
                        >
                          <SelectTrigger className="h-8 w-full text-xs">
                            <SelectValue placeholder="Provider" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__all__">All providers</SelectItem>
                            {deprecatedProviders.map((provider) => (
                              <SelectItem key={provider} value={provider}>
                                {provider}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs font-medium">Usage</span>
                        <Select
                          value={filterHasUsage}
                          onValueChange={(value) =>
                            setFilterHasUsage(value as "all" | "with" | "without")
                          }
                        >
                          <SelectTrigger className="h-8 w-full text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All usage</SelectItem>
                            <SelectItem value="with">Has references (&gt;0)</SelectItem>
                            <SelectItem value="without">No references (0)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs font-medium">Total references</span>
                        <div className="flex items-center gap-1">
                          <Input
                            value={
                              filterMinTotal !== undefined
                                ? String(filterMinTotal)
                                : ""
                            }
                            onChange={(event) => {
                              const value = parseInt(event.target.value, 10);
                              setFilterMinTotal(
                                Number.isNaN(value) ? undefined : value,
                              );
                            }}
                            placeholder="min"
                            className="h-8 w-full font-mono text-xs"
                            aria-label="Minimum total references"
                          />
                          <span className="text-xs text-muted-foreground">to</span>
                          <Input
                            value={
                              filterMaxTotal !== undefined
                                ? String(filterMaxTotal)
                                : ""
                            }
                            onChange={(event) => {
                              const value = parseInt(event.target.value, 10);
                              setFilterMaxTotal(
                                Number.isNaN(value) ? undefined : value,
                              );
                            }}
                            placeholder="max"
                            className="h-8 w-full font-mono text-xs"
                            aria-label="Maximum total references"
                          />
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                ),
              },
            ],
            actions: (
              <div className="flex items-center gap-2">
                {allLoaded &&
                  visibleEntries.filter((entry) => totalUsage(entry) > 0).length >
                    0 && (
                    <Badge
                      variant="outline"
                      className="border-amber-300 bg-amber-50 px-1 text-[10px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                    >
                      {
                        visibleEntries.filter((entry) => totalUsage(entry) > 0)
                          .length
                      }{" "}
                      with usage
                    </Badge>
                  )}
                {replacedEntries.length > 0 && (
                  <Badge
                    variant="outline"
                    className="px-1 text-[10px] text-green-600"
                  >
                    {replacedEntries.length} replaced
                  </Badge>
                )}
                {entriesReadyForBulk.length > 0 && (
                  <Button
                    size="sm"
                    className="gap-1 text-xs"
                    disabled={bulkReplacing}
                    onClick={() => setBulkConfirmOpen(true)}
                  >
                    {bulkReplacing ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ArrowRightLeft className="h-3 w-3" />
                    )}
                    Replace all ({entriesReadyForBulk.length})
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={onClose}
                  aria-label="Close deprecated models audit"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ),
          }}
          detail={{ enabled: false }}
          window={{ enabled: false }}
          rowActions={(entry) =>
            totalUsage(entry) > 0 && (
              <div className="flex items-center gap-1">
                {entry.error && (
                  <span
                    role="status"
                    className="text-[11px] font-medium text-destructive"
                  >
                    Couldn&apos;t replace
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  disabled={
                    !entry.replacementId || entry.replacing || entry.loading
                  }
                  onClick={() => handleOpenSettingsReview(entry)}
                >
                  <Settings className="h-3 w-3" />
                  Review
                </Button>
                <Button
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  disabled={
                    !entry.replacementId || entry.replacing || entry.loading
                  }
                  onClick={() => handleQuickReplace(entry)}
                >
                  {entry.replacing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <ArrowRightLeft className="h-3 w-3" />
                  )}
                  Quick
                </Button>
              </div>
            )
          }
        />

      </div>

      {/* ── Bulk replace confirm ────────────────────────────────────────── */}
      <AlertDialog
        open={bulkConfirmOpen}
        onOpenChange={(open) => {
          setBulkConfirmOpen(open);
          if (open) setDryRunSelection([]);
        }}
      >
        <AlertDialogContent className="flex max-h-[90dvh] w-[min(72rem,96vw)] max-w-none flex-col overflow-hidden">
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
                  Settings are not reviewed here — only model ids change. Every
                  agent rewritten gets a new saved version; the mandate pins
                  below keep running the OLD version until you advance them.
                  Rewriting an agent is not undone by this screen; a pin you
                  advance afterwards can be reverted within the revert window.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* THE DRY RUN (I5): the same panel the post-batch window shows,
              graded as if the swap had landed. Pins picked here are
              pre-selected after the write. */}
          {bulkConfirmOpen ? (
            <div className="flex min-h-[40vh] flex-1 flex-col overflow-hidden rounded-md border border-border">
              <ImpactBatchPanel
                agentIds={dryRunAgentIds}
                mode="dry_run"
                scopes={dryRunScopes}
                batchLabel="Deprecated models: bulk replace"
                sourceSentence={`Replacing ${entriesReadyForBulk.length} deprecated model${entriesReadyForBulk.length === 1 ? "" : "s"} in ${dryRunAgentIds.length} agent${dryRunAgentIds.length === 1 ? "" : "s"}`}
                selectedRungIds={dryRunSelection}
                onSelectedRungIdsChange={setDryRunSelection}
                surfaceName="deprecated-models-audit"
                compact
              />
            </div>
          ) : null}
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

      {/* ── Settings review dialog — catalogue-driven rows for the
             replacement model via the shared ModelSettingsReviewDialog. ── */}
      {settingsTarget && (
        <ModelSettingsReviewDialog
          open
          replacementModelId={settingsTarget.entry.replacementId}
          fromLabel={
            settingsTarget.entry.model.common_name ||
            settingsTarget.entry.model.name
          }
          toLabel={(() => {
            const r = allModels.find(
              (m) => m.id === settingsTarget.entry.replacementId,
            );
            return (
              r?.common_name || r?.name || settingsTarget.entry.replacementId
            );
          })()}
          value={settingsTarget.settings}
          onChange={(next) =>
            setSettingsTarget((prev) =>
              prev ? { ...prev, settings: next } : prev,
            )
          }
          onReplacementModelChange={(modelId) => {
            const sourceId = settingsTarget.entry.model.id;
            updateEntry(sourceId, { replacementId: modelId });
            setSettingsTarget((prev) =>
              prev
                ? {
                    ...prev,
                    entry: { ...prev.entry, replacementId: modelId },
                  }
                : prev,
            );
          }}
          onApply={handleApplyWithSettings}
          onCancel={() => setSettingsTarget(null)}
          applying={settingsTarget.entry.replacing}
          error={settingsTarget.entry.error}
        />
      )}
    </div>
  );
}
