import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "ApprovalCard.tsx"), "utf8");

describe("ApprovalCard decision vocabulary", () => {
  it("uses the action copy promised by agent-writable surfaces", () => {
    expect(source).toContain("Apply");
    expect(source).toContain("Keep as is");
    expect(source).not.toMatch(/>\s*Approve\s*</);
    expect(source).not.toMatch(/>\s*Decline\s*</);
  });
});
