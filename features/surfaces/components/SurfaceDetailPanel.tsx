"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Edit2,
  ExternalLink,
  Loader2,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { surfaceDeleteConsequence } from "@/features/surfaces/utils/surface-delete-consequence";
import { getRegisteredSurfaceNames } from "@/features/surfaces/manifests/registry";
import { toast, recordToast, dismissRecordToasts } from "@/lib/toast";
import {
  deleteSurface,
  listAgentBindings,
  listSurfaceValues,
  listToolBindings,
  tierFor,
  updateSurface,
  readinessBucketOf,
  type SurfaceWithStats,
} from "@/features/surfaces/services/surfaces.service";
import {
  SurfaceReadinessBadge,
  READINESS_META,
} from "@/features/surfaces/components/SurfaceReadinessBadge";
import { getSurfaceDisplayLabel } from "@/features/surfaces/utils/surface-display";
import { SurfaceValuesTable } from "@/features/surfaces/components/SurfaceValuesTable";
import { getManifest } from "@/features/surfaces/manifests/registry";
import type { SurfaceValue } from "@/features/surfaces/types";
import { AiToolRef } from "@/components/official/entity-ref/AiIdentityRef";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { ProTextarea } from "@/components/official/ProTextarea";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
interface Props {
  surface: SurfaceWithStats;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: (name: string) => void;
  /** Opens Sync manifests set to remove left-over values. */
  onCleanUp?: () => void;
}

export function SurfaceDetailPanel({
  surface,
  onClose,
  onChanged,
  onDeleted,
  onCleanUp,
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

  const onToggleActive = async (next: boolean) => {
    setBusy(true);
    try {
      await updateSurface(surface.name, { is_active: next });
      onChanged();
      recordToast.success(
        { type: "ui_surface", id: surface.name, title: surface.name },
        `${surface.name} ${next ? "activated" : "deactivated"}`,
      );
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
    const ok = await confirm({
      title: `Delete ${surface.name}?`,
      description: surfaceDeleteConsequence(
        surface,
        getRegisteredSurfaceNames().includes(surface.name),
      ),
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteSurface(surface.name);
      dismissRecordToasts({ type: "ui_surface", id: surface.name });
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
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium">
              {surface.label?.trim() || getSurfaceDisplayLabel(surface.name)}
            </span>
            <SurfaceReadinessBadge row={surface} className="shrink-0" />
          </div>
          <div className="truncate font-mono text-xs text-muted-foreground">
            {surface.name}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {surface.client_name}
            {surface.executor_name &&
              surface.executor_name !== surface.client_name && (
                <> · runs in {surface.executor_name}</>
              )}
            {" "}· {tier.label}
            {surface.parent_surface_name && (
              <>
                {" "}· under{" "}
                <span title={surface.parent_surface_name}>
                  {getSurfaceDisplayLabel(surface.parent_surface_name)}
                </span>
              </>
            )}
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
            Values
            {manifestValues && (
              <Badge variant="outline" className="ml-1.5 text-xs">
                {manifestValues.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="agents" className="text-xs">
            Agents
            <Badge variant="outline" className="ml-1.5 text-xs">
              {surface.agentCount}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="tools" className="text-xs">
            Tools
            <Badge variant="outline" className="ml-1.5 text-xs">
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
                <ProTextarea
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

          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Tier
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="whitespace-nowrap text-xs">
                {tier.label}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {tier.description} · position {surface.sort_order}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Readiness
            </Label>
            <div className="flex items-center gap-2 flex-wrap">
              <SurfaceReadinessBadge row={surface} />
              <span className="text-xs text-muted-foreground">
                {READINESS_META[readinessBucketOf(surface)].description}
              </span>
            </div>
            {surface.readiness_note && (
              <p className="text-xs text-foreground/80">
                {surface.readiness_note}
              </p>
            )}
            {surface.overlay_id && (
              <p className="text-xs text-muted-foreground">
                Window or dialog:{" "}
                <code className="bg-muted px-1 py-0.5 rounded font-mono">
                  {surface.overlay_id}
                </code>
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Readiness is set in code — change the manifest&apos;s{" "}
              <code className="bg-muted px-1 py-0.5 rounded font-mono">
                readiness
              </code>{" "}
              field and re-sync.
            </p>
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
          <SurfaceValuesTable
            onCleanUp={onCleanUp}
            manifest={manifest}
            dbValues={dbValues}
            loading={loadingTab}
            error={tabError}
          />
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
            <div className="text-xs text-destructive">{tabError} <ErrorAlchemyMenu error={tabError} /></div>
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
                    className="px-2 py-1.5 space-y-1"
                  >
                    {b.agent_id ? (
                      <EntityRef
                        token="agent"
                        id={b.agent_id}
                        name={b.agent_name}
                        fill
                        alwaysShowActions
                        className="w-full"
                        nameClassName="text-sm"
                      />
                    ) : (
                      <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                        {/* read-gate-exempt: per-row label for a loaded binding whose agent_id is null, not a list's empty view */}
                        No agent assigned
                      </span>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {scopeLabel} · {mappingCount} value mapping
                      {mappingCount === 1 ? "" : "s"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Tools force-included on this surface */}
        <TabsContent
          value="tools"
          className="flex-1 min-h-0 overflow-auto px-3 py-2"
        >
          <div className="text-xs text-muted-foreground mb-2 leading-relaxed">
            Tools force-included on this surface via{" "}
            <code className="font-mono bg-muted px-1 py-0.5 rounded">
              tool.surface_defaults.always_include_tools
            </code>
            . Edit the underlying surface defaults to change inclusions.
          </div>
          {loadingTab && (
            <div className="text-xs text-muted-foreground">Loading…</div>
          )}
          {tabError && (
            <div className="text-xs text-destructive">{tabError} <ErrorAlchemyMenu error={tabError} /></div>
          )}
          {!loadingTab && !tabError && toolBindings.length === 0 && (
            <div className="text-xs text-muted-foreground">
              No tools force-included on this surface.
            </div>
          )}
          {!loadingTab && toolBindings.length > 0 && (
            <div className="rounded-md border border-border divide-y divide-border text-xs">
              {toolBindings.map((b) => {
                const argDefaultsPresent =
                  b.arg_defaults &&
                  typeof b.arg_defaults === "object" &&
                  !Array.isArray(b.arg_defaults) &&
                  Object.keys(b.arg_defaults as Record<string, unknown>)
                    .length > 0;
                return (
                  <div
                    key={b.tool_id}
                    className="px-2 py-1.5 flex items-center gap-2"
                  >
                    <div className="flex-1 min-w-0 flex flex-col">
                      <AiToolRef
                        toolId={b.tool_id}
                        name={b.tool_name}
                        showId
                        showIcon={false}
                        className="text-[12px] text-foreground"
                      />
                      <span className="font-mono text-xs text-muted-foreground truncate">
                        {b.tool_category ?? "Uncategorized"}
                      </span>
                    </div>
                    {b.tool_is_active === false && (
                      <Badge
                        variant="outline"
                        className="text-xs text-muted-foreground"
                      >
                        inactive
                      </Badge>
                    )}
                    {argDefaultsPresent && (
                      <Badge variant="default" className="text-xs">
                        arg defaults
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
