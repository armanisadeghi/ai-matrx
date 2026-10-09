import { SocialStreamError, consumeSocialEvents, progressOf } from "../stream";

async function* events(list: unknown[]): AsyncGenerator<unknown> {
  for (const e of list) yield e;
}

const stage = (label: string, current = 0, total = 0) => ({
  event: "data",
  data: { type: "social_stage", operation: "ingest_profile", stage: "x", label, current, total },
});

describe("social stream contract", () => {
  it("reads stage labels with counts, and no count when 0", () => {
    expect(progressOf(stage("Fetching posts", 2, 5))).toEqual({ message: "Getting posts", step: 2, total: 5 });
    expect(progressOf(stage("Fetching posts, page 1 of up to 1", 1, 1))).toEqual({ message: "Getting posts", step: undefined, total: undefined });
    expect(progressOf(stage("Fetching posts, page 2 of up to 3", 2, 3))).toEqual({ message: "Getting posts", step: 2, total: 3 });
    expect(progressOf(stage("Scoring"))).toEqual({ message: "Scoring", step: undefined, total: undefined });
    expect(progressOf({ event: "phase", data: {} })).toBeNull();
    expect(progressOf({ event: "data", data: { type: "social_result", result: {} } })).toBeNull();
  });

  it("returns the social_result and reports progress in order", async () => {
    const seen: string[] = [];
    const result = await consumeSocialEvents<{ profile_id: string }>(
      events([
        { event: "phase", data: {} },
        stage("Fetching profile"),
        stage("Fetching posts", 1, 2),
        { event: "data", data: { type: "social_result", operation: "track", result: { profile_id: "p1" } } },
        { event: "end", data: {} },
      ]),
      (p) => seen.push(p.message),
    );
    expect(result.profile_id).toBe("p1");
    expect(seen).toEqual(["Getting profile", "Getting posts"]);
  });

  it("an in-stream error becomes a SocialStreamError carrying the code, even though end follows", async () => {
    const run = consumeSocialEvents(
      events([
        stage("Fetching profile"),
        { event: "error", data: { code: "social_provider_failed", user_message: "Provider failed", error_type: "x" } },
        { event: "end", data: {} },
      ]),
    );
    await expect(run).rejects.toBeInstanceOf(SocialStreamError);
    await expect(run).rejects.toMatchObject({ code: "social_provider_failed", userMessage: "Provider failed" });
  });

  it("a stream with no result is an error, never a silent undefined", async () => {
    await expect(consumeSocialEvents(events([{ event: "end", data: {} }]))).rejects.toThrow(
      "ended without an answer",
    );
  });
});
