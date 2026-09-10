/**
 * @jest-environment node
 */
/**
 * features/podcasts/studio/runs/runsRepository.ts — the durable podcast run
 * record, read and soft-deleted DB-direct.
 *
 * The Supabase client is REAL (supabase-js + postgrest-js). Only the network is
 * replaced — by a recorder that captures the HTTP request the repository
 * actually emits and replies with rows shaped exactly like its select string.
 * So every assertion is on something the repository owns: the schema profile,
 * table, filters (the run's own id, `kind=podcast`, `deleted_at is null`),
 * columns, write body, and the DTO it projects from those rows.
 */
import type { Database, Json } from "@/types/database.types";
import { MODEL_COUNTS, type RunDetail } from "../run-types";

interface RecordedRequest {
  method: string;
  path: string;
  profile: string | null;
  body: string | null;
}
interface Reply {
  status: number;
  json: Json;
}

const mockRequests: RecordedRequest[] = [];
const mockReplies: Reply[] = [];

jest.mock("@/utils/supabase/client", () => {
  const { createClient } = jest.requireActual<
    typeof import("@supabase/supabase-js")
  >("@supabase/supabase-js");
  return {
    supabase: createClient("http://localhost:54321", "sb_publishable_test", {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: async (
          input: RequestInfo | URL,
          init?: RequestInit,
        ): Promise<Response> => {
          const url = new URL(
            input instanceof URL
              ? input.href
              : typeof input === "string"
                ? input
                : input.url,
          );
          const headers = new Headers(init?.headers);
          mockRequests.push({
            method: init?.method ?? "GET",
            path: decodeURIComponent(url.pathname + url.search),
            profile:
              headers.get("accept-profile") ?? headers.get("content-profile"),
            body: typeof init?.body === "string" ? init.body : null,
          });
          const reply = mockReplies.shift();
          if (!reply) {
            throw new Error(
              `No reply queued for ${init?.method ?? "GET"} ${url.pathname}${url.search}`,
            );
          }
          return new Response(JSON.stringify(reply.json), {
            status: reply.status,
            headers: { "content-type": "application/json" },
          });
        },
      },
    }),
  };
});

import {
  deletePodcastRun,
  fetchPodcastRunDetail,
  fetchPodcastRuns,
} from "../runsRepository";

type AgentRunRow = Database["chat"]["Tables"]["agent_run"]["Row"];
type StageRow = Database["chat"]["Tables"]["agent_run_stage"]["Row"];
type AssetRow = Database["podcast"]["Tables"]["pc_studio_run_assets"]["Row"];

/** Exactly what the repository's run select returns: these columns + embedded stages. */
type RunSelectRow = Pick<
  AgentRunRow,
  | "id"
  | "status"
  | "request"
  | "result"
  | "episode_id"
  | "last_heartbeat_at"
  | "created_at"
  | "updated_at"
> & {
  agent_run_stage: Pick<
    StageRow,
    "stage_key" | "status" | "output" | "error" | "started_at" | "finished_at"
  >[];
};

/** Exactly what the repository's asset-catalog select returns. */
type AssetSelectRow = Pick<
  AssetRow,
  | "asset_kind"
  | "slot"
  | "url"
  | "prompt"
  | "model_alias"
  | "is_manual"
  | "status"
  | "superseded_by"
>;

// The column contract of each read, as PostgREST receives it.
const RUN_COLUMNS =
  "select=id,status,request,result,episode_id,last_heartbeat_at,created_at,updated_at,agent_run_stage(stage_key,status,output,error,started_at,finished_at)";
const ASSET_COLUMNS =
  "select=asset_kind,slot,url,prompt,model_alias,is_manual,status,superseded_by";

const RUN_ID = "7d3f1c2e-0b7a-4f7e-9a51-2c4b8e6f1a01";
const OWNER = "0b8f2a4e-5d1c-4c3a-9f7e-1a2b3c4d5e6f";
const FILE_IMAGE_0 = "c1a0e0f4-2b7d-4c9e-8a11-5f3e2d1c0b01";
const FILE_IMAGE_1 = "c1a0e0f4-2b7d-4c9e-8a11-5f3e2d1c0b02";
const FILE_CATALOG_0 = "c1a0e0f4-2b7d-4c9e-8a11-5f3e2d1c0b0c";
const FILE_STALE_1 = "c1a0e0f4-2b7d-4c9e-8a11-5f3e2d1c0b0d";
const FILE_AUDIO = "c1a0e0f4-2b7d-4c9e-8a11-5f3e2d1c0b0a";

