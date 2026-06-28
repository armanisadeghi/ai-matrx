"use client";

// features/podcasts/studio/runs/runsRepository.ts
//
// Client-side Supabase reads for the DURABLE podcast run record
// (agent_run / agent_run_stage / pc_studio_run_assets), with the projection
// into the studio DTOs done in TypeScript.
//
// ARCHITECTURE: per the platform rule, the React client reads the database
// DIRECTLY via Supabase (RLS-scoped to the user) — the Python backend is for
// COMPUTE only (generate / resume / per-asset regenerate), never a data layer.
// These tables are RLS-restricted to the owner (agent_run.user_id = auth.uid();
// stages + assets via their parent run), so a plain client query returns only
// the caller's runs.

import { supabase } from "@/utils/supabase/client";
import { fileIdFromUserFilesUrl } from "@/lib/media/durability";
import {
  MODEL_COUNTS,
  type RunAsset,
  type RunAssetKind,
  type RunDetail,
  type RunLiveness,
  type RunSource,
  type RunStatusDto,
  type RunSummary,
  type StageProgress,
} from "./run-types";

// A processing run with no DB activity for this long is "stalled" (the stream
// almost certainly died). Above the slowest single-stage gap (~2 min video).
const STALL_SECONDS = 180;

const IMAGE_RE = /^image_(\d+)$/;
const VIDEO_RE = /^video_(\d+)$/;
const METADATA_STAGE = "generate_metadata";
const SCRIPT_STAGE = "create_script";
const AUDIO_STAGE = "create_audio";
const OFFICIAL_VIDEO_STAGE = "compose_official_video";

interface StageRowRaw {
  stage_key: string;
  status: string;
  output: { output?: unknown } | null;
  error: unknown;
  started_at: string | null;
  finished_at: string | null;
}

interface AssetRowRaw {
  asset_kind: string;
  slot: number;
  url: string | null;
  prompt: string | null;
  model_alias: string | null;
  is_manual: boolean;
  status: string;
  superseded_by: string | null;
}

interface AgentRunRaw {
  id: string;
  status: string | null;
  request: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  episode_id: string | null;
  last_heartbeat_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  agent_run_stage?: StageRowRaw[] | null;
  pc_studio_run_assets?: AssetRowRaw[] | null;
}

const RUN_SELECT =
  "id,status,request,result,episode_id,last_heartbeat_at,created_at,updated_at," +
  "agent_run_stage(stage_key,status,output,error,started_at,finished_at)";

const RUN_DETAIL_SELECT =
  RUN_SELECT +
  ",pc_studio_run_assets(asset_kind,slot,url,prompt,model_alias,is_manual,status,superseded_by)";

// ── projection helpers (port of the former Python read endpoints) ──────────────

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

function stageOutput(stage: StageRowRaw | undefined): string | null {
  const v = stage?.output?.output;
  return typeof v === "string" ? v : null;
}

