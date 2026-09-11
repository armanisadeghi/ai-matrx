import { readFileSync } from "node:fs";

const dashboardSource = readFileSync(
  "features/ai-models/components/ProviderSyncDashboard.tsx",
  "utf8",
);
const pageSource = readFileSync(
  "app/(admin)/administration/ai/ai-models/provider-sync/page.tsx",
  "utf8",
);

describe("Provider Sync loading lifecycle", () => {
  it("does not ask the parent to reload from the dashboard mount loader", () => {
    const loader = dashboardSource.slice(
      dashboardSource.indexOf("const loadSummaries = useCallback"),
      dashboardSource.indexOf("useEffect(() => {\n    loadSummaries();"),
    );

    expect(loader).not.toMatch(/(?:await|Promise\.resolve\()\s*onModelsChanged\?\.\(/);
    expect(loader).toContain("aiModelService.fetchProviderSyncCandidates()");
  });

  it("keeps the mounted dashboard in place during later parent refreshes", () => {
    expect(pageSource).toContain("const [loadedOnce, setLoadedOnce] = useState(false)");
    expect(pageSource).toContain("setLoadedOnce(true)");
    expect(pageSource).toContain("if (loading && !loadedOnce)");
  });
});
