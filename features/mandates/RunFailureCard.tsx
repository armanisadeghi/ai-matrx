"use client";

// features/mandates/RunFailureCard.tsx
//
// A REFUSED RUN STAYS ON THE SCREEN.
//
// 🚨 THE DEFECT (V3 round 4 § honesty): a 409/422 from the run door collapsed
// into a transient toast while the result panel was cleared to nothing. The
// server's sentence — the one thing that says what refused and what to do —
// lived for a few seconds in a bubble the person had to race, and the panel
// underneath it went blank. Toasts are for things you may miss without
// consequence; a refusal is not one of them.
//
// So every run panel renders THIS in place of its result when a run failed, and
// keeps it until the next run replaces it. Nothing here paraphrases the server:
// the headline names the CLASS of refusal (the two the mandate doors are the one
// source of — 409 nothing-fulfils-this-job, 422 the-values-you-sent) and the
// server's own sentence is printed verbatim beneath it, with any notes the
// refusal carried and the request id support would ask for.

import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ServerNotes } from "@/components/official/ServerNotes";
import { TextWithDoors } from "@/components/official/entity-ref/TextWithDoors";
import {
  mandateRefusalHeadline,
  type MandateRunFailure,
} from "./test-run";

export function RunFailureCard({
  failure,
  testId = "mandate-run-failure",
}: {
  failure: MandateRunFailure;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="space-y-2 rounded-lg border border-destructive/60 bg-destructive/5 p-3"
    >
      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
        <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
        <span className="font-semibold text-foreground">
          {mandateRefusalHeadline(failure)}
        </span>
        {failure.status != null ? (
          <Badge variant="destructive" className="py-0 font-mono text-[10px]">
            {failure.status}
          </Badge>
        ) : null}
        {failure.code ? (
          <Badge variant="outline" className="py-0 font-mono text-[10px]">
            {failure.code}
          </Badge>
        ) : null}
      </div>

      {/* Verbatim. The server's words, not ours — and they stay put. Every id
          inside them is a door (THE DOOR LAW): a refusal that names the agent
          or mandate at fault must let the reader go and look at it. */}
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-destructive/10 p-2 text-[11.5px] text-destructive">
        <TextWithDoors text={failure.sentence} />
      </pre>

      {/* THE REMEDY, only where one is honest. A run that never got an HTTP
          answer is the one transient class here (FIX-R2: only a transient
          outcome may invite a retry) — and it used to show the browser's own
          "Failed to fetch" and nothing to do about it. A SERVER refusal gets
          no retry line: 409/422 will refuse again until something changes. */}
      {failure.status == null ? (
        <p className="text-[11.5px] text-muted-foreground">
          Nothing was run and nothing was charged. Check your connection and run
          it again; if it keeps failing, the server is unreachable from here.
        </p>
      ) : null}

      <ServerNotes
        heading="What the server also said"
        notes={failure.notes}
        testId={`${testId}-notes`}
      />

      {failure.requestId ? (
        <p className="font-mono text-[10px] text-muted-foreground">
          request {failure.requestId}
        </p>
      ) : null}
    </div>
  );
}
