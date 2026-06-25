"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  Layers,
  Loader2,
  Rocket,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  AGENT_SCOPES,
  type AgentScope,
} from "@/features/agent-shortcuts/constants";
import { ShortcutScopePicker } from "@/features/agent-shortcuts/components/ShortcutScopePicker";
import {
  BatchSurfaceSelector,
  type UpdateCandidate,
} from "@/features/agent-shortcuts/components/batch/BatchSurfaceSelector";

import { SurfaceVariableBindingList } from "@/features/surfaces/admin/columns/SurfaceVariableBinding";
import { buildBindingTargets } from "@/features/surfaces/admin/columns/BindingColumn";
import { BASELINE_VALUES } from "@/features/surfaces/manifests/_baseline.manifest";
import {
  loadSurfaces,
  loadBindingsForAgent,
  bulkUpsertAgentSurfaceBindingsThunk,
} from "@/features/surfaces/redux/thunks";
import {
  makeSelectBindingsForAgent,
  selectActiveSurfaces,
  selectSurfacesStatus,
} from "@/features/surfaces/redux/selectors";
import type { AgentSurfaceBinding } from "@/features/surfaces/services/agent-surface-bindings.service";
import type { SurfaceValue, ValueMappingMap } from "@/features/surfaces/types";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";

const BLANK = "blank";

