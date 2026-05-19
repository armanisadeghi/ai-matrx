"use client";

/**
 * AgentSurfacesPanel — the agent engineer's view for binding an agent to
 * any surface in the platform.
 *
 * Conceptual model:
 * - This is NOT a "list of the agent's surfaces." It's a catalogue of every
 *   active surface, with the agent's existing bindings shown inline against
 *   each one. The engineer can bind their agent to any surface from here.
 * - Surfaces are grouped by `client_name` (matrx-user, matrx-admin, ...)
 *   and rendered without the noisy `<client>/<local>` concatenation. The
 *   client lives as a badge / group header.
 * - A binding lives at one of the canonical tiers (user / org / project /
 *   task / global) AND can be cross-tagged with any number of custom
 *   user-defined scopes via the scope-assignments M2M system
 *   (entity_type = "agent_surface_binding").
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Building,
  ChevronRight,
  Globe,
  Layers,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Zap,
  Trash2,
  User
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "sonner";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  AGENT_SCOPES,
  type AgentScope,
} from "@/features/agent-shortcuts/constants";
import { ShortcutScopePicker } from "@/features/agent-shortcuts/components/ShortcutScopePicker";
import { CategorySelect } from "@/features/agent-shortcuts/components/CategorySelect";
import { useAgentShortcuts } from "@/features/agent-shortcuts/hooks/useAgentShortcuts";
import { useAgentShortcutCrud } from "@/features/agent-shortcuts/hooks/useAgentShortcutCrud";
import {
  ValueMappingEditor,
  type MappingTarget,
} from "@/features/surfaces/components/ValueMappingEditor";
import type { SurfaceWithStats } from "@/features/surfaces/services/surfaces.service";
import type { AgentSurfaceBinding } from "@/features/surfaces/services/agent-surface-bindings.service";
import type {
  SurfaceValue,
  ValueMappingMap,
} from "@/features/surfaces/types";
import {
  loadSurfaces,
  loadSurfaceValues,
  loadBindingsForAgent,
  upsertAgentSurfaceBindingThunk,
  deleteAgentSurfaceBindingThunk,
} from "@/features/surfaces/redux/thunks";
import {
  makeSelectBindingsForAgent,
  makeSelectBindingsErrorForAgent,
  makeSelectBindingsStatusForAgent,
  selectActiveSurfaces,
  selectSurfacesError,
  selectSurfacesStatus,
  makeSelectSurfaceValues,
  makeSelectSurfaceValuesStatus,
} from "@/features/surfaces/redux/selectors";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import type { ContextSlot } from "@/features/agents/types/agent-api-types";
import { EntityScopeTagger } from "@/features/scopes/components/entity-context/EntityScopeTagger";
import { useEntityScopes } from "@/features/scopes/hooks/useEntityScopes";
import { setEntityScopes } from "@/features/scopes/redux/thunks/setEntityScopes";
import type { ScopeAssignmentEntityType } from "@/features/scopes/types";

/**
 * Canonical entity_type for `agx_agent_surface` rows in the scope-assignments
 * many-to-many system. Mirrors the per-component constant used by
 * `agent-apps` and `notes`.
 */
const SCOPE_ENTITY_TYPE: ScopeAssignmentEntityType = "agent_surface_binding";

interface Props {
  agent: AgentDefinition;
}

// ─────────────────────────────────────────────────────────────────────────────
// Small utilities
// ─────────────────────────────────────────────────────────────────────────────

function splitSurfaceName(fullName: string): {
  client: string;
  local: string;
} {
  const idx = fullName.indexOf("/");
  if (idx < 0) return { client: "", local: fullName };
  return { client: fullName.slice(0, idx), local: fullName.slice(idx + 1) };
}

