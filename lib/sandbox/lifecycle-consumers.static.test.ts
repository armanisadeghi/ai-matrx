import fs from "node:fs";
import path from "node:path";

const consumers = [
  "hooks/sandbox/use-sandbox.ts",
  "app/(core)/sandbox/page.tsx",
  "app/(core)/sandbox/[id]/page.tsx",
  "features/code/views/sandboxes/SandboxesPanel.tsx",
  "app/(admin)/administration/compute/sandbox/page.tsx",
];

test("owned stop/delete consumers have no legacy synchronous lifecycle calls", () => {
  for (const file of consumers) {
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    expect(source).not.toMatch(/method:\s*"(?:PUT|DELETE)"/);
    expect(source).not.toMatch(/action:\s*"stop"/);
  }
});
