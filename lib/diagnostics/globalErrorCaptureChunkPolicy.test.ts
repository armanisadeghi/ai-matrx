import fs from "node:fs";
import path from "node:path";

describe("global stale-chunk capture policy", () => {
  it("leaves chunk recovery local at every global capture seam", () => {
    const source = fs.readFileSync(path.join(__dirname, "globalErrorCapture.ts"), "utf8");
    expect(source.match(/isChunkLoadError\(/g)).toHaveLength(3);
    expect(source).toContain("if (isChunkLoadError(reason)) return;");
    expect(source).toContain("args.some((arg) => isChunkLoadError(arg))");
  });
});
