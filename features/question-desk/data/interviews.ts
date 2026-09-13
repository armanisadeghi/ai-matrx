// features/question-desk/data/interviews.ts
//
// Reads and writes for `interview.decision_interview` — the list surface's
// whole data layer. Everything is a direct Supabase call under RLS; the rows a
// reader gets back are exactly the rows the policies admit (the tables are
// `data_class='private'`, granted to the filer and the respondent), so the
// list holds nothing the reader is not already entitled to.

import type { ArchiveFilterValue } from "@ai-matrx/design-system";
import type { DecisionInterviewRow, InterviewListRow } from "../types";
import { LIST_CAP, db } from "./db";

/** A failure a screen must SAY, never swallow. */
export class QuestionDeskReadError extends Error {}

export interface InterviewListResult {
  rows: InterviewListRow[];
  /**
   * True when the question read hit the cap, so the counts on screen are a
   * floor rather than a total. The list SAYS so — it never prints a number it
   * knows may be short.
   */
  countsTruncated: boolean;
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
  let query = db()
    .from("decision_interview")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(LIST_CAP);

  if (archived === "active") query = query.is("archived_at", null);
  else if (archived === "archived") query = query.not("archived_at", "is", null);

  const { data, error } = await query;
  if (error) {
    throw new QuestionDeskReadError(
      `The interviews could not be read: ${error.message}`,
    );
  }
  const interviews = (data ?? []) as DecisionInterviewRow[];
  if (interviews.length === 0) return { rows: [], countsTruncated: false };

  const ids = interviews.map((row) => row.id);
  const { data: questionRows, error: questionError } = await db()
    .from("decision_question")
    .select("interview_id,status,answered_at,delivered_at")
    .in("interview_id", ids)
    .is("deleted_at", null)
    .order("interview_id", { ascending: true })
    .limit(LIST_CAP + 1);
  if (questionError) {
    throw new QuestionDeskReadError(
      `The interviews were read but their question counts were not: ${questionError.message}`,
    );
  }

  const counted = questionRows ?? [];
  const countsTruncated = counted.length > LIST_CAP;
  const tally = new Map<
    string,
    { open: number; answered: number; delivered: number; total: number }
  >();
  for (const id of ids) {
    tally.set(id, { open: 0, answered: 0, delivered: 0, total: 0 });
  }
  for (const row of counted.slice(0, LIST_CAP)) {
    const bucket = tally.get(row.interview_id as string);
    if (!bucket) continue;
    bucket.total += 1;
    if (row.delivered_at !== null) bucket.delivered += 1;
    if (row.answered_at !== null) bucket.answered += 1;
    else bucket.open += 1;
  }

  return {
    countsTruncated,
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
  const { error } = await db()
    .from("decision_interview")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", interviewId);
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
