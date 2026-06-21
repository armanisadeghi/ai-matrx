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
  Info,
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

/**
 * Bundles tab/category for the Agent Tools manager.
 *
 * A bundle bundles many tools behind a single lister tool the model expands on
 * demand — so an agent can carry a whole capability (GitHub, Linear, Postgres…)
 * for the cost of one tool slot instead of dozens, which is the point: cut the
 * context the model pays for up front. Selecting a bundle writes its
 * contributed `tool_def` UUID(s) into the agent's `tools` array via the same
 * `setAgentTools` path every other tool uses, so persistence + the backend
 * resolver treat it identically to a hand-picked tool.
 *
 * Each card lists the tools the bundle includes, and any of those a user has
 * ALSO added individually are flagged — not an error (it's fine), but worth
 * pointing out in case it wasn't intended.
 */
export function AgentBundlesPanel({ agentId }: { agentId: string }) {
  const dispatch = useAppDispatch();
  const selectedTools = useAppSelector((state) =>
    selectAgentTools(state, agentId),
  );
  const { bundles, status, error } = useAgentBundleOptions();
  const [search, setSearch] = useState("");

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

  const enabledCount = useMemo(
    () => bundles.filter(isEnabled).length,
    [bundles, isEnabled],
  );

  // Tools the user added individually that ALSO belong to a bundle. For lister
  // bundles enabling never adds the members, so any member present is by hand;
  // for static bundles a present member is "by hand" only while the bundle
  // itself is off (once on, the bundle is what put them there).
  const individualOverlap = useMemo(() => {
    const ids = new Set<string>();
    for (const b of bundles) {
      const enabled = isEnabled(b);
      for (const m of b.members) {
        if (!activeSet.has(m.id)) continue;
        const byHand = b.loadMode === "lister" ? true : !enabled;
        if (byHand) ids.add(m.id);
      }
    }
    return ids;
  }, [bundles, activeSet, isEnabled]);

  const visibleBundles = useMemo(() => {
    if (!search.trim()) return bundles;
    return filterAndSortBySearch(bundles, search, [
      { get: (b) => b.name, weight: "title" },
      { get: (b) => b.description, weight: "body" },
      { get: (b) => b.members.map((m) => m.name).join(" "), weight: "body" },
      { get: (b) => b.serverSlug ?? "", weight: "tag" },
      { get: (b) => b.id, weight: "id" },
    ]);
  }, [bundles, search]);

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
            {visibleBundles.length} of {bundles.length}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-tight">
          A bundle carries many tools behind one lister the model expands on
          demand — one tool slot instead of dozens, so it costs far less context.
        </p>
      </div>

      {/* Overlap callout — individually-added tools that also live in a bundle */}
      {individualOverlap.size > 0 && (
        <div className="mx-3 mt-2.5 flex items-start gap-2 rounded border border-amber-400/60 dark:border-amber-600/50 bg-amber-50/60 dark:bg-amber-950/20 px-2.5 py-1.5 shrink-0">
          <Info className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-800 dark:text-amber-200 leading-snug">
            {individualOverlap.size === 1
              ? "1 tool you added individually also belongs to a bundle below"
              : `${individualOverlap.size} tools you added individually also belong to bundles below`}
            {
              " — highlighted in each list. That's fine; just flagging it in case it wasn't intended."
            }
          </p>
        </div>
      )}

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
                {search ? `No bundles match "${search}"` : "No bundles available"}
              </p>
            </div>
          ) : (
            visibleBundles.map((b) => (
              <BundleCard
                key={b.id}
                bundle={b}
                active={isEnabled(b)}
                activeToolIds={activeSet}
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
  activeToolIds,
  onToggle,
}: {
  bundle: AgentBundleOption;
  active: boolean;
  activeToolIds: Set<string>;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const MAX_VISIBLE = 12;

  const loadHint =
    bundle.loadMode === "static"
      ? `Adds ${bundle.memberCount} tool${bundle.memberCount === 1 ? "" : "s"} directly`
      : bundle.isMcp
        ? "Discovers its tools on demand"
        : bundle.memberCount > 0
          ? `Loads ${bundle.memberCount} tool${bundle.memberCount === 1 ? "" : "s"} on demand`
          : "Loads its tools on demand";

  // A member counts as "added individually" when it's in the agent but not by
  // virtue of this bundle (see AgentBundlesPanel.individualOverlap).
  const overlapCount = useMemo(() => {
    let n = 0;
    for (const m of bundle.members) {
      if (!activeToolIds.has(m.id)) continue;
      const byHand = bundle.loadMode === "lister" ? true : !active;
      if (byHand) n++;
    }
    return n;
  }, [bundle, activeToolIds, active]);

  const shownMembers = expanded
    ? bundle.members
    : bundle.members.slice(0, MAX_VISIBLE);
  const overflow = bundle.members.length - shownMembers.length;

  return (
    <div
      className={`rounded-lg border transition-all ${
        active
          ? "bg-secondary/10 border-secondary/30"
          : "border-border hover:border-muted-foreground/30"
      }`}
    >
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

      {/* Included tools */}
      {bundle.members.length > 0 ? (
        <div className="border-t border-border/60 px-3 py-2">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Included tools ({bundle.members.length})
            </span>
            {overlapCount > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                <Info className="w-3 h-3" />
                {overlapCount} already added individually
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {shownMembers.map((m) => {
              const inAgent = activeToolIds.has(m.id);
              const byHand =
                inAgent && (bundle.loadMode === "lister" ? true : !active);
              return (
                <span
                  key={m.id}
                  title={
                    byHand
                      ? "Already added individually to this agent"
                      : inAgent
                        ? "Provided by this bundle"
                        : undefined
                  }
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono border ${
                    byHand
                      ? "bg-amber-100/70 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-400/60 dark:border-amber-700/60"
                      : inAgent
                        ? "bg-secondary/10 text-secondary border-secondary/30"
                        : "bg-muted/60 text-muted-foreground border-transparent"
                  } ${m.isActive ? "" : "opacity-60 line-through"}`}
                >
                  {byHand && (
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
