"use client";

import { useEffect, useMemo, useState } from "react";
import { Inbox, Loader2, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  AGENT_SCOPES,
  type AgentScope,
} from "@/features/agent-shortcuts/constants";
import { ShortcutScopePicker } from "@/features/agent-shortcuts/components/ShortcutScopePicker";
import {
  SurfaceVariableBindingList,
  type BindingTarget,
} from "./SurfaceVariableBinding";
import { BASELINE_VALUES } from "@/features/surfaces/manifests/_baseline.manifest";
import type { SurfaceValue, ValueMapping } from "@/features/surfaces/types";

/**
 * Singleton "Default" surface (sentinel). The user's binding on this
 * surface for a given agent becomes the seed for every NEW binding on
 * any other surface. Editing it later doesn't retroactively touch
 * existing bindings — it only shapes future ones.
 */
const DEFAULT_SURFACE_NAME = "matrx-default/default";
import {
  loadBindingsForAgent,
  loadSurfaceValues,
  upsertAgentSurfaceBindingThunk,
  deleteAgentSurfaceBindingThunk,
} from "@/features/surfaces/redux/thunks";
import {
  makeSelectBindingsForAgent,
  makeSelectSurfaceValues,
  makeSelectSurfaceValuesStatus,
  selectAllSurfaces,
} from "@/features/surfaces/redux/selectors";
import type { ValueMappingMap } from "@/features/surfaces/types";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useSurfacesAdminSelection } from "../useSurfacesAdminSelection";

