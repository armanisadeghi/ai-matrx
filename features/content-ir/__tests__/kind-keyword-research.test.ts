/**
 * keyword-research kinds — the STREAMING bridge contract.
 *
 * These kinds exist to kill the "raw JSON scrolls by, then everything
 * appears at once" failure on the keyword-research workbench (and any chat
 * surface emitting them). The load-bearing behavior pinned here:
 *
 *  1. MID-STREAM: a partially-fed ParseSession's envelope maps to partial
 *     serverData — buckets/cards that have parsed so far render immediately
 *     (isComplete=false), never undefined.
 *  2. COMPLETE: the full sample payloads map to complete serverData.
 *  3. Segmentation: a chunk buffer carrying several sequential
 *     classification batch payloads splits into one region per batch.
 */

import { ParseSession } from "../session/parse-session";
import type { KindSchema } from "../core/kind-schema.types";
import type { SchemaResolver } from "../core/kind-parser";
import {
  KEYWORD_RESEARCH_KIND_SCHEMAS,
  keywordClassificationServerDataFromEnvelope,
  keywordResearchServerDataFromEnvelope,
  splitKeywordClassificationSegments,
} from "../kinds/keyword-research";

const resolver: SchemaResolver = {
  get: (kind: string): KindSchema | undefined =>
    KEYWORD_RESEARCH_KIND_SCHEMAS.find((schema) => schema.kind === kind),
  request: () => {},
};

const RESEARCH_JSON = JSON.stringify({
  __kind: "keyword_relationship_research",
  primary_keyword: "prp injections",
  keyword_lists: [
    {
      __kind: "keyword_list",
      label: "Parent Keywords",
      keywords: ["regenerative medicine", "injectable treatments"],
    },
    {
      __kind: "keyword_list",
      label: "Natural LSIs",
      keywords: ["platelet rich plasma therapy", "prp therapy"],
    },
  ],
});

const CLASSIFICATION_JSON = JSON.stringify({
  __kind: "keyword_classification_batch_v1",
  classifier_version: "kwclass-v1",
  results: [
    {
      __kind: "keyword_classification_v1",
      keyword_id: "2a132ca0-60f4-4995-8def-20482e99d360",
      phrase: "aesthetic injectables",
      intent_class: "commercial_investigation",
      fulfillment_mode: "done_for_you",
      audience_type: "consumer",
      funnel_stage: "solution_aware",
      transaction_direction: "searcher_pays",
      local_intent: "implicit_local",
      urgency: "none",
      comparison_intent: "none",
      price_sensitivity: "none",
      query_form: "phrase",
      specificity: "head",
      brand_presence: "unbranded",
      compliance_framing: "none",
      overall_confidence: 88,
      per_fact_confidence: { intent_class: 85, funnel_stage: 85 },
      secondary_interpretation: { audience_type: "practitioner" },
      standards: [],
      error: null,
    },
    {
      __kind: "keyword_classification_v1",
      keyword_id: "6838d7ba-0fdb-49c2-9127-9b2dc3237788",
      phrase: "cortisone shot",
      intent_class: "informational",
      funnel_stage: "solution_aware",
      specificity: "head",
      overall_confidence: 92,
      standards: [],
      error: null,
    },
  ],
});

