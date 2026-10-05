/**
 * The scraper service mounts every route under `/api`; the shared URL builder
 * (`buildMatrxRequestUrl`, @ai-matrx/agents/matrx) strips a leading `/api/`
 * because aidream's routes no longer live there. Together they sent every
 * scrape to `https://scraper…/scraper/quick-scrape` → 404 (found 2026-10-05
 * walking the Fact Check tab). The real builder is used here — no double.
 */
import { buildMatrxRequestUrl } from "@ai-matrx/agents/matrx";
import { serviceRequestBase } from "@/lib/api/service-routing";
import { scraperServiceEndpoint } from "@/features/scraper/hooks/useScraperApi";
import { ENDPOINTS } from "@/lib/api/endpoints";

const SCRAPER = "https://scraper.app.matrxserver.com";
const AIDREAM = "https://server.app.matrxserver.com";

describe("serviceRequestBase", () => {
  it("keeps the scraper's /api mount through the shared URL builder", () => {
    const url = buildMatrxRequestUrl(
      serviceRequestBase("scraper", SCRAPER),
      scraperServiceEndpoint(ENDPOINTS.scraper.quickScrape),
    );
    expect(url).toBe(`${SCRAPER}/api/scraper/quick-scrape`);
  });

  it("leaves services without a route prefix untouched", () => {
    expect(serviceRequestBase("aidream", AIDREAM)).toBe(AIDREAM);
    expect(
      buildMatrxRequestUrl(serviceRequestBase("aidream", AIDREAM), "/api/ai/agents/x"),
    ).toBe(`${AIDREAM}/ai/agents/x`);
  });

  it("passes an absent base through so the caller's 'not configured' error still fires", () => {
    expect(serviceRequestBase("scraper", undefined)).toBeUndefined();
  });
});
