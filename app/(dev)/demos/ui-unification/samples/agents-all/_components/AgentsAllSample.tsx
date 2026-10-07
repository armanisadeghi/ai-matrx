"use client";

/**
 * /agents/all — an HONEST rebuild (owner, 2026-10-03, feedback items 3, 4, 6, 7).
 *
 * The first version of this sample hand-built the rows and HID real features
 * (filters, sort, columns, views, the drift notice, dimensions, the door to
 * Orchestras). This one mounts THE SAME list the real route mounts —
 * `EntityListPage` + `agentListConfig` + the `matrx-user/agents` surface, with
 * the same scopes, header actions and empty action as `AgentBrowsePage`'s
 * "user" variant — so every capability of the real page is here by
 * construction: lanes with counts, the dimension and organization filters,
 * search, filters and sort, column picker, display options, table / cards /
 * compact views, saved view tabs, favorites, inline category edit, row menus,
 * right-click menus, bulk selection, paging and page size.
 *
 * What changes is ONLY the page top and its spacing:
 *   - the header is the sitewide crumb trail (back chevron + crumbs + a
 *     sibling menu per level) with the drift door on the right, instead of a
 *     bare title;
 *   - feature cards (Orchestras, Agent Battles, Templates + one rotating card)
 *     replace description text, with space between that block and the list;
 *   - the header buttons are the 28px capsule control.
 */

import Link from "next/link";
import { useEffect } from "react";
import {
  Brain,
  FileChartColumn,
  Folder,
  GitCompareArrows,
  LayoutTemplate,
  Network,
  Plug,
  Swords,
  Users,
  Zap,
  Plus,
} from "lucide-react";
import { useDriftAlerts } from "@/features/agents/hooks/useDriftAlerts";
import { DriftSeverityBadge } from "@/features/agents/components/usages/DriftSeverityBadge";
import {
  DRIFT_SEVERITY_META,
  sumSeverityCounts,
  worstSeverityFromCounts,
} from "@/features/agents/components/usages/severity";
import type { DriftSeverity } from "@/features/agents/redux/usages/usages.types";
import { CrumbTrailHeader, type CrumbOption } from "@/features/shell/components/header/templates/CrumbTrailHeader";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import type { EntityListController } from "@/lib/entity-list/config";
import { agentListConfig } from "@/features/agents/browse/listConfig";
import { newAgentHref } from "@/features/agents/browse/agentPaths";
import { AGENT_BROWSE_SURFACE } from "@/features/agents/browse/surface";
import { AGENT_LIST_SCOPES, type AgentBrowseRow } from "@/features/agents/browse/types";
import { cn } from "@/lib/utils";

import { FeatureCards, type FeatureCardItem } from "../../_components/page-top/feature-cards";
import { Button, ControlScope } from "@ai-matrx/design-system/controls";

/** The Agents area's own pages — the crumb's sibling menu (nav-data's Agents children). */
const AGENT_PAGES: CrumbOption[] = [
  { label: "All agents", href: "/agents/all", active: true },
  { label: "Orchestras", href: "/agents/orchestras" },
  { label: "Templates", href: "/agents/templates" },
  { label: "Shortcuts", href: "/agents/shortcuts" },
  { label: "Categories", href: "/agents/categories" },
  { label: "Org chart", href: "/agents/org-chart" },
  { label: "Agent Battle", href: "/agents/battle" },
  { label: "Compare agents", href: "/agents/compare" },
];

const FEATURES: FeatureCardItem[] = [
  { href: "/agents/orchestras", icon: Users, title: "Orchestras", line: "Teams of agents under a conductor", tone: "primary" },
  { href: "/agents/battle", icon: Swords, title: "Agent Battles", line: "Pit models and prompts head to head", tone: "warning" },
  { href: "/agents/templates", icon: LayoutTemplate, title: "Templates", line: "Start from a proven agent", tone: "success" },
];

const ROTATING: FeatureCardItem[] = [
  { href: "/agents/shortcuts", icon: Zap, title: "Shortcuts", line: "Run an agent from any menu", tone: "info" },
  { href: "/agent-connections/skills", icon: Brain, title: "Skills", line: "Know-how your agents can load", tone: "info" },
  { href: "/agent-connections", icon: Plug, title: "Connections", line: "Tools, MCP servers and plugins", tone: "info" },
  { href: "/agents/org-chart", icon: Network, title: "Org chart", line: "How your agents fit together", tone: "info" },
  { href: "/agents/compare", icon: GitCompareArrows, title: "Compare", line: "Two agents side by side", tone: "info" },
  { href: "/agents/categories", icon: Folder, title: "Categories", line: "Browse agents by category", tone: "info" },
];

