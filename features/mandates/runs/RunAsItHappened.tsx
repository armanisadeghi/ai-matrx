"use client";

// features/mandates/runs/RunAsItHappened.tsx — LEFT side of the Runs tab: the
// stored run exactly as it happened. Values, where each landed (the stored
// placement — never re-derived), the full output, and Replay exactly. A run
// recorded before placement was saved shows only what its record delivered.

import { RotateCcw } from "lucide-react";
import { Button, RegionSkeleton } from "@ai-matrx/design-system/controls";
import { ConfigurationTable, ConfigurationTableRow } from "@ai-matrx/design-system/controls";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import MarkdownStream from "@ai-matrx/chat/ui/markdown-stream/MarkdownStream";
import { humanizeIdentifier } from "@ai-matrx/kit/text-case";
import { PlacementTable, ValueBox } from "./PlacementTable";
import { RunFacts, StreamedRunBlock } from "./RunFacts";
import { streamReplay, type StoredRun } from "./service";
import type { StoredRunState } from "./useStoredRun";
import { useStreamedRun } from "./useStreamedRun";

const DELIVERED_COLUMNS = [
  { key: "name", label: "Name" },
  { key: "value", label: "Value" },
  { key: "as", label: "Delivered as" },
];

export function RunSectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1.5 mt-4 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground first:mt-0">{children}</h3>;
}

export function StoredRunGate({ stored, children }: { stored: StoredRunState; children: (run: StoredRun) => React.ReactNode }) {
  if (stored.loading && !stored.run) return <RegionSkeleton shape="rows" count={6} aria-label="Reading the run" />;
  if (stored.error || !stored.run) {
    const message = stored.error ?? "The run could not be read.";
    return (
      <div className="space-y-2">
        <p className="flex items-center gap-1 text-[12px] text-destructive">
          {message}
          <ErrorAlchemyMenu error={message} operation="Read the mandate run" />
        </p>
        <Button variant="outline" onClick={stored.retry}>
          Retry
        </Button>
      </div>
    );
  }
  return <>{children(stored.run)}</>;
}

function DeliveredTable({ run }: { run: StoredRun }) {
  const d = run.delivered;
  const rows = [
    ...Object.entries(d?.variables ?? {}).map(([name, value]) => ({ name, value, as: "Variable" })),
    ...Object.entries(d?.context ?? {}).map(([name, value]) => ({ name, value, as: "Context" })),
    ...(d?.userInput ? [{ name: "user_input", value: d.userInput, as: "Message" }] : []),
  ];
  if (rows.length === 0) return <p className="text-[12px] text-muted-foreground">No delivered values recorded</p>;
  return (
    <ConfigurationTable label="Delivered values" columns={DELIVERED_COLUMNS}>
      {rows.map((r) => (
        <ConfigurationTableRow
          key={`${r.as}:${r.name}`}
          columns={DELIVERED_COLUMNS}
          cells={{
            name: <span className="font-medium">{humanizeIdentifier(r.name) || r.name}</span>,
            value: <ValueBox name={r.name} value={r.value} />,
            as: r.as,
          }}
        />
      ))}
    </ConfigurationTable>
  );
}

export function RunAsItHappened({
  stored,
  audience,
  mandateKey,
}: {
  stored: StoredRunState;
  audience: "admin" | "product";
  mandateKey: string;
}) {
  const replay = useStreamedRun();
  return (
    <StoredRunGate stored={stored}>
      {(run) => (
        <div>
          <RunSectionTitle>As it happened</RunSectionTitle>
          {run.notice ? <p className="mb-1.5 text-[12px] text-amber-700 dark:text-amber-400">{run.notice}</p> : null}
          <RunFacts run={run} audience={audience} />

          <RunSectionTitle>Values and placement</RunSectionTitle>
          {run.placement ? (
            <PlacementTable label="Placement of this run" placement={run.placement} values={run.provisions} />
          ) : (
            <div className="space-y-1.5">
              <p className="text-[12px] text-muted-foreground">
                {run.recordedAs === "agent_run" ? "What the agent received" : "Recorded before placement was saved"}
              </p>
              <DeliveredTable run={run} />
            </div>
          )}

          <RunSectionTitle>Output</RunSectionTitle>
          {run.output ? (
            <div className="rounded-md border border-border px-3 py-2 text-sm">
              <MarkdownStream content={run.output} imagePolicy="ai" allowFullScreenEditor={false} />
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground">No output recorded</p>
          )}

          <div className="mt-3 flex items-center gap-2">
            <Button
              icon={<RotateCcw />}
              variant="outline"
              disabled={replay.running}
              title="Runs the model again and stores a test run"
              onClick={() => void replay.start((dispatch, onAdopted) => streamReplay(dispatch, run.conversationId, mandateKey, onAdopted))}
            >
              {replay.running ? "Replaying…" : "Replay exactly"}
            </Button>
          </div>
          <div className="mt-2">
            <StreamedRunBlock label="Replay" state={replay} original={run} audience={audience} />
          </div>
        </div>
      )}
    </StoredRunGate>
  );
}
