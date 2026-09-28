/** Provision pass wave 4 — research call sites' facts by declared name. */
import { deepResearchOfferValues } from "../agents/deep-research-offer-values";
import { reportOutputOfferValues } from "../outputs/report-output-offer-values";

const topic = {
  name: "Commercial e-waste regulations in California",
  description: "What SB 20 and DTSC rules require of recyclers.",
  intent_brief: "Brief a recycling company's compliance lead.",
  intent_key: "compliance_brief",
  tone_profile: null,
};

describe("research.topic_deep_research", () => {
  it("sends aligned source lists and the count", () => {
    expect(
      deepResearchOfferValues(topic, [
        { url: "https://dtsc.ca.gov/ewaste", title: "DTSC e-waste", authority_tier: "high" },
        { url: "https://calrecycle.ca.gov/", title: null, authority_tier: null },
      ]),
    ).toEqual({
      topic_name: topic.name,
      topic_description: topic.description,
      intent_brief: topic.intent_brief,
      source_urls: ["https://dtsc.ca.gov/ewaste", "https://calrecycle.ca.gov/"],
      source_titles: ["DTSC e-waste", ""],
      source_authority_tiers: ["high", ""],
      source_count: 2,
    });
  });

  it("omits source facts when sources could not be read", () => {
    const out = deepResearchOfferValues(topic, null);
    expect(out).not.toHaveProperty("source_count");
    expect(out).not.toHaveProperty("source_urls");
  });
});

describe("research_client.report_output", () => {
  it("topic facts, titles and report source; never topic_id", () => {
    expect(
      reportOutputOfferValues(topic, "resource_bundle", ["Old post", " "]),
    ).toEqual({
      topic_name: topic.name,
      topic_description: topic.description,
      intent_brief: topic.intent_brief,
      intent_key: "compliance_brief",
      existing_output_titles: ["Old post"],
      report_source: "resource_bundle",
    });
    expect(reportOutputOfferValues(null, null, [])).toEqual({});
  });
});
