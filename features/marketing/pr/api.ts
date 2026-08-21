/**
 * The Press Room's calls into aidream.
 *
 * Generating angles is an AGENT RUN, not a data read, so it goes to the Python
 * brain — the one case where this surface does not talk to Supabase directly.
 * Rulings are row writes and stay on the direct client path (`data.ts`).
 *
 * "Find my stories" is a DURABLE streamed command (aidream
 * `run_press_angles_command`): the analyst pass is minutes of paid model work
 * and the production gateway severs a synchronous response at 60s — the old
 * JSON call completed server-side behind an HTTP 504 the browser could only
 * read as failure. Same consumption shape as `useFindingFixer`: `callApi`
 * with `stream: true`, milestone events for honest progress, and the terminal
 * `seo.press_angles_completed` event carrying the persisted result document.
 */

import { callApi } from "@/lib/api/call-api";
import type { TypedStreamEvent } from "@/lib/api/types";
import type { AppDispatch } from "@/lib/redux/store";

/** One rejected angle and why. The surface shows these — never a silent thin. */
export interface AngleGate {
  angle_key: string;
  kept: boolean;
  downgraded: boolean;
  reasons: string[];
}

export interface GenerateAnglesResult {
  result_kind: "press.story_angles.generate";
  kept: number;
  dropped: number;
  /** What actually happened to the durable backlog — a converging re-run
   * (everything `unchanged`) must not look identical to a first run. */
  created: number;
  updated: number;
  unchanged: number;
  gates: AngleGate[];
  bundle_stats: {
    fact_count?: number;
    confirmed_fact_count?: number;
    asset_count?: number;
    coverage_count?: number;
    pages_captured?: number;
    pages_failed?: number;
  };
  coverage_assessment: {
    endowments_covered?: string[];
    endowments_absent?: string[];
    evidence_strength?: number;
    notes?: string;
  };
  limitations: string[];
}

export interface GenerateAnglesOptions {
  maxAngles?: number;
  /** Pages of the site's own content to fetch as evidence. */
  capturePages?: number;
  /** Real progress for the surface — the run takes minutes, so a silent
   * spinner would lie about what is happening. */
  onStage?: (stage: string) => void;
}

/** Honest, human words for each milestone the command emits. */
const STAGE_LABELS: Record<string, string> = {
  "seo.command_run": "Reading your confirmed facts, assets and pages",
  "seo.press_evidence_bundle_built":
    "Evidence gathered — asking the analyst what a journalist would care about",
  "seo.press_angles_gated": "Checking every angle against the evidence gates",
  "seo.press_angles_persisted": "Saving what survived",
};

function streamData(event: TypedStreamEvent): Record<string, unknown> | null {
  return event.event === "data" ? (event.data as Record<string, unknown>) : null;
}

/**
 * Analyse a site and persist whatever survives the gates.
 */
export async function generateStoryAngles(
  dispatch: AppDispatch,
  siteId: string,
  options: GenerateAnglesOptions = {},
): Promise<GenerateAnglesResult> {
  let completed: GenerateAnglesResult | undefined;
  const outcome = await dispatch(
    callApi({
      path: "/seo/sites/{site_id}/press/angles/generate",
      pathParams: { site_id: siteId },
      method: "POST",
      body: {
        max_angles: options.maxAngles ?? 12,
        capture_pages: options.capturePages ?? 8,
      },
      stream: true,
      onStreamEvent: (event) => {
        const data = streamData(event);
        if (!data) return;
        const kind = typeof data.kind === "string" ? data.kind : null;
        if (!kind) return;
        if (kind === "seo.press_angles_completed") {
          completed = data.result as GenerateAnglesResult | undefined;
          return;
        }
        const label = STAGE_LABELS[kind];
        if (label) options.onStage?.(label);
      },
    }),
  );
  if (outcome.error) {
    throw new Error(outcome.error.message ?? "Story analysis failed.");
  }
  if (!completed) {
    throw new Error("The analysis finished without returning a result.");
  }
  return completed;
}
