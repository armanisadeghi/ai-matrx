"use client";

import React, { useState } from "react";
import { CircuitBoard } from "lucide-react";
import { SectionToolbar } from "../SectionToolbar";
import { SectionFooter } from "../SectionFooter";
import { getComingSoon } from "@/lib/coming-soon/registry";

// The promise + blocker are READ from the registry — deleting the entry when
// sub-agents ship forces this copy to change with it (CLAUDE.md § Coming Soon).
const COMING_SOON = getComingSoon("agent-connections.sub-agents");

/**
 * Sub-agents are agent_definition rows where `kind = 'subagent'` — invoked by
 * another agent rather than directly by the user. Empty state until the
 * `kind` column migration lands.
 */
export function SubAgentsSection() {
  const [search, setSearch] = useState("");
  return (
    <div className="flex flex-col h-full min-h-0">
      <SectionToolbar
        search={search}
        onSearchChange={setSearch}
        generateLabel="Generate Sub-agent"
        browseLabel="Browse Marketplace"
      />
      <div className="flex-1 overflow-y-auto scrollbar-thin flex items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-center max-w-md px-8 py-12">
          <CircuitBoard className="h-10 w-10 text-muted-foreground/50" />
          <h3 className="text-sm font-semibold text-foreground mt-2">
            {COMING_SOON?.label ?? "Sub-agents"} — coming soon
          </h3>
          <p className="text-sm text-muted-foreground">
            {COMING_SOON?.promise}
          </p>
        </div>
      </div>
      <SectionFooter
        description="Lightweight specialists invoked by other agents. Same shape as a top-level agent, but scoped to a focused job."
        learnMoreLabel="Learn more about sub-agents"
        learnMoreHref="#"
      />
    </div>
  );
}

export default SubAgentsSection;