function parseFencedJson(text: string | null): Record<string, unknown> | null {
  if (!text) return null;
  const m = text.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
  const blob = m ? m[1] : text.trim();
  try {
    const parsed = JSON.parse(blob);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function sourceSummary(request: Record<string, unknown>): RunSource {
  const idt = request.input_data_type;
  const fileUrls = Array.isArray(request.file_urls)
    ? (request.file_urls as unknown[]).filter(
        (u): u is string => typeof u === "string",
      )
    : [];
  const inputData =
    typeof request.input_data === "string" ? request.input_data.trim() : "";
  let summary = "";
  if (fileUrls.length > 0)
    summary = fileUrls[0].split("/").pop() || fileUrls[0];
  else if (inputData)
    summary = inputData.slice(0, 160) + (inputData.length > 160 ? "…" : "");
  return {
    input_data_type: idt != null ? String(idt) : null,
    summary,
    file_urls: fileUrls,
  };
}

function titleFromStages(byKey: Map<string, StageRowRaw>): string {
  for (const key of [METADATA_STAGE, SCRIPT_STAGE]) {
    const parsed = parseFencedJson(stageOutput(byKey.get(key)));
    const t = parsed?.title;
    if (typeof t === "string" && t.trim()) return t.trim();
  }
  return "";
}

function lastActivity(run: AgentRunRaw, stages: StageRowRaw[]): number | null {
  const candidates: number[] = [];
  for (const v of [run.last_heartbeat_at, run.updated_at, run.created_at]) {
    const t = ms(v);
    if (t != null) candidates.push(t);
  }
  for (const s of stages) {
    for (const v of [s.finished_at, s.started_at]) {
      const t = ms(v);
      if (t != null) candidates.push(t);
    }
  }
  return candidates.length ? Math.max(...candidates) : null;
}

function liveness(
  status: string,
  lastAct: number | null,
  now: number,
): RunLiveness {
  if (
    status === "completed" ||
    status === "failed" ||
    status === "draft" ||
    status === "cancelled"
  ) {
    return status as RunLiveness;
  }
  if (lastAct == null) return "stalled";
  return now - lastAct < STALL_SECONDS * 1000 ? "alive" : "stalled";
}

function stageProgress(stages: StageRowRaw[]): StageProgress {
  let done = 0;
  let failed = 0;
  for (const s of stages) {
    if (s.status === "completed") done += 1;
    else if (s.status === "failed") failed += 1;
  }
  return { done, failed, total: stages.length };
}

function firstImage(byKey: Map<string, StageRowRaw>): {
  url: string | null;
  fileId: string | null;
} {
  let best: { slot: number; url: string } | null = null;
  for (const [key, stage] of byKey) {
    const m = key.match(IMAGE_RE);
    if (m && stage.status === "completed") {
      const url = stageOutput(stage);
      if (url && (best === null || Number(m[1]) < best.slot))
        best = { slot: Number(m[1]), url };
    }
  }
  if (!best) return { url: null, fileId: null };
  return { url: best.url, fileId: fileIdFromUserFilesUrl(best.url) };
}

function assetStatus(raw: string): string {
  return raw || "unknown";
}

function buildAssetsMerged(
  stages: StageRowRaw[],
  assetRows: AssetRowRaw[],
): RunAsset[] {
  const bySlot = new Map<string, RunAsset>();
  // Stage-derived (authoritative URLs).
  for (const s of stages) {
    for (const [rx, kind] of [
      [IMAGE_RE, "image"],
      [VIDEO_RE, "video"],
    ] as const) {
      const m = s.stage_key.match(rx);
      if (!m) continue;
      const url = stageOutput(s);
      const slot = Number(m[1]);
      bySlot.set(`${kind}:${slot}`, {
        asset_kind: kind,
        slot,
        status: assetStatus(s.status),
        url,
        file_id: url ? fileIdFromUserFilesUrl(url) : null,
        prompt: null,
        model_alias: null,
        is_manual: false,
      });
    }
  }
  // Enrich with catalog metadata (model alias, manual provenance) for the
  // current (non-superseded) asset of each slot.
  for (const row of assetRows) {
    if (row.superseded_by != null) continue;
    const kind = row.asset_kind;
    if (kind !== "image" && kind !== "video") continue;
    const slot = Number(row.slot);
    const existing = bySlot.get(`${kind}:${slot}`);
    const url = row.url ?? existing?.url ?? null;
    bySlot.set(`${kind}:${slot}`, {
      asset_kind: kind as RunAssetKind,
      slot,
      status: row.status || existing?.status || "completed",
      url,
      file_id: url ? fileIdFromUserFilesUrl(url) : (existing?.file_id ?? null),
      prompt: row.prompt ?? existing?.prompt ?? null,
      model_alias: row.model_alias ?? existing?.model_alias ?? null,
      is_manual: !!row.is_manual,
    });
  }
  return [...bySlot.values()].sort((a, b) =>
    a.asset_kind === b.asset_kind
      ? a.slot - b.slot
      : a.asset_kind < b.asset_kind
        ? -1
        : 1,
  );
}

function episodeSlugFromResult(
  result: Record<string, unknown> | null,
): string | null {
  const slug = result?.episode_slug ?? result?.slug;
  return typeof slug === "string" ? slug : null;
}

function toSummary(run: AgentRunRaw, now: number): RunSummary {
  const stages = run.agent_run_stage ?? [];
  const byKey = new Map(stages.map((s) => [s.stage_key, s]));
  const request = run.request ?? {};
  const status = run.status ?? "processing";
  const lastAct = lastActivity(run, stages);
  const cover = firstImage(byKey);
  return {
    run_id: run.id,
    status,
    liveness: liveness(status, lastAct, now),
    source: sourceSummary(request),
    podcast_type: (request.podcast_type as string) ?? null,
    title: titleFromStages(byKey),
    cover_url: cover.url,
    cover_file_id: cover.fileId,
    stage_progress: stageProgress(stages),
    episode_id: run.episode_id ?? null,
    episode_slug: episodeSlugFromResult(run.result),
    created_at: run.created_at,
    updated_at: run.updated_at,
    last_activity_at: lastAct != null ? new Date(lastAct).toISOString() : null,
  };
}

// ── public reads (direct Supabase) ─────────────────────────────────────────────

export interface ListRunsParams {
  status?: string;
  includeDrafts?: boolean;
  limit?: number;
}

export async function fetchPodcastRuns({
  status,
  includeDrafts = true,
  limit = 100,
}: ListRunsParams = {}): Promise<RunSummary[]> {
  const now = Date.now();
  let query = supabase
    .schema("chat").from("agent_run")
    .select(RUN_SELECT)
    .eq("kind", "podcast")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status) query = query.eq("status", status);
  else if (!includeDrafts) query = query.neq("status", "draft");
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as AgentRunRaw[]).map((r) =>
    toSummary(r, now),
  );
}

