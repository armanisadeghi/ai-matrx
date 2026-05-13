"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Edit2,
  Loader2,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "sonner";
import {
  deleteSurface,
  listAgentBindings,
  listSurfaceValues,
  listToolBindings,
  tierFor,
  updateSurface,
  type SurfaceWithStats,
} from "@/features/tool-registry/surfaces/services/surfaces.service";
import { getManifest } from "@/features/tool-registry/surfaces/manifests/registry";
import type { SurfaceValue } from "@/features/tool-registry/surfaces/types";
import { ToolArgMappingsEditorDialog } from "@/features/tool-registry/surfaces/components/ToolArgMappingsEditorDialog";

interface Props {
  surface: SurfaceWithStats;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: (name: string) => void;
}

type ValueSyncStatus = "in_sync" | "manifest_only" | "db_only" | "diff";

interface MergedSurfaceValue {
  name: string;
  manifest: SurfaceValue | null;
  db: SurfaceValue | null;
  status: ValueSyncStatus;
}

function mergeValuesForUi(
  manifestValues: readonly SurfaceValue[] | null,
  dbValues: SurfaceValue[],
): MergedSurfaceValue[] {
  const manifestMap = new Map<string, SurfaceValue>();
  for (const v of manifestValues ?? []) manifestMap.set(v.name, v);
  const dbMap = new Map<string, SurfaceValue>();
  for (const v of dbValues) dbMap.set(v.name, v);

  const allNames = new Set<string>([...manifestMap.keys(), ...dbMap.keys()]);
  const out: MergedSurfaceValue[] = [];
  for (const name of allNames) {
    const m = manifestMap.get(name) ?? null;
    const d = dbMap.get(name) ?? null;
    let status: ValueSyncStatus;
    if (m && d) {
      const fieldsMatch =
        m.label === d.label &&
        m.description === d.description &&
        m.valueType === d.valueType &&
        m.alwaysAvailable === d.alwaysAvailable &&
        m.typicalCharCount === d.typicalCharCount &&
        (m.sortOrder ?? 1000) === (d.sortOrder ?? 1000);
      status = fieldsMatch ? "in_sync" : "diff";
    } else if (m && !d) {
      status = "manifest_only";
    } else {
      status = "db_only";
    }
    out.push({ name, manifest: m, db: d, status });
  }
  out.sort((a, b) => {
    const oa = a.manifest?.sortOrder ?? a.db?.sortOrder ?? 1000;
    const ob = b.manifest?.sortOrder ?? b.db?.sortOrder ?? 1000;
    return oa - ob || a.name.localeCompare(b.name);
  });
  return out;
}

function StatusBadge({ status }: { status: ValueSyncStatus }) {
  switch (status) {
    case "in_sync":
      return (
        <Badge
          variant="outline"
          className="text-[10px] bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
        >
          <CheckCircle2 className="h-3 w-3 mr-1" />
          in sync
        </Badge>
      );
    case "manifest_only":
      return (
        <Badge
          variant="outline"
          className="text-[10px] bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
        >
          manifest only
        </Badge>
      );
    case "db_only":
      return (
        <Badge
          variant="outline"
          className="text-[10px] bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
        >
          stale (db only)
        </Badge>
      );
    case "diff":
      return (
        <Badge
          variant="outline"
          className="text-[10px] bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800"
        >
          diff
        </Badge>
      );
  }
}