const INFO_ONLY = new Set<DriftSeverity>(["info"]);
/** The drift door's tint: the severity's status tone (the real header's pill). */
const DRIFT_TONE: Record<DriftSeverity, "destructive" | "warning" | "info"> = {
  breaking: "destructive",
  silent_breaking: "destructive",
  warning: "warning",
  info: "info",
};

/**
 * The drift door — the same read, badge and destination as the real header's
 * (`AgentsListHeader`), moved into the crumb header's right slot, where a
 * phone folds it into the shell's ⋮ like every header action.
 */
function DriftDoor() {
  const { alerts, markViewed } = useDriftAlerts();

  useEffect(() => {
    for (const a of alerts) {
      if (!a.viewedAt) markViewed(a.id);
    }
  }, [alerts, markViewed]);

  const totals = sumSeverityCounts(
    alerts.map((a) => ({
      breaking: a.breakingCount,
      silent_breaking: a.silentCount,
      warning: a.warningCount,
      info: a.infoCount,
    })),
  );
  const worstSev = worstSeverityFromCounts(totals, INFO_ONLY);
  const meta = worstSev ? DRIFT_SEVERITY_META[worstSev] : null;

  return (
    <Button
      asChild
      variant="quiet"
      tone={worstSev ? DRIFT_TONE[worstSev] : undefined}
      aria-label={worstSev ? `Agent drift report — ${totals[worstSev]} ${worstSev.replace("_", " ")}` : "Agent drift report"}
    >
      <Link href="/reports/agent-drift" title={meta?.description ?? "Open agent drift report"}>
        {worstSev ? (
          <DriftSeverityBadge
            severity={worstSev}
            count={totals[worstSev]}
            size="sm"
            iconOnly
            className="border-0 bg-transparent p-0"
          />
        ) : (
          <FileChartColumn className="size-4" />
        )}
        <span className="hidden sm:inline">Drift</span>
      </Link>
    </Button>
  );
}

/** The page top: the feature cards. */
function AgentsPageTop() {
  return (
    // The space BETWEEN this block and the list is the list's page-rhythm block gap
    // (lib/layout/page-rhythm.ts) — never padding of its own.
    <div className="flex flex-col gap-3">
      <FeatureCards items={FEATURES} rotating={ROTATING} ariaLabel="Agent features" />
    </div>
  );
}

/** New agent — on /agents/all always the viewer's OWN agent (the admin seat never acts as itself here). */
function NewAgentButton() {
  return (
    <Button asChild variant="primary"><Link href={newAgentHref(false)} aria-label="New agent">
      <Plus aria-hidden />
      <span className="max-sm:sr-only">New agent</span>
    </Link></Button>
  );
}

function HeaderActions(_list: EntityListController<AgentBrowseRow>) {
  return (
    <>
      <Button asChild variant="outline"><Link href="/agents/orchestras" aria-label="Orchestras">
        <Users aria-hidden />
        <span className="max-sm:sr-only">Orchestras</span>
      </Link></Button>
      <NewAgentButton />
    </>
  );
}

export function AgentsAllSample() {
  return (
    <>
      <CrumbTrailHeader
        backHref="/demos/ui-unification"
        trail={[
          { label: "Agents", href: "/agents/all", options: AGENT_PAGES, optionsLabel: "Agents" },
          { label: "All agents", options: AGENT_PAGES, optionsLabel: "Agents" },
        ]}
        right={<DriftDoor />}
      />
      <ControlScope className="h-full">
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-textured">
          {/* THE REAL LIST — identical props to AgentBrowsePage variant "user". */}
          <EntityListPage
            config={agentListConfig}
            scopes={AGENT_LIST_SCOPES}
            // The demo shell already starts content BELOW the header; /agents/all in
            // (core) pulls it under and pads it back. Same resulting geometry.
            clearsShellHeader={false}
            surface={AGENT_BROWSE_SURFACE}
            notice={<AgentsPageTop />}
            headerActions={HeaderActions}
            emptyAction={() => <NewAgentButton />}
          />
        </div>
      </ControlScope>
    </>
  );
}
