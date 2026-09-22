"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { CheckCircle2, Loader2, Save, SaveAll } from "lucide-react";
import {
  MatrxDataTable,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import { aiModelService } from "../service";
import type { AiModel } from "../types";
import type { ModelAuditResult } from "./auditTypes";
import {
  ApiNameCell,
  IssueList,
  ProviderBadge,
  StatusBadge,
} from "./AuditTableShell";
import ModelDetailSheet, { OpenDetailButton } from "./ModelDetailSheet";

interface CoreFieldsAuditTabProps {
  results: ModelAuditResult[];
  allModels: AiModel[];
  onModelUpdated: (id: string, patch: Partial<AiModel>) => void;
  onRefresh: () => Promise<void>;
}

type EditableCoreField = "common_name" | "context_window" | "max_tokens";

export default function CoreFieldsAuditTab({
  results,
  allModels,
  onModelUpdated,
  onRefresh,
}: CoreFieldsAuditTabProps) {
  const [editValues, setEditValues] = useState<
    Record<string, Partial<Record<EditableCoreField, string>>>
  >({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassingModels, setShowPassingModels] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [detailModelId, setDetailModelId] = useState<string | null>(null);

  const coreResults = results.map((result) => ({
    ...result,
    issues: result.issues.filter((issue) => issue.category === "core_fields"),
    pass: result.categoryPass.core_fields,
  }));
  const failingResults = coreResults.filter((result) => !result.pass);
  const passingResults = coreResults.filter((result) => result.pass);
  const displayResults = showPassingModels ? coreResults : failingResults;
  const dirtyIds = Object.keys(editValues).filter(
    (id) => Object.keys(editValues[id] ?? {}).length > 0,
  );
  const getVal = (model: AiModel, field: EditableCoreField) =>
    editValues[model.id]?.[field] !== undefined
      ? String(editValues[model.id][field] ?? "")
      : String(model[field] ?? "");
  const setVal = (model: AiModel, field: EditableCoreField, value: string) =>
    setEditValues((previous) => {
      const next = { ...previous };
      const edits = { ...(next[model.id] ?? {}) };
      if (value === String(model[field] ?? "")) {
        delete edits[field];
      } else {
        edits[field] = value;
      }
      if (Object.keys(edits).length === 0) {
        delete next[model.id];
      } else {
        next[model.id] = edits;
      }
      return next;
    });
  const buildPatch = (
    edits: Partial<Record<EditableCoreField, string>>,
  ): Partial<Omit<AiModel, "id">> => {
    const patch: Partial<Omit<AiModel, "id">> = {};
    if (edits.common_name !== undefined)
      patch.common_name = String(edits.common_name).trim() || null;
    if (edits.context_window !== undefined) {
      const value = Number.parseInt(String(edits.context_window), 10);
      patch.context_window = Number.isNaN(value) ? null : value;
    }
    if (edits.max_tokens !== undefined) {
      const value = Number.parseInt(String(edits.max_tokens), 10);
      patch.max_tokens = Number.isNaN(value) ? null : value;
    }
    return patch;
  };
  const saveSingle = async (model: AiModel) => {
    const edits = editValues[model.id];
    if (!edits || Object.keys(edits).length === 0) return;
    setSavingIds((previous) => new Set([...previous, model.id]));
    setErrors((previous) => ({ ...previous, [model.id]: "" }));
    try {
      const patch = buildPatch(edits);
      await Promise.all(
        Object.entries(patch).map(([field, value]) =>
          aiModelService.patchField(
            model.id,
            field as keyof Omit<AiModel, "id">,
            value as AiModel[keyof AiModel],
          ),
        ),
      );
      onModelUpdated(model.id, patch);
      setSavedIds((previous) => new Set([...previous, model.id]));
      setEditValues((previous) => {
        const next = { ...previous };
        delete next[model.id];
        return next;
      });
    } catch (error) {
      setErrors((previous) => ({
        ...previous,
        [model.id]: error instanceof Error ? error.message : "Save failed",
      }));
    } finally {
      setSavingIds((previous) => {
        const next = new Set(previous);
        next.delete(model.id);
        return next;
      });
    }
  };
  const handleSaveAll = async () => {
    if (dirtyIds.length === 0) return;
    setSavingAll(true);
    await Promise.all(
      dirtyIds.map((id) => {
        const model = results.find((result) => result.model.id === id)?.model;
        return model ? saveSingle(model) : Promise.resolve();
      }),
    );
    setSavingAll(false);
  };
  const columns: MatrxColumnDef<ModelAuditResult>[] = [
    {
      id: "model_id",
      accessorFn: (r) => r.model.id,
      header: "Model ID",
      hidden: true,
    },
    {
      id: "model_name",
      accessorFn: (r) => r.model.name,
      header: "API name",
      cell: (r) => <ApiNameCell name={r.model.name} />,
      frozen: true,
      width: 220,
    },
    {
      id: "common_name",
      accessorFn: (r) => r.model.common_name ?? "",
      header: "Common name",
      width: 180,
      cell: (r) => (
        <Input
          value={getVal(r.model, "common_name")}
          onChange={(event) =>
            setVal(r.model, "common_name", event.target.value)
          }
          className={`h-7 text-xs ${!r.model.common_name && !editValues[r.model.id]?.common_name ? "border-destructive/50" : ""}`}
          placeholder="Common name…"
        />
      ),
    },
    {
      id: "provider",
      accessorFn: (r) => r.model.maker ?? "",
      header: "Provider",
      cell: (r) => <ProviderBadge provider={r.model.maker} />,
      filter: "select",
      width: 130,
    },
    {
      id: "context_window",
      accessorFn: (r) => r.model.context_window,
      header: "Context",
      filter: "number",
      width: 130,
      cell: (r) => (
        <Input
          type="number"
          value={getVal(r.model, "context_window")}
          onChange={(event) =>
            setVal(r.model, "context_window", event.target.value)
          }
          className="h-7 font-mono text-xs"
          placeholder="128000"
        />
      ),
    },
    {
      id: "max_tokens",
      accessorFn: (r) => r.model.max_tokens,
      header: "Max tokens",
      filter: "number",
      width: 130,
      cell: (r) => (
        <Input
          type="number"
          value={getVal(r.model, "max_tokens")}
          onChange={(event) =>
            setVal(r.model, "max_tokens", event.target.value)
          }
          className="h-7 font-mono text-xs"
          placeholder="4096"
        />
      ),
    },
    {
      id: "status",
      accessorFn: (r) => (r.pass ? "pass" : "fail"),
      header: "Status",
      filter: "select",
      filterOptions: [
        { value: "pass", label: "Pass" },
        { value: "fail", label: "Fail" },
      ],
      width: 110,
      cell: (r) =>
        savedIds.has(r.model.id) ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Saved
          </span>
        ) : (
          <StatusBadge pass={r.pass} />
        ),
    },
    {
      id: "issues",
      accessorFn: (r) => r.issues.map((issue) => issue.message).join(" "),
      header: "Issues",
      cell: (r) => (
        <>
          <IssueList issues={r.issues} />
          {errors[r.model.id] && (
            <span className="text-[10px] text-destructive">
              {errors[r.model.id]}
            </span>
          )}
        </>
      ),
      width: 280,
    },
  ];
  return (
    <>
      <MatrxDataTable<ModelAuditResult>
        tableId="ai-model-audit-core-fields"
        viewTabs={false}
        data={displayResults}
        columns={columns}
        getRowId={(r) => r.model.id}
        defaultSort={{ id: "model_name", direction: "asc" }}
        toolbar={{
          title: "Core field audit",
          searchPlaceholder: "Search core-field audit",
          refresh: { onRefresh },
          actions: (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                <span className="font-medium text-destructive">
                  {failingResults.length} failing
                </span>{" "}
                ·{" "}
                <span className="font-medium text-green-600">
                  {passingResults.length} passing
                </span>
              </span>
              {dirtyIds.length > 1 && (
                <Button
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={handleSaveAll}
                  disabled={savingAll}
                >
                  {savingAll ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <SaveAll className="h-3 w-3" />
                  )}
                  Save all ({dirtyIds.length})
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setShowPassingModels((value) => !value)}
              >
                {showPassingModels ? "Hide passing" : "Show all"}
              </Button>
            </div>
          ),
        }}
        emptyState={{
          title: showPassingModels
            ? "No models match this audit view"
            : "All models pass core fields audit",
          icon: <CheckCircle2 className="h-10 w-10 text-green-500" />,
        }}
        detail={{ enabled: false }}
        copy={{
          label: "AI model audit",
          location: "AI Model Data Audit",
          rowKind: "ai-model-audit",
          listKind: "ai-model-audit-list",
          humanRow: (result) => result.model.common_name ?? result.model.name,
          agentRow: (result) => result.model,
        }}
        rowActions={(r) => {
          const model = r.model;
          const isDirty = Object.keys(editValues[model.id] ?? {}).length > 0;
          return (
            <div className="flex items-center gap-1">
              <OpenDetailButton onClick={() => setDetailModelId(model.id)} />
              <Button
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                disabled={savingIds.has(model.id) || !isDirty}
                onClick={() => void saveSingle(model)}
              >
                {savingIds.has(model.id) ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                Save
              </Button>
            </div>
          );
        }}
      />
      <ModelDetailSheet
        modelId={detailModelId}
        allModels={allModels}
        onClose={() => setDetailModelId(null)}
        onSaved={(saved) => {
          onModelUpdated(saved.id, saved);
          setDetailModelId(null);
        }}
      />
    </>
  );
}