/** A signed user-files S3 URL — the shape stage outputs carry (`/{user}/{file}?…`). */
function signedFileUrl(fileId: string): string {
  return `https://matrx-user-files.s3.us-east-1.amazonaws.com/${OWNER}/${fileId}?X-Amz-Expires=3600`;
}

const PERMISSION_DENIED: Reply = {
  status: 403,
  json: {
    code: "42501",
    details: null,
    hint: null,
    message: "permission denied for table agent_run",
  },
};

beforeEach(() => {
  mockRequests.length = 0;
  mockReplies.length = 0;
  jest.restoreAllMocks();
});

describe("fetchPodcastRunDetail", () => {
  const METADATA_OUTPUT =
    '```json\n{"title":"Heat Wave Cities","description":"How planners keep streets livable","image_descriptions":["noon skyline"],"video_descriptions":[]}\n```';

  const failedRun = {
    id: RUN_ID,
    status: "failed",
    request: {
      input_data: "How cities plan for heat waves",
      input_data_type: "text",
      podcast_type: "interview",
    },
    result: { episode_slug: "cities-heat-waves" },
    episode_id: null,
    last_heartbeat_at: "2026-07-18T00:02:00.000Z",
    created_at: "2026-07-18T00:00:00.000Z",
    updated_at: "2026-07-18T00:03:00.000Z",
    agent_run_stage: [
      {
        stage_key: "image_1",
        status: "completed",
        output: { output: signedFileUrl(FILE_IMAGE_1) },
        error: null,
        started_at: "2026-07-18T00:03:30.000Z",
        finished_at: "2026-07-18T00:04:00.000Z",
      },
      {
        stage_key: "generate_metadata",
        status: "completed",
        output: { output: METADATA_OUTPUT },
        error: null,
        started_at: "2026-07-18T00:00:05.000Z",
        finished_at: "2026-07-18T00:00:20.000Z",
      },
      {
        stage_key: "image_0",
        status: "completed",
        output: { output: signedFileUrl(FILE_IMAGE_0) },
        error: null,
        started_at: "2026-07-18T00:00:30.000Z",
        finished_at: "2026-07-18T00:01:00.000Z",
      },
      {
        stage_key: "create_audio",
        status: "failed",
        output: null,
        error: { message: "tts provider timed out" },
        started_at: "2026-07-18T00:01:30.000Z",
        finished_at: null,
      },
    ],
  } satisfies RunSelectRow;

  const catalog = [
    {
      asset_kind: "image",
      slot: 0,
      url: signedFileUrl(FILE_CATALOG_0),
      prompt: "noon skyline, wide",
      model_alias: "image-model-a",
      is_manual: true,
      status: "completed",
      superseded_by: null,
    },
    {
      // A replaced catalog entry — must never surface over the live stage asset.
      asset_kind: "image",
      slot: 1,
      url: signedFileUrl(FILE_STALE_1),
      prompt: "old prompt",
      model_alias: "image-model-old",
      is_manual: true,
      status: "completed",
      superseded_by: "5e0c7b1a-9d3f-4a2e-8b6c-0f1e2d3c4b5a",
    },
  ] satisfies AssetSelectRow[];

  it("reads only this live podcast run from chat, then its asset catalog from podcast", async () => {
    mockReplies.push({ status: 200, json: [failedRun] }, { status: 200, json: catalog });

    await fetchPodcastRunDetail(RUN_ID);

    expect(mockRequests).toEqual([
      {
        method: "GET",
        path: `/rest/v1/agent_run?${RUN_COLUMNS}&deleted_at=is.null&id=eq.${RUN_ID}&kind=eq.podcast`,
        profile: "chat",
        body: null,
      },
      {
        method: "GET",
        path: `/rest/v1/pc_studio_run_assets?${ASSET_COLUMNS}&run_id=eq.${RUN_ID}`,
        profile: "podcast",
        body: null,
      },
    ]);
  });

  it("projects the run with catalog metadata over stage assets and never a superseded catalog row", async () => {
    mockReplies.push({ status: 200, json: [failedRun] }, { status: 200, json: catalog });

    const detail = await fetchPodcastRunDetail(RUN_ID);

    const expected: RunDetail = {
      run_id: RUN_ID,
      status: "failed",
      liveness: "failed",
      source: {
        input_data_type: "text",
        summary: "How cities plan for heat waves",
        file_urls: [],
      },
      podcast_type: "interview",
      title: "Heat Wave Cities",
      cover_url: signedFileUrl(FILE_IMAGE_0),
      cover_file_id: FILE_IMAGE_0,
      stage_progress: { done: 3, failed: 1, total: 4 },
      has_deliverable: false,
      episode_id: null,
      episode_slug: "cities-heat-waves",
      created_at: "2026-07-18T00:00:00.000Z",
      updated_at: "2026-07-18T00:03:00.000Z",
      last_activity_at: "2026-07-18T00:04:00.000Z",
      description: "How planners keep streets livable",
      script: null,
      audio_url: null,
      audio_file_id: null,
      official_video_url: null,
      image_descriptions: ["noon skyline"],
      video_descriptions: [],
      assets: [
        {
          asset_kind: "image",
          slot: 0,
          status: "completed",
          url: signedFileUrl(FILE_CATALOG_0),
          file_id: FILE_CATALOG_0,
          prompt: "noon skyline, wide",
          model_alias: "image-model-a",
          is_manual: true,
        },
        {
          asset_kind: "image",
          slot: 1,
          status: "completed",
          url: signedFileUrl(FILE_IMAGE_1),
          file_id: FILE_IMAGE_1,
          prompt: null,
          model_alias: null,
          is_manual: false,
        },
      ],
      stages: [
        {
          stage_key: "create_audio",
          status: "failed",
          started_at: "2026-07-18T00:01:30.000Z",
          finished_at: null,
          error: { message: "tts provider timed out" },
        },
        {
          stage_key: "generate_metadata",
          status: "completed",
          started_at: "2026-07-18T00:00:05.000Z",
          finished_at: "2026-07-18T00:00:20.000Z",
          error: null,
        },
        {
          stage_key: "image_0",
          status: "completed",
          started_at: "2026-07-18T00:00:30.000Z",
          finished_at: "2026-07-18T00:01:00.000Z",
          error: null,
        },
        {
          stage_key: "image_1",
          status: "completed",
          started_at: "2026-07-18T00:03:30.000Z",
          finished_at: "2026-07-18T00:04:00.000Z",
          error: null,
        },
      ],
      recovery: { resumable: true, can_rerun_from_source: true },
      request: {
        input_data: "How cities plan for heat waves",
        input_data_type: "text",
        podcast_type: "interview",
      },
      model_counts: { ...MODEL_COUNTS },
    };
    expect(detail).toEqual(expected);
  });

  it("returns null and never reads the catalog when the run is not visible", async () => {
    mockReplies.push({ status: 200, json: [] });

    await expect(fetchPodcastRunDetail(RUN_ID)).resolves.toBeNull();
    expect(mockRequests).toHaveLength(1);
  });

  it("surfaces a database refusal instead of an empty detail", async () => {
    mockReplies.push(PERMISSION_DENIED);

    await expect(fetchPodcastRunDetail(RUN_ID)).rejects.toMatchObject({
      code: "42501",
      message: "permission denied for table agent_run",
    });
    expect(mockRequests).toHaveLength(1);
  });
});

