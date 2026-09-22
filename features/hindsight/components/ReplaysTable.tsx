"use client";

/**
 * ReplaysTable — the complete replay evidence returned by one review detail.
 *
 * `GET /hindsight/reviews/{id}` loads every replay attached to that review's
 * findings (newest first); its source has no page or fetch cap. The canonical
 * table can therefore honestly use its local total and footer. If that route
 * becomes paged or capped, pass an explicit coverage receipt instead of
 * presenting the loaded slice as all replay evidence.
 *
 * Domain customizations are deliberately limited to the evidence people need
 * to audit: spent replay cost stays separate from the original baseline,
 * outcome text has a full detail panel, and each recorded conversation or
 * workflow run retains its audience-correct door.
 */
import { Badge } from "@/components/ui/badge";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { cn } from "@/lib/utils";

import {
  replayBaseline,
  replayFailureReason,
  replayInFlight,
  replayJudgeReasoning,
  replayRan,
  replaySpend,
  type Replay,
} from "../types";
import {
  conversationHref,
  workflowRunHref,
  type Door,
  type DoorAudience,
} from "../subject-doors";
import { DoorLink } from "./DoorLink";
import { useDoorAudience } from "./door-audience";
import { fmtCost, fmtDate, VERDICT_COLOR } from "./tokens";

function replayStatus(replay: Replay): string {
  if (replayInFlight(replay)) {
    return replay.status === "processing" ? "running" : "queued";
  }
  return replayRan(replay) ? "completed" : "did not run";
}

function replayOutcome(replay: Replay): string {
  if (replayRan(replay)) {
    return replayJudgeReasoning(replay) ?? "judge returned no reasoning";
  }
  if (replayInFlight(replay)) {
    return "waiting for the replay worker — the verdict lands here when it finishes";
  }
  return replayFailureReason(replay);
}

function sourceDoors(replay: Replay, audience: DoorAudience): Door[] {
  const doors: Door[] = [];
  if (replay.source_conversation_id) {
    doors.push({
      href: conversationHref(replay.source_conversation_id, audience),
      label: "Original transcript",
      external: false,
    });
  }
  if (replay.source_wf_run_id) {
    doors.push({
      href: workflowRunHref(replay.source_wf_run_id),
      label: "Original run",
      external: false,
    });
  }
  return doors;
}

function replayDoors(replay: Replay, audience: DoorAudience): Door[] {
  const doors: Door[] = [];
  if (replay.replay_conversation_id) {
    doors.push({
      href: conversationHref(replay.replay_conversation_id, audience),
      label: "Replay transcript",
      external: false,
    });
  }
  if (replay.replay_wf_run_id) {
    doors.push({
      href: workflowRunHref(replay.replay_wf_run_id),
      label: "Replay run",
      external: false,
    });
  }
  return doors;
}

function ReplayDoors({ doors }: { doors: Door[] }) {
  if (doors.length === 0) {
    return <span className="text-xs text-muted-foreground">not recorded</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {doors.map((door) => (
        <DoorLink key={door.href} door={door} size="xs" />
      ))}
    </div>
  );
}

function ReplayStatusCell({ replay }: { replay: Replay }) {
  if (replayInFlight(replay)) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {replayStatus(replay)}
      </Badge>
    );
  }
  if (!replayRan(replay)) {
    return (
      <Badge
        variant="outline"
        className="border-red-500/40 text-red-600 dark:text-red-400"
      >
        did not run
      </Badge>
    );
  }
  return <Badge variant="outline">completed</Badge>;
}

function ReplayVerdictCell({ replay }: { replay: Replay }) {
  if (!replayRan(replay)) {
    return <span className="text-xs text-muted-foreground">not judged</span>;
  }
  if (!replay.verdict) {
    return <span className="text-xs text-muted-foreground">no verdict</span>;
  }
  return (
    <Badge className={cn("border-0", VERDICT_COLOR[replay.verdict])}>
      {replay.verdict}
    </Badge>
  );
}

function ReplayCostCell({ replay }: { replay: Replay }) {
  if (replayRan(replay)) return fmtCost(replaySpend(replay));
  if (replayInFlight(replay)) {
    return (
      <span className="text-xs text-muted-foreground">not yet — in flight</span>
    );
  }
  return (
    <span className="text-xs text-muted-foreground">
      nothing spent — it never reached the model
    </span>
  );
}

function OriginalCostCell({ replay }: { replay: Replay }) {
  if (!replayRan(replay)) {
    return (
      <span className="text-xs text-muted-foreground">nothing to compare</span>
    );
  }
  const baseline = replayBaseline(replay);
  return baseline == null ? (
    <span className="text-xs text-muted-foreground">baseline not recorded</span>
  ) : (
    fmtCost(baseline)
  );
}

function ReplayOutcomeCell({ replay }: { replay: Replay }) {
  const outcome = replayOutcome(replay);
  return (
    <span
      className="block max-w-md truncate text-xs text-muted-foreground"
      title={outcome}
    >
      {outcome}
    </span>
  );
}