function prettifySurfaceLocal(fullName: string): string {
  const local =
    fullName.indexOf("/") >= 0
      ? fullName.slice(fullName.indexOf("/") + 1)
      : fullName;
  return local
    .split(/[-_]/g)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Column 3 — Binding form (the center / main column).
 *
 * Three states:
 *   • no surface selected            → empty hint, pick a surface
 *   • surface selected, no binding   → "new binding" form pre-targeted at this surface
 *   • surface + binding selected     → edit form for the existing binding
 *
 * The center column intentionally stays mounted across selection changes
 * — switching `?surface=` or `?binding=` re-keys the local form state but
 * leaves the resizable layout untouched.
 */
export function BindingColumn({ agent }: { agent: AgentDefinition }) {
  const { surfaceName, bindingId, selectBinding, selectSurface } =
    useSurfacesAdminSelection();
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

  const selectBindings = useMemo(
    () => makeSelectBindingsForAgent(agent.id),
    [agent.id],
  );
  const allBindings = useAppSelector(selectBindings);

  // The binding being edited. Resolution order:
  //   1. An explicit `?binding=<id>` selection (drilled in from a binding row).
  //   2. Auto-adopt: if a surface is selected but no binding id is in the URL
  //      and that surface ALREADY has a binding for this agent, edit the real
  //      row instead of opening a seeded "new" form. Without this, selecting a
  //      bound surface from the left list showed the Default seed and a Save
  //      silently OVERWROTE the surface's real binding (the cross-surface leak).
  //      Prefer the current user's scope row, else the first.
  const existing = useMemo(() => {
    if (bindingId) {
      return allBindings.find((b) => b.id === bindingId) ?? null;
    }
    if (!surfaceName) return null;
    const forSurface = allBindings.filter((b) => b.surfaceName === surfaceName);
    if (forSurface.length === 0) return null;
    return (
      forSurface.find((b) => b.userId && b.userId === currentUserId) ??
      forSurface[0]
    );
  }, [allBindings, bindingId, surfaceName, currentUserId]);

  // The user's binding on the singleton Default surface — used as the
  // seed for every NEW binding on a different surface. Editing this
  // doesn't retroactively change anything that's already saved.
  const defaultBinding = useMemo(
    () =>
      allBindings.find((b) => b.surfaceName === DEFAULT_SURFACE_NAME) ?? null,
    [allBindings],
  );

  // Make sure bindings are loaded for this agent.
  useEffect(() => {
    void dispatch(loadBindingsForAgent({ agentId: agent.id }));
  }, [dispatch, agent.id]);

  if (!surfaceName) {
    return (
      <EmptyState
        title="Pick a surface"
        body="Choose a surface from the left column to view its bindings or create a new one."
      />
    );
  }

  // Seed only when (a) we're creating a new binding (no `existing`),
  // (b) the surface has NO binding of its own for this agent — the seed is a
  //     pure UI starting point and must never shadow or risk overwriting a
  //     real binding,
  // (c) the surface being bound isn't the Default surface itself, and
  // (d) the user actually has a Default binding to seed from.
  const surfaceHasBinding = allBindings.some(
    (b) => b.surfaceName === surfaceName,
  );
  const seedMappings =
    !existing &&
    !surfaceHasBinding &&
    surfaceName !== DEFAULT_SURFACE_NAME &&
    defaultBinding?.valueMappings
      ? defaultBinding.valueMappings
      : null;

  return (
    <BindingForm
      key={`${surfaceName}::${bindingId ?? "new"}`}
      agent={agent}
      surfaceName={surfaceName}
      existing={existing}
      seedMappings={seedMappings}
      defaultUserId={currentUserId}
      defaultOrgId={currentOrgId}
      onSaved={(id) => selectBinding(id)}
      onDeleted={() => selectBinding(null)}
      onCancel={() => (existing ? selectBinding(null) : selectSurface(null))}
      onDispatch={dispatch}
    />
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center bg-background pt-[var(--shell-header-h)] px-6">
      <div className="rounded-full bg-muted p-3 mb-3">
        <Inbox className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground text-center max-w-xs">
        {body}
      </p>
    </div>
  );
}

export function buildBindingTargets(agent: AgentDefinition): BindingTarget[] {
  const targets: BindingTarget[] = [];
  const seen = new Set<string>();
  for (const v of agent.variableDefinitions ?? []) {
    if (seen.has(v.name)) continue;
    seen.add(v.name);
    targets.push({
      name: v.name,
      description: v.helpText,
      required: v.required ?? false,
      defaultValue: v.defaultValue,
    });
  }
  for (const slot of agent.contextSlots ?? []) {
    if (seen.has(slot.key)) continue;
    seen.add(slot.key);
    targets.push({
      name: slot.key,
      label: slot.label,
      description: slot.description,
    });
  }
  return targets;
}

interface BindingFormProps {
  agent: AgentDefinition;
  surfaceName: string;
  existing:
    | import("@/features/surfaces/services/agent-surface-bindings.service").AgentSurfaceBinding
    | null;
  /**
   * Mappings to seed the form with when creating a new binding. Sourced
   * from the user's Default-surface binding so they don't restart from
   * scratch every time. Null for edit mode and for the Default surface
   * itself.
   */
  seedMappings: ValueMappingMap | null;
  defaultUserId: string | null;
  defaultOrgId: string | null;
  onSaved: (bindingId: string) => void;
  onDeleted: () => void;
  onCancel: () => void;
  onDispatch: ReturnType<typeof useAppDispatch>;
}

function cloneMapping(m: ValueMapping): ValueMapping {
  // Deep clone: `direct_value.target` / `prompt_user.defaultValue` are
  // `unknown` and may hold objects/arrays. A shallow spread would share those
  // nested references with the Redux-held Default binding, so editing a
  // seeded form could mutate it. structuredClone severs every reference.
  return structuredClone(m);
}

function cloneMappings(map: ValueMappingMap): ValueMappingMap {
  const out: ValueMappingMap = {};
  for (const [k, v] of Object.entries(map)) {
    out[k] = cloneMapping(v);
  }
  return out;
}

function BindingForm({
  agent,
  surfaceName,
  existing,
  seedMappings,
  defaultUserId,
  defaultOrgId,
  onSaved,
  onDeleted,
  onCancel,
  onDispatch,
}: BindingFormProps) {
  const dispatch = onDispatch;

  const initialScope: AgentScope = existing
    ? existing.userId
      ? AGENT_SCOPES.USER
      : existing.organizationId
        ? AGENT_SCOPES.ORGANIZATION
        : existing.projectId
          ? AGENT_SCOPES.PROJECT
          : existing.taskId
            ? AGENT_SCOPES.TASK
            : AGENT_SCOPES.GLOBAL
    : AGENT_SCOPES.USER;
  const initialScopeId = existing
    ? (existing.userId ??
      existing.organizationId ??
      existing.projectId ??
      existing.taskId ??
      undefined)
    : (defaultUserId ?? undefined);

  const [scope, setScope] = useState<AgentScope>(initialScope);
  const [scopeId, setScopeId] = useState<string | undefined>(initialScopeId);
  const [mappings, setMappings] = useState<ValueMappingMap>(() => {
    if (existing) return cloneMappings(existing.valueMappings);
    if (seedMappings) return cloneMappings(seedMappings);
    return {};
  });
  const [busy, setBusy] = useState(false);

  // Auto-pick scope id when scope tier changes
  useEffect(() => {
    if (scope === AGENT_SCOPES.USER && !scopeId && defaultUserId) {
      setScopeId(defaultUserId);
    } else if (
      scope === AGENT_SCOPES.ORGANIZATION &&
      !scopeId &&
      defaultOrgId
    ) {
      setScopeId(defaultOrgId);
    } else if (scope === AGENT_SCOPES.GLOBAL) {
      setScopeId(undefined);
    }
  }, [scope, scopeId, defaultUserId, defaultOrgId]);

  // Hydrate this surface's declared values into Redux (cached per surface).
  useEffect(() => {
    void dispatch(loadSurfaceValues({ surfaceName }))
      .unwrap()
      .catch((e) => {
        toast.error(
          e instanceof Error ? e.message : "Failed to load surface values",
        );
      });
  }, [dispatch, surfaceName]);

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

  // Merge baseline values (Selection, Content, Context, Text Before / After)
  // into the picker so variables named after them auto-bind even when this
  // specific surface hasn't redeclared them. Surface-declared values win on
  // name conflict.
  const availableSurfaceValues = useMemo<SurfaceValue[]>(() => {
    const byName = new Map<string, SurfaceValue>();
    for (const v of Object.values(BASELINE_VALUES)) byName.set(v.name, v);
    for (const v of surfaceValues) byName.set(v.name, v);
    return Array.from(byName.values()).sort(
      (a, b) => (a.sortOrder ?? 1000) - (b.sortOrder ?? 1000),
    );
  }, [surfaceValues]);

  const targets = useMemo(() => buildBindingTargets(agent), [agent]);

  const onSave = async () => {
    const scopeTierNeedsId =
      scope === AGENT_SCOPES.USER ||
      scope === AGENT_SCOPES.ORGANIZATION ||
      scope === AGENT_SCOPES.PROJECT ||
      scope === AGENT_SCOPES.TASK;
    if (scopeTierNeedsId && !scopeId) {
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
      toast.success(existing ? "Binding updated" : "Binding created");
      onSaved(saved.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!existing) return;
    const ok = await confirm({
      title: "Remove binding?",
      description:
        "Auto-binding by matching variable name will still occur, but explicit mappings on this row are lost.",
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await dispatch(
        deleteAgentSurfaceBindingThunk({ bindingId: existing.id }),
      ).unwrap();
      toast.success("Binding removed");
      onDeleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <BindingFormLayout
      surfaceName={surfaceName}
      existing={existing}
      busy={busy}
      onSave={() => void onSave()}
      onDelete={existing ? () => void onDelete() : null}
      onCancel={onCancel}
    >
      <div className="space-y-5">
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
          <p className="-mt-3 text-[11px] text-muted-foreground">
            Scope is fixed once a binding exists. Delete and re-create to change
            it.
          </p>
        )}

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Mappings
            </Label>
            {loadingValues && (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            )}
          </div>
          <SurfaceVariableBindingList
            targets={targets}
            value={mappings}
            availableSurfaceValues={availableSurfaceValues}
            disabled={busy}
            onChange={setMappings}
          />
        </div>
      </div>
    </BindingFormLayout>
  );
}

function BindingFormLayout({
  surfaceName,
  existing,
  busy,
  onSave,
  onDelete,
  onCancel,
  children,
}: {
  surfaceName: string;
  existing:
    | import("@/features/surfaces/services/agent-surface-bindings.service").AgentSurfaceBinding
    | null;
  busy: boolean;
  onSave: () => void;
  onDelete: (() => void) | null;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  const allSurfaces = useAppSelector(selectAllSurfaces);
  const surface = useMemo(
    () => allSurfaces.find((s) => s.name === surfaceName) ?? null,
    [allSurfaces, surfaceName],
  );

  return (
    <div className="h-full flex flex-col bg-background pt-[var(--shell-header-h)]">
      {/* Surface header — pretty name + description, no slash-path. */}
      <header className="shrink-0 px-6 pt-5 pb-4 border-b border-border">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          Configuring
        </div>
        <h2 className="mt-1 text-xl font-semibold text-foreground leading-tight">
          {prettifySurfaceLocal(surfaceName)}
        </h2>
        {surface?.description ? (
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-2xl">
            {surface.description}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground/70 italic">
            No description provided for this surface.
          </p>
        )}
      </header>

      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-auto px-6 py-5">{children}</div>

      {/* Sticky action footer */}
      <footer className="shrink-0 px-6 py-3 border-t border-border bg-background flex items-center gap-2">
        {onDelete && (
          <Button
            variant="ghost"
            onClick={onDelete}
            disabled={busy}
            className="h-9 gap-1.5 text-sm text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={busy}
            className="h-9 text-sm"
          >
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={busy}
            className="h-9 gap-1.5 text-sm min-w-[110px]"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {existing ? "Save" : "Create binding"}
          </Button>
        </div>
      </footer>
    </div>
  );
}
