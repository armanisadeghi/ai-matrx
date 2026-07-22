"use client";

/**
 * Surface Mappings — diagnostic for "surface picked but values didn't land".
 *
 * Runs the REAL launch-time resolution, step by step, with everything visible:
 *
 *   1. Binding rows — `fetchSurfaceBindingLayers(agentId, surfaceName)` reads
 *      the agent↔surface binding edges (platform.associations via the
 *      `agent.menu_surface` view; the successor of the old
 *      `agent.definition_surface` table), walking the surface-inheritance
 *      chain. Every visible tier is returned as a layer, weakest → strongest
 *      (global → org-by-membership → user); there is NO launch-time scope
 *      picker — RLS decides which tiers the caller sees.
 *   2. Per-key merge — `mergeValueMappingLayers` shows which layer (tier) won
 *      each key, plus inert layers (declared mappings, zero winning keys).
 *   3. Scope mapping — `withBaselineScope` floors the 5 generic values, then
 *      `mapScopeToInstanceWithSurface` (the exact function the launch thunk
 *      calls) produces the variable values + context entries an instance
 *      would receive.
 *
 * All imports are the production functions — nothing here is reimplemented.
 */

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CircleSlash,
  Layers,
  Play,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  useAppDispatch,
  useAppSelector,
  useAppStore,
} from "@/lib/redux/hooks";
import {
  fetchAgentsListFull,
  fetchAgentExecutionFull,
} from "@/features/agents/redux/agent-definition/thunks";
import {
  selectAllAgents,
  selectAgentsSliceStatus,
  selectAgentCustomExecutionPayload,
} from "@/features/agents/redux/agent-definition/selectors";
import {
  getAllManifests,
  getManifest,
  getSurfaceAncestry,
} from "@/features/surfaces/manifests/registry";
import { fetchSurfaceBindingLayers } from "@/features/surfaces/services/bind-agent-to-surface.service";
import {
  mergeValueMappingLayers,
  type MappingLayer,
  type MergedValueMappings,
} from "@/features/surfaces/utils/merge-value-mappings";
import { withBaselineScope } from "@/features/surfaces/utils/baseline-scope";
import {
  mapScopeToInstanceWithSurface,
  type SurfaceBoundScopeMappingResult,
} from "@/features/agents/utils/scope-mapping";
import type { SurfaceValue } from "@/features/surfaces/types";

// ---------------------------------------------------------------------------
// Sample-scope seeding
// ---------------------------------------------------------------------------

function sampleForValue(v: SurfaceValue): unknown {
  switch (v.valueType) {
    case "number":
      return 42;
    case "boolean":
      return true;
    case "object":
      return { sample: true };
    case "array":
      return [];
    case "document":
      return `Sample document text for "${v.label}".`;
    default:
      return `Sample ${v.label.toLowerCase()}`;
  }
}

/** 5 generic baselines + a handful of the surface's own manifest values. */
function buildSampleScope(surfaceName: string): Record<string, unknown> {
  const scope: Record<string, unknown> = {
    selection: "the selected words",
    text_before: "Text that comes before the selection. ",
    text_after: " Text that comes after the selection.",
    content: "The full sample content of this surface. Edit me freely.",
    context: { source: "surface-mappings-demo" },
  };
  const manifest = getManifest(surfaceName);
  const extras = (manifest?.values ?? [])
    .filter((v) => !(v.name in scope))
    .slice(0, 6);
  for (const v of extras) scope[v.name] = sampleForValue(v);
  return scope;
}

// ---------------------------------------------------------------------------
// Resolve output
// ---------------------------------------------------------------------------

interface ResolveOutput {
  agentName: string;
  surfaceName: string;
  variableDefNames: string[];
  contextSlotKeys: string[];
  layers: MappingLayer[];
  merged: MergedValueMappings | null;
  mapping: SurfaceBoundScopeMappingResult;
}

