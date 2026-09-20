/**
 * Where a decision on a proposal LIVES.
 *
 * A proposal set is drawn inside one assistant message, so the decision on it
 * is message-level state — and the platform already has exactly one durable
 * per-message place for that: `chat.message.metadata`, a jsonb column the
 * signed-in editor of the conversation may write under RLS (`std_update`).
 * No new table is invented here; the merge goes through the canonical
 * optimistic-concurrency primitive `mergeJsonColumn` (CAS on `version`,
 * re-read-and-remerge on a lost race), so two proposal sets — or two people —
 * writing different keys of the same message never lose each other's work.
 *
 * THE DIVISION OF LABOUR, which is the whole reason this file is small:
 *   - What the STORE says is read from the store (`readListTarget` +
 *     `proposalStanding`). An accepted `add` shows as settled because the row
 *     is there, for every viewer, on every device, forever. That is the
 *     platform's own doctrine — receipts persist by reading the ledger, never
 *     by trusting a flag written beside it.
 *   - What the PERSON decided is what this file keeps: the fact that they
 *     said no (which leaves no trace in the store at all), and the outcome
 *     sentence the store answered with, so a refusal is still on screen after
 *     a reload instead of a control that looks untouched.
 *
 * Nothing here is required for correctness of the store — losing this file's
 * data loses the record of a rejection, never a row.
 */

import { mergeJsonColumn, asJsonObject } from "@ai-matrx/data/db";

import { supabase } from "@/utils/supabase/client";

/** The one key this primitive owns inside `chat.message.metadata`. */
export const MESSAGE_METADATA_KEY = "list_change_proposals";

export type ProposalDecisionVerb = "accepted" | "rejected";

export interface ProposalDecision {
  decision: ProposalDecisionVerb;
  /** ISO timestamp of the click. */
  at: string;
  /** What the store answered — absent for a rejection, which never asks it. */
  outcome?: "applied" | "already" | "refused";
  /** The store's own sentence, kept verbatim so a refusal survives a reload. */
  detail?: string;
}

export type ProposalDecisions = Record<string, ProposalDecision>;

type MessageRow = { id: string; version: number; metadata: unknown };

function readDecisions(metadata: unknown): ProposalDecisions {
  const bag = asJsonObject(metadata)[MESSAGE_METADATA_KEY];
  const decisions = asJsonObject(bag).decisions;
  const raw = asJsonObject(decisions);
  const out: ProposalDecisions = {};
  for (const [id, value] of Object.entries(raw)) {
    const entry = asJsonObject(value);
    if (entry.decision !== "accepted" && entry.decision !== "rejected") continue;
    out[id] = {
      decision: entry.decision,
      at: typeof entry.at === "string" ? entry.at : "",
      ...(entry.outcome === "applied" || entry.outcome === "already" || entry.outcome === "refused"
        ? { outcome: entry.outcome }
        : {}),
      ...(typeof entry.detail === "string" ? { detail: entry.detail } : {}),
    };
  }
  return out;
}

function messageRow(messageId: string) {
  return supabase
    .schema("chat")
    .from("message")
    .select("id, version, metadata")
    .eq("id", messageId)
    .maybeSingle();
}

/** Every decision already recorded against this message. `{}` when there are none. */
export async function fetchProposalDecisions(
  messageId: string,
): Promise<ProposalDecisions> {
  const { data, error } = await messageRow(messageId);
  if (error || !data) return {};
  return readDecisions((data as MessageRow).metadata);
}

export type RecordDecisionResult =
  | { status: "saved" }
  /** The decision happened; only the REMEMBERING failed, and it says so. */
  | { status: "not_remembered"; why: string };

/**
 * Remember one decision. Never throws: a decision that the store already
 * honoured must not be undone on screen because the note about it failed.
 */
export async function recordProposalDecision(
  messageId: string,
  proposalId: string,
  decision: ProposalDecision,
): Promise<RecordDecisionResult> {
  const result = await mergeJsonColumn<MessageRow>({
    fetchCurrent: () => messageRow(messageId),
    readColumn: (row) => row.metadata,
    merge: (current) => {
      const own = asJsonObject(current[MESSAGE_METADATA_KEY]);
      const decisions = asJsonObject(own.decisions);
      return {
        ...current,
        [MESSAGE_METADATA_KEY]: {
          ...own,
          decisions: { ...decisions, [proposalId]: decision },
        },
      };
    },
    applyUpdate: ({ value, expectedVersion, nextVersion }) =>
      supabase
        .schema("chat")
        .from("message")
        .update({ metadata: value as never, version: nextVersion })
        .eq("id", messageId)
        .eq("version", expectedVersion)
        .select("id, version, metadata")
        .maybeSingle(),
  });

  if (result.status === "saved") return { status: "saved" };
  if (result.status === "not_found") {
    return {
      status: "not_remembered",
      why: "this message is no longer readable, so the decision could not be written beside it",
    };
  }
  if (result.status === "conflict") {
    return {
      status: "not_remembered",
      why: "another change to this message won the race three times running",
    };
  }
  return {
    status: "not_remembered",
    why:
      result.error instanceof Error
        ? result.error.message
        : String((result.error as { message?: string } | null)?.message ?? result.error),
  };
}
