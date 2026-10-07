"use client";

/**
 * AgentLineageTree
 *
 * Admin-only visualization of the "what came from this agent" tree. For each
 * root agent we show:
 *   - Derived agents (other agents whose `sourceAgentId` points here — the
 *     typical "promoted from user → system" linkage).
 *   - Shortcuts pointing at this agent (via `selectShortcutsByAgentId`).
 *   - Applets whose jobs this agent runs: an Applet's job is a mandate, and the
 *     mandate's agent is its default holder or a binding's holder.
 *
 * Each row is a click-through into the matching admin editor. No write
 * operations happen here — this is a read-only map.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import AppLink from "@/components/navigation/AppLink";
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
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { cn } from "@/lib/utils";
import { ReadFailure } from "@/components/read-state/ReadFailure";
import {
  UntrustedCount,
  countReadState,
  type CountRead,
} from "@/components/official/stale-data/UntrustedCount";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useAgentShortcuts } from "@/features/agent-shortcuts/hooks/useAgentShortcuts";
import { selectShortcutsByAgentId } from "@ai-matrx/chat/agents/redux/agent-shortcuts/selectors";
import type { RootState } from "@/lib/redux/store";
import type { AgentSummary as AgentDefinitionRecord } from "@ai-matrx/agents/catalog";
import type { AgentShortcutRecord } from "@ai-matrx/chat/agents/redux/agent-shortcuts/types";
import {
  fetchAppletsAdmin,
  type AppletAdminView,
} from "@/lib/services/applets-admin-service";
import { fetchMandateConsoleData } from "@/features/mandates/admin/service";
import { storedMandateKey } from "@ai-matrx/agents/mandates";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { readOf } from "@/components/read-state/ReadGate";
import { jsonExportItem, csvExportItem } from "@/components/agent-copy/export";
import { useAgentCatalogError, useBuiltinAgents, useCatalogAgents } from "@ai-matrx/chat/agents/identity/agent-catalog-lists";
import { ensureAgentCatalog } from "@ai-matrx/chat/agents/identity/agent-identity";

const ADMIN_AGENT_BASE = "/administration/agents/system-agents/agents";

/** The agents behind each job key the Applets name: the mandate's default holder plus every binding's holder. */
async function agentsByJobKey(rows: AppletAdminView[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const keys = [...new Set(rows.flatMap((r) => r.job_keys))];
  if (keys.length === 0) return out;
  const data = await fetchMandateConsoleData({ mandateKeys: keys.map(storedMandateKey) });
  for (const m of data.mandates) {
    const ids = new Set<string>();
    if (m.default_holder_type === "agent" && m.default_holder_id) ids.add(m.default_holder_id);
    for (const b of data.bindingsByMandateId[m.id] ?? []) {
      if (b.holder_type === "agent" && b.holder_id) ids.add(b.holder_id);
    }
    out.set(m.mandate_key, [...ids]);
  }
  return out;
}

export function AgentLineageTree() {
  const dispatch = useAppDispatch();
  const builtins = useBuiltinAgents();
  const allAgents = useCatalogAgents();

  // Hydrate both shortcut scopes so selectShortcutsByAgentId returns everything
  // the admin should see (global + anything else visible via RLS).
  const globalQuery = useAgentShortcuts({ scope: "global" });
  const userQuery = useAgentShortcuts({ scope: "user" });

  const [apps, setApps] = useState<AppletAdminView[]>([]);
  const [jobAgents, setJobAgents] = useState<Map<string, string[]>>(new Map());
  const [appsLoading, setAppsLoading] = useState(true);
  const [appsError, setAppsError] = useState<unknown>(null);
  // The list read's failure is the catalog's own error.
  const agentsError = useAgentCatalogError();
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    void ensureAgentCatalog();
    setAppsLoading(true);
    setAppsError(null);
    fetchAppletsAdmin({ limit: 500 })
      .then(async (rows) => {
        const agents = await agentsByJobKey(rows);
        setApps(rows);
        setJobAgents(agents);
      })
      .catch((e: unknown) => {
        setApps([]);
        setJobAgents(new Map());
        setAppsError(e);
      })
      .finally(() => setAppsLoading(false));
  }, [dispatch, reloadKey]);

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
    const map = new Map<string, AppletAdminView[]>();
    for (const app of apps) {
      const agentIds = new Set(app.job_keys.flatMap((key) => jobAgents.get(storedMandateKey(key)) ?? []));
      for (const agentId of agentIds) {
        const list = map.get(agentId) ?? [];
        list.push(app);
        map.set(agentId, list);
      }
    }
    return map;
  }, [apps, jobAgents]);

  const isShortcutsLoading = globalQuery.isLoading || userQuery.isLoading;
  const shortcutsError = globalQuery.error ?? userQuery.error;

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

  if (agentsError && builtins.length === 0) {
    return (
      <ReadFailure
        error={agentsError}
        what="system agents"
        onRetry={() => setReloadKey((k) => k + 1)}
      />
    );
  }

  if (builtins.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 flex items-center justify-center gap-2 type-body text-muted-foreground">
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
        <span className="type-secondary text-muted-foreground shrink-0">
          <UntrustedCount
            value={visibleBuiltins.length}
            trustworthy={!agentsError}
            label="System agents"
          />{" "}
          agent
          {visibleBuiltins.length !== 1 ? "s" : ""}
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
              export={{
                items: [
                  jsonExportItem(() => buildLineageEntries(visibleBuiltins)),
                  csvExportItem(
                    () =>
                      buildLineageEntries(visibleBuiltins).map((e) => ({
                        id: e.id,
                        name: e.name,
                        description: e.description,
                        derived_count: e.derived.length,
                        shortcuts_count: e.shortcuts.length,
                        apps_count: e.apps.length,
                      })),
                    "CSV",
                  ),
                ],
              }}
            />
          </>
        )}
        <Button
          variant="outline"
          onClick={allExpanded ? handleCollapseAll : handleExpandAll}
          disabled={visibleBuiltins.length === 0}
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
          <CardContent className="p-8 text-center type-body text-muted-foreground">
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
              appsFailed={appsError != null}
              shortcutsLoading={isShortcutsLoading}
              shortcutsFailed={shortcutsError != null}
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
  appsFailed,
  shortcutsLoading,
  shortcutsFailed,
  isOpen,
  onToggle,
}: {
  agent: AgentDefinitionRecord;
  derived: AgentDefinitionRecord[];
  apps: AppletAdminView[];
  appsLoading: boolean;
  appsFailed: boolean;
  shortcutsLoading: boolean;
  shortcutsFailed: boolean;
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
          aria-expanded={isOpen}
          aria-label={`${isOpen ? "Collapse" : "Expand"} lineage for ${agent.name}`}
          className="absolute inset-0 w-full rounded-t-lg hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring transition-colors"
        />
        <div className="relative pointer-events-none w-full flex items-center gap-3 p-3 pr-28 text-left">
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary-ink shrink-0">
            <Cpu className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <EntityRef
              token="agent"
              id={agent.id}
              name={agent.name}
              href={`${ADMIN_AGENT_BASE}/${agent.id}/build`}
              showIcon={false}
              className="pointer-events-auto type-body"
              labelClassName="font-medium"
            />
            <div className="type-secondary text-muted-foreground truncate">
              {agent.description ?? "No description"}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <CountBadge
              count={derived.length}
              label="Derived"
              icon={GitBranch}
            />
            <CountBadge
              count={shortcuts.length}
              label="Shortcuts"
              icon={Zap}
              read={readOf({ isLoading: shortcutsLoading, isError: shortcutsFailed })}
            />
            <CountBadge
              count={apps.length}
              label="Apps"
              icon={AppWindow}
              read={readOf({ isLoading: appsLoading, isError: appsFailed })}
            />
          </div>
        </div>
        {/* The header above is a toggle <button> — CopyButtons must never
            nest inside one, so this renders as an absolute sibling overlay. */}
        <CopyButtons
          size="icon"
          label={agent.name ?? agent.id}
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
            <div className="type-secondary text-muted-foreground px-1">
              Nothing references this agent yet.
            </div>
          ) : null}

          {derived.length > 0 && (
            <Section title="Derived agents" icon={GitBranch}>
              {derived.map((d) => (
                <LineageRow
                  key={d.id}
                  href={`${ADMIN_AGENT_BASE}/${d.id}`}
                  title={d.name ?? d.id}
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
            <Section title="Applets" icon={AppWindow}>
              {apps.map((app) => (
                <LineageRow
                  key={app.id}
                  href={`/administration/applets/edit/${app.id}`}
                  title={app.name}
                  badge={app.created_by === null ? "system" : app.status}
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
      <div className="flex items-center gap-1.5 type-meta uppercase tracking-wider text-muted-foreground font-medium">
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
    <AppLink
      href={href}
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-md",
        "bg-background hover:bg-accent/50 transition-colors",
        "border border-border/60",
      )}
       target="_blank"
       rel="noopener noreferrer"
     >
      <div className="flex-1 min-w-0">
        <div className="type-secondary font-medium truncate">{title}</div>
        {subtitle ? (
          <div className="type-meta text-muted-foreground truncate">
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
    </AppLink>
  );
}

function CountBadge({
  count,
  label,
  icon: Icon,
  read,
}: {
  count: number;
  label: string;
  icon: typeof GitBranch;
  /** The read behind the count — "—" when it failed, a spinner while it is in flight. */
  read?: CountRead;
}) {
  const state = countReadState({ read });
  return (
    <div
      className={cn(
        "flex items-center gap-1 px-1.5 py-0.5 rounded type-meta",
        state === "ready" && count > 0
          ? "bg-primary/10 text-primary-ink"
          : "text-muted-foreground/60 border border-border",
      )}
      title={label}
    >
      <Icon className="h-3 w-3" />
      {state === "loading" ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : read ? (
        <UntrustedCount read={read} value={count} label={label} className="tabular-nums" />
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
