import { runWithConcurrency } from "./run-with-concurrency";

describe("runWithConcurrency", () => {
  it("starts independent work concurrently without exceeding the limit", async () => {
    let active = 0;
    let peak = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const run = runWithConcurrency([1, 2, 3, 4, 5, 6], 3, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await gate;
      active -= 1;
    });

    await Promise.resolve();
    expect(active).toBe(3);
    release();
    const result = await run;

    expect(peak).toBe(3);
    expect(result).toMatchObject({ started: 6, succeeded: 6, failed: 0 });
  });

  it("isolates failures and can stop starting queued items", async () => {
    let keepStarting = true;
    const started: number[] = [];
    const result = await runWithConcurrency(
      [1, 2, 3, 4],
      2,
      async (item) => {
        started.push(item);
        if (item === 1) {
          await Promise.resolve();
          keepStarting = false;
          throw new Error("one failed");
        }
      },
      () => keepStarting,
    );

    expect(started).toEqual([1, 2]);
    expect(result.started).toBe(2);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failures[0]?.item).toBe(1);
  });
});
