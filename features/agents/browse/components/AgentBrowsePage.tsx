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
import {
  EntityListPage,
  type EntityListSurface,
} from "@/lib/entity-list/components/EntityListPage";
import type { EntityListController } from "@/lib/entity-list/config";
import type { ListScope } from "@/lib/list-scope/types";
import { agentListConfig } from "../listConfig";
import { newAgentHref } from "../agentPaths";
import {
  AGENT_BROWSE_SURFACE,
  AGENT_BROWSE_SURFACE_ADMIN,
} from "../surface";
import { AGENT_LIST_SCOPES, AGENT_LIST_SCOPES_ADMIN } from "../types";
import type { AgentBrowseRow } from "../types";
import { ClassicViewNotice } from "./ClassicViewNotice";

export interface AgentBrowsePageProps {
  /**
   * Where the page opens. The admin System Agents route passes
   * `{ kind: "system" }` because its whole shell is already about the platform
   * corpus; `/agents/all` omits it and opens on Mine. Either way the tabs
   * still switch freely — this is a starting point, never a cage.
   */
  defaultScope?: ListScope;
  /**
   * The agent surface this rendering emits, when it is not the user's Agents
   * Hub. One UI can sit in two contexts: the admin System Agents route emits
   * `matrx-admin/system-agents` (its own manifest, write targets, and
   * bindings) from this very same controller.
   */
  surface?: EntityListSurface<AgentBrowseRow>;
  /**
   * Forwarded to the shell. `(core)` scrolls behind a transparent glass header
   * and must pad for it; `/administration` already begins below the header, so
   * the admin System Agents route passes false.
   */
  clearsShellHeader?: boolean;
}

export function AgentBrowsePage({
  defaultScope,
  surface,
  clearsShellHeader,
}: AgentBrowsePageProps) {
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
      scopes={isAdmin ? AGENT_LIST_SCOPES_ADMIN : AGENT_LIST_SCOPES}
      defaultScope={defaultScope}
      clearsShellHeader={clearsShellHeader}
      surface={
        surface ??
        (isAdmin ? AGENT_BROWSE_SURFACE_ADMIN : AGENT_BROWSE_SURFACE)
      }
      notice={<ClassicViewNotice />}
      headerActions={(list) => (
        <>
          <Button asChild variant="outline" size="sm" className="h-11 lg:h-7">
            <Link href="/agents/orchestras" aria-label="Orchestras">
              <Network className="h-4 w-4" />
              <span className="max-sm:sr-only">Orchestras</span>
            </Link>
          </Button>
          {newAgentButton(list)}
        </>
      )}
      emptyAction={(list) => newAgentButton(list)}
    />
  );
}
