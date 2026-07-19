"use client";

/**
 * SurfaceAgentBindPanel — surface-first "add my agent here" composer.
 *
 * Fixed `surfaceName` → pick an agent → pick scope → map surface values to
 * the agent's variables / context slots → save.
 *
 * Reuses AgentListInlinePicker, ShortcutScopePicker, SurfaceVariableBindingList.
 *  * (the retired junction is gone — associations are the only path).
 *
 * Drop this into any surface UI, or open it via SurfaceAgentBindWindow.
 */

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  AGENT_SCOPES,
  type AgentScope,
} from "@/features/agent-shortcuts/constants";
import { ShortcutScopePicker } from "@/features/agent-shortcuts/components/ShortcutScopePicker";
import { AgentListInlinePicker } from "@/features/agents/components/agent-listings/AgentListInlinePicker";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import {
  selectAgentById,
  selectAgentExecutionPayload,
} from "@/features/agents/redux/agent-definition/selectors";
import { SurfaceVariableBindingList } from "@/features/surfaces/admin/columns/SurfaceVariableBinding";
import { GlobalBindAgentGuard } from "@/features/surfaces/components/bind/GlobalBindAgentGuard";
import { BASELINE_VALUES } from "@/features/surfaces/manifests/_baseline.manifest";
import { buildBindingTargets } from "@/features/surfaces/utils/buildBindingTargets";
import { loadSurfaceValues } from "@/features/surfaces/redux/thunks";
import {
  makeSelectSurfaceValues,
  makeSelectSurfaceValuesStatus,
} from "@/features/surfaces/redux/selectors";
import {
  bindAgentToSurface,
  listAgentSurfaceBindings,
} from "@/features/surfaces/services/bind-agent-to-surface.service";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import type {
  SurfaceValue,
  ValueMapping,
  ValueMappingMap,
} from "@/features/surfaces/types";
import type { RootState } from "@/lib/redux/store";
import { cn } from "@/lib/utils";

const DEFAULT_SURFACE_NAME = "matrx-default/default";
const PICKER_CONSUMER_ID = "surface-agent-bind-panel";

export interface SurfaceAgentBindResult {
  bindingId: string;
  agentId: string;
  surfaceName: string;
}

export interface SurfaceAgentBindPanelProps {
  /** Registered ui_surface.name this bind targets. */
  surfaceName: string;
  /** Optional pre-selected agent (skips the picker step). */
  initialAgentId?: string | null;
  /**
   * When true with `initialAgentId`, hide "Change agent" — used when the
   * host already fixed the agent (e.g. Agent Settings → Surface tab).
   */
  lockAgent?: boolean;
  /** Pretty label for the surface (falls back to the local name segment). */
  surfaceLabel?: string | null;
  onBound?: (result: SurfaceAgentBindResult) => void;
  onCancel?: () => void;
  className?: string;
}

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

function cloneMappings(map: ValueMappingMap): ValueMappingMap {
  const out: ValueMappingMap = {};
  for (const [k, v] of Object.entries(map)) {
    out[k] = structuredClone(v) as ValueMapping;
  }
  return out;
}

