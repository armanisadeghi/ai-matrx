import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("reputation route identity", () => {
  it("uses the resolved brand UUID for data work, never the readable route key", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "features/marketing/components/reputation/ReputationWorkspace.tsx",
      ),
      "utf8",
    );

    expect(source).toContain("const { site, brandId } = useMarketingSite();");
    expect(source).not.toContain("useParams<");
    expect(source).not.toContain("params.brandId");
    expect(source).toContain("useReputationWorkspace(site.id, brandId)");
    expect(source).toContain("useUpdateReputationCase(site.id, brandId)");
  });
});
