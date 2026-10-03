"use client";

// The (core) route chrome for /workflows/all, on the shared RouteHeader (it
// injects into the shell header; actions fold into "…" by the main column's
// width, so the row fits beside an open canvas) — never a faux header inside the body, which is what pushed the
// old catalog's search field into the shell's glass header.

import Link from "next/link";
import { Workflow as WorkflowIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MandateDoorLink } from "@/features/mandates/components/MandateDoorLink";
import { WaitingBadge } from "@/features/workflow-runtime/discovery/components/WaitingBadge";
import RouteHeader from "@/features/shell/components/header/RouteHeader";

export function WorkflowsListHeader() {
  return (
    <RouteHeader
      left={
        <div className="flex min-w-0 items-center gap-2 pl-1">
          <WorkflowIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h1 className="min-w-0 truncate text-sm font-semibold text-foreground">Workflows</h1>
          {/* The "waiting on you" inbox (census #38), where people already look.
              Renders NOTHING at zero — a permanent "0 waiting" chip trains people
              to stop seeing the control, which costs exactly the parked runs it
              exists to surface. */}
          <WaitingBadge />
        </div>
      }
      right={
        <>
          <Button
            asChild
            variant="ghost"
            size="sm"
            aria-label="Runs"
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
          >
            <Link href="/workflows/runs" title="Every run you can see">
              Runs
            </Link>
          </Button>
          {/* THE DOOR LAW: the Masterwork Studio is where a workflow is authored,
              and it is the only other place this record lives. */}
          <MandateDoorLink feature="workflow" label="Workflow agents" />
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
        </>
      }
    />
  );
}