export async function fetchPodcastRunDetail(
  runId: string,
): Promise<RunDetail | null> {
  const now = Date.now();
  const { data, error } = await supabase
    .schema("chat").from("agent_run")
    .select(RUN_DETAIL_SELECT)
    .eq("id", runId)
    .eq("kind", "podcast")
    .maybeSingle();
  if (error || !data) return null;
  const run = data as unknown as AgentRunRaw;
  const stages = run.agent_run_stage ?? [];
  const byKey = new Map(stages.map((s) => [s.stage_key, s]));
  const request = run.request ?? {};
  const status = run.status ?? "processing";

  const meta = parseFencedJson(stageOutput(byKey.get(METADATA_STAGE))) ?? {};
  const imageDescriptions = stringArray(meta.image_descriptions);
  const videoDescriptions = stringArray(meta.video_descriptions);
  const scriptOut = stageOutput(byKey.get(SCRIPT_STAGE));
  const audioUrl = stageOutput(byKey.get(AUDIO_STAGE));
  const official = stageOutput(byKey.get(OFFICIAL_VIDEO_STAGE));
  const hasCompleted = stages.some((s) => s.status === "completed");
  const canRerun = !!(
    request.input_data || (request.file_urls as unknown[])?.length
  );

  const summary = toSummary(run, now);
  return {
    ...summary,
    title: summary.title || (typeof meta.title === "string" ? meta.title : ""),
    description: typeof meta.description === "string" ? meta.description : null,
    script: scriptOut,
    audio_url: audioUrl,
    audio_file_id: audioUrl ? fileIdFromUserFilesUrl(audioUrl) : null,
    official_video_url: official,
    image_descriptions: imageDescriptions,
    video_descriptions: videoDescriptions,
    assets: buildAssetsMerged(stages, run.pc_studio_run_assets ?? []),
    stages: [...stages]
      .sort((a, b) => (a.stage_key < b.stage_key ? -1 : 1))
      .map((s) => ({
        stage_key: s.stage_key,
        status: s.status,
        started_at: s.started_at,
        finished_at: s.finished_at,
        error: s.error,
      })),
    recovery: {
      // "Completed" without audio AND without an episode is a mis-stamped
      // failure (the pre-2026-06-10 server claimed success when the audio
      // stage failed) — a resume re-runs only the audio tail, so offer it.
      resumable:
        (status === "processing" ||
          status === "failed" ||
          (status === "completed" && !audioUrl && !run.episode_id)) &&
        hasCompleted,
      can_rerun_from_source: canRerun,
    },
    request,
    model_counts: { ...MODEL_COUNTS },
  };
}

export async function fetchPodcastRunStatus(
  runId: string,
): Promise<RunStatusDto | null> {
  const now = Date.now();
  const { data, error } = await supabase
    .schema("chat").from("agent_run")
    .select(
      "id,status,episode_id,last_heartbeat_at,updated_at,created_at,agent_run_stage(status,started_at,finished_at)",
    )
    .eq("id", runId)
    .eq("kind", "podcast")
    .maybeSingle();
  if (error || !data) return null;
  const run = data as unknown as AgentRunRaw;
  const stages = run.agent_run_stage ?? [];
  const status = run.status ?? "processing";
  const lastAct = lastActivity(run, stages);
  return {
    run_id: run.id,
    status,
    liveness: liveness(status, lastAct, now),
    last_activity_at: lastAct != null ? new Date(lastAct).toISOString() : null,
    stage_progress: stageProgress(stages),
    episode_id: run.episode_id ?? null,
  };
}
