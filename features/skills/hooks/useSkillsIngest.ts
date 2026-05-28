/**
 * features/skills/hooks/useSkillsIngest.ts
 *
 * Admin-only hook for the filesystem-ingest surface (Track 1.5 in the
 * handoff). Wraps the `ingestSkills` thunk with explicit dry-run vs apply
 * semantics so the UI can render a preview before committing.
 */

"use client";

import { useState } from "react";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";

import {
  selectIngestError,
  selectIngestLastReport,
  selectIngestStatus,
} from "../redux/skillsSelectors";
import { skillsActions } from "../redux/skillsSlice";
import { ingestSkills } from "../redux/skillsThunks";
import type { IngestReport } from "../types";

export interface UseSkillsIngestResult {
  /** Last server report — set by both dry-run preview and apply. */
  report: IngestReport | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  /** Run a dry-run preview against the given roots. */
  preview: (roots: string[]) => Promise<IngestReport | null>;
  /** Actually apply (writes to skl_definitions). */
  apply: (roots: string[]) => Promise<IngestReport | null>;
  /** Clear the report and reset status to idle. */
  reset: () => void;
  /** True only after a real apply (the report shape doesn't differentiate;
   * we track it locally). */
  appliedAt: number | null;
}

export function useSkillsIngest(): UseSkillsIngestResult {
  const dispatch = useAppDispatch();
  const report = useAppSelector(selectIngestLastReport);
  const status = useAppSelector(selectIngestStatus);
  const error = useAppSelector(selectIngestError);
  const [appliedAt, setAppliedAt] = useState<number | null>(null);

  const run = async (
    roots: string[],
    dryRun: boolean,
  ): Promise<IngestReport | null> => {
    if (!roots.length) return null;
    try {
      const result = await dispatch(ingestSkills({ roots, dryRun }));
      if (ingestSkills.fulfilled.match(result)) {
        if (!dryRun) setAppliedAt(Date.now());
        return result.payload;
      }
      return null;
    } catch {
      return null;
    }
  };

  return {
    report,
    status,
    error,
    preview: (roots) => run(roots, true),
    apply: (roots) => run(roots, false),
    reset: () => {
      dispatch(skillsActions.ingestCleared());
      setAppliedAt(null);
    },
    appliedAt,
  };
}
