"use client";

// features/applets-host/AppletRunOutput.tsx — HOW AN APPLET'S JOB RUN SHOWS: THE ONE LIVE-RUN PIPELINE.
//
// `@ai-matrx/applets` `<JobOutput job>` hands every run to the host (`renderRun`, CONTRACTS amendment 2.4).
// The run's stream was adopted into the execution system when it started (`adoptAppletRunStreams` in
// AppletHostMount), so it renders through `LiveRunDisplay` → `MarkdownStream` → the kind registry exactly
// like a chat stream: text and partial kinds as they arrive, tool and phase states, the error, the final
// kind. No parsing and no spinner of our own.
//
// A run this tab did not adopt (it was refused before a request existed, or it was read back after a
// reload) has no request row; then the run's own settled answer is all there is: its kind, or its error.

import type { JobRunView } from "@ai-matrx/applets";
import { LiveRunDisplay } from "@ai-matrx/chat/agents/components/live-run/LiveRunDisplay";
import { selectRequest } from "@ai-matrx/chat/agents/redux/execution-system/active-requests/active-requests.selectors";
import type { KindInstanceRenderProps } from "@ai-matrx/content-ir-react";

import { useAppSelector } from "@/lib/redux/hooks";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";

export function AppletRunOutput({ run }: { run: JobRunView }) {
  const requestId = run.ref?.requestId ?? null;
  const adopted = useAppSelector((state) => requestId !== null && selectRequest(requestId)(state) !== undefined);
  const label = run.label ?? "Working";

  if (adopted) return <LiveRunDisplay requestId={requestId} label={label} />;
  if (run.status === "resolving" || (run.status === "running" && !run.result)) return <LiveRunDisplay pending label={label} />;
  if (run.result) {
    return (
      <KindInstanceRender
        kind={run.result.__kind}
        value={run.result as KindInstanceRenderProps["value"]}
        showRoutingNote={false}
        variant="bare"
      />
    );
  }
  if (run.error) return <p className="text-xs text-destructive">{run.error.message}</p>;
  return null;
}
