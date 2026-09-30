/**
 * The media desk's calls into aidream — Make clip, Headlines, Crisis holding statement.
 *
 * Each is a DURABLE streamed command (aidream `services/media_desk/service.py`):
 * renders and reviews are minutes of browser and model work, past the gateway's
 * 60s sever. Same consumption shape as `../api.ts` (`callApi`, `stream: true`,
 * milestone events for honest progress, the terminal `seo.*_completed` event
 * carrying the result document). The result documents are also the durable
 * record on `seo.collection_run` — the clips gallery reads them back direct
 * from Supabase (`clips-data.ts`).
 */

import { callApi } from "@/lib/api/call-api";
import type { TypedStreamEvent } from "@/lib/api/types";
import type { AppDispatch } from "@/lib/redux/store";
import type { components } from "@/types/python-generated/api-types";

export type CrisisIntake = components["schemas"]["CrisisIntake"];
export type CrisisPerson = components["schemas"]["CrisisPerson"];
export type HeadlineFormat = "news" | "press_release" | "subject_line" | "feature";

// ── result documents (aidream media_desk/service.py models) ─────────────────

export interface PressClipRender {
  pdf_file_id: string;
  preview_file_id: string;
  page_raster_file_ids: string[];
  logo_source: string;
  logo_url: string | null;
  outlet_name: string | null;
  headline: string | null;
  byline: string | null;
  published_at: string | null;
  source_url: string;
  client_found_in_text: boolean;
  removed_placeholders?: unknown[];
  notes?: string[];
}

export interface ClipReview {
  verdict?: string;
  client_present?: boolean;
  junk?: Array<{ description?: string; selector?: string; contains_body?: boolean; page?: number }>;
  drop?: string;
  keep?: string;
  logo_url?: string | null;
  ask_person?: unknown[];
}

export interface ClipRound {
  round: number;
  render: PressClipRender;
  review: ClipReview | null;
  applied_drop: string[];
  applied_root: string | null;
  applied_logo_url: string | null;
}

export interface MakeClipResult {
  result_kind: "press.clip.make";
  status: "finished" | "client_absent";
  source_url: string;
  client_name: string;
  coverage_mention_id: string | null;
  rounds: ClipRound[];
  max_rounds: number;
  clip: PressClipRender | null;
  imperfections: string[];
  message: string;
}

export interface HeadlineCandidate {
  text: string;
  move: string | null;
  charge: string | null;
  char_count: number;
  over_limit: boolean;
}

export interface HeadlineGroup {
  format: HeadlineFormat;
  candidates: HeadlineCandidate[];
  pick: { text: string; why: string | null; char_count: number; over_limit: boolean } | null;
  limit: number | null;
}

export interface HeadlinesResult {
  result_kind: "press.headlines";
  angle_id: string | null;
  formats: HeadlineFormat[];
  facts: Array<{ statement: string; source: string | null }>;
  groups: HeadlineGroup[];
  materials_used: unknown[];
  next_step: string | null;
  subject_line_max_chars: number;
  checks: string[];
}

export interface CheckedStatement {
  text: string;
  words: number;
  notes: string[];
  deltas?: unknown[];
}

export interface CrisisHoldingResult {
  result_kind: "reputation.crisis_holding";
  org_name: string;
  counsel_review_mode: boolean;
  legal_status: string;
  gate: {
    fired: boolean;
    stopped: boolean;
    triggers: Array<{ trigger: string; field: string | null; source: "code" | "agent" }>;
  };
  stop_block: { text: string | null; why: string; on_record_line: string; next_steps: string[] } | null;
  banner: string | null;
  cluster: unknown;
  strategy: unknown;
  short: CheckedStatement | null;
  medium: CheckedStatement | null;
  cautious: CheckedStatement | null;
  qa: unknown[];
  do_not_say: unknown[];
  decay: {
    issued_at: string;
    valid_until: string;
    rule: string;
    rules_considered: string[];
    refresh_triggers: unknown[];
  };
  refusals: unknown[];
  checks: string[];
}

// ── progress words ──────────────────────────────────────────────────────────

export interface Stage {
  kind: string;
  label: string;
}

