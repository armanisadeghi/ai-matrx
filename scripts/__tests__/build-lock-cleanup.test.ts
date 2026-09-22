import { withBuildLockCleanup } from "../lib/build-lock-cleanup";

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
