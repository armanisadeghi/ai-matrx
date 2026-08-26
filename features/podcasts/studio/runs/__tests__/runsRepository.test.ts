const schema = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema },
}));

import {
  deletePodcastRun,
  fetchPodcastRunDetail,
  fetchPodcastRuns,
} from "../runsRepository";

function chain(methods: string[]): Record<string, jest.Mock> {
  const query: Record<string, jest.Mock> = {};
  for (const method of methods) query[method] = jest.fn(() => query);
  return query;
}

describe("fetchPodcastRunDetail", () => {
  beforeEach(() => {
    schema.mockReset();
  });

  it("loads chat run data and podcast assets through separate schema profiles", async () => {
    const runQuery = chain(["select", "is", "eq"]);
    runQuery.maybeSingle = jest.fn().mockResolvedValue({
      data: {
        id: "run-1",
        status: "completed",
        request: { input_data: "A test topic" },
        result: null,
        episode_id: null,
        last_heartbeat_at: null,
        created_at: "2026-07-18T00:00:00.000Z",
        updated_at: "2026-07-18T00:01:00.000Z",
        agent_run_stage: [
          {
            stage_key: "image_0",
            status: "completed",
            output: { output: "https://cdn.example.com/stage.png" },
            error: null,
            started_at: null,
            finished_at: "2026-07-18T00:01:00.000Z",
          },
        ],
      },
      error: null,
    });

    const assetQuery = chain(["select"]);
    assetQuery.eq = jest.fn().mockResolvedValue({
      data: [
        {
          asset_kind: "image",
          slot: 0,
          url: "https://cdn.example.com/catalog.png",
          prompt: "cover prompt",
          model_alias: "image-model",
          is_manual: true,
          status: "completed",
          superseded_by: null,
        },
      ],
      error: null,
    });

    schema.mockImplementation((profile: string) => ({
      from: (table: string) => {
        if (profile === "chat" && table === "agent_run") return runQuery;
        if (profile === "podcast" && table === "pc_studio_run_assets")
          return assetQuery;
        throw new Error(`Unexpected query: ${profile}.${table}`);
      },
    }));

    const detail = await fetchPodcastRunDetail("run-1");

    expect(schema.mock.calls.map(([profile]) => profile)).toEqual([
      "chat",
      "podcast",
    ]);
    expect(runQuery.select).toHaveBeenCalledWith(
      expect.not.stringContaining("pc_studio_run_assets"),
    );
    expect(assetQuery.eq).toHaveBeenCalledWith("run_id", "run-1");
    expect(detail?.assets).toEqual([
      expect.objectContaining({
        asset_kind: "image",
        slot: 0,
        url: "https://cdn.example.com/catalog.png",
        prompt: "cover prompt",
        model_alias: "image-model",
        is_manual: true,
      }),
    ]);
  });

  it("does not query assets when the run does not exist", async () => {
    const runQuery = chain(["select", "is", "eq"]);
    runQuery.maybeSingle = jest.fn().mockResolvedValue({
      data: null,
      error: null,
    });
    schema.mockReturnValue({ from: () => runQuery });

    await expect(fetchPodcastRunDetail("missing")).resolves.toBeNull();
    expect(schema).toHaveBeenCalledTimes(1);
    expect(schema).toHaveBeenCalledWith("chat");
  });
});

describe("fetchPodcastRuns", () => {
  beforeEach(() => {
    schema.mockReset();
  });

  it("derives deliverable truth from audio output, not completed stage counts", async () => {
    const query = chain(["select", "is", "eq", "order"]);
    query.limit = jest.fn().mockResolvedValue({
      data: [
        {
          id: "failed-run",
          status: "failed",
          request: {},
          result: null,
          episode_id: null,
          last_heartbeat_at: null,
          created_at: null,
          updated_at: null,
          agent_run_stage: [
            {
              stage_key: "generate_metadata",
              status: "completed",
              output: { output: "{}" },
              error: null,
              started_at: null,
              finished_at: null,
            },
          ],
        },
        {
          id: "audio-run",
          status: "failed",
          request: {},
          result: null,
          episode_id: null,
          last_heartbeat_at: null,
          created_at: null,
          updated_at: null,
          agent_run_stage: [
            {
              stage_key: "create_audio",
              status: "completed",
              output: { output: "https://cdn.example.com/episode.mp3" },
              error: null,
              started_at: null,
              finished_at: null,
            },
          ],
        },
      ],
      error: null,
    });
    schema.mockReturnValue({ from: () => query });

    const summaries = await fetchPodcastRuns();

    expect(summaries.map((run) => run.has_deliverable)).toEqual([false, true]);
  });
});

describe("deletePodcastRun", () => {
  beforeEach(() => {
    schema.mockReset();
  });

  it("soft-deletes only the selected podcast run", async () => {
    const query = chain(["update", "eq", "is", "select"]);
    query.maybeSingle = jest.fn().mockResolvedValue({
      data: { id: "run-1" },
      error: null,
    });
    schema.mockReturnValue({ from: () => query });

    await expect(deletePodcastRun("run-1")).resolves.toBeUndefined();

    expect(schema).toHaveBeenCalledWith("chat");
    expect(query.update).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) }),
    );
    expect(query.eq).toHaveBeenCalledWith("id", "run-1");
    expect(query.eq).toHaveBeenCalledWith("kind", "podcast");
    expect(query.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("rejects a missing or unauthorized run instead of claiming success", async () => {
    const query = chain(["update", "eq", "is", "select"]);
    query.maybeSingle = jest
      .fn()
      .mockResolvedValue({ data: null, error: null });
    schema.mockReturnValue({ from: () => query });

    await expect(deletePodcastRun("missing")).rejects.toThrow(
      "not found or you do not have permission",
    );
  });
});