/** Honest, human words for each milestone. Unknown kinds are skipped, never invented. */
export function stageLabel(data: Record<string, unknown>): string | null {
  const kind = typeof data.kind === "string" ? data.kind : "";
  const round = typeof data.round === "number" ? data.round : null;
  const r = round ? ` (round ${round})` : "";
  switch (kind) {
    case "seo.command_run":
      return "Started";
    case "seo.press_clip_rendering":
      return `Rendering the article in a clean browser${r}`;
    case "seo.press_clip_rendered":
      return `Rendered${r}: logo ${String(data.logo_source ?? "unknown").replaceAll("_", " ")}, ${String(data.pages ?? 0)} page${data.pages === 1 ? "" : "s"}`;
    case "seo.press_clip_reviewing":
      return `The reviewer is checking the clip against the live page${r}`;
    case "seo.press_clip_reviewed": {
      const verdict = String(data.verdict ?? "").replaceAll("_", " ");
      const next = data.next === "rerender" ? " — re-rendering with the fixes" : "";
      return `Reviewed${r}: ${verdict || "no verdict"}${next}`;
    }
    case "seo.press_headlines_writing":
      return "Writing headline candidates from the facts";
    case "seo.crisis_holding_drafting":
      return data.counsel_review_mode
        ? "Drafting the full set for counsel review"
        : "Checking the counsel triggers and drafting";
    case "seo.crisis_holding_gate":
      return "A counsel trigger is present and no counsel is engaged — stopping before any draft";
    case "seo.crisis_holding_checked":
      return "Recounting words and the valid-until window";
    default:
      return null;
  }
}

function streamData(event: TypedStreamEvent): Record<string, unknown> | null {
  return event.event === "data" ? (event.data as Record<string, unknown>) : null;
}

interface RunOptions {
  onStage?: (stage: Stage) => void;
  /** The durable run id (`seo.collection_run`), the moment the server claims it — so a
   * reload or remount can pick the run back up (`rejoin.ts`) instead of losing it. */
  onRun?: (runId: string) => void;
}

/** The ONE consumer shape for the three commands. */
async function consume<T>(
  dispatch: AppDispatch,
  run: (onStreamEvent: (event: TypedStreamEvent) => void) => ReturnType<typeof callApi>,
  finalKind: string,
  what: string,
  options: RunOptions,
): Promise<T> {
  let completed: T | undefined;
  let failure: string | null = null;
  const outcome = await dispatch(
    run((event) => {
      const data = streamData(event);
      if (!data) return;
      const kind = typeof data.kind === "string" ? data.kind : "";
      if (kind === finalKind) {
        completed = data.result as T | undefined;
        return;
      }
      if (kind === "seo.command_failed") {
        const error = data.error as { message?: string } | undefined;
        failure = error?.message ?? `${what} failed.`;
        return;
      }
      if (kind === "seo.run_in_progress") {
        failure = String(data.message ?? "This is already running.");
        return;
      }
      if (kind === "seo.command_run" && typeof data.run_id === "string") {
        options.onRun?.(data.run_id);
      }
      const label = stageLabel(data);
      if (label) options.onStage?.({ kind, label });
    }),
  );
  if (outcome.error) throw new Error(outcome.error.message ?? `${what} failed.`);
  if (failure) throw new Error(failure);
  if (!completed) throw new Error(`${what} finished without returning a result.`);
  return completed;
}

export function makePressClip(
  dispatch: AppDispatch,
  siteId: string,
  body: { url: string; client_name: string; coverage_mention_id?: string | null },
  options: RunOptions = {},
): Promise<MakeClipResult> {
  return consume<MakeClipResult>(
    dispatch,
    (onStreamEvent) =>
      callApi({
        path: "/seo/sites/{site_id}/press/clips",
        pathParams: { site_id: siteId },
        method: "POST",
        body: {
          url: body.url,
          client_name: body.client_name,
          coverage_mention_id: body.coverage_mention_id ?? null,
        },
        stream: true,
        onStreamEvent,
      }),
    "seo.press_clip_completed",
    "Making the clip",
    options,
  );
}

export function writePressHeadlines(
  dispatch: AppDispatch,
  siteId: string,
  body: { angle_id?: string | null; facts?: string[]; formats: HeadlineFormat[]; peg?: string | null },
  options: RunOptions = {},
): Promise<HeadlinesResult> {
  return consume<HeadlinesResult>(
    dispatch,
    (onStreamEvent) =>
      callApi({
        path: "/seo/sites/{site_id}/press/headlines",
        pathParams: { site_id: siteId },
        method: "POST",
        body: {
          angle_id: body.angle_id ?? null,
          facts: body.facts ?? [],
          formats: body.formats,
          peg: body.peg ?? null,
        },
        stream: true,
        onStreamEvent,
      }),
    "seo.press_headlines_completed",
    "Writing headlines",
    options,
  );
}

export function draftCrisisHolding(
  dispatch: AppDispatch,
  siteId: string,
  body: { intake: CrisisIntake; counsel_review_mode: boolean },
  options: RunOptions = {},
): Promise<CrisisHoldingResult> {
  return consume<CrisisHoldingResult>(
    dispatch,
    (onStreamEvent) =>
      callApi({
        path: "/seo/sites/{site_id}/reputation/crisis-holding",
        pathParams: { site_id: siteId },
        method: "POST",
        body,
        stream: true,
        onStreamEvent,
      }),
    "seo.crisis_holding_completed",
    "Drafting the holding statement",
    options,
  );
}
