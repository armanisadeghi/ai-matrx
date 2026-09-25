// features/question-desk/data/interviews.ts
//
// Reads and writes for `interview.decision_interview` — the list surface's
// whole data layer. Everything is a direct Supabase call under RLS; the rows a
// reader gets back are exactly the rows the policies admit (the tables are
// `data_class='private'`, granted to the filer and the respondent), so the
// list holds nothing the reader is not already entitled to.

import { readAllRows } from "@ai-matrx/data/db";
import type { ArchiveFilterValue } from "@ai-matrx/design-system";
import { supabase } from "@/utils/supabase/client";
import { tryWriteOne } from "@/utils/supabase/writeOne";
import type {
  DecisionInterviewRow,
  DecisionQuestionRow,
  InterviewListRow,
} from "../types";
import { db } from "./db";

/** A failure a screen must SAY, never swallow. */
export class QuestionDeskReadError extends Error {}

export interface InterviewListResult {
  rows: InterviewListRow[];
}

/**
 * Every interview this person may see, with its three counts.
 *
 * TWO queries, not N+1: the interviews, then ONE grouped read of their
 * questions' status columns. The archive axis is a real parameter (THE
 * ARCHIVED-ITEMS LAW) — `active` hides archived rows, `archived` shows only
 * them, `all` shows both — never a hardcoded predicate.
 */
export async function listInterviews(
  archived: ArchiveFilterValue,
): Promise<InterviewListResult> {
  const interviews = await readAllRows<DecisionInterviewRow>(
    ({ from, to }) => {
      let query = db()
        .from("decision_interview")
        .select("*", { count: "exact" })
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);
      if (archived === "active") query = query.is("archived_at", null);
      else if (archived === "archived") query = query.not("archived_at", "is", null);
      return query;
    },
    { label: `interview.decision_interview[${archived}]` },
  );
  if (interviews.length === 0) return { rows: [] };

  const ids = interviews.map((row) => row.id);
  const counted = await readAllRows<Pick<
    DecisionQuestionRow,
    "interview_id" | "status" | "answered_at" | "delivered_at"
  >>(
    ({ from, to }) =>
      db()
        .from("decision_question")
        .select("interview_id,status,answered_at,delivered_at", { count: "exact" })
        .in("interview_id", ids)
        .is("deleted_at", null)
        .order("interview_id", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    { label: "interview.decision_question counts" },
  );
  const tally = new Map<
    string,
    { open: number; answered: number; delivered: number; total: number }
  >();
  for (const id of ids) {
    tally.set(id, { open: 0, answered: 0, delivered: 0, total: 0 });
  }
  for (const row of counted) {
    const bucket = tally.get(row.interview_id as string);
    if (!bucket) continue;
    bucket.total += 1;
    if (row.delivered_at !== null) bucket.delivered += 1;
    if (row.answered_at !== null) bucket.answered += 1;
    else bucket.open += 1;
  }

  const respondents = await userEmails(
    interviews.map((row) => row.respondent_user_id),
  );

  return {
    rows: interviews.map((row) => {
      const bucket = tally.get(row.id) ?? {
        open: 0,
        answered: 0,
        delivered: 0,
        total: 0,
      };
      return {
        ...row,
        openCount: bucket.open,
        answeredCount: bucket.answered,
        deliveredCount: bucket.delivered,
        totalCount: bucket.total,
        respondentEmail: respondents.get(row.respondent_user_id) ?? null,
      };
    }),
  };
}

/** One interview by id, or null when RLS admits none. */
export async function loadInterview(
  interviewId: string,
): Promise<DecisionInterviewRow | null> {
  const { data, error } = await db()
    .from("decision_interview")
    .select("*")
    .eq("id", interviewId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    throw new QuestionDeskReadError(
      `This interview could not be read: ${error.message}`,
    );
  }
  return (data as DecisionInterviewRow | null) ?? null;
}

/** Archive / unarchive — the row action behind the list's archive axis. */
export async function setInterviewArchived(
  interviewId: string,
  archived: boolean,
): Promise<void> {
  const { error } = await tryWriteOne(
    db()
      .from("decision_interview")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", interviewId)
      .select("id"),
    { action: archived ? "archive" : "restore", noun: "interview" },
  );
  if (error) {
    throw new QuestionDeskReadError(
      `${archived ? "Archiving" : "Unarchiving"} this interview failed: ${error.message}`,
    );
  }
}

/** Stamp `opened_at` the first time a respondent opens the interview. */
export async function markInterviewOpened(
  interview: DecisionInterviewRow,
): Promise<void> {
  if (interview.opened_at) return;
  // write-lands-exempt: first-open stamp guarded by .is("opened_at", null); zero rows means another tab already stamped it
  const { error } = await db()
    .from("decision_interview")
    .update({ opened_at: new Date().toISOString(), status: "in_progress" })
    .eq("id", interview.id)
    .is("opened_at", null);
  // A failure here costs a timestamp, never an answer. It is reported by the
  // caller's console, not by a toast that would interrupt the interview.
  if (error) {
    console.error("[question-desk] opened_at could not be stamped:", error.message);
  }
}

/**
 * WHO IS BEING ASKED. PLAN §5 names respondent as a column, and without it two
 * interviews put to two different people are visually identical (verifier
 * finding 4, 2026-09-12). `auth.users` is not client-readable, so the address
 * comes from the platform's one accessor RPC.
 *
 * A failed lookup is NOT an error for the list — the interviews are still
 * correct — so it degrades to the raw id, which the column labels honestly.
 */
export async function userEmails(
  userIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase.rpc("get_user_emails_by_ids", {
    user_ids: unique,
  });
  if (error) {
    console.warn(
      "[question-desk] respondent emails could not be resolved:",
      error.message,
    );
    return new Map();
  }
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (row?.id && row?.email) map.set(row.id, row.email);
  }
  return map;
}
