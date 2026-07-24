"use client";

/**
 * AliasesContainer — admin CRUD for ai.model_alias.
 *
 * An alias maps an alternate model name (old name, "-latest" pointer,
 * deprecated id) to a live ai.model_definition row so inbound requests using
 * the alternate name still resolve. Kinds (DB check constraint):
 *   alias | deprecated | latest
 *
 * Compact single-surface editor: table of live aliases + an inline editor
 * card (same visual language as the other /administration/ai/ai-models pages).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Save, Trash2, X, AlertTriangle } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { extractErrorMessage } from "@/utils/errors";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import { aiModelService } from "../../service";
import type { AiModel, AiModelAliasRow } from "../../types";

const ALIAS_KINDS = ["alias", "deprecated", "latest"] as const;
type AliasKind = (typeof ALIAS_KINDS)[number];

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

export default function AliasesContainer() {
  const [aliases, setAliases] = useState<AiModelAliasRow[]>([]);
  const [models, setModels] = useState<AiModel[]>([]);
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
    try {
      const [aliasRows, modelRows] = await Promise.all([
        aiModelService.fetchAliases(),
        aiModelService.fetchAll(),
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
    // Deferred so the effect body stays setState-free (loading starts true;
    // load() only writes state after its awaits resolve).
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const modelLabel = useCallback(
    (id: string | null): string => {
      if (!id) return "—";
      const m = models.find((x) => x.id === id);
      return m ? m.common_name || m.name || id : id;
    },
    [models],
  );

  const modelGroups = useMemo(() => {
    const groups: Record<string, AiModel[]> = {};
    for (const m of models) {
      if (m.is_deprecated) continue;
      const key = m.maker || "Other";
      (groups[key] ??= []).push(m);
    }
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) =>
        (a.common_name || a.name || "").localeCompare(
          b.common_name || b.name || "",
        ),
      );
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [models]);

  const startNew = () => {
    setEditingId("new");
    setForm(EMPTY_FORM);
    setSaveError(null);
  };

  const startEdit = (row: AiModelAliasRow) => {
    setEditingId(row.id);
    setForm({
      alias: row.alias ?? "",
      kind: (ALIAS_KINDS as readonly string[]).includes(row.kind ?? "")
        ? (row.kind as AliasKind)
        : "alias",
      model_id: row.model_id ?? "",
      notes: row.notes ?? "",
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
        setAliases((prev) =>
          [...prev, saved].sort((a, b) => a.alias.localeCompare(b.alias)),
        );
      } else if (editingId) {
        const saved = await aiModelService.updateAlias(editingId, payload);
        setAliases((prev) =>
          prev.map((a) => (a.id === saved.id ? saved : a)),
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
      setAliases((prev) => prev.filter((a) => a.id !== row.id));
      if (editingId === row.id) cancelEdit();
    } catch (err) {
      setSaveError(extractErrorMessage(err));
    } finally {
      setPendingDelete(null);
    }
  };

  const kindBadgeClass: Record<AliasKind, string> = {
    alias: "bg-blue-50 dark:bg-blue-900/20 text-blue-600",
    deprecated: "bg-red-50 dark:bg-red-900/20 text-red-600",
    latest: "bg-green-50 dark:bg-green-900/20 text-green-600",
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-3 gap-3">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-sm font-semibold">Model Aliases</h1>
          <p className="text-xs text-muted-foreground">
            Alternate names (old ids, latest pointers) resolving to live model
            rows — ai.model_alias.
          </p>
        </div>
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={startNew}>
          <Plus className="h-3.5 w-3.5" />
          New Alias
        </Button>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {loadError}
        </div>
      )}

      {editingId && (
        <div className="rounded-md border bg-card p-3 space-y-3 shrink-0">
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Alias <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.alias}
                onChange={(e) => setForm({ ...form, alias: e.target.value })}
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
                onValueChange={(v) => setForm({ ...form, kind: v as AliasKind })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALIAS_KINDS.map((k) => (
                    <SelectItem key={k} value={k} className="text-xs">
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Target Model <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.model_id || undefined}
                onValueChange={(v) => setForm({ ...form, model_id: v })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Choose model…">
                    {form.model_id ? modelLabel(form.model_id) : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {modelGroups.map(([maker, group]) => (
                    <div key={maker}>
                      <div className="mt-1 border-t px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 first:mt-0 first:border-t-0">
                        {maker}
                      </div>
                      {group.map((m) => (
                        <SelectItem key={m.id} value={m.id} className="text-xs">
                          {m.common_name || m.name}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Notes
              </Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional"
                className="h-8 text-sm"
              />
            </div>
          </div>
          {saveError && (
            <p className="text-xs text-red-600 dark:text-red-400 break-words">
              {saveError}
            </p>
          )}
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
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-muted/60 backdrop-blur">
            <tr className="border-b">
              <th className="px-3 py-2 font-medium">Alias</th>
              <th className="px-3 py-2 font-medium">Kind</th>
              <th className="px-3 py-2 font-medium">Target model</th>
              <th className="px-3 py-2 font-medium">Notes</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  Loading aliases…
                </td>
              </tr>
            ) : aliases.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  No aliases yet.
                </td>
              </tr>
            ) : (
              aliases.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b last:border-b-0 hover:bg-muted/40"
                  onClick={() => startEdit(row)}
                >
                  <td className="px-3 py-1.5 font-mono">{row.alias}</td>
                  <td className="px-3 py-1.5">
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${kindBadgeClass[(row.kind as AliasKind) in kindBadgeClass ? (row.kind as AliasKind) : "alias"]}`}
                    >
                      {row.kind}
                    </Badge>
                  </td>
                  <td className="px-3 py-1.5">{modelLabel(row.model_id)}</td>
                  <td className="max-w-64 truncate px-3 py-1.5 text-muted-foreground">
                    {row.notes ?? ""}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDelete(row);
                      }}
                      aria-label={`Delete alias ${row.alias}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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
