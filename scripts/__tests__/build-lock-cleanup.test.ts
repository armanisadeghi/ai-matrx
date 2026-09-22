import { onceAsync, withBuildLockCleanup } from "../lib/build-lock-cleanup";

describe("withBuildLockCleanup", () => {
  it("releases a first lock when acquiring a later lock throws", async () => {
    const acquired: string[] = [];
    const released: string[] = [];

    await expect(
      withBuildLockCleanup(
        async () => {
          acquired.push("custom");
          throw new Error("platform lock query failed");
        },
        async () => {
          released.push(...acquired);
        },
      ),
    ).rejects.toThrow("platform lock query failed");

    expect(released).toEqual(["custom"]);
  });
});

describe("onceAsync", () => {
  it("makes overlapping callers await one in-flight cleanup", async () => {
    let finishCleanup!: () => void;
    const cleanupCanFinish = new Promise<void>((resolve) => {
      finishCleanup = resolve;
    });
    let cleanupRuns = 0;
    const releaseOnce = onceAsync(async () => {
      cleanupRuns += 1;
      await cleanupCanFinish;
    });

    const normalFinally = releaseOnce();
    const signalHandler = releaseOnce();
    let signalFinished = false;
    void signalHandler.then(() => {
      signalFinished = true;
    });

    expect(signalHandler).toBe(normalFinally);
    expect(cleanupRuns).toBe(1);
    await Promise.resolve();
    expect(signalFinished).toBe(false);

    finishCleanup();
    await Promise.all([normalFinally, signalHandler]);
    expect(signalFinished).toBe(true);
    expect(cleanupRuns).toBe(1);
  });
});
