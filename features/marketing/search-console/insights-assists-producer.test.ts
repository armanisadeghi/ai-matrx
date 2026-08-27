import { settleGscAssistRead } from "@/features/marketing/search-console/insights-assists-producer";

describe("Search Console assist reads", () => {
  it("does not start the next analytics read until the prior read settles", async () => {
    const calls: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const run = async () => {
      const firstResult = await settleGscAssistRead(async () => {
        calls.push("first:start");
        await first;
        calls.push("first:end");
        return "first";
      });
      const secondResult = await settleGscAssistRead(async () => {
        calls.push("second:start");
        return "second";
      });
      return [firstResult, secondResult];
    };

    const pending = run();
    await Promise.resolve();
    expect(calls).toEqual(["first:start"]);

    releaseFirst?.();
    await expect(pending).resolves.toEqual([
      { status: "fulfilled", value: "first" },
      { status: "fulfilled", value: "second" },
    ]);
    expect(calls).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("contains a failed read so the following read still runs", async () => {
    const failure = new Error("timed out");
    const first = await settleGscAssistRead(async () => {
      throw failure;
    });
    const second = await settleGscAssistRead(async () => "healthy");

    expect(first).toEqual({ status: "rejected", reason: failure });
    expect(second).toEqual({ status: "fulfilled", value: "healthy" });
  });
});
