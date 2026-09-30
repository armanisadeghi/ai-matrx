import { fairTimeout } from "./fairTimeout";

function freezeFor(ms: number): void {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    /* a long task: the event loop cannot run anything */
  }
}

describe("fairTimeout", () => {
  it("expires after an on-time window", async () => {
    const t = fairTimeout(50);
    await expect(t.expired).resolves.toEqual({ starvedWindows: 0, starvedMs: 0 });
  });

  it("lets an answer queued behind a page freeze win the race", async () => {
    const t = fairTimeout(100);
    const answer = new Promise<string>((resolve) => globalThis.setTimeout(() => resolve("answered"), 150));
    freezeFor(500); // both the timeout and the answer are now overdue
    const winner = await Promise.race([answer, t.expired.then(() => "timed out")]);
    t.cancel();
    expect(winner).toBe("answered");
  });

  it("still expires when the answer never comes, reporting the freeze it discounted", async () => {
    const t = fairTimeout(100);
    freezeFor(500);
    const result = await t.expired;
    expect(result.starvedWindows).toBe(1);
    expect(result.starvedMs).toBeGreaterThanOrEqual(250);
  });

  it("never resolves after cancel", async () => {
    const t = fairTimeout(20);
    t.cancel();
    const outcome = await Promise.race([
      t.expired.then(() => "expired"),
      new Promise((resolve) => globalThis.setTimeout(() => resolve("quiet"), 80)),
    ]);
    expect(outcome).toBe("quiet");
  });
});
