/**
 * holdsADecision — does this tool call carry a write the record store HELD for a person?
 *
 * A held write is a question waiting on the person (Approve / Refuse), not process detail. Every
 * fold in chat — the consecutive-call batch line and the settled turn's "Worked for Ns" group —
 * asks this before it hides a call, so a pending decision is never folded away (lane HANDOVER,
 * 2026-09-27: two held columns in Cedar Ridge's chat sat inside a folded "Records · 2 calls" line
 * after a reload).
 */
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import type { CxToolCallRecord } from "@/features/agents/redux/execution-system/observability/observability.slice";
import { readRecordChangeWait } from "@/features/record-change-approvals/recordChangeApproval";

import { resultAsObject } from "../renderers/_shared";
import { cxToolCallToLifecycleEntry } from "../utils/cxToolCallToLifecycleEntry";

export function holdsADecision(entry: ToolLifecycleEntry | null | undefined): boolean {
  if (!entry || entry.status !== "completed") return false;
  return readRecordChangeWait(resultAsObject(entry)) !== null;
}

/** The same question for a persisted call row (a reloaded conversation). */
export function recordHoldsADecision(record: CxToolCallRecord | null | undefined): boolean {
  return record ? holdsADecision(cxToolCallToLifecycleEntry(record)) : false;
}
