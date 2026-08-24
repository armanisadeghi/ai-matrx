import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(__dirname, "AuthSessionWatcher.tsx"),
  "utf8",
);

describe("AuthSessionWatcher diagnostics", () => {
  it("keeps handled identity drift out of the system-error queue", () => {
    expect(source).toContain("IDENTITY DRIFT");
    expect(source).toContain("console.warn(");
    expect(source).not.toContain("console.error(");
  });
});
