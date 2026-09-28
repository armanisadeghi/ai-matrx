import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("MonitorSetupEditor input boundary", () => {
  it("uses the published Input rather than the host-only input module", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "features/marketing/monitor-setup/MonitorSetupEditor.tsx",
      ),
      "utf8",
    );

    expect(source).toContain('import { Input } from "@ai-matrx/design-system";');
    expect(source).not.toContain('from "@/components/ui/input"');
  });
});
