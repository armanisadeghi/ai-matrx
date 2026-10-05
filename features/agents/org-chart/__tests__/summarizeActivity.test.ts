import { summarize } from "../useOrgChartActivity";

const NOW = Date.parse("2026-10-05T12:00:00Z");
const run = (status: string, minutesAgo: number, id = `${status}-${minutesAgo}`) => {
  const t = new Date(NOW - minutesAgo * 60_000).toISOString();
  return { id, agent_id: "a", status, created_at: t, last_activity_at: t, completed_at: status === "processing" ? null : t };
};
const STALL = 15 * 60_000;

describe("org chart activity summary", () => {
  it("a run that moved recently is running, counted", () => {
    expect(summarize([run("processing", 1, "x"), run("pending", 2, "y"), run("completed", 5)], STALL, NOW)).toMatchObject({
      state: "running",
      running: 2,
    });
  });
  it("an in-progress run that went silent is stalled, never running", () => {
    expect(summarize([run("processing", 40)], STALL, NOW)?.state).toBe("stalled");
  });
  it("otherwise the newest finished run decides", () => {
    expect(summarize([run("completed", 90), run("failed", 10)], STALL, NOW)?.state).toBe("failed");
    expect(summarize([run("failed", 90), run("completed", 10)], STALL, NOW)?.state).toBe("done");
    expect(summarize([run("cancelled", 3)], STALL, NOW)?.state).toBe("stopped");
  });
  it("no runs, no claim", () => {
    expect(summarize([], STALL, NOW)).toBeNull();
  });
});
