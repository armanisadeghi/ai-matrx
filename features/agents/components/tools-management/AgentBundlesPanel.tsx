"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Search,
  X,
  Loader2,
  Package,
  Plug,
  Check,
  ShieldCheck,
  User,
  Zap,
  AlertTriangle,
  Lightbulb,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAgentTools } from "@/features/agents/redux/agent-definition/selectors";
import { setAgentTools } from "@/features/agents/redux/agent-definition/slice";
import { filterAndSortBySearch } from "@/utils/search-scoring";
import { useAgentBundleOptions } from "./useAgentBundleOptions";
import type { AgentBundleOption } from "@/features/tool-registry/bundles/services/bundles.service";

// Internal toolkits vs third-party MCP-server bundles are kept on separate tabs
// so our own bundles aren't buried under dozens of MCP entries. "Internal" is
// the default. An MCP bundle is one backed by an MCP server (it carries a
// `server_slug` → `isMcp`); everything else is internal.
type BundleScope = "internal" | "mcp" | "all";
const SCOPE_TABS: { key: BundleScope; label: string }[] = [
  { key: "internal", label: "Internal" },
  { key: "mcp", label: "MCP" },
  { key: "all", label: "All" },
];

type OverlapKind = "none" | "suggestion" | "warning";

/**
 * Classify a bundle against the agent's current tools:
 *
 * - **suggestion** (green): the bundle is NOT on the agent, but the agent
 *   already holds some of its tools individually — adding the bundle would
 *   consolidate them. A nudge, not a problem.
 * - **warning** (yellow): the bundle IS on the agent AND the agent also holds
 *   some of its tools individually — real redundancy (the bundle already
 *   provides them). Only **lister** bundles can duplicate: enabling one adds
 *   just the lister, so a member held individually is a genuine second source.
 *   Static bundles add their members as the same shared UUID — nothing to
 *   duplicate, so they never warn.
 */
function classifyOverlap(
  b: AgentBundleOption,
  agentTools: Set<string>,
): { kind: OverlapKind; heldIds: Set<string> } {
  const enabled =
    b.contributedToolIds.length > 0 &&
    b.contributedToolIds.every((id) => agentTools.has(id));
  const heldIds = new Set(
    b.members.filter((m) => agentTools.has(m.id)).map((m) => m.id),
  );
  if (heldIds.size === 0) return { kind: "none", heldIds };
  if (enabled) {
    return { kind: b.loadMode === "lister" ? "warning" : "none", heldIds };
  }
  return { kind: "suggestion", heldIds };
}

/**
 * Bundles tab/category for the Agent Tools manager.
 *
 * A bundle bundles many tools behind a single lister tool the model expands on
 * demand — so an agent can carry a whole capability (GitHub, Linear, Postgres…)
 * for the cost of one tool slot instead of dozens. Selecting a bundle writes
 * its contributed `tool_def` UUID(s) into the agent's `tools` array via the
 * same `setAgentTools` path every other tool uses.
 *
 * Overlap with individually-picked tools is surfaced as a gentle nudge — green
 * "consolidate" suggestion before you add a bundle, yellow "redundant" reminder
 * after — never as an error.
 */
