import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("site media route identity", () => {
  it("queries brand media with the resolved UUID, never the readable route key", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "features/marketing/components/media/SiteMediaWorkspace.tsx",
      ),
      "utf8",
    );

    expect(source).toContain(
      "const { site, crawlActivity, brandId } = useMarketingSite();",
    );
    expect(source).not.toContain("useParams<");
    expect(source).not.toContain("const brandId = params.brandId");
    expect(source).toContain("<SiteVideosView brandId={brandId}");
  });
});