function runRow(
  id: string,
  overrides: Partial<RunSelectRow> = {},
): RunSelectRow {
  return {
    id,
    status: "completed",
    request: { input_data: "A topic" },
    result: null,
    episode_id: null,
    last_heartbeat_at: null,
    created_at: "2026-07-18T00:00:00.000Z",
    updated_at: "2026-07-18T00:01:00.000Z",
    agent_run_stage: [],
    ...overrides,
  };
}

describe("fetchPodcastRuns", () => {
  const LIVE_PODCASTS = `/rest/v1/agent_run?${RUN_COLUMNS}&deleted_at=is.null&kind=eq.podcast&order=created_at.desc`;

  it.each([
    ["no filter", {}, `${LIVE_PODCASTS}&limit=100`],
    ["a status filter", { status: "failed" }, `${LIVE_PODCASTS}&limit=100&status=eq.failed`],
    ["drafts excluded", { includeDrafts: false }, `${LIVE_PODCASTS}&limit=100&status=neq.draft`],
    ["a custom limit", { limit: 20 }, `${LIVE_PODCASTS}&limit=20`],
  ])(
    "lists only live podcast runs, newest first, with %s",
    async (_label, params, path) => {
      mockReplies.push({ status: 200, json: [] });

      await fetchPodcastRuns(params);

      expect(mockRequests).toEqual([
        { method: "GET", path, profile: "chat", body: null },
      ]);
    },
  );

  it("marks a run deliverable only on non-blank audio output or a linked episode", async () => {
    mockReplies.push({
      status: 200,
      json: [
        runRow("stages-no-audio", {
          status: "failed",
          agent_run_stage: [
            {
              stage_key: "generate_metadata",
              status: "completed",
              output: { output: "{}" },
              error: null,
              started_at: "2026-07-18T00:00:05.000Z",
              finished_at: "2026-07-18T00:00:20.000Z",
            },
          ],
        }),
        runRow("audio-output", {
          status: "failed",
          agent_run_stage: [
            {
              stage_key: "create_audio",
              status: "completed",
              output: { output: signedFileUrl(FILE_AUDIO) },
              error: null,
              started_at: "2026-07-18T00:00:30.000Z",
              finished_at: "2026-07-18T00:01:00.000Z",
            },
          ],
        }),
        runRow("linked-episode", {
          episode_id: "3c9d2b1a-7e6f-4d5c-8b4a-1f0e9d8c7b6a",
        }),
        runRow("blank-audio", {
          agent_run_stage: [
            {
              stage_key: "create_audio",
              status: "completed",
              output: { output: "   " },
              error: null,
              started_at: "2026-07-18T00:00:30.000Z",
              finished_at: "2026-07-18T00:01:00.000Z",
            },
          ],
        }),
      ],
    });

    const summaries = await fetchPodcastRuns();

    expect(
      summaries.map((run) => [run.run_id, run.has_deliverable]),
    ).toEqual([
      ["stages-no-audio", false],
      ["audio-output", true],
      ["linked-episode", true],
      ["blank-audio", false],
    ]);
  });

  it("keeps a processing run alive for 180s without activity, then reports it stalled", async () => {
    // The clock is the one external input here.
    jest
      .spyOn(Date, "now")
      .mockReturnValue(Date.parse("2026-09-10T12:00:00.000Z"));
    mockReplies.push({
      status: 200,
      json: [
        runRow("active-179s-ago", {
          status: "processing",
          created_at: "2026-09-10T11:00:00.000Z",
          updated_at: "2026-09-10T11:00:00.000Z",
          last_heartbeat_at: "2026-09-10T11:57:01.000Z",
        }),
        runRow("active-181s-ago", {
          status: "processing",
          created_at: "2026-09-10T11:00:00.000Z",
          updated_at: "2026-09-10T11:00:00.000Z",
          last_heartbeat_at: "2026-09-10T11:56:59.000Z",
        }),
      ],
    });

    const summaries = await fetchPodcastRuns();

    expect(summaries.map((run) => [run.run_id, run.liveness])).toEqual([
      ["active-179s-ago", "alive"],
      ["active-181s-ago", "stalled"],
    ]);
  });
});

