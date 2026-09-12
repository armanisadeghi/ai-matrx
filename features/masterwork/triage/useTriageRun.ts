"use client";

import { useCallback } from "react";

import type { paths } from "@/types/python-generated/api-types";

import { useMasterworkRun } from "../durable-run/useMasterworkRun";
import { parseTriageResult, type TriageResult } from "./types";

/**
 * Sorting the DRAFT pile by what the Rulebook is FOR — the same durable spine
 * every other Masterwork pipeline uses (`platform.masterwork_run`, operation
 * `triage`), so a refresh mid-run rejoins it instead of losing it.
 *
 * 🚨 The path is a plain string, not `satisfies keyof paths`: the aidream route
 * shipped in this same change and the generated contract could not be
 * regenerated here — `pnpm sync-types` fails at step 1 (`pnpm db-types`) with
 * "Access token not provided … set SUPABASE_ACCESS_TOKEN", a credential this
 * checkout does not have. Run that command where the token exists and this
 * becomes `"/masterworks/triage" satisfies keyof paths`, exactly as
 * `CHECKUP_PATH` did once its route shipped. NEVER hand-edit the generated file.
 */
export const TRIAGE_PATH = "/masterworks/triage";

export interface TriageRunHandle {
  status: "idle" | "rejoining" | "running" | "done" | "error";
  running: boolean;
  /** The server's own sentence for what it is doing right now. */
  stage: string | null;
  error: string | null;
  runId: string | null;
  result: TriageResult | null;
  start: (input: {
    keep: string;
    setAside: string;
    dryRun: boolean;
  }) => Promise<void>;
  /** Wipe a finished sort — the dialog calls it on close, so reopening starts
   * from the form instead of from the last answer. */
  reset: () => void;
}

export function useTriageRun(rulebookId: string): TriageRunHandle {
  const run = useMasterworkRun<TriageResult>({
    surface: "triage",
    rulebookId,
    path: TRIAGE_PATH as keyof paths,
    parseResult: parseTriageResult,
  });

  const start = useCallback(
    async ({
      keep,
      setAside,
      dryRun,
    }: {
      keep: string;
      setAside: string;
      dryRun: boolean;
    }) => {
      await run.launch(
        {
          rulebook_id: rulebookId,
          keep,
          set_aside: setAside,
          dry_run: dryRun,
        },
        "your drafts",
      );
    },
    [run, rulebookId],
  );

  return {
    status: run.status,
    running: run.running,
    stage: run.stage,
    error: run.error,
    runId: run.runId,
    result: run.result,
    start,
    reset: run.reset,
  };
}
