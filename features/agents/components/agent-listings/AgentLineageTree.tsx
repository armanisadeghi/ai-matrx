"use client";

/**
 * AgentLineageTree
 *
 * Admin-only visualization of the "what came from this agent" tree. For each
 * root agent we show:
 *   - Derived agents (other agents whose `sourceAgentId` points here — the
 *     typical "promoted from user → system" linkage).
 *   - Shortcuts pointing at this agent (via `selectShortcutsByAgentId`).
 *   - Agent apps backed by this agent (fetched from `agent_apps`).
 *
 * Each row is a click-through into the matching admin editor. No write
 * operations happen here — this is a read-only map.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AppWindow,
  Cpu,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  GitBranch,
  Loader2,
  Maximize2,
  Minimize2,
  Search,
  X,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { fetchAgentsListFull } from "@/features/agents/redux/agent-definition/thunks";
import {
  selectBuiltinAgents,
  selectLiveAgents,
} from "@/features/agents/redux/agent-definition/selectors";
import { useAgentShortcuts } from "@/features/agent-shortcuts/hooks/useAgentShortcuts";
import { selectShortcutsByAgentId } from "@/features/agents/redux/agent-shortcuts/selectors";
import type { RootState } from "@/lib/redux/store";
import type { AgentDefinitionRecord } from "@/features/agents/types/agent-definition.types";
import type { AgentShortcutRecord } from "@/features/agents/redux/agent-shortcuts/types";
import {
  fetchAgentAppsAdmin,
  type AgentAppAdminView,
} from "@/lib/services/agent-apps-admin-service";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { ExportMenu } from "@/components/agent-copy/ExportMenu";
import { jsonExportItem, csvExportItem } from "@/components/agent-copy/export";

const ADMIN_AGENT_BASE = "/administration/agents/system-agents/agents";

export function AgentLineageTree() {
  const dispatch = useAppDispatch();
  const builtins = useAppSelector(selectBuiltinAgents);
  const allAgents = useAppSelector(selectLiveAgents);

  // Hydrate both shortcut scopes so selectShortcutsByAgentId returns everything
  // the admin should see (global + anything else visible via RLS).
  const globalQuery = useAgentShortcuts({ scope: "global" });
  const userQuery = useAgentShortcuts({ scope: "user" });

  const [apps, setApps] = useState<AgentAppAdminView[]>([]);
  const [appsLoading, setAppsLoading] = useState(true);

  useEffect(() => {
    dispatch(fetchAgentsListFull());
    setAppsLoading(true);
    fetchAgentAppsAdmin({ limit: 500 })
      .then((rows) => setApps(rows))
      .catch(() => setApps([]))
      .finally(() => setAppsLoading(false));
  }, [dispatch]);

  // Group derived agents by their source id — fast lookup per root.
  const derivedBySource = useMemo(() => {
    const map = new Map<string, AgentDefinitionRecord[]>();
    for (const a of allAgents) {
      if (!a.sourceAgentId) continue;
      const list = map.get(a.sourceAgentId) ?? [];
      list.push(a);
      map.set(a.sourceAgentId, list);
    }
    return map;
  }, [allAgents]);

  // Same for apps.
  const appsByAgent = useMemo(() => {
    const map = new Map<string, AgentAppAdminView[]>();
    for (const app of apps) {
      if (!app.agent_id) continue;
      const list = map.get(app.agent_id) ?? [];
      list.push(app);
      map.set(app.agent_id, list);
    }
    return map;
  }, [apps]);

  const isShortcutsLoading = globalQuery.isLoading || userQuery.isLoading;

  // Combined shortcut list across both hydrated scopes — used only to build
  // the toolbar's copy-all lineage payload (each LineageCard still reads its
  // own via `selectShortcutsByAgentId`, unaffected by this).
  const shortcutsByAgent = useMemo(() => {
    const map = new Map<string, AgentShortcutRecord[]>();
    for (const s of [...globalQuery.shortcuts, ...userQuery.shortcuts]) {
      if (!s.agentId) continue;
      const list = map.get(s.agentId) ?? [];
      list.push(s);
      map.set(s.agentId, list);
    }
    return map;
  }, [globalQuery.shortcuts, userQuery.shortcuts]);

  const buildLineageEntries = useCallback(
    (roots: AgentDefinitionRecord[]) =>
      roots.map((agent) => ({
        id: agent.id,
        name: agent.name,
        description: agent.description ?? null,
        derived: (derivedBySource.get(agent.id) ?? []).map((d) => ({
          id: d.id,
          name: d.name,
          agentType: d.agentType,
          updatedAt: d.updatedAt,
        })),
        shortcuts: (shortcutsByAgent.get(agent.id) ?? []).map((s) => ({
          id: s.id,
          label: s.label,
          isActive: s.isActive,
        })),
        apps: (appsByAgent.get(agent.id) ?? []).map((a) => ({
          id: a.id,
          name: a.name,
          slug: a.slug,
          status: a.status,
        })),
      })),
    [derivedBySource, shortcutsByAgent, appsByAgent],
  );

  // ── Expand state, lifted so we can offer expand-all / collapse-all ──────
  // A simple `Set` of opened agent ids. The "expand all" button fills it with
  // every visible builtin id; "collapse all" clears it. Cards toggle their own
  // id in/out as before — they're now controlled.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const visibleBuiltins = useMemo(() => {
    if (!search.trim()) return builtins;
    const q = search.toLowerCase();
    return builtins.filter((a) => {
      const name = (a.name ?? "").toLowerCase();
      const desc = (a.description ?? "").toLowerCase();
      return name.includes(q) || desc.includes(q);
    });
  }, [builtins, search]);

  const allExpanded =
    visibleBuiltins.length > 0 &&
    visibleBuiltins.every((a) => expandedIds.has(a.id));

  const handleExpandAll = useCallback(() => {
    setExpandedIds(new Set(visibleBuiltins.map((a) => a.id)));
  }, [visibleBuiltins]);

  const handleCollapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  const toggleOne = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  if (builtins.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading system agents…
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <div className="flex items-center gap-2 px-3 h-8 rounded-md border border-border bg-card">
            <Search className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search system agents..."
              className="flex-1 bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-muted-foreground py-1 min-w-0"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="p-0.5 hover:bg-muted/50 rounded transition-colors flex-shrink-0"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {visibleBuiltins.length} agent{visibleBuiltins.length !== 1 ? "s" : ""}
        </span>
        {visibleBuiltins.length > 0 && (
          <>
            <CopyButtons
              size="icon"
              label="Agent lineage"
              human={() =>
                buildLineageEntries(visibleBuiltins)
                  .map(
                    (e) =>
                      `${e.name} — ${e.derived.length} derived, ${e.shortcuts.length} shortcuts, ${e.apps.length} apps`,
                  )
                  .join("\n")
              }
              json={() => buildLineageEntries(visibleBuiltins)}
              agent={() => ({
                kind: "system-agent-lineage",
                location:
                  "AI Matrx Admin — System Agents · Lineage (/administration/agents/system-agents/lineage)",
                description:
                  "Lineage map (derived agents, shortcuts, apps) for every system agent matching the search.",
                data: buildLineageEntries(visibleBuiltins),
                attributes: { count: visibleBuiltins.length },
                context: { search: search || undefined },
              })}
            />
            <ExportMenu
              label="agent-lineage"
              items={[
                jsonExportItem(() => buildLineageEntries(visibleBuiltins)),
                csvExportItem(() => {
                  return buildLineageEntries(visibleBuiltins).map((e) => ({
                    id: e.id,
                    name: e.name,
                    description: e.description,
                    derived_count: e.derived.length,
                    shortcuts_count: e.shortcuts.length,
                    apps_count: e.apps.length,
                  }));
                }, "CSV"),
              ]}
            />
          </>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={allExpanded ? handleCollapseAll : handleExpandAll}
          disabled={visibleBuiltins.length === 0}
          className="h-8"
          title={
            allExpanded
              ? "Collapse every card so you can scan the agent list at a glance"
              : "Expand every card to see all derived agents, shortcuts, and apps in one view"
          }
        >
          {allExpanded ? (
            <>
              <Minimize2 className="h-3.5 w-3.5 mr-1.5" />
              Collapse all
            </>
          ) : (
            <>
              <Maximize2 className="h-3.5 w-3.5 mr-1.5" />
              Expand all
            </>
          )}
        </Button>
      </div>

      {visibleBuiltins.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No system agents match &ldquo;{search}&rdquo;.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visibleBuiltins.map((agent) => (
            <LineageCard
              key={agent.id}
              agent={agent}
              derived={derivedBySource.get(agent.id) ?? []}
              apps={appsByAgent.get(agent.id) ?? []}
              appsLoading={appsLoading}
              shortcutsLoading={isShortcutsLoading}
              isOpen={expandedIds.has(agent.id)}
              onToggle={() => toggleOne(agent.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LineageCard({
  agent,
  derived,
  apps,
  appsLoading,
  shortcutsLoading,
  isOpen,
  onToggle,
}: {
  agent: AgentDefinitionRecord;
  derived: AgentDefinitionRecord[];
  apps: AgentAppAdminView[];
  appsLoading: boolean;
  shortcutsLoading: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const shortcuts = useAppSelector((state: RootState) =>
    selectShortcutsByAgentId(state, agent.id),
  );

  const totalRefs = derived.length + shortcuts.length + apps.length;

  return (
    <Card className="overflow-hidden">
      <div className="relative">
        <button
          type="button"
          onClick={onToggle}
          className="w-full flex items-center gap-3 p-3 pr-28 hover:bg-accent/30 transition-colors text-left"
        >
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
            <Cpu className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{agent.name}</div>
            <div className="text-xs text-muted-foreground truncate">
              {agent.description ?? "No description"}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <CountBadge count={derived.length} label="Derived" icon={GitBranch} />
            <CountBadge
              count={shortcuts.length}
              label="Shortcuts"
              icon={Zap}
              loading={shortcutsLoading}
            />
            <CountBadge
              count={apps.length}
              label="Apps"
              icon={AppWindow}
              loading={appsLoading}
            />
            <Link
              href={`${ADMIN_AGENT_BASE}/${agent.id}/build`}
              className="ml-1 text-muted-foreground hover:text-foreground"
              onClick={(e) => e.stopPropagation()}
              aria-label="Open in builder"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </button>
        {/* The header above is a toggle <button> — CopyButtons must never
            nest inside one, so this renders as an absolute sibling overlay. */}
        <CopyButtons
          size="icon"
          label={agent.name}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10"
          human={() =>
            `${agent.name} — ${derived.length} derived, ${shortcuts.length} shortcuts, ${apps.length} apps`
          }
          json={() => ({ agent, derived, shortcuts, apps })}
          agent={() => ({
            kind: "system-agent-lineage-node",
            location:
              "AI Matrx Admin — System Agents · Lineage (/administration/agents/system-agents/lineage)",
            description:
              "One system agent's lineage — derived agents, shortcuts, and apps that reference it.",
            data: {
              id: agent.id,
              name: agent.name,
              description: agent.description,
              derived,
              shortcuts,
              apps,
            },
            attributes: { id: agent.id, totalRefs },
          })}
        />
      </div>

      {isOpen && (
        <div className="border-t border-border bg-muted/20 p-3 space-y-3">
          {totalRefs === 0 ? (
            <div className="text-xs text-muted-foreground px-1">
              Nothing references this agent yet.
            </div>
          ) : null}

          {derived.length > 0 && (
            <Section title="Derived agents" icon={GitBranch}>
              {derived.map((d) => (
                <LineageRow
                  key={d.id}
                  href={`${ADMIN_AGENT_BASE}/${d.id}`}
                  title={d.name}
                  subtitle={`${d.agentType} · updated ${formatDate(
                    d.updatedAt,
                  )}`}
                  badge={d.agentType === "builtin" ? "system" : "user"}
                />
              ))}
            </Section>
          )}

          {shortcuts.length > 0 && (
            <Section title="Shortcuts" icon={Zap}>
              {shortcuts.map((s) => (
                <LineageRow
                  key={s.id}
                  href={
                    isGlobalShortcut(s)
                      ? `/administration/agents/system-agents/edit/${s.id}`
                      : `${ADMIN_AGENT_BASE}/${agent.id}/shortcuts/${s.id}`
                  }
                  title={s.label}
                  subtitle={s.description ?? ""}
                  badge={scopeBadge(s)}
                />
              ))}
            </Section>
          )}

          {apps.length > 0 && (
            <Section title="Agent apps" icon={AppWindow}>
              {apps.map((app) => (
                <LineageRow
                  key={app.id}
                  href={`/administration/agents/agent-apps/edit/${app.id}`}
                  title={app.name}
                  subtitle={app.slug}
                  badge={app.user_id === null ? "system" : app.status}
                />
              ))}
            </Section>
          )}
        </div>
      )}
    </Card>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof GitBranch;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
        <Icon className="h-3 w-3" />
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function LineageRow({
  href,
  title,
  subtitle,
  badge,
}: {
  href: string;
  title: string;
  subtitle?: string;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-md",
        "bg-background hover:bg-accent/50 transition-colors",
        "border border-border/60",
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">{title}</div>
        {subtitle ? (
          <div className="text-[10px] text-muted-foreground truncate">
            {subtitle}
          </div>
        ) : null}
      </div>
      {badge ? (
        <Badge variant="outline" className="text-[9px] shrink-0">
          {badge}
        </Badge>
      ) : null}
      <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
    </Link>
  );
}

function CountBadge({
  count,
  label,
  icon: Icon,
  loading,
}: {
  count: number;
  label: string;
  icon: typeof GitBranch;
  loading?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]",
        count > 0
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground/60 border border-border",
      )}
      title={label}
    >
      <Icon className="h-3 w-3" />
      {loading && count === 0 ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <span className="tabular-nums">{count}</span>
      )}
    </div>
  );
}

function isGlobalShortcut(s: AgentShortcutRecord): boolean {
  return (
    s.userId === null &&
    s.organizationId === null &&
    s.projectId === null &&
    s.taskId === null
  );
}

function scopeBadge(s: AgentShortcutRecord): string {
  if (isGlobalShortcut(s)) return "global";
  if (s.userId) return "user";
  if (s.organizationId) return "org";
  if (s.projectId) return "project";
  if (s.taskId) return "task";
  return "—";
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}
