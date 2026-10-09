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
//
// A FAILED RUN IS SAID IN THE VISITOR'S WORDS (Applet audit 2026-10-09): `run.error` already carries the
// plain sentence (`@ai-matrx/applets` forVisitor) and the server's own words went to the error inspector. The
// stream's own error line (engineering words) is never drawn here; a job only its owner can fix offers the
// owner the way to it.
//
// A RUN THAT FINISHED WITH NO ANSWER SAYS SO (lane F8, Applet audit 2026-10-09): a "Done" with an empty body
// reads as a broken page. When the run is done and neither the stream, the run nor a kind carries any answer
// text, the visitor reads one plain line and can run it again with the same values.

import type { JobRunView } from "@ai-matrx/applets";
import { LiveRunDisplay } from "@ai-matrx/chat/agents/components/live-run/LiveRunDisplay";
import {
  selectAnswerText,
  selectRequest,
} from "@ai-matrx/chat/agents/redux/execution-system/active-requests/active-requests.selectors";
import { Button } from "@ai-matrx/design-system/controls";
import type { KindInstanceRenderProps } from "@ai-matrx/content-ir-react";

import Link from "next/link";
import { RotateCcw, TriangleAlert, Wrench } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationIds } from "@/features/scopes/redux/selectors/tree";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import { finishedWithoutAnswer, retryOf } from "@/features/applets-host/run-answer";

/** Failures only the Applet's owner can fix (the job was deleted, or is set up wrong). */
const OWNER_FIXES = new Set(["job_unavailable", "job_misconfigured"]);

function NoAnswer({ run }: { run: JobRunView }) {
  const retry = retryOf(run);
  return (
    <div role="status" className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
      <span className="min-w-0">This run finished without an answer.</span>
      {retry ? (
        <Button variant="quiet" icon={<RotateCcw />} onClick={retry}>
          Run again
        </Button>
      ) : null}
    </div>
  );
}

export function AppletRunOutput({
  run,
  appletId,
  ownerOrganizationId,
}: {
  run: JobRunView;
  appletId?: string;
  /** The Applet's organization: its members get the way to the job when only they can fix it. */
  ownerOrganizationId?: string | null;
}) {
  const requestId = run.ref?.requestId ?? null;
  const adopted = useAppSelector((state) => requestId !== null && selectRequest(requestId)(state) !== undefined);
  const memberOrgs = useAppSelector(selectOrganizationIds);
  const streamedAnswer = useAppSelector((state) => (requestId !== null ? selectAnswerText(requestId)(state) : ""));
  const label = run.label ?? "Working";

  if (run.status === "error" && run.error) {
    const canFix =
      OWNER_FIXES.has(run.error.code) && !!appletId && !!ownerOrganizationId && memberOrgs.includes(ownerOrganizationId);
    return (
      <div role="alert" className="flex items-start gap-2 py-1 text-sm text-destructive">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="min-w-0">
          {run.error.message}
          {canFix ? (
            <Link href={`/applets/manage/${appletId}`} className="ml-2 inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline">
              <Wrench className="h-3.5 w-3.5" />
              Fix this job
            </Link>
          ) : null}
        </span>
      </div>
    );
  }
  const empty = finishedWithoutAnswer(run, streamedAnswer);
  if (adopted) {
    return (
      <>
        <LiveRunDisplay requestId={requestId} label={label} />
        {empty ? <NoAnswer run={run} /> : null}
      </>
    );
  }
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
  if (empty) return <NoAnswer run={run} />;
  return null;
}