function ReplayDetail({
  replay,
  audience,
}: {
  replay: Replay;
  audience: DoorAudience;
}) {
  const outcome = replayOutcome(replay);
  return (
    <div className="space-y-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-xs font-medium uppercase text-muted-foreground">
            Replay cost (spent)
          </div>
          <div className="mt-1 tabular-nums">
            <ReplayCostCell replay={replay} />
          </div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase text-muted-foreground">
            Original cost (baseline)
          </div>
          <div className="mt-1 tabular-nums">
            <OriginalCostCell replay={replay} />
          </div>
        </div>
      </div>
      <div>
        <div className="text-xs font-medium uppercase text-muted-foreground">
          Judge / outcome
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm">
          {outcome}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-xs font-medium uppercase text-muted-foreground">
            Original
          </div>
          <div className="mt-1">
            <ReplayDoors doors={sourceDoors(replay, audience)} />
          </div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase text-muted-foreground">
            Replay
          </div>
          <div className="mt-1">
            <ReplayDoors doors={replayDoors(replay, audience)} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Every audit value has an independent accessor and a table-owned filter. */
export function replayColumns(
  audience: DoorAudience,
): MatrxColumnDef<Replay>[] {
  return [
    {
      id: "status",
      header: "Status",
      accessorFn: replayStatus,
      filter: "select",
      filterOptions: [
        { value: "queued", label: "Queued" },
        { value: "running", label: "Running" },
        { value: "completed", label: "Completed" },
        { value: "did not run", label: "Did not run" },
      ],
      width: 120,
      frozen: true,
      cell: (replay) => <ReplayStatusCell replay={replay} />,
    },
    {
      id: "verdict",
      header: "Verdict",
      accessorFn: (replay) => replay.verdict ?? "not judged",
      filter: "select",
      filterOptions: [
        { value: "better", label: "Better" },
        { value: "same", label: "Same" },
        { value: "worse", label: "Worse" },
        { value: "regressed", label: "Regressed" },
        { value: "not judged", label: "Not judged" },
      ],
      width: 112,
      cell: (replay) => <ReplayVerdictCell replay={replay} />,
    },
    {
      id: "replay-cost",
      header: "Replay cost (spent)",
      accessorFn: (replay) => (replayRan(replay) ? replaySpend(replay) : null),
      filter: "number",
      width: 150,
      align: "right",
      cell: (replay) => <ReplayCostCell replay={replay} />,
    },
    {
      id: "original-cost",
      header: "Original cost (baseline)",
      accessorFn: (replay) =>
        replayRan(replay) ? replayBaseline(replay) : null,
      filter: "number",
      width: 168,
      align: "right",
      cell: (replay) => <OriginalCostCell replay={replay} />,
    },
    {
      id: "outcome",
      header: "Judge / outcome",
      accessorFn: replayOutcome,
      filter: "text",
      width: 340,
      cell: (replay) => <ReplayOutcomeCell replay={replay} />,
    },
    {
      id: "original",
      header: "Original",
      accessorFn: (replay) =>
        [replay.source_conversation_id, replay.source_wf_run_id]
          .filter(Boolean)
          .join(" "),
      filter: "text",
      width: 178,
      mobileHidden: true,
      cell: (replay) => <ReplayDoors doors={sourceDoors(replay, audience)} />,
    },
    {
      id: "replay",
      header: "Replay",
      accessorFn: (replay) =>
        [replay.replay_conversation_id, replay.replay_wf_run_id]
          .filter(Boolean)
          .join(" "),
      filter: "text",
      width: 178,
      mobileHidden: true,
      cell: (replay) => <ReplayDoors doors={replayDoors(replay, audience)} />,
    },
    {
      id: "created-at",
      header: "When",
      accessorKey: "created_at",
      filter: "date",
      defaultSortDirection: "desc",
      width: 158,
      mobileHidden: true,
      cell: (replay) => (
        <span className="whitespace-nowrap text-xs">
          {fmtDate(replay.created_at)}
        </span>
      ),
    },
  ];
}

export function ReplaysTable({ replays }: { replays: Replay[] }) {
  const audience = useDoorAudience();
  if (replays.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="max-w-3xl text-xs text-muted-foreground">
        A replay re-runs the <strong>same original request</strong> on a private
        copy with the proposed change. <strong>Replay cost</strong> is new money
        Hindsight spent; <strong>original cost</strong> is the historical
        baseline, never an additional charge.
      </p>
      <MatrxDataTable<Replay>
        tableId="hindsight/replays"
        data={replays}
        columns={replayColumns(audience)}
        getRowId={(replay) => replay.id}
        defaultSort={{ id: "created-at", direction: "desc" }}
        pageSize={10}
        toolbar={{
          title: "Replay evidence",
          search: true,
          searchPlaceholder: "Search outcomes, transcript IDs, and runs…",
        }}
        detail={{
          title: (replay) => `Replay ${replayStatus(replay)}`,
          description: (replay) => fmtDate(replay.created_at),
          render: (replay) => (
            <ReplayDetail replay={replay} audience={audience} />
          ),
        }}
        emptyState={{ title: "No replay evidence" }}
      />
    </div>
  );
}
