"use client";

// The (core) route chrome for /workflows/all. Route chrome lives in
// <PageHeader> — never a faux header inside the body, which is what pushed the
// old catalog's search field into the shell's glass header.

import Link from "next/link";
import { Workflow as WorkflowIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MandateDoorLink } from "@/features/agents/mandates/components/MandateDoorLink";
import { WaitingBadge } from "@/features/workflow-runtime/discovery/components/WaitingBadge";

export function WorkflowsListHeader() {
  return (
    <div className="flex w-full items-center gap-2 px-1">
      <WorkflowIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <h1 className="text-sm font-semibold text-foreground">Workflows</h1>

      {/* The "waiting on you" inbox (census #38), where people already look.
          Renders NOTHING at zero — a permanent "0 waiting" chip trains people
          to stop seeing the control, which costs exactly the parked runs it
          exists to surface. */}
      <WaitingBadge />

      <Button
        asChild
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
      >
        <Link href="/workflows/runs" title="Every run you can see">
          <span className="hidden sm:inline">Runs</span>
          <span className="sm:hidden">Runs</span>
        </Link>
      </Button>

      {/* THE DOOR LAW: the Masterwork Studio is where a workflow is authored,
          and it is the only other place this record lives. `pr-*` on the row
          keeps the last control clear of the shell avatar. */}
      <MandateDoorLink
        feature="workflow"
        label="Workflow agents"
        className="ml-auto"
      />

      <Button
        asChild
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
      >
        <Link href="/masterwork" title="Masterworks — where workflows are built">
          <span className="hidden sm:inline">Masterworks</span>
          <span className="sm:hidden">Build</span>
        </Link>
      </Button>
    </div>
  );
}
