"use client";

import { ReadFailure } from "@ai-matrx/design-system";
import { StaleDataNotice } from "@ai-matrx/design-system";
import React, { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ModelListDropdown } from "@ai-matrx/agents/models/react";
import {
  RefreshCcw,
  ArrowRightLeft,
  AlertTriangle,
  ExternalLink,
  Settings,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { aiModelService } from "../service";
import type { AiModel, ModelUsageResult } from "../types";
import { ModelSettingsReviewDialog } from "./ModelSettingsReviewDialog";
import type { LLMParams } from "@ai-matrx/chat/agents/types/agent-api-types";
import type { SettingSwap } from "@/features/ai-models/server/replace-model-references";
import { usageSettingsList } from "./unionUsageSettings";
import { MatrxDataTable, type MatrxColumnDef } from "@ai-matrx/design-system/data-table";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface ModelUsageAuditProps {
  model: AiModel;
  allModels: AiModel[];
  onReplaceDone: () => void;
}

type ReplaceStep = "idle" | "pick-model" | "review-settings";

export default function ModelUsageAudit({
  model,
  allModels,
  onReplaceDone,
}: ModelUsageAuditProps) {
  const [usage, setUsage] = useState<ModelUsageResult | null>(null);
  const [loading, setLoading] = useState(false);
  // The failed read itself (RC-B12 r13): never a "0 references" badge, and a
  // failed refresh over earlier usage says the numbers may be out of date.
  const [usageError, setUsageError] = useState<unknown>(null);
  const [step, setStep] = useState<ReplaceStep>("idle");
  const [replacementId, setReplacementId] = useState("");
  const [pendingSettings, setPendingSettings] = useState<LLMParams>({});
  const [replacing, setReplacing] = useState(false);
  const [replaceError, setReplaceError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await aiModelService.fetchUsage(model.id);
      setUsage(result);
      setUsageError(null);
    } catch (err) {
      console.error("Failed to fetch usage", err);
      setUsageError(err ?? new Error("The usage read failed"));
    } finally {
      setLoading(false);
    }
  }, [model.id]);

  useEffect(() => {
    load();
  }, [load]);

  const totalUsage =
    (usage?.prompts.length ?? 0) +
    (usage?.promptBuiltins.length ?? 0) +
    (usage?.agents.length ?? 0) +
    (usage?.agentTemplates.length ?? 0);

  // Every other active model is offered — an admin's replacement is never
  // filtered by a compatibility rule (offers, never gates).
  const replacementOptions = allModels.filter(
    (m) => m.id !== model.id && !m.is_deprecated,
  );
  const selectedReplacement = allModels.find((m) => m.id === replacementId);

  const handleOpenReplace = () => {
    setReplacementId("");
    setPendingSettings({});
    setReplaceError(null);
    setStep("pick-model");
  };

  const handleProceedToSettings = () => {
    if (!replacementId) return;
    // Seed settings with empty object — ModelSettings will show the new model's controls
    // with their defaults. User can adjust before applying.
    setPendingSettings({});
    setStep("review-settings");
  };

  const handleQuickReplace = async () => {
    if (!replacementId) return;
    setReplacing(true);
    setReplaceError(null);
    try {
      const result = await aiModelService.replaceModelReferences(
        model.id,
        replacementId,
      );
      if (result.agents + result.builtins + result.templates === 0) {
        setReplaceError("No references were updated.");
      }
      setStep("idle");
      await load();
      onReplaceDone();
    } catch (err) {
      setReplaceError(err instanceof Error ? err.message : "Replace failed");
    } finally {
      setReplacing(false);
    }
  };

  const handleApplyWithSettings = async (swaps: SettingSwap[]) => {
    if (!replacementId) return;
    setReplacing(true);
    setReplaceError(null);
    try {
      const result = await aiModelService.replaceModelReferences(
        model.id,
        replacementId,
        pendingSettings,
        swaps,
      );
      if (result.agents + result.builtins + result.templates === 0) {
        setReplaceError("No references were updated.");
      }
      setStep("idle");
      await load();
      onReplaceDone();
    } catch (err) {
      setReplaceError(err instanceof Error ? err.message : "Replace failed");
    } finally {
      setReplacing(false);
    }
  };

  const handleCancel = () => {
    setStep("idle");
    setReplacementId("");
    setPendingSettings({});
    setReplaceError(null);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Usage Audit</span>
          {!loading && usage && (
            <Badge
              variant="outline"
              className={
                totalUsage > 0
                  ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300"
                  : "text-muted-foreground"
              }
            >
              {totalUsage} reference{totalUsage !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {totalUsage > 0 && step === "idle" && (
            <Button
              icon={<ArrowRightLeft />}
              variant="outline"
              onClick={handleOpenReplace}
            >
              Replace Model
            </Button>
          )}
          <Button
            icon={<RefreshCcw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />}
            variant="quiet"
            onClick={load}
            disabled={loading}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Step 1: Pick replacement model */}
      {step === "pick-model" && (
        <div className="border-b shrink-0 px-3 py-3 bg-muted/30 space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px]">
              1
            </span>
            Select replacement model
            <ChevronRight className="h-3 w-3" />
            <span className="opacity-40">2 Review settings</span>
          </div>
          <ModelListDropdown
            modelOnly
            value={replacementId}
            onValueChange={setReplacementId}
            inputModalities={[]}
            allowedModelIds={replacementOptions.map(
              (candidate) => candidate.id,
            )}
            catalogVariant="admin"
            selectionPurpose="admin"
            placeholder="Select replacement model…"
            className="h-8 w-full justify-between text-xs"
          />
          {replaceError && (
            <p
              role="status"
              className="inline-flex items-center gap-1 text-xs font-medium text-destructive"
            >
              <AlertTriangle className="h-3 w-3" aria-hidden />
              Couldn&apos;t replace
              <ErrorAlchemyMenu />
            </p>
          )}
          {selectedReplacement && (
            <p className="text-xs text-muted-foreground">
              Replacing {totalUsage} reference{totalUsage !== 1 ? "s" : ""} to{" "}
              <strong>{model.common_name || model.name}</strong> →{" "}
              <strong>
                {selectedReplacement.common_name || selectedReplacement.name}
              </strong>
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button
              variant="quiet"
              onClick={handleCancel}
            >
              Cancel
            </Button>
            <Button
              icon={replacing ? (
                <RefreshCcw className="animate-spin" />
              ) : (
                <ArrowRightLeft />
              )}
              variant="outline"
              disabled={!replacementId || replacing}
              onClick={handleQuickReplace}
            >
              Quick Replace
            </Button>
            <Button
              icon={<Settings />} iconEnd={<ChevronRight />}
              variant="primary"
              className="ml-auto"
              disabled={!replacementId}
              onClick={handleProceedToSettings}
            >
              Review Settings
            </Button>
          </div>
        </div>
      )}

      {/* Main content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <RefreshCcw className="h-4 w-4 animate-spin" />
            Loading usage data...
          </div>
        </div>
      ) : !usage ? (
        <div className="flex-1 flex items-center justify-center">
          <ReadFailure
            error={usageError ?? true}
            what="this model's usage"
            onRetry={() => void load()}
          />
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-3 space-y-4">
          {usageError != null && (
            <StaleDataNotice
              hasData
              what="this model's usage"
              onRetry={() => void load()}
            />
          )}
          {model.is_deprecated && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md text-sm text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <strong>Deprecated model</strong> — this model is marked as
                deprecated but still has {totalUsage} active reference
                {totalUsage !== 1 ? "s" : ""}. Use "Replace Model" to migrate to
                an active model.
              </div>
            </div>
          )}

          <UsageSection
            title="Agents"
            items={usage.agents}
            emptyMessage="No agents reference this model."
            linkBase="/agents"
          />

          <UsageSection
            title="Agent Templates"
            items={usage.agentTemplates}
            emptyMessage="No agent templates reference this model."
          />

          <UsageSection
            title="Prompts"
            items={usage.prompts}
            emptyMessage="No prompts reference this model directly."
            linkBase="/ai/prompts/edit"
          />

          <UsageSection
            title="Prompt Builtins"
            items={usage.promptBuiltins}
            emptyMessage="No prompt builtins reference this model."
          />
        </div>
      )}

      {/* Step 2: Settings review — catalogue-driven rows for the replacement
          model via the shared ModelSettingsReviewDialog. */}
      {step === "review-settings" && replacementId && (
        <ModelSettingsReviewDialog
          open
          replacementModelId={replacementId}
          fromLabel={model.common_name || model.name}
          toLabel={
            selectedReplacement?.common_name ||
            selectedReplacement?.name ||
            replacementId
          }
          value={pendingSettings}
          onChange={setPendingSettings}
          onReplacementModelChange={setReplacementId}
          sourceSettings={usageSettingsList(usage)}
          onApply={handleApplyWithSettings}
          onCancel={handleCancel}
          applying={replacing}
          error={replaceError}
        />
      )}
    </div>
  );
}

function UsageSection({
  title,
  items,
  emptyMessage,
  linkBase,
}: {
  title: string;
  items: { id: string; name: string }[];
  emptyMessage: string;
  linkBase?: string;
}) {
  const columns: MatrxColumnDef<{ id: string; name: string }>[] = [
    {
      id: "name",
      header: "Name",
      accessorFn: (item) => item.name,
      width: 280,
      cell: (item) =>
        linkBase ? (
          <Link
            href={`${linkBase}/${item.id}`}
            className="font-medium hover:text-primary hover:underline transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            {item.name}
          </Link>
        ) : (
          <span className="font-medium">{item.name}</span>
        ),
    },
    {
      id: "id",
      header: "ID",
      accessorFn: (item) => item.id,
      width: 120,
      cell: (item) => (
        <span className="font-mono text-muted-foreground" title={item.id}>
          {item.id.slice(0, 8)}…
        </span>
      ),
    },
    ...(linkBase
      ? [
          {
            id: "open",
            header: "Open",
            sortable: false,
            filter: false,
            accessorFn: (item: { id: string }) => item.id,
            width: 64,
            align: "right",
            cell: (item: { id: string }) => (
              <Link
                href={`${linkBase}/${item.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-muted-foreground hover:text-primary"
                title="Open in editor"
              >
                <ExternalLink className="h-3 w-3" />
              </Link>
            ),
          } satisfies MatrxColumnDef<{ id: string; name: string }>,
        ]
      : []),
  ];

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-medium">{title}</span>
        <Badge variant="outline" className="text-xs">
          {items.length}
        </Badge>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground pl-1">{emptyMessage}</p>
      ) : (
        <MatrxDataTable<{ id: string; name: string }>
          tableId={`ai-model-usage-${title.toLowerCase().replace(/\s+/g, "-")}`}
          data={items}
          columns={columns}
          getRowId={(item) => item.id}
          emptyState={{ title: emptyMessage }}
          detail={{ enabled: false }}
          copy={{
            label: `Model usage: ${title}`,
            location: "AI Model Usage Audit",
            rowKind: "ai-model-usage-reference",
            listKind: "ai-model-usage-references",
            humanRow: (item) => `${title.replace(/s$/, "")} ${item.name} (${item.id})`,
            agentRow: (item) => ({ kind: title, ...item }),
          }}
        />
      )}
    </div>
  );
}
