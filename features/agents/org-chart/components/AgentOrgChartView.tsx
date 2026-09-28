// features/agents/org-chart/components/AgentOrgChartView.tsx
//
// THE agent org chart surface: automatic links (Orchestras) and manual links
// (recorded structure) in one chart, coloured by kind. Used full-page at
// /agents/org-chart and, rooted at one Conductor, inside the Orchestra builder.
//
// Manual links are edited right on the chart: place an agent under another,
// put an agent under this one, or take it out. Automatic links belong to their
// Orchestra and are changed there — the menu says so and opens it.

"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowUpToLine, MoreHorizontal, Network, Plus, Unlink } from "lucide-react";
import { AgentListInlinePicker } from "@ai-matrx/agents/catalog/react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAllAgents } from "@/features/agents/redux/agent-definition/selectors";
import {
  removeManualManager,
  setManualManager,
} from "@/features/agents/redux/orchestras/orgChartThunks";
import { OrgChart } from "@/components/official/org-chart/OrgChart";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { toast } from "@/lib/toast";
import { AGENT_ORG_EDGE_KINDS } from "../constants";
import { useAgentOrgChart } from "../useAgentOrgChart";
import { AgentOrgCard } from "./AgentOrgCard";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

type PickMode =
  | { kind: "manager-for"; reportId: string } // choose who this agent sits under
  | { kind: "report-of"; managerId: string } // choose an agent to put under this one
  | { kind: "new-root" }; // choose an agent, then who it sits under

