"use client";

/**
 * The AI pipe of `suggest → writeback`: streams POST /seo/findings/draft-fix,
 * the durable command that runs the purpose-built SEO Finding Fixer (aidream
 * slot `seo.finding_fixer`) against ONE finding.
 *
 * It PROPOSES ONLY. The endpoint has no write path; what comes back is a draft
 * the human reads and applies through `applyFindingFix`, which lands it as the
 * page's desired metadata plus a CMS DRAFT. Nothing here publishes.
 *
 * Deliberately the same shape as `usePageAnalyzer` — one durable streamed SEO
 * command, one terminal event carrying the persisted result document.
 */

import { useCallback, useState } from "react";

import { useAppDispatch } from "@/lib/redux/hooks";
import { callApi } from "@/lib/api/call-api";
import type { TypedStreamEvent } from "@/lib/api/types";

const DRAFT_FIX_PATH = "/seo/findings/draft-fix";

/** `seo_finding_fix_proposal` — mirrors aidream `finding_fix_models.py`. */
export interface FindingFixProposal {
  verdict: "fix_drafted" | "needs_more_from_you" | "not_a_problem_here";
  reasoning: string;
  confidence: "high" | "medium" | "low";
  meta_title?: string | null;
  meta_description?: string | null;
  body_markdown?: string | null;
  alt_text?: { image_ref: string; alt: string }[];
  manual_instruction?: string | null;
  risks?: string[];
  missing_inputs?: string[];
}

export interface FindingFixRunResult {
  result_kind: "findings.draft_fix";
  finding_id: string;
  site_id: string;
  page_id: string | null;
  fixer_version: string;
  proposal: FindingFixProposal;
}

export interface FindingFixerState {
  status: "idle" | "running" | "done" | "error";
  stage?: string;
  result?: FindingFixRunResult;
  error?: string;
  runId?: string;
}

const STAGE_LABELS: Record<string, string> = {
  "seo.draft_fix_inputs_gathered":
    "Reading the page, its search queries, and your brand context",
};

function streamData(event: TypedStreamEvent): Record<string, unknown> | null {
  return event.event === "data" ? (event.data as Record<string, unknown>) : null;
}

export function useFindingFixer(findingId: string, organizationId: string) {
  const dispatch = useAppDispatch();
  const [state, setState] = useState<FindingFixerState>({ status: "idle" });

  const run = useCallback(
    async (forceRefresh = false) => {
      setState({ status: "running", stage: "Connecting" });
      let completed: FindingFixRunResult | undefined;
      const outcome = await dispatch(
        callApi({
          path: DRAFT_FIX_PATH,
          method: "POST",
          body: { finding_id: findingId, force_refresh: forceRefresh },
          // The finding's owning site is the authority — never the active org.
          scopeOverrides: { organization_id: organizationId },
          stream: true,
          onStreamEvent: (event) => {
            const data = streamData(event);
            if (!data) return;
            const kind = typeof data.kind === "string" ? data.kind : null;
            if (!kind) return;
            if (kind === "seo.command_run" && typeof data.run_id === "string") {
              setState((current) => ({ ...current, runId: data.run_id as string }));
            }
            if (kind === "seo.draft_fix_completed") {
              const runResult = data.result as FindingFixRunResult | undefined;
              if (runResult?.proposal) {
                completed = runResult;
                setState((current) => ({
                  ...current,
                  status: "done",
                  stage: "Draft ready",
                  result: runResult,
                }));
              }
              return;
            }
            setState((current) => ({
              ...current,
              stage: STAGE_LABELS[kind] ?? "Writing the replacement text",
            }));
          },
        }),
      );
      if (outcome.error) {
        setState((current) => ({
          ...current,
          status: "error",
          error: outcome.error?.message,
        }));
        return;
      }
      if (!completed) {
        setState((current) => ({
          ...current,
          status: "error",
          error: "The fixer finished without returning a draft.",
        }));
      }
    },
    [dispatch, findingId, organizationId],
  );

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, run, reset };
}
