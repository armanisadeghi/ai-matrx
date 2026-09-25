import { fillUrlPattern, mergePlaces, resolveDeclaredPlaces } from "../places";
import { keyInFeature, lanesFor, shortMandateName } from "../service";
import { featureIntelligenceHref } from "../hrefs";
import { effectiveRunOverride } from "../run-override";
import type { FeatureIntelligenceRow, ResolvedPlace } from "../types";

const place = (over: Partial<ResolvedPlace>): ResolvedPlace => ({
  id: "p",
  label: "P",
  trigger: "",
  href: null,
  urlPattern: null,
  mandateKeys: [],
  origin: "declared",
  ...over,
});

describe("feature intelligence — places", () => {
  it("fills a pattern only when every value is known", () => {
    expect(fillUrlPattern("/research/topics/[topicId]/tags", { topicId: "t1" })).toBe(
      "/research/topics/t1/tags",
    );
    expect(fillUrlPattern("/research/topics/[topicId]/tags/[tagId]", { topicId: "t1" })).toBeNull();
    expect(fillUrlPattern("/education/flashcards/new", {})).toBe("/education/flashcards/new");
    expect(fillUrlPattern(null, {})).toBeNull();
  });

  it("merges a registered screen into the declared place at the same route", () => {
    const merged = mergePlaces(
      [place({ id: "deck", urlPattern: "/x/[id]", mandateKeys: ["a.one"] })],
      [
        place({ id: "r1", urlPattern: "/x/[id]", mandateKeys: ["a.two"], origin: "registered" }),
        place({ id: "r2", urlPattern: "/y", mandateKeys: ["a.three"], origin: "registered" }),
      ],
    );
    expect(merged.map((entry) => entry.id)).toEqual(["deck", "r2"]);
    expect(merged[0].mandateKeys).toEqual(["a.one", "a.two"]);
  });

  it("declared research places link inside the topic", () => {
    const places = resolveDeclaredPlaces("research", { topicId: "abc" });
    expect(places.find((entry) => entry.id === "synthesis")?.href).toBe(
      "/research/topics/abc/synthesis",
    );
    expect(places.find((entry) => entry.id === "source")?.href).toBeNull();
  });
});

describe("feature intelligence — rows", () => {
  it("shows a topic pin to the resolved agent as recorded, not as a second active choice", () => {
    const row = { holderType: "agent", holderId: "agent-1" } as FeatureIntelligenceRow;
    const choice = { holderId: "agent-1", holderName: "Agent", manageHref: "/topics/1/agents", contextLabel: "This topic" };
    // Dormant today, but it takes over the moment the mandate choice changes —
    // so it must stay visible (Factory Playground's auto-tagger, 2026-09-25).
    expect(effectiveRunOverride(row, choice)).toEqual({ ...choice, matchesMandate: true });
    expect(effectiveRunOverride(row, undefined)).toBeNull();
    expect(effectiveRunOverride(row, { ...choice, holderId: "agent-2" })).toEqual({ ...choice, holderId: "agent-2" });
  });

  it("matches keys by first segment only", () => {
    expect(keyInFeature("flashcards.generate_cards", "flashcards")).toBe(true);
    expect(keyInFeature("education.study_pack_flashcards", "flashcards")).toBe(false);
  });

  it("drops a leading feature name from a label", () => {
    expect(shortMandateName("Flashcards — Generate Cards (topic)", "Flashcards")).toBe(
      "Generate Cards (topic)",
    );
    expect(shortMandateName("Research Report Generator", "Research")).toBe(
      "Research Report Generator",
    );
  });

  it("asks only the lanes the definitions live in", () => {
    const sys = "sys";
    expect(lanesFor([{ organization_id: sys, created_by: "x" }], sys, "me", "person")).toEqual([
      "system",
    ]);
    expect(lanesFor([{ organization_id: "o", created_by: "me" }], sys, "me", "person")).toEqual([
      "mine",
    ]);
    expect(
      lanesFor([{ organization_id: "o", created_by: "other" }], sys, "me", "person").sort(),
    ).toEqual(["orgs"]);
    expect(lanesFor([{ organization_id: "o", created_by: "me" }], sys, "me", "organization")).toEqual([
      "orgs",
    ]);
  });
});

describe("feature intelligence — hrefs", () => {
  it("research inside a topic stays in the topic", () => {
    expect(
      featureIntelligenceHref("research", {
        mandateKey: "research.report",
        context: { topicId: "t1" },
      }),
    ).toBe("/research/topics/t1/intelligence?mandate=research.report");
  });

  it("any other feature uses the generic route and carries its context", () => {
    expect(featureIntelligenceHref("flashcards", { context: { setId: "s1" } })).toBe(
      "/intelligence/flashcards?setId=s1",
    );
  });
});
