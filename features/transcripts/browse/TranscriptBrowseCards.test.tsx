import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(__dirname, "TranscriptBrowseCards.tsx"),
  "utf8",
);

describe("TranscriptBrowseCards responsive controls", () => {
  it("keeps the mobile title door and action trigger at least 44px tall", () => {
    expect(source).toContain("flex min-h-11 min-w-11 items-center");
    expect(source).toContain(
      "flex h-11 w-11 items-center justify-center rounded",
    );
  });
});