describe("deletePodcastRun", () => {
  it("soft-deletes exactly this podcast run, only while it is still live", async () => {
    mockReplies.push({ status: 200, json: [{ id: RUN_ID }] });
    const before = Date.now();

    await expect(deletePodcastRun(RUN_ID)).resolves.toBeUndefined();

    const after = Date.now();
    expect(mockRequests).toEqual([
      {
        method: "PATCH",
        path: `/rest/v1/agent_run?id=eq.${RUN_ID}&kind=eq.podcast&deleted_at=is.null&select=id`,
        profile: "chat",
        body: expect.any(String),
      },
    ]);
    const body: unknown = JSON.parse(mockRequests[0].body ?? "null");
    expect(body).toEqual({ deleted_at: expect.any(String) });
    const stamped =
      typeof body === "object" && body !== null && "deleted_at" in body
        ? Date.parse(String(body.deleted_at))
        : Number.NaN;
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(after);
  });

  it("refuses when no row was hidden instead of claiming success", async () => {
    // A zero-row UPDATE under RLS is four situations at once (already hidden,
    // deleted, never existed, invisible to this reader) — the sentence says
    // what did not happen and never guesses why.
    mockReplies.push({ status: 200, json: [] });

    await expect(deletePodcastRun(RUN_ID)).rejects.toThrow(
      "We couldn't remove this run from your history.",
    );
  });

  it("refuses with the same sentence, carrying the cause, when the database rejects the write", async () => {
    mockReplies.push(PERMISSION_DENIED);

    await expect(deletePodcastRun(RUN_ID)).rejects.toMatchObject({
      message: "We couldn't remove this run from your history.",
      cause: { code: "42501" },
    });
  });
});
