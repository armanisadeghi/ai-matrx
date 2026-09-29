/**
 * The news monitor run view's direct reads and writes (React → Supabase, RLS).
 *
 * - A monitor's runs: `workflow.run` rows of the "News monitor run" template,
 *   whose `input.tracker_id` names the monitor.
 * - One run's documents: the LAST step's output of that run
 *   (`workflow.node_outcome`), read as JSON subtrees so a 500 KB run document
 *   never crosses the wire whole.
 * - The monitor's stories: `seo.tracker_story` — the row carries its own
 *   display evidence; no story screen reads `web.news_item` (spec §5.3).
 * - Surface anyway / undo and dismiss-with-reason / undo: `guardedUpdate`
 *   writes to `seo.tracker_story` under its existing RLS (spec §12 Lane G).
 *   The engine honours both on its next commit (aidream
 *   `services/news/store.py::commit_stories`: a dismissed story stays
 *   dismissed; a story surfaced anyway is never withheld again).
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { guardedUpdate } from "@ai-matrx/data/db";

import type {
  StoryDismissReason,
  TrackerStoryRow,
} from "@/features/marketing/data/coverage-types";
import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";

import {
  isRecord,
  readNotices,
  records,
  type RunParts,
} from "./run-document";

export const newsMonitorKeys = {
  all: ["marketing", "news-monitor"] as const,
  runs: (trackerId: string) =>
    [...newsMonitorKeys.all, "runs", trackerId] as const,
  run: (runId: string) => [...newsMonitorKeys.all, "run", runId] as const,
  stories: (trackerId: string) =>
    [...newsMonitorKeys.all, "stories", trackerId] as const,
};

function fail(error: unknown, what: string): never {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error);
  throw new Error(`Could not ${what}: ${message}`);
}

async function authed() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase;
}

// ── runs ──────────────────────────────────────────────────────────────────

export interface MonitorRunRow {
  id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  trigger: string | null;
}

export async function listMonitorRuns(
  trackerId: string,
  signal?: AbortSignal,
): Promise<MonitorRunRow[]> {
  const client = await authed();
  const response = await client
    .schema("workflow")
    .from("run")
    .select("id, status, created_at, completed_at, input")
    .eq("input->>tracker_id", trackerId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(20)
    .abortSignal(signal ?? new AbortController().signal);
  if (response.error) fail(response.error, "load this monitor's runs");
  return (response.data ?? []).map((row) => ({
    id: row.id,
    status: row.status,
    created_at: row.created_at,
    completed_at: row.completed_at,
    trigger:
      isRecord(row.input) && typeof row.input.trigger === "string"
        ? row.input.trigger
        : null,
  }));
}

export function useMonitorRuns(trackerId: string | null, pollMs: number | false) {
  return useQuery({
    queryKey: newsMonitorKeys.runs(trackerId ?? ""),
    queryFn: ({ signal }) => listMonitorRuns(trackerId ?? "", signal),
    enabled: Boolean(trackerId),
    refetchInterval: pollMs,
  });
}

/** Every subtree the run view shows, from the run's latest step output. */
const RUN_PARTS_SELECT = [
  "node_id",
  "step",
  "summary:output->run->summary",
  "digest:output->run->digest",
  "report:output->run->report",
  "triage:output->run->triage",
  "angle_sets:output->run->angle_sets",
  "verdicts:output->run->verdicts",
  "client_context:output->run->client_context",
  "withheld:output->run->candidates->withheld",
  "diagnostics:output->run->candidates->diagnostics",
  "rejected:output->run->relevant->coarse_relevance->rejected_signals",
  "pre_gated:output->run->clustered->pre_gated_stale",
  "notices:output->run->notices",
  "stages:output->run->stages",
].join(", ");

export async function getRunParts(
  runId: string,
  signal?: AbortSignal,
): Promise<RunParts | null> {
  const client = await authed();
  const response = await client
    .schema("workflow")
    .from("node_outcome")
    .select(RUN_PARTS_SELECT)
    .eq("run_id", runId)
    .is("deleted_at", null)
    .order("step", { ascending: false })
    .limit(1)
    .abortSignal(signal ?? new AbortController().signal)
    .maybeSingle();
  if (response.error) fail(response.error, "load this run");
  const row = response.data as Record<string, unknown> | null;
  if (!row) return null;
  const rec = (v: unknown) => (isRecord(v) ? v : null);
  const verdicts: Record<string, Record<string, unknown>> = {};
  if (isRecord(row.verdicts)) {
    for (const [key, value] of Object.entries(row.verdicts)) {
      if (key !== "__kind" && isRecord(value)) verdicts[key] = value;
    }
  }
  return {
    runId,
    nodeId: String(row.node_id ?? ""),
    summary: rec(row.summary),
    digest: rec(row.digest),
    report: rec(row.report),
    triage: rec(row.triage),
    angleSets: records(row.angle_sets),
    verdicts,
    clientContext: rec(row.client_context),
    withheld: row.withheld,
    diagnostics: rec(row.diagnostics),
    rejected: row.rejected,
    preGated: row.pre_gated,
    notices: readNotices(row.notices),
    stages: records(row.stages),
  };
}

