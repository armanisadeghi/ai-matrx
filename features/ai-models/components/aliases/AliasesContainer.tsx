"use client";

/**
 * AliasesContainer — admin CRUD for ai.model_alias.
 *
 * An alias maps an alternate model name (old name, "-latest" pointer,
 * deprecated id) to a live ai.model_definition row so inbound requests using
 * the alternate name still resolve. Kinds (DB check constraint):
 *   alias | deprecated | latest
 */

import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ai-matrx/design-system";
import {
  MatrxDataTable,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { extractErrorMessage } from "@/utils/errors";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import { AiModelRef } from "@/components/official/entity-ref/AiIdentityRef";
import { ModelListDropdown } from "@/features/ai-models/components/lab/ModelListDropdown";
import { aiModelService } from "../../service";
import type { AiModelAliasRow, AiModelRow } from "../../types";

const ALIAS_KINDS = ["alias", "deprecated", "latest"] as const;
type AliasKind = (typeof ALIAS_KINDS)[number];
type AliasTargetModel = Pick<
  AiModelRow,
  "id" | "name" | "common_name" | "is_deprecated"
>;

type AliasFormData = {
  alias: string;
  kind: AliasKind;
  model_id: string;
  notes: string;
};

const EMPTY_FORM: AliasFormData = {
  alias: "",
  kind: "alias",
  model_id: "",
  notes: "",
};

const kindBadgeClass: Record<AliasKind, string> = {
  alias: "bg-blue-50 text-blue-600 dark:bg-blue-900/20",
  deprecated: "bg-red-50 text-red-600 dark:bg-red-900/20",
  latest: "bg-green-50 text-green-600 dark:bg-green-900/20",
};

function AliasDeleteAction({
  item,
  onDelete,
}: {
  item: AiModelAliasRow;
  onDelete: (item: AiModelAliasRow) => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-11 w-11 text-destructive hover:bg-destructive/10 hover:text-destructive sm:h-7 sm:w-7"
      onClick={(event) => {
        event.stopPropagation();
        onDelete(item);
      }}
      aria-label={`Delete alias ${item.alias}`}
      title="Delete alias"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}

export default function AliasesContainer() {
  const [aliases, setAliases] = useState<AiModelAliasRow[]>([]);
  const [models, setModels] = useState<AliasTargetModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<AliasFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AiModelAliasRow | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [aliasRows, modelRows] = await Promise.all([
        aiModelService.fetchAliases(),
        aiModelService.fetchAllAliasTargetModels(),
      ]);
      setAliases(aliasRows);
      setModels(modelRows);
      setLoadError(null);
    } catch (err) {
      setLoadError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const modelName = (id: string): string | null => {
    const model = models.find((item) => item.id === id);
    return model ? model.common_name || model.name : null;
  };

  const modelLabel = (id: string): string =>
    modelName(id) ?? `Unknown AI model (${id})`;

  const startNew = () => {
    setEditingId("new");
    setForm(EMPTY_FORM);
    setSaveError(null);
  };

  const startEdit = (row: AiModelAliasRow) => {
    setEditingId(row.id);
    setForm({
      alias: row.alias,
      kind: (ALIAS_KINDS as readonly string[]).includes(row.kind)
        ? (row.kind as AliasKind)
        : "alias",
      model_id: row.model_id,
      notes: row.notes === null ? "" : row.notes,
    });
    setSaveError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!form.alias.trim() || !form.model_id) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        alias: form.alias.trim(),
        kind: form.kind,
        model_id: form.model_id,
        notes: form.notes.trim() || null,
      };
      if (editingId === "new") {
        const organization_id = await resolveSystemOrgId();
        const saved = await aiModelService.createAlias({
          ...payload,
          organization_id,
        });
        setAliases((current) =>
          [...current, saved].sort((left, right) =>
            left.alias.localeCompare(right.alias),
          ),
        );
      } else if (editingId) {
        const saved = await aiModelService.updateAlias(editingId, payload);
        setAliases((current) =>
          current.map((item) => (item.id === saved.id ? saved : item)),
        );
      }
      cancelEdit();
    } catch (err) {
      setSaveError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: AiModelAliasRow) => {
    try {
      await aiModelService.deleteAlias(row.id);
      setAliases((current) => current.filter((item) => item.id !== row.id));
      if (editingId === row.id) cancelEdit();
    } catch (err) {
      setSaveError(extractErrorMessage(err));
    } finally {
      setPendingDelete(null);
    }
  };

  const columns: MatrxColumnDef<AiModelAliasRow>[] = [
    {
      accessorKey: "alias",
      header: "Alias",
      sortable: true,
      cell: (item) => (
        <span className="block max-w-[220px] truncate font-mono font-medium">
          {item.alias}
        </span>
      ),
    },
    {
      accessorKey: "kind",
      header: "Kind",
      sortable: true,
      cell: (item) => {
        const kind = ALIAS_KINDS.includes(item.kind as AliasKind)
          ? (item.kind as AliasKind)
          : "alias";
        return (
          <Badge
            variant="outline"
            className={`text-[10px] ${kindBadgeClass[kind]}`}
          >
            {item.kind}
          </Badge>
        );
      },
    },
    {
      id: "model",
      header: "Target model",
      sortable: false,
      filter: false,
      cell: (item) => (
        <span
          className="block max-w-[260px]"
          onClick={(event) => event.stopPropagation()}
        >
          <AiModelRef
            modelId={item.model_id}
            name={modelName(item.model_id)}
            showId
            showIcon={false}
          />
        </span>
      ),
    },
    {
      accessorKey: "notes",
      header: "Notes",
      sortable: true,
      cell: (item) => (
        <span
          className="block max-w-[320px] truncate text-muted-foreground"
          title={item.notes === null ? "" : item.notes}
        >
          {item.notes || "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3">
      {loadError ? (
        <div
          role="alert"
          className="flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 break-words">{loadError}</span>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      ) : null}

      {!editingId && saveError ? (
        <div
          role="alert"
          className="flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="break-words">{saveError}</span>
        </div>
      ) : null}

      {editingId ? (
        <div className="shrink-0 space-y-3 rounded-md border bg-card p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Alias <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.alias}
                onChange={(event) =>
                  setForm({ ...form, alias: event.target.value })
                }
                placeholder="e.g. claude-3-5-sonnet-latest"
                className="h-8 font-mono text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Kind
              </Label>
              <Select
                value={form.kind}
                onValueChange={(value) =>
                  setForm({ ...form, kind: value as AliasKind })
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALIAS_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind} className="text-xs">
                      {kind}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Target Model <span className="text-destructive">*</span>
              </Label>
              <ModelListDropdown
                value={form.model_id}
                onValueChange={(modelId) =>
                  setForm({ ...form, model_id: modelId })
                }
                inputModalities={[]}
                allowedModelIds={models
                  .filter((model) => !model.is_deprecated)
                  .map((model) => model.id)}
                catalogVariant="admin"
                placeholder="Choose model…"
                className="h-8 w-full justify-between text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Notes
              </Label>
              <Input
                value={form.notes}
                onChange={(event) =>
                  setForm({ ...form, notes: event.target.value })
                }
                placeholder="Optional"
                className="h-8 text-sm"
              />
            </div>
          </div>
          {saveError ? (
            <p className="break-words text-xs text-red-600 dark:text-red-400">
              {saveError}
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={cancelEdit}
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 gap-1 px-3 text-xs"
              onClick={() => void handleSave()}
              disabled={saving || !form.alias.trim() || !form.model_id}
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving…" : editingId === "new" ? "Create" : "Save"}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <MatrxDataTable<AiModelAliasRow>
          data={aliases}
          isLoading={loading}
          columns={columns}
          getRowId={(item) => item.id}
          pageSize={25}
          pageSizeOptions={[10, 25, 50, 100]}
          defaultSort={{ id: "alias", direction: "asc" }}
          searchText={(item) =>
            [
              item.alias,
              item.kind,
              item.notes === null ? "" : item.notes,
              modelLabel(item.model_id),
            ].join(" ")
          }
          onRowOpen={startEdit}
          detail={{ enabled: false }}
          rowClassName={(item) =>
            item.id === editingId
              ? "bg-primary/10 hover:bg-primary/15"
              : undefined
          }
          emptyState={
            loadError
              ? {
                  title: "Could not load aliases",
                  description: loadError,
                  icon: <AlertTriangle className="h-8 w-8" />,
                  action: (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void load()}
                    >
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                      Retry
                    </Button>
                  ),
                }
              : {
                  title: "No aliases yet",
                  icon: <AlertTriangle className="h-8 w-8" />,
                }
          }
          toolbar={{
            searchPlaceholder: "Search aliases…",
            leading: (
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">Model Aliases</h2>
                <Badge variant="outline" className="text-xs">
                  {aliases.length}
                </Badge>
              </div>
            ),
            actions: (
              <Button
                size="sm"
                className="h-8 gap-1.5 px-2 text-xs"
                onClick={startNew}
              >
                <Plus className="h-3.5 w-3.5" />
                New Alias
              </Button>
            ),
          }}
          rowActions={(item) => (
            <AliasDeleteAction item={item} onDelete={setPendingDelete} />
          )}
          mobileCards={(item, _index, controls) => (
            <article
              className={
                item.id === editingId
                  ? "space-y-2 rounded-md bg-primary/10 p-1"
                  : "space-y-2 p-1"
              }
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <button
                    type="button"
                    className="block max-w-full truncate text-left font-mono font-medium hover:underline"
                    onClick={() => startEdit(item)}
                  >
                    {item.alias}
                  </button>
                  <Badge
                    variant="outline"
                    className={`mt-1 text-[10px] ${
                      kindBadgeClass[
                        ALIAS_KINDS.includes(item.kind as AliasKind)
                          ? (item.kind as AliasKind)
                          : "alias"
                      ]
                    }`}
                  >
                    {item.kind}
                  </Badge>
                </div>
                <div className="shrink-0">{controls.actions}</div>
              </div>
              <div onClick={(event) => event.stopPropagation()}>
                <AiModelRef
                  modelId={item.model_id}
                  name={modelName(item.model_id)}
                  showId
                  showIcon={false}
                />
              </div>
              {item.notes ? (
                <p className="break-words text-xs text-muted-foreground">
                  {item.notes}
                </p>
              ) : null}
            </article>
          )}
        />
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete alias?"
        description={
          pendingDelete
            ? `Requests using "${pendingDelete.alias}" will stop resolving to ${modelLabel(
                pendingDelete.model_id,
              )}.`
            : ""
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={async () => {
          if (pendingDelete) await handleDelete(pendingDelete);
        }}
      />
    </div>
  );
}