describe("keyword_relationship_research — streaming bridge", () => {
  it("MID-STREAM: partial feed yields partial lists, isComplete=false", () => {
    const session = new ParseSession({
      identity: "kw-partial",
      schemas: resolver,
    });
    // Cut inside the SECOND list, after the first list closed.
    const cut = RESEARCH_JSON.indexOf('"Natural LSIs"') + '"Natural LSIs"'.length;
    session.write(RESEARCH_JSON.slice(0, cut));

    const serverData = keywordResearchServerDataFromEnvelope(
      session.buildEnvelope(),
    );
    expect(serverData).toBeDefined();
    expect(serverData?.isComplete).toBe(false);
    expect(serverData?.primaryKeyword).toBe("prp injections");
    expect(serverData?.lists.length).toBeGreaterThanOrEqual(1);
    expect(serverData?.lists[0]).toMatchObject({
      label: "Parent Keywords",
      keywords: ["regenerative medicine", "injectable treatments"],
      complete: true,
    });
    session.dispose();
  });

  it("COMPLETE: full payload maps every bucket, isComplete=true", () => {
    const session = new ParseSession({
      identity: "kw-complete",
      schemas: resolver,
    });
    session.write(RESEARCH_JSON);
    session.end();

    const serverData = keywordResearchServerDataFromEnvelope(
      session.buildEnvelope(),
    );
    expect(serverData).toMatchObject({
      primaryKeyword: "prp injections",
      isComplete: true,
    });
    expect(serverData?.lists).toHaveLength(2);
    expect(serverData?.lists[1]).toMatchObject({
      label: "Natural LSIs",
      keywords: ["platelet rich plasma therapy", "prp therapy"],
      complete: true,
    });
    session.dispose();
  });
});

describe("keyword_classification_batch_v1 — streaming bridge", () => {
  it("MID-STREAM: the first closed result card renders while the batch streams", () => {
    const session = new ParseSession({
      identity: "kwc-partial",
      schemas: resolver,
    });
    // Cut just after the first result object closes (before the second opens).
    const cut = CLASSIFICATION_JSON.indexOf('{"__kind":"keyword_classification_v1","keyword_id":"6838d7ba');
    session.write(CLASSIFICATION_JSON.slice(0, cut));

    const serverData = keywordClassificationServerDataFromEnvelope(
      session.buildEnvelope(),
    );
    expect(serverData).toBeDefined();
    expect(serverData?.isComplete).toBe(false);
    expect(serverData?.results).toHaveLength(1);
    expect(serverData?.results[0]).toMatchObject({
      phrase: "aesthetic injectables",
      overallConfidence: 88,
      complete: true,
    });
    // "none" facts are dropped from chips; real facts survive.
    expect(serverData?.results[0].facts).toMatchObject({
      intent_class: "commercial_investigation",
      funnel_stage: "solution_aware",
      specificity: "head",
    });
    expect(serverData?.results[0].facts.urgency).toBeUndefined();
    expect(serverData?.results[0].secondaryInterpretation).toEqual({
      audience_type: "practitioner",
    });
    session.dispose();
  });

  it("COMPLETE: full batch maps all cards + classifier version", () => {
    const session = new ParseSession({
      identity: "kwc-complete",
      schemas: resolver,
    });
    session.write(CLASSIFICATION_JSON);
    session.end();

    const serverData = keywordClassificationServerDataFromEnvelope(
      session.buildEnvelope(),
    );
    expect(serverData).toMatchObject({
      classifierVersion: "kwclass-v1",
      isComplete: true,
    });
    expect(serverData?.results.map((card) => card.phrase)).toEqual([
      "aesthetic injectables",
      "cortisone shot",
    ]);
    session.dispose();
  });
});

describe("splitKeywordClassificationSegments", () => {
  it("splits sequential batch payloads into one region each", () => {
    const noisy = `\`\`\`json\n${CLASSIFICATION_JSON}\n\`\`\`\n\`\`\`json\n${CLASSIFICATION_JSON}`;
    const segments = splitKeywordClassificationSegments(noisy);
    expect(segments).toHaveLength(2);
    for (const segment of segments) {
      expect(segment.startsWith('{"__kind":"keyword_classification_batch_v1"')).toBe(
        true,
      );
    }
  });

  it("passes through a single un-split buffer and drops empty input", () => {
    expect(splitKeywordClassificationSegments("")).toEqual([]);
    expect(splitKeywordClassificationSegments("   ")).toEqual([]);
    expect(
      splitKeywordClassificationSegments(CLASSIFICATION_JSON),
    ).toHaveLength(1);
  });
});