export function useRunParts(runId: string | null, pollMs: number | false) {
  return useQuery({
    queryKey: newsMonitorKeys.run(runId ?? ""),
    queryFn: ({ signal }) => getRunParts(runId ?? "", signal),
    enabled: Boolean(runId),
    refetchInterval: pollMs,
  });
}

// ── stories ───────────────────────────────────────────────────────────────

const STORY_COLUMNS =
  "id, tracker_id, story_key, title, outlet_count, first_seen_at, first_surfaced_at, last_run_id, " +
  "coarse_decision, freshness_status, freshness_basis, withheld_reason, status, hold_reason, " +
  "triage_tier, triage_watch_reason, proof_gated, off_policy, newsworthiness_score, newsworthiness_band, " +
  "surfaced_override_by, surfaced_override_at, alerted_at, consolidated_into_story_key, evidence, " +
  "dismissed_by, dismissed_at, dismissed_reason, feedback_note, organization_id, version, metadata, " +
  "latest, member_item_ids, member_url_keys, created_by, updated_by, created_at, updated_at, deleted_at";

export async function listTrackerStories(
  trackerId: string,
  signal?: AbortSignal,
): Promise<TrackerStoryRow[]> {
  const client = await authed();
  const response = await client
    .schema("seo")
    .from("tracker_story")
    .select(STORY_COLUMNS)
    .eq("tracker_id", trackerId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(500)
    .abortSignal(signal ?? new AbortController().signal);
  if (response.error) fail(response.error, "load this monitor's stories");
  return (response.data ?? []) as unknown as TrackerStoryRow[];
}

export function useTrackerStories(trackerId: string | null) {
  return useQuery({
    queryKey: newsMonitorKeys.stories(trackerId ?? ""),
    queryFn: ({ signal }) => listTrackerStories(trackerId ?? "", signal),
    enabled: Boolean(trackerId),
  });
}

export function useInvalidateNewsMonitor() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: newsMonitorKeys.all });
}

/** What a story goes back to when a person's action is undone: the engine's own decision. */
export function engineStatusOf(story: TrackerStoryRow): "withheld" | "watching" {
  return story.withheld_reason ? "withheld" : "watching";
}

type StoryPatch = Partial<
  Pick<
    TrackerStoryRow,
    | "status"
    | "surfaced_override_by"
    | "surfaced_override_at"
    | "dismissed_by"
    | "dismissed_at"
    | "dismissed_reason"
    | "feedback_note"
  >
>;

async function updateStory(
  story: TrackerStoryRow,
  patch: StoryPatch,
): Promise<TrackerStoryRow> {
  const client = await authed();
  const table = () => client.schema("seo").from("tracker_story");
  const result = await guardedUpdate<TrackerStoryRow>({
    expectedVersion: story.version,
    applyUpdate: ({ expectedVersion, nextVersion }) =>
      table()
        .update({ ...patch, version: nextVersion })
        .eq("id", story.id)
        .eq("version", expectedVersion)
        .is("deleted_at", null)
        .select(STORY_COLUMNS)
        .maybeSingle() as unknown as PromiseLike<{
        data: TrackerStoryRow | null;
        error: null;
      }>,
    fetchCurrent: () =>
      table()
        .select(STORY_COLUMNS)
        .eq("id", story.id)
        .maybeSingle() as unknown as PromiseLike<{
        data: TrackerStoryRow | null;
        error: null;
      }>,
  });
  if (result.status === "saved") return result.row;
  if (result.status === "conflict") {
    throw new Error(
      "This story changed while you were looking at it (a run or another person updated it). The list has been refreshed — try again.",
    );
  }
  throw new Error(
    "This story is no longer here, or you can't change it. Only people who can edit this monitor can surface or dismiss its stories.",
  );
}

async function currentUserId(): Promise<string> {
  const client = await authed();
  const {
    data: { user },
  } = await getClaimsUser(client);
  if (!user?.id) throw new Error("Sign in to change a story.");
  return user.id;
}

export async function surfaceStoryAnyway(
  story: TrackerStoryRow,
): Promise<TrackerStoryRow> {
  return updateStory(story, {
    status: "surfaced",
    surfaced_override_by: await currentUserId(),
    surfaced_override_at: new Date().toISOString(),
  });
}

export async function undoSurfaceAnyway(
  story: TrackerStoryRow,
): Promise<TrackerStoryRow> {
  return updateStory(story, {
    status: engineStatusOf(story),
    surfaced_override_by: null,
    surfaced_override_at: null,
  });
}

export async function dismissStory(
  story: TrackerStoryRow,
  reason: StoryDismissReason,
  note: string,
): Promise<TrackerStoryRow> {
  return updateStory(story, {
    status: "dismissed",
    dismissed_by: await currentUserId(),
    dismissed_at: new Date().toISOString(),
    dismissed_reason: reason,
    feedback_note: note.trim() || null,
  });
}

export async function undoDismiss(
  story: TrackerStoryRow,
): Promise<TrackerStoryRow> {
  return updateStory(story, {
    status:
      story.surfaced_override_at || story.first_surfaced_at
        ? "surfaced"
        : engineStatusOf(story),
    dismissed_by: null,
    dismissed_at: null,
    dismissed_reason: null,
    feedback_note: null,
  });
}
