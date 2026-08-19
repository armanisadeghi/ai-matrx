"use client";

// features/masterwork/checkup/useCleanCorpusRun.ts
//
// THE CLEAN-UP PASS, wired.
//
// `POST /masterworks/clean-corpus` shipped 2026-08-17 with a real service, a
// DB-bound cleaner Mandate, per-segment idempotency and a durable run — and no
// caller anywhere in the product. Meanwhile the Checkup's `use_cleaned` (which
// defaults TRUE server-side) preferred a cleaned corpus that nothing could
// produce. So the pass this feature's own FEATURE.md describes as "the pass
// that makes the audit good" had never run once.
//
// Manual on purpose, per Arman's ruling ("for now have it as a manual option
// and later decide when to trigger it"): the Checkup never launches it. The
// Expert presses "Clean up my words" in the Final Checkup header, watches a
// real durable run, then re-runs the checkup over the cleaned text.

import { useCallback } from "react";

import type { paths } from "@/types/python-generated/api-types";
import { useMasterworkRun } from "../durable-run/useMasterworkRun";

export const CLEAN_CORPUS_PATH = "/masterworks/clean-corpus" satisfies keyof paths;

/** The terminal `masterwork_corpus_cleaned` payload, narrowed. */
export interface CleanCorpusResult {
  segments: number;
  cleaned: number;
  reused: number;
  failed: number;
}

function parseCleanCorpusResult(raw: unknown): CleanCorpusResult | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === "number" ? v : 0);
  // `segments` is the one field that makes the answer meaningful — a payload
  // without it is not this event, and guessing zeros would report a no-op run
  // as a successful clean.
  if (typeof data.segments !== "number") return null;
  return {
    segments: data.segments,
    cleaned: num(data.cleaned),
    reused: num(data.reused),
    failed: num(data.failed),
  };
}

export interface CleanCorpusRunHandle {
  running: boolean;
  /** The server's own sentence for what it is doing right now. */
  stage: string | null;
  error: string | null;
  result: CleanCorpusResult | null;
  start: () => Promise<void>;
}

export function useCleanCorpusRun(rulebookId: string): CleanCorpusRunHandle {
  const run = useMasterworkRun<CleanCorpusResult>({
    surface: "clean_corpus",
    rulebookId,
    path: CLEAN_CORPUS_PATH,
    parseResult: parseCleanCorpusResult,
  });

  const start = useCallback(async () => {
    await run.launch({ rulebook_id: rulebookId }, "everything you've said");
  }, [run, rulebookId]);

  return {
    running: run.running,
    stage: run.stage,
    error: run.error,
    result: run.result,
    start,
  };
}
