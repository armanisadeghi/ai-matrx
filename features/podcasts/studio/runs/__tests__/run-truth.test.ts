import { describe, expect, it } from "@jest/globals";

import { deriveRecoveryState } from "../recovery";
import { detailToRunState } from "../mapping";
import { trueLiveness, trueSummaryLiveness } from "../run-truth";
import { isEpisodeSettled, mergeAncillarySlots } from "../reconcile";
import type { RunDetail, RunSummary } from "../run-types";

/**
 * The case these tests pin is a real one (2026-08-11, run
 * 68605dd6-e282-4d82-b04f-2a5c6286a10b): every stage completed through
 * create_audio, the CDN audio URL was written, and then the streaming
 * connection dropped. Nothing wrote the terminal status, so the server kept
 * reporting `processing` / `liveness: "stalled"` and the page told the user
 * their finished episode had been interrupted — offering Resume and Re-run
 * from source over an episode that already existed.
 */

const detail = (over: Partial<RunDetail>): RunDetail =>
  ({
    run_id: "r1",
    status: "processing",
    liveness: "stalled",
    source: { input_data_type: "topic", summary: "", file_urls: [] },
    podcast_type: "educational",
    title: "The Student Creator's Playbook",
    cover_url: null,
    cover_file_id: null,
    stage_progress: { done: 14, failed: 0, total: 14 },
    episode_id: null,
    episode_slug: null,
    created_at: null,
    updated_at: null,
    last_activity_at: null,
    description: null,
    script: null,
    audio_url: null,
    audio_file_id: null,
    official_video_url: null,
    image_descriptions: [],
    video_descriptions: [],
    assets: [],
    stages: [],
    recovery: { resumable: true, can_rerun_from_source: true },
    request: {},
    model_counts: {},
    ...over,
  }) as RunDetail;

const summary = (over: Partial<RunSummary>): RunSummary =>
  ({
    run_id: "r1",
    status: "processing",
    liveness: "stalled",
    source: { input_data_type: "topic", summary: "", file_urls: [] },
    podcast_type: null,
    title: "",
    cover_url: null,
    cover_file_id: null,
    stage_progress: { done: 14, failed: 0, total: 14 },
    episode_id: null,
    episode_slug: null,
    created_at: null,
    updated_at: null,
    last_activity_at: null,
    ...over,
  }) as RunSummary;

describe("trueLiveness", () => {
  it("treats a stalled run that produced audio as completed", () => {
    expect(
      trueLiveness(detail({ audio_url: "https://cdn.matrxserver.com/a.mp3" })),
    ).toBe("completed");
  });

  it("treats a failed run that produced audio as completed", () => {
    expect(
      trueLiveness(
        detail({ liveness: "failed", audio_url: "https://cdn/a.mp3" }),
      ),
    ).toBe("completed");
  });

  it("leaves a stalled run with no deliverable alone", () => {
    expect(trueLiveness(detail({}))).toBe("stalled");
  });

  // Real shape from studio run e824214f (killed by the content gate before it
  // wrote a script): audio_url is "" rather than null. Declaring that run
  // "completed" would hide a genuinely dead run from recovery.
  it("does not treat an empty or blank audio_url as a deliverable", () => {
    expect(trueLiveness(detail({ liveness: "failed", audio_url: "" }))).toBe(
      "failed",
    );
    expect(trueLiveness(detail({ audio_url: "   " }))).toBe("stalled");
    expect(trueLiveness(detail({ episode_id: "" }))).toBe("stalled");
  });

  it("never overrides what the user did", () => {
    expect(
      trueLiveness(detail({ liveness: "cancelled", audio_url: "https://c/a" })),
    ).toBe("cancelled");
    expect(
      trueLiveness(detail({ liveness: "draft", episode_id: "e1" })),
    ).toBe("draft");
  });
});

describe("deriveRecoveryState", () => {
  it("offers NO resume/re-run and shows no banner once audio exists", () => {
    const state = deriveRecoveryState(
      detail({ audio_url: "https://cdn.matrxserver.com/a.mp3" }),
    );
    expect(state.kind).toBe("completed");
    expect(state.canResume).toBe(false);
    expect(state.canRerun).toBe(false);
    expect(state.showBanner).toBe(false);
  });

  it("still recovers a genuinely stalled run", () => {
    const state = deriveRecoveryState(detail({}));
    expect(state.kind).toBe("stalled");
    expect(state.canResume).toBe(true);
    expect(state.showBanner).toBe(true);
  });
});

