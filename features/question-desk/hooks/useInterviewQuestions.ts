"use client";

// features/question-desk/hooks/useInterviewQuestions.ts
//
// The interview's rows, kept live.
//
// One `useRealtimeChannel` (`@ai-matrx/data/react` — never a raw `.channel(`)
// on `interview.decision_question` filtered to this interview, so a question an
// agent files or updates over MCP appears without a reload. Both tables are in
// the `supabase_realtime` publication with `REPLICA IDENTITY FULL` (verified
// live 2026-09-12; guarded by `pnpm check:realtime-publication`).
//
// ECHO SUPPRESSION IS VERSION-MONOTONIC (supabase-realtime skill, rule 1).
// Supabase delivers your OWN writes 50–500 ms after the REST response already
// returned the fresh row, so an "is a save in flight" flag always misses them.
// The canonical `version` int is bumped by `platform._touch_row` on every
// UPDATE, so a payload whose version is not NEWER than the row already held
// carries no information and is dropped. A payload that IS newer lands, even
// while a save is in flight — that is a real change from somewhere else and
// hiding it is how two people overwrite each other.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRealtimeChannel } from "@ai-matrx/data/react";
import { supabase } from "@/utils/supabase/client";
import type { DecisionQuestionRow } from "../types";
import { listQuestions } from "../data/questions";

export interface InterviewQuestionsState {
  questions: DecisionQuestionRow[];
  loading: boolean;
  /** The read's own failure, in its words. Never a silent empty list. */
  error: string | null;
  /** The question read hit its cap — the interview on screen is short. */
  truncated: boolean;
  /** Merge a row this tab just wrote (or re-read) into the held list. */
  applyRow: (row: DecisionQuestionRow) => void;
  reload: () => void;
}

export function useInterviewQuestions(
  interviewId: string,
): InterviewQuestionsState {
  const [questions, setQuestions] = useState<DecisionQuestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    void (async () => {
      try {
        const result = await listQuestions(interviewId);
        if (!live) return;
        setQuestions(result.questions);
        setTruncated(result.truncated);
        setError(null);
      } catch (readError) {
        if (!live) return;
        setError(
          readError instanceof Error ? readError.message : String(readError),
        );
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [interviewId, reloadToken]);

  const applyRow = useCallback((row: DecisionQuestionRow) => {
    setQuestions((current) => mergeRow(current, row));
  }, []);

  // Hold the merge in a ref so the channel is never torn down and rebuilt by a
  // changing callback identity (useRunListRealtime's pattern).
  const applyRef = useRef(applyRow);
  applyRef.current = applyRow;

  const bindings = useMemo(
    () =>
      (["INSERT", "UPDATE"] as const).map((event) => ({
        event,
        schema: "interview",
        table: "decision_question",
        filter: `interview_id=eq.${interviewId}`,
        onChange: (payload: { new?: unknown }) => {
          const row = payload.new as DecisionQuestionRow | undefined;
          if (!row || typeof row.id !== "string") return;
          applyRef.current(row);
        },
      })),
    [interviewId],
  );

  useRealtimeChannel(
    supabase,
    `question-desk-${interviewId}`,
    bindings,
    {
      enabled: interviewId.length > 0,
      // Realtime has no replay: events during a dropped socket are gone, so a
      // recovered subscription re-reads the interview rather than trusting the
      // rows it happens to hold.
      onReconnect: () => setReloadToken((token) => token + 1),
    },
  );

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { questions, loading, error, truncated, applyRow, reload };
}

/** Version-monotonic merge. An older-or-equal payload is dropped. */
function mergeRow(
  current: DecisionQuestionRow[],
  incoming: DecisionQuestionRow,
): DecisionQuestionRow[] {
  const index = current.findIndex((row) => row.id === incoming.id);
  if (index === -1) {
    if (incoming.deleted_at) return current;
    const next = [...current, incoming];
    next.sort(byPosition);
    return next;
  }
  const held = current[index];
  if (
    typeof incoming.version === "number" &&
    typeof held.version === "number" &&
    incoming.version <= held.version
  ) {
    return current;
  }
  if (incoming.deleted_at) return current.filter((row) => row.id !== incoming.id);
  const next = [...current];
  next[index] = incoming;
  return next;
}

function byPosition(a: DecisionQuestionRow, b: DecisionQuestionRow): number {
  if (a.position !== b.position) return a.position - b.position;
  return a.created_at.localeCompare(b.created_at);
}
