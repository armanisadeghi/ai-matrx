import { findMissingSurfaceRows } from "./surface-row-guard";

describe("surface row guard", () => {
  it("names a mounted surface whose row is missing, once", async () => {
    const seen = new Set<string>();
    const exists = async (n: string) => n !== "matrx-user/ghost";
    expect(await findMissingSurfaceRows(["matrx-user/chat", "matrx-user/ghost"], exists, seen)).toEqual(["matrx-user/ghost"]);
    expect(await findMissingSurfaceRows(["matrx-user/ghost"], exists, seen)).toEqual([]);
  });
  it("passes when every row exists", async () => {
    expect(await findMissingSurfaceRows(["matrx-user/chat"], async () => true, new Set())).toEqual([]);
  });
});