describe("detailToRunState", () => {
  it("renders the episode as done instead of claiming an interruption", () => {
    const state = detailToRunState(
      detail({ audio_url: "https://cdn.matrxserver.com/a.mp3" }),
    );
    expect(state.status).toBe("done");
    expect(state.progress).toBe(100);
    expect(state.currentLabel).toBe("Episode ready");
    expect(state.error).toBeNull();
  });
});

describe("trueSummaryLiveness", () => {
  it("counts a run whose stages all finished as completed", () => {
    expect(trueSummaryLiveness(summary({}))).toBe("completed");
  });

  it("counts a published run as completed", () => {
    expect(
      trueSummaryLiveness(
        summary({ episode_id: "e1", stage_progress: { done: 3, failed: 0, total: 14 } }),
      ),
    ).toBe("completed");
  });

  it("leaves a mid-flight run active", () => {
    expect(
      trueSummaryLiveness(
        summary({ stage_progress: { done: 3, failed: 0, total: 14 } }),
      ),
    ).toBe("stalled");
  });

  it("does not launder a failed stage into success", () => {
    expect(
      trueSummaryLiveness(
        summary({ stage_progress: { done: 13, failed: 1, total: 14 } }),
      ),
    ).toBe("stalled");
  });
});

describe("mergeAncillarySlots", () => {
  const slot = (index: number, url: string | null, status: string) => ({
    index,
    kind: "image" as const,
    prompt: "",
    url,
    status,
  });

  it("adds slots the server says are still rendering", () => {
    const merged = mergeAncillarySlots(
      [slot(0, "https://cdn/a.jpg", "done")],
      [
        { stage_key: "image_1", kind: "image", slot: 1, status: "pending", action: "none" },
        { stage_key: "image_2", kind: "image", slot: 2, status: "failed", action: "regenerate" },
      ],
      "image",
    );
    expect(merged.map((s) => [s.index, s.status])).toEqual([
      [0, "done"],
      [1, "pending"],
      [2, "failed"],
    ]);
  });

  it("never downgrades a slot the user can already see", () => {
    const merged = mergeAncillarySlots(
      [slot(1, "https://cdn/b.jpg", "done")],
      [{ stage_key: "image_1", kind: "image", slot: 1, status: "pending", action: "none" }],
      "image",
    );
    expect(merged[0].status).toBe("done");
    expect(merged[0].url).toBe("https://cdn/b.jpg");
  });

  it("ignores the other media kind", () => {
    const existing = [slot(0, null, "pending")];
    expect(
      mergeAncillarySlots(
        existing,
        [{ stage_key: "video_0", kind: "video", slot: 0, status: "failed", action: "regenerate" }],
        "image",
      ),
    ).toBe(existing);
  });
});

describe("isEpisodeSettled", () => {
  const rec = (over: Record<string, unknown>) =>
    ({
      run_id: "r1",
      outcome: "completed",
      status: "completed",
      reason: "",
      essential: { script: "completed", audio: "completed", episode: "completed" },
      audio_url: "https://cdn/a.mp3",
      script: "x",
      episode_id: "e1",
      episode_slug: null,
      total_cost_usd: 0,
      progress: { done: 1, failed: 0, total: 1 },
      stages: [],
      ancillary_pending: [],
      poll_after_seconds: null,
      ...over,
    }) as never;

  // The episode row is created under a CAS lease because several callers race
  // to write it (live pipeline, cron sweep, this client's polling). The losers
  // briefly see completed + episode pending + no id. That is correct and
  // self-resolving — but the page must keep observing, because every post-run
  // tool keys off the episode id.
  it("is unsettled while the episode row is still being written", () => {
    expect(
      isEpisodeSettled(
        rec({
          essential: { script: "completed", audio: "completed", episode: "pending" },
          episode_id: null,
        }),
      ),
    ).toBe(false);
  });

  it("is settled once the id lands, even if the flag lags", () => {
    expect(
      isEpisodeSettled(
        rec({
          essential: { script: "completed", audio: "completed", episode: "pending" },
          episode_id: "e1",
        }),
      ),
    ).toBe(true);
  });

  it("is settled on a normal completion", () => {
    expect(isEpisodeSettled(rec({}))).toBe(true);
  });
});
