import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("dynamic React icon bundle contract", () => {
  it("never creates an async lucide-react namespace barrel", () => {
    for (const relativePath of [
      "features/dynamic-react/toolRendererScope.ts",
      "utils/icons/icon-mapper.tsx",
    ]) {
      const source = readFileSync(join(process.cwd(), relativePath), "utf8");
      expect(source).not.toMatch(/import\(["']lucide-react["']\)/);
    }
  });
});