function splitSurfaceLocal(fullName: string): string {
  const idx = fullName.indexOf("/");
  const local = idx >= 0 ? fullName.slice(idx + 1) : fullName;
  return local
    .split(/[-_]/g)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function scopeLabel(b: AgentSurfaceBinding): string {
  if (b.userId) return "Personal";
  if (b.organizationId) return "Organization";
  if (b.projectId) return "Project";
  if (b.taskId) return "Task";
  return "Global";
}

/** True if a binding already lives at the exact scope tier the batch targets. */
function bindingMatchesScope(
  b: AgentSurfaceBinding,
  scope: AgentScope,
  scopeId: string | undefined,
): boolean {
  switch (scope) {
    case AGENT_SCOPES.USER:
      return b.userId === scopeId;
    case AGENT_SCOPES.ORGANIZATION:
      return b.organizationId === scopeId;
    case AGENT_SCOPES.PROJECT:
      return b.projectId === scopeId;
    case AGENT_SCOPES.TASK:
      return b.taskId === scopeId;
    default:
      return (
        !b.userId && !b.organizationId && !b.projectId && !b.taskId
      );
  }
}

/**
 * Batch surface-binding editor.
 *
 * Apply ONE set of value-mappings (optionally copied from an existing binding)
 * to many surfaces at once, at a single scope tier. Each surface is written as
 * an independent single-row upsert (see `bulkUpsertAgentSurfaceBindings`) — so
 * "batch" never means one save bleeding into another; every surface still
 * stands on its own.
 */
export function SurfaceBindingsBatchEditor({
  agent,
  basePath = "/agents",
}: {
  agent: AgentDefinition;
  /** Base path for the "View bindings" link. `/agents` for core; admin passes
   *  its system-agents base so navigation stays in the admin shell. */
  basePath?: string;
}) {
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
  const bindings = useAppSelector(selectBindings);
  const surfaces = useAppSelector(selectActiveSurfaces);
  const surfacesStatus = useAppSelector(selectSurfacesStatus);

  // ── Hydration ─────────────────────────────────────────────────────────────
  useEffect(() => {
    void dispatch(loadSurfaces());
    void dispatch(loadBindingsForAgent({ agentId: agent.id }));
  }, [dispatch, agent.id]);

  // ── Editor state ───────────────────────────────────────────────────────────
  const [templateId, setTemplateId] = useState<string>(BLANK);
  const [scope, setScope] = useState<AgentScope>(AGENT_SCOPES.USER);
  const [scopeId, setScopeId] = useState<string | undefined>(
    currentUserId ?? undefined,
  );
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [sharedMappings, setSharedMappings] = useState<ValueMappingMap>({});
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{
    created: number;
    updated: number;
    failed: { surfaceName: string; error: string }[];
  } | null>(null);

  // Default the scope id once the user / org ids hydrate.
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

  const targets = useMemo(() => buildBindingTargets(agent), [agent]);

  // The shared editor lists only the universal baseline values (Selection,
  // Content, Context, Text Before / After) — the batch spans many surfaces, so
  // there is no single surface's declared values to show.
  const availableSurfaceValues = useMemo<SurfaceValue[]>(
    () =>
      Object.values(BASELINE_VALUES).sort((a, b) => a.sortOrder - b.sortOrder),
    [],
  );

  const existingSurfaceNames = useMemo(
    () => new Set(bindings.map((b) => b.surfaceName)),
    [bindings],
  );

  // Copy-template + update candidates — every existing binding for this agent.
  const templateCandidates = useMemo(
    () =>
      [...bindings].sort((a, b) =>
        a.surfaceName.localeCompare(b.surfaceName),
      ),
    [bindings],
  );
  const updateCandidates = useMemo<UpdateCandidate[]>(
    () =>
      bindings
        .filter((b) => b.id !== templateId)
        .map((b) => ({
          shortcutId: b.id,
          label: `${splitSurfaceLocal(b.surfaceName)} · ${scopeLabel(b)}`,
          surfaceName: b.surfaceName,
        })),
    [bindings, templateId],
  );
  const templateSurfaceName = useMemo(() => {
    if (templateId === BLANK) return null;
    return bindings.find((b) => b.id === templateId)?.surfaceName ?? null;
  }, [templateId, bindings]);

  const onTemplateChange = (id: string) => {
    setTemplateId(id);
    setResult(null);
    if (id === BLANK) {
      setSharedMappings({});
      return;
    }
    const b = bindings.find((x) => x.id === id);
    setSharedMappings(b ? structuredClone(b.valueMappings) : {});
  };

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  // Selected keys → unique target surface names (a surface may be selected via
  // both its "create" and "update" rows; dedupe so we write it once).
  const targetSurfaceNames = useMemo(() => {
    const names = new Set<string>();
    for (const key of selectedKeys) {
      if (key.startsWith("create:")) {
        names.add(key.slice("create:".length));
      } else if (key.startsWith("update:")) {
        const id = key.slice("update:".length);
        const b = bindings.find((x) => x.id === id);
        if (b) names.add(b.surfaceName);
      }
    }
    return names;
  }, [selectedKeys, bindings]);

  const scopeNeedsId =
    scope === AGENT_SCOPES.USER ||
    scope === AGENT_SCOPES.ORGANIZATION ||
    scope === AGENT_SCOPES.PROJECT ||
    scope === AGENT_SCOPES.TASK;

  const onApply = async () => {
    if (targetSurfaceNames.size === 0) {
      toast.error("Select at least one surface");
      return;
    }
    if (scopeNeedsId && !scopeId) {
      toast.error("This scope tier requires an ID");
      return;
    }

    const scopeInput = {
      userId: scope === AGENT_SCOPES.USER ? (scopeId ?? null) : null,
      organizationId:
        scope === AGENT_SCOPES.ORGANIZATION ? (scopeId ?? null) : null,
      projectId: scope === AGENT_SCOPES.PROJECT ? (scopeId ?? null) : null,
      taskId: scope === AGENT_SCOPES.TASK ? (scopeId ?? null) : null,
    };

    // Pre-classify: which targets already have a binding at THIS scope tier
    // (so the toast can report created vs updated honestly).
    const updatedBefore = new Set(
      Array.from(targetSurfaceNames).filter((name) =>
        bindings.some(
          (b) =>
            b.surfaceName === name &&
            bindingMatchesScope(b, scope, scopeId),
        ),
      ),
    );

    const payload = Array.from(targetSurfaceNames).map((surfaceName) => ({
      surfaceName,
      scope: scopeInput,
      valueMappings: structuredClone(sharedMappings),
    }));

    setApplying(true);
    setResult(null);
    try {
      const res = await dispatch(
        bulkUpsertAgentSurfaceBindingsThunk({
          agentId: agent.id,
          bindings: payload,
        }),
      ).unwrap();

      let created = 0;
      let updated = 0;
      for (const b of res.succeeded) {
        if (updatedBefore.has(b.surfaceName)) updated += 1;
        else created += 1;
      }
      setResult({ created, updated, failed: res.failed });

      if (res.failed.length === 0) {
        toast.success(
          `Applied to ${res.succeeded.length} surface${
            res.succeeded.length === 1 ? "" : "s"
          } — ${created} created · ${updated} updated`,
        );
      } else {
        toast.warning(
          `${res.succeeded.length} saved · ${res.failed.length} failed`,
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Batch apply failed");
    } finally {
      setApplying(false);
    }
  };

  const createCount = Array.from(targetSurfaceNames).filter(
    (name) =>
      !bindings.some(
        (b) => b.surfaceName === name && bindingMatchesScope(b, scope, scopeId),
      ),
  ).length;
  const updateCount = targetSurfaceNames.size - createCount;

  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="mx-auto max-w-3xl px-4 py-5 space-y-5">
          {/* Intro */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <h1 className="text-base font-semibold">
                Batch surface bindings
              </h1>
            </div>
            <p className="text-xs text-muted-foreground">
              Copy an existing binding (or start blank), then stamp the same
              value-mappings onto many surfaces at once. Each surface is written
              independently — existing bindings are updated, unbound surfaces are
              created.
            </p>
          </div>

          {/* Copy template */}
          <section className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <Copy className="h-3.5 w-3.5" /> Copy from
            </Label>
            <Select value={templateId} onValueChange={onTemplateChange}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Start blank" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={BLANK}>
                  <span className="flex items-center gap-2">
                    <Rocket className="h-3.5 w-3.5 text-muted-foreground" />
                    Start blank
                  </span>
                </SelectItem>
                {templateCandidates.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {splitSurfaceLocal(b.surfaceName)} · {scopeLabel(b)} ·{" "}
                    {Object.keys(b.valueMappings).length} mapping
                    {Object.keys(b.valueMappings).length === 1 ? "" : "s"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          {/* Scope */}
          <section className="space-y-1.5">
            <Label className="text-xs">Scope (applies to every surface)</Label>
            <ShortcutScopePicker
              scope={scope}
              scopeId={scopeId}
              onScopeChange={(s, id) => {
                setScope(s);
                setScopeId(id);
                setResult(null);
              }}
              disabled={applying}
            />
          </section>

          {/* Shared mappings */}
          <section className="space-y-1.5">
            <Label className="text-xs">Value &amp; context-slot mappings</Label>
            <SurfaceVariableBindingList
              targets={targets}
              value={sharedMappings}
              availableSurfaceValues={availableSurfaceValues}
              disabled={applying}
              onChange={(next) => {
                setSharedMappings(next);
                setResult(null);
              }}
            />
          </section>

          {/* Surface selector */}
          <section className="space-y-1.5">
            <Label className="text-xs">Target surfaces</Label>
            <BatchSurfaceSelector
              surfaces={surfaces}
              loading={surfacesStatus === "loading" && surfaces.length === 0}
              existingSurfaceNames={existingSurfaceNames}
              templateSurfaceName={templateSurfaceName}
              updateCandidates={updateCandidates}
              selected={new Set(selectedKeys)}
              onToggle={toggleKey}
              onSetSelection={setSelectedKeys}
            />
          </section>

          {/* Result */}
          {result && (
            <section className="rounded-lg border border-border bg-card p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                {result.created} created · {result.updated} updated
                {result.failed.length > 0 && (
                  <span className="text-amber-600">
                    · {result.failed.length} failed
                  </span>
                )}
                <Link
                  href={`${basePath}/${agent.id}/surfaces`}
                  className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  View bindings <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              {result.failed.length > 0 && (
                <ul className="space-y-1">
                  {result.failed.map((f) => (
                    <li
                      key={f.surfaceName}
                      className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400"
                    >
                      <TriangleAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>
                        <span className="font-mono">{f.surfaceName}</span> —{" "}
                        {f.error}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>

      {/* Sticky apply footer */}
      <footer className="shrink-0 px-4 py-3 border-t border-border bg-background flex items-center gap-3">
        <div className="text-xs text-muted-foreground">
          {targetSurfaceNames.size > 0 ? (
            <>
              <span className="font-medium text-foreground tabular-nums">
                {targetSurfaceNames.size}
              </span>{" "}
              surface{targetSurfaceNames.size === 1 ? "" : "s"} ·{" "}
              {createCount} to create · {updateCount} to update
            </>
          ) : (
            "Select surfaces to apply"
          )}
        </div>
        <Button
          onClick={() => void onApply()}
          disabled={applying || targetSurfaceNames.size === 0}
          className="ml-auto h-9 gap-1.5 text-sm min-w-[120px]"
        >
          {applying ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Rocket className="h-4 w-4" />
          )}
          Apply to {targetSurfaceNames.size || ""}
        </Button>
      </footer>
    </div>
  );
}
