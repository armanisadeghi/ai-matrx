/**
 * VERIFIER-32 F2 + F5 (lane DRILL-USAGE-PAGE, 2026-09-30). RED on HEAD: the old hand-off carried only
 * the person of a person + provider or person + day trail and sent a 90-day window as "last 30 days";
 * the page printed codes and ids ("agent_service:5d0b07f8-…", "child_agent", "None" beside "unknown").
 */
import { spendHandoff, spendHref, spendLead } from "../UsageExplorer";
import { USAGE_WORDS, featureWords, plainWords } from "../usageWords";

jest.mock("@/components/official/drill-explorer/DrillExplorer", () => ({ DrillExplorer: () => null }));
jest.mock("../useUsageDrill", () => ({ USAGE_SOURCE: {}, usageNameResolvers: () => ({}), useUsageFreshness: () => ({}) }));
jest.mock("@/components/navigation/AppLink", () => ({ __esModule: true, default: () => null }));

const NOW = new Date("2026-09-30T06:00:00Z");
const P = "87a6e699-3622-4869-8843-d0867456c0dd";

describe("the Spend Explorer hand-off carries the whole drill", () => {
  it("person + provider: the person is carried and the provider it cannot narrow by is SAID", () => {
    const q = { by: ["model"], show: ["cost"], where: [{ dim: "person", value: P }, { dim: "provider", value: "anthropic" }], window: "30d" };
    expect(spendHandoff(q, NOW).params.get("f.user")).toBe(P);
    expect(spendLead(q)).toContain("cannot narrow by provider");
  });
  it("person + a day: the day rides as f.day and as its own one-day window", () => {
    const q = { by: ["model"], show: ["cost"], where: [{ dim: "person", value: P }, { dim: "at:day", value: "2026-09-28" }], window: "30d" };
    const p = spendHandoff(q, NOW).params;
    expect([p.get("f.user"), p.get("f.day"), p.get("win"), p.get("from"), p.get("to")]).toEqual([P, "2026-09-28", "custom", "2026-09-28", "2026-09-28"]);
  });
  it("a 90-day window stays 90 days (a custom window), never 'last 30 days'", () => {
    const p = spendHandoff({ by: ["provider"], show: ["cost"], where: [], window: "90d" }, NOW).params;
    expect(p.get("win")).toBe("custom");
    expect(p.get("from")).toBe("2026-07-02");
    expect(p.get("to")).toBe("2026-09-30");
  });
  it("its own presets map one for one", () => {
    expect(spendHref({ by: ["person"], show: ["cost"], where: [], window: "7d" })).toContain("win=last7d");
  });
  it("a year is cut to its 92 days and the cut is said", () => {
    const got = spendHandoff({ by: ["person"], show: ["cost"], where: [], window: "365d" }, NOW);
    expect(got.dropped.join(" ")).toContain("at most 92 days");
  });
});

describe("every code reads as words, never a key or an id", () => {
  const UUIDISH = /[0-9a-f]{8}-[0-9a-f]{4}/i;
  it("feature codes", () => {
    expect(featureWords("agent_service:5d0b07f8-54b5-499b-86a8-557c46ea8a59")).toBe("Agent service");
    expect(featureWords("mandate:seo.topic_assigner")).toBe("Mandate · Seo topic assigner");
    expect(featureWords("sch_run")).toBe("Sch run");
  });
  it("origin, source, app, trigger", () => {
    expect(USAGE_WORDS.origin!("child_agent")).toBe("Child agent");
    expect(USAGE_WORDS.origin!("client_auto")).toBe("Client auto");
    expect(USAGE_WORDS.source!("sch_run")).toBe("Scheduled run");
    expect(USAGE_WORDS.source!("internal_agent_run")).toBe("Agent started by another agent");
    expect(USAGE_WORDS.source!("pex_job")).toBe("Processing job");
    expect(USAGE_WORDS.app!("mcp-agent-service")).toBe("MCP agent service");
    expect(USAGE_WORDS.trigger!("automated")).toBe("Automated");
  });
  it("no provider and an unrecorded provider are two different plain sentences", () => {
    expect(USAGE_WORDS.provider!("")).toBe("No model (tools and services)");
    expect(USAGE_WORDS.provider!("unknown")).toBe("Provider not recorded");
    expect(USAGE_WORDS.model!("3f1c2a9e-1111-4222-8333-944455556666")).toBe("A model no longer in the catalog");
  });
  it("the humanizer never prints an id, whatever the code", () => {
    for (const code of ["agent_service:5d0b07f8-54b5-499b-86a8-557c46ea8a59", "cld_file", "runtime.work_item", "twilio:sms"]) {
      expect(plainWords(code)).not.toMatch(UUIDISH);
      expect(featureWords(code)).not.toMatch(UUIDISH);
    }
  });
});