export function AgentBundlesPanel({ agentId }: { agentId: string }) {
  const dispatch = useAppDispatch();
  const selectedTools = useAppSelector((state) =>
    selectAgentTools(state, agentId),
  );
  const { bundles, status, error } = useAgentBundleOptions();
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<BundleScope>("internal");

  const activeSet = useMemo(
    () =>
      new Set(Array.isArray(selectedTools) ? (selectedTools as string[]) : []),
    [selectedTools],
  );

  const isEnabled = useCallback(
    (b: AgentBundleOption) =>
      b.contributedToolIds.length > 0 &&
      b.contributedToolIds.every((id) => activeSet.has(id)),
    [activeSet],
  );

  const toggleBundle = useCallback(
    (b: AgentBundleOption) => {
      const current = Array.isArray(selectedTools)
        ? (selectedTools as string[])
        : [];
      const currentSet = new Set(current);
      const enabled = b.contributedToolIds.every((id) => currentSet.has(id));
      let next: string[];
      if (enabled) {
        const drop = new Set(b.contributedToolIds);
        next = current.filter((id) => !drop.has(id));
      } else {
        next = Array.from(new Set([...current, ...b.contributedToolIds]));
      }
      dispatch(
        setAgentTools({
          id: agentId,
          tools: next as unknown as typeof selectedTools,
        }),
      );
    },
    [agentId, selectedTools, dispatch],
  );

  const counts = useMemo(
    () => ({
      internal: bundles.filter((b) => !b.isMcp).length,
      mcp: bundles.filter((b) => b.isMcp).length,
      all: bundles.length,
    }),
    [bundles],
  );

  const scopeBundles = useMemo(() => {
    if (scope === "mcp") return bundles.filter((b) => b.isMcp);
    if (scope === "internal") return bundles.filter((b) => !b.isMcp);
    return bundles;
  }, [bundles, scope]);

  const enabledCount = useMemo(
    () => scopeBundles.filter(isEnabled).length,
    [scopeBundles, isEnabled],
  );

  const visibleBundles = useMemo(() => {
    const base = search.trim()
      ? filterAndSortBySearch(scopeBundles, search, [
          { get: (b) => b.name, weight: "title" },
          { get: (b) => b.description, weight: "body" },
          { get: (b) => b.members.map((m) => m.name).join(" "), weight: "body" },
          { get: (b) => b.serverSlug ?? "", weight: "tag" },
          { get: (b) => b.id, weight: "id" },
        ])
      : scopeBundles;
    // Float "suggestion" bundles (ones that cover tools you already use) to the
    // top so the consolidate nudge is the first thing you see. Stable sort.
    return [...base].sort((a, b) => {
      const ra = classifyOverlap(a, activeSet).kind === "suggestion" ? 0 : 1;
      const rb = classifyOverlap(b, activeSet).kind === "suggestion" ? 0 : 1;
      return ra - rb;
    });
  }, [scopeBundles, search, activeSet]);

  if (status === "loading" || status === "idle") {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-xs">Loading bundles…</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground p-8">
        <AlertTriangle className="w-7 h-7 text-yellow-500" />
        <p className="text-sm">Couldn&apos;t load bundles.</p>
        {error && <p className="text-[11px] text-center max-w-xs">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <Package className="w-3.5 h-3.5 text-secondary" />
          <span className="text-xs font-semibold text-foreground">
            Tool Bundles
          </span>
          {enabledCount > 0 && (
            <Badge
              variant="secondary"
              className="h-4 px-1.5 text-[10px] tabular-nums"
            >
              {enabledCount} enabled
            </Badge>
          )}
          <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
            {visibleBundles.length} of {scopeBundles.length}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-tight mb-2">
          A bundle carries many tools behind one lister the model expands on
          demand — one tool slot instead of dozens, so it costs far less context.
        </p>
        {/* Internal vs MCP scope */}
        <div className="inline-flex items-center gap-0.5 rounded-md bg-muted/60 p-0.5">
          {SCOPE_TABS.map((tab) => {
            const isActive = scope === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setScope(tab.key)}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  isActive
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
                <span
                  className={`tabular-nums ${
                    isActive ? "text-secondary" : "text-muted-foreground/70"
                  }`}
                >
                  {counts[tab.key]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2.5 border-b border-border shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${bundles.length} bundles…`}
            className="pl-8 pr-8 h-8 text-sm"
            style={{ fontSize: "16px" }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-3 space-y-1.5">
          {visibleBundles.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Search className="w-5 h-5 opacity-40" />
              <p className="text-xs">
                {search
                  ? `No ${scope === "all" ? "" : scope + " "}bundles match "${search}"`
                  : `No ${scope === "all" ? "" : scope + " "}bundles available`}
              </p>
            </div>
          ) : (
            visibleBundles.map((b) => (
              <BundleCard
                key={b.id}
                bundle={b}
                active={isEnabled(b)}
                agentTools={activeSet}
                onToggle={() => toggleBundle(b)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function BundleCard({
  bundle,
  active,
  agentTools,
  onToggle,
}: {
  bundle: AgentBundleOption;
  active: boolean;
  agentTools: Set<string>;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const MAX_VISIBLE = 12;

  const { kind, heldIds } = useMemo(
    () => classifyOverlap(bundle, agentTools),
    [bundle, agentTools],
  );

  const loadHint =
    bundle.loadMode === "static"
      ? `Adds ${bundle.memberCount} tool${bundle.memberCount === 1 ? "" : "s"} directly`
      : bundle.isMcp
        ? "Discovers its tools on demand"
        : bundle.memberCount > 0
          ? `Loads ${bundle.memberCount} tool${bundle.memberCount === 1 ? "" : "s"} on demand`
          : "Loads its tools on demand";

  const shownMembers = expanded
    ? bundle.members
    : bundle.members.slice(0, MAX_VISIBLE);
  const overflow = bundle.members.length - shownMembers.length;

  const borderClass =
    kind === "warning"
      ? "border-amber-400/70 dark:border-amber-600/60 bg-amber-50/40 dark:bg-amber-950/15"
      : kind === "suggestion"
        ? "border-emerald-400/70 dark:border-emerald-600/60 bg-emerald-50/40 dark:bg-emerald-950/15"
        : active
          ? "bg-secondary/10 border-secondary/30"
          : "border-border hover:border-muted-foreground/30";

  return (
    <div className={`rounded-lg border transition-all ${borderClass}`}>
      {/* Header row — the toggle target */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="flex items-start gap-3 w-full px-3 py-2.5 cursor-pointer select-none"
      >
        <div className="mt-0.5 shrink-0">
          <Checkbox
            checked={active}
            tabIndex={-1}
            className="pointer-events-none"
          />
        </div>

        <span
          className={`inline-flex items-center justify-center w-5 h-5 rounded shrink-0 mt-0.5 border ${
            active
              ? "bg-secondary/15 text-secondary border-secondary/30"
              : "bg-muted text-muted-foreground border-border"
          }`}
        >
          {bundle.isMcp ? (
            <Plug className="w-3 h-3" />
          ) : (
            <Package className="w-3 h-3" />
          )}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span
              className={`text-xs font-semibold leading-tight ${
                active ? "text-secondary" : "text-foreground"
              }`}
            >
              {bundle.name}
            </span>
            {bundle.isMcp && (
              <Badge
                variant="outline"
                className="h-4 px-1 text-[9px] font-normal"
              >
                MCP
              </Badge>
            )}
            <Badge
              variant="outline"
              className="h-4 px-1 text-[9px] font-normal gap-0.5"
            >
              {bundle.isSystem ? (
                <>
                  <ShieldCheck className="w-2.5 h-2.5" /> System
                </>
              ) : (
                <>
                  <User className="w-2.5 h-2.5" /> Personal
                </>
              )}
            </Badge>
          </div>
          {bundle.description && (
            <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
              {bundle.description}
            </p>
          )}
          <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground/80">
            {active ? (
              <Check className="w-3 h-3 text-secondary" />
            ) : (
              <Zap className="w-3 h-3" />
            )}
            {loadHint}
          </p>
        </div>
      </div>

      {/* Gentle overlap nudge — suggestion before adding, redundancy after */}
      {kind === "suggestion" && (
        <div className="px-3 pb-2 -mt-1 flex items-start gap-1.5 text-[10px] text-emerald-700 dark:text-emerald-400">
          <Lightbulb className="w-3 h-3 mt-0.5 shrink-0" />
          <span>
            You already use {heldIds.size} of these tools individually — add this
            bundle to consolidate, then drop the individual copies.
          </span>
        </div>
      )}
      {kind === "warning" && (
        <div className="px-3 pb-2 -mt-1 flex items-start gap-1.5 text-[10px] text-amber-700 dark:text-amber-400">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          <span>
            {heldIds.size} of these tools {heldIds.size === 1 ? "is" : "are"} also
            added individually — redundant with this bundle. Consider removing the
            individual copies.
          </span>
        </div>
      )}

      {/* Included tools */}
      {bundle.members.length > 0 ? (
        <div className="border-t border-border/60 px-3 py-2">
          <div className="mb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Included tools ({bundle.members.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {shownMembers.map((m) => {
              const highlight = kind !== "none" && heldIds.has(m.id);
              return (
                <span
                  key={m.id}
                  title={
                    highlight
                      ? kind === "warning"
                        ? "Also added individually — redundant"
                        : "You already use this individually"
                      : undefined
                  }
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono border ${
                    highlight
                      ? kind === "warning"
                        ? "bg-amber-100/70 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-400/60 dark:border-amber-700/60"
                        : "bg-emerald-100/70 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-400/60 dark:border-emerald-700/60"
                      : "bg-muted/60 text-muted-foreground border-transparent"
                  } ${m.isActive ? "" : "opacity-60 line-through"}`}
                >
                  {highlight && (
                    <User className="w-2.5 h-2.5 shrink-0" aria-hidden />
                  )}
                  {m.name}
                </span>
              );
            })}
            {overflow > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(true);
                }}
                className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground border border-dashed border-border"
              >
                +{overflow} more
              </button>
            )}
            {expanded && bundle.members.length > MAX_VISIBLE && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(false);
                }}
                className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground border border-dashed border-border"
              >
                Show less
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="border-t border-border/60 px-3 py-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Plug className="w-3 h-3 shrink-0" />
          Tools are discovered when{" "}
          {bundle.serverSlug ? (
            <code className="font-mono">{bundle.serverSlug}</code>
          ) : (
            "this server"
          )}{" "}
          connects.
        </div>
      )}
    </div>
  );
}
