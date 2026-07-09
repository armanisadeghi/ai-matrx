"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, Loader2, CheckCircle2, SaveAll } from "lucide-react";
import { aiModelService } from "../service";
import type { AiModel } from "../types";
import type { ModelAuditResult } from "./auditTypes";
import {
  AuditTableShell,
  Th,
  StatusBadge,
  IssueList,
  ProviderBadge,
} from "./AuditTableShell";
import ModelDetailSheet, { OpenDetailButton } from "./ModelDetailSheet";

interface CoreFieldsAuditTabProps {
  results: ModelAuditResult[];
  allModels: AiModel[];
  onModelUpdated: (id: string, patch: Partial<AiModel>) => void;
}

export default function CoreFieldsAuditTab({
  results,
  allModels,
  onModelUpdated,
}: CoreFieldsAuditTabProps) {
  const [editValues, setEditValues] = useState<
    Record<string, Partial<AiModel>>
  >({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassingModels, setShowPassingModels] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [detailModelId, setDetailModelId] = useState<string | null>(null);

  const coreResults = results.map((r) => ({
    ...r,
    issues: r.issues.filter((i) => i.category === "core_fields"),
    pass: r.categoryPass.core_fields,
  }));

  const failingResults = coreResults.filter((r) => !r.pass);
  const passingResults = coreResults.filter((r) => r.pass);
  const displayResults = showPassingModels ? coreResults : failingResults;

  const dirtyIds = Object.keys(editValues).filter(
    (id) => Object.keys(editValues[id]).length > 0,
  );

  const getVal = (model: AiModel, field: keyof AiModel) =>
    editValues[model.id]?.[field] !== undefined
      ? String(editValues[model.id][field] ?? "")
      : String(model[field] ?? "");

  const setVal = (modelId: string, field: keyof AiModel, value: string) =>
    setEditValues((prev) => ({
      ...prev,
      [modelId]: { ...(prev[modelId] ?? {}), [field]: value },
    }));

  const buildPatch = (
    edits: Partial<AiModel>,
  ): Partial<Omit<AiModel, "id">> => {
    const patch: Partial<Omit<AiModel, "id">> = {};
    if (edits.common_name !== undefined)
      patch.common_name = (edits.common_name as string).trim() || null;
    if (edits.model_class !== undefined)
      patch.model_class = (edits.model_class as string).trim();
    if (edits.context_window !== undefined) {
      const v = parseInt(edits.context_window as unknown as string);
      patch.context_window = isNaN(v) ? null : v;
    }
    if (edits.max_tokens !== undefined) {
      const v = parseInt(edits.max_tokens as unknown as string);
      patch.max_tokens = isNaN(v) ? null : v;
    }
    return patch;
  };

  const saveSingle = async (model: AiModel) => {
    const edits = editValues[model.id];
    if (!edits || Object.keys(edits).length === 0) return;
    setSavingIds((prev) => new Set([...prev, model.id]));
    setErrors((prev) => ({ ...prev, [model.id]: "" }));
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
      setSavedIds((prev) => new Set([...prev, model.id]));
      setEditValues((prev) => {
        const n = { ...prev };
        delete n[model.id];
        return n;
      });
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [model.id]: err instanceof Error ? err.message : "Save failed",
      }));
    } finally {
      setSavingIds((prev) => {
        const s = new Set(prev);
        s.delete(model.id);
        return s;
      });
    }
  };

  const handleSaveAll = async () => {
    if (dirtyIds.length === 0) return;
    setSavingAll(true);
    await Promise.all(
      dirtyIds.map((id) => {
        const model = results.find((r) => r.model.id === id)?.model;
        return model ? saveSingle(model) : Promise.resolve();
      }),
    );
    setSavingAll(false);
  };

  return (
    <>
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-center gap-3 px-3 py-2 border-b shrink-0 bg-muted/20">
          <span className="text-xs text-muted-foreground">
            <span className="font-medium text-destructive">
              {failingResults.length} failing
            </span>
            {" · "}
            <span className="font-medium text-green-600">
              {passingResults.length} passing
            </span>
          </span>
          <div className="flex-1" />
          {dirtyIds.length > 1 && (
            <Button
              size="sm"
              className="h-6 px-2 text-[11px] gap-1"
              onClick={handleSaveAll}
              disabled={savingAll}
            >
              {savingAll ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <SaveAll className="h-3 w-3" />
              )}
              Save All ({dirtyIds.length})
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={() => setShowPassingModels((v) => !v)}
          >
            {showPassingModels ? "Hide passing" : "Show all"}
          </Button>
        </div>

        <AuditTableShell
          isEmpty={displayResults.length === 0}
          empty={
            <div className="flex flex-col items-center gap-2">
              <CheckCircle2 className="h-10 w-10 text-green-500 opacity-60" />
              <p className="text-sm">All models pass core fields audit</p>
            </div>
          }
          headers={
            <>
              <Th className="w-6" />
              <Th>Model (API name)</Th>
              <Th className="w-36">Common Name</Th>
              <Th className="w-28">Maker</Th>
              <Th className="w-24">Class</Th>
              <Th className="w-24">Context</Th>
              <Th className="w-24">Max Tokens</Th>
              <Th className="w-16">Status</Th>
              <Th className="w-36">Issues</Th>
              <Th className="w-16 text-right">Save</Th>
            </>
          }
        >
          {displayResults.map((r, idx) => {
            const { model } = r;
            const isSaving = savingIds.has(model.id);
            const wasSaved = savedIds.has(model.id);
            const isDirty =
              !!editValues[model.id] &&
              Object.keys(editValues[model.id]).length > 0;

            return (
              <tr
                key={model.id}
                className={`border-b border-border ${idx % 2 === 0 ? "" : "bg-muted/20"}`}
              >
                <td className="px-1.5 py-1.5">
                  <OpenDetailButton
                    onClick={() => setDetailModelId(model.id)}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <span className="text-xs font-mono text-muted-foreground">
                    {model.name}
                  </span>
                </td>
                <td className="px-3 py-1">
                  <Input
                    value={getVal(model, "common_name")}
                    onChange={(e) =>
                      setVal(model.id, "common_name", e.target.value)
                    }
                    className={`h-7 text-xs ${!model.common_name && !editValues[model.id]?.common_name ? "border-destructive/50" : ""}`}
                    placeholder="Common name…"
                  />
                </td>
                <td className="px-3 py-1">
                  {/* Maker is derived from the model_provider FK (the free-text
                      provider column is dropped) — read-only here; set the FK in
                      the model detail form. */}
                  <ProviderBadge provider={model.maker} />
                </td>
                <td className="px-3 py-1">
                  <Input
                    value={getVal(model, "model_class")}
                    onChange={(e) =>
                      setVal(model.id, "model_class", e.target.value)
                    }
                    className="h-7 text-xs"
                    placeholder="chat / image…"
                  />
                </td>
                <td className="px-3 py-1">
                  <Input
                    type="number"
                    value={getVal(model, "context_window")}
                    onChange={(e) =>
                      setVal(model.id, "context_window", e.target.value)
                    }
                    className="h-7 text-xs font-mono"
                    placeholder="128000"
                  />
                </td>
                <td className="px-3 py-1">
                  <Input
                    type="number"
                    value={getVal(model, "max_tokens")}
                    onChange={(e) =>
                      setVal(model.id, "max_tokens", e.target.value)
                    }
                    className="h-7 text-xs font-mono"
                    placeholder="4096"
                  />
                </td>
                <td className="px-3 py-1.5">
                  {wasSaved ? (
                    <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Saved
                    </span>
                  ) : (
                    <StatusBadge pass={r.pass} />
                  )}
                </td>
                <td className="px-3 py-1.5">
                  <IssueList issues={r.issues} />
                  {errors[model.id] && (
                    <span className="text-destructive text-[10px]">
                      {errors[model.id]}
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <Button
                    size="sm"
                    className="h-6 px-2 text-[11px] gap-1"
                    disabled={isSaving || !isDirty}
                    onClick={() => saveSingle(model)}
                  >
                    {isSaving ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Save className="h-3 w-3" />
                    )}
                    Save
                  </Button>
                </td>
              </tr>
            );
          })}
        </AuditTableShell>
      </div>

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
