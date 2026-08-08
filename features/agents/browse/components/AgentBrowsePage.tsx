"use client";

// features/agents/browse/components/AgentBrowsePage.tsx
//
// /agents/all — the first consumer of the generic entity-list shell
// (lib/entity-list). Everything agent-specific lives in ../listConfig.tsx;
// this file is just the config plus this page's slots (notice, header
// buttons, empty action).

import Link from "next/link";
import { Plus, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { agentListConfig } from "../listConfig";
import { ClassicViewNotice } from "./ClassicViewNotice";

export function AgentBrowsePage() {
  const newAgentButton = (
    <Button asChild size="sm" className="h-11 lg:h-7">
      <Link href="/agents/new" aria-label="New agent">
        <Plus className="h-4 w-4" />
        <span className="max-sm:sr-only">New agent</span>
      </Link>
    </Button>
  );

  return (
    <EntityListPage
      config={agentListConfig}
      notice={<ClassicViewNotice />}
      headerActions={
        <>
          <Button asChild variant="outline" size="sm" className="h-11 lg:h-7">
            <Link href="/agents/sets" aria-label="Agent sets">
              <Network className="h-4 w-4" />
              <span className="max-sm:sr-only">Sets</span>
            </Link>
          </Button>
          {newAgentButton}
        </>
      }
      emptyAction={newAgentButton}
    />
  );
}