function previewValue(value: unknown, max = 160): string {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  if (s === undefined) return "undefined";
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

const PANEL = "rounded-md border border-border bg-card";
const PANEL_TITLE =
  "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

export default function SurfaceMappingsDemoPage() {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  // ── Agent picker (real user agents via the canonical list thunk) ────────
  const agents = useAppSelector(selectAllAgents);
  const agentsStatus = useAppSelector(selectAgentsSliceStatus);
  const [agentSearch, setAgentSearch] = useState("");
  const [agentId, setAgentId] = useState<string | null>(null);

  useEffect(() => {
    if (agentsStatus === "idle") {
      void dispatch(fetchAgentsListFull());
    }
  }, [agentsStatus, dispatch]);

  const agentList = useMemo(() => {
    const rows = Object.values(agents).filter(
      (a) => a.name && !a.isVersion && a.isActive !== false,
    );
    const q = agentSearch.trim().toLowerCase();
    const filtered = q
      ? rows.filter((a) => a.name.toLowerCase().includes(q))
      : rows;
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [agents, agentSearch]);

  // ── Surface picker (manifests registry) ─────────────────────────────────
  const surfaceNames = useMemo(
    () =>
      getAllManifests()
        .map((m) => m.surfaceName)
        .sort((a, b) => a.localeCompare(b)),
    [],
  );
  const [surfaceName, setSurfaceName] = useState<string>("matrx-user/notes");

  // ── Sample applicationScope JSON ─────────────────────────────────────────
  const [scopeJson, setScopeJson] = useState<string>(() =>
    JSON.stringify(buildSampleScope("matrx-user/notes"), null, 2),
  );
  const scopeJsonError = useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(scopeJson);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return "applicationScope must be a JSON object";
      }
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Invalid JSON";
    }
  }, [scopeJson]);

  const reseedScope = (name: string) => {
    setScopeJson(JSON.stringify(buildSampleScope(name), null, 2));
  };

  // ── Resolve ──────────────────────────────────────────────────────────────
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [output, setOutput] = useState<ResolveOutput | null>(null);

  const canResolve = !!agentId && !!surfaceName && !scopeJsonError && !resolving;

  const runResolve = async () => {
    if (!agentId || !surfaceName || scopeJsonError) return;
    setResolving(true);
    setResolveError(null);
    try {
      // 1. Agent execution payload — same pre-fetch the launch thunk does.
      let payload = selectAgentCustomExecutionPayload(store.getState(), agentId);
      if (!payload.isReady) {
        await dispatch(fetchAgentExecutionFull(agentId)).unwrap();
        payload = selectAgentCustomExecutionPayload(store.getState(), agentId);
      }
      if (!payload.isReady) {
        throw new Error(
          "agx_get_execution_full returned no usable payload for this agent (RLS or missing fields — variable_definitions, model_id, settings).",
        );
      }
      const agentName = agents[agentId]?.name ?? agentId;

      // 2. Binding layers + per-key merge — the REAL layered resolution.
      const layers = await fetchSurfaceBindingLayers(agentId, surfaceName);
      const merged = layers.length > 0 ? mergeValueMappingLayers(layers) : null;

      // 3. Baseline floor + the REAL mapper (mirrors the direct-agent launch
      //    path: scopeMappings=null, surface mappings from the merged layers).
      const parsedScope = JSON.parse(scopeJson) as Record<string, unknown>;
      const flooredScope = withBaselineScope(parsedScope);
      const mapping = mapScopeToInstanceWithSurface(
        flooredScope,
        null,
        merged?.merged ?? {},
        payload.variableDefinitions ?? [],
        payload.contextSlots ?? [],
      );

      setOutput({
        agentName,
        surfaceName,
        variableDefNames: (payload.variableDefinitions ?? []).map((v) => v.name),
        contextSlotKeys: (payload.contextSlots ?? []).map((s) => s.key),
        layers,
        merged,
        mapping,
      });
    } catch (err) {
      setOutput(null);
      setResolveError(err instanceof Error ? err.message : String(err));
    } finally {
      setResolving(false);
    }
  };

  const ancestry = useMemo(() => {
    try {
      return getSurfaceAncestry(surfaceName);
    } catch {
      return [];
    }
  }, [surfaceName]);

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <h1 className="text-lg font-semibold">Surface Mappings</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-4xl">
            Pick an agent and a surface, edit the sample{" "}
            <code className="text-[11px] bg-muted px-1 py-0.5 rounded">
              applicationScope
            </code>
            , then Resolve. Shows the live binding layers (
            <code className="text-[11px] bg-muted px-1 py-0.5 rounded">
              fetchSurfaceBindingLayers
            </code>
            , platform.associations via agent.menu_surface — the successor of
            agent.definition_surface), which tier won each key, and exactly what{" "}
            <code className="text-[11px] bg-muted px-1 py-0.5 rounded">
              mapScopeToInstanceWithSurface
            </code>{" "}
            emits. There is no scope picker at launch — every tier the caller
            can see applies, weakest to strongest (global → org → user).
          </p>
        </header>

        {/* ── Inputs row ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Agent picker */}
          <section className={`${PANEL} p-2.5 flex flex-col gap-2`}>
            <h2 className={PANEL_TITLE}>1 · Agent</h2>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={agentSearch}
                onChange={(e) => setAgentSearch(e.target.value)}
                placeholder="Search agents…"
                className="w-full rounded border border-border bg-background pl-7 pr-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="h-48 overflow-auto rounded border border-border/60 bg-background/50">
              {agentsStatus === "loading" && agentList.length === 0 ? (
                <p className="p-2 text-xs text-muted-foreground">
                  Loading agents…
                </p>
              ) : agentList.length === 0 ? (
                <p className="p-2 text-xs text-muted-foreground">
                  No agents match.
                </p>
              ) : (
                agentList.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAgentId(a.id)}
                    className={`w-full text-left px-2 py-1 text-sm truncate ${
                      agentId === a.id
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {a.name}
                    {a.agentType === "builtin" ? (
                      <span className="ml-1.5 text-[10px] text-primary">
                        builtin
                      </span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
            <p className="text-[11px] text-muted-foreground truncate">
              {agentId ? `id: ${agentId}` : "No agent selected"}
            </p>
          </section>

          {/* Surface picker */}
          <section className={`${PANEL} p-2.5 flex flex-col gap-2`}>
            <h2 className={PANEL_TITLE}>2 · Surface</h2>
            <select
              value={surfaceName}
              onChange={(e) => {
                setSurfaceName(e.target.value);
                reseedScope(e.target.value);
              }}
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
            >
              {surfaceNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <div className="text-[11px] text-muted-foreground space-y-1">
              <p>
                Inheritance chain:{" "}
                {ancestry.length > 0
                  ? `${ancestry.join(" → ")} → ${surfaceName}`
                  : "(none — root surface)"}
              </p>
              <p>
                Manifest values:{" "}
                {(getManifest(surfaceName)?.values ?? [])
                  .map((v) => v.name)
                  .join(", ") || "(no manifest)"}
              </p>
            </div>
          </section>

          {/* Scope JSON */}
          <section className={`${PANEL} p-2.5 flex flex-col gap-2`}>
            <div className="flex items-center justify-between">
              <h2 className={PANEL_TITLE}>3 · applicationScope (JSON)</h2>
              <button
                type="button"
                onClick={() => reseedScope(surfaceName)}
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                <RefreshCw className="h-3 w-3" /> Reseed for surface
              </button>
            </div>
            <textarea
              value={scopeJson}
              onChange={(e) => setScopeJson(e.target.value)}
              spellCheck={false}
              className={`h-44 w-full resize-none rounded border bg-background p-2 font-mono text-[11px] leading-relaxed outline-none focus:ring-1 focus:ring-primary ${
                scopeJsonError ? "border-destructive" : "border-border"
              }`}
            />
            {scopeJsonError ? (
              <p className="flex items-center gap-1 text-[11px] text-destructive">
                <AlertTriangle className="h-3 w-3 shrink-0" /> {scopeJsonError}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                The 5 generic baselines are floored at resolve time (
                <code>withBaselineScope</code>) — deleting them here shows the
                floor doing its job.
              </p>
            )}
          </section>
        </div>

        {/* ── Resolve action ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={!canResolve}
            onClick={() => void runResolve()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" />
            {resolving ? "Resolving…" : "Resolve"}
          </button>
          {!agentId && (
            <span className="text-xs text-muted-foreground">
              Pick an agent to enable Resolve.
            </span>
          )}
          {resolveError && (
            <span className="flex items-center gap-1 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {resolveError}
            </span>
          )}
        </div>

        {/* ── Output ─────────────────────────────────────────────────────── */}
        {output && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Resolved <span className="text-foreground">{output.agentName}</span>{" "}
              × <span className="text-foreground">{output.surfaceName}</span> —
              agent declares {output.variableDefNames.length} variable(s) [
              {output.variableDefNames.join(", ") || "none"}] and{" "}
              {output.contextSlotKeys.length} context slot(s) [
              {output.contextSlotKeys.join(", ") || "none"}].
            </p>

            {/* Binding layers + merge */}
            <section className={`${PANEL} p-2.5 space-y-2`}>
              <h2 className={PANEL_TITLE}>
                Binding layers (weakest → strongest)
              </h2>
              {output.layers.length === 0 ? (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CircleSlash className="h-3.5 w-3.5 shrink-0" />
                  No binding rows found for this agent × surface (including
                  inherited parent surfaces). Only the legacy auto-name-match
                  pass applies — scope keys that exactly match a variable name
                  or context slot still land; everything else falls through as
                  ad-hoc context.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {output.layers.map((layer) => (
                      <div
                        key={layer.name}
                        className="rounded border border-border/60 bg-muted/30 p-2"
                      >
                        <p className="text-[11px] font-semibold text-primary">
                          {layer.name}
                        </p>
                        <pre className="mt-1 overflow-auto font-mono text-[11px] text-muted-foreground max-h-40">
                          {JSON.stringify(layer.mappings ?? {}, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                  {output.merged && (
                    <div className="space-y-1.5">
                      <h3 className="text-[11px] font-semibold text-foreground">
                        Merged map — winning layer per key
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-[11px]">
                          <thead className="text-muted-foreground">
                            <tr className="border-b border-border">
                              <th className="py-1 pr-3 font-medium">Target key</th>
                              <th className="py-1 pr-3 font-medium">mapType</th>
                              <th className="py-1 pr-3 font-medium">Mapping</th>
                              <th className="py-1 font-medium">Won by (tier)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(output.merged.merged).map(
                              ([key, mapping]) => (
                                <tr key={key} className="border-b border-border/40">
                                  <td className="py-1 pr-3 font-mono">{key}</td>
                                  <td className="py-1 pr-3">{mapping.mapType}</td>
                                  <td className="py-1 pr-3 font-mono text-muted-foreground">
                                    {previewValue(mapping, 80)}
                                  </td>
                                  <td className="py-1 text-primary">
                                    {output.merged?.provenance[key]}
                                  </td>
                                </tr>
                              ),
                            )}
                          </tbody>
                        </table>
                      </div>
                      {output.merged.inertLayers.length > 0 && (
                        <p className="flex items-center gap-1 text-[11px] text-foreground bg-warning/15 rounded px-2 py-1">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          Inert layers (declared mappings, zero winning keys):{" "}
                          {output.merged.inertLayers.join(", ")} — fully
                          shadowed by more specific tiers.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </section>

            {/* Mapper output — two columns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <section className={`${PANEL} p-2.5 space-y-1.5`}>
                <h2 className={PANEL_TITLE}>
                  Variable values (
                  {Object.keys(output.mapping.variableValues).length})
                </h2>
                {Object.keys(output.mapping.variableValues).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No variable values emitted. Either no mapping targets a
                    declared variable, or the mapped surface values are absent
                    from the scope JSON.
                  </p>
                ) : (
                  Object.entries(output.mapping.variableValues).map(
                    ([name, value]) => (
                      <div
                        key={name}
                        className="rounded border border-border/60 bg-muted/30 px-2 py-1.5"
                      >
                        <p className="font-mono text-[11px] font-semibold text-primary">
                          {name}
                        </p>
                        <p className="font-mono text-[11px] text-muted-foreground break-all">
                          {previewValue(value)}
                        </p>
                      </div>
                    ),
                  )
                )}
              </section>

              <section className={`${PANEL} p-2.5 space-y-1.5`}>
                <h2 className={PANEL_TITLE}>
                  Context entries ({output.mapping.contextEntries.length})
                </h2>
                {output.mapping.contextEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No context entries emitted.
                  </p>
                ) : (
                  output.mapping.contextEntries.map((entry, i) => (
                    <div
                      key={`${entry.key}-${i}`}
                      className="rounded border border-border/60 bg-muted/30 px-2 py-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-[11px] font-semibold text-primary">
                          {entry.key}
                        </p>
                        <span className="text-[10px] text-muted-foreground">
                          {entry.type}
                        </span>
                        <span
                          className={`text-[10px] rounded px-1 ${
                            entry.slotMatched
                              ? "bg-primary/15 text-primary"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {entry.slotMatched ? "slot match" : "ad-hoc"}
                        </span>
                      </div>
                      <p className="font-mono text-[11px] text-muted-foreground break-all">
                        {previewValue(entry.value)}
                      </p>
                    </div>
                  ))
                )}
              </section>
            </div>

            {/* Resolver diagnostics */}
            {(output.mapping.errors.length > 0 ||
              output.mapping.warnings.length > 0 ||
              output.mapping.pendingPrompts.length > 0) && (
              <section className={`${PANEL} p-2.5 space-y-1`}>
                <h2 className={PANEL_TITLE}>Resolver diagnostics</h2>
                {output.mapping.errors.map((e) => (
                  <p key={e} className="text-[11px] text-destructive">
                    error: {e}
                  </p>
                ))}
                {output.mapping.warnings.map((w) => (
                  <p key={w} className="text-[11px] text-muted-foreground">
                    warning: {w}
                  </p>
                ))}
                {output.mapping.pendingPrompts.map((p) => (
                  <p key={p.targetName} className="text-[11px] text-muted-foreground">
                    prompt_user pending: <code>{p.targetName}</code> — at a real
                    launch this drains through the pre-launch value-prompts
                    dialog before the instance is created.
                  </p>
                ))}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
