"use client";

/**
 * RecordsInline — what the `records` tool did, and the ONE case where a person
 * has something to do about it.
 *
 * The tool's eight verbs mostly answer with data the agent then talks about, so
 * this renderer stays out of the way. The exception is a WAIT: under the
 * organization's `ask` setting the agent's change to a table that already
 * existed does not happen, and the result comes back carrying the change, why
 * it waited and how an administrator changes that. That is a decision, and a
 * decision belongs on screen — `<RecordChangeApprovalCard>` is where it is
 * taken (`features/record-change-approvals`).
 *
 * Every other terminal result gets the tool's own sentence rather than a JSON
 * dump: `not_done` when nothing happened, the store's error when it refused,
 * and a short line naming what landed when it did.
 */

import { AlertTriangle } from "lucide-react";

import { RecordChangeApprovalCard } from "@/features/record-change-approvals/RecordChangeApprovalCard";
import { readRecordChangeWait } from "@/features/record-change-approvals/recordChangeApproval";

import type { ToolRendererProps } from "../../types";
import { resultAsObject } from "../_shared";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

function sentenceFor(result: Record<string, unknown>): string | null {
  const notDone = result["not_done"];
  if (typeof notDone === "string" && notDone.trim()) return notDone;
  const count = result["count"];
  if (typeof count === "number") {
    return `${count} ${count === 1 ? "record" : "records"}.`;
  }
  if (result["applied"] === true) {
    const proposal = result["proposal"];
    if (proposal === "table") return "The table was created.";
    if (proposal === "field") return "The column was added.";
  }
  return null;
}

export function RecordsInline({ entry, conversationId }: ToolRendererProps) {
  if (entry.status === "error") {
    return (
      <div className="flex items-start gap-1.5 text-xs text-destructive">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        <span>{entry.errorMessage ?? "The record store refused the call."}</span>
        <ErrorAlchemyMenu error={entry.errorMessage} />
      </div>
    );
  }

  const result = resultAsObject(entry);
  if (!result) return null;

  const wait = readRecordChangeWait(result);
  if (wait) {
    return (
      <RecordChangeApprovalCard
        wait={wait}
        callId={entry.callId}
        {...(conversationId ? { conversationId } : {})}
      />
    );
  }

  const sentence = sentenceFor(result);
  if (!sentence) return null;
  return <p className="text-xs leading-relaxed text-muted-foreground">{sentence}</p>;
}
