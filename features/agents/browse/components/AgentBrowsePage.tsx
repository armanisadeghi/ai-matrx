"use client";

// features/agents/browse/components/AgentBrowsePage.tsx
//
// THE agents list — the ONE component behind both `/agents/all` and
// `/administration/agents/system-agents/agents`.
//
// It used to be behind only the first. The admin route rendered a separate
// `SystemAgentsGrid`, and for a year every capability added here (server-side
// facets, sortable/filterable columns, the single action registry, doors,
// Orchestras, right-click parity) simply never reached the system corpus —
// which is why there was no way to build a system Orchestra at all.
//
// The two routes now differ in exactly two declared ways:
//   1. which scope the page OPENS on (`defaultScope`), and
//   2. the shell each is mounted inside.
// Everything else — including where a given row opens, resolved per row in
// ../agentPaths — is shared by construction. There is nothing left to keep in
// sync by hand, which is the point.
//
// Everything agent-specific lives in ../listConfig.tsx; this file is the config
// plus this page's slots (notice, header buttons, empty action).

import Link from "next/link";
import { Plus, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import type { EntityListController } from "@/lib/entity-list/config";
import { agentListConfig } from "../listConfig";
import { newAgentHref } from "../agentPaths";
import { ADMIN_SYSTEM_AGENTS_LIST_SURFACE } from "../adminSurface";
import {
  AGENT_BROWSE_SURFACE,
  AGENT_BROWSE_SURFACE_ADMIN,
} from "../surface";
import { AGENT_LIST_SCOPES, AGENT_LIST_SCOPES_ADMIN } from "../types";
import { ADMIN_SUPPORT_LIST_SCOPES } from "@/lib/list-scope/types"; // admin-support-only: /administration/agents/support
import type { AgentBrowseRow } from "../types";
import { ClassicViewNotice } from "./ClassicViewNotice";

/**
 * WHICH ROUTE is rendering this list. Deliberately a plain string and not a
 * bag of props: both callers are SERVER components, and a function cannot
 * cross that boundary — passing the surface object itself 500s the page
 * ("Functions cannot be passed directly to Client Components"). Everything
 * that differs between the two routes is therefore derived HERE, on the
 * client, from this one serializable word.
 */
export type AgentBrowseVariant = "user" | "system-admin" | "support-admin";

export interface AgentBrowsePageProps {
  /**
   * Default `"user"` — `/agents/all`. `"system-admin"` is the admin System
   * Agents route: it opens on the System scope, emits the
   * `matrx-admin/system-agents` runtime instead of the user's Agents Hub, and
   * does not pad for the glass header (`/administration` already begins below
   * it). It manages the platform's own agents ONLY: the System scope with no
   * scope tabs (Arman, 2026-09-26). `"support-admin"` is Agent support lookup
   * (/administration/agents/support): Organizations / Users / All, for tech
   * support, with no New agent.
   */
  variant?: AgentBrowseVariant;
}

export function AgentBrowsePage({
  variant = "user",
}: AgentBrowsePageProps) {
  const systemAdmin = variant === "system-admin";
  // Agent support lookup (/administration/agents/support): organizations' and
  // people's agents, for tech support. Never the System Agents page, which
  // manages the platform's own agents only (Arman, 2026-09-26).
  const supportAdmin = variant === "support-admin";
  const adminRoute = systemAdmin || supportAdmin;
  // ANY Matrx admin (developer / senior_admin / super_admin) — the same bar the
  // /administration route tree uses. Hiding the tab is a convenience for
  // everyone else, never the security: agx_list_scoped re-checks
  // public.is_platform_admin() and returns zero system rows regardless.
  const isAdmin = useAppSelector(selectIsAdmin);

  // The New button follows the ACTIVE SCOPE. Standing on the System tab and
  // getting a personal agent out of "New agent" is the kind of quiet mismatch
  // that made a separate admin page feel necessary in the first place.
  const newAgentButton = (list: EntityListController<AgentBrowseRow>) => {
    const system = list.query.scope.kind === "system";
    return (
      <Button asChild size="sm" className="h-11 lg:h-7">
        <Link
          href={newAgentHref(system)}
          aria-label={system ? "New system agent" : "New agent"}
        >
          <Plus className="h-4 w-4" />
          <span className="max-sm:sr-only">
            {system ? "New system agent" : "New agent"}
          </span>
        </Link>
      </Button>
    );
  };

  return (
    <EntityListPage
      config={agentListConfig}
      // THE SCOPE COMES FROM THE PAGE (Arman, 2026-09-26: "No one acts as
      // themselves in admin"). The System Agents page MANAGES the platform's
      // own agents: the system corpus alone, with no scope tabs. Browsing an
      // organization's or a person's agents is tech support and lives on the
      // Agent support lookup route. Never Mine / My Orgs / Shared in admin.
      scopes={
        systemAdmin
          ? ["system"]
          : supportAdmin
            ? ADMIN_SUPPORT_LIST_SCOPES // admin-support-only: /administration/agents/support
            : isAdmin
              ? AGENT_LIST_SCOPES_ADMIN
              : AGENT_LIST_SCOPES
      }
      scopeTabs={!systemAdmin}
      defaultScope={
        systemAdmin
          ? { kind: "system" }
          : supportAdmin
            ? { kind: "platform_all" } // admin-support-only: /administration/agents/support
            : undefined
      }
      clearsShellHeader={!adminRoute}
      surface={
        adminRoute
          ? ADMIN_SYSTEM_AGENTS_LIST_SURFACE
          : isAdmin
            ? AGENT_BROWSE_SURFACE_ADMIN
            : AGENT_BROWSE_SURFACE
      }
      notice={<ClassicViewNotice />}
      headerActions={(list) =>
        supportAdmin ? (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-300">
              Support tool
            </span>
            <span className="hidden sm:inline">
              Organizations&apos; and people&apos;s agents, for tech support.
            </span>
          </span>
        ) : (
        <>
          <Button asChild variant="outline" size="sm" className="h-11 lg:h-7">
            <Link href="/agents/orchestras" aria-label="Orchestras">
              <Network className="h-4 w-4" />
              <span className="max-sm:sr-only">Orchestras</span>
            </Link>
          </Button>
          {newAgentButton(list)}
        </>
        )
      }
      emptyAction={supportAdmin ? undefined : (list) => newAgentButton(list)}
    />
  );
}