export function AgentOrgChartView({
  rootIds,
  emptyTitle = "No org chart yet",
  emptyBody = "Orchestras appear here on their own. You can also place any agent under another by hand.",
}: {
  /** Chart only what hangs under these agents. Omit for the whole chart. */
  rootIds?: string[];
  emptyTitle?: string;
  emptyBody?: string;
}) {
  const dispatch = useAppDispatch();
  const agents = useAppSelector(selectAllAgents);
  const { forest, orchestras, loading, error } = useAgentOrgChart({ rootIds });
  const [selected, setSelected] = useState<string | null>(null);
  const [pick, setPick] = useState<PickMode | null>(null);
  const [pendingReport, setPendingReport] = useState<string | null>(null);

  const nameOf = (id: string) => agents[id]?.name ?? "this agent";

  const place = async (managerId: string, reportId: string) => {
    const res = await dispatch(setManualManager(managerId, reportId));
    if (res.ok) toast.success(`${nameOf(reportId)} now sits under ${nameOf(managerId)}.`);
    else if (res.loop && managerId !== reportId)
      toast.error(
        `${nameOf(managerId)} already sits under ${nameOf(reportId)}, so this would make a loop. Move ${nameOf(managerId)} first.`,
      );
    else toast.error(res.error ?? "Could not save that placement.");
  };

  const onPicked = async (agentId: string) => {
    const mode = pick;
    setPick(null);
    if (!mode) return;
    if (mode.kind === "manager-for") await place(agentId, mode.reportId);
    else if (mode.kind === "report-of") await place(mode.managerId, agentId);
    else {
      // Step 2 of "Add to chart": who does it sit under?
      setPendingReport(agentId);
      setPick({ kind: "manager-for", reportId: agentId });
    }
  };

  const unplace = async (managerId: string, reportId: string) => {
    const res = await dispatch(removeManualManager(managerId, reportId));
    if (res.ok) toast.success(`${nameOf(reportId)} no longer sits under ${nameOf(managerId)}.`);
    else toast.error(res.error ?? "Could not remove that placement.");
  };

  if (forest.length === 0 && loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-textured">
        <SuspenseLoader size="md" centered={false} message="Building the org chart…" />
      </div>
    );
  }

  const addButton = (
    <Button size="sm" variant="outline" className="h-9 bg-card/95 shadow-sm" onClick={() => setPick({ kind: "new-root" })}>
      <Plus className="mr-1 h-3.5 w-3.5" />
      Place an agent
    </Button>
  );

  const pickerTitle =
    pick?.kind === "manager-for"
      ? `Who does ${nameOf(pick.reportId)} sit under?`
      : pick?.kind === "report-of"
        ? `Put an agent under ${nameOf(pick.managerId)}`
        : "Place an agent on the chart";
  const pickerBody =
    pick?.kind === "manager-for"
      ? "This records the structure. It doesn't change what either agent does — to have one agent direct others, make it an Orchestra."
      : pick?.kind === "report-of"
        ? "Pick the agent to place under this one. An agent sits under one manager at a time, so this replaces any earlier placement."
        : "Pick the agent first, then who it sits under.";

  return (
    <div className="relative h-full w-full">
      {error && (
        <div className="absolute inset-x-3 top-14 z-30 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Part of the chart could not load: {error}
          <ErrorAlchemyMenu error={error} operation="Load the agent org chart" />
        </div>
      )}
      <OrgChart
        roots={forest}
        edgeKinds={AGENT_ORG_EDGE_KINDS}
        selectedKey={selected}
        onSelect={setSelected}
        getSearchText={(d) => `${agents[d.agentId]?.name ?? ""} ${d.roleTitle ?? ""}`}
        ariaLabel="Agent org chart"
        toolbar={addButton}
        emptyState={
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-textured p-6 text-center">
            <Network className="h-8 w-8 text-muted-foreground" />
            <div className="text-sm font-semibold text-foreground">{emptyTitle}</div>
            <p className="max-w-sm text-sm text-muted-foreground">{emptyBody}</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setPick({ kind: "new-root" })}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Place an agent
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href="/agents/orchestras">Open Orchestras</Link>
              </Button>
            </div>
          </div>
        }
        renderCard={(n, state) => {
          const d = n.node.data;
          const parentId = d.parentId;
          return (
            <AgentOrgCard
              node={n}
              state={state}
              memberCount={orchestras.get(d.agentId)?.members.length}
              menu={
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="More actions"
                      title="More actions"
                      onClick={(e) => e.stopPropagation()}
                      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuLabel className="text-xs text-muted-foreground">Manual placement</DropdownMenuLabel>
                    <DropdownMenuItem onSelect={() => setPick({ kind: "manager-for", reportId: d.agentId })}>
                      <ArrowUpToLine className="mr-2 h-4 w-4" />
                      Place under another agent…
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setPick({ kind: "report-of", managerId: d.agentId })}>
                      <ArrowDownToLine className="mr-2 h-4 w-4" />
                      Put an agent under this one…
                    </DropdownMenuItem>
                    {parentId && d.edgeKind === "manual" && (
                      <DropdownMenuItem onSelect={() => unplace(parentId, d.agentId)}>
                        <Unlink className="mr-2 h-4 w-4" />
                        Remove from under {nameOf(parentId)}
                      </DropdownMenuItem>
                    )}
                    {parentId && d.edgeKind === "automatic" && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                          <Link href={`/agents/orchestras/${parentId}`}>
                            <Network className="mr-2 h-4 w-4" />
                            Change in the {nameOf(parentId)} Orchestra
                          </Link>
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            />
          );
        }}
      />

      <Dialog
        open={pick !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPick(null);
            setPendingReport(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{pickerTitle}</DialogTitle>
            <DialogDescription>{pickerBody}</DialogDescription>
          </DialogHeader>
          {pick && (
            <AgentListInlinePicker
              key={`${pick.kind}:${pendingReport ?? ""}`}
              consumerId="agent-org-chart-picker"
              onSelect={(id: string) => void onPicked(id)}
              showPinnedAgent={false}
              excludeAgentIds={
                pick.kind === "manager-for"
                  ? [pick.reportId]
                  : pick.kind === "report-of"
                    ? [pick.managerId]
                    : []
              }
              className="h-96 rounded-md border border-border bg-card"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