function scopeFromBinding(b: AgentSurfaceBinding): {
  scope: AgentScope;
  scopeId?: string;
  label: string;
} {
  if (b.userId)
    return { scope: AGENT_SCOPES.USER, scopeId: b.userId, label: "Personal" };
  if (b.organizationId)
    return {
      scope: AGENT_SCOPES.ORGANIZATION,
      scopeId: b.organizationId,
      label: "Organization",
    };
  if (b.projectId)
    return {
      scope: AGENT_SCOPES.PROJECT,
      scopeId: b.projectId,
      label: "Project",
    };
  if (b.taskId)
    return { scope: AGENT_SCOPES.TASK, scopeId: b.taskId, label: "Task" };
  return { scope: AGENT_SCOPES.GLOBAL, label: "Global" };
}

function ScopeIcon({ scope }: { scope: AgentScope }) {
  if (scope === AGENT_SCOPES.USER) return <User className="h-3.5 w-3.5" />;
  if (scope === AGENT_SCOPES.ORGANIZATION)
    return <Building className="h-3.5 w-3.5" />;
  return <Globe className="h-3.5 w-3.5" />;
}

function buildMappingTargets(agent: AgentDefinition): MappingTarget[] {
  const targets: MappingTarget[] = [];
  const seen = new Set<string>();
  for (const v of agent.variableDefinitions ?? []) {
    if (seen.has(v.name)) continue;
    seen.add(v.name);
    targets.push({
      name: v.name,
      type: "string",
      description: v.helpText,
      required: v.required ?? false,
    });
  }
  for (const slot of agent.contextSlots ?? []) {
    if (seen.has(slot.key)) continue;
    seen.add(slot.key);
    targets.push({
      name: slot.key,
      label: slot.label,
      description: slot.description,
      type: mapContextSlotType(slot),
    });
  }
  return targets;
}