export function SurfaceDetailPanel({
  surface,
  onClose,
  onChanged,
  onDeleted,
}: Props) {
  const [tab, setTab] = useState<"overview" | "values" | "agents" | "tools">(
    "overview",
  );
  const [busy, setBusy] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [desc, setDesc] = useState(surface.description ?? "");

  const [dbValues, setDbValues] = useState<SurfaceValue[] | null>(null);
  const [agentBindings, setAgentBindings] = useState<
    Awaited<ReturnType<typeof listAgentBindings>>
  >([]);
  const [toolBindings, setToolBindings] = useState<
    Awaited<ReturnType<typeof listToolBindings>>
  >([]);
  const [loadingTab, setLoadingTab] = useState(false);
  const [tabError, setTabError] = useState<string | null>(null);
  const [editingToolBinding, setEditingToolBinding] = useState<string | null>(
    null,
  );

  const manifest = getManifest(surface.name);
  const manifestValues = manifest?.values ?? null;

  // Reset local state on surface change
  useEffect(() => {
    setTab("overview");
    setEditingDesc(false);
    setDesc(surface.description ?? "");
    setDbValues(null);
    setAgentBindings([]);
    setToolBindings([]);
    setTabError(null);
  }, [surface.name, surface.description]);

  // Lazy-load tab data
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingTab(true);
      setTabError(null);
      try {
        if (tab === "values" && dbValues === null) {
          const v = await listSurfaceValues(surface.name);
          if (!cancelled) setDbValues(v);
        } else if (tab === "agents" && agentBindings.length === 0) {
          const a = await listAgentBindings(surface.name);
          if (!cancelled) setAgentBindings(a);
        } else if (tab === "tools" && toolBindings.length === 0) {
          const t = await listToolBindings(surface.name);
          if (!cancelled) setToolBindings(t);
        }
      } catch (e) {
        if (!cancelled) {
          setTabError(e instanceof Error ? e.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoadingTab(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [tab, surface.name, dbValues, agentBindings.length, toolBindings.length]);

  const mergedValues = useMemo(
    () => mergeValuesForUi(manifestValues, dbValues ?? []),
    [manifestValues, dbValues],
  );

  const onToggleActive = async (next: boolean) => {
    setBusy(true);
    try {
      await updateSurface(surface.name, { is_active: next });
      onChanged();
      toast.success(`${surface.name} ${next ? "activated" : "deactivated"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const onSaveDesc = async () => {
    setBusy(true);
    try {
      await updateSurface(surface.name, { description: desc || null });
      setEditingDesc(false);
      onChanged();
      toast.success("Description updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    const referenced = surface.toolCount > 0 || surface.agentCount > 0;
    const ok = await confirm({
      title: `Delete ${surface.name}?`,
      description: referenced
        ? `This surface has ${surface.toolCount} tool reference${surface.toolCount === 1 ? "" : "s"} and ${surface.agentCount} agent reference${surface.agentCount === 1 ? "" : "s"}. Deletion will cascade-remove those rows. Use Deactivate unless you've already cleaned up references.`
        : "No tools or agents point at this surface — safe to delete.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteSurface(surface.name);
      toast.success(`${surface.name} deleted`);
      onDeleted(surface.name);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const tier = tierFor(surface.sort_order);

  return (
    <div className="flex flex-col h-full min-h-0 bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm truncate">{surface.name}</span>
            <Badge variant="outline" className="text-[10px]">
              {surface.client_name}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {tier.label}
            </Badge>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-7 w-7 p-0 shrink-0"
          aria-label="Close detail panel"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as typeof tab)}
        className="flex-1 flex flex-col min-h-0"
      >
        <TabsList className="h-9 mx-3 mt-2 shrink-0 w-fit">
          <TabsTrigger value="overview" className="text-xs">
            Overview
          </TabsTrigger>
          <TabsTrigger value="values" className="text-xs">
            Surface Values
            {manifestValues && (
              <Badge variant="outline" className="ml-1.5 text-[10px]">
                {manifestValues.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="agents" className="text-xs">
            Agents
            <Badge variant="outline" className="ml-1.5 text-[10px]">
              {surface.agentCount}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="tools" className="text-xs">
            Tools
            <Badge variant="outline" className="ml-1.5 text-[10px]">
              {surface.toolCount}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent
          value="overview"
          className="flex-1 min-h-0 overflow-auto px-3 py-2 space-y-3"
        >
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Description
            </Label>
            {!editingDesc ? (
              <div className="flex items-start gap-1.5">
                <p className="text-xs text-foreground flex-1">
                  {surface.description || (
                    <em className="text-muted-foreground">no description</em>
                  )}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDesc(surface.description ?? "");
                    setEditingDesc(true);
                  }}
                  className="h-6 w-6 p-0 shrink-0"
                  aria-label="Edit description"
                >
                  <Edit2 className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div className="flex items-start gap-1.5">
                <Textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={3}
                  autoFocus
                  disabled={busy}
                  style={{ fontSize: "13px" }}
                />
                <div className="flex flex-col gap-1">
                  <Button
                    size="sm"
                    onClick={() => void onSaveDesc()}
                    disabled={busy}
                    className="h-6 w-6 p-0"
                  >
                    {busy ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="h-3 w-3" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingDesc(false)}
                    disabled={busy}
                    className="h-6 w-6 p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Tier
              </Label>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  {tier.label}
                </Badge>
                <span className="text-[11px] text-muted-foreground">
                  {tier.description}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Sort order
              </Label>
              <p className="text-xs font-mono tabular-nums">
                {surface.sort_order}
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Active
            </Label>
            <div className="flex items-center gap-2">
              <Switch
                checked={surface.is_active ?? true}
                onCheckedChange={(v) => void onToggleActive(v)}
                disabled={busy}
              />
              <span className="text-xs text-muted-foreground">
                {surface.is_active ? "Visible to users" : "Hidden"}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Manifest
            </Label>
            {manifest ? (
              <div className="flex items-center gap-2 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                <span>
                  Registered with {manifest.values.length} SurfaceValue
                  {manifest.values.length === 1 ? "" : "s"}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs">
                <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                <span>No code manifest registered.</span>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void onDelete()}
              disabled={busy}
              className="text-xs gap-1.5 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete surface
            </Button>
          </div>
        </TabsContent>

        {/* Surface Values */}
        <TabsContent
          value="values"
          className="flex-1 min-h-0 overflow-auto px-3 py-2"
        >
          {!manifest && (
            <div className="rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
              No manifest registered in code. Add one at
              <code className="ml-1 font-mono">
                features/tool-registry/surfaces/manifests/
              </code>
              {dbValues && dbValues.length > 0 && (
                <span>
                  {" "}
                  {dbValues.length} stale DB row
                  {dbValues.length === 1 ? "" : "s"} present — clean up via Sync
                  Manifests with{" "}
                  <code className="font-mono">deleteStale: true</code>.
                </span>
              )}
            </div>
          )}
          {loadingTab && (
            <div className="text-xs text-muted-foreground">Loading…</div>
          )}
          {tabError && (
            <div className="text-xs text-destructive flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" />
              {tabError}
            </div>
          )}
          {!loadingTab && !tabError && mergedValues.length > 0 && (
            <div className="rounded-md border border-border divide-y divide-border">
              {mergedValues.map((v) => {
                const display = v.manifest ?? v.db;
                if (!display) return null;
                return (
                  <div key={v.name} className="px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-xs text-foreground truncate">
                          {v.name}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] font-mono"
                        >
                          {display.valueType}
                        </Badge>
                        {display.alwaysAvailable && (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300"
                          >
                            always
                          </Badge>
                        )}
                      </div>
                      <StatusBadge status={v.status} />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {display.label}
                      {display.label && display.description && " — "}
                      {display.description}
                    </p>
                    <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                      ~{display.typicalCharCount} chars · sort{" "}
                      {display.sortOrder ?? 1000}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {!loadingTab &&
            !tabError &&
            mergedValues.length === 0 &&
            manifest && (
              <div className="text-xs text-muted-foreground">
                Manifest declares no values yet.
              </div>
            )}
        </TabsContent>

        {/* Agents */}
        <TabsContent
          value="agents"
          className="flex-1 min-h-0 overflow-auto px-3 py-2"
        >
          {loadingTab && (
            <div className="text-xs text-muted-foreground">Loading…</div>
          )}
          {tabError && (
            <div className="text-xs text-destructive">{tabError}</div>
          )}
          {!loadingTab && !tabError && agentBindings.length === 0 && (
            <div className="text-xs text-muted-foreground">
              No agents bound to this surface.
            </div>
          )}
          {!loadingTab && agentBindings.length > 0 && (
            <div className="rounded-md border border-border divide-y divide-border text-xs">
              {agentBindings.map((b) => {
                const mappingCount =
                  b.value_mappings &&
                  typeof b.value_mappings === "object" &&
                  !Array.isArray(b.value_mappings)
                    ? Object.keys(b.value_mappings as Record<string, unknown>)
                        .length
                    : 0;
                const scopeLabel = b.user_id
                  ? "Personal"
                  : b.organization_id
                    ? "Organization"
                    : b.project_id
                      ? "Project"
                      : b.task_id
                        ? "Task"
                        : "Global";
                return (
                  <div
                    key={b.id}
                    className="px-2 py-1.5 flex items-center gap-2"
                  >
                    <span className="font-mono text-[11px] truncate flex-1">
                      {b.agent_id}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {scopeLabel}
                    </Badge>
                    <Badge
                      variant={mappingCount > 0 ? "default" : "outline"}
                      className="text-[10px] tabular-nums"
                    >
                      {mappingCount} mapping{mappingCount === 1 ? "" : "s"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Tools */}
        <TabsContent
          value="tools"
          className="flex-1 min-h-0 overflow-auto px-3 py-2"
        >
          {loadingTab && (
            <div className="text-xs text-muted-foreground">Loading…</div>
          )}
          {tabError && (
            <div className="text-xs text-destructive">{tabError}</div>
          )}
          {!loadingTab && !tabError && toolBindings.length === 0 && (
            <div className="text-xs text-muted-foreground">
              No tools bound to this surface.
            </div>
          )}
          {!loadingTab && toolBindings.length > 0 && (
            <div className="rounded-md border border-border divide-y divide-border text-xs">
              {toolBindings.map((b) => {
                const mappingCount =
                  b.arg_mappings &&
                  typeof b.arg_mappings === "object" &&
                  !Array.isArray(b.arg_mappings)
                    ? Object.keys(b.arg_mappings as Record<string, unknown>)
                        .length
                    : 0;
                return (
                  <div
                    key={b.tool_id}
                    className="px-2 py-1.5 flex items-center gap-2"
                  >
                    <span className="font-mono text-[11px] truncate flex-1">
                      {b.tool_id}
                    </span>
                    <Badge
                      variant={mappingCount > 0 ? "default" : "outline"}
                      className="text-[10px] tabular-nums"
                    >
                      {mappingCount} mapping{mappingCount === 1 ? "" : "s"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingToolBinding(b.tool_id)}
                      className="h-6 text-[11px] gap-1"
                    >
                      <Edit2 className="h-3 w-3" />
                      Edit args
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {editingToolBinding && (
        <ToolArgMappingsEditorDialog
          toolId={editingToolBinding}
          surfaceName={surface.name}
          onClose={() => setEditingToolBinding(null)}
          onSaved={() => {
            setEditingToolBinding(null);
            // Refresh the tools tab by clearing the cached bindings
            setToolBindings([]);
          }}
        />
      )}
    </div>
  );
}
