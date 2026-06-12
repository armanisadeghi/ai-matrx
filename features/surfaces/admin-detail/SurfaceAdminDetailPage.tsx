"use client";

import React, { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronsUpDown,
  Edit2,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";

import {
  deleteSurface,
  getSurfaceByName,
  getSurfaceToolDefaults,
  getSurfaceUsage,
  listSurfaceOptions,
  listSurfaceValues,
  renameSurface,
  SURFACE_TIERS,
  tierFor,
  updateSurface,
  upsertSurfaceToolDefaults,
  type SurfaceOption,
  type SurfaceUsage,
  type ToolSurfaceDefaultsRow,
  type UiSurfaceRow,
} from "@/features/surfaces/services/surfaces.service";
import {
  fetchSurfaceConfigBundle,
  setRoleSelection,
  deleteRolePref,
  type SurfaceConfigBundle,
} from "@/features/surfaces/services/surface-config.service";
import { getManifest } from "@/features/surfaces/manifests/registry";
import { SurfaceValuesTable } from "@/features/surfaces/components/SurfaceValuesTable";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import {
  ToolSearchDialog,
  type ToolSearchOption,
} from "@/features/tool-registry/shared/ToolSearchDialog";
import {
  listAllExecutorNames,
  listAllToolOptions,
  type ToolCatalogOption,
} from "@/features/tool-registry/tools-admin/services/dimensions.service";
import { listBundles, type BundleRow } from "@/features/tool-registry/bundles/services/bundles.service";
import { EXECUTION_MODES } from "@/features/agents/runtime/pickRuntime";
import type { SurfaceValue } from "@/features/surfaces/types";

const NONE = "__none__";

interface Props {
  /** Server-fetched `ui_surface` row; the page reloads it after mutations. */
  initialSurface: UiSurfaceRow;
}

/**
 * Full-screen per-surface admin editor at /administration/surfaces/<name>.
 * Every DB-owned `ui_surface` + `tool_surface_defaults` field is editable;
 * value definitions stay code-first (view + drift chips only).
 */
export function SurfaceAdminDetailPage({ initialSurface }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);

  const [surface, setSurface] = useState<UiSurfaceRow>(initialSurface);
  const [busy, setBusy] = useState(false);

  // Section data
  const [usage, setUsage] = useState<SurfaceUsage | null>(null);
  const [defaults, setDefaults] = useState<ToolSurfaceDefaultsRow | null>(null);
  const [configBundle, setConfigBundle] = useState<SurfaceConfigBundle | null>(
    null,
  );
  const [dbValues, setDbValues] = useState<SurfaceValue[] | null>(null);
  const [surfaceOptions, setSurfaceOptions] = useState<SurfaceOption[]>([]);
  const [executorNames, setExecutorNames] = useState<string[]>([]);
  const [bundles, setBundles] = useState<BundleRow[]>([]);
  const [agentNames, setAgentNames] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  // Rename
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");

  const manifest = getManifest(surface.name);
  const tier = tierFor(surface.sort_order);

  const navigateTo = (path: string) => {
    startTransition(() => router.push(path));
  };

  const load = async (surfaceName: string) => {
    setLoadingData(true);
    setLoadError(null);
    try {
      const [row, u, d, cb, v, opts, execs, bnds] = await Promise.all([
        getSurfaceByName(surfaceName),
        getSurfaceUsage(surfaceName),
        getSurfaceToolDefaults(surfaceName),
        fetchSurfaceConfigBundle(surfaceName),
        listSurfaceValues(surfaceName),
        listSurfaceOptions(),
        listAllExecutorNames(),
        listBundles({ includeInactive: true }),
      ]);
      if (row) setSurface(row);
      setUsage(u);
      setDefaults(d);
      setConfigBundle(cb);
      setDbValues(v);
      setSurfaceOptions(opts);
      setExecutorNames(execs);
      setBundles(bnds);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load surface data");
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    void load(initialSurface.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSurface.name]);

  // Resolve agent display names referenced by roles (defaults + global prefs).
  useEffect(() => {
    if (!configBundle) return;
    const ids = new Set<string>();
    for (const r of configBundle.dbRoles) {
      if (r.defaultAgentId) ids.add(r.defaultAgentId);
    }
    for (const p of configBundle.prefs) ids.add(p.agentId);
    const missing = [...ids].filter((id) => !agentNames[id]);
    if (missing.length === 0) return;
    void (async () => {
      const { data, error } = await createClient()
        .from("agx_agent")
        .select("id, name")
        .in("id", missing);
      if (error || !data) return;
      setAgentNames((prev) => ({
        ...prev,
        ...Object.fromEntries(
          (data as { id: string; name: string | null }[]).map((r) => [
            r.id,
            r.name ?? "Unnamed agent",
          ]),
        ),
      }));
    })();
  }, [configBundle, agentNames]);

  // ── ui_surface field writes ────────────────────────────────────────────────

  const patchSurface = async (
    patch: Parameters<typeof updateSurface>[1],
    successMsg?: string,
  ) => {
    setBusy(true);
    try {
      await updateSurface(surface.name, patch);
      setSurface((prev) => ({ ...prev, ...patch }) as UiSurfaceRow);
      if (successMsg) toast.success(successMsg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const onRename = async () => {
    const target = newName.trim();
    if (!target || target === surface.name) {
      setRenaming(false);
      setNewName("");
      return;
    }
    if (!/^[a-z0-9-]+\/[a-z0-9-/]+$/.test(target)) {
      toast.error(
        "Invalid format. Use <client>/<local> with lowercase letters / digits / hyphens / slashes.",
      );
      return;
    }
    if (!target.startsWith(`${surface.client_name}/`)) {
      toast.error(
        `New name must keep the client prefix "${surface.client_name}/".`,
      );
      return;
    }
    const refsTotal =
      (usage?.tools.length ?? 0) +
      (usage?.agents.length ?? 0) +
      (usage?.uiComponents.length ?? 0);
    const ok = await confirm({
      title: `Rename to "${target}"?`,
      description:
        refsTotal > 0
          ? `${refsTotal} dependent row${refsTotal === 1 ? "" : "s"} will follow via ON UPDATE CASCADE (tools / agents / UI components). The change is atomic — a single UPDATE statement.`
          : "No dependent rows exist; this is a straight rename.",
      confirmLabel: "Rename",
      variant: "destructive",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await renameSurface(surface.name, target);
      toast.success(`Renamed to ${target}`);
      startTransition(() =>
        router.replace(
          `/administration/surfaces/${target.split("/").map(encodeURIComponent).join("/")}`,
        ),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rename failed");
      setBusy(false);
    }
  };

  const onDelete = async () => {
    const refsTotal =
      (usage?.tools.length ?? 0) +
      (usage?.agents.length ?? 0) +
      (usage?.uiComponents.length ?? 0);
    const ok = await confirm({
      title: `Delete ${surface.name}?`,
      description:
        refsTotal > 0
          ? `This surface has ${usage?.tools.length ?? 0} tool ref${usage?.tools.length === 1 ? "" : "s"}, ${usage?.agents.length ?? 0} agent ref${usage?.agents.length === 1 ? "" : "s"}, and ${usage?.uiComponents.length ?? 0} tool_ui row${usage?.uiComponents.length === 1 ? "" : "s"}. Delete will fail unless those are removed first (FKs do not cascade on delete). Deactivate instead?`
          : "No dependents — safe to delete.",
      confirmLabel: refsTotal > 0 ? "Try delete" : "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteSurface(surface.name);
      toast.success(`${surface.name} deleted`);
      startTransition(() => router.replace("/administration/surfaces"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
      setBusy(false);
    }
  };

  // ── tool_surface_defaults writes ───────────────────────────────────────────

  const patchDefaults = async (
    patch: Parameters<typeof upsertSurfaceToolDefaults>[1],
    successMsg?: string,
  ) => {
    setBusy(true);
    try {
      const row = await upsertSurfaceToolDefaults(surface.name, patch);
      setDefaults(row);
      if (successMsg) toast.success(successMsg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
      throw e;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden bg-background">
      {/* Sticky compact header */}
      <div className="shrink-0 px-4 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigateTo("/administration/surfaces")}
            disabled={isPending}
            className="gap-1.5 h-7 text-xs"
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowLeft className="h-3.5 w-3.5" />
            )}
            Surfaces
          </Button>
          <span className="text-xs text-muted-foreground">/</span>
          <code className="font-mono text-sm font-semibold">
            {surface.name}
          </code>
          <Badge variant="outline" className="text-[10px]">
            {surface.client_name}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {tier.label}
          </Badge>
          {manifest ? (
            <Badge variant="outline" className="text-[10px]">
              {manifest.values.length} manifest value
              {manifest.values.length === 1 ? "" : "s"}
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-[10px] text-muted-foreground"
            >
              no manifest
            </Badge>
          )}
          <div className="flex items-center gap-1.5 ml-1">
            <Switch
              checked={surface.is_active}
              onCheckedChange={(v) =>
                void patchSurface(
                  { is_active: v },
                  `${surface.name} ${v ? "activated" : "deactivated"}`,
                )
              }
              disabled={busy}
            />
            <span className="text-[11px] text-muted-foreground">
              {surface.is_active ? "active" : "inactive"}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {surface.url_pattern && (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs"
              >
                <Link
                  href={surface.url_pattern}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open live page
                </Link>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void load(surface.name)}
              disabled={loadingData}
              className="h-7 gap-1.5 text-xs"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loadingData ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            {!renaming && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setNewName(surface.name);
                  setRenaming(true);
                }}
                disabled={busy}
                className="h-7 gap-1.5 text-xs"
              >
                <Edit2 className="h-3.5 w-3.5" />
                Rename
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void onDelete()}
              disabled={busy}
              className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </div>
        {renaming && (
          <div className="flex items-center gap-2 mt-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value.toLowerCase())}
              placeholder={surface.name}
              className="font-mono text-sm h-8 max-w-md"
              style={{ fontSize: "16px" }}
              autoFocus
              disabled={busy}
            />
            <Button
              size="sm"
              onClick={() => void onRename()}
              disabled={busy || !newName || newName === surface.name}
              className="h-8"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Rename"
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setRenaming(false);
                setNewName("");
              }}
              disabled={busy}
              className="h-8"
            >
              Cancel
            </Button>
            <span className="text-[11px] text-muted-foreground">
              Renames cascade via <code className="font-mono">ON UPDATE CASCADE</code>.
            </span>
          </div>
        )}
      </div>

      {/* Single-scroll body */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 py-4 space-y-6 pb-safe">
          {loadError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5" />
              {loadError}
            </div>
          )}

          <IdentitySection
            surface={surface}
            busy={busy}
            onSave={patchSurface}
          />

          <ClassificationSection
            surface={surface}
            surfaceOptions={surfaceOptions}
            executorNames={executorNames}
            busy={busy}
            onSave={patchSurface}
          />

          <ToolDefaultsSection
            surfaceName={surface.name}
            defaults={defaults}
            bundles={bundles}
            busy={busy}
            onPatch={patchDefaults}
          />

          <section className="space-y-2">
            <SectionHeading
              title="Surface values"
              hint="Code-first — declared in the manifest, mirrored to ui_surface_value by Sync Manifests. View + drift only."
            />
            <SurfaceValuesTable
              manifest={manifest}
              dbValues={dbValues}
              loading={loadingData && dbValues === null}
              error={null}
            />
          </section>

          <RolesSection
            surfaceName={surface.name}
            configBundle={configBundle}
            agentNames={agentNames}
            isSuperAdmin={isSuperAdmin}
            loading={loadingData && configBundle === null}
            onChanged={() => void load(surface.name)}
          />

          <ConfigNamespacesSection
            surfaceName={surface.name}
            configBundle={configBundle}
          />

          <UsageSection surfaceName={surface.name} usage={usage} loading={loadingData && usage === null} />
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Shared bits
// ───────────────────────────────────────────────────────────────────────────

function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {hint && (
        <p className="text-[11px] text-muted-foreground/80 mt-0.5">{hint}</p>
      )}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border px-3 py-3 text-center text-[11px] text-muted-foreground">
      {children}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Identity
// ───────────────────────────────────────────────────────────────────────────

function IdentitySection({
  surface,
  busy,
  onSave,
}: {
  surface: UiSurfaceRow;
  busy: boolean;
  onSave: (
    patch: Parameters<typeof updateSurface>[1],
    successMsg?: string,
  ) => Promise<void>;
}) {
  const [desc, setDesc] = useState(surface.description ?? "");
  const [urlPattern, setUrlPattern] = useState(surface.url_pattern ?? "");

  // Re-seed local drafts when the underlying row changes (refresh / rename).
  useEffect(() => {
    setDesc(surface.description ?? "");
    setUrlPattern(surface.url_pattern ?? "");
  }, [surface.name, surface.description, surface.url_pattern]);

  const dirty =
    desc !== (surface.description ?? "") ||
    urlPattern !== (surface.url_pattern ?? "");

  return (
    <section className="space-y-2">
      <SectionHeading title="Identity" />
      <div className="space-y-3 rounded-md border border-border bg-card p-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Description</Label>
          <Textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={3}
            placeholder="Short, agent-facing description"
            style={{ fontSize: "16px" }}
            disabled={busy}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">URL pattern</Label>
          <Input
            value={urlPattern}
            onChange={(e) => setUrlPattern(e.target.value)}
            placeholder="e.g. /transcripts/cleanup"
            className="font-mono text-sm"
            style={{ fontSize: "16px" }}
            disabled={busy}
          />
          <p className="text-[11px] text-muted-foreground">
            Route this surface lives at — drives the header&apos;s &quot;Open
            live page&quot; link and route → surface resolution.
          </p>
        </div>
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() =>
              void onSave(
                {
                  description: desc || null,
                  url_pattern: urlPattern.trim() || null,
                },
                "Identity saved",
              )
            }
            disabled={busy || !dirty}
            className="h-7 gap-1.5 text-xs"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Save
          </Button>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Classification
// ───────────────────────────────────────────────────────────────────────────

function ClassificationSection({
  surface,
  surfaceOptions,
  executorNames,
  busy,
  onSave,
}: {
  surface: UiSurfaceRow;
  surfaceOptions: SurfaceOption[];
  executorNames: string[];
  busy: boolean;
  onSave: (
    patch: Parameters<typeof updateSurface>[1],
    successMsg?: string,
  ) => Promise<void>;
}) {
  const tier = tierFor(surface.sort_order);
  const [sortDraft, setSortDraft] = useState(String(surface.sort_order));
  const [parentOpen, setParentOpen] = useState(false);

  useEffect(() => {
    setSortDraft(String(surface.sort_order));
  }, [surface.sort_order]);

  // Self + descendants are not legal parents (would create a cycle).
  const childrenByParent = new Map<string, string[]>();
  for (const o of surfaceOptions) {
    if (!o.parent_surface_name) continue;
    const arr = childrenByParent.get(o.parent_surface_name) ?? [];
    arr.push(o.name);
    childrenByParent.set(o.parent_surface_name, arr);
  }
  const excluded = new Set<string>([surface.name]);
  const stack = [surface.name];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const child of childrenByParent.get(cur) ?? []) {
      if (!excluded.has(child)) {
        excluded.add(child);
        stack.push(child);
      }
    }
  }
  const parentCandidates = surfaceOptions.filter((o) => !excluded.has(o.name));

  const commitSortOrder = () => {
    const n = Number(sortDraft);
    if (!Number.isFinite(n) || n < 0) {
      setSortDraft(String(surface.sort_order));
      toast.error("sort_order must be a non-negative number");
      return;
    }
    if (n === surface.sort_order) return;
    void onSave({ sort_order: n }, `sort_order set to ${n}`);
  };

  return (
    <section className="space-y-2">
      <SectionHeading title="Classification" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 rounded-md border border-border bg-card p-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Tier (sort_order band)</Label>
          <Select
            value={tier.label}
            onValueChange={(label) => {
              const t = SURFACE_TIERS.find((x) => x.label === label);
              if (!t || t.label === tier.label) return;
              void onSave(
                { sort_order: t.min + 50 },
                `Moved to ${t.label} (sort_order ${t.min + 50})`,
              );
            }}
            disabled={busy}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SURFACE_TIERS.map((t) => (
                <SelectItem key={t.label} value={t.label}>
                  <div className="flex flex-col items-start">
                    <span>{t.label}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {t.description}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Raw sort_order</Label>
          <Input
            type="number"
            value={sortDraft}
            onChange={(e) => setSortDraft(e.target.value)}
            onBlur={commitSortOrder}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className="h-8 text-xs tabular-nums"
            style={{ fontSize: "16px" }}
            disabled={busy}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Execution mode</Label>
          <Select
            value={surface.execution_mode}
            onValueChange={(v) =>
              void onSave({ execution_mode: v }, `execution_mode set to ${v}`)
            }
            disabled={busy}
          >
            <SelectTrigger className="h-8 text-xs font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXECUTION_MODES.map((m) => (
                <SelectItem key={m} value={m} className="font-mono text-xs">
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Parent surface</Label>
          <Popover open={parentOpen} onOpenChange={setParentOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={parentOpen}
                disabled={busy}
                className="h-8 w-full justify-between text-xs font-mono font-normal"
              >
                <span className="truncate">
                  {surface.parent_surface_name ?? "(none)"}
                </span>
                <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search surfaces…" className="text-xs" />
                <CommandList>
                  <CommandEmpty>No surface found.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="(none)"
                      onSelect={() => {
                        setParentOpen(false);
                        if (surface.parent_surface_name === null) return;
                        void onSave(
                          { parent_surface_name: null },
                          "Parent cleared",
                        );
                      }}
                      className="text-xs"
                    >
                      (none)
                    </CommandItem>
                    {parentCandidates.map((o) => (
                      <CommandItem
                        key={o.name}
                        value={o.name}
                        onSelect={() => {
                          setParentOpen(false);
                          if (surface.parent_surface_name === o.name) return;
                          void onSave(
                            { parent_surface_name: o.name },
                            `Parent set to ${o.name}`,
                          );
                        }}
                        className="text-xs font-mono"
                      >
                        {o.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <p className="text-[11px] text-muted-foreground">
            Inheritance chain for tool defaults. Self and descendants are
            excluded (cycle guard).
          </p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Executor</Label>
          <Select
            value={surface.executor_name ?? NONE}
            onValueChange={(v) =>
              void onSave(
                { executor_name: v === NONE ? null : v },
                v === NONE ? "Executor cleared" : `Executor set to ${v}`,
              )
            }
            disabled={busy}
          >
            <SelectTrigger className="h-8 text-xs font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE} className="text-xs">
                (none — inherits)
              </SelectItem>
              {executorNames.map((n) => (
                <SelectItem key={n} value={n} className="font-mono text-xs">
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Tool defaults (tool_surface_defaults)
// ───────────────────────────────────────────────────────────────────────────

type DefaultsPatch = Parameters<typeof upsertSurfaceToolDefaults>[1];

function ToolDefaultsSection({
  surfaceName,
  defaults,
  bundles,
  busy,
  onPatch,
}: {
  surfaceName: string;
  defaults: ToolSurfaceDefaultsRow | null;
  bundles: BundleRow[];
  busy: boolean;
  onPatch: (patch: DefaultsPatch, successMsg?: string) => Promise<void>;
}) {
  const [toolDialogFor, setToolDialogFor] = useState<
    "always_include_tools" | "never_include_tools" | null
  >(null);
  const [notesDraft, setNotesDraft] = useState(defaults?.notes ?? "");

  useEffect(() => {
    setNotesDraft(defaults?.notes ?? "");
  }, [defaults?.notes]);

  const alwaysTools = defaults?.always_include_tools ?? [];
  const neverTools = defaults?.never_include_tools ?? [];
  const alwaysBundles = defaults?.always_include_bundles ?? [];
  const neverBundles = defaults?.never_include_bundles ?? [];

  const toolListPatch = (
    field: "always_include_tools" | "never_include_tools",
    next: string[],
  ): DefaultsPatch =>
    field === "always_include_tools"
      ? { always_include_tools: next }
      : { never_include_tools: next };

  const bundleListPatch = (
    field: "always_include_bundles" | "never_include_bundles",
    next: string[],
  ): DefaultsPatch =>
    field === "always_include_bundles"
      ? { always_include_bundles: next }
      : { never_include_bundles: next };

  const addTool = async (
    field: "always_include_tools" | "never_include_tools",
    toolName: string,
  ) => {
    const cur = field === "always_include_tools" ? alwaysTools : neverTools;
    if (cur.includes(toolName)) return;
    await onPatch(
      toolListPatch(field, [...cur, toolName]),
      `${toolName} added`,
    );
  };

  const removeTool = (
    field: "always_include_tools" | "never_include_tools",
    toolName: string,
  ) => {
    const cur = field === "always_include_tools" ? alwaysTools : neverTools;
    void onPatch(
      toolListPatch(
        field,
        cur.filter((n) => n !== toolName),
      ),
      `${toolName} removed`,
    );
  };

  const addBundle = (
    field: "always_include_bundles" | "never_include_bundles",
    bundleName: string,
  ) => {
    const cur =
      field === "always_include_bundles" ? alwaysBundles : neverBundles;
    if (cur.includes(bundleName)) return;
    void onPatch(
      bundleListPatch(field, [...cur, bundleName]),
      `${bundleName} added`,
    );
  };

  const removeBundle = (
    field: "always_include_bundles" | "never_include_bundles",
    bundleName: string,
  ) => {
    const cur =
      field === "always_include_bundles" ? alwaysBundles : neverBundles;
    void onPatch(
      bundleListPatch(
        field,
        cur.filter((n) => n !== bundleName),
      ),
      `${bundleName} removed`,
    );
  };

  const loadToolsExcluding = (existing: string[]) => async () => {
    const all = await listAllToolOptions();
    const taken = new Set(existing);
    return all.filter((t: ToolCatalogOption) => !taken.has(t.name));
  };

  return (
    <section className="space-y-2">
      <SectionHeading
        title="Tool defaults"
        hint="tool_surface_defaults — which tools/bundles are force-included or banned on this surface, plus per-tool argument defaults and injection. The row is created on first edit."
      />
      <div className="space-y-4 rounded-md border border-border bg-card p-3">
        {!defaults && (
          <div className="rounded-md border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
            No <code className="font-mono">tool_surface_defaults</code> row yet
            — this surface inherits everything from its parent chain. Any edit
            below creates the row.
          </div>
        )}

        <ToolChipList
          label="Always include tools"
          tools={alwaysTools}
          busy={busy}
          onAdd={() => setToolDialogFor("always_include_tools")}
          onRemove={(n) => removeTool("always_include_tools", n)}
        />
        <ToolChipList
          label="Never include tools"
          tools={neverTools}
          busy={busy}
          onAdd={() => setToolDialogFor("never_include_tools")}
          onRemove={(n) => removeTool("never_include_tools", n)}
        />

        <BundleChipList
          label="Always include bundles"
          selected={alwaysBundles}
          bundles={bundles}
          busy={busy}
          onAdd={(n) => addBundle("always_include_bundles", n)}
          onRemove={(n) => removeBundle("always_include_bundles", n)}
        />
        <BundleChipList
          label="Never include bundles"
          selected={neverBundles}
          bundles={bundles}
          busy={busy}
          onAdd={(n) => addBundle("never_include_bundles", n)}
          onRemove={(n) => removeBundle("never_include_bundles", n)}
        />

        <JsonRecordEditor
          label="Arg defaults"
          hint="Per-tool literal argument defaults: { <tool_name>: { <arg>: <value> } }."
          record={(defaults?.arg_defaults ?? {}) as Record<string, unknown>}
          busy={busy}
          onSave={(rec) =>
            onPatch({ arg_defaults: rec as never }, "arg_defaults saved")
          }
        />
        <JsonRecordEditor
          label="Arg injection"
          hint="Per-tool runtime-injected arguments: { <tool_name>: { <arg>: <source> } }."
          record={(defaults?.arg_injection ?? {}) as Record<string, unknown>}
          busy={busy}
          onSave={(rec) =>
            onPatch({ arg_injection: rec as never }, "arg_injection saved")
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Input
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={() => {
                if (notesDraft === (defaults?.notes ?? "")) return;
                void onPatch({ notes: notesDraft || null }, "Notes saved");
              }}
              placeholder="Admin-facing notes about this surface's tool policy"
              style={{ fontSize: "16px" }}
              disabled={busy}
            />
          </div>
          <div className="flex items-center gap-2 pb-1">
            <Switch
              checked={defaults?.is_active ?? true}
              onCheckedChange={(v) =>
                void onPatch(
                  { is_active: v },
                  `Defaults ${v ? "activated" : "deactivated"}`,
                )
              }
              disabled={busy}
            />
            <Label className="text-xs">Defaults active</Label>
          </div>
        </div>
      </div>

      <ToolSearchDialog
        open={toolDialogFor !== null}
        onOpenChange={(o) => {
          if (!o) setToolDialogFor(null);
        }}
        title={
          <>
            Add to{" "}
            <span className="font-mono">
              {toolDialogFor ?? "always_include_tools"}
            </span>{" "}
            on <span className="font-mono">{surfaceName}</span>
          </>
        }
        loadTools={loadToolsExcluding(
          toolDialogFor === "never_include_tools" ? neverTools : alwaysTools,
        )}
        onAdd={async (tool: ToolSearchOption) => {
          if (!toolDialogFor) return;
          await addTool(toolDialogFor, tool.name);
        }}
      />
    </section>
  );
}

function ToolChipList({
  label,
  tools,
  busy,
  onAdd,
  onRemove,
}: {
  label: string;
  tools: string[];
  busy: boolean;
  onAdd: () => void;
  onRemove: (name: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <Button
          variant="outline"
          size="sm"
          onClick={onAdd}
          disabled={busy}
          className="h-6 gap-1 px-2 text-[11px]"
        >
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </div>
      {tools.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">None.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tools.map((name) => (
            <Badge
              key={name}
              variant="outline"
              className="text-[11px] font-mono gap-1 pr-1"
            >
              {name}
              <button
                onClick={() => onRemove(name)}
                disabled={busy}
                className="hover:text-destructive disabled:opacity-50"
                aria-label={`Remove ${name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function BundleChipList({
  label,
  selected,
  bundles,
  busy,
  onAdd,
  onRemove,
}: {
  label: string;
  selected: string[];
  bundles: BundleRow[];
  busy: boolean;
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
}) {
  const available = bundles.filter((b) => !selected.includes(b.name));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        <Select
          value=""
          onValueChange={(v) => onAdd(v)}
          disabled={busy || available.length === 0}
        >
          <SelectTrigger className="h-6 w-[200px] text-[11px]">
            <SelectValue placeholder="Add bundle…" />
          </SelectTrigger>
          <SelectContent>
            {available.map((b) => (
              <SelectItem key={b.id} value={b.name} className="text-xs">
                <span className="font-mono">{b.name}</span>
                {b.is_active === false && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground">
                    (inactive)
                  </span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {selected.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">None.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((name) => (
            <Badge
              key={name}
              variant="outline"
              className="text-[11px] font-mono gap-1 pr-1"
            >
              {name}
              <button
                onClick={() => onRemove(name)}
                disabled={busy}
                className="hover:text-destructive disabled:opacity-50"
                aria-label={`Remove ${name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function JsonRecordEditor({
  label,
  hint,
  record,
  busy,
  onSave,
}: {
  label: string;
  hint: string;
  record: Record<string, unknown>;
  busy: boolean;
  onSave: (record: Record<string, unknown>) => Promise<void>;
}) {
  const keys = Object.keys(record).sort((a, b) => a.localeCompare(b));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState("");

  // Drop drafts/errors for keys that no longer exist after a refresh.
  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<string, string> = {};
      for (const k of Object.keys(prev)) {
        if (k in record) next[k] = prev[k];
      }
      return next;
    });
    setErrors((prev) => {
      const next: Record<string, string> = {};
      for (const k of Object.keys(prev)) {
        if (k in record) next[k] = prev[k];
      }
      return next;
    });
  }, [record]);

  const draftFor = (key: string) =>
    drafts[key] ?? JSON.stringify(record[key], null, 2);

  const commitKey = (key: string) => {
    const raw = draftFor(key);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      setErrors((prev) => ({
        ...prev,
        [key]: e instanceof Error ? e.message : "Invalid JSON",
      }));
      return;
    }
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (JSON.stringify(parsed) === JSON.stringify(record[key])) return;
    void onSave({ ...record, [key]: parsed }).then(() => {
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    });
  };

  const removeKey = (key: string) => {
    const next = { ...record };
    delete next[key];
    void onSave(next);
  };

  const addKey = () => {
    const key = newKey.trim();
    if (!key || key in record) return;
    setNewKey("");
    void onSave({ ...record, [key]: {} });
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
      {keys.length === 0 && (
        <p className="text-[11px] text-muted-foreground">No entries.</p>
      )}
      <div className="space-y-2">
        {keys.map((key) => (
          <div key={key} className="rounded-md border border-border p-2 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <code className="font-mono text-[11px] text-foreground">
                {key}
              </code>
              <div className="flex items-center gap-2">
                {errors[key] && (
                  <span className="text-[10px] text-destructive">
                    JSON error: {errors[key]}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeKey(key)}
                  disabled={busy}
                  className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${key}`}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <Textarea
              value={draftFor(key)}
              onChange={(e) =>
                setDrafts((prev) => ({ ...prev, [key]: e.target.value }))
              }
              onBlur={() => commitKey(key)}
              rows={3}
              className={`font-mono ${errors[key] ? "border-destructive" : ""}`}
              style={{ fontSize: "13px" }}
              disabled={busy}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addKey();
          }}
          placeholder="tool_name"
          className="h-7 max-w-[240px] font-mono text-xs"
          style={{ fontSize: "16px" }}
          disabled={busy}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={addKey}
          disabled={busy || !newKey.trim() || newKey.trim() in record}
          className="h-7 gap-1 px-2 text-[11px]"
        >
          <Plus className="h-3 w-3" />
          Add key
        </Button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Roles
// ───────────────────────────────────────────────────────────────────────────

function RolesSection({
  surfaceName,
  configBundle,
  agentNames,
  isSuperAdmin,
  loading,
  onChanged,
}: {
  surfaceName: string;
  configBundle: SurfaceConfigBundle | null;
  agentNames: Record<string, string>;
  isSuperAdmin: boolean;
  loading: boolean;
  onChanged: () => void;
}) {
  const [busyRole, setBusyRole] = useState<string | null>(null);
  const roles = configBundle?.dbRoles ?? [];

  const globalSelectionFor = (roleName: string) =>
    (configBundle?.prefs ?? []).filter(
      (p) =>
        p.roleName === roleName &&
        p.kind === "selection" &&
        !p.userId &&
        !p.organizationId &&
        !p.scopeId,
    );

  const nameFor = (agentId: string) =>
    agentNames[agentId] ?? `${agentId.slice(0, 8)}…`;

  const setPlatformOverride = async (roleName: string, agentId: string) => {
    setBusyRole(roleName);
    try {
      await setRoleSelection({ surfaceName, roleName, agentId, scope: {} });
      toast.success(`Platform override set for ${roleName}`);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Override failed");
    } finally {
      setBusyRole(null);
    }
  };

  const clearPlatformOverride = async (roleName: string, prefId: string) => {
    setBusyRole(roleName);
    try {
      await deleteRolePref(prefId);
      toast.success(`Platform override cleared for ${roleName}`);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Clear failed");
    } finally {
      setBusyRole(null);
    }
  };

  return (
    <section className="space-y-2">
      <SectionHeading
        title="Agent roles"
        hint="ui_surface_agent_role — agent positions this surface plugs in. The platform default is the manifest's default_agent_id; the global-scope pref row is the platform runtime override (super admin only)."
      />
      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading roles…
        </div>
      )}
      {!loading && roles.length === 0 && (
        <EmptyHint>This surface declares no agent roles.</EmptyHint>
      )}
      {roles.length > 0 && (
        <div className="rounded-md border border-border bg-card divide-y divide-border">
          {roles.map((role) => {
            const overrides = globalSelectionFor(role.name);
            const isBusy = busyRole === role.name;
            return (
              <div key={role.name} className="px-3 py-2 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="text-xs font-medium text-foreground"
                    title={role.description || undefined}
                  >
                    {role.label}
                  </span>
                  <code className="font-mono text-[10px] text-muted-foreground">
                    {role.name}
                  </code>
                  <Badge variant="outline" className="text-[10px]">
                    {role.kind}
                  </Badge>
                  {role.kind === "multi" && (
                    <Badge variant="outline" className="text-[10px] tabular-nums">
                      max {role.maxAgents}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px]">
                    auto-run: {role.autoRun}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-[11px]">
                  <span className="text-muted-foreground">
                    Platform default:{" "}
                    {role.defaultAgentId ? (
                      <span className="text-foreground">
                        {nameFor(role.defaultAgentId)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </span>
                  {overrides.map((p) => (
                    <span key={p.id} className="inline-flex items-center gap-1">
                      <Badge variant="default" className="text-[10px] gap-1">
                        Override
                        {role.kind === "multi" ? ` (pos ${p.position})` : ""}:{" "}
                        {nameFor(p.agentId)}
                      </Badge>
                      {isSuperAdmin && (
                        <button
                          onClick={() =>
                            void clearPlatformOverride(role.name, p.id)
                          }
                          disabled={isBusy}
                          className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                          aria-label="Clear platform override"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  ))}
                  {isSuperAdmin ? (
                    <RoleOverridePicker
                      busy={isBusy}
                      onSelect={(agentId) =>
                        void setPlatformOverride(role.name, agentId)
                      }
                    />
                  ) : (
                    overrides.length === 0 && (
                      <span className="text-muted-foreground/70">
                        (super admin required to override)
                      </span>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function RoleOverridePicker({
  busy,
  onSelect,
}: {
  busy: boolean;
  onSelect: (agentId: string) => void;
}) {
  return (
    <AgentListDropdown
      onSelect={onSelect}
      label="Set platform override"
      compact
      triggerSlot={
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          className="h-6 gap-1 px-2 text-[11px]"
        >
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Plus className="h-3 w-3" />
          )}
          Set platform override
        </Button>
      }
    />
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Config namespaces (read-only)
// ───────────────────────────────────────────────────────────────────────────

function ConfigNamespacesSection({
  surfaceName,
  configBundle,
}: {
  surfaceName: string;
  configBundle: SurfaceConfigBundle | null;
}) {
  const manifest = getManifest(surfaceName);
  const declared = manifest?.configNamespaces ?? [];
  const rows = configBundle?.configRows ?? [];

  // namespace → tier → count (RLS-visible rows only).
  const counts = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const tier = row.userId
      ? "user"
      : row.organizationId
        ? "org"
        : row.scopeId
          ? "scope"
          : "global";
    const entry = counts.get(row.namespace) ?? {};
    entry[tier] = (entry[tier] ?? 0) + 1;
    counts.set(row.namespace, entry);
  }
  const allNamespaces = [
    ...new Set([...declared.map((d) => d.namespace), ...counts.keys()]),
  ].sort((a, b) => a.localeCompare(b));

  return (
    <section className="space-y-2">
      <SectionHeading
        title="Config namespaces"
        hint="Code-declared in the manifest; rows live in ui_surface_config. Read-only here — handlers own validation and merge."
      />
      {allNamespaces.length === 0 ? (
        <EmptyHint>
          No config namespaces declared and no ui_surface_config rows exist.
        </EmptyHint>
      ) : (
        <div className="rounded-md border border-border bg-card divide-y divide-border">
          {allNamespaces.map((ns) => {
            const decl = declared.find((d) => d.namespace === ns) ?? null;
            const tierCounts = counts.get(ns) ?? {};
            return (
              <div
                key={ns}
                className="px-3 py-1.5 flex items-center gap-2 flex-wrap"
              >
                <code className="font-mono text-xs text-foreground">{ns}</code>
                {decl ? (
                  <span className="text-[11px] text-muted-foreground flex-1 min-w-0 truncate">
                    {decl.label} — {decl.description}
                  </span>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                  >
                    rows only — not declared in manifest
                  </Badge>
                )}
                <span className="ml-auto flex items-center gap-1">
                  {(["global", "org", "scope", "user"] as const).map((tier) => (
                    <Badge
                      key={tier}
                      variant={tierCounts[tier] ? "default" : "outline"}
                      className="text-[10px] tabular-nums"
                    >
                      {tier}: {tierCounts[tier] ?? 0}
                    </Badge>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Usage
// ───────────────────────────────────────────────────────────────────────────

function UsageSection({
  surfaceName,
  usage,
  loading,
}: {
  surfaceName: string;
  usage: SurfaceUsage | null;
  loading: boolean;
}) {
  return (
    <section className="space-y-2">
      <SectionHeading
        title="Usage"
        hint="What points at this surface — force-included tools, agent bindings, and per-tool UI customizations."
      />
      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading usage…
        </div>
      )}
      {usage && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              Agents
              <Badge variant="outline" className="text-[10px] tabular-nums">
                {usage.agents.length}
              </Badge>
            </Label>
            {usage.agents.length === 0 ? (
              <EmptyHint>No agents bound to this surface.</EmptyHint>
            ) : (
              <ul className="rounded-md border border-border bg-card divide-y divide-border">
                {usage.agents.map((a) => (
                  <li key={a.id} className="px-2 py-1.5">
                    <Link
                      href={`/agents/${a.id}/surfaces?surface=${encodeURIComponent(surfaceName)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-foreground hover:text-primary hover:underline inline-flex items-center gap-1 min-w-0 max-w-full"
                    >
                      <span className="truncate">{a.name}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              Tools
              <Badge variant="outline" className="text-[10px] tabular-nums">
                {usage.tools.length}
              </Badge>
            </Label>
            {usage.tools.length === 0 ? (
              <EmptyHint>No tools force-included here.</EmptyHint>
            ) : (
              <ul className="rounded-md border border-border bg-card divide-y divide-border">
                {usage.tools.map((t) => (
                  <li
                    key={`${t.id}-${t.via}-${t.bundle_name ?? ""}`}
                    className={`px-2 py-1.5 ${t.is_active === false ? "opacity-60" : ""}`}
                  >
                    <Link
                      href={`/administration/mcp-tools/${t.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-foreground hover:text-primary hover:underline inline-flex items-center gap-1 min-w-0 max-w-full"
                    >
                      <span className="truncate">{t.name}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                    </Link>
                    {t.via === "always_include_bundles" && (
                      <div className="text-[10px] text-muted-foreground">
                        via bundle {t.bundle_name}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              Tool UI components
              <Badge variant="outline" className="text-[10px] tabular-nums">
                {usage.uiComponents.length}
              </Badge>
            </Label>
            {usage.uiComponents.length === 0 ? (
              <EmptyHint>No tool_ui rows scoped to this surface.</EmptyHint>
            ) : (
              <ul className="rounded-md border border-border bg-card divide-y divide-border">
                {usage.uiComponents.map((u) => (
                  <li
                    key={u.id}
                    className={`px-2 py-1.5 ${u.is_active ? "" : "opacity-60"}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <code className="font-mono text-xs flex-1 truncate">
                        {u.tool_name}
                      </code>
                      <Badge variant="secondary" className="text-[10px]">
                        {u.display_name}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