function mapContextSlotType(slot: ContextSlot): SurfaceValue["valueType"] {
  switch (slot.type) {
    case "json":
      return "object";
    case "text":
    case "file_url":
    case "db_ref":
    case "user":
    case "org":
    case "project":
    case "task":
      return "string";
    default:
      return "string";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main panel
// ─────────────────────────────────────────────────────────────────────────────

export function AgentSurfacesPanel({ agent }: Props) {
  const dispatch = useAppDispatch();
  const currentUserId = useAppSelector((s) => s.userAuth?.id ?? null);
  const currentOrgId = useAppSelector((s) => {
    const orgState = (
      s as unknown as {
        organizations?: { activeOrganizationId?: string | null };
      }
    ).organizations;
    return orgState?.activeOrganizationId ?? null;
  });

  // ── Redux-backed catalogue + bindings ─────────────────────────────────────
  const selectBindingsForAgent = useMemo(
    () => makeSelectBindingsForAgent(agent.id),
    [agent.id],
  );
  const selectBindingsStatus = useMemo(
    () => makeSelectBindingsStatusForAgent(agent.id),
    [agent.id],
  );
  const selectBindingsError = useMemo(
    () => makeSelectBindingsErrorForAgent(agent.id),
    [agent.id],
  );
  const bindings = useAppSelector(selectBindingsForAgent);
  const allSurfaces = useAppSelector(selectActiveSurfaces);
  const surfacesStatus = useAppSelector(selectSurfacesStatus);
  const surfacesError = useAppSelector(selectSurfacesError);
  const bindingsStatus = useAppSelector(selectBindingsStatus);
  const bindingsError = useAppSelector(selectBindingsError);
  const loading =
    surfacesStatus === "loading" || bindingsStatus === "loading";
  const error = bindingsError ?? surfacesError;

  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [presetSurfaceName, setPresetSurfaceName] = useState<string | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [seedFromBinding, setSeedFromBinding] =
    useState<AgentSurfaceBinding | null>(null);

  const load = useCallback(
    async (force = false) => {
      await Promise.all([
        dispatch(loadSurfaces(force ? { force: true } : undefined)).unwrap(),
        dispatch(
          loadBindingsForAgent({ agentId: agent.id, force }),
        ).unwrap(),
      ]);
    },
    [dispatch, agent.id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const targets = useMemo(() => buildMappingTargets(agent), [agent]);

  // Bindings grouped by surface name for quick lookup.
  const bindingsBySurface = useMemo(() => {
    const map = new Map<string, AgentSurfaceBinding[]>();
    for (const b of bindings) {
      const list = map.get(b.surfaceName) ?? [];
      list.push(b);
      map.set(b.surfaceName, list);
    }
    return map;
  }, [bindings]);

  // Surfaces grouped by `client_name`, alphabetized by client then local name.
  const groupedSurfaces = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    const filtered = trimmed
      ? allSurfaces.filter((s) => {
          const local = splitSurfaceName(s.name).local;
          return (
            local.toLowerCase().includes(trimmed) ||
            s.client_name.toLowerCase().includes(trimmed) ||
            (s.description?.toLowerCase().includes(trimmed) ?? false)
          );
        })
      : allSurfaces;

    const groups = new Map<string, SurfaceWithStats[]>();
    for (const s of filtered) {
      const list = groups.get(s.client_name) ?? [];
      list.push(s);
      groups.set(s.client_name, list);
    }
    return Array.from(groups.entries())
      .map(([client, list]) => ({
        client,
        surfaces: list.sort((a, b) =>
          splitSurfaceName(a.name).local.localeCompare(
            splitSurfaceName(b.name).local,
          ),
        ),
        boundCount: list.reduce(
          (sum, s) => sum + (bindingsBySurface.get(s.name)?.length ?? 0),
          0,
        ),
      }))
      .sort((a, b) => a.client.localeCompare(b.client));
  }, [allSurfaces, query, bindingsBySurface]);

  const onDelete = async (binding: AgentSurfaceBinding) => {
    const ok = await confirm({
      title: "Remove binding?",
      description: `Detach ${agent.name} from ${splitSurfaceName(binding.surfaceName).local}. Auto-binding for matching variable names will still occur, but explicit mappings and custom scope tags are lost.`,
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await dispatch(
        deleteAgentSurfaceBindingThunk({ bindingId: binding.id }),
      ).unwrap();
      toast.success("Binding removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const editingBinding =
    editingId && editingId !== "new"
      ? (bindings.find((b) => b.id === editingId) ?? null)
      : null;

  const openNew = (surfaceName: string | null) => {
    setPresetSurfaceName(surfaceName);
    setEditingId("new");
  };

  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col pt-12">
      {/* Header */}
      <div className="shrink-0 px-3 py-1.5 border-b border-border flex items-center gap-2">
        <Layers className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-sm font-medium">Surface bindings</h1>
        <Badge variant="outline" className="text-[10px]">
          {bindings.length} active
        </Badge>
        {loading && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void load(true)}
            className="h-7 gap-1.5 text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => openNew(null)}
            className="h-7 gap-1.5 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            New binding
          </Button>
        </div>
      </div>

      {error && (
        <div className="mx-3 mt-2 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-xs text-destructive flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}

      {/* Search + intro */}
      <div className="shrink-0 px-3 pt-2.5 pb-2 space-y-2 border-b border-border bg-muted/20">
        <div className="rounded-md border border-dashed border-border bg-background px-3 py-2 text-[11px] text-muted-foreground">
          Bind this agent to any UI surface. Each binding can live at the user,
          org, project, task, or global tier, and can be cross-tagged with
          custom scopes you&rsquo;ve defined for your organization (e.g.
          &ldquo;Clients&rdquo;, &ldquo;Departments&rdquo;).
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search surfaces…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 pl-8 text-sm"
            style={{ fontSize: "16px" }}
          />
        </div>
      </div>

      {/* All surfaces, grouped by client */}
      <div className="flex-1 min-h-0 overflow-auto px-3 py-3 space-y-3">
        {!loading && groupedSurfaces.length === 0 && (
          <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
            No surfaces match &ldquo;{query}&rdquo;.
          </div>
        )}

        {groupedSurfaces.map((group) => (
          <ClientGroup
            key={group.client}
            client={group.client}
            surfaces={group.surfaces}
            boundCount={group.boundCount}
            bindingsBySurface={bindingsBySurface}
            agentName={agent.name}
            onAddForSurface={(name) => openNew(name)}
            onEdit={(id) => setEditingId(id)}
            onDelete={onDelete}
            onCreateShortcut={setSeedFromBinding}
            defaultOpen={!!query || group.boundCount > 0}
          />
        ))}
      </div>

      {editingId && (
        <BindingEditorDialog
          agent={agent}
          targets={targets}
          allSurfaces={allSurfaces}
          existing={editingBinding}
          presetSurfaceName={presetSurfaceName}
          defaultUserId={currentUserId}
          defaultOrgId={currentOrgId}
          onClose={() => {
            setEditingId(null);
            setPresetSurfaceName(null);
          }}
          onSaved={() => {
            setEditingId(null);
            setPresetSurfaceName(null);
            // Bindings are kept in sync by the thunks (upsertBinding /
            // removeBinding reducers); no refetch needed.
          }}
        />
      )}

      {seedFromBinding && (
        <CreateShortcutFromBindingDialog
          agentName={agent.name}
          binding={seedFromBinding}
          defaultUserId={currentUserId}
          onClose={() => setSeedFromBinding(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-client group + per-surface row
// ─────────────────────────────────────────────────────────────────────────────

interface ClientGroupProps {
  client: string;
  surfaces: SurfaceWithStats[];
  boundCount: number;
  bindingsBySurface: Map<string, AgentSurfaceBinding[]>;
  agentName: string;
  onAddForSurface: (surfaceName: string) => void;
  onEdit: (bindingId: string) => void;
  onDelete: (binding: AgentSurfaceBinding) => void;
  onCreateShortcut: (binding: AgentSurfaceBinding) => void;
  defaultOpen: boolean;
}

function ClientGroup({
  client,
  surfaces,
  boundCount,
  bindingsBySurface,
  agentName,
  onAddForSurface,
  onEdit,
  onDelete,
  onCreateShortcut,
  defaultOpen,
}: ClientGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  // Re-sync when search filter forces all groups open.
  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-md border border-border bg-card overflow-hidden">
        <CollapsibleTrigger className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-accent/40 transition-colors">
          <ChevronRight
            className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
              open ? "rotate-90" : ""
            }`}
          />
          <span className="font-mono text-xs text-foreground">{client}</span>
          <Badge variant="outline" className="text-[10px]">
            {surfaces.length} surface{surfaces.length === 1 ? "" : "s"}
          </Badge>
          {boundCount > 0 && (
            <Badge className="text-[10px]">
              {boundCount} binding{boundCount === 1 ? "" : "s"}
            </Badge>
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border divide-y divide-border">
            {surfaces.map((s) => (
              <SurfaceRow
                key={s.name}
                surface={s}
                bindings={bindingsBySurface.get(s.name) ?? []}
                agentName={agentName}
                onAdd={() => onAddForSurface(s.name)}
                onEdit={onEdit}
                onDelete={onDelete}
                onCreateShortcut={onCreateShortcut}
              />
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

interface SurfaceRowProps {
  surface: SurfaceWithStats;
  bindings: AgentSurfaceBinding[];
  agentName: string;
  onAdd: () => void;
  onEdit: (bindingId: string) => void;
  onDelete: (binding: AgentSurfaceBinding) => void;
  onCreateShortcut: (binding: AgentSurfaceBinding) => void;
}

function SurfaceRow({
  surface,
  bindings,
  onAdd,
  onEdit,
  onDelete,
  onCreateShortcut,
}: SurfaceRowProps) {
  const { local } = splitSurfaceName(surface.name);
  return (
    <div className="px-3 py-2 space-y-1.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-foreground">{local}</span>
            {bindings.length > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {bindings.length} binding{bindings.length === 1 ? "" : "s"}
              </Badge>
            )}
            {surface.surfaceValueCount > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {surface.surfaceValueCount} value
                {surface.surfaceValueCount === 1 ? "" : "s"}
              </Badge>
            )}
          </div>
          {surface.description && (
            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
              {surface.description}
            </p>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onAdd}
          className="h-7 gap-1 text-xs shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          Bind
        </Button>
      </div>

      {bindings.length > 0 && (
        <div className="pl-2 border-l border-border space-y-1">
          {bindings.map((b) => (
            <BindingRow
              key={b.id}
              binding={b}
              onEdit={() => onEdit(b.id)}
              onDelete={() => onDelete(b)}
              onCreateShortcut={onCreateShortcut}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BindingRow({
  binding,
  onEdit,
  onDelete,
  onCreateShortcut,
}: {
  binding: AgentSurfaceBinding;
  onEdit: () => void;
  onDelete: () => void;
  onCreateShortcut: (binding: AgentSurfaceBinding) => void;
}) {
  const { scope, label } = scopeFromBinding(binding);
  const mappingCount = Object.keys(binding.valueMappings).length;
  // Live custom scope tags from the canonical scopes module. `autoFetch` is
  // off — opening the editor dialog hydrates the cache; row badge only
  // reflects already-loaded assignments to avoid an N+1 burst.
  const { scopeIds: scopeTags } = useEntityScopes({
    entityType: SCOPE_ENTITY_TYPE,
    entityId: binding.id,
    autoFetch: false,
  });

  return (
    <div className="flex items-center gap-2 py-1 px-1.5 rounded text-xs hover:bg-accent/30">
      <ScopeIcon scope={scope} />
      <Badge variant="outline" className="text-[10px]">
        {label}
      </Badge>
      <Badge
        variant={mappingCount > 0 ? "default" : "outline"}
        className="text-[10px] tabular-nums"
      >
        {mappingCount} mapping{mappingCount === 1 ? "" : "s"}
      </Badge>
      {scopeTags.length > 0 && (
        <Badge variant="secondary" className="text-[10px]">
          {scopeTags.length} scope{scopeTags.length === 1 ? "" : "s"}
        </Badge>
      )}
      <div className="ml-auto flex items-center gap-0.5">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onCreateShortcut(binding)}
          className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground gap-1"
          aria-label="Create shortcut from this binding"
        >
          <Zap className="h-3 w-3" />
          Shortcut
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onEdit}
          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
          aria-label="Edit binding"
        >
          <Pencil className="h-3 w-3" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
          aria-label="Remove binding"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Binding editor dialog
// ─────────────────────────────────────────────────────────────────────────────

interface BindingEditorDialogProps {
  agent: AgentDefinition;
  targets: MappingTarget[];
  allSurfaces: SurfaceWithStats[];
  existing: AgentSurfaceBinding | null;
  presetSurfaceName: string | null;
  defaultUserId: string | null;
  defaultOrgId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

function BindingEditorDialog({
  agent,
  targets,
  allSurfaces,
  existing,
  presetSurfaceName,
  defaultUserId,
  defaultOrgId,
  onClose,
  onSaved,
}: BindingEditorDialogProps) {
  const dispatch = useAppDispatch();
  const initialScopeInfo = existing ? scopeFromBinding(existing) : null;
  const initialName = existing?.surfaceName ?? presetSurfaceName ?? "";
  const initialSplit = splitSurfaceName(initialName);

  const [clientName, setClientName] = useState(initialSplit.client);
  const [surfaceName, setSurfaceName] = useState(initialName);
  const [scope, setScope] = useState<AgentScope>(
    initialScopeInfo?.scope ?? AGENT_SCOPES.USER,
  );
  const [scopeId, setScopeId] = useState<string | undefined>(
    initialScopeInfo?.scopeId ?? defaultUserId ?? undefined,
  );
  const [mappings, setMappings] = useState<ValueMappingMap>(
    existing?.valueMappings ?? {},
  );
  // Surface values come from Redux now; the thunk caches per surface, so
  // re-opening the dialog for the same surface skips the network.
  const selectSurfaceValues = useMemo(
    () => makeSelectSurfaceValues(surfaceName),
    [surfaceName],
  );
  const selectSurfaceValuesStatus = useMemo(
    () => makeSelectSurfaceValuesStatus(surfaceName),
    [surfaceName],
  );
  const surfaceValues = useAppSelector(selectSurfaceValues);
  const surfaceValuesStatus = useAppSelector(selectSurfaceValuesStatus);
  const loadingValues = surfaceValuesStatus === "loading";
  const [busy, setBusy] = useState(false);
  // Local copy of custom-scope assignments. Persisted on Save.
  const [localScopeIds, setLocalScopeIds] = useState<string[]>([]);

  // Hydrate persisted scope-assignment state for an EXISTING binding via the
  // canonical scopes module. `useEntityScopes` fetches once and dedupes
  // in-flight requests; passing `entityId: null` for the "new binding" case
  // short-circuits the fetch entirely.
  const entityScopes = useEntityScopes({
    entityType: SCOPE_ENTITY_TYPE,
    entityId: existing?.id ?? null,
    autoFetch: true,
  });
  const scopesHydrated =
    !existing ||
    entityScopes.status === "ready" ||
    entityScopes.status === "error";

  // Auto-default scopeId based on tier
  useEffect(() => {
    if (scope === AGENT_SCOPES.USER) {
      if (!scopeId && defaultUserId) setScopeId(defaultUserId);
    } else if (scope === AGENT_SCOPES.ORGANIZATION) {
      if (!scopeId && defaultOrgId) setScopeId(defaultOrgId);
    } else if (scope === AGENT_SCOPES.GLOBAL) {
      setScopeId(undefined);
    }
  }, [scope, defaultUserId, defaultOrgId, scopeId]);

  // Keep `clientName` in sync if `surfaceName` is set externally / on first open.
  useEffect(() => {
    const split = splitSurfaceName(surfaceName);
    if (split.client && split.client !== clientName) {
      setClientName(split.client);
    }
  }, [surfaceName, clientName]);

  // Hydrate this surface's declared values via the thunk (cached per
  // surface in `surfacesCatalogSlice`).
  useEffect(() => {
    if (!surfaceName) return;
    void dispatch(loadSurfaceValues({ surfaceName })).unwrap().catch((e) => {
      toast.error(
        e instanceof Error ? e.message : "Failed to load surface values",
      );
    });
  }, [dispatch, surfaceName]);

  // Once hydrated for an existing binding, copy the persisted assignments
  // into local state. Subsequent toggles update `localScopeIds` directly.
  const persistedScopeIds = existing
    ? entityScopes.scopeIds
    : EMPTY_STRING_ARRAY;
  useEffect(() => {
    if (!scopesHydrated || !existing) return;
    setLocalScopeIds((prev) => {
      const same =
        prev.length === persistedScopeIds.length &&
        prev.every((id) => persistedScopeIds.includes(id));
      return same ? prev : [...persistedScopeIds];
    });
    // We only want this to sync once after hydration completes; subsequent
    // toggles update localScopeIds directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopesHydrated, existing?.id]);

  // Surface options derived from current client choice
  const { availableClients, surfacesForClient } = useMemo(() => {
    const clients = Array.from(
      new Set(allSurfaces.map((s) => s.client_name)),
    ).sort();
    const forClient = clientName
      ? allSurfaces.filter((s) => s.client_name === clientName)
      : [];
    return {
      availableClients: clients,
      surfacesForClient: forClient.sort((a, b) =>
        splitSurfaceName(a.name).local.localeCompare(
          splitSurfaceName(b.name).local,
        ),
      ),
    };
  }, [allSurfaces, clientName]);

  const onSave = async () => {
    if (!surfaceName) {
      toast.error("Pick a surface");
      return;
    }
    if (
      (scope === AGENT_SCOPES.USER ||
        scope === AGENT_SCOPES.ORGANIZATION ||
        scope === AGENT_SCOPES.PROJECT ||
        scope === AGENT_SCOPES.TASK) &&
      !scopeId
    ) {
      toast.error("This scope tier requires an ID");
      return;
    }
    setBusy(true);
    try {
      const saved = await dispatch(
        upsertAgentSurfaceBindingThunk({
          agentId: agent.id,
          surfaceName,
          scope: {
            userId: scope === AGENT_SCOPES.USER ? (scopeId ?? null) : null,
            organizationId:
              scope === AGENT_SCOPES.ORGANIZATION ? (scopeId ?? null) : null,
            projectId:
              scope === AGENT_SCOPES.PROJECT ? (scopeId ?? null) : null,
            taskId: scope === AGENT_SCOPES.TASK ? (scopeId ?? null) : null,
          },
          valueMappings: mappings,
        }),
      ).unwrap();

      // Persist custom-scope assignments (M2M). Always write — even an empty
      // array — so the user can clear all tags from an existing binding.
      try {
        const res = await dispatch(
          setEntityScopes({
            entityType: SCOPE_ENTITY_TYPE,
            entityId: saved.id,
            scopeIds: localScopeIds,
          }),
        );
        if (!res.ok) {
          throw new Error(res.error ?? "Scope assignment write failed");
        }
      } catch (e) {
        // Don't block on scope-assignment failure — the binding itself saved.
        toast.error(
          e instanceof Error
            ? `Saved binding, but scope tags failed: ${e.message}`
            : "Saved binding, but scope tags failed",
        );
        onSaved();
        return;
      }

      toast.success(existing ? "Binding updated" : "Binding created");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {existing ? "Edit surface binding" : "New surface binding"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto space-y-4 pr-1">
          {/* Two-step client + surface picker */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Client</Label>
              <Select
                value={clientName}
                onValueChange={(v) => {
                  setClientName(v);
                  // Clear surface when client changes (unless we're editing).
                  if (!existing) setSurfaceName("");
                }}
                disabled={busy || !!existing}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Pick a client…" />
                </SelectTrigger>
                <SelectContent>
                  {availableClients.map((c) => (
                    <SelectItem key={c} value={c}>
                      <span className="font-mono text-xs">{c}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Surface</Label>
              <SurfacePicker
                value={surfaceName}
                onChange={setSurfaceName}
                surfaces={surfacesForClient}
                disabled={busy || !!existing || !clientName}
                placeholder={
                  clientName ? "Pick a surface…" : "Pick a client first"
                }
              />
            </div>
          </div>
          {existing && (
            <p className="text-[10px] text-muted-foreground -mt-2">
              Client & surface are fixed once a binding exists. Delete and
              re-create to change them.
            </p>
          )}

          {/* Scope tier */}
          <ShortcutScopePicker
            scope={scope}
            scopeId={scopeId}
            onScopeChange={(s, id) => {
              setScope(s);
              setScopeId(id);
            }}
            disabled={busy || !!existing}
          />
          {existing && (
            <p className="text-[10px] text-muted-foreground -mt-2">
              Scope tier is fixed once a binding exists. Delete and re-create to
              change it.
            </p>
          )}

          {/* Custom scope tags (M2M via scope-assignments) */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label className="text-xs">Custom scope tags</Label>
              {existing && !scopesHydrated && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
              {localScopeIds.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {localScopeIds.length} selected
                </Badge>
              )}
            </div>
            <EntityScopeTagger
              variant="compact"
              showHeader={false}
              allowMultiPerType
              value={localScopeIds}
              onChange={setLocalScopeIds}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label className="text-xs">
                Variable & context-slot mappings
              </Label>
              {loadingValues && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
            </div>
            <ValueMappingEditor
              targets={targets}
              value={mappings}
              onChange={setMappings}
              availableSurfaceValues={surfaceValues}
              disabled={busy}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void onSave()} disabled={busy || !surfaceName}>
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : existing ? (
              "Save"
            ) : (
              "Create binding"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Stable empty array ref for the selector fallback.
const EMPTY_STRING_ARRAY: string[] = [];

// ─────────────────────────────────────────────────────────────────────────────
// Surface picker — searchable Select limited to the chosen client
// ─────────────────────────────────────────────────────────────────────────────

function SurfacePicker({
  value,
  onChange,
  surfaces,
  disabled,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  surfaces: SurfaceWithStats[];
  disabled: boolean;
  placeholder: string;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return surfaces;
    return surfaces.filter((s) => {
      const local = splitSurfaceName(s.name).local.toLowerCase();
      return (
        local.includes(q) || (s.description?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [surfaces, search]);

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="text-sm">
        <SelectValue placeholder={placeholder}>
          {value ? splitSurfaceName(value).local : null}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <div className="sticky top-0 z-10 bg-popover border-b border-border p-1.5">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              className="h-7 pl-7 text-xs"
              style={{ fontSize: "16px" }}
            />
          </div>
        </div>
        {filtered.length === 0 && (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            No surfaces match
          </div>
        )}
        {filtered.map((s) => (
          <SelectItem key={s.name} value={s.name}>
            <div className="flex flex-col items-start">
              <span className="font-medium text-xs">
                {splitSurfaceName(s.name).local}
              </span>
              {s.description && (
                <span className="text-[10px] text-muted-foreground line-clamp-1">
                  {s.description}
                </span>
              )}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// CustomScopeSection retired in favour of `<EntityScopeTagger />` in
// controlled mode — see the BindingEditorDialog above. Removing the local
// rebuilds the canonical Surface B picker and drops the legacy
// scopeTypesSlice / scopesSlice / scopeAssignmentsSlice imports.

// ─────────────────────────────────────────────────────────────────────────────
// CreateShortcutFromBindingDialog
//
// Throwaway plumbing UI: lets the agent admin call the new
// `create_shortcut_from_agent_surface` RPC and verify the round-trip while
// the new editor is still being built. Lives here so the deletion is a
// single-block change later.
// ─────────────────────────────────────────────────────────────────────────────

function CreateShortcutFromBindingDialog({
  agentName,
  binding,
  defaultUserId,
  onClose,
}: {
  agentName: string;
  binding: AgentSurfaceBinding;
  defaultUserId: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  // Categories are scope-keyed; the user-scope tree covers personal
  // categories (the only place a freshly-seeded shortcut goes today).
  const { categories } = useAgentShortcuts({ scope: "user" });
  const crud = useAgentShortcutCrud({ scope: "user" });
  const [categoryId, setCategoryId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // Default to the first available category once the tree loads.
  useEffect(() => {
    if (!categoryId && categories.length > 0) {
      setCategoryId(categories[0].id);
    }
  }, [categoryId, categories]);

  const onCreate = async () => {
    if (!categoryId) {
      toast.error("Pick a category");
      return;
    }
    setBusy(true);
    try {
      const newId = await crud.createShortcutFromAgentSurface({
        agentSurfaceId: binding.id,
        categoryId,
        userId: defaultUserId ?? undefined,
      });
      toast.success("Shortcut created");
      onClose();
      router.push(`/agents/shortcuts/edit/${newId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create shortcut from binding</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1 pb-2">
          <div className="rounded-md border border-dashed border-border bg-background px-3 py-2 text-[11px] text-muted-foreground">
            Seeds a new personal shortcut for{" "}
            <span className="font-medium text-foreground">{agentName}</span>{" "}
            on{" "}
            <span className="font-mono text-[10px] text-foreground">
              {binding.surfaceName}
            </span>
            . Copies the binding&rsquo;s value mappings; you can edit them
            after.
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Category</Label>
            <CategorySelect
              categories={categories}
              value={categoryId}
              onValueChange={setCategoryId}
              placeholder="Pick a category…"
              disabled={busy || categories.length === 0}
            />
            {categories.length === 0 && (
              <p className="text-[10px] text-destructive">
                No user-scope categories available. Create one first.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => void onCreate()}
            disabled={busy || !categoryId}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
