"use client";

/**
 * ReplaysTable — the replay comparison, with the cost vocabulary kept strictly
 * separate:
 *
 *   • "Replay cost"   → money Hindsight SPENT re-running the request.
 *   • "Original cost" → what that turn cost when it really ran. A BASELINE
 *                       being beaten, never a charge.
 *
 * A replay that did not complete never spent anything and has nothing to
 * compare — it renders as "did not run" plus the reason, never as `$0.000`,
 * which reads as "free" instead of "never happened".
 */
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import {
  replayBaseline,
  replayFailureReason,
  replayJudgeReasoning,
  replayRan,
  replaySpend,
  type Replay,
} from "../types";
import { conversationHref, exampleDoor } from "../subject-doors";
import { DoorLink } from "./DoorLink";
import { fmtCost, fmtDate, VERDICT_COLOR } from "./tokens";

export function ReplaysTable({ replays }: { replays: Replay[] }) {
  if (replays.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        A replay re-runs the <strong>same original request</strong> on a private
        copy of the conversation with the proposed change applied.{" "}
        <strong>Replay cost</strong> is new money Hindsight spent;{" "}
        <strong>original cost</strong> is what that turn cost when it really ran
        — the baseline being beaten, not a charge.
      </p>
      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Verdict</TableHead>
              <TableHead>Replay cost (spent)</TableHead>
              <TableHead>Original cost (baseline)</TableHead>
              <TableHead>Judge / outcome</TableHead>
              <TableHead>Transcripts</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {replays.map((r) => {
              const ran = replayRan(r);
              const spend = replaySpend(r);
              const baseline = replayBaseline(r);
              const sourceDoor = exampleDoor("conversation", r.source_conversation_id);
              return (
                <TableRow key={r.id} className={cn(!ran && "opacity-80")}>
                  <TableCell>
                    {!ran ? (
                      <Badge
                        variant="outline"
                        className="border-red-500/40 text-red-600 dark:text-red-400"
                      >
                        did not run
                      </Badge>
                    ) : r.verdict ? (
                      <Badge className={cn("border-0", VERDICT_COLOR[r.verdict])}>
                        {r.verdict}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">no verdict</span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {ran ? (
                      fmtCost(spend)
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        nothing spent — it never reached the model
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {ran ? (
                      baseline != null ? (
                        fmtCost(baseline)
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          baseline not recorded
                        </span>
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        nothing to compare
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-md">
                    <span className="line-clamp-2 text-xs text-muted-foreground">
                      {ran
                        ? (replayJudgeReasoning(r) ?? "judge returned no reasoning")
                        : replayFailureReason(r)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      {sourceDoor && (
                        <DoorLink
                          door={{ ...sourceDoor, label: "Original" }}
                          size="xs"
                        />
                      )}
                      {r.replay_conversation_id && (
                        <DoorLink
                          door={{
                            href: conversationHref(r.replay_conversation_id),
                            label: "Replay",
                            external: false,
                          }}
                          size="xs"
                        />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {fmtDate(r.created_at)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
