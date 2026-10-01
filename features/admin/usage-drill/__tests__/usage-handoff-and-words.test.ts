/**
 * VERIFIER-32 F2 + F5 (lane DRILL-USAGE-PAGE, 2026-09-30). RED on HEAD: the old hand-off carried only
 * the person of a person + provider or person + day trail and sent a 90-day window as "last 30 days";
 * the page printed codes and ids ("agent_service:5d0b07f8-…", "child_agent", "None" beside "unknown").
 */
import { spendHandoff, spendHref, spendLead } from "../UsageExplorer";
import { drillDimensionLabelFor, plainWords } from "@/components/official/drill-explorer/dimensionWords";
import { spendAddressToUsage, usageDefinitionOf, usagePersonHref, usageSiblings } from "../usageLinks";

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

// Since lane DRILL-PRESETS-RETIRE the words come from the definition (describe carries `choices` and
// `empty_label`), read by the one explorer; these dimensions are ai_usage's as declared.
const dim = (d: Record<string, unknown>) => drillDimensionLabelFor(d as never, { names: undefined })!;
const feature = dim({ key: "feature", label: "Feature", from: "feature", kind: "choice", empty_label: "No feature recorded" });
const model = dim({ key: "model", label: "Model", from: "model", kind: "text", choices: [{ value: "unknown", label: "Model not recorded" }], empty_label: "No model (tools and services)" });
const provider = dim({ key: "provider", label: "Provider", from: "provider", kind: "choice", choices: [{ value: "unknown", label: "Provider not recorded" }], empty_label: "No model (tools and services)" });

describe("every code reads as words, never a key or an id", () => {
  const UUIDISH = /[0-9a-f]{8}-[0-9a-f]{4}/i;
  it("feature codes: separators become words, an id inside a code drops out", () => {
    expect(feature("agent_service:5d0b07f8-54b5-499b-86a8-557c46ea8a59")).toBe("Agent service");
    expect(feature("mandate:seo.topic_assigner")).toBe("Mandate · seo topic assigner");
    expect(feature("sch_run")).toBe("Sch run");
    expect(feature("")).toBe("No feature recorded");
  });
  it("a model reads as its own name; its empty and unknown values are sentences", () => {
    expect(model("claude-sonnet-4-5")).toBe("claude-sonnet-4-5");
    expect(model("unknown")).toBe("Model not recorded");
    expect(model("")).toBe("No model (tools and services)");
    expect(model("3f1c2a9e-1111-4222-8333-944455556666")).not.toMatch(UUIDISH);
  });
  it("no provider and an unrecorded provider are two different plain sentences", () => {
    expect(provider("")).toBe("No model (tools and services)");
    expect(provider("unknown")).toBe("Provider not recorded");
  });
  it("the humanizer never prints an id, whatever the code", () => {
    for (const code of ["agent_service:5d0b07f8-54b5-499b-86a8-557c46ea8a59", "cld_file", "runtime.work_item", "twilio:sms", "5d0b07f8-54b5-499b-86a8-557c46ea8a59"]) {
      expect(plainWords(code)).not.toMatch(UUIDISH);
    }
  });
});

describe("links into AI usage", () => {
  it("a person's usage is the Usage by person view on that person", () => {
    expect(usagePersonHref(P)).toBe(`/administration/usage?view=builtin%3Ausage_by_person&f.person=${P}`);
  });
  it("the Spend Explorer's address maps: user is person, the first filter picks the cut, custom days are inclusive", () => {
    const { href, dropped } = spendAddressToUsage(new URLSearchParams(`win=custom&from=2026-09-01&to=2026-09-10&f.agent=A1&f.user=${P}`));
    const u = new URL(href, "http://x");
    expect(u.pathname).toBe("/administration/usage");
    expect(u.searchParams.get("view")).toBe("builtin:spend_by_agent");
    expect(u.searchParams.get("f.person")).toBe(P);
    expect(u.searchParams.get("f.agent")).toBe("A1");
    expect(u.searchParams.get("w")).toBe("2026-09-01..2026-09-11");
    expect(dropped).toEqual([]);
  });
  it("presets and a day map one for one; the empty group stays the empty group", () => {
    const a = new URL(spendAddressToUsage(new URLSearchParams("win=last7d&f.model=(none)")).href, "http://x");
    expect(a.searchParams.get("w")).toBe("7d");
    expect(a.searchParams.get("f.model")).toBe("(none)");
    const b = new URL(spendAddressToUsage(new URLSearchParams("win=last30d&f.day=2026-09-12")).href, "http://x");
    // a Spend day is the viewer's local day: in UTC (the default) it is the UTC day, as moments
    expect(b.searchParams.get("w")).toBe("2026-09-12T00:00Z..2026-09-13T00:00Z");
    expect(b.searchParams.get("view")).toBe("builtin:spend_by_person");
  });
});

describe("names and numbers keep their shape", () => {
  it("a dot inside a number stays; a dot between words splits them", () => {
    expect(plainWords("Gemini 2.5 Pro TTS")).toBe("Gemini 2.5 Pro TTS");
    expect(plainWords("runtime.work_item")).toBe("Runtime work item");
  });
  it("an id a resolver names reads 'Reading the name…' until the name arrives, never 'Unnamed'", () => {
    const session = drillDimensionLabelFor(
      { key: "session", label: "Sign-in session", from: "session_id", kind: "choice" } as never,
      { names: undefined, resolver: { emptyLabel: "No session", missingLabel: "Reading the name…", resolve: async () => ({ ok: true, names: {} }) } as never },
    )!;
    expect(session("5d0b07f8-54b5-499b-86a8-557c46ea8a59")).toBe("Reading the name…");
    expect(session("")).toBe("No session");
  });
});

describe("one screen, three grains", () => {
  it("the address picks the definition; absent or unknown is ai_usage", () => {
    expect(usageDefinitionOf(new URLSearchParams("def=ai_calls"))).toBe("ai_calls");
    expect(usageDefinitionOf(new URLSearchParams("def=nope"))).toBe("ai_usage");
    expect(usageDefinitionOf(new URLSearchParams(""))).toBe("ai_usage");
  });
  it("a sibling's view and a sibling's drilled question land at that definition's address", () => {
    const went: string[] = [];
    const [executions, calls] = usageSiblings("ai_usage", (h) => went.push(h));
    expect([executions!.group, calls!.group]).toEqual(["Per execution", "Model calls"]);
    calls!.go({ view: "cx_by_model" });
    executions!.go({ params: new URLSearchParams("by=request&f.conversation=C1") });
    expect(went).toEqual([
      "/administration/usage?def=ai_calls&view=builtin%3Acx_by_model",
      "/administration/usage?by=request&f.conversation=C1&def=ai_usage_executions",
    ]);
  });
});