export function SurfaceAgentBindPanel({
  surfaceName,
  initialAgentId = null,
  lockAgent = false,
  surfaceLabel = null,
  onBound,
  onCancel,
  className,
}: SurfaceAgentBindPanelProps) {
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

  const [agentId, setAgentId] = useState<string | null>(initialAgentId);
  const [scope, setScope] = useState<AgentScope>(AGENT_SCOPES.USER);
  const [scopeId, setScopeId] = useState<string | undefined>(
    currentUserId ?? undefined,
  );
  const [mappings, setMappings] = useState<ValueMappingMap>({});
  const [busy, setBusy] = useState(false);
  const [guardOpen, setGuardOpen] = useState(false);
  const [seededForAgent, setSeededForAgent] = useState<string | null>(null);
  const [assocBindings, setAssocBindings] = useState<
    Array<{
      id: string;
      surfaceName: string;
      userId: string | null;
      valueMappings: ValueMappingMap;
    }>
  >([]);
  const [bindingsLoadedFor, setBindingsLoadedFor] = useState<string | null>(
    null,
  );

  const agent = useAppSelector((s: RootState) =>
    agentId ? selectAgentById(s, agentId) : undefined,
  );
  const executionPayload = useAppSelector((s: RootState) =>
    agentId
      ? selectAgentExecutionPayload(s, agentId)
      : { isReady: false as const },
  );

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

  // Hydrate surface values + agent execution payload when agent is chosen.
  useEffect(() => {
    void dispatch(loadSurfaceValues({ surfaceName }));
  }, [dispatch, surfaceName]);

  useEffect(() => {
    if (!agentId) return;
    void dispatch(fetchAgentExecutionMinimal(agentId));
    let cancelled = false;
    void listAgentSurfaceBindings(agentId)
      .then((rows) => {
        if (cancelled) return;
        setAssocBindings(rows);
        setBindingsLoadedFor(agentId);
      })
      .catch((err) => {
        console.error(
          "[SurfaceAgentBindPanel] failed to load association bindings",
          err,
        );
        if (!cancelled) {
          setAssocBindings([]);
          setBindingsLoadedFor(agentId);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, agentId]);

  // Keep personal scope id in sync with the signed-in user.
  useEffect(() => {
    if (scope === AGENT_SCOPES.USER && !scopeId && currentUserId) {
      setScopeId(currentUserId);
    } else if (
      scope === AGENT_SCOPES.ORGANIZATION &&
      !scopeId &&
      currentOrgId
    ) {
      setScopeId(currentOrgId);
    } else if (scope === AGENT_SCOPES.GLOBAL) {
      setScopeId(undefined);
    }
  }, [scope, scopeId, currentUserId, currentOrgId]);

  // Seed mappings once per agent after association bindings load.
  useEffect(() => {
    if (!agentId || seededForAgent === agentId) return;
    if (bindingsLoadedFor !== agentId) return;

    const forSurface = assocBindings.filter(
      (b) => b.surfaceName === surfaceName,
    );
    const existing =
      forSurface.find((b) => b.userId && b.userId === currentUserId) ??
      forSurface[0] ??
      null;
    if (existing) {
      setMappings(cloneMappings(existing.valueMappings));
      setSeededForAgent(agentId);
      return;
    }

    const defaultBinding = assocBindings.find(
      (b) => b.surfaceName === DEFAULT_SURFACE_NAME,
    );
    if (defaultBinding?.valueMappings) {
      setMappings(cloneMappings(defaultBinding.valueMappings));
    } else {
      setMappings({});
    }
    setSeededForAgent(agentId);
  }, [
    agentId,
    assocBindings,
    bindingsLoadedFor,
    currentUserId,
    seededForAgent,
    surfaceName,
  ]);

  const availableSurfaceValues = useMemo<SurfaceValue[]>(() => {
    const byName = new Map<string, SurfaceValue>();
    for (const v of Object.values(BASELINE_VALUES)) byName.set(v.name, v);
    for (const v of surfaceValues) byName.set(v.name, v);
    return Array.from(byName.values()).sort(
      (a, b) => (a.sortOrder ?? 1000) - (b.sortOrder ?? 1000),
    );
  }, [surfaceValues]);

  const targets = useMemo(() => {
    if (!agent) return [];
    return buildBindingTargets(agent);
  }, [agent]);

  const displaySurface =
    surfaceLabel?.trim() || prettifySurfaceLocal(surfaceName);

  const handleSelectAgent = (id: string) => {
    setAgentId(id);
    setSeededForAgent(null);
    setMappings({});
  };

  const handleBackToPicker = () => {
    setAgentId(null);
    setSeededForAgent(null);
    setMappings({});
  };

  const handleSave = async () => {
    if (!agentId) {
      toast.error("Pick an agent first");
      return;
    }
    const needsId =
      scope === AGENT_SCOPES.USER ||
      scope === AGENT_SCOPES.ORGANIZATION ||
      scope === AGENT_SCOPES.PROJECT ||
      scope === AGENT_SCOPES.TASK;
    if (needsId && !scopeId) {
      toast.error("This scope tier requires a selection");
      return;
    }
    // Global tier: run the lineage/visibility awareness gate first. The guard
    // auto-proceeds for builtin agents and otherwise routes the decision
    // (use system twin / Linked Agent Sync / continue) back through doSave.
    if (scope === AGENT_SCOPES.GLOBAL) {
      setGuardOpen(true);
      return;
    }
    await doSave(agentId);
  };

  const doSave = async (bindAgentId: string) => {
    setBusy(true);
    try {
      const bindScope = {
        userId: scope === AGENT_SCOPES.USER ? (scopeId ?? null) : null,
        organizationId:
          scope === AGENT_SCOPES.ORGANIZATION ? (scopeId ?? null) : null,
        projectId: scope === AGENT_SCOPES.PROJECT ? (scopeId ?? null) : null,
        taskId: scope === AGENT_SCOPES.TASK ? (scopeId ?? null) : null,
      };
      // Explicit picker org when Org-scoped; otherwise personal/active org
      // only as assoc_add access key (tier still comes from bindScope).
      const accessOrgId = await ensureOrgId(bindScope.organizationId);
      const saved = await bindAgentToSurface({
        agentId: bindAgentId,
        surfaceName,
        scope: bindScope,
        valueMappings: mappings,
        accessOrgId,
      });
      toast.success(`Bound to ${displaySurface}`);
      onBound?.({
        bindingId: saved.associationId,
        agentId: bindAgentId,
        surfaceName,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save binding");
    } finally {
      setBusy(false);
    }
  };

  // ── Step 1: pick agent ──────────────────────────────────────────────────
  if (!agentId) {
    return (
      <div className={cn("flex h-full min-h-0 flex-col", className)}>
        <div className="shrink-0 border-b border-border px-4 py-3">
          <p className="text-sm font-medium text-foreground">
            Add an agent to {displaySurface}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Pick an agent, then map this surface&apos;s values to its variables
            and context slots.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <AgentListInlinePicker
            consumerId={PICKER_CONSUMER_ID}
            onSelect={handleSelectAgent}
            className="h-full"
          />
        </div>
        {onCancel && (
          <div className="shrink-0 border-t border-border px-4 py-2.5 flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ── Step 2: scope + mappings ────────────────────────────────────────────
  const agentReady = executionPayload.isReady;
  const agentName = agent?.name ?? "Agent";
  const agentLocked = lockAgent && !!initialAgentId;

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="shrink-0 border-b border-border px-4 py-3 space-y-2">
        {!agentLocked && (
          <button
            type="button"
            onClick={handleBackToPicker}
            disabled={busy}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Change agent
          </button>
        )}
        <div className="flex items-start gap-2">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <Link2 className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {agentName}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Mapping values from{" "}
              <span className="font-medium text-foreground">
                {displaySurface}
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-5">
        <ShortcutScopePicker
          scope={scope}
          scopeId={scopeId}
          onScopeChange={(s, id) => {
            setScope(s);
            setScopeId(id);
          }}
          disabled={busy}
        />

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Map surface values
            </Label>
            {(loadingValues || !agentReady) && (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            )}
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            For each agent variable or context slot, choose what this surface
            should supply — or leave the agent&apos;s default / prompt the user.
          </p>
          {!agentReady ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading agent contract…
            </div>
          ) : targets.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
              This agent has no variables or context slots to map. You can still
              bind it — it will appear on the surface with no wired inputs.
            </p>
          ) : (
            <SurfaceVariableBindingList
              targets={targets}
              value={mappings}
              availableSurfaceValues={availableSurfaceValues}
              disabled={busy}
              onChange={setMappings}
            />
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border px-4 py-2.5 flex items-center justify-end gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          onClick={() => void handleSave()}
          disabled={busy || !agentReady}
        >
          {busy ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Saving…
            </>
          ) : agentLocked ? (
            "Save binding"
          ) : (
            "Bind agent"
          )}
        </Button>
      </div>

      {agentId && (
        <GlobalBindAgentGuard
          open={guardOpen}
          agentId={agentId}
          onProceed={(id) => {
            setGuardOpen(false);
            void doSave(id);
          }}
          onUseSystemTwin={(twin) => {
            setGuardOpen(false);
            toast.info(`Binding system agent "${twin.name}" instead`);
            void doSave(twin.id);
          }}
          onCancel={() => setGuardOpen(false)}
        />
      )}
    </div>
  );
}
