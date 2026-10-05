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
          <h1 className="shrink-0 text-sm font-semibold text-foreground">Workflows</h1>
          {/* THE DOOR LAW: the workflow agents door. It draws nothing in the row
              (disclosure lives in the shell's Agents menu), so it sits outside
              the folding actions — an empty "…" row is a dead end. */}
          <MandateDoorLink feature="workflow" label="Workflow agents" />
        </div>
      }
      right={
        <>
          <Button
            asChild
            variant="quiet"
            aria-label="Runs"
          >
            <Link href="/workflows/runs" title="Every run you can see">
              Runs
            </Link>
          </Button>
          <Button
            asChild
            variant="quiet"
          >
            <Link href="/masterwork" title="Masterworks — where workflows are built">
              <span className="hidden sm:inline">Masterworks</span>
              <span className="sm:hidden">Build</span>
            </Link>
          </Button>
          {/* The "waiting on you" inbox (census #38), where people already look.
              Renders NOTHING at zero — a permanent "0 waiting" chip trains people
              to stop seeing the control, which costs exactly the parked runs it
              exists to surface. Last = the primary: Runs and Masterworks fold
              into "…" before it leaves the row. */}
          <WaitingBadge />
        </>
      }
    />
  );
}
