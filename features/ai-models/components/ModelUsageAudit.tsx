"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type { LLMParams } from "@/features/agents/types/agent-api-types";
import { cn } from "@/lib/utils";
import {
  MOBILE_TABLE_FROZEN,
} from "@/components/official/mobile-table/mobileTable";

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
    } catch (err) {
      console.error("Failed to fetch usage", err);
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

  const handleApplyWithSettings = async () => {
    if (!replacementId) return;
    setReplacing(true);
    setReplaceError(null);
    try {
      const result = await aiModelService.replaceModelReferences(
        model.id,
        replacementId,
        pendingSettings,
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
          {!loading && (
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
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={handleOpenReplace}
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Replace Model
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            onClick={load}
            disabled={loading}
          >
            <RefreshCcw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
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
          <Select
            value={replacementId || undefined}
            onValueChange={setReplacementId}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select replacement model..." />
            </SelectTrigger>
            <SelectContent>
              {replacementOptions.map((m) => (
                <SelectItem key={m.id} value={m.id} className="text-xs">
                  {m.common_name || m.name}
                  {m.is_primary && (
                    <span className="ml-1 text-green-600">(primary)</span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {replaceError && (
            <p className="text-destructive text-xs">{replaceError}</p>
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
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={handleCancel}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              disabled={!replacementId || replacing}
              onClick={handleQuickReplace}
            >
              {replacing ? (
                <RefreshCcw className="h-3 w-3 animate-spin" />
              ) : (
                <ArrowRightLeft className="h-3 w-3" />
              )}
              Quick Replace
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs gap-1 ml-auto"
              disabled={!replacementId}
              onClick={handleProceedToSettings}
            >
              <Settings className="h-3 w-3" />
              Review Settings
              <ChevronRight className="h-3 w-3" />
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
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          Failed to load usage data
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-3 space-y-4">
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
        <div className="border rounded-md overflow-hidden">
          <table className={cn("text-xs", MOBILE_TABLE_FROZEN)}>
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">
                  Name
                </th>
                <th className="text-left px-3 py-1.5 font-medium text-muted-foreground w-28">
                  ID
                </th>
                {linkBase && (
                  <th className="text-left px-3 py-1.5 font-medium text-muted-foreground w-12" />
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr
                  key={item.id}
                  className={`group ${i % 2 === 1 ? "bg-muted/20" : ""} ${linkBase ? "hover:bg-muted/40" : ""}`}
                >
                  <td className="px-3 py-1.5 font-medium">
                    {linkBase ? (
                      <Link
                        href={`${linkBase}/${item.id}`}
                        className="hover:text-primary hover:underline transition-colors"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {item.name}
                      </Link>
                    ) : (
                      item.name
                    )}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-muted-foreground">
                    <span title={item.id}>{item.id.slice(0, 8)}…</span>
                  </td>
                  {linkBase && (
                    <td className="px-3 py-1.5 text-right">
                      <Link
                        href={`${linkBase}/${item.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
                        title="Open in editor"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
